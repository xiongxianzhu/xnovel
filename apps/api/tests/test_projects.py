"""作品 API 测试。"""

from __future__ import annotations

import hashlib
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
from app.services.projects import count_document_words

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


@pytest.mark.anyio
async def test_document_tree_create_list_update_archive_restore_and_delete(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory, suffix="tree-crud")
    token = await _login(client, user)
    headers = {"Authorization": f"Bearer {token}"}
    created_project = await client.post("/api/v1/projects", headers=headers, json={"title": "树形作品"})
    project_id = created_project.json()["data"]["id"]
    initial = created_project.json()["data"]["initial_document"]

    folder = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": " 第一卷 ", "kind": "folder", "parent_id": None},
    )
    chapter = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "第一章", "kind": "manuscript", "parent_id": folder.json()["data"]["id"]},
    )
    outline = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "大纲", "kind": "outline", "parent_id": None},
    )
    invalid_kind = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "笔记", "kind": "note", "parent_id": None},
    )
    listed = await client.get(f"/api/v1/projects/{project_id}/documents", headers=headers)

    assert folder.status_code == 201
    assert folder.json()["data"]["title"] == "第一卷"
    assert chapter.status_code == 201
    assert outline.status_code == 201
    assert invalid_kind.status_code == 422
    assert [item["title"] for item in listed.json()["data"]["items"]] == ["未命名文档", "第一卷", "大纲", "第一章"]

    renamed = await client.patch(
        f"/api/v1/projects/{project_id}/documents/{chapter.json()['data']['id']}",
        headers=headers,
        json={"title": " 新的第一章 "},
    )
    non_empty_archive = await client.patch(
        f"/api/v1/projects/{project_id}/documents/{folder.json()['data']['id']}",
        headers=headers,
        json={"status": "archived"},
    )
    archived = await client.patch(
        f"/api/v1/projects/{project_id}/documents/{chapter.json()['data']['id']}",
        headers=headers,
        json={"status": "archived"},
    )
    archived_list = await client.get(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        params={"status": "archived"},
    )
    restored = await client.patch(
        f"/api/v1/projects/{project_id}/documents/{chapter.json()['data']['id']}",
        headers=headers,
        json={"status": "active"},
    )
    deleted = await client.delete(
        f"/api/v1/projects/{project_id}/documents/{chapter.json()['data']['id']}",
        headers=headers,
    )
    deleted_folder = await client.delete(
        f"/api/v1/projects/{project_id}/documents/{folder.json()['data']['id']}",
        headers=headers,
    )
    last_manuscript_archive = await client.patch(
        f"/api/v1/projects/{project_id}/documents/{initial['id']}",
        headers=headers,
        json={"status": "archived"},
    )
    last_manuscript_delete = await client.delete(
        f"/api/v1/projects/{project_id}/documents/{initial['id']}",
        headers=headers,
    )

    assert renamed.json()["data"]["title"] == "新的第一章"
    assert non_empty_archive.status_code == 409
    assert non_empty_archive.json()["data"]["reason"] == "folder_not_empty"
    assert archived.status_code == 200
    assert [item["id"] for item in archived_list.json()["data"]["items"]] == [chapter.json()["data"]["id"]]
    assert restored.status_code == 200
    assert deleted.status_code == 200
    assert deleted_folder.status_code == 200
    assert last_manuscript_archive.status_code == 409
    assert last_manuscript_archive.json()["data"]["reason"] == "last_active_manuscript"
    assert last_manuscript_delete.status_code == 409
    assert last_manuscript_delete.json()["data"]["reason"] == "last_active_manuscript"

    async with session_factory() as session:
        contents = list((await session.exec(select(DocumentContent))).all())
        assert len(contents) == 3


