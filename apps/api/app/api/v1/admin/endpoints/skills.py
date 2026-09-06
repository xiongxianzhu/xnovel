"""管理员 Skill 安全元数据与隔离端点。"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query

from app.api.deps import SessionDep
from app.core.security import AdminContextDep
from app.schemas.ai import AdminSkillListResponse, AdminSkillResponse, SkillQuarantineRequest
from app.schemas.common import ConflictErrorResponse, NotFoundErrorResponse, ServiceUnavailableErrorResponse
from app.services.skills import list_admin_skills, set_skill_quarantine

router = APIRouter(prefix="/skills")


@router.get(
    "",
    operation_id="listAdminSkills",
    responses={503: {"model": ServiceUnavailableErrorResponse}},
)
async def get_admin_skills(
    _: AdminContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    q: str = Query(default="", max_length=200),
) -> AdminSkillListResponse:
    return AdminSkillListResponse(code=0, msg="SUCCESS", data=await list_admin_skills(session, page, page_size, q))


@router.post(
    "/{skill_id}/quarantine",
    operation_id="quarantineSkill",
    responses={
        404: {"model": NotFoundErrorResponse},
        409: {"model": ConflictErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def post_quarantine(
    skill_id: UUID,
    payload: SkillQuarantineRequest,
    context: AdminContextDep,
    session: SessionDep,
) -> AdminSkillResponse:
    data = await set_skill_quarantine(
        session,
        admin_id=context.user.id,
        skill_id=skill_id,
        quarantined=True,
        reason_code=payload.reason_code,
        note=payload.note,
    )
    return AdminSkillResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/{skill_id}/release",
    operation_id="releaseSkillQuarantine",
    responses={404: {"model": NotFoundErrorResponse}, 503: {"model": ServiceUnavailableErrorResponse}},
)
async def post_release(
    skill_id: UUID,
    payload: SkillQuarantineRequest,
    context: AdminContextDep,
    session: SessionDep,
) -> AdminSkillResponse:
    data = await set_skill_quarantine(
        session,
        admin_id=context.user.id,
        skill_id=skill_id,
        quarantined=False,
        reason_code=payload.reason_code,
        note=payload.note,
    )
    return AdminSkillResponse(code=0, msg="SUCCESS", data=data)
