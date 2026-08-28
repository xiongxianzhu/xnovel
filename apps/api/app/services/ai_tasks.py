"""AI 任务持久化、执行、SSE 事件、取消与候选决策。"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from sqlalchemy import func, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import Settings, get_settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.db.session import async_session_factory
from app.models.ai import AIProviderConfig, AIProviderModel, AIResult, AITask
from app.models.document_content import DocumentContent
from app.schemas.ai import (
    AIResultApplyRequest,
    AIResultData,
    AIResultDecisionData,
    AITaskCreateRequest,
    AITaskData,
    ProviderConnectionTestData,
)
from app.services.ai_context import build_ai_context
from app.services.projects import _editable_document, _owned_project, count_document_words
from app.services.provider_adapters import stream_provider
from app.services.provider_security import validate_provider_target
from app.services.providers import decrypt_provider_key, effective_base_url, get_provider_config


@dataclass(frozen=True)
class ExecutionInput:
    task_id: UUID
    owner_id: UUID
    config_id: UUID
    protocol: str
    base_url: str
    model: str
    messages: list[dict[str, str]]
    max_output_tokens: int
    create_result: bool


class TaskEventHub:
    def __init__(self) -> None:
        self._events: dict[UUID, list[dict[str, object]]] = {}
        self._conditions: dict[UUID, asyncio.Condition] = {}

    async def publish(self, task_id: UUID, event: dict[str, object]) -> None:
        condition = self._conditions.setdefault(task_id, asyncio.Condition())
        async with condition:
            self._events.setdefault(task_id, []).append(event)
            condition.notify_all()

    async def subscribe(self, task_id: UUID) -> AsyncIterator[dict[str, object]]:
        condition = self._conditions.setdefault(task_id, asyncio.Condition())
        index = 0
        while True:
            async with condition:
                events = self._events.get(task_id, [])
                while index >= len(events):
                    await condition.wait()
                    events = self._events.get(task_id, [])
                event = events[index]
                index += 1
            yield event
            if event.get("type") == "done":
                return


EVENT_HUB = TaskEventHub()
_USER_LOCKS: dict[UUID, asyncio.Lock] = {}
_RUNNING: dict[UUID, asyncio.Task[None]] = {}


async def recover_interrupted_ai_tasks() -> None:
    """进程启动时释放无法恢复的排队和运行任务。"""

    async with async_session_factory() as session:
        try:
            tasks = list(
                (await session.exec(select(AITask).where(col(AITask.status).in_(["queued", "running"])))).all()
            )
        except OperationalError as exc:
            # 初次部署与迁移工具会在业务表建立前启动应用上下文。
            message = str(exc.orig).lower()
            if "ai_tasks" not in message or not ("no such table" in message or "does not exist" in message):
                raise
            await session.rollback()
            return
        now = datetime.now(UTC)
        for task in tasks:
            task.status = "failed"
            task.error_code = "AI_PROCESS_RESTARTED"
            task.error_message = "AI task was interrupted by a service restart"
            task.finished_at = now
            task.updated_at = now
            session.add(task)
        if tasks:
            await session.commit()


def _timestamps(value: AITask) -> tuple[datetime, datetime]:
    if value.created_at is None or value.updated_at is None:
        raise _unavailable()
    return value.created_at, value.updated_at


def _result_data(result: AIResult) -> AIResultData:
    return AIResultData(
        id=result.id,
        sequence=result.sequence,
        content=result.content,
        status=result.status,  # type: ignore[arg-type]
        applied_document_id=result.applied_document_id,
        decided_at=result.decided_at,
    )


async def task_data(session: AsyncSession, task: AITask) -> AITaskData:
    created_at, updated_at = _timestamps(task)
    results = list(
        (
            await session.exec(
                select(AIResult)
                .where(col(AIResult.task_id) == task.id)
                .order_by(col(AIResult.sequence), col(AIResult.id))
            )
        ).all()
    )
    return AITaskData(
        id=task.id,
        project_id=task.project_id,
        document_id=task.document_id,
        task_type=task.task_type,
        provider=task.provider,
        model=task.model,
        context_manifest=dict(task.context_manifest),
        status=task.status,  # type: ignore[arg-type]
        error_code=task.error_code,
        error_message=task.error_message,
        input_tokens=task.input_tokens,
        output_tokens=task.output_tokens,
        cache_read_tokens=task.cache_read_tokens,
        reasoning_tokens=task.reasoning_tokens,
        cancel_requested_at=task.cancel_requested_at,
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=created_at,
        updated_at=updated_at,
        results=[_result_data(item) for item in results],
    )


async def _model(
    session: AsyncSession,
    config: AIProviderConfig,
    model_id: UUID | None,
) -> AIProviderModel:
    target = model_id or config.default_model_id
    model = (
        await session.exec(
            select(AIProviderModel).where(
                col(AIProviderModel.id) == target,
                col(AIProviderModel.provider_config_id) == config.id,
                col(AIProviderModel.enabled).is_(True),
            )
        )
    ).one_or_none()
    if model is None:
        raise _not_found()
    return model


async def create_ai_task(
    session: AsyncSession,
    *,
    owner_id: UUID,
    payload: AITaskCreateRequest,
    settings: Settings,
) -> tuple[AITaskData, ExecutionInput]:
    try:
        config = await get_provider_config(
            session,
            owner_id=owner_id,
            config_id=payload.provider_config_id,
            settings=settings,
        )
        if not config.enabled:
            raise _validation("provider_disabled")
        model = await _model(session, config, payload.model_id)
        max_output = min(8192, model.max_output_tokens, payload.max_output_tokens)
        built = await build_ai_context(
            session,
            owner_id=owner_id,
            payload=payload,
            context_window=model.context_window,
            output_tokens=max_output,
            settings=settings,
        )
        base_url = await validate_provider_target(effective_base_url(config), settings.provider_allowed_origins)
        task = AITask(
            owner_id=owner_id,
            project_id=payload.project_id,
            document_id=payload.document_id,
            provider_config_id=config.id,
            task_type=payload.task_type,
            provider=config.provider_id,
            model=model.model_id,
            instruction=payload.instruction,
            context_manifest=built.manifest,
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable() from exc
    execution = ExecutionInput(
        task_id=task.id,
        owner_id=owner_id,
        config_id=config.id,
        protocol=config.protocol,
        base_url=base_url,
        model=model.model_id,
        messages=built.messages,
        max_output_tokens=max_output,
        create_result=True,
    )
    await EVENT_HUB.publish(task.id, {"type": "status", "status": "queued"})
    return await task_data(session, task), execution


async def run_provider_connection_test(
    session: AsyncSession,
    *,
    owner_id: UUID,
    config_id: UUID,
    model_id: UUID | None,
    settings: Settings,
) -> ProviderConnectionTestData:
    config = await get_provider_config(
        session,
        owner_id=owner_id,
        config_id=config_id,
        settings=settings,
    )
    model = await _model(session, config, model_id)
    base_url = await validate_provider_target(effective_base_url(config), settings.provider_allowed_origins)
    task = AITask(
        owner_id=owner_id,
        task_type="provider_connection_test",
        provider=config.provider_id,
        model=model.model_id,
        instruction="provider_connection_test",
        context_manifest={"connection_test": True},
        provider_config_id=config.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    execution = ExecutionInput(
        task_id=task.id,
        owner_id=owner_id,
        config_id=config.id,
        protocol=config.protocol,
        base_url=base_url,
        model=model.model_id,
        messages=[{"role": "user", "content": "Reply with OK."}],
        max_output_tokens=1,
        create_result=False,
    )
    claimed = await _claim_task(session, execution, settings)
    if claimed is None:
        await session.refresh(task)
    else:
        usage: dict[str, int | None] = {}
        try:
            api_key = await decrypt_provider_key(
                session,
                owner_id=owner_id,
                config=config,
                settings=settings,
            )
            async with asyncio.timeout(settings.ai_call_timeout_seconds):
                async for event in stream_provider(
                    protocol=config.protocol,
                    base_url=base_url,
                    api_key=api_key,
                    model=model.model_id,
                    messages=execution.messages,
                    max_output_tokens=1,
                    timeout_seconds=settings.ai_call_timeout_seconds,
                ):
                    if event.type == "usage" and event.usage:
                        usage.update(event.usage)
            await _finish_success(session, claimed, "", usage, False)
        except TimeoutError:
            await _finish_failure(session, claimed, "failed", "AI_TIMEOUT", "Provider connection test timed out")
        except httpx.HTTPError, APIException, ValueError:
            await _finish_failure(
                session,
                claimed,
                "failed",
                "AI_PROVIDER_UNAVAILABLE",
                "Provider connection test failed",
            )
        await session.refresh(task)
    return ProviderConnectionTestData(
        task_id=task.id,
        status=task.status,  # type: ignore[arg-type]
        input_tokens=task.input_tokens,
        output_tokens=task.output_tokens,
        error_code=task.error_code,
    )


def schedule_ai_task(execution: ExecutionInput) -> None:
    task = asyncio.create_task(execute_ai_task(execution))
    _RUNNING[execution.task_id] = task
    task.add_done_callback(lambda _: _RUNNING.pop(execution.task_id, None))


async def _claim_task(session: AsyncSession, execution: ExecutionInput, settings: Settings) -> AITask | None:
    lock = _USER_LOCKS.setdefault(execution.owner_id, asyncio.Lock())
    async with lock:
        if session.get_bind().dialect.name == "postgresql":
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:owner_id, 0))"),
                {"owner_id": str(execution.owner_id)},
            )
        task = await session.get(AITask, execution.task_id)
        if task is None or task.status != "queued":
            return None
        cutoff = datetime.now(UTC) - timedelta(seconds=settings.ai_call_timeout_seconds)
        stale = list(
            (
                await session.exec(
                    select(AITask).where(
                        col(AITask.owner_id) == execution.owner_id,
                        col(AITask.status) == "running",
                        col(AITask.started_at) <= cutoff,
                    )
                )
            ).all()
        )
        now = datetime.now(UTC)
        for item in stale:
            item.status = "failed"
            item.error_code = "AI_TIMEOUT"
            item.error_message = "AI task exceeded the execution time limit"
            item.finished_at = now
            item.updated_at = now
            session.add(item)
        running = int(
            (
                await session.exec(
                    select(func.count())
                    .select_from(AITask)
                    .where(
                        col(AITask.owner_id) == execution.owner_id,
                        col(AITask.status) == "running",
                    )
                )
            ).one()
        )
        if running >= settings.ai_max_concurrency_per_user:
            task.status = "failed"
            task.error_code = "AI_CONCURRENCY_LIMIT"
            task.error_message = "Too many AI tasks are already running"
            task.finished_at = now
            task.updated_at = now
            session.add(task)
            await session.commit()
            return None
        task.status = "running"
        task.started_at = now
        task.updated_at = now
        session.add(task)
        await session.commit()
        await session.refresh(task)
        return task


async def execute_ai_task(execution: ExecutionInput) -> None:
    settings = get_settings()
    content_chunks: list[str] = []
    usage: dict[str, int | None] = {}
    async with async_session_factory() as session:
        task = await _claim_task(session, execution, settings)
        if task is None:
            await EVENT_HUB.publish(execution.task_id, {"type": "error", "code": "AI_CONCURRENCY_LIMIT"})
            await EVENT_HUB.publish(execution.task_id, {"type": "done"})
            return
        await EVENT_HUB.publish(task.id, {"type": "status", "status": "running"})
        try:
            config = await get_provider_config(
                session,
                owner_id=execution.owner_id,
                config_id=execution.config_id,
                settings=settings,
            )
            api_key = await decrypt_provider_key(
                session,
                owner_id=execution.owner_id,
                config=config,
                settings=settings,
            )
            async with asyncio.timeout(settings.ai_call_timeout_seconds):
                async for event in stream_provider(
                    protocol=execution.protocol,
                    base_url=execution.base_url,
                    api_key=api_key,
                    model=execution.model,
                    messages=execution.messages,
                    max_output_tokens=execution.max_output_tokens,
                    timeout_seconds=settings.ai_call_timeout_seconds,
                ):
                    await session.refresh(task)
                    if task.status == "cancelled" or task.cancel_requested_at is not None:
                        raise asyncio.CancelledError
                    if event.type == "delta":
                        content_chunks.append(event.text)
                        await EVENT_HUB.publish(task.id, {"type": "delta", "text": event.text})
                    elif event.type == "usage" and event.usage:
                        usage.update(event.usage)
                        await EVENT_HUB.publish(task.id, {"type": "usage", **event.usage})
            await _finish_success(session, task, "".join(content_chunks), usage, execution.create_result)
            await EVENT_HUB.publish(task.id, {"type": "result"})
        except asyncio.CancelledError:
            await _finish_failure(session, task, "cancelled", "AI_CANCELLED", "AI task was cancelled")
            await EVENT_HUB.publish(task.id, {"type": "error", "code": "AI_CANCELLED"})
        except TimeoutError:
            await _finish_failure(session, task, "failed", "AI_TIMEOUT", "AI task exceeded the execution time limit")
            await EVENT_HUB.publish(task.id, {"type": "error", "code": "AI_TIMEOUT"})
        except httpx.HTTPError, APIException, ValueError:
            await _finish_failure(session, task, "failed", "AI_PROVIDER_UNAVAILABLE", "Provider request failed")
            await EVENT_HUB.publish(task.id, {"type": "error", "code": "AI_PROVIDER_UNAVAILABLE"})
        finally:
            await EVENT_HUB.publish(task.id, {"type": "done"})


async def _finish_success(
    session: AsyncSession,
    task: AITask,
    content: str,
    usage: dict[str, int | None],
    create_result: bool,
) -> None:
    await session.refresh(task)
    if task.status != "running":
        return
    now = datetime.now(UTC)
    task.status = "succeeded"
    task.finished_at = now
    task.updated_at = now
    task.input_tokens = usage.get("input_tokens")
    task.output_tokens = usage.get("output_tokens")
    task.cache_read_tokens = usage.get("cache_read_tokens")
    task.reasoning_tokens = usage.get("reasoning_tokens")
    session.add(task)
    if create_result and task.project_id is not None:
        session.add(AIResult(project_id=task.project_id, task_id=task.id, content=content, sequence=0))
    await session.commit()


async def _finish_failure(
    session: AsyncSession,
    task: AITask,
    status: str,
    code: str,
    message: str,
) -> None:
    await session.refresh(task)
    if task.status not in {"queued", "running"}:
        return
    now = datetime.now(UTC)
    task.status = status
    task.error_code = code
    task.error_message = message
    task.finished_at = now
    task.updated_at = now
    session.add(task)
    await session.commit()


async def get_ai_task(
    session: AsyncSession,
    *,
    owner_id: UUID,
    task_id: UUID,
) -> AITaskData:
    task = (
        await session.exec(select(AITask).where(col(AITask.id) == task_id, col(AITask.owner_id) == owner_id))
    ).one_or_none()
    if task is None:
        raise _not_found()
    return await task_data(session, task)


async def cancel_ai_task(
    session: AsyncSession,
    *,
    owner_id: UUID,
    task_id: UUID,
) -> AITaskData:
    task = (
        await session.exec(
            select(AITask).where(col(AITask.id) == task_id, col(AITask.owner_id) == owner_id).with_for_update()
        )
    ).one_or_none()
    if task is None:
        raise _not_found()
    if task.status in {"queued", "running"}:
        now = datetime.now(UTC)
        task.cancel_requested_at = now
        task.status = "cancelled"
        task.error_code = "AI_CANCELLED"
        task.error_message = "AI task was cancelled"
        task.finished_at = now
        task.updated_at = now
        session.add(task)
        await session.commit()
        running = _RUNNING.get(task.id)
        if running:
            running.cancel()
    return await task_data(session, task)


async def stream_task_events(
    session: AsyncSession,
    *,
    owner_id: UUID,
    task_id: UUID,
) -> AsyncIterator[str]:
    snapshot = await get_ai_task(session, owner_id=owner_id, task_id=task_id)
    if snapshot.status in {"succeeded", "failed", "cancelled"}:
        yield f"data: {json.dumps({'type': 'status', 'status': snapshot.status})}\n\n"
        if snapshot.results:
            yield f"data: {json.dumps({'type': 'result'})}\n\n"
        if snapshot.error_code:
            yield f"data: {json.dumps({'type': 'error', 'code': snapshot.error_code})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return
    async for event in EVENT_HUB.subscribe(task_id):
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def reject_ai_result(
    session: AsyncSession,
    *,
    owner_id: UUID,
    result_id: UUID,
) -> AIResultDecisionData:
    result, _ = await _owned_result(session, owner_id, result_id, lock=True)
    if result.status != "candidate":
        raise _conflict("ai_result_already_decided")
    result.status = "rejected"
    result.decided_at = datetime.now(UTC)
    session.add(result)
    await session.commit()
    await session.refresh(result)
    return AIResultDecisionData(result=_result_data(result))


async def apply_ai_result(
    session: AsyncSession,
    *,
    owner_id: UUID,
    result_id: UUID,
    payload: AIResultApplyRequest,
) -> AIResultDecisionData:
    try:
        result, task = await _owned_result(session, owner_id, result_id, lock=True)
        if result.status != "candidate" or task.project_id is None:
            raise _conflict("ai_result_already_decided")
        await _owned_project(session, owner_id=owner_id, project_id=task.project_id, lock=True)
        document = await _editable_document(
            session,
            project_id=task.project_id,
            document_id=payload.document_id,
            lock=True,
        )
        content = (
            await session.exec(
                select(DocumentContent).where(col(DocumentContent.document_id) == document.id).with_for_update()
            )
        ).one_or_none()
        if content is None or content.version != payload.version:
            raise _conflict("content_version_conflict")
        now = datetime.now(UTC)
        content.content = payload.content
        content.version += 1
        content.word_count = count_document_words(payload.content)
        content.checksum = hashlib.sha256(payload.content.encode()).hexdigest()
        content.updated_by = owner_id
        content.updated_at = now
        document.updated_at = now
        result.status = "applied"
        result.applied_document_id = document.id
        result.decided_at = now
        result.updated_at = now
        session.add(content)
        session.add(document)
        session.add(result)
        await session.commit()
        await session.refresh(result)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable() from exc
    return AIResultDecisionData(result=_result_data(result), document_version=content.version)


async def _owned_result(
    session: AsyncSession,
    owner_id: UUID,
    result_id: UUID,
    *,
    lock: bool,
) -> tuple[AIResult, AITask]:
    statement = select(AIResult).where(col(AIResult.id) == result_id)
    if lock:
        statement = statement.with_for_update()
    result = (await session.exec(statement)).one_or_none()
    if result is None:
        raise _not_found()
    task = await session.get(AITask, result.task_id)
    if task is None or task.owner_id != owner_id:
        raise _not_found()
    return result, task


def _validation(reason: str) -> APIException:
    return APIException(
        status_code=422,
        code=ErrorCode.VALIDATION_ERROR,
        msg=ErrorMessage.VALIDATION_ERROR,
        data={"reason": reason},
    )


def _conflict(reason: str) -> APIException:
    return APIException(
        status_code=409,
        code=ErrorCode.CONFLICT,
        msg=ErrorMessage.CONFLICT,
        data={"reason": reason},
    )


def _not_found() -> APIException:
    return APIException(status_code=404, code=ErrorCode.NOT_FOUND, msg=ErrorMessage.NOT_FOUND)


def _unavailable() -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
    )
