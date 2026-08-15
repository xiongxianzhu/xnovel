"""应用配置默认值测试。"""

from app.core.config import Settings


def test_default_postgres_database_name_is_xnovel(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    settings = Settings(secret_key="test-only-secret", _env_file=None)

    assert settings.database_url == "postgresql+asyncpg://postgres:postgres@localhost:5432/xnovel"
