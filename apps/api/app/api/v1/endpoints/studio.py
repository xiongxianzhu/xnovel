"""作品内资料管理与写前回顾。"""

from math import ceil, floor
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import col, select

from app.api.deps import SessionDep
from app.core.security import PasswordChangeCompletedContextDep
from app.models import studio as models
from app.models.document_content import DocumentContent
from app.schemas import studio as schemas
from app.schemas.common import APIResponse
from app.services.projects import _not_found, _owned_project
from app.services.studio_records import list_records, owned_record, record_data, save_record, source_state

router = APIRouter(prefix="/projects/{project_id}/studio")


def record_routes[RecordT: models.SourceRecord, DataT: BaseModel](
    model: type[RecordT], input_schema: type[schemas.SourceInput], data_schema: type[DataT], resource: str, name: str
) -> None:
    """为已存在的九类来源资料复用相同的授权与版本事务。"""

    async def listing(
        project_id: UUID,
        context: PasswordChangeCompletedContextDep,
        session: SessionDep,
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=50, ge=1, le=100),
        q: str = Query(default="", max_length=200),
        source_document_id: UUID | None = None,
    ) -> APIResponse[schemas.StudioPage[DataT]]:
        data = await list_records(
            session, context.user.id, project_id, model, data_schema, page, page_size, q, source_document_id
        )
        return APIResponse(code=0, msg="SUCCESS", data=data)

    async def detail(
        project_id: UUID, record_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
    ) -> APIResponse[DataT]:
        await _owned_project(session, owner_id=context.user.id, project_id=project_id)
        row = await owned_record(session, model, project_id, record_id)
        return APIResponse(
            code=0, msg="SUCCESS", data=record_data(row, data_schema, await source_state(session, project_id))
        )

    async def create(
        project_id: UUID, payload: schemas.SourceInput, context: PasswordChangeCompletedContextDep, session: SessionDep
    ) -> APIResponse[DataT]:
        row = await save_record(session, context.user.id, project_id, model, payload)
        return APIResponse(
            code=0, msg="SUCCESS", data=record_data(row, data_schema, await source_state(session, project_id))
        )

    async def update(
        project_id: UUID,
        record_id: UUID,
        payload: schemas.SourceInput,
        context: PasswordChangeCompletedContextDep,
        session: SessionDep,
    ) -> APIResponse[DataT]:
        row = await save_record(session, context.user.id, project_id, model, payload, record_id)
        return APIResponse(
            code=0, msg="SUCCESS", data=record_data(row, data_schema, await source_state(session, project_id))
        )

    async def remove(
        project_id: UUID, record_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
    ) -> APIResponse[schemas.DeletedData]:
        await _owned_project(session, owner_id=context.user.id, project_id=project_id, lock=True)
        row = await owned_record(session, model, project_id, record_id)
        await session.delete(row)
        await session.commit()
        return APIResponse(code=0, msg="SUCCESS", data=schemas.DeletedData())

    page_response = APIResponse.__class_getitem__(
        cast(type[BaseModel], schemas.StudioPage.__class_getitem__(data_schema))
    )
    item_response = APIResponse.__class_getitem__(data_schema)
    create.__annotations__["payload"] = input_schema
    update.__annotations__["payload"] = input_schema
    router.add_api_route(
        f"/{resource}", listing, methods=["GET"], operation_id=f"listStudio{name}", response_model=page_response
    )
    router.add_api_route(
        f"/{resource}",
        create,
        methods=["POST"],
        operation_id=f"createStudio{name}",
        status_code=201,
        response_model=item_response,
    )
    router.add_api_route(
        f"/{resource}/{{record_id}}",
        detail,
        methods=["GET"],
        operation_id=f"getStudio{name}",
        response_model=item_response,
    )
    router.add_api_route(
        f"/{resource}/{{record_id}}",
        update,
        methods=["PUT"],
        operation_id=f"updateStudio{name}",
        response_model=item_response,
    )
    router.add_api_route(
        f"/{resource}/{{record_id}}",
        remove,
        methods=["DELETE"],
        operation_id=f"deleteStudio{name}",
        response_model=APIResponse[schemas.DeletedData],
    )


record_routes(models.ChapterSummary, schemas.SummaryInput, schemas.SummaryData, "summaries", "Summary")
record_routes(models.StoryFact, schemas.FactInput, schemas.FactData, "facts", "Fact")
record_routes(models.PlotThread, schemas.ThreadInput, schemas.ThreadData, "threads", "Thread")
record_routes(models.StoryEvent, schemas.EventInput, schemas.EventData, "events", "Event")
record_routes(models.CharacterKnowledge, schemas.KnowledgeInput, schemas.KnowledgeData, "knowledge", "Knowledge")
record_routes(models.ContinuityIssue, schemas.IssueInput, schemas.IssueData, "issues", "Issue")
record_routes(models.ChapterPlan, schemas.PlanInput, schemas.PlanData, "plans", "Plan")
record_routes(models.RevisionNote, schemas.NoteInput, schemas.NoteData, "notes", "Note")
record_routes(models.StyleRule, schemas.RuleInput, schemas.RuleData, "rules", "Rule")


