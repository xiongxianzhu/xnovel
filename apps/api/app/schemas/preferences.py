"""当前用户语言与主题偏好 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, RootModel
from pydantic.experimental.missing_sentinel import MISSING

from app.schemas.common import APIResponse

Locale = Literal["zh-CN", "zh-TW", "en-US"]
ThemePalette = Literal["manuscript-brown", "pine-green", "harbor-blue", "grape-purple", "graphite"]
ThemeMode = Literal["system", "light", "dark"]


class UserPreferenceData(BaseModel):
    locale: Locale
    theme_palette: ThemePalette
    theme_mode: ThemeMode
    created_at: datetime
    updated_at: datetime


class UserPreferenceResponse(APIResponse[UserPreferenceData]):
    pass


class UpdateLocalePreferenceRequest(BaseModel):
    locale: Locale
    theme_palette: ThemePalette | MISSING = MISSING  # type: ignore[valid-type]
    theme_mode: ThemeMode | MISSING = MISSING  # type: ignore[valid-type]


class UpdateThemePalettePreferenceRequest(BaseModel):
    locale: Locale | MISSING = MISSING  # type: ignore[valid-type]
    theme_palette: ThemePalette
    theme_mode: ThemeMode | MISSING = MISSING  # type: ignore[valid-type]


class UpdateThemeModePreferenceRequest(BaseModel):
    locale: Locale | MISSING = MISSING  # type: ignore[valid-type]
    theme_palette: ThemePalette | MISSING = MISSING  # type: ignore[valid-type]
    theme_mode: ThemeMode


PreferenceUpdate = (
    UpdateLocalePreferenceRequest | UpdateThemePalettePreferenceRequest | UpdateThemeModePreferenceRequest
)


class UpdateUserPreferenceRequest(RootModel[PreferenceUpdate]):
    pass
