"""当前用户资料与密码修改 Schema。"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import APIResponse


class UserProfileData(BaseModel):
    id: UUID
    username: str
    email: str | None
    email_verified_at: datetime | None
    phone_e164: str | None
    phone_verified_at: datetime | None
    nickname: str
    role: Literal["user", "admin"]
    avatar_source: Literal["none", "upload", "url"]
    avatar_url: str | None
    address: str | None
    birthday: date | None
    status: Literal["active"]
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    must_change_password: bool


class UserProfileResponse(APIResponse[UserProfileData]):
    pass


class UpdateProfileRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    phone_e164: str | None = None
    nickname: str | None = None
    address: str | None = None
    birthday: date | None = None
    current_password: str | None = Field(default=None, json_schema_extra={"writeOnly": True})


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(json_schema_extra={"writeOnly": True})
    new_password: str = Field(json_schema_extra={"writeOnly": True})


class PasswordChangedData(BaseModel):
    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_at: datetime
    user: UserProfileData


class ChangePasswordResponse(APIResponse[PasswordChangedData]):
    pass