@router.get("/recall", operation_id="getWritingRecall")
async def recall(
    project_id: UUID,
    document_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    chapters: int = Query(default=5, ge=1, le=20),
    story_order: int | None = Query(default=None, ge=0),
) -> APIResponse[schemas.RecallData]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    state = await source_state(session, project_id)
    docs, _, _, order = state
    if document_id not in order:
        raise _not_found()
    current = order.index(document_id)
    previous = [item for item in order[:current] if docs[item].kind == "manuscript"][-chapters:]
    summaries = (
        await session.exec(
            select(models.ChapterSummary)
            .where(
                col(models.ChapterSummary.project_id) == project_id,
                col(models.ChapterSummary.source_document_id).in_(previous),
                col(models.ChapterSummary.status) == "confirmed",
            )
            .order_by(col(models.ChapterSummary.updated_at).desc())
        )
    ).all()
    by_source: dict[UUID | None, schemas.SummaryData] = {}
    for row in summaries:
        by_source.setdefault(row.source_document_id, record_data(row, schemas.SummaryData, state))
    facts = (
        await session.exec(
            select(models.StoryFact).where(
                col(models.StoryFact.project_id) == project_id, col(models.StoryFact.kind) == "fact"
            )
        )
    ).all()
    visible = set(order[:current])
    fact_data = [
        record_data(row, schemas.FactData, state)
        for row in facts
        if (row.source_document_id is None or row.source_document_id in visible)
        and (story_order is None or row.story_order is None or row.story_order <= story_order)
    ]
    threads = (
        await session.exec(
            select(models.PlotThread)
            .where(
                col(models.PlotThread.project_id) == project_id,
                col(models.PlotThread.status).in_(["open", "progressing"]),
                (
                    col(models.PlotThread.source_document_id).is_(None)
                    | col(models.PlotThread.source_document_id).in_(visible)
                ),
            )
            .order_by(col(models.PlotThread.updated_at).desc())
            .limit(50)
        )
    ).all()
    thread_data = []
    for thread in threads:
        if thread.source_document_id and thread.source_document_id not in visible:
            continue
        item = record_data(thread, schemas.ThreadData, state)
        item.overdue = thread.target_document_id in order[:current]
        thread_data.append(item)
    result_summaries = [by_source[item] for item in previous if item in by_source]
    stale = (
        sum(item.source_stale for item in result_summaries)
        + sum(item.source_stale for item in fact_data)
        + sum(item.source_stale for item in thread_data)
    )
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=schemas.RecallData(
            summaries=result_summaries,
            facts=fact_data,
            threads=thread_data,
            stale_count=stale,
            boundary_document_id=document_id,
        ),
    )


@router.get("/threads/{record_id}/updates", operation_id="listThreadUpdates")
async def thread_updates(
    project_id: UUID,
    record_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> APIResponse[schemas.StudioPage[schemas.ThreadUpdateData]]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    await owned_record(session, models.PlotThread, project_id, record_id)
    total = (
        await session.exec(
            select(func.count())
            .select_from(models.PlotThreadUpdate)
            .where(col(models.PlotThreadUpdate.thread_id) == record_id)
        )
    ).one()
    rows = (
        await session.exec(
            select(models.PlotThreadUpdate)
            .where(col(models.PlotThreadUpdate.thread_id) == record_id)
            .order_by(col(models.PlotThreadUpdate.created_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=schemas.StudioPage(
            items=[schemas.ThreadUpdateData.model_validate(row, from_attributes=True) for row in rows],
            total=total,
            page=page,
            page_size=page_size,
            pages=ceil(total / page_size),
        ),
    )


@router.get("/schedule", operation_id="getReleaseSchedule")
async def get_schedule(
    project_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[schemas.ScheduleData]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    row = await session.get(models.ReleaseSchedule, project_id)
    plans = (
        await session.exec(
            select(models.ChapterPlan)
            .where(col(models.ChapterPlan.project_id) == project_id)
            .order_by(col(models.ChapterPlan.updated_at).desc(), col(models.ChapterPlan.id).desc())
        )
    ).all()
    state = await source_state(session, project_id)
    nonempty = set(
        (
            await session.exec(
                select(DocumentContent.document_id).where(
                    col(DocumentContent.document_id).in_(state[0]), col(DocumentContent.word_count) > 0
                )
            )
        ).all()
    )
    latest: dict[UUID, models.ChapterPlan] = {}
    for item in plans:
        if item.source_document_id:
            latest.setdefault(item.source_document_id, item)
    ready = {
        document_id
        for document_id, item in latest.items()
        if item.delivery_status == "ready"
        and document_id in state[0]
        and state[0][document_id].kind == "manuscript"
        and document_id in nonempty
        and not record_data(item, schemas.PlanData, state).source_stale
    }
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=schemas.ScheduleData(
            chapters_per_week=row.chapters_per_week if row else None,
            note=row.note if row else "",
            ready_chapters=len(ready),
            estimated_days=floor(len(ready) * 7 / row.chapters_per_week) if row else None,
        ),
    )


@router.put("/schedule", operation_id="setReleaseSchedule")
async def set_schedule(
    project_id: UUID, payload: schemas.ScheduleInput, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[schemas.ScheduleData]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id, lock=True)
    row = await session.get(models.ReleaseSchedule, project_id)
    if row is None:
        row = models.ReleaseSchedule(project_id=project_id, **payload.model_dump())
    else:
        row.chapters_per_week = payload.chapters_per_week
        row.note = payload.note
    session.add(row)
    await session.commit()
    return await get_schedule(project_id, context, session)
