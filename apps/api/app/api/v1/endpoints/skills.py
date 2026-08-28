"""用户私有 Skill 管理端点。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import PasswordChangeCompletedContextDep
from app.schemas.ai import (
    SkillDeleteData,
    SkillDeleteResponse,
    SkillEnabledRequest,
    SkillListResponse,
    SkillResourceResponse,
    SkillResponse,
    SkillUpdateRequest,
)
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ConflictErrorResponse,
    NotFoundErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.services.skills import (
    create_skill_from_archive,
    delete_skill,
    get_skill,
    list_skills,
    read_skill_resource,
    set_skill_enabled,
    update_skill_md,
)

router = APIRouter(prefix="/skills")
_RESOURCE_PATH = Query(min_length=1, max_length=1000)
_SKILL_FILE = File(...)
_AUTH: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
    503: {"model": ServiceUnavailableErrorResponse},
}
_MUTATION = _AUTH | {
    404: {"model": NotFoundErrorResponse},
    409: {"model": ConflictErrorResponse},
    422: {"model": ValidationErrorResponse},
}


@router.get("", operation_id="listSkills", responses=_AUTH)
async def get_skills(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> SkillListResponse:
    return SkillListResponse(code=0, msg="SUCCESS", data=await list_skills(session, owner_id=context.user.id))


@router.post(
    "",
    operation_id="uploadSkill",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION,
)
async def post_skill(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    file: UploadFile = _SKILL_FILE,
) -> SkillResponse:
    content = await file.read(10 * 1024 * 1024 + 1)
    data = await create_skill_from_archive(
        session,
        owner_id=context.user.id,
        filename=file.filename or "skill.zip",
        source=content,
        settings=get_settings(),
    )
    return SkillResponse(code=0, msg="SUCCESS", data=data)


@router.get("/{skill_id}", operation_id="getSkill", responses=_MUTATION)
async def get_skill_detail(
    skill_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> SkillResponse:
    return SkillResponse(
        code=0, msg="SUCCESS", data=await get_skill(session, owner_id=context.user.id, skill_id=skill_id)
    )


@router.put("/{skill_id}/skill-md", operation_id="updateSkillMarkdown", responses=_MUTATION)
async def put_skill_markdown(
    skill_id: UUID,
    payload: SkillUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> SkillResponse:
    data = await update_skill_md(
        session,
        owner_id=context.user.id,
        skill_id=skill_id,
        current_version_id=payload.current_version_id,
        skill_md_text=payload.skill_md_text,
        settings=get_settings(),
    )
    return SkillResponse(code=0, msg="SUCCESS", data=data)


@router.patch("/{skill_id}/enabled", operation_id="setSkillEnabled", responses=_MUTATION)
async def patch_skill_enabled(
    skill_id: UUID,
    payload: SkillEnabledRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> SkillResponse:
    data = await set_skill_enabled(
        session,
        owner_id=context.user.id,
        skill_id=skill_id,
        enabled=payload.enabled,
    )
    return SkillResponse(code=0, msg="SUCCESS", data=data)


@router.get("/{skill_id}/resource", operation_id="getSkillResource", responses=_MUTATION)
async def get_skill_resource(
    skill_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    path: str = _RESOURCE_PATH,
) -> SkillResourceResponse:
    data = await read_skill_resource(
        session,
        owner_id=context.user.id,
        skill_id=skill_id,
        path=path,
        settings=get_settings(),
    )
    return SkillResourceResponse(code=0, msg="SUCCESS", data=data)


@router.delete("/{skill_id}", operation_id="deleteSkill", responses=_MUTATION)
async def delete_skill_endpoint(
    skill_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> SkillDeleteResponse:
    await delete_skill(
        session,
        owner_id=context.user.id,
        skill_id=skill_id,
        settings=get_settings(),
    )
    return SkillDeleteResponse(code=0, msg="SUCCESS", data=SkillDeleteData(id=skill_id, deleted=True))
