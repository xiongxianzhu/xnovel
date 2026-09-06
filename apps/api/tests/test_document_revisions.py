"""版本回溯必须保护作者当前正文和作品权限。"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from tests.test_planning import _headers, _project, _user, client  # noqa: F401, F811


@pytest.mark.anyio
async def test_revision_restore_conflict_and_owner(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]  # noqa: F811
) -> None:
    owner = await _user(session_factory, "revision-owner")
    other = await _user(session_factory, "revision-other")
    headers = await _headers(client, owner)
    other_headers = await _headers(client, other)
    project = await _project(client, headers)
    base = f"/api/v1/projects/{project['id']}/documents/{project['initial_document']['id']}"
    saved = await client.put(
        f"{base}/content", headers=headers, json={"content": "初稿", "content_format": "plain_text", "version": 1}
    )
    assert saved.status_code == 200
    checkpoint = await client.post(
        f"{base}/revisions/checkpoints", headers=headers, json={"name": "修订前", "version": 2}
    )
    assert checkpoint.status_code == 201, checkpoint.text
    revision_id = checkpoint.json()["data"]["id"]
    await client.put(
        f"{base}/content", headers=headers, json={"content": "修改稿", "content_format": "plain_text", "version": 2}
    )
    revisions = (await client.get(f"{base}/revisions", headers=headers)).json()["data"]
    assert revisions["total"] == 2
    assert "content" not in revisions["items"][0]
    assert (await client.get(f"{base}/revisions/{revision_id}", headers=other_headers)).status_code == 404
    assert (
        await client.post(f"{base}/revisions/{revision_id}/restore", headers=headers, json={"version": 2})
    ).status_code == 409
    restored = await client.post(f"{base}/revisions/{revision_id}/restore", headers=headers, json={"version": 3})
    assert restored.status_code == 200, restored.text
    assert restored.json()["data"]["content"] == "初稿"
    assert restored.json()["data"]["version"] == 4
    revisions = (await client.get(f"{base}/revisions", headers=headers)).json()["data"]
    assert revisions["total"] == 3
    previous = await client.get(f"{base}/revisions/{revisions['items'][0]['id']}", headers=headers)
    assert previous.json()["data"]["content"] == "修改稿"
