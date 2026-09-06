"""稿件工具不覆盖旧稿，检索保持作品隔离。"""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from tests.test_planning import _headers, _project, _user, client  # noqa: F401, F811


@pytest.mark.anyio
async def test_import_search_export_idempotency(
    client: AsyncClient,  # noqa: F811
    session_factory: async_sessionmaker[AsyncSession],  # noqa: F811
) -> None:
    owner = await _user(session_factory, "import-owner")
    other = await _user(session_factory, "import-other")
    headers = await _headers(client, owner)
    other_headers = await _headers(client, other)
    text = "第一章 港口\n主人公来到港口。\n第二章 秘密\n【待补】新的线索。"
    preview = await client.post(
        "/api/v1/manuscript-imports/preview",
        headers=headers,
        files={"file": ("旧稿.txt", text.encode("gb18030"), "text/plain")},
    )
    assert preview.status_code == 200, preview.text
    data = preview.json()["data"]
    assert data["encoding"] == "gb18030"
    assert len(data["chapters"]) == 2
    payload = {"request_id": str(uuid4()), "title": "导入作品", "chapters": data["chapters"]}
    imported = await client.post("/api/v1/manuscript-imports", headers=headers, json=payload)
    assert imported.status_code == 201, imported.text
    result = imported.json()["data"]
    repeated = await client.post("/api/v1/manuscript-imports", headers=headers, json=payload)
    assert repeated.json()["data"] == result
    base = f"/api/v1/projects/{result['project_id']}"
    found = await client.get(f"{base}/search?q=港口", headers=headers)
    assert found.status_code == 200, found.text
    assert found.json()["data"]["total"] == 1
    assert "港口" in found.json()["data"]["items"][0]["excerpt"]
    assert (await client.get(f"{base}/search?q=港口", headers=other_headers)).status_code == 404
    export = await client.post(f"{base}/export-preview", headers=headers, json={})
    assert export.status_code == 200, export.text
    assert len(export.json()["data"]["documents"]) == 2
    assert export.json()["data"]["warnings"][0]["kind"] == "placeholder"
    await client.post(f"{base}/studio/facts", headers=headers, json={"title": "私有设定", "body": "不应导出"})
    export = await client.post(f"{base}/export-preview", headers=headers, json={})
    assert "不应导出" not in export.json()["data"]["content"]
    other_project = await _project(client, headers)
    invalid = await client.post(
        f"{base}/export-preview", headers=headers, json={"document_ids": [other_project["initial_document"]["id"]]}
    )
    assert invalid.status_code == 409


@pytest.mark.parametrize("encoding", ["utf-8", "utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "gb18030"])
def test_import_supported_encodings_preserve_manuscript(encoding):
    from app.services.manuscript_tools import preview_import

    manuscript = """# 第一章
旧港与灯塔。
# 第二章
新的线索。"""
    preview = preview_import(manuscript.encode(encoding), "合成稿.md", encoding)
    assert [(chapter.title, chapter.content) for chapter in preview.chapters] == [
        ("第一章", "旧港与灯塔。"),
        ("第二章", "新的线索。"),
    ]
