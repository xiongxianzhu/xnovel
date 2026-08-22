"""用户资料、密码、头像与全局 Logo 测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from io import BytesIO
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.main import app
from app.models.account import User, UserPreference
from app.models.session import UserSession
from app.models.site import AdminAuditEvent, SiteSetting
from app.services.identity import hash_password

PASSWORD = "correct horse battery staple"


@pytest.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path / "media"))
    get_settings.cache_clear()

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
    get_settings.cache_clear()


async def _create_user(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    role: str = "user",
) -> User:
    async with session_factory() as session:
        setting = await session.get(SiteSetting, 1)
        if setting is None:
            session.add(SiteSetting(id=1))
        user = User(
            username=f"{role}-writer",
            email=f"{role}@example.com",
            password_hash=hash_password(PASSWORD),
            nickname="作者",
            role=role,
            status="active",
        )
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        await session.commit()
        await session.refresh(user)
        return user


async def _login(client: AsyncClient, user: User) -> str:
    response = await client.post(
        "/api/v1/auth/login",
        json={"identifier": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["data"]["access_token"]


def _png_bytes(width: int = 32, height: int = 32) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), "white").save(output, format="PNG")
    return output.getvalue()


@pytest.mark.anyio
async def test_profile_updates_private_and_sensitive_fields(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory)
    token = await _login(client, user)
    headers = {"Authorization": f"Bearer {token}"}

    ordinary = await client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"nickname": "新昵称", "address": " 上海 "},
    )
    missing_password = await client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"email": "New@Example.COM"},
    )
    sensitive = await client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"email": " New@Example.COM ", "current_password": PASSWORD},
    )

    assert ordinary.status_code == 200
    assert ordinary.json()["data"]["address"] == "上海"
    assert missing_password.json()["code"] == 11007
    assert sensitive.status_code == 200
    assert sensitive.json()["data"]["email"] == "new@example.com"
    assert sensitive.json()["data"]["email_verified_at"] is None
    assert PASSWORD not in sensitive.text


@pytest.mark.anyio
async def test_password_change_revokes_other_sessions(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory)
    first_access = await _login(client, user)
    current_access = await _login(client, user)

    changed = await client.put(
        "/api/v1/users/me/password",
        headers={"Authorization": f"Bearer {current_access}"},
        json={"current_password": PASSWORD, "new_password": "A different secure 9!"},
    )
    old_session = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {first_access}"},
    )
    assert changed.status_code == 200, changed.text
    current_session = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {changed.json()['data']['access_token']}"},
    )
    assert old_session.status_code == 401
    assert old_session.json()["code"] == 11006
    assert current_session.status_code == 200

    async with session_factory() as session:
        sessions = (await session.exec(select(UserSession))).all()
        assert len(sessions) == 2
    assert sum(row.revoke_reason == "password_changed" for row in sessions) == 1
    assert changed.json()["data"]["user"]["must_change_password"] is False


@pytest.mark.anyio
async def test_password_change_without_refresh_cookie_returns_bearer_challenge(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory)
    access_token = await _login(client, user)
    client.cookies.clear()

    response = await client.put(
        "/api/v1/users/me/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": PASSWORD, "new_password": "a different secure password"},
    )

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json() == {"code": 11006, "msg": "SESSION_INVALID", "data": {}}


@pytest.mark.anyio
async def test_avatar_upload_external_url_and_delete(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory)
    token = await _login(client, user)
    headers = {"Authorization": f"Bearer {token}"}

    uploaded = await client.post(
        "/api/v1/users/me/avatar",
        headers=headers,
        files={"file": ("avatar.png", _png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    media_url = uploaded.json()["data"]["url"]
    fetched = await client.get(media_url)
    assert fetched.status_code == 200
    assert fetched.headers["x-content-type-options"] == "nosniff"

    unsafe = await client.put(
        "/api/v1/users/me/avatar-url",
        headers=headers,
        json={"url": "https://127.0.0.1/avatar.png"},
    )
    external = await client.put(
        "/api/v1/users/me/avatar-url",
        headers=headers,
        json={"url": "https://images.example.com/avatar.png"},
    )
    removed_upload = await client.get(media_url)
    deleted = await client.delete("/api/v1/users/me/avatar", headers=headers)

    assert unsafe.json()["code"] == 12001
    assert external.status_code == 200
    assert removed_upload.status_code == 404
    assert removed_upload.json()["code"] == 10004
    assert deleted.json()["data"] == {"source": "none", "url": None}


@pytest.mark.anyio
async def test_only_admin_can_upload_global_logo_and_action_is_audited(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory)
    user_token = await _login(client, user)
    forbidden = await client.post(
        "/api/admin/v1/site-settings/logo",
        headers={"Authorization": f"Bearer {user_token}"},
        files={"file": ("logo.png", _png_bytes(), "image/png")},
    )
    assert forbidden.status_code == 403

    admin = await _create_user(session_factory, role="admin")
    admin_token = await _login(client, admin)
    uploaded = await client.post(
        "/api/admin/v1/site-settings/logo",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("logo.png", _png_bytes(), "image/png")},
    )
    public = await client.get("/api/v1/site-settings/public")

    assert uploaded.status_code == 200, uploaded.text
    assert public.json()["data"]["logo_url"] == uploaded.json()["data"]["url"]
    async with session_factory() as session:
        audit = (await session.exec(select(AdminAuditEvent))).one()
        assert audit.action == "site.logo_changed"
