"""公开站点配置与注册 API 测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.main import app
from app.models.account import User, UserPreference
from app.models.site import AuthRateLimitBucket, SiteSetting


@pytest.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncClient]:
    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_site_config_fails_closed_without_singleton(client: AsyncClient) -> None:
    response = await client.get("/api/v1/site-config")
    assert response.status_code == 200
    assert response.json() == {
        "code": 0,
        "msg": "SUCCESS",
        "data": {"registration_enabled": False},
    }


@pytest.mark.anyio
async def test_registration_disabled_does_not_consume_limit(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "writer",
            "email": "writer@example.com",
            "password": "correct horse battery staple",
            "nickname": "作者",
        },
    )
    assert response.status_code == 403
    assert response.json() == {"code": 11001, "msg": "REGISTRATION_DISABLED", "data": {}}


@pytest.mark.anyio
async def test_registration_database_failure_is_sanitized_service_unavailable() -> None:
    class BrokenSession:
        async def get(self, *_args: object, **_kwargs: object) -> object:
            raise SQLAlchemyError("driver-password-must-not-leak")

    async def override_get_db() -> AsyncIterator[BrokenSession]:
        yield BrokenSession()

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as test_client:
            response = await test_client.post(
                "/api/v1/auth/register",
                json={
                    "username": "writer",
                    "email": "writer@example.com",
                    "password": "correct horse battery staple",
                    "nickname": "作者",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"code": 10007, "msg": "SERVICE_UNAVAILABLE", "data": {}}
    assert "driver-password-must-not-leak" not in response.text


@pytest.mark.anyio
async def test_registration_creates_user_and_default_preferences(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1, registration_enabled=True))
        await session.commit()

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "Ｗriter",
            "email": " Writer@Example.COM ",
            "password": "correct horse battery staple",
            "nickname": "作者",
            "phone_e164": "+8613800138000",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["code"] == 0
    assert body["msg"] == "SUCCESS"
    assert body["data"]["username"] == "writer"
    assert body["data"]["email"] == "writer@example.com"
    assert body["data"]["role"] == "user"
    assert body["data"]["status"] == "active"
    assert "password" not in response.text

    async with session_factory() as session:
        user = (await session.exec(select(User))).one()
        preference = await session.get(UserPreference, user.id)
        assert preference is not None
        assert preference.locale == "zh-CN"
        assert preference.theme_palette == "manuscript-brown"
        assert preference.theme_mode == "system"


@pytest.mark.anyio
async def test_invalid_password_is_counted_without_leaking_input(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1, registration_enabled=True))
        await session.commit()

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "writer",
            "email": "writer@example.com",
            "password": "secret",
            "nickname": "作者",
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == 10001
    assert "secret" not in response.text

    async with session_factory() as session:
        rows = (await session.exec(select(AuthRateLimitBucket))).all()
        assert len(rows) == 2
        assert all(row.attempt_count == 1 for row in rows)


@pytest.mark.anyio
async def test_registration_rate_limit_returns_matching_header_and_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1, registration_enabled=True))
        await session.commit()

    payload = {
        "username": "writer",
        "email": "writer@example.com",
        "password": "secret",
        "nickname": "作者",
    }
    responses = [await client.post("/api/v1/auth/register", json=payload) for _ in range(4)]

    assert [response.status_code for response in responses] == [422, 422, 422, 429]
    limited = responses[-1]
    assert limited.json()["code"] == 11003
    assert limited.headers["Retry-After"] == str(limited.json()["data"]["retry_after_seconds"])


@pytest.mark.anyio
async def test_framework_level_missing_field_does_not_consume_limit(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1, registration_enabled=True))
        await session.commit()

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "writer",
            "email": "writer@example.com",
            "nickname": "作者",
        },
    )
    assert response.status_code == 422

    async with session_factory() as session:
        assert (await session.exec(select(AuthRateLimitBucket))).all() == []


@pytest.mark.anyio
async def test_identifier_conflict_uses_generic_error(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1, registration_enabled=True))
        await session.commit()

    payload = {
        "username": "writer",
        "email": "writer@example.com",
        "password": "correct horse battery staple",
        "nickname": "作者",
    }
    first = await client.post("/api/v1/auth/register", json=payload)
    second = await client.post("/api/v1/auth/register", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json() == {
        "code": 11002,
        "msg": "ACCOUNT_IDENTIFIER_UNAVAILABLE",
        "data": {},
    }
