"""AI 任务、SSE、取消与候选决策端点。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import PasswordChangeCompletedContextDep
from app.schemas.ai import AIResultApplyRequest, AIResultDecisionResponse, AITaskCreateRequest, AITaskResponse
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ConflictErrorResponse,
    NotFoundErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.services.ai_tasks import (
    apply_ai_result,
    cancel_ai_task,
    create_ai_task,
    get_ai_task,
    reject_ai_result,
    schedule_ai_task,
    stream_task_events,
)

router = APIRouter(prefix="/ai")
_AUTH: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
    503: {"model": ServiceUnavailableErrorResponse},
}
_TASK_ERRORS = _AUTH | {
    404: {"model": NotFoundErrorResponse},
    409: {"model": ConflictErrorResponse},
    422: {"model": ValidationErrorResponse},
}


@router.post(
    "/tasks",
    operation_id="createAITask",
    status_code=status.HTTP_202_ACCEPTED,
    responses=_TASK_ERRORS,
)
async def post_task(
    payload: AITaskCreateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> AITaskResponse:
    data, execution = await create_ai_task(
        session,
        owner_id=context.user.id,
        payload=payload,
        settings=get_settings(),
    )
    schedule_ai_task(execution)
    return AITaskResponse(code=0, msg="SUCCESS", data=data)


@router.get("/tasks/{task_id}", operation_id="getAITask", responses=_TASK_ERRORS)
async def get_task(
    task_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> AITaskResponse:
    return AITaskResponse(
        code=0, msg="SUCCESS", data=await get_ai_task(session, owner_id=context.user.id, task_id=task_id)
    )


@router.post("/tasks/{task_id}/cancel", operation_id="cancelAITask", responses=_TASK_ERRORS)
async def post_cancel(
    task_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> AITaskResponse:
    return AITaskResponse(
        code=0,
        msg="SUCCESS",
        data=await cancel_ai_task(session, owner_id=context.user.id, task_id=task_id),
    )


@router.get(
    "/tasks/{task_id}/events",
    operation_id="streamAITaskEvents",
    response_class=StreamingResponse,
    responses=_AUTH | {404: {"model": NotFoundErrorResponse}, 422: {"model": ValidationErrorResponse}},
)
async def get_events(
    task_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> StreamingResponse:
    return StreamingResponse(
        stream_task_events(session, owner_id=context.user.id, task_id=task_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/results/{result_id}/apply", operation_id="applyAIResult", responses=_TASK_ERRORS)
async def post_apply_result(
    result_id: UUID,
    payload: AIResultApplyRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> AIResultDecisionResponse:
    data = await apply_ai_result(session, owner_id=context.user.id, result_id=result_id, payload=payload)
    return AIResultDecisionResponse(code=0, msg="SUCCESS", data=data)


@router.post("/results/{result_id}/reject", operation_id="rejectAIResult", responses=_TASK_ERRORS)
async def post_reject_result(
    result_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> AIResultDecisionResponse:
    data = await reject_ai_result(session, owner_id=context.user.id, result_id=result_id)
    return AIResultDecisionResponse(code=0, msg="SUCCESS", data=data)
