"""管理员用户与审计端点。"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import SessionDep
from app.core.security import AdminContextDep
from app.schemas.admin.management import (
    AdminUserCreateRequest,
    AdminUserListResponse,
    AdminUserResponse,
    AdminUserUpdateRequest,
    LoginAuditListResponse,
    OperationAuditListResponse,
)
from app.services.admin_management import (
    create_user,
    disable_user,
    get_user,
    list_login_audits,
    list_operation_audits,
    list_users,
    update_user,
)

router = APIRouter()


@router.get("/users", operation_id="listAdminUsers")
async def get_users(
    _: AdminContextDep,
    session: SessionDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    query: str | None = Query(default=None, max_length=100),
    role: Literal["user", "admin"] | None = None,
    account_status: Literal["active", "disabled"] | None = Query(default=None, alias="status"),
) -> AdminUserListResponse:
    return AdminUserListResponse(
        code=0,
        msg="SUCCESS",
        data=await list_users(
            session,
            offset=offset,
            limit=limit,
            query=query,
            role=role,
            status=account_status,
        ),
    )


@router.post("/users", operation_id="createAdminUser", status_code=status.HTTP_201_CREATED)
async def post_user(
    payload: AdminUserCreateRequest,
    context: AdminContextDep,
    session: SessionDep,
) -> AdminUserResponse:
    return AdminUserResponse(
        code=0,
        msg="SUCCESS",
        data=await create_user(session, admin_id=context.user.id, payload=payload),
    )


@router.get("/users/{user_id}", operation_id="getAdminUser")
async def get_user_detail(user_id: UUID, _: AdminContextDep, session: SessionDep) -> AdminUserResponse:
    return AdminUserResponse(code=0, msg="SUCCESS", data=await get_user(session, user_id))


@router.patch("/users/{user_id}", operation_id="updateAdminUser")
async def patch_user(
    user_id: UUID,
    payload: AdminUserUpdateRequest,
    context: AdminContextDep,
    session: SessionDep,
) -> AdminUserResponse:
    return AdminUserResponse(
        code=0,
        msg="SUCCESS",
        data=await update_user(session, admin_id=context.user.id, user_id=user_id, payload=payload),
    )


@router.delete("/users/{user_id}", operation_id="disableAdminUser")
async def delete_user(user_id: UUID, context: AdminContextDep, session: SessionDep) -> AdminUserResponse:
    return AdminUserResponse(
        code=0,
        msg="SUCCESS",
        data=await disable_user(session, admin_id=context.user.id, user_id=user_id),
    )


@router.get("/audit/login", operation_id="listAdminLoginAudits")
async def get_login_audits(
    _: AdminContextDep,
    session: SessionDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    query: str | None = Query(default=None, max_length=100),
) -> LoginAuditListResponse:
    return LoginAuditListResponse(
        code=0,
        msg="SUCCESS",
        data=await list_login_audits(session, offset=offset, limit=limit, query=query),
    )


@router.get("/audit/operations", operation_id="listAdminOperationAudits")
async def get_operation_audits(
    _: AdminContextDep,
    session: SessionDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    action: str | None = Query(default=None, max_length=100),
) -> OperationAuditListResponse:
    return OperationAuditListResponse(
        code=0,
        msg="SUCCESS",
        data=await list_operation_audits(session, offset=offset, limit=limit, action=action),
    )
