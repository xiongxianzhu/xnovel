"""头像、媒体与公开站点设置 Schema。"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.common import APIResponse


class AvatarUrlRequest(BaseModel):
    url: str


class AvatarData(BaseModel):
    source: Literal["none", "upload", "url"]
    url: str | None


class AvatarResponse(APIResponse[AvatarData]):
    pass


class PublicSiteSettingsData(BaseModel):
    site_name: str
    registration_enabled: bool
    logo_url: str | None


class UpdateSiteSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class PublicSiteSettingsResponse(APIResponse[PublicSiteSettingsData]):
    pass


class LogoData(BaseModel):
    url: str | None


class LogoResponse(APIResponse[LogoData]):
    pass
