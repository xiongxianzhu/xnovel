"""持久化批次、逐章执行与显式恢复；重启不自动重复付费调用。"""

import asyncio
import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import APIException
from app.db.session import async_session_factory
from app.models.ai import AITask
from app.models.ai_batch import AIBatch, AIBatchItem
from app.models.document_content import DocumentContent
from app.models.studio import ChapterSummary, ContinuityIssue
from app.schemas.ai import AITaskCreateRequest
from app.schemas.ai_batches import AnalysisResult, BatchData, BatchItemData, BatchPreview, BatchRequest
from app.services.ai_context import build_ai_context, estimate_tokens
from app.services.ai_tasks import _model, cancel_ai_task, create_ai_task, get_ai_task, schedule_ai_task
from app.services.projects import _conflict, _not_found, _owned_project
from app.services.providers import get_provider_config
from app.services.studio_records import source_order_hash, source_state

_RUNNERS: dict[UUID, asyncio.Task[None]] = {}
_OWNER_LOCKS: dict[UUID, asyncio.Lock] = {}


async def batch_data(session: AsyncSession, batch: AIBatch) -> BatchData:
    items = (
        await session.exec(
            select(AIBatchItem).where(col(AIBatchItem.batch_id) == batch.id).order_by(col(AIBatchItem.position))
        )
    ).all()
    return BatchData.model_validate(
        {**batch.model_dump(), "items": [BatchItemData.model_validate(row, from_attributes=True) for row in items]}
    )


async def owned_batch(session: AsyncSession, owner_id: UUID, batch_id: UUID) -> AIBatch:
    batch = await session.get(AIBatch, batch_id)
    if batch is None or batch.owner_id != owner_id:
        raise _not_found()
    await _owned_project(session, owner_id=owner_id, project_id=batch.project_id)
    return batch


