"""管理员用户管理与审计查询 API 测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.main import app
from app.models.account import User, UserPreference
from app.models.site import AdminAuditEvent, SiteSetting
from app.services.identity import hash_password

PASSWORD = "correct horse battery staple"


@pytest.fixture
async def client(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncClient]:
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


async def _user(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    username: str,
    role: str = "user",
) -> User:
    async with session_factory() as session:
        user = User(
            username=username,
            email=f"{username}@example.com",
            password_hash=hash_password(PASSWORD),
            nickname=f"{username}昵称",
            role=role,
        )
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        if await session.get(SiteSetting, 1) is None:
            session.add(SiteSetting(id=1))
        await session.commit()
        return user


async def _headers(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"identifier": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


@pytest.mark.anyio
async def test_admin_user_crud_is_soft_delete_and_audited(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    admin = await _user(session_factory, username="management-admin", role="admin")
    headers = await _headers(client, admin)

    created = await client.post(
        "/api/admin/v1/users",
        headers=headers,
        json={
            "username": "new-writer",
            "email": "Writer@Example.COM",
            "nickname": "新作者",
            "password": "Temp!Pass9843",
            "role": "user",
        },
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["data"]["id"]
    assert created.json()["data"]["email_masked"] == "w***@example.com"

    listed = await client.get("/api/admin/v1/users", headers=headers, params={"query": "new-writer"})
    updated = await client.patch(
        f"/api/admin/v1/users/{user_id}",
        headers=headers,
        json={"nickname": "更新作者", "role": "admin"},
    )
    disabled = await client.delete(f"/api/admin/v1/users/{user_id}", headers=headers)

    assert listed.json()["data"]["total"] == 1
    assert updated.json()["data"]["nickname"] == "更新作者"
    assert updated.json()["data"]["role"] == "admin"
    assert disabled.json()["data"]["status"] == "disabled"
    async with session_factory() as session:
        user = await session.get(User, UUID(user_id))
        actions = [event.action for event in (await session.exec(select(AdminAuditEvent))).all()]
    assert user is not None
    assert user.status == "disabled"
    assert actions == ["user.created", "user.updated", "user.updated"]


@pytest.mark.anyio
async def test_admin_cannot_disable_self_and_regular_user_is_forbidden(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    admin = await _user(session_factory, username="self-admin", role="admin")
    writer = await _user(session_factory, username="plain-writer")
    admin_headers = await _headers(client, admin)
    writer_headers = await _headers(client, writer)

    self_disable = await client.delete(f"/api/admin/v1/users/{admin.id}", headers=admin_headers)
    forbidden = await client.get("/api/admin/v1/users", headers=writer_headers)

    assert self_disable.status_code == 409
    assert self_disable.json()["data"]["reason"] == "cannot_modify_self_access"
    assert forbidden.status_code == 403


@pytest.mark.anyio
async def test_admin_reads_login_and_operation_audits(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    admin = await _user(session_factory, username="audit-admin", role="admin")
    headers = await _headers(client, admin)
    async with session_factory() as session:
        session.add(
            AdminAuditEvent(
                actor_type="admin",
                admin_id=admin.id,
                action="example.changed",
                target_type="example",
                target_id="one",
                change_summary={"channel": "test"},
            )
        )
        await session.commit()

    login_audits = await client.get("/api/admin/v1/audit/login", headers=headers)
    operation_audits = await client.get(
        "/api/admin/v1/audit/operations",
        headers=headers,
        params={"action": "example"},
    )

    assert login_audits.status_code == 200
    assert login_audits.json()["data"]["items"][0]["username"] == "audit-admin"
    assert operation_audits.status_code == 200
    assert operation_audits.json()["data"]["items"][0]["action"] == "example.changed"
    assert operation_audits.json()["data"]["items"][0]["admin_username"] == "audit-admin"
