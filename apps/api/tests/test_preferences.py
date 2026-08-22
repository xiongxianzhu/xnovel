"""当前用户语言与主题偏好 API 测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.main import app
from app.models.account import User, UserPreference
from app.models.site import SiteSetting
from app.services.identity import hash_password

PASSWORD = "correct horse battery staple"


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
async def access_token(client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]) -> str:
    async with session_factory() as session:
        user = User(
            username="preference-writer",
            email="preference@example.com",
            password_hash=hash_password(PASSWORD),
            nickname="偏好作者",
            role="user",
            status="active",
        )
        session.add(SiteSetting(id=1))
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        await session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "preference-writer", "password": PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["data"]["access_token"]


@pytest.mark.anyio
async def test_preferences_return_defaults(client: AsyncClient, access_token: str) -> None:
    response = await client.get(
        "/api/v1/users/me/preferences",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"] | {"created_at": "", "updated_at": ""} == {
        "locale": "zh-CN",
        "theme_palette": "manuscript-brown",
        "theme_mode": "system",
        "created_at": "",
        "updated_at": "",
    }


@pytest.mark.anyio
async def test_preferences_patch_only_submitted_fields(client: AsyncClient, access_token: str) -> None:
    headers = {"Authorization": f"Bearer {access_token}"}
    response = await client.patch(
        "/api/v1/users/me/preferences",
        headers=headers,
        json={"locale": "zh-TW", "theme_mode": "dark"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["locale"] == "zh-TW"
    assert response.json()["data"]["theme_mode"] == "dark"
    assert response.json()["data"]["theme_palette"] == "manuscript-brown"


@pytest.mark.anyio
@pytest.mark.parametrize("payload", [{}, {"locale": None}, {"theme_palette": "unknown"}])
async def test_preferences_reject_empty_null_and_unknown_values(
    client: AsyncClient,
    access_token: str,
    payload: dict[str, object],
) -> None:
    response = await client.patch(
        "/api/v1/users/me/preferences",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["code"] == 10001


@pytest.mark.anyio
async def test_preferences_require_authentication(client: AsyncClient) -> None:
    response = await client.get("/api/v1/users/me/preferences")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
