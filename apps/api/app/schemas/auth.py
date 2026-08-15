"""公开注册与站点配置 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import APIResponse


class SiteConfigData(BaseModel):
    registration_enabled: bool


class SiteConfigResponse(APIResponse[SiteConfigData]):
    pass


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str = Field(json_schema_extra={"writeOnly": True})
    nickname: str
    phone_e164: str | None = None


class RegisteredUserData(BaseModel):
    id: UUID
    username: str
    email: str
    phone_e164: str | None
    nickname: str
    role: Literal["user"]
    status: Literal["active"]
    created_at: datetime
    updated_at: datetime


class RegisterUserResponse(APIResponse[RegisteredUserData]):
    pass
