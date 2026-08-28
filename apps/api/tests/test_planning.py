"""Phase 3 规划、设定、引用与导出测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.main import app
from app.models.account import User, UserPreference
from app.models.site import SiteSetting
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
    get_settings.cache_clear()


async def _user(session_factory: async_sessionmaker[AsyncSession], suffix: str) -> User:
    async with session_factory() as session:
        user = User(
            username=f"planner-{suffix}",
            email=f"planner-{suffix}@example.com",
            password_hash=hash_password(PASSWORD),
            nickname="作者",
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
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


async def _project(client: AsyncClient, headers: dict[str, str], title: str = "规划作品") -> dict:
    response = await client.post("/api/v1/projects", headers=headers, json={"title": title})
    assert response.status_code == 201, response.text
    return response.json()["data"]


@pytest.mark.anyio
async def test_character_crud_reorder_and_owner_boundary(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await _user(session_factory, "characters")
    other = await _user(session_factory, "characters-other")
    headers = await _headers(client, owner)
    other_headers = await _headers(client, other)
    project = await _project(client, headers)
    url = f"/api/v1/projects/{project['id']}/characters"

    first = await client.post(
        url,
        headers=headers,
        json={"name": " 沈砚 ", "aliases": ["阿砚", "阿砚"], "summary": "记者", "profile": {"年龄": "29"}},
    )
    second = await client.post(url, headers=headers, json={"name": "林雾", "aliases": [], "profile": {}})
    listed = await client.get(url, headers=headers)
    assert first.status_code == 201
    assert first.json()["data"]["name"] == "沈砚"
    assert first.json()["data"]["aliases"] == ["阿砚"]
    assert [item["name"] for item in listed.json()["data"]["items"]] == ["沈砚", "林雾"]

    items = listed.json()["data"]["items"]
    reordered = await client.post(
        f"{url}/reorder",
        headers=headers,
        json={
            "items": [
                {"id": items[1]["id"], "updated_at": items[1]["updated_at"]},
                {"id": items[0]["id"], "updated_at": items[0]["updated_at"]},
            ]
        },
    )
    assert [item["name"] for item in reordered.json()["data"]["items"]] == ["林雾", "沈砚"]

    updated = await client.patch(
        f"{url}/{first.json()['data']['id']}",
        headers=headers,
        json={"summary": "调查记者"},
    )
    stale = await client.post(f"{url}/reorder", headers=headers, json={"items": items})
    forbidden = await client.get(url, headers=other_headers)
    deleted = await client.delete(f"{url}/{second.json()['data']['id']}", headers=headers)
    after_delete = await client.get(url, headers=headers)

    assert updated.json()["data"]["summary"] == "调查记者"
    assert stale.status_code == 409
    assert stale.json()["data"]["reason"] == "planning_changed"
    assert forbidden.status_code == 404
    assert deleted.status_code == 200
    assert [(item["name"], item["position"]) for item in after_delete.json()["data"]["items"]] == [("沈砚", 0)]


@pytest.mark.anyio
async def test_world_entry_hierarchy_move_cycle_and_non_empty_delete(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _user(session_factory, "world")
    headers = await _headers(client, user)
    project = await _project(client, headers)
    url = f"/api/v1/projects/{project['id']}/world-entries"
    root = await client.post(
        url,
        headers=headers,
        json={"title": "雾城", "category": "location", "content": "常年多雾"},
    )
    child = await client.post(
        url,
        headers=headers,
        json={"title": "旧站", "category": "location", "parent_id": root.json()["data"]["id"]},
    )
    sibling = await client.post(url, headers=headers, json={"title": "守夜局", "category": "faction"})
    listed = await client.get(url, headers=headers)
    by_id = {item["id"]: item for item in listed.json()["data"]["items"]}

    cycle = await client.post(
        f"{url}/reorder",
        headers=headers,
        json={
            "entry_id": root.json()["data"]["id"],
            "target_parent_id": child.json()["data"]["id"],
            "groups": [{"parent_id": None, "items": []}],
        },
    )
    non_empty_delete = await client.delete(f"{url}/{root.json()['data']['id']}", headers=headers)
    moved = await client.post(
        f"{url}/reorder",
        headers=headers,
        json={
            "entry_id": sibling.json()["data"]["id"],
            "target_parent_id": root.json()["data"]["id"],
            "groups": [
                {
                    "parent_id": None,
                    "items": [
                        {
                            "id": root.json()["data"]["id"],
                            "updated_at": by_id[root.json()["data"]["id"]]["updated_at"],
                        }
                    ],
                },
                {
                    "parent_id": root.json()["data"]["id"],
                    "items": [
                        {
                            "id": child.json()["data"]["id"],
                            "updated_at": by_id[child.json()["data"]["id"]]["updated_at"],
                        },
                        {
                            "id": sibling.json()["data"]["id"],
                            "updated_at": by_id[sibling.json()["data"]["id"]]["updated_at"],
                        },
                    ],
                },
            ],
        },
    )

    assert cycle.status_code == 409
    assert cycle.json()["data"]["reason"] == "world_entry_cycle"
    assert non_empty_delete.status_code == 409
    assert non_empty_delete.json()["data"]["reason"] == "world_entry_not_empty"
    moved_by_id = {item["id"]: item for item in moved.json()["data"]["items"]}
    assert moved_by_id[sibling.json()["data"]["id"]]["parent_id"] == root.json()["data"]["id"]
    assert moved_by_id[sibling.json()["data"]["id"]]["position"] == 1


@pytest.mark.anyio
async def test_document_references_are_explicit_and_scoped(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _user(session_factory, "references")
    headers = await _headers(client, user)
    project = await _project(client, headers)
    project_id = project["id"]
    document_id = project["initial_document"]["id"]
    character = await client.post(
        f"/api/v1/projects/{project_id}/characters",
        headers=headers,
        json={"name": "沈砚"},
    )
    world = await client.post(
        f"/api/v1/projects/{project_id}/world-entries",
        headers=headers,
        json={"title": "雾城", "category": "location"},
    )
    references_url = f"/api/v1/projects/{project_id}/documents/{document_id}/references"
    saved = await client.put(
        references_url,
        headers=headers,
        json={
            "character_ids": [character.json()["data"]["id"]],
            "world_entry_ids": [world.json()["data"]["id"]],
        },
    )
    loaded = await client.get(references_url, headers=headers)

    other_project = await _project(client, headers, "其他作品")
    other_character = await client.post(
        f"/api/v1/projects/{other_project['id']}/characters",
        headers=headers,
        json={"name": "越界人物"},
    )
    cross_project = await client.put(
        references_url,
        headers=headers,
        json={"character_ids": [other_character.json()["data"]["id"]], "world_entry_ids": []},
    )
    outline = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "故事大纲", "kind": "outline", "parent_id": None},
    )
    outline_reference = await client.put(
        f"/api/v1/projects/{project_id}/documents/{outline.json()['data']['id']}/references",
        headers=headers,
        json={"character_ids": [], "world_entry_ids": []},
    )
    await client.delete(
        f"/api/v1/projects/{project_id}/characters/{character.json()['data']['id']}",
        headers=headers,
    )
    after_delete = await client.get(references_url, headers=headers)

    assert saved.status_code == 200
    assert loaded.json()["data"]["character_ids"] == [character.json()["data"]["id"]]
    assert loaded.json()["data"]["world_entry_ids"] == [world.json()["data"]["id"]]
    assert cross_project.status_code == 404
    assert outline_reference.status_code == 404
    assert after_delete.json()["data"]["character_ids"] == []


@pytest.mark.anyio
async def test_project_export_defaults_to_markdown_and_excludes_outlines(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await _user(session_factory, "export")
    other = await _user(session_factory, "export-other")
    headers = await _headers(client, owner)
    other_headers = await _headers(client, other)
    project = await _project(client, headers, "雾城：来信")
    project_id = project["id"]
    initial_id = project["initial_document"]["id"]
    await client.patch(
        f"/api/v1/projects/{project_id}/documents/{initial_id}",
        headers=headers,
        json={"title": "序章"},
    )
    await client.put(
        f"/api/v1/projects/{project_id}/documents/{initial_id}/content",
        headers=headers,
        json={"content": "雨夜归来。", "content_format": "plain_text", "version": 1},
    )
    folder = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "第一卷", "kind": "folder", "parent_id": None},
    )
    chapter = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "第一章", "kind": "manuscript", "parent_id": folder.json()["data"]["id"]},
    )
    await client.put(
        f"/api/v1/projects/{project_id}/documents/{chapter.json()['data']['id']}/content",
        headers=headers,
        json={"content": "信在长椅上。", "content_format": "plain_text", "version": 1},
    )
    outline = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "隐藏大纲", "kind": "outline", "parent_id": None},
    )
    await client.put(
        f"/api/v1/projects/{project_id}/documents/{outline.json()['data']['id']}/content",
        headers=headers,
        json={"content": "不能导出", "content_format": "plain_text", "version": 1},
    )

    markdown = await client.get(f"/api/v1/projects/{project_id}/export", headers=headers)
    plain = await client.get(
        f"/api/v1/projects/{project_id}/export",
        headers=headers,
        params={"format": "plain_text"},
    )
    forbidden = await client.get(f"/api/v1/projects/{project_id}/export", headers=other_headers)

    assert markdown.status_code == 200
    assert markdown.headers["content-type"].startswith("text/markdown")
    assert "filename*=UTF-8''" in markdown.headers["content-disposition"]
    assert markdown.text.index("序章") < markdown.text.index("第一卷") < markdown.text.index("第一章")
    assert "雨夜归来。" in markdown.text
    assert "信在长椅上。" in markdown.text
    assert "隐藏大纲" not in markdown.text
    assert "不能导出" not in markdown.text
    assert plain.headers["content-type"].startswith("text/plain")
    assert "【序章】" in plain.text
    assert forbidden.status_code == 404
