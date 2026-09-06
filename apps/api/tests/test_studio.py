"""长篇资料的来源有效性、章节边界和作者控制。"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from tests.test_planning import _headers, _project, _user, client  # noqa: F401, F811


@pytest.mark.anyio
async def test_recall_sources_boundary_and_conflicts(
    client: AsyncClient,  # noqa: F811
    session_factory: async_sessionmaker[AsyncSession],  # noqa: F811
) -> None:
    owner = await _user(session_factory, "recall-owner")
    other = await _user(session_factory, "recall-other")
    headers = await _headers(client, owner)
    other_headers = await _headers(client, other)
    project = await _project(client, headers)
    project_id = project["id"]
    first = project["initial_document"]["id"]
    base = f"/api/v1/projects/{project_id}"
    second = (
        await client.post(f"{base}/documents", headers=headers, json={"title": "第二章", "kind": "manuscript"})
    ).json()["data"]["id"]
    summary = await client.post(
        f"{base}/studio/summaries",
        headers=headers,
        json={"title": "第一章前情", "body": "主人公抵达港口", "source_document_id": first, "source_version": 1},
    )
    assert summary.status_code == 201, summary.text
    assert summary.json()["data"]["source_stale"] is False
    third = (
        await client.post(f"{base}/documents", headers=headers, json={"title": "第三章", "kind": "manuscript"})
    ).json()["data"]["id"]
    await client.post(
        f"{base}/studio/summaries",
        headers=headers,
        json={"title": "未来前情", "body": "秘密揭示", "source_document_id": third},
    )
    for source, title, story_order in (
        (first, "早先事实", 1),
        (first, "事件在未来", 10),
        (second, "本章事实", 1),
        (third, "未来事实", 1),
    ):
        await client.post(
            f"{base}/studio/facts",
            headers=headers,
            json={"title": title, "source_document_id": source, "story_order": story_order},
        )
    constrained = (
        await client.get(f"{base}/studio/recall?document_id={second}&story_order=5", headers=headers)
    ).json()["data"]
    assert [item["title"] for item in constrained["facts"]] == ["早先事实"]
    recall_url = f"{base}/studio/recall?document_id={second}"
    recall = (await client.get(recall_url, headers=headers)).json()["data"]
    assert [item["title"] for item in recall["summaries"]] == ["第一章前情"]
    assert recall["stale_count"] == 0  # 追加后续章节不使前情失效。
    assert (await client.get(recall_url, headers=other_headers)).status_code == 404
    await client.put(
        f"{base}/documents/{first}/content",
        headers=headers,
        json={"content": "前文改为山村", "content_format": "plain_text", "version": 1},
    )
    recall = (await client.get(recall_url, headers=headers)).json()["data"]
    assert recall["summaries"][0]["source_stale"] is True
    old = summary.json()["data"]
    attempted = await client.put(
        f"{base}/studio/summaries/{old['id']}",
        headers=headers,
        json={
            "title": old["title"],
            "body": "旧版本不能确认",
            "source_document_id": first,
            "source_version": 1,
            "version": old["version"],
        },
    )
    assert attempted.status_code == 409
    other_project = await _project(client, headers, "另一作品")
    assert (
        await client.post(
            f"{base}/studio/facts",
            headers=headers,
            json={"title": "跨作品来源", "source_document_id": other_project["initial_document"]["id"]},
        )
    ).status_code == 404


@pytest.mark.anyio
async def test_records_crud_schedule_and_evidence(
    client: AsyncClient,  # noqa: F811
    session_factory: async_sessionmaker[AsyncSession],  # noqa: F811
) -> None:
    user = await _user(session_factory, "studio-records")
    headers = await _headers(client, user)
    project = await _project(client, headers)
    base = f"/api/v1/projects/{project['id']}/studio"
    document_id = project["initial_document"]["id"]
    for resource in ("facts", "threads", "events", "issues", "plans", "notes", "rules"):
        created = await client.post(f"{base}/{resource}", headers=headers, json={"title": f"{resource}记录"})
        assert created.status_code == 201, created.text
        data = created.json()["data"]
        listed = (await client.get(f"{base}/{resource}?page_size=1&q=记录", headers=headers)).json()["data"]
        assert listed["total"] == 1 and len(listed["items"]) == 1
        response = await client.put(
            f"{base}/{resource}/{data['id']}", headers=headers, json={"title": "修改后", "version": 1}
        )
        assert response.status_code == 200, response.text
        conflict = await client.put(
            f"{base}/{resource}/{data['id']}", headers=headers, json={"title": "过期编辑", "version": 1}
        )
        assert conflict.status_code == 409
        assert (await client.delete(f"{base}/{resource}/{data['id']}", headers=headers)).status_code == 200
    invalid = await client.post(
        f"{base}/issues", headers=headers, json={"title": "无出处证据", "evidence": "原文不存在"}
    )
    assert invalid.status_code == 409
    await client.put(
        f"/api/v1/projects/{project['id']}/documents/{document_id}/content",
        headers=headers,
        json={"content": "可交付的章节正文", "content_format": "plain_text", "version": 1},
    )
    plan = await client.post(
        f"{base}/plans",
        headers=headers,
        json={"title": "可交付", "source_document_id": document_id, "delivery_status": "ready"},
    )
    assert plan.status_code == 201, plan.text
    before = (await client.get(f"{base}/schedule", headers=headers)).json()["data"]
    assert before["estimated_days"] is None
    configured = await client.put(f"{base}/schedule", headers=headers, json={"chapters_per_week": 7})
    assert configured.json()["data"]["ready_chapters"] == 1
    assert configured.json()["data"]["estimated_days"] == 1

    await client.post(
        f"{base}/plans",
        headers=headers,
        json={"title": "发布记录", "source_document_id": document_id, "delivery_status": "published"},
    )
    published = (await client.get(f"{base}/schedule", headers=headers)).json()["data"]
    assert published["ready_chapters"] == 0
