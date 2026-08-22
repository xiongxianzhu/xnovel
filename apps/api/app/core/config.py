"""基于 pydantic-settings 的类型化配置。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    app_name: str = "api"
    secret_key: str
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/xnovel"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    jwt_issuer: str = "xnovel-api"
    jwt_audience: str = "xnovel-web"
    refresh_cookie_name: str = "xnovel_refresh_token"
    refresh_cookie_secure: bool = False
    trusted_web_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    media_root: Path = Path("data/media")


@lru_cache
def get_settings() -> Settings:
    return Settings()
