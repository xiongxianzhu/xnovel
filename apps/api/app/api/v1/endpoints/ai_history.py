"""AI 任务与候选历史、收藏和上下文预检。"""

from datetime import datetime
from math import ceil
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import col, select

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import PasswordChangeCompletedContextDep
from app.models.ai import AIProviderModel, AIResult, AITask
from app.schemas.ai import AIResultData, AITaskCreateRequest, AITaskData
from app.schemas.ai_history import PinRequest, ResultHistoryItem, TaskHistoryItem
from app.schemas.common import APIResponse
from app.schemas.studio import StudioPage
from app.services.ai_context import build_ai_context
from app.services.ai_tasks import _model, _owned_result, _result_data, create_ai_task, schedule_ai_task
from app.services.projects import _conflict, _not_found
from app.services.providers import get_provider_config

router = APIRouter(prefix="/ai")


@router.get("/tasks", operation_id="listAITaskHistory")
async def task_history(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    q: str = Query(default="", max_length=200),
    project_id: UUID | None = None,
    document_id: UUID | None = None,
    task_type: str | None = None,
    status: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
) -> APIResponse[StudioPage[TaskHistoryItem]]:
    filters = [col(AITask.owner_id) == context.user.id]
    if created_from:
        filters.append(col(AITask.created_at) >= created_from)
    if created_to:
        filters.append(col(AITask.created_at) < created_to)
    if project_id:
        filters.append(col(AITask.project_id) == project_id)
    if document_id:
        filters.append(col(AITask.document_id) == document_id)
    if task_type:
        filters.append(col(AITask.task_type) == task_type)
    if status:
        filters.append(col(AITask.status) == status)
    if q.strip():
        filters.append(col(AITask.instruction).icontains(q.strip(), autoescape=True))
    total = (await session.exec(select(func.count()).select_from(AITask).where(*filters))).one()
    rows = (
        await session.exec(
            select(AITask)
            .where(*filters)
            .order_by(col(AITask.created_at).desc(), col(AITask.id).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=StudioPage(
            items=[TaskHistoryItem.model_validate(row, from_attributes=True) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size),
        ),
    )


@router.get("/results", operation_id="listAIResultHistory")
async def result_history(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    q: str = Query(default="", max_length=200),
    project_id: UUID | None = None,
    pinned: bool | None = None,
    document_id: UUID | None = None,
    task_type: str | None = None,
    status: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
) -> APIResponse[StudioPage[ResultHistoryItem]]:
    filters = [col(AITask.owner_id) == context.user.id]
    if document_id:
        filters.append(col(AITask.document_id) == document_id)
    if task_type:
        filters.append(col(AITask.task_type) == task_type)
    if status:
        filters.append(col(AIResult.status) == status)
    if created_from:
        filters.append(col(AIResult.created_at) >= created_from)
    if created_to:
        filters.append(col(AIResult.created_at) < created_to)
    if project_id:
        filters.append(col(AIResult.project_id) == project_id)
    if pinned is not None:
        filters.append(col(AIResult.pinned) == pinned)
    if q.strip():
        filters.append(col(AIResult.content).icontains(q.strip(), autoescape=True))
    total = (await session.exec(select(func.count()).select_from(AIResult).join(AITask).where(*filters))).one()
    rows = (
        await session.exec(
            select(AIResult, AITask)
            .join(AITask)
            .where(*filters)
            .order_by(col(AIResult.created_at).desc(), col(AIResult.id).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        ResultHistoryItem.model_validate(
            {
                **row.model_dump(),
                "task_type": task.task_type,
                "document_id": task.document_id,
                "excerpt": row.content[:180],
            }
        )
        for row, task in rows
    ]
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=StudioPage(items=items, page=page, page_size=page_size, total=total, pages=ceil(total / page_size)),
    )


@router.get("/results/{result_id}", operation_id="getAIResultHistory")
async def result_detail(
    result_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[AIResultData]:
    result, _ = await _owned_result(session, context.user.id, result_id, lock=False)
    return APIResponse(code=0, msg="SUCCESS", data=_result_data(result))


@router.post("/tasks/{task_id}/retry", operation_id="retryAITask", status_code=202)
async def retry_task(
    task_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[AITaskData]:
    previous = await session.get(AITask, task_id)
    if previous is None or previous.owner_id != context.user.id:
        raise _not_found()
    if previous.status in {"queued", "running"} or previous.project_id is None or previous.provider_config_id is None:
        raise _conflict("task_cannot_retry")
    if previous.context_manifest.get("document_id") and previous.document_id is None:
        raise _conflict("retry_source_missing")
    if previous.context_manifest.get("selected_text"):
        raise _conflict("selection_requires_reselection")
    settings = get_settings()
    config = await get_provider_config(
        session, owner_id=context.user.id, config_id=previous.provider_config_id, settings=settings
    )
    selected_model = (
        await session.exec(
            select(AIProviderModel).where(
                col(AIProviderModel.provider_config_id) == config.id, col(AIProviderModel.model_id) == previous.model
            )
        )
    ).first()
    if selected_model is None:
        raise _conflict("retry_model_unavailable")
    sources = previous.context_manifest.get("studio_sources", [])
    payload = AITaskCreateRequest.model_validate(
        {
            "project_id": previous.project_id,
            "document_id": previous.document_id,
            "provider_config_id": previous.provider_config_id,
            "model_id": selected_model.id,
            "task_type": previous.task_type,
            "instruction": previous.instruction,
            "max_output_tokens": 2048,
            "skill_ids": [item["skill_id_snapshot"] for item in previous.context_manifest.get("skills", [])],
            "summary_ids": [item["id"] for item in sources if item.get("kind") == "summary"],
            "fact_ids": [item["id"] for item in sources if item.get("kind") == "fact"],
        }
    )
    task, execution = await create_ai_task(session, owner_id=context.user.id, payload=payload, settings=settings)
    schedule_ai_task(execution)
    return APIResponse(code=0, msg="SUCCESS", data=task)


@router.patch("/results/{result_id}/pin", operation_id="pinAIResult")
async def pin_result(
    result_id: UUID, payload: PinRequest, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[AIResultData]:
    result, _ = await _owned_result(session, context.user.id, result_id, lock=True)
    result.pinned = payload.pinned
    session.add(result)
    await session.commit()
    await session.refresh(result)
    return APIResponse(code=0, msg="SUCCESS", data=_result_data(result))


class ContextPreview(BaseModel):
    estimated_input_tokens: int
    available_input_tokens: int
    source_count: int
    skill_count: int
    estimated_cost: None = None
    document_version: int | None = None


@router.post("/context-preview", operation_id="previewAIContext")
async def context_preview(
    payload: AITaskCreateRequest, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[ContextPreview]:
    settings = get_settings()
    config = await get_provider_config(
        session, owner_id=context.user.id, config_id=payload.provider_config_id, settings=settings
    )
    model = await _model(session, config, payload.model_id)
    output = min(payload.max_output_tokens, model.max_output_tokens, 8192)
    built = await build_ai_context(
        session,
        owner_id=context.user.id,
        payload=payload,
        context_window=model.context_window,
        output_tokens=output,
        settings=settings,
    )
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=ContextPreview(
            estimated_input_tokens=built.manifest["estimated_input_tokens"],
            available_input_tokens=model.context_window - output - 512,
            source_count=len(payload.summary_ids) + len(payload.fact_ids) + (1 if payload.document_id else 0),
            skill_count=len(payload.skill_ids),
            document_version=built.manifest.get("document_version"),
        ),
    )
