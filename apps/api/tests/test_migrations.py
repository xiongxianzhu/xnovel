"""Alembic 空库升级测试。"""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command
from app.core.config import get_settings


def test_upgrade_from_empty_database_seeds_disabled_site_settings(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "migration.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path.as_posix()}")
    get_settings.cache_clear()
    config = Config("alembic.ini")

    try:
        command.upgrade(config, "head")
        command.downgrade(config, "20260816_0001")
        command.upgrade(config, "head")
    finally:
        get_settings.cache_clear()

    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    try:
        table_names = set(inspect(engine).get_table_names())
        assert {
            "users",
            "user_preferences",
            "site_settings",
            "admin_audit_events",
            "auth_rate_limit_buckets",
        }.issubset(table_names)
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            row = connection.execute(
                text("SELECT id, registration_enabled, created_at, updated_at FROM site_settings")
            ).one()
        assert row.id == 1
        assert revision == "20260816_0002"
        assert row.registration_enabled == 0
        assert row.created_at is not None
        assert row.updated_at is not None
    finally:
        engine.dispose()
