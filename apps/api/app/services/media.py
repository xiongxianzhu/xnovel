"""头像与 Web 全局 Logo 的安全文件存储。"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.core.security import AuthContext
from app.models.site import AdminAuditEvent, SiteSetting

MAX_AVATAR_FILE_BYTES = 10 * 1024 * 1024
MAX_COVER_FILE_BYTES = 10 * 1024 * 1024
MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024
_FORMAT_INFO = {
    "PNG": ("image/png", "png"),
    "JPEG": ("image/jpeg", "jpg"),
    "WEBP": ("image/webp", "webp"),
}
_STORAGE_KEY = re.compile(r"^(avatars|covers|logos)/[0-9a-f]{32}\.(png|jpg|webp)$")


@dataclass(frozen=True)
class ValidatedImage:
    content: bytes
    mime_type: str
    extension: str


async def read_validated_image(
    upload: UploadFile,
    *,
    max_file_bytes: int,
    max_width: int,
    max_height: int,
    max_pixels: int,
) -> ValidatedImage:
    content = await upload.read(max_file_bytes + 1)
    if len(content) > max_file_bytes:
        raise APIException(status_code=413, code=ErrorCode.MEDIA_TOO_LARGE, msg=ErrorMessage.MEDIA_TOO_LARGE)
    if not content:
        raise _invalid_media()
    try:
        image_format, width, height = await run_in_threadpool(_inspect_image, content)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise _invalid_media() from exc
    if width > max_width or height > max_height or width * height > max_pixels:
        raise _invalid_media()
    info = _FORMAT_INFO.get(image_format)
    if info is None:
        raise _invalid_media()
    mime_type, extension = info
    if upload.content_type not in {None, "", mime_type}:
        raise _invalid_media()
    return ValidatedImage(content=content, mime_type=mime_type, extension=extension)


def validate_external_avatar_url(value: str) -> str:
    if len(value) > 2048:
        raise _invalid_media()
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise _invalid_media()
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost":
        raise _invalid_media()
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return value
    if not address.is_global:
        raise _invalid_media()
    return value


async def store_image(media_root: Path, prefix: str, image: ValidatedImage) -> str:
    key = f"{prefix}/{uuid4().hex}.{image.extension}"
    path = resolve_storage_path(media_root, key)
    await run_in_threadpool(_write_file, path, image.content)
    return key


async def delete_stored_image(media_root: Path, key: str | None) -> None:
    if key is None:
        return
    path = resolve_storage_path(media_root, key)
    await run_in_threadpool(path.unlink, True)


def resolve_storage_path(media_root: Path, key: str) -> Path:
    if _STORAGE_KEY.fullmatch(key) is None:
        raise _invalid_media()
    root = media_root.resolve()
    path = (root / key).resolve()
    if root not in path.parents:
        raise _invalid_media()
    return path


async def set_uploaded_avatar(
    session: AsyncSession,
    *,
    context: AuthContext,
    media_root: Path,
    image: ValidatedImage,
) -> str:
    new_key = await store_image(media_root, "avatars", image)
    old_key = context.user.avatar_storage_key
    context.user.avatar_source = "upload"
    context.user.avatar_storage_key = new_key
    context.user.avatar_mime_type = image.mime_type
    context.user.avatar_size_bytes = len(image.content)
    context.user.avatar_url = None
    from datetime import UTC, datetime

    context.user.avatar_updated_at = datetime.now(UTC)
    try:
        session.add(context.user)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        await delete_stored_image(media_root, new_key)
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    await delete_stored_image(media_root, old_key)
    return f"/api/v1/media/{new_key}"


async def set_external_avatar(session: AsyncSession, *, context: AuthContext, media_root: Path, url: str) -> str:
    validated_url = validate_external_avatar_url(url)
    old_key = context.user.avatar_storage_key
    context.user.avatar_source = "url"
    context.user.avatar_storage_key = None
    context.user.avatar_mime_type = None
    context.user.avatar_size_bytes = None
    context.user.avatar_url = validated_url
    from datetime import UTC, datetime

    context.user.avatar_updated_at = datetime.now(UTC)
    try:
        session.add(context.user)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    await delete_stored_image(media_root, old_key)
    return validated_url


async def clear_avatar(session: AsyncSession, *, context: AuthContext, media_root: Path) -> None:
    old_key = context.user.avatar_storage_key
    context.user.avatar_source = "none"
    context.user.avatar_storage_key = None
    context.user.avatar_mime_type = None
    context.user.avatar_size_bytes = None
    context.user.avatar_url = None
    context.user.avatar_updated_at = None
    try:
        session.add(context.user)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    await delete_stored_image(media_root, old_key)


async def set_site_logo(
    session: AsyncSession,
    *,
    context: AuthContext,
    media_root: Path,
    image: ValidatedImage,
    original_name: str,
) -> str:
    new_key = await store_image(media_root, "logos", image)
    try:
        setting = await session.get(SiteSetting, 1)
    except SQLAlchemyError as exc:
        await delete_stored_image(media_root, new_key)
        raise _service_unavailable() from exc
    if setting is None:
        await delete_stored_image(media_root, new_key)
        raise APIException(status_code=503, code=ErrorCode.SERVICE_UNAVAILABLE, msg=ErrorMessage.SERVICE_UNAVAILABLE)
    old_key = setting.logo_storage_key
    setting.logo_storage_key = new_key
    setting.logo_original_name = Path(original_name).name[:255] or f"logo.{image.extension}"
    setting.logo_mime_type = image.mime_type
    setting.logo_size_bytes = len(image.content)
    setting.updated_by = context.user.id
    session.add(setting)
    session.add(
        AdminAuditEvent(
            actor_type="admin",
            admin_id=context.user.id,
            action="site.logo_changed",
            target_type="site_settings",
            target_id="1",
            change_summary={"old_configured": old_key is not None, "new_configured": True},
        )
    )
    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        await delete_stored_image(media_root, new_key)
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    await delete_stored_image(media_root, old_key)
    return f"/api/v1/media/{new_key}"


async def clear_site_logo(session: AsyncSession, *, context: AuthContext, media_root: Path) -> None:
    try:
        setting = await session.get(SiteSetting, 1)
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    if setting is None:
        raise APIException(status_code=503, code=ErrorCode.SERVICE_UNAVAILABLE, msg=ErrorMessage.SERVICE_UNAVAILABLE)
    old_key = setting.logo_storage_key
    setting.logo_storage_key = None
    setting.logo_original_name = None
    setting.logo_mime_type = None
    setting.logo_size_bytes = None
    setting.updated_by = context.user.id
    session.add(setting)
    session.add(
        AdminAuditEvent(
            actor_type="admin",
            admin_id=context.user.id,
            action="site.logo_changed",
            target_type="site_settings",
            target_id="1",
            change_summary={"old_configured": old_key is not None, "new_configured": False},
        )
    )
    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    await delete_stored_image(media_root, old_key)


def _inspect_image(content: bytes) -> tuple[str, int, int]:
    with Image.open(BytesIO(content)) as image:
        image.verify()
    with Image.open(BytesIO(content)) as image:
        image.load()
        if image.format is None:
            raise ValueError
        return image.format, image.width, image.height


def _write_file(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def _invalid_media() -> APIException:
    return APIException(status_code=422, code=ErrorCode.MEDIA_INVALID, msg=ErrorMessage.MEDIA_INVALID)


def _service_unavailable() -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
    )
