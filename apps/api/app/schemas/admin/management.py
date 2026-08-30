"""管理员用户与审计查询 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import APIResponse


class AdminUserData(BaseModel):
    id: UUID
    username: str
    email_masked: str | None
    phone_masked: str | None
    nickname: str
    role: Literal["user", "admin"]
    status: Literal["active", "disabled"]
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminUserListData(BaseModel):
    items: list[AdminUserData]
    total: int
    offset: int
    limit: int


class AdminUserCreateRequest(BaseModel):
    username: str
    email: str | None = None
    nickname: str
    password: str = Field(json_schema_extra={"writeOnly": True})
    role: Literal["user", "admin"] = "user"


class AdminUserUpdateRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    nickname: str | None = None
    role: Literal["user", "admin"] | None = None
    status: Literal["active", "disabled"] | None = None


class AdminUserResponse(APIResponse[AdminUserData]):
    pass


class AdminUserListResponse(APIResponse[AdminUserListData]):
    pass


class LoginAuditData(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    nickname: str
    created_ip: str
    last_ip: str
    user_agent: str
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    revoke_reason: str | None


class LoginAuditListData(BaseModel):
    items: list[LoginAuditData]
    total: int
    offset: int
    limit: int


class LoginAuditListResponse(APIResponse[LoginAuditListData]):
    pass


class OperationAuditData(BaseModel):
    id: UUID
    actor_type: Literal["admin", "system"]
    admin_id: UUID | None
    admin_username: str | None
    action: str
    target_type: str
    target_id: str | None
    change_summary: dict[str, object]
    created_at: datetime


class OperationAuditListData(BaseModel):
    items: list[OperationAuditData]
    total: int
    offset: int
    limit: int


class OperationAuditListResponse(APIResponse[OperationAuditListData]):
    pass
