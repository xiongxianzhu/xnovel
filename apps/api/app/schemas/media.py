"""头像、媒体与公开站点设置 Schema。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import APIResponse


class AvatarUrlRequest(BaseModel):
    url: str


class AvatarData(BaseModel):
    source: Literal["none", "upload", "url"]
    url: str | None


class AvatarResponse(APIResponse[AvatarData]):
    pass


class PublicSiteSettingsData(BaseModel):
    registration_enabled: bool
    logo_url: str | None


class PublicSiteSettingsResponse(APIResponse[PublicSiteSettingsData]):
    pass


class LogoData(BaseModel):
    url: str | None


class LogoResponse(APIResponse[LogoData]):
    pass
