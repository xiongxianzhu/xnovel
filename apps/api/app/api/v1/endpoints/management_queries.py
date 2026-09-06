"""独立管理页面所需的分页和只读详情。"""

from math import ceil
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlmodel import col, select

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import AdminContextDep, PasswordChangeCompletedContextDep
from app.models.account import User
from app.models.ai import SkillVersion
from app.models.document import Document
from app.models.planning import Character, WorldEntry
from app.models.session import UserSession
from app.schemas.admin.management import LoginAuditData
from app.schemas.ai import SkillVersionData
from app.schemas.common import APIResponse
from app.schemas.planning import CharacterData, WorldEntryData
from app.schemas.projects import DocumentSummary
from app.schemas.studio import StudioPage
from app.services.planning import character_data, world_entry_data
from app.services.projects import _not_found, _owned_project, document_summary
from app.services.skills import _current_version, _owned_skill, _read_version_files, _version_data

router = APIRouter()
admin_router = APIRouter()


@router.get("/projects/{project_id}/characters/search", operation_id="searchProjectCharacters")
async def characters(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> APIResponse[StudioPage[CharacterData]]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    filters = [col(Character.project_id) == project_id, col(Character.deleted_at).is_(None)]
    if q.strip():
        filters.append(
            or_(
                col(Character.name).icontains(q.strip(), autoescape=True),
                col(Character.summary).icontains(q.strip(), autoescape=True),
            )
        )
    total = (await session.exec(select(func.count()).select_from(Character).where(*filters))).one()
    rows = (
        await session.exec(
            select(Character)
            .where(*filters)
            .order_by(col(Character.position), col(Character.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=StudioPage(
            items=[character_data(row) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size),
        ),
    )


@router.get("/projects/{project_id}/characters/{character_id}", operation_id="getProjectCharacter")
async def character(
    project_id: UUID, character_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[CharacterData]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    row = await session.get(Character, character_id)
    if row is None or row.project_id != project_id or row.deleted_at is not None:
        raise _not_found()
    return APIResponse(code=0, msg="SUCCESS", data=character_data(row))


@router.get("/projects/{project_id}/world-entries/search", operation_id="searchProjectWorldEntries")
async def world_entries(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> APIResponse[StudioPage[WorldEntryData]]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    filters = [col(WorldEntry.project_id) == project_id, col(WorldEntry.deleted_at).is_(None)]
    if q.strip():
        filters.append(
            or_(
                col(WorldEntry.title).icontains(q.strip(), autoescape=True),
                col(WorldEntry.content).icontains(q.strip(), autoescape=True),
            )
        )
    total = (await session.exec(select(func.count()).select_from(WorldEntry).where(*filters))).one()
    rows = (
        await session.exec(
            select(WorldEntry)
            .where(*filters)
            .order_by(col(WorldEntry.position), col(WorldEntry.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=StudioPage(
            items=[world_entry_data(row) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size),
        ),
    )


@router.get("/projects/{project_id}/world-entries/{entry_id}", operation_id="getProjectWorldEntry")
async def world_entry(
    project_id: UUID, entry_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[WorldEntryData]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    row = await session.get(WorldEntry, entry_id)
    if row is None or row.project_id != project_id or row.deleted_at is not None:
        raise _not_found()
    return APIResponse(code=0, msg="SUCCESS", data=world_entry_data(row))


@router.get("/projects/{project_id}/documents/search", operation_id="searchProjectDocuments")
async def documents(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    include_archived: bool = False,
) -> APIResponse[StudioPage[DocumentSummary]]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    filters = [col(Document.project_id) == project_id, col(Document.deleted_at).is_(None)]
    if not include_archived:
        filters.append(col(Document.status) == "active")
    if q.strip():
        filters.append(col(Document.title).icontains(q.strip(), autoescape=True))
    total = (await session.exec(select(func.count()).select_from(Document).where(*filters))).one()
    rows = (
        await session.exec(
            select(Document)
            .where(*filters)
            .order_by(col(Document.position), col(Document.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=StudioPage(
            items=[document_summary(row) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size),
        ),
    )


@router.get("/projects/{project_id}/documents/{document_id}", operation_id="getProjectDocument")
async def document(
    project_id: UUID, document_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[DocumentSummary]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    row = await session.get(Document, document_id)
    if row is None or row.project_id != project_id or row.deleted_at is not None:
        raise _not_found()
    return APIResponse(code=0, msg="SUCCESS", data=document_summary(row))


class VersionDetail(BaseModel):
    version: SkillVersionData
    skill_md_text: str


@router.get("/skills/{skill_id}/files", operation_id="listSkillFiles")
async def skill_files(
    skill_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[list[str]]:
    skill = await _owned_skill(session, context.user.id, skill_id)
    if skill.status != "ready":
        raise _not_found()
    version = await _current_version(session, skill)
    return APIResponse(code=0, msg="SUCCESS", data=sorted(_read_version_files(get_settings(), version)))


@router.get("/skills/{skill_id}/versions", operation_id="listSkillVersions")
async def skill_versions(
    skill_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    q: str = Query(default="", max_length=100),
) -> APIResponse[StudioPage[SkillVersionData]]:
    await _owned_skill(session, context.user.id, skill_id)
    filters = [col(SkillVersion.skill_id) == skill_id]
    if q.strip():
        filters.append(col(SkillVersion.content_sha256).icontains(q.strip(), autoescape=True))
    total = (await session.exec(select(func.count()).select_from(SkillVersion).where(*filters))).one()
    rows = (
        await session.exec(
            select(SkillVersion)
            .where(*filters)
            .order_by(col(SkillVersion.version_number).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=StudioPage(
            items=[_version_data(row) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size),
        ),
    )


@router.get("/skills/{skill_id}/versions/{version_id}", operation_id="getSkillVersion")
async def skill_version(
    skill_id: UUID, version_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[VersionDetail]:
    skill = await _owned_skill(session, context.user.id, skill_id)
    row = await session.get(SkillVersion, version_id)
    if row is None or row.skill_id != skill_id or skill.status != "ready":
        raise _not_found()
    return APIResponse(
        code=0, msg="SUCCESS", data=VersionDetail(version=_version_data(row), skill_md_text=row.skill_md_text)
    )


@admin_router.get("/audit/login/{session_id}", operation_id="getAdminLoginAudit")
async def login_audit(session_id: UUID, context: AdminContextDep, session: SessionDep) -> APIResponse[LoginAuditData]:
    row = await session.get(UserSession, session_id)
    user = await session.get(User, row.user_id) if row else None
    if row is None or user is None:
        raise _not_found()
    data = LoginAuditData.model_validate({**row.model_dump(), "username": user.username, "nickname": user.nickname})
    return APIResponse(code=0, msg="SUCCESS", data=data)
