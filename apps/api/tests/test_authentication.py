"""真实登录、会话轮换与撤销测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.main import app
from app.models.account import User, UserPreference
from app.models.session import UserSession, UserSessionToken
from app.models.site import SiteSetting
from app.services.administration import create_first_admin
from app.services.identity import hash_password

PASSWORD = "correct horse battery staple"
ORIGIN = "http://localhost:5173"


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


@pytest.fixture
async def active_user(session_factory: async_sessionmaker[AsyncSession]) -> User:
    async with session_factory() as session:
        user = User(
            username="writer",
            email="writer@example.com",
            phone_e164="+8613800138000",
            password_hash=hash_password(PASSWORD),
            nickname="作者",
            role="user",
            status="active",
        )
        session.add(SiteSetting(id=1))
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        await session.commit()
        await session.refresh(user)
        return user


@pytest.mark.anyio
@pytest.mark.parametrize("identifier", ["writer", "WRITER@EXAMPLE.COM", "+8613800138000"])
async def test_login_accepts_all_supported_identifiers(
    client: AsyncClient,
    active_user: User,
    identifier: str,
) -> None:
    response = await client.post("/api/v1/auth/login", json={"identifier": identifier, "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["user"]["id"] == str(active_user.id)
    assert body["token_type"] == "Bearer"
    assert body["access_token"]
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert PASSWORD not in response.text


@pytest.mark.anyio
async def test_bootstrap_admin_must_change_password_before_business_access(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1))
        await session.commit()
        admin = await create_first_admin(
            session,
            username_input="admin",
            nickname_input="管理员",
            bootstrap=True,
        )

    login = await client.post(
        "/api/v1/auth/login",
        json={"identifier": admin.username, "password": "123456"},
    )
    token = login.json()["data"]["access_token"]
    profile = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    projects = await client.get(
        "/api/v1/projects",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert login.status_code == 200
    assert login.json()["data"]["user"]["must_change_password"] is True
    assert profile.status_code == 200
    assert projects.status_code == 403
    assert projects.json()["data"]["reason"] == "must_change_password"


@pytest.mark.anyio
async def test_login_uses_generic_error_for_unknown_account_and_wrong_password(
    client: AsyncClient,
    active_user: User,
) -> None:
    wrong = await client.post(
        "/api/v1/auth/login",
        json={"identifier": active_user.username, "password": "wrong password"},
    )
    unknown = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "unknown", "password": "wrong password"},
    )

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"code": 11004, "msg": "INVALID_CREDENTIALS", "data": {}}


@pytest.mark.anyio
async def test_refresh_rotates_token_and_replay_revokes_session(
    client: AsyncClient,
    active_user: User,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"identifier": active_user.username, "password": PASSWORD},
    )
    assert login.status_code == 200
    old_token = client.cookies["xnovel_refresh_token"]

    refreshed = await client.post("/api/v1/auth/refresh", headers={"Origin": ORIGIN})
    assert refreshed.status_code == 200
    assert client.cookies["xnovel_refresh_token"] != old_token

    client.cookies.clear()
    client.cookies.set("xnovel_refresh_token", old_token, path="/api/v1")
    replay = await client.post("/api/v1/auth/refresh", headers={"Origin": ORIGIN})
    assert replay.status_code == 401
    assert replay.json()["code"] == 11006

    async with session_factory() as session:
        login_session = (await session.exec(select(UserSession))).one()
        tokens = (await session.exec(select(UserSessionToken))).all()
        assert login_session.revoked_at is not None
        assert login_session.revoke_reason == "refresh_token_reuse"
        assert len(tokens) == 2
        assert sum(token.used_at is not None for token in tokens) == 1


@pytest.mark.anyio
async def test_refresh_and_logout_require_trusted_origin(client: AsyncClient, active_user: User) -> None:
    await client.post("/api/v1/auth/login", json={"identifier": active_user.username, "password": PASSWORD})

    missing_origin = await client.post("/api/v1/auth/refresh")
    wrong_origin = await client.post("/api/v1/auth/logout", headers={"Origin": "https://attacker.example"})

    assert missing_origin.status_code == 403
    assert wrong_origin.status_code == 403


@pytest.mark.anyio
async def test_refresh_without_cookie_returns_bearer_challenge(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/refresh", headers={"Origin": ORIGIN})

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json() == {"code": 11006, "msg": "SESSION_INVALID", "data": {}}


@pytest.mark.anyio
async def test_logout_is_idempotent_and_revokes_current_session(
    client: AsyncClient,
    active_user: User,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await client.post("/api/v1/auth/login", json={"identifier": active_user.username, "password": PASSWORD})

    first = await client.post("/api/v1/auth/logout", headers={"Origin": ORIGIN})
    second = await client.post("/api/v1/auth/logout", headers={"Origin": ORIGIN})

    assert first.status_code == second.status_code == 200
    async with session_factory() as session:
        login_session = (await session.exec(select(UserSession))).one()
        assert login_session.revoked_at is not None
        assert login_session.revoke_reason == "logout"
