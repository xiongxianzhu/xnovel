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
    email: str | None = None
    password: str = Field(json_schema_extra={"writeOnly": True})
    nickname: str
    phone_e164: str | None = None


class RegisteredUserData(BaseModel):
    id: UUID
    username: str
    email: str | None
    phone_e164: str | None
    nickname: str
    role: Literal["user"]
    status: Literal["active"]
    created_at: datetime
    updated_at: datetime


class RegisterUserResponse(APIResponse[RegisteredUserData]):
    pass


class LoginRequest(BaseModel):
    identifier: str
    password: str = Field(json_schema_extra={"writeOnly": True})


class AuthenticatedUserData(BaseModel):
    id: UUID
    username: str
    email: str | None
    must_change_password: bool
    phone_e164: str | None
    nickname: str
    role: Literal["user", "admin"]
    status: Literal["active"]


class AuthTokenData(BaseModel):
    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_at: datetime
    user: AuthenticatedUserData


class LoginResponse(APIResponse[AuthTokenData]):
    pass


class RefreshTokenData(BaseModel):
    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_at: datetime


class RefreshResponse(APIResponse[RefreshTokenData]):
    pass


class LogoutResponse(APIResponse[dict[str, object]]):
    pass
