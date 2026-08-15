"""基于 pydantic-settings 的类型化配置。"""

from __future__ import annotations

from functools import lru_cache

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