async def preview_batch(session: AsyncSession, owner_id: UUID, payload: BatchRequest) -> BatchPreview:
    await _owned_project(session, owner_id=owner_id, project_id=payload.project_id)
    settings = get_settings()
    config = await get_provider_config(
        session, owner_id=owner_id, config_id=payload.provider_config_id, settings=settings
    )
    model = await _model(session, config, payload.model_id)
    docs, _, _, order = await source_state(session, payload.project_id)
    if any(item not in order or docs[item].kind != "manuscript" for item in payload.document_ids):
        raise _not_found()
    contents = (
        await session.exec(select(DocumentContent).where(col(DocumentContent.document_id).in_(payload.document_ids)))
    ).all()
    if not config.enabled:
        raise _conflict("provider_disabled")
    budget = model.context_window - min(2048, model.max_output_tokens) - 1024 - estimate_tokens(payload.instruction)
    by_id = {row.document_id: row for row in contents}
    selected_order = [key for key in order if key in by_id]
    estimated = segmented = 0
    for index, key in enumerate(selected_order):
        reference_tokens = (
            sum(estimate_tokens(by_id[other].content) for other in selected_order[max(0, index - 2) : index])
            if payload.use_recall
            else 0
        )
        room = budget - reference_tokens
        if room < 128:
            raise _conflict("batch_context_too_large")
        tokens = estimate_tokens(by_id[key].content)
        parts = max(1, (tokens + room - 1) // room)
        estimated += tokens + parts * (reference_tokens + 512 + estimate_tokens(payload.instruction))
        segmented += parts > 1
    return BatchPreview(
        document_count=len(contents),
        estimated_input_tokens=estimated,
        segmented_documents=segmented,
        source_titles=[docs[item].title for item in payload.document_ids],
    )


async def create_batch(session: AsyncSession, owner_id: UUID, payload: BatchRequest) -> AIBatch:
    digest = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
    await _owned_project(session, owner_id=owner_id, project_id=payload.project_id, lock=True)
    previous = (
        await session.exec(
            select(AIBatch).where(col(AIBatch.owner_id) == owner_id, col(AIBatch.request_id) == payload.request_id)
        )
    ).one_or_none()
    if previous:
        if previous.request_hash != digest:
            raise _conflict("batch_request_changed")
        return previous
    await preview_batch(session, owner_id, payload)
    _, versions, _, order = await source_state(session, payload.project_id)
    now = datetime.now(UTC)
    batch = AIBatch(
        owner_id=owner_id,
        project_id=payload.project_id,
        request_id=payload.request_id,
        request_hash=digest,
        provider_config_id=payload.provider_config_id,
        model_id=payload.model_id,
        task_type=payload.task_type,
        instruction=payload.instruction,
        use_recall=payload.use_recall,
        created_at=now,
        updated_at=now,
    )
    session.add(batch)
    await session.flush()
    for position, document_id in enumerate(payload.document_ids):
        session.add(
            AIBatchItem(
                batch_id=batch.id,
                document_id=document_id,
                document_version=versions[document_id],
                source_order=source_order_hash(order, document_id),
                position=position,
                created_at=now,
                updated_at=now,
            )
        )
    await session.commit()
    await session.refresh(batch)
    return batch


def schedule_batch(batch_id: UUID) -> None:
    if batch_id in _RUNNERS:
        return
    task = asyncio.create_task(run_batch(batch_id))
    _RUNNERS[batch_id] = task
    task.add_done_callback(lambda _: _RUNNERS.pop(batch_id, None))


def split_text(text: str, limit: int) -> list[str]:
    """优先在段落边界拆分，所有字符恰好保留一次。"""
    parts = []
    while len(text) > limit:
        at = text.rfind("\n", 0, limit)
        at = at + 1 if at >= limit // 2 else limit
        parts.append(text[:at])
        text = text[at:]
    parts.append(text)
    return parts


async def _call_model(
    session: AsyncSession, batch: AIBatch, item: AIBatchItem, text: str, instruction: str
) -> tuple[str, UUID]:
    await session.refresh(batch)
    if batch.status not in {"running", "queued"}:
        raise asyncio.CancelledError
    await session.refresh(batch)
    if batch.status != "running":
        raise asyncio.CancelledError
    settings = get_settings()
    while True:
        running = (
            await session.exec(
                select(func.count())
                .select_from(AITask)
                .where(col(AITask.owner_id) == batch.owner_id, col(AITask.status) == "running")
            )
        ).one()
        if running < settings.ai_max_concurrency_per_user:
            break
        await asyncio.sleep(0.25)
        await session.refresh(batch)
        if batch.status != "running":
            raise asyncio.CancelledError
    request = AITaskCreateRequest(
        project_id=batch.project_id,
        document_id=item.document_id,
        provider_config_id=batch.provider_config_id,
        model_id=batch.model_id,
        task_type=batch.task_type,
        instruction=instruction,
        selected_text=text,
        max_output_tokens=2048,
    )
    task, execution = await create_ai_task(session, owner_id=batch.owner_id, payload=request, settings=settings)
    item.task_id = task.id
    session.add(item)
    await session.commit()
    await schedule_ai_task(execution)
    finished = await get_ai_task(session, owner_id=batch.owner_id, task_id=task.id)
    if finished.status != "succeeded" or not finished.results:
        raise _conflict(finished.error_code or "batch_generation_failed")
    return finished.results[0].content, task.id


async def _process_item(session: AsyncSession, batch: AIBatch, item: AIBatchItem) -> None:
    docs, versions, _, order = await source_state(session, batch.project_id)
    if (
        item.document_id not in order
        or versions.get(item.document_id) != item.document_version
        or source_order_hash(order, item.document_id) != item.source_order
    ):
        item.status = "stale"
        item.error_code = "source_version_conflict"
        return
    content = await session.get(DocumentContent, item.document_id)
    if content is None:
        raise _not_found()
    source_body = content.content
    allowed_sources = {item.document_id: source_body}
    source_versions = {item.document_id: item.document_version}
    related = ""
    if batch.use_recall:
        selected_ids = set(
            (await session.exec(select(AIBatchItem.document_id).where(col(AIBatchItem.batch_id) == batch.id))).all()
        )
        preceding = [
            key
            for key in order[: order.index(item.document_id)]
            if key in selected_ids and docs[key].kind == "manuscript"
        ][-2:]
        for key in preceding:
            other = await session.get(DocumentContent, key)
            if other:
                allowed_sources[key] = other.content
                source_versions[key] = other.version
                related += f'\n<source document_id="{key}">\n{other.content}\n</source>\n'
    if batch.task_type == "summary":
        instruction = (
            "请为给出的章节正文生成简明前情摘要，只记录正文已发生的事实，不添加未来计划。保留人物、地点、状态变化与未完成线索。\n"
            + batch.instruction
        )
    else:
        instruction = (
            '检查当前章节与提供来源之间的实际矛盾。只返回 JSON：{"issues":[{"title":"疑点",'
            '"explanation":"理由或有意安排的可能性","evidence":"当前章节逐字引文",'
            '"other_document_id":"另一个来源的UUID","other_evidence":"另一处逐字引文"}]}。'
            "无确切双方证据时返回空 issues，不编造引用；最多20项。\n" + batch.instruction
        )
    settings = get_settings()
    config = await get_provider_config(
        session, owner_id=batch.owner_id, config_id=batch.provider_config_id, settings=settings
    )
    model = await _model(session, config, batch.model_id)
    base = AITaskCreateRequest(
        project_id=batch.project_id,
        document_id=item.document_id,
        provider_config_id=batch.provider_config_id,
        model_id=batch.model_id,
        task_type=batch.task_type,
        instruction=instruction,
        selected_text=related,
        max_output_tokens=2048,
    )
    output = min(2048, model.max_output_tokens, 8192)
    built = await build_ai_context(
        session,
        owner_id=batch.owner_id,
        payload=base,
        context_window=model.context_window,
        output_tokens=output,
        settings=settings,
    )
    room = model.context_window - output - 512 - int(built.manifest["estimated_input_tokens"]) - 100
    if room < 128:
        raise _conflict("batch_context_too_large")
    limit = min(12000, room // 2)
    outputs: list[str] = []
    final_task: UUID | None = None
    for part in split_text(source_body, limit):
        output_text, final_task = await _call_model(
            session,
            batch,
            item,
            f'<current document_id="{item.document_id}">\n{part}\n</current>\n{related}',
            instruction,
        )
        outputs.append(output_text)
    if batch.task_type == "summary":
        while len(outputs) > 1:
            joined = "\n\n".join(outputs)
            pieces = split_text(joined, limit)
            merged = []
            for part in pieces:
                text, final_task = await _call_model(
                    session, batch, item, part, "将这些局部摘要合并为不超过500字的章节前情，保留关键事实，不添加信息。"
                )
                merged.append(text)
            if len(merged) >= len(outputs) and len(pieces) > 1:
                raise _conflict("batch_summary_did_not_converge")
            outputs = merged
    await session.refresh(batch)
    if batch.status != "running":
        raise asyncio.CancelledError
    _, current_versions, _, current_order = await source_state(session, batch.project_id)
    if (
        any(current_versions.get(key) != version for key, version in source_versions.items())
        or source_order_hash(current_order, item.document_id) != item.source_order
    ):
        item.status = "stale"
        item.error_code = "source_version_conflict"
        return
    now = datetime.now(UTC)
    if batch.task_type == "summary":
        if not outputs[0].strip() or len(outputs[0]) > 20000:
            raise _conflict("batch_summary_too_large")
        summary = ChapterSummary(
            project_id=batch.project_id,
            title=docs[item.document_id].title,
            body=outputs[0],
            source_document_id=item.document_id,
            source_version=item.document_version,
            source_order=item.source_order,
            status="candidate",
            ai_task_id=final_task,
            created_at=now,
            updated_at=now,
        )
        session.add(summary)
        item.result_id = summary.id
    else:
        validated = []
        for output_text in outputs:
            raw = output_text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            analysis = AnalysisResult.model_validate(json.loads(raw))
            for issue in analysis.issues:
                if (
                    issue.evidence not in source_body
                    or issue.other_document_id not in allowed_sources
                    or issue.other_evidence not in allowed_sources[issue.other_document_id]
                ):
                    raise _conflict("analysis_evidence_invalid")
                validated.append(issue)
        for issue in validated:
            record = ContinuityIssue(
                project_id=batch.project_id,
                title=issue.title,
                body=issue.explanation,
                source_document_id=item.document_id,
                source_version=item.document_version,
                source_order=item.source_order,
                other_document_id=issue.other_document_id,
                other_version=source_versions[issue.other_document_id],
                evidence=issue.evidence,
                other_evidence=issue.other_evidence,
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            item.result_id = record.id
    item.status = "succeeded"
    item.error_code = None


async def run_batch(batch_id: UUID) -> None:
    async with async_session_factory() as session:
        batch = await session.get(AIBatch, batch_id)
        if batch is None:
            return
        async with _OWNER_LOCKS.setdefault(batch.owner_id, asyncio.Lock()):
            await session.refresh(batch)
            if batch.status != "queued":
                return
            batch.status = "running"
            session.add(batch)
            await session.commit()
            ids = list(
                (
                    await session.exec(
                        select(AIBatchItem.id)
                        .where(col(AIBatchItem.batch_id) == batch_id, col(AIBatchItem.status) == "queued")
                        .order_by(col(AIBatchItem.position))
                    )
                ).all()
            )
            for item_id in ids:
                await session.refresh(batch)
                if batch.status != "running":
                    break
                item = await session.get(AIBatchItem, item_id)
                if item is None:
                    continue
                item.status = "running"
                session.add(item)
                await session.commit()
                try:
                    await _process_item(session, batch, item)
                except asyncio.CancelledError:
                    runner = asyncio.current_task()
                    if runner is not None and runner.cancelling():
                        raise
                    await session.rollback()
                    await session.refresh(item)
                    item.status = "cancelled"
                except (APIException, ValidationError, ValueError) as error:
                    await session.rollback()
                    await session.refresh(item)
                    item.status = "failed"
                    reason = error.data.get("reason") if isinstance(error, APIException) and error.data else None
                    item.error_code = (
                        str(reason) if isinstance(reason, str) and len(reason) < 100 else "batch_item_failed"
                    )
                await session.refresh(batch)
                if batch.status == "cancelled" and item.status != "succeeded":
                    item.status = "cancelled"
                session.add(item)
                await session.commit()
            await session.refresh(batch)
            if batch.status == "running":
                batch.status = "completed"
                session.add(batch)
                await session.commit()


async def batch_action(session: AsyncSession, owner_id: UUID, batch_id: UUID, action: str) -> AIBatch:
    batch = await owned_batch(session, owner_id, batch_id)
    items = (await session.exec(select(AIBatchItem).where(col(AIBatchItem.batch_id) == batch_id))).all()
    if action == "cancel" and batch.status == "completed":
        return batch
    if action == "resume" and not any(item.status == "queued" for item in items):
        raise _conflict("batch_no_queued_items")
    if action == "cancel":
        batch.status = "cancelled"
        session.add(batch)
        await session.commit()
        for item in items:
            if item.status == "running" and item.task_id:
                await cancel_ai_task(session, owner_id=owner_id, task_id=item.task_id)
            if item.status in {"queued", "running"}:
                item.status = "cancelled"
                session.add(item)
    else:
        if batch.status in {"queued", "running"}:
            return batch
        docs, versions, _, order = await source_state(session, batch.project_id)
        for item in items:
            if action == "retry_failed" and item.status in {"failed", "stale"}:
                if item.document_id not in order or docs[item.document_id].kind != "manuscript":
                    continue
                item.document_version = versions[item.document_id]
                item.source_order = source_order_hash(order, item.document_id)
                item.status = "queued"
                item.error_code = None
                session.add(item)
        batch.status = "queued"
        session.add(batch)
    await session.commit()
    await session.refresh(batch)
    return batch


async def _recover_batches() -> None:
    async with async_session_factory() as session:
        batches = (await session.exec(select(AIBatch).where(col(AIBatch.status).in_(["queued", "running"])))).all()
        for batch in batches:
            batch.status = "paused"
            session.add(batch)
            items = (
                await session.exec(
                    select(AIBatchItem).where(
                        col(AIBatchItem.batch_id) == batch.id, col(AIBatchItem.status) == "running"
                    )
                )
            ).all()
            for item in items:
                item.status = "failed"
                item.error_code = "AI_PROCESS_RESTARTED"
                session.add(item)
        await session.commit()


async def stop_batch_runners() -> None:
    tasks = list(_RUNNERS.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def recover_batches() -> None:
    try:
        await _recover_batches()
    except OperationalError as error:
        if "ai_batches" not in str(error.orig).lower():
            raise
