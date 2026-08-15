"""由 Alembic 建表的 PostgreSQL 约束与并发集成测试。"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from runpy import run_path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.exceptions import APIException
from app.models.site import AuthRateLimitBucket, SiteSetting
from app.schemas.auth import RegisterRequest
from app.services.rate_limit import increment_registration_limits
from app.services.registration import register_user


@pytest.fixture
async def postgres_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """连接 CI 专用、已执行 Alembic upgrade head 的 PostgreSQL 数据库。"""

    database_url = os.getenv("TEST_POSTGRES_DATABASE_URL")
    if database_url is None:
        pytest.skip("TEST_POSTGRES_DATABASE_URL is not configured")

    engine = create_async_engine(database_url)
    async with engine.connect() as connection:
        database_name = (await connection.execute(text("SELECT current_database()"))).scalar_one()
    try:
        _require_safe_test_database(database_name)
    except RuntimeError:
        await engine.dispose()
        raise

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        revision = (await session.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
        seeded_setting = await session.get(SiteSetting, 1)
        assert revision == "20260816_0002"
        assert seeded_setting is not None and seeded_setting.registration_enabled is False
        await _reset_database(session)
    try:
        yield factory
    finally:
        async with factory() as session:
            await _reset_database(session)
        await engine.dispose()


def _require_safe_test_database(database_name: str) -> None:
    if database_name != "xnovel_test":
        raise RuntimeError(
            f"refusing PostgreSQL integration writes to database {database_name!r}; expected 'xnovel_test'"
        )


def test_postgres_cleanup_guard_rejects_non_test_database() -> None:
    _require_safe_test_database("xnovel_test")

    with pytest.raises(RuntimeError, match="refusing PostgreSQL integration writes"):
        _require_safe_test_database("xnovel")


async def _reset_database(session: AsyncSession) -> None:
    await session.execute(
        text(
            "TRUNCATE auth_rate_limit_buckets, admin_audit_events, user_preferences, "
            "site_settings, users RESTART IDENTITY CASCADE"
        )
    )
    await session.execute(text("INSERT INTO site_settings (id, registration_enabled) VALUES (1, false)"))
    await session.commit()


@pytest.mark.anyio
async def test_postgres_comments_match_migration_contract(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "20260816_0002_persistence_comments.py"
    migration = run_path(str(migration_path))
    expected_tables: dict[str, str] = migration["TABLE_COMMENTS"]
    expected_columns: dict[str, dict[str, str]] = migration["COLUMN_COMMENTS"]

    async with postgres_factory() as session:
        table_rows = (
            await session.execute(
                text(
                    "SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS comment "
                    "FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = current_schema() AND c.relkind = 'r' "
                    "AND c.relname IN ('users', 'user_preferences', 'site_settings', "
                    "'admin_audit_events', 'auth_rate_limit_buckets')"
                )
            )
        ).all()
        column_rows = (
            await session.execute(
                text(
                    "SELECT c.relname AS table_name, a.attname AS column_name, "
                    "col_description(c.oid, a.attnum) AS comment "
                    "FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "JOIN pg_attribute AS a ON a.attrelid = c.oid "
                    "WHERE n.nspname = current_schema() AND c.relkind = 'r' "
                    "AND a.attnum > 0 AND NOT a.attisdropped "
                    "AND c.relname IN ('users', 'user_preferences', 'site_settings', "
                    "'admin_audit_events', 'auth_rate_limit_buckets')"
                )
            )
        ).all()

    actual_tables = {row.table_name: row.comment for row in table_rows}
    actual_columns: dict[str, dict[str, str]] = {table_name: {} for table_name in expected_tables}
    for row in column_rows:
        actual_columns[row.table_name][row.column_name] = row.comment

    assert actual_tables == expected_tables
    assert actual_columns == expected_columns
    assert "哈希" in actual_columns["users"]["password_hash"]
    assert "摘要" in actual_columns["auth_rate_limit_buckets"]["key_hash"]
    assert "不含密钥" in actual_columns["admin_audit_events"]["change_summary"]


def _user_values(*, username: str, email: str, phone: str | None = None, role: str = "user") -> dict[str, object]:
    return {
        "id": uuid4(),
        "username": username,
        "email": email,
        "phone": phone,
        "password_hash": "test-only-digest",
        "nickname": username,
        "role": role,
    }


_INSERT_USER = text(
    """
    INSERT INTO users (id, username, email, phone_e164, password_hash, nickname, role)
    VALUES (:id, :username, :email, :phone, :password_hash, :nickname, :role)
    """
)


@pytest.mark.anyio
async def test_migration_created_postgres_specific_schema_and_constraints(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with postgres_factory() as session:
        json_type = (
            await session.execute(
                text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_schema = current_schema() "
                    "AND table_name = 'admin_audit_events' AND column_name = 'change_summary'"
                )
            )
        ).scalar_one()
        phone_index = (
            await session.execute(
                text(
                    "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() "
                    "AND indexname = 'uq_users_phone_e164'"
                )
            )
        ).scalar_one()
        setting = await session.get(SiteSetting, 1)
        timestamp_columns = (
            await session.execute(
                text(
                    "SELECT table_name, column_name, data_type, is_nullable "
                    "FROM information_schema.columns WHERE table_schema = current_schema() "
                    "AND table_name IN ('users', 'user_preferences', 'site_settings', "
                    "'admin_audit_events', 'auth_rate_limit_buckets') "
                    "AND column_name IN ('created_at', 'updated_at')"
                )
            )
        ).all()

        assert json_type == "jsonb"
        assert "UNIQUE" in phone_index
        assert "WHERE (phone_e164 IS NOT NULL)" in phone_index
        assert setting is not None and setting.registration_enabled is False
        assert len(timestamp_columns) == 10
        assert all(row.data_type == "timestamp with time zone" for row in timestamp_columns)
        assert all(row.is_nullable == "NO" for row in timestamp_columns)

        await session.execute(_INSERT_USER, _user_values(username="null-phone-1", email="null1@example.com"))
        await session.execute(_INSERT_USER, _user_values(username="null-phone-2", email="null2@example.com"))
        await session.execute(
            _INSERT_USER,
            _user_values(username="phone-1", email="phone1@example.com", phone="+8613800138000"),
        )
        await session.commit()

    async with postgres_factory() as session:
        with pytest.raises(IntegrityError):
            await session.execute(
                _INSERT_USER,
                _user_values(username="phone-2", email="phone2@example.com", phone="+8613800138000"),
            )
            await session.commit()
        await session.rollback()

    async with postgres_factory() as session:
        with pytest.raises(IntegrityError):
            await session.execute(
                _INSERT_USER,
                _user_values(username="invalid-role", email="invalid-role@example.com", role="owner"),
            )
            await session.commit()
        await session.rollback()

    async with postgres_factory() as session:
        with pytest.raises(IntegrityError):
            await session.execute(text("INSERT INTO site_settings (id, registration_enabled) VALUES (2, false)"))
            await session.commit()
        await session.rollback()

    async with postgres_factory() as session:
        with pytest.raises(IntegrityError):
            await session.execute(
                text(
                    "INSERT INTO admin_audit_events "
                    "(id, actor_type, admin_id, action, target_type, change_summary) "
                    "VALUES (:id, 'admin', NULL, 'invalid', 'user', '{}'::jsonb)"
                ),
                {"id": uuid4()},
            )
            await session.commit()
        await session.rollback()

    async with postgres_factory() as session:
        with pytest.raises(IntegrityError):
            await session.execute(
                text(
                    "INSERT INTO auth_rate_limit_buckets "
                    "(id, scope, key_hash, window_started_at, window_seconds, attempt_count) "
                    "VALUES (:id, 'registration_source', :key_hash, now(), 600, 0)"
                ),
                {"id": uuid4(), "key_hash": b"0" * 32},
            )
            await session.commit()
        await session.rollback()


@pytest.mark.anyio
async def test_postgres_mutable_timestamp_advances_without_changing_created_at(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    old_time = datetime(2000, 1, 1, tzinfo=UTC)
    async with postgres_factory() as session:
        await session.execute(
            text("UPDATE site_settings SET created_at = :old, updated_at = :old WHERE id = 1"),
            {"old": old_time},
        )
        await session.commit()

    async with postgres_factory() as session:
        setting = await session.get(SiteSetting, 1)
        assert setting is not None
        setting.registration_enabled = True
        session.add(setting)
        await session.commit()
        await session.refresh(setting)

        assert setting.created_at == old_time
        assert setting.updated_at > old_time


@pytest.mark.anyio
async def test_postgres_rate_limit_upsert_is_atomic_at_identity_boundary(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    now = datetime(2026, 8, 16, 12, 0, tzinfo=UTC)

    async def increment() -> bool:
        async with postgres_factory() as session:
            result = await increment_registration_limits(
                session,
                secret_key="postgres-integration-secret",
                client_ip="192.0.2.10",
                username="writer",
                email="writer@example.com",
                now=now,
            )
            return result.allowed

    allowed = await asyncio.gather(*(increment() for _ in range(4)))
    assert sum(allowed) == 3

    async with postgres_factory() as session:
        counts = {row.scope: row.attempt_count for row in (await session.exec(select(AuthRateLimitBucket))).all()}
    assert counts == {"registration_source": 4, "registration_source_identity": 4}


@pytest.mark.anyio
async def test_postgres_rate_limit_upsert_is_atomic_at_source_boundary(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    now = datetime(2026, 8, 16, 12, 0, tzinfo=UTC)

    async def increment(index: int) -> bool:
        async with postgres_factory() as session:
            result = await increment_registration_limits(
                session,
                secret_key="postgres-integration-secret",
                client_ip="192.0.2.20",
                username=f"writer-{index}",
                email=f"writer-{index}@example.com",
                now=now,
            )
            return result.allowed

    allowed = await asyncio.gather(*(increment(index) for index in range(11)))
    assert sum(allowed) == 10

    async with postgres_factory() as session:
        source_count = (
            await session.exec(
                select(AuthRateLimitBucket.attempt_count).where(col(AuthRateLimitBucket.scope) == "registration_source")
            )
        ).one()
    assert source_count == 11


@pytest.mark.anyio
async def test_postgres_rate_limit_commit_survives_registration_validation_failure(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _enable_registration(postgres_factory)
    async with postgres_factory() as session:
        with pytest.raises(APIException) as exc_info:
            await register_user(
                session,
                payload=RegisterRequest(
                    username="writer",
                    email="writer@example.com",
                    password="too-short",
                    nickname="作者",
                ),
                client_ip="192.0.2.30",
                secret_key="postgres-integration-secret",
            )
        assert exc_info.value.status_code == 422

    async with postgres_factory() as session:
        buckets = (await session.exec(select(AuthRateLimitBucket))).all()
    assert len(buckets) == 2
    assert all(bucket.attempt_count == 1 for bucket in buckets)


async def _enable_registration(factory: async_sessionmaker[AsyncSession]) -> None:
    async with factory() as session:
        setting = await session.get(SiteSetting, 1)
        assert setting is not None
        setting.registration_enabled = True
        session.add(setting)
        await session.commit()


@pytest.mark.anyio
async def test_registration_close_wins_for_update_race(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _enable_registration(postgres_factory)
    payload = RegisterRequest(
        username="writer",
        email="writer@example.com",
        password="correct horse battery staple",
        nickname="作者",
    )

    async def attempt_registration() -> int:
        async with postgres_factory() as session:
            try:
                await register_user(
                    session,
                    payload=payload,
                    client_ip="192.0.2.40",
                    secret_key="postgres-integration-secret",
                )
            except APIException as exc:
                return exc.status_code
            return 201

    async with postgres_factory() as closing_session:
        async with closing_session.begin():
            statement = select(SiteSetting).where(col(SiteSetting.id) == 1).with_for_update()
            setting = (await closing_session.exec(statement)).one()
            setting.registration_enabled = False
            closing_session.add(setting)
            await closing_session.flush()

            task = asyncio.create_task(attempt_registration())
            for _ in range(100):
                async with postgres_factory() as observer:
                    bucket_count = len((await observer.exec(select(AuthRateLimitBucket))).all())
                if bucket_count == 2:
                    break
                await asyncio.sleep(0.02)
            assert bucket_count == 2
            assert not task.done()

    assert await task == 403


@pytest.mark.anyio
async def test_concurrent_registration_keeps_one_identity(
    postgres_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _enable_registration(postgres_factory)
    payload = RegisterRequest(
        username="writer",
        email="writer@example.com",
        password="correct horse battery staple",
        nickname="作者",
    )

    async def attempt(client_ip: str) -> int:
        async with postgres_factory() as session:
            try:
                await register_user(
                    session,
                    payload=payload,
                    client_ip=client_ip,
                    secret_key="postgres-integration-secret",
                )
            except APIException as exc:
                return exc.status_code
            return 201

    statuses = await asyncio.gather(attempt("192.0.2.51"), attempt("192.0.2.52"))
    assert sorted(statuses) == [201, 409]
