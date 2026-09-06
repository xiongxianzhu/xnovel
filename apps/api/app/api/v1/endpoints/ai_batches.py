"""后台批量生成的预检、状态与作者控制入口。"""

from math import ceil
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func
from sqlmodel import col, select

from app.api.deps import SessionDep
from app.core.security import PasswordChangeCompletedContextDep
from app.models.ai_batch import AIBatch, AIBatchItem
from app.schemas.ai_batches import BatchAction, BatchData, BatchPreview, BatchRequest, BatchSummary
from app.schemas.common import APIResponse
from app.schemas.studio import StudioPage
from app.services.ai_batches import batch_action, batch_data, create_batch, owned_batch, preview_batch, schedule_batch

router = APIRouter(prefix="/ai/batches")


@router.post("/preview", operation_id="previewAIBatch")
async def preview(
    payload: BatchRequest, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[BatchPreview]:
    return APIResponse(code=0, msg="SUCCESS", data=await preview_batch(session, context.user.id, payload))


@router.post("", operation_id="createAIBatch", status_code=202)
async def create(
    payload: BatchRequest, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[BatchData]:
    row = await create_batch(session, context.user.id, payload)
    data = await batch_data(session, row)
    if row.status == "queued":
        schedule_batch(row.id)
    return APIResponse(code=0, msg="SUCCESS", data=data)


@router.get("", operation_id="listAIBatches")
async def listing(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    project_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> APIResponse[StudioPage[BatchSummary]]:
    filters = [col(AIBatch.owner_id) == context.user.id]
    if project_id:
        filters.append(col(AIBatch.project_id) == project_id)
    total = (await session.exec(select(func.count()).select_from(AIBatch).where(*filters))).one()
    rows = (
        await session.exec(
            select(AIBatch)
            .where(*filters)
            .order_by(col(AIBatch.created_at).desc(), col(AIBatch.id).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    grouped = (
        await session.exec(
            select(AIBatchItem.batch_id, AIBatchItem.status, func.count())
            .where(col(AIBatchItem.batch_id).in_([row.id for row in rows]))
            .group_by(col(AIBatchItem.batch_id), col(AIBatchItem.status))
        )
    ).all()
    counters: dict[UUID, dict[str, int]] = {}
    for batch_id, state, count in grouped:
        counters.setdefault(batch_id, {})[state] = count
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=StudioPage(
            items=[
                BatchSummary.model_validate(
                    {
                        **row.model_dump(),
                        "counts": counters.get(row.id, {}),
                        "total": sum(counters.get(row.id, {}).values()),
                    }
                )
                for row in rows
            ],
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size),
        ),
    )


@router.get("/{batch_id}", operation_id="getAIBatch")
async def detail(
    batch_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[BatchData]:
    row = await owned_batch(session, context.user.id, batch_id)
    return APIResponse(code=0, msg="SUCCESS", data=await batch_data(session, row))


@router.post("/{batch_id}/actions", operation_id="controlAIBatch")
async def action(
    batch_id: UUID, payload: BatchAction, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[BatchData]:
    row = await batch_action(session, context.user.id, batch_id, payload.action)
    data = await batch_data(session, row)
    if row.status == "queued":
        schedule_batch(row.id)
    return APIResponse(code=0, msg="SUCCESS", data=data)
