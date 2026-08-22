"""作品列表、创建与详情端点。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import SessionDep
from app.core.security import PasswordChangeCompletedContextDep
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    NotFoundErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.schemas.projects import (
    ProjectCreateRequest,
    ProjectCreateResponse,
    ProjectDetailResponse,
    ProjectListResponse,
)
from app.services.projects import create_project, get_project, list_projects

router = APIRouter(prefix="/projects")

_AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
    503: {"model": ServiceUnavailableErrorResponse},
}


@router.get(
    "",
    operation_id="listProjects",
    responses=_AUTH_RESPONSES | {422: {"model": ValidationErrorResponse}},
)
async def get_projects(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ProjectListResponse:
    data = await list_projects(session, owner_id=context.user.id, page=page, page_size=page_size)
    return ProjectListResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "",
    operation_id="createProject",
    status_code=status.HTTP_201_CREATED,
    responses=_AUTH_RESPONSES | {422: {"model": ValidationErrorResponse}},
)
async def post_project(
    payload: ProjectCreateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectCreateResponse:
    data = await create_project(session, owner_id=context.user.id, payload=payload)
    return ProjectCreateResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/{project_id}",
    operation_id="getProject",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def get_project_detail(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectDetailResponse:
    data = await get_project(session, owner_id=context.user.id, project_id=project_id)
    return ProjectDetailResponse(code=0, msg="SUCCESS", data=data)
