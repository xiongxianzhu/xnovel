"""Web 私有 Skill 不可变版本与管理员隔离服务。"""

from __future__ import annotations

import shutil
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import Settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.models.ai import Skill, SkillVersion
from app.models.site import AdminAuditEvent
from app.schemas.ai import (
    AdminSkillData,
    AdminSkillListData,
    SkillData,
    SkillListData,
    SkillResourceData,
    SkillVersionData,
)
from app.services.skill_packages import (
    TEXT_EXTENSIONS,
    PreparedSkillPackage,
    full_case_fold_17,
    normalize_skill_path,
    prepare_skill_archive,
    prepare_skill_editor_version,
)


def normalize_skill_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value.strip())
    return unicodedata.normalize("NFC", full_case_fold_17(normalized))


def _root(settings: Settings) -> Path:
    return settings.skill_storage_root.resolve()


def _relative(owner_id: UUID, skill_id: UUID, version_number: int, name: str) -> str:
    return f"{owner_id.hex}/{skill_id.hex}/v{version_number}/{name}"


def _write_package(
    settings: Settings,
    owner_id: UUID,
    skill_id: UUID,
    version_number: int,
    prepared: PreparedSkillPackage,
    source: bytes | None,
) -> tuple[str | None, str, str]:
    root = _root(settings)
    version_root = root / owner_id.hex / skill_id.hex / f"v{version_number}"
    if version_root.exists():
        raise _unavailable("skill_storage_collision")
    content_root = version_root / "content"
    content_root.mkdir(parents=True)
    try:
        for path, content in prepared.files.items():
            target = content_root.joinpath(*path.split("/"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        normalized_path = version_root / "normalized.skill"
        normalized_path.write_bytes(prepared.normalized_package)
        source_key: str | None = None
        if source is not None:
            source_path = version_root / "source.skill"
            source_path.write_bytes(source)
            source_key = _relative(owner_id, skill_id, version_number, "source.skill")
        return (
            source_key,
            _relative(owner_id, skill_id, version_number, "normalized.skill"),
            _relative(owner_id, skill_id, version_number, "content"),
        )
    except OSError as exc:
        shutil.rmtree(version_root, ignore_errors=True)
        raise _unavailable("skill_storage_unavailable") from exc


def _version_data(version: SkillVersion) -> SkillVersionData:
    if version.created_at is None:
        raise _unavailable("skill_version_invalid")
    return SkillVersionData(
        id=version.id,
        version_number=version.version_number,
        source_kind=version.source_kind,  # type: ignore[arg-type]
        content_sha256=version.content_sha256,
        normalized_package_size=version.normalized_package_size,
        uncompressed_size=version.uncompressed_size,
        file_count=version.file_count,
        validation_summary=dict(version.validation_summary),
        created_at=version.created_at,
    )


async def _current_version(session: AsyncSession, skill: Skill) -> SkillVersion:
    if skill.current_version_id is None:
        raise _unavailable("skill_version_invalid")
    version = (
        await session.exec(
            select(SkillVersion).where(
                col(SkillVersion.id) == skill.current_version_id,
                col(SkillVersion.skill_id) == skill.id,
            )
        )
    ).one_or_none()
    if version is None:
        raise _unavailable("skill_version_invalid")
    return version


async def _skill_data(session: AsyncSession, skill: Skill) -> SkillData:
    if skill.created_at is None or skill.updated_at is None:
        raise _unavailable("skill_invalid")
    return SkillData(
        id=skill.id,
        name=skill.name,
        description=skill.description,
        enabled=skill.enabled,
        status=skill.status,  # type: ignore[arg-type]
        current_version=_version_data(await _current_version(session, skill)),
        created_at=skill.created_at,
        updated_at=skill.updated_at,
    )


async def _owned_skill(
    session: AsyncSession,
    owner_id: UUID,
    skill_id: UUID,
    *,
    lock: bool = False,
) -> Skill:
    statement = select(Skill).where(
        col(Skill.id) == skill_id,
        col(Skill.owner_id) == owner_id,
        col(Skill.deleted_at).is_(None),
    )
    if lock:
        statement = statement.with_for_update()
    skill = (await session.exec(statement)).one_or_none()
    if skill is None:
        raise _not_found()
    return skill


async def list_skills(session: AsyncSession, *, owner_id: UUID) -> SkillListData:
    try:
        skills = list(
            (
                await session.exec(
                    select(Skill)
                    .where(col(Skill.owner_id) == owner_id, col(Skill.deleted_at).is_(None))
                    .order_by(col(Skill.updated_at).desc(), col(Skill.id).desc())
                )
            ).all()
        )
        items = [await _skill_data(session, item) for item in skills]
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _unavailable("skill_database_unavailable") from exc
    return SkillListData(items=items)


async def get_skill(session: AsyncSession, *, owner_id: UUID, skill_id: UUID) -> SkillData:
    try:
        return await _skill_data(session, await _owned_skill(session, owner_id, skill_id))
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _unavailable("skill_database_unavailable") from exc


async def create_skill_from_archive(
    session: AsyncSession,
    *,
    owner_id: UUID,
    filename: str,
    source: bytes,
    settings: Settings,
) -> SkillData:
    prepared = prepare_skill_archive(filename, source)
    skill = Skill(
        id=uuid7(),
        owner_id=owner_id,
        name=prepared.name,
        name_normalized=normalize_skill_name(prepared.name),
        description=prepared.description,
    )
    version = SkillVersion(
        id=uuid7(),
        skill_id=skill.id,
        version_number=1,
        skill_md_text=prepared.skill_md_text,
        source_kind="upload",
        normalized_package_storage_key="pending",
        content_storage_key="pending",
        content_sha256=prepared.content_sha256,
        source_compressed_size=prepared.source_compressed_size,
        normalized_package_size=len(prepared.normalized_package),
        uncompressed_size=prepared.uncompressed_size,
        file_count=len(prepared.files),
        validation_summary=prepared.validation_summary,
    )
    source_key, normalized_key, content_key = _write_package(
        settings,
        owner_id,
        skill.id,
        1,
        prepared,
        source,
    )
    version.source_archive_storage_key = source_key
    version.normalized_package_storage_key = normalized_key
    version.content_storage_key = content_key
    skill.current_version_id = version.id
    try:
        session.add(skill)
        session.add(version)
        await session.commit()
        await session.refresh(skill)
    except IntegrityError as exc:
        await session.rollback()
        shutil.rmtree(_root(settings) / owner_id.hex / skill.id.hex, ignore_errors=True)
        raise _conflict("skill_name_unavailable") from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        shutil.rmtree(_root(settings) / owner_id.hex / skill.id.hex, ignore_errors=True)
        raise _unavailable("skill_database_unavailable") from exc
    return await _skill_data(session, skill)


def _read_version_files(settings: Settings, version: SkillVersion) -> dict[str, bytes]:
    root = _root(settings)
    content_root = root.joinpath(*version.content_storage_key.split("/")).resolve()
    if not content_root.is_relative_to(root):
        raise _unavailable("skill_storage_invalid")
    paths = version.validation_summary.get("file_paths")
    if not isinstance(paths, list) or not all(isinstance(item, str) for item in paths):
        raise _unavailable("skill_manifest_invalid")
    try:
        return {path: content_root.joinpath(*path.split("/")).read_bytes() for path in paths}
    except OSError as exc:
        raise _unavailable("skill_storage_unavailable") from exc


async def update_skill_md(
    session: AsyncSession,
    *,
    owner_id: UUID,
    skill_id: UUID,
    current_version_id: UUID,
    skill_md_text: str,
    settings: Settings,
) -> SkillData:
    written_version_root: Path | None = None
    try:
        skill = await _owned_skill(session, owner_id, skill_id, lock=True)
        if skill.current_version_id != current_version_id:
            raise _conflict("skill_version_conflict")
        current = await _current_version(session, skill)
        prepared = prepare_skill_editor_version(_read_version_files(settings, current), skill_md_text)
        version_number = current.version_number + 1
        version = SkillVersion(
            id=uuid7(),
            skill_id=skill.id,
            version_number=version_number,
            skill_md_text=prepared.skill_md_text,
            source_kind="editor",
            normalized_package_storage_key="pending",
            content_storage_key="pending",
            content_sha256=prepared.content_sha256,
            normalized_package_size=len(prepared.normalized_package),
            uncompressed_size=prepared.uncompressed_size,
            file_count=len(prepared.files),
            validation_summary=prepared.validation_summary,
        )
        _, normalized_key, content_key = _write_package(
            settings,
            owner_id,
            skill.id,
            version_number,
            prepared,
            None,
        )
        written_version_root = _root(settings) / owner_id.hex / skill.id.hex / f"v{version_number}"
        version.normalized_package_storage_key = normalized_key
        version.content_storage_key = content_key
        skill.name = prepared.name
        skill.name_normalized = normalize_skill_name(prepared.name)
        skill.description = prepared.description
        skill.current_version_id = version.id
        skill.enabled = False
        skill.updated_at = datetime.now(UTC)
        session.add(version)
        session.add(skill)
        await session.commit()
        await session.refresh(skill)
    except IntegrityError as exc:
        await session.rollback()
        if written_version_root:
            shutil.rmtree(written_version_root, ignore_errors=True)
        raise _conflict("skill_name_unavailable") from exc
    except APIException:
        await session.rollback()
        if written_version_root:
            shutil.rmtree(written_version_root, ignore_errors=True)
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        if written_version_root:
            shutil.rmtree(written_version_root, ignore_errors=True)
        raise _unavailable("skill_database_unavailable") from exc
    return await _skill_data(session, skill)


async def set_skill_enabled(
    session: AsyncSession,
    *,
    owner_id: UUID,
    skill_id: UUID,
    enabled: bool,
) -> SkillData:
    try:
        skill = await _owned_skill(session, owner_id, skill_id, lock=True)
        if enabled and skill.status != "ready":
            raise _conflict("skill_not_ready")
        skill.enabled = enabled
        skill.updated_at = datetime.now(UTC)
        session.add(skill)
        await session.commit()
        await session.refresh(skill)
        return await _skill_data(session, skill)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable("skill_database_unavailable") from exc


async def read_skill_resource(
    session: AsyncSession,
    *,
    owner_id: UUID,
    skill_id: UUID,
    path: str,
    settings: Settings,
) -> SkillResourceData:
    skill = await _owned_skill(session, owner_id, skill_id)
    version = await _current_version(session, skill)
    normalized = normalize_skill_path(path)
    if Path(normalized).suffix.lower() not in TEXT_EXTENSIONS:
        raise _not_found()
    files = _read_version_files(settings, version)
    content = files.get(normalized)
    if content is None or len(content) > 1024 * 1024:
        raise _not_found()
    try:
        return SkillResourceData(path=normalized, content=content.decode())
    except UnicodeDecodeError as exc:
        raise _not_found() from exc


async def delete_skill(
    session: AsyncSession,
    *,
    owner_id: UUID,
    skill_id: UUID,
    settings: Settings,
) -> None:
    try:
        skill = await _owned_skill(session, owner_id, skill_id, lock=True)
        skill.enabled = False
        skill.status = "deleting"
        skill.deleted_at = datetime.now(UTC)
        session.add(skill)
        await session.commit()
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable("skill_database_unavailable") from exc
    try:
        shutil.rmtree(_root(settings) / owner_id.hex / skill.id.hex)
    except OSError as exc:
        raise _unavailable("skill_cleanup_failed") from exc
    try:
        await session.delete(skill)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable("skill_database_unavailable") from exc


async def list_admin_skills(session: AsyncSession) -> AdminSkillListData:
    try:
        skills = list((await session.exec(select(Skill).order_by(col(Skill.updated_at).desc()))).all())
        items = [await _admin_data(session, item) for item in skills if item.deleted_at is None]
    except SQLAlchemyError as exc:
        raise _unavailable("skill_database_unavailable") from exc
    return AdminSkillListData(items=items)


async def _admin_data(session: AsyncSession, skill: Skill) -> AdminSkillData:
    version = await _current_version(session, skill)
    if skill.updated_at is None:
        raise _unavailable("skill_invalid")
    return AdminSkillData(
        id=skill.id,
        owner_id=skill.owner_id,
        name=skill.name,
        status=skill.status,  # type: ignore[arg-type]
        enabled=skill.enabled,
        content_sha256=version.content_sha256,
        file_count=version.file_count,
        uncompressed_size=version.uncompressed_size,
        validation_summary=dict(version.validation_summary),
        updated_at=skill.updated_at,
    )


async def set_skill_quarantine(
    session: AsyncSession,
    *,
    admin_id: UUID,
    skill_id: UUID,
    quarantined: bool,
    reason_code: str,
    note: str | None,
) -> AdminSkillData:
    try:
        skill = (await session.exec(select(Skill).where(col(Skill.id) == skill_id).with_for_update())).one_or_none()
        if skill is None or skill.deleted_at is not None:
            raise _not_found()
        skill.status = "quarantined" if quarantined else "ready"
        skill.enabled = False
        skill.updated_at = datetime.now(UTC)
        session.add(skill)
        session.add(
            AdminAuditEvent(
                actor_type="admin",
                admin_id=admin_id,
                action="skill.quarantine" if quarantined else "skill.release_quarantine",
                target_type="skill",
                target_id=str(skill.id),
                change_summary={"reason_code": reason_code, "note": note} if note else {"reason_code": reason_code},
            )
        )
        await session.commit()
        await session.refresh(skill)
        return await _admin_data(session, skill)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable("skill_database_unavailable") from exc


def _not_found() -> APIException:
    return APIException(status_code=404, code=ErrorCode.NOT_FOUND, msg=ErrorMessage.NOT_FOUND)


def _conflict(reason: str) -> APIException:
    return APIException(
        status_code=409,
        code=ErrorCode.CONFLICT,
        msg=ErrorMessage.CONFLICT,
        data={"reason": reason},
    )


def _unavailable(reason: str) -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
        data={"reason": reason},
    )