@pytest.mark.anyio
async def test_document_tree_reorders_with_complete_sibling_groups_and_rejects_cycles(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user = await _create_user(session_factory, suffix="tree-order")
    token = await _login(client, user)
    headers = {"Authorization": f"Bearer {token}"}
    project = await client.post("/api/v1/projects", headers=headers, json={"title": "排序作品"})
    project_id = project.json()["data"]["id"]
    initial = project.json()["data"]["initial_document"]
    folder_response = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "卷", "kind": "folder", "parent_id": None},
    )
    folder = folder_response.json()["data"]
    chapter_response = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "章", "kind": "manuscript", "parent_id": None},
    )
    chapter = chapter_response.json()["data"]
    child_folder_response = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "子目录", "kind": "folder", "parent_id": folder["id"]},
    )
    child_folder = child_folder_response.json()["data"]
    invalid_parent = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": "非法子节点", "kind": "manuscript", "parent_id": initial["id"]},
    )
    other_project = await client.post("/api/v1/projects", headers=headers, json={"title": "另一部作品"})
    other_folder_response = await client.post(
        f"/api/v1/projects/{other_project.json()['data']['id']}/documents",
        headers=headers,
        json={"title": "其他目录", "kind": "folder", "parent_id": None},
    )
    cross_project_move = await client.post(
        f"/api/v1/projects/{project_id}/documents/reorder",
        headers=headers,
        json={
            "document_id": chapter["id"],
            "target_parent_id": other_folder_response.json()["data"]["id"],
            "groups": [{"parent_id": None, "items": []}],
        },
    )

    assert invalid_parent.status_code == 409
    assert invalid_parent.json()["data"]["reason"] == "invalid_parent"
    assert cross_project_move.status_code == 404

    active = await client.get(f"/api/v1/projects/{project_id}/documents", headers=headers)
    by_id = {item["id"]: item for item in active.json()["data"]["items"]}
    reordered = await client.post(
        f"/api/v1/projects/{project_id}/documents/reorder",
        headers=headers,
        json={
            "document_id": chapter["id"],
            "target_parent_id": None,
            "groups": [
                {
                    "parent_id": None,
                    "items": [
                        {"id": chapter["id"], "updated_at": by_id[chapter["id"]]["updated_at"]},
                        {"id": initial["id"], "updated_at": by_id[initial["id"]]["updated_at"]},
                        {"id": folder["id"], "updated_at": by_id[folder["id"]]["updated_at"]},
                    ],
                }
            ],
        },
    )
    assert reordered.status_code == 200, reordered.text
    root_items = [item for item in reordered.json()["data"]["items"] if item["parent_id"] is None]
    assert [(item["id"], item["position"]) for item in root_items] == [
        (chapter["id"], 0),
        (initial["id"], 1),
        (folder["id"], 2),
    ]

    refreshed = {item["id"]: item for item in reordered.json()["data"]["items"]}
    moved = await client.post(
        f"/api/v1/projects/{project_id}/documents/reorder",
        headers=headers,
        json={
            "document_id": initial["id"],
            "target_parent_id": folder["id"],
            "groups": [
                {
                    "parent_id": None,
                    "items": [
                        {"id": chapter["id"], "updated_at": refreshed[chapter["id"]]["updated_at"]},
                        {"id": folder["id"], "updated_at": refreshed[folder["id"]]["updated_at"]},
                    ],
                },
                {
                    "parent_id": folder["id"],
                    "items": [
                        {"id": child_folder["id"], "updated_at": refreshed[child_folder["id"]]["updated_at"]},
                        {"id": initial["id"], "updated_at": refreshed[initial["id"]]["updated_at"]},
                    ],
                },
            ],
        },
    )
    assert moved.status_code == 200, moved.text
    assert {item["id"]: item["parent_id"] for item in moved.json()["data"]["items"]}[initial["id"]] == folder["id"]

    cycle = await client.post(
        f"/api/v1/projects/{project_id}/documents/reorder",
        headers=headers,
        json={
            "document_id": folder["id"],
            "target_parent_id": child_folder["id"],
            "groups": [{"parent_id": None, "items": []}, {"parent_id": child_folder["id"], "items": []}],
        },
    )
    assert cycle.status_code == 409
    assert cycle.json()["data"]["reason"] == "tree_cycle"


