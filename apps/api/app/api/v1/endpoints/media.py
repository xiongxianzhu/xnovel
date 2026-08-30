"""头像、公开站点设置与媒体读取端点。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.core.security import PasswordChangeCompletedContextDep
from app.models.site import SiteSetting
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    MediaTooLargeErrorResponse,
    MediaValidationErrorResponse,
    NotFoundErrorResponse,
    ServiceUnavailableErrorResponse,
)
from app.schemas.media import (
    AvatarData,
    AvatarResponse,
    AvatarUrlRequest,
    PublicSiteSettingsData,
    PublicSiteSettingsResponse,
)
from app.services.media import (
    MAX_AVATAR_FILE_BYTES,
    clear_avatar,
    read_validated_image,
    resolve_storage_path,
    set_external_avatar,
    set_uploaded_avatar,
)

router = APIRouter()


@router.get(
    "/site-settings/public",
    operation_id="getPublicSiteSettings",
    responses={503: {"model": ServiceUnavailableErrorResponse}},
)
async def public_site_settings(session: SessionDep) -> PublicSiteSettingsResponse:
    try:
        setting = await session.get(SiteSetting, 1)
    except SQLAlchemyError as exc:
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    return PublicSiteSettingsResponse(
        code=0,
        msg="SUCCESS",
        data=PublicSiteSettingsData(
            registration_enabled=setting.registration_enabled if setting else False,
            logo_url=f"/api/v1/media/{setting.logo_storage_key}" if setting and setting.logo_storage_key else None,
        ),
    )


@router.post(
    "/users/me/avatar",
    operation_id="uploadCurrentUserAvatar",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        413: {"model": MediaTooLargeErrorResponse},
        422: {"model": MediaValidationErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def upload_avatar(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    file: Annotated[UploadFile, File()],
) -> AvatarResponse:
    image = await read_validated_image(
        file,
        max_file_bytes=MAX_AVATAR_FILE_BYTES,
        max_width=2048,
        max_height=2048,
        max_pixels=4_194_304,
    )
    url = await set_uploaded_avatar(
        session,
        context=context,
        media_root=get_settings().media_root,
        image=image,
    )
    return AvatarResponse(code=0, msg="SUCCESS", data=AvatarData(source="upload", url=url))


@router.put(
    "/users/me/avatar-url",
    operation_id="setCurrentUserAvatarUrl",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        422: {"model": MediaValidationErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def put_avatar_url(
    payload: AvatarUrlRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> AvatarResponse:
    url = await set_external_avatar(
        session,
        context=context,
        media_root=get_settings().media_root,
        url=payload.url,
    )
    return AvatarResponse(code=0, msg="SUCCESS", data=AvatarData(source="url", url=url))


@router.delete(
    "/users/me/avatar",
    operation_id="deleteCurrentUserAvatar",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def delete_avatar(context: PasswordChangeCompletedContextDep, session: SessionDep) -> AvatarResponse:
    await clear_avatar(session, context=context, media_root=get_settings().media_root)
    return AvatarResponse(code=0, msg="SUCCESS", data=AvatarData(source="none", url=None))


@router.get(
    "/media/{storage_key:path}",
    operation_id="getMedia",
    response_class=FileResponse,
    responses={
        200: {
            "description": "图片二进制内容",
            "content": {
                "image/png": {"schema": {"type": "string", "format": "binary"}},
                "image/jpeg": {"schema": {"type": "string", "format": "binary"}},
                "image/webp": {"schema": {"type": "string", "format": "binary"}},
            },
        },
        404: {"model": NotFoundErrorResponse},
        422: {"model": MediaValidationErrorResponse},
    },
)
async def get_media(storage_key: str) -> FileResponse:
    path = resolve_storage_path(get_settings().media_root, storage_key)
    if not path.is_file():
        raise APIException(status_code=404, code=ErrorCode.NOT_FOUND, msg=ErrorMessage.NOT_FOUND)
    return FileResponse(
        path,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000"},
    )
