"""批量任务应幂等、保留已完成项，并在重启后等待作者恢复。"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlmodel import col, select

from app.models.ai import AIResult, AITask
from app.models.ai_batch import AIBatch, AIBatchItem
from app.models.document_content import DocumentContent
from app.models.document_revision import DocumentRevision
from app.models.studio import ChapterSummary
from app.schemas.ai_batches import BatchRequest
from app.services import ai_batches
from app.services.ai_batches import batch_action, create_batch, recover_batches, run_batch, split_text
from app.services.document_revisions import capture_revision
from app.services.studio_maintenance import cleanup_history
from tests.test_ai_tasks import _settings, _setup


def test_chunking_preserves_all_text() -> None:
    text = ("第一段。\n\n第二段特别长。" * 100) + "结尾"
    parts = split_text(text, 80)
    assert "".join(parts) == text
    assert all(len(part) <= 80 for part in parts)


@pytest.mark.anyio
async def test_batch_idempotency_completion_and_explicit_restart(session_factory, tmp_path, monkeypatch) -> None:
    settings = _settings(tmp_path / "skills")
    monkeypatch.setattr(ai_batches, "get_settings", lambda: settings)
    monkeypatch.setattr(ai_batches, "async_session_factory", session_factory)
    calls = []

    async def fake_call(session, batch, item, text, instruction):
        calls.append(item.document_id)
        return "主人公到达港口，等待线人。", uuid4()

    monkeypatch.setattr(ai_batches, "_call_model", fake_call)
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        payload = BatchRequest(
            request_id=uuid4(),
            project_id=project.id,
            document_ids=[project.initial_document.id],
            provider_config_id=provider.id,
        )
        batch = await create_batch(session, user.id, payload)
        duplicate = await create_batch(session, user.id, payload)
        assert duplicate.id == batch.id
        batch_id = batch.id
    await run_batch(batch_id)
    await run_batch(batch_id)
    assert len(calls) == 1
    async with session_factory() as session:
        batch = await session.get(AIBatch, batch_id)
        assert batch.status == "completed"
        summaries = (await session.exec(select(ChapterSummary))).all()
        assert len(summaries) == 1 and summaries[0].status == "candidate"
        content = await session.get(DocumentContent, project.initial_document.id)
        assert content.content == ""  # 生成摘要不能覆盖正文。
        await batch_action(session, user.id, batch_id, "retry_failed")
    await run_batch(batch_id)
    assert len(calls) == 1  # 已成功章节不重复付费调用。
    async with session_factory() as session:
        next_batch = await create_batch(session, user.id, payload.model_copy(update={"request_id": uuid4()}))
        item = (await session.exec(select(AIBatchItem).where(col(AIBatchItem.batch_id) == next_batch.id))).one()
        next_batch.status = "running"
        item.status = "running"
        session.add(next_batch)
        session.add(item)
        await session.commit()
        next_id = next_batch.id
    await recover_batches()
    async with session_factory() as session:
        recovered = await session.get(AIBatch, next_id)
        item = (await session.exec(select(AIBatchItem).where(col(AIBatchItem.batch_id) == next_id))).one()
        assert recovered.status == "paused"
        assert item.status == "failed" and item.error_code == "AI_PROCESS_RESTARTED"
    assert len(calls) == 1


@pytest.mark.anyio
async def test_stale_batch_source_does_not_call_provider(session_factory, tmp_path, monkeypatch) -> None:
    settings = _settings(tmp_path / "skills")
    monkeypatch.setattr(ai_batches, "get_settings", lambda: settings)
    monkeypatch.setattr(ai_batches, "async_session_factory", session_factory)
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        batch = await create_batch(
            session,
            user.id,
            BatchRequest(
                request_id=uuid4(),
                project_id=project.id,
                document_ids=[project.initial_document.id],
                provider_config_id=provider.id,
            ),
        )
        content = await session.get(DocumentContent, project.initial_document.id)
        content.version += 1
        session.add(content)
        await session.commit()
        batch_id = batch.id
    await run_batch(batch_id)
    async with session_factory() as session:
        item = (await session.exec(select(AIBatchItem).where(col(AIBatchItem.batch_id) == batch_id))).one()
        assert item.status == "stale"
        assert item.task_id is None


@pytest.mark.anyio
async def test_history_cleanup_retains_named_and_pinned(session_factory, tmp_path) -> None:
    settings = _settings(tmp_path / "skills")
    old = datetime.now(UTC) - timedelta(days=200)
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        content = await session.get(DocumentContent, project.initial_document.id)
        revision = await capture_revision(session, content, "作者检查点")
        revision.created_at = old
        revision.updated_at = old
        session.add(revision)
        ordinary = AITask(
            owner_id=user.id,
            project_id=project.id,
            document_id=content.document_id,
            provider_config_id=provider.id,
            task_type="brainstorm",
            provider="test",
            model="test",
            instruction="测试",
            status="succeeded",
            created_at=old,
            updated_at=old,
        )
        pinned = AITask(
            owner_id=user.id,
            project_id=project.id,
            document_id=content.document_id,
            provider_config_id=provider.id,
            task_type="brainstorm",
            provider="test",
            model="test",
            instruction="测试",
            status="succeeded",
            created_at=old,
            updated_at=old,
        )
        session.add(ordinary)
        session.add(pinned)
        await session.flush()
        session.add(
            AIResult(
                project_id=project.id,
                task_id=pinned.id,
                content="收藏候选",
                pinned=True,
                created_at=old,
                updated_at=old,
            )
        )
        await session.commit()
        ids = (revision.id, ordinary.id, pinned.id)
    async with session_factory() as session:
        await cleanup_history(session)
        assert await session.get(DocumentRevision, ids[0]) is not None
        assert await session.get(AITask, ids[1]) is None
        assert await session.get(AITask, ids[2]) is not None


@pytest.mark.anyio
async def test_partial_failure_retry_and_cancel_preserve_completed_items(session_factory, tmp_path, monkeypatch):
    from app.schemas.projects import DocumentCreateRequest
    from app.services.projects import create_document

    settings = _settings(tmp_path / "skills")
    monkeypatch.setattr(ai_batches, "get_settings", lambda: settings)
    monkeypatch.setattr(ai_batches, "async_session_factory", session_factory)
    calls = []
    fail = True
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        second = await create_document(
            session,
            owner_id=user.id,
            project_id=project.id,
            payload=DocumentCreateRequest(title="第二章", kind="manuscript"),
        )
        payload = BatchRequest(
            request_id=uuid4(),
            project_id=project.id,
            document_ids=[project.initial_document.id, second.id],
            provider_config_id=provider.id,
        )
        batch = await create_batch(session, user.id, payload)
        batch_id = batch.id

    async def fake_call(session, batch, item, text, instruction):
        calls.append(item.document_id)
        if item.document_id == second.id and fail:
            raise ValueError("synthetic provider failure")
        return "经作者审核的候选摘要", uuid4()

    monkeypatch.setattr(ai_batches, "_call_model", fake_call)
    await run_batch(batch_id)
    async with session_factory() as session:
        items = (
            await session.exec(
                select(AIBatchItem).where(col(AIBatchItem.batch_id) == batch_id).order_by(AIBatchItem.position)
            )
        ).all()
        assert [item.status for item in items] == ["succeeded", "failed"]
        await batch_action(session, user.id, batch_id, "retry_failed")
    fail = False
    await run_batch(batch_id)
    assert calls.count(project.initial_document.id) == 1
    assert calls.count(second.id) == 2
    async with session_factory() as session:
        cancelled = await create_batch(session, user.id, payload.model_copy(update={"request_id": uuid4()}))
        await batch_action(session, user.id, cancelled.id, "cancel")
        cancelled_id = cancelled.id
    await run_batch(cancelled_id)
    assert len(calls) == 3


@pytest.mark.anyio
async def test_analysis_rejects_fabricated_evidence(session_factory, tmp_path, monkeypatch):
    from app.models.studio import ContinuityIssue

    settings = _settings(tmp_path / "skills")
    monkeypatch.setattr(ai_batches, "get_settings", lambda: settings)
    monkeypatch.setattr(ai_batches, "async_session_factory", session_factory)

    async def fabricated(session, batch, item, text, instruction):
        return (
            '{"issues":[{"title":"疑点","explanation":"推断","evidence":"凭空出现的原句",'
            + '"other_document_id":"'
            + str(item.document_id)
            + '","other_evidence":"另一条虚构原句"}]}',
            uuid4(),
        )

    monkeypatch.setattr(ai_batches, "_call_model", fabricated)
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        batch = await create_batch(
            session,
            user.id,
            BatchRequest(
                request_id=uuid4(),
                project_id=project.id,
                document_ids=[project.initial_document.id],
                provider_config_id=provider.id,
                task_type="consistency",
            ),
        )
        batch_id = batch.id
    await run_batch(batch_id)
    async with session_factory() as session:
        item = (await session.exec(select(AIBatchItem).where(col(AIBatchItem.batch_id) == batch_id))).one()
        assert item.status == "failed" and item.error_code == "analysis_evidence_invalid"
        assert not (await session.exec(select(ContinuityIssue))).all()