@pytest.mark.anyio
async def test_document_tree_rejects_stale_order_and_cross_owner_access(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await _create_user(session_factory, suffix="tree-owner")
    other = await _create_user(session_factory, suffix="tree-other")
    owner_token = await _login(client, owner)
    other_token = await _login(client, other)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}
    project = await client.post("/api/v1/projects", headers=owner_headers, json={"title": "私有文档树"})
    project_id = project.json()["data"]["id"]
    initial = project.json()["data"]["initial_document"]
    second_response = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=owner_headers,
        json={"title": "第二章", "kind": "manuscript", "parent_id": None},
    )
    second = second_response.json()["data"]
    snapshot = await client.get(f"/api/v1/projects/{project_id}/documents", headers=owner_headers)
    by_id = {item["id"]: item for item in snapshot.json()["data"]["items"]}
    await client.patch(
        f"/api/v1/projects/{project_id}/documents/{second['id']}",
        headers=owner_headers,
        json={"title": "已变化"},
    )

    stale = await client.post(
        f"/api/v1/projects/{project_id}/documents/reorder",
        headers=owner_headers,
        json={
            "document_id": second["id"],
            "target_parent_id": None,
            "groups": [
                {
                    "parent_id": None,
                    "items": [
                        {"id": second["id"], "updated_at": by_id[second["id"]]["updated_at"]},
                        {"id": initial["id"], "updated_at": by_id[initial["id"]]["updated_at"]},
                    ],
                }
            ],
        },
    )
    forbidden_list = await client.get(f"/api/v1/projects/{project_id}/documents", headers=other_headers)
    forbidden_update = await client.patch(
        f"/api/v1/projects/{project_id}/documents/{initial['id']}",
        headers=other_headers,
        json={"title": "越权"},
    )

    assert stale.status_code == 409
    assert stale.json()["data"]["reason"] == "tree_changed"
    assert forbidden_list.status_code == 404
    assert forbidden_update.status_code == 404


def test_document_word_count_is_deterministic_for_cjk_and_unicode_words() -> None:
    assert count_document_words("") == 0
    assert count_document_words("第一章 Hello world 123!") == 6
    assert count_document_words("café déjà-vu") == 3
    assert count_document_words("标点，。！？") == 2


@pytest.mark.anyio
async def test_document_content_read_save_conflict_and_access_boundaries(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await _create_user(session_factory, suffix="content-owner")
    other = await _create_user(session_factory, suffix="content-other")
    owner_token = await _login(client, owner)
    other_token = await _login(client, other)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}
    project_response = await client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"title": "短篇"},
    )
    project = project_response.json()["data"]
    project_id = project["id"]
    document_id = project["initial_document"]["id"]
    content_url = f"/api/v1/projects/{project_id}/documents/{document_id}/content"

    initial = await client.get(content_url, headers=owner_headers)
    saved = await client.put(
        content_url,
        headers=owner_headers,
        json={"content": "第一章 Hello world 123!", "content_format": "plain_text", "version": 1},
    )
    stale = await client.put(
        content_url,
        headers=owner_headers,
        json={"content": "过期内容", "content_format": "plain_text", "version": 1},
    )
    reread = await client.get(content_url, headers=owner_headers)
    invalid_format = await client.put(
        content_url,
        headers=owner_headers,
        json={"content": "# Markdown", "content_format": "markdown", "version": 2},
    )
    invalid_version = await client.put(
        content_url,
        headers=owner_headers,
        json={"content": "非法版本", "content_format": "plain_text", "version": 0},
    )
    forbidden = await client.get(content_url, headers=other_headers)

    folder = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=owner_headers,
        json={"title": "目录", "kind": "folder", "parent_id": None},
    )
    folder_content = await client.get(
        f"/api/v1/projects/{project_id}/documents/{folder.json()['data']['id']}/content",
        headers=owner_headers,
    )

    assert initial.status_code == 200
    assert initial.json()["data"]["content"] == ""
    assert initial.json()["data"]["version"] == 1
    assert saved.status_code == 200
    assert saved.json()["data"]["version"] == 2
    assert saved.json()["data"]["word_count"] == 6
    assert saved.json()["data"]["checksum"] == hashlib.sha256("第一章 Hello world 123!".encode()).hexdigest()
    assert stale.status_code == 409
    assert stale.json()["data"]["reason"] == "content_version_conflict"
    assert reread.json()["data"]["content"] == "第一章 Hello world 123!"
    assert reread.json()["data"]["version"] == 2
    assert invalid_format.status_code == 422
    assert invalid_version.status_code == 422
    assert forbidden.status_code == 404
    assert folder_content.status_code == 404

    async with session_factory() as session:
        stored_project = await session.get(Project, UUID(project_id))
        stored_document = await session.get(Document, UUID(document_id))
        stored_content = await session.get(DocumentContent, UUID(document_id))
        assert stored_project is not None
        assert stored_document is not None
        assert stored_content is not None
        assert stored_content.updated_by == owner.id
        assert stored_document.updated_at == stored_content.updated_at
        assert stored_project.updated_at is not None
        assert stored_document.updated_at is not None
        assert stored_project.updated_at >= stored_document.updated_at
