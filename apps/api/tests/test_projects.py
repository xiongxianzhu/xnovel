"""作品 API 测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID, uuid7

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.main import app
from app.models.account import User, UserPreference
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.project import Project
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
    get_settings.cache_clear()


async def _create_user(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    suffix: str,
) -> User:
    async with session_factory() as session:
        user = User(
            username=f"writer-{suffix}",
            email=f"{suffix}@example.com",
            password_hash=hash_password(PASSWORD),
            nickname="作者",
            status="active",
        )
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        if await session.get(SiteSetting, 1) is None:
            session.add(SiteSetting(id=1))
        await session.commit()
        return user


async def _login(client: AsyncClient, user: User) -> str:
    response = await client.post(
        "/api/v1/auth/login",
        json={"identifier": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]["access_token"]


@pytest.mark.anyio
async def test_create_list_and_open_project(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory, suffix="one")
    token = await _login(client, user)
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post("/api/v1/projects", headers=headers, json={"title": "  第一部作品  "})
    listed = await client.get("/api/v1/projects", headers=headers)
    project_id = created.json()["data"]["id"]
    opened = await client.get(f"/api/v1/projects/{project_id}", headers=headers)

    assert created.status_code == 201, created.text
    assert created.json()["data"]["title"] == "第一部作品"
    assert created.json()["data"]["initial_document"]["title"] == "未命名文档"
    assert listed.json()["data"]["total"] == 1
    assert listed.json()["data"]["items"][0]["id"] == project_id
    assert opened.status_code == 200
    assert opened.json()["data"]["initial_document"]["id"] == created.json()["data"]["initial_document"]["id"]

    async with session_factory() as session:
        assert len((await session.exec(select(Project))).all()) == 1
        assert len((await session.exec(select(Document))).all()) == 1
        content = (await session.exec(select(DocumentContent))).one()
        assert content.content == ""
        assert content.version == 1


@pytest.mark.anyio
async def test_project_access_is_scoped_to_owner_and_soft_delete(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await _create_user(session_factory, suffix="owner")
    other = await _create_user(session_factory, suffix="other")
    owner_token = await _login(client, owner)
    other_token = await _login(client, other)

    created = await client.post(
        "/api/v1/projects",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"title": "私有作品"},
    )
    project_id = created.json()["data"]["id"]
    forbidden_lookup = await client.get(
        f"/api/v1/projects/{project_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    missing_lookup = await client.get(
        f"/api/v1/projects/{uuid7()}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    async with session_factory() as session:
        project = await session.get(Project, UUID(project_id))
        assert project is not None
        project.deleted_at = project.updated_at
        session.add(project)
        await session.commit()

    deleted_lookup = await client.get(
        f"/api/v1/projects/{project_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert forbidden_lookup.status_code == 404
    assert missing_lookup.status_code == 404
    assert deleted_lookup.status_code == 404


@pytest.mark.anyio
async def test_project_title_validation(client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]) -> None:
    user = await _create_user(session_factory, suffix="validation")
    token = await _login(client, user)
    headers = {"Authorization": f"Bearer {token}"}

    empty = await client.post("/api/v1/projects", headers=headers, json={"title": "   "})
    too_long = await client.post("/api/v1/projects", headers=headers, json={"title": "x" * 201})

    assert empty.status_code == 422
    assert too_long.status_code == 422
