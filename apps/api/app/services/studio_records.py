"""版本化创作资料的权限、来源校验和分页操作。"""

import hashlib
from datetime import UTC, datetime
from math import ceil
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.ai import AIResult
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.planning import Character
from app.models.studio import (
    ChapterPlan,
    ChapterSummary,
    ContinuityIssue,
    PlotThread,
    PlotThreadUpdate,
    SourceRecord,
    StoryEvent,
)
from app.schemas.studio import SourceInput, StudioPage
from app.services.projects import _conflict, _not_found, _owned_project


async def source_state(
    session: AsyncSession, project_id: UUID
) -> tuple[dict[UUID, Document], dict[UUID, int], str, list[UUID]]:
    docs = list(
        (
            await session.exec(
                select(Document).where(col(Document.project_id) == project_id).execution_options(populate_existing=True)
            )
        ).all()
    )
    by_id = {row.id: row for row in docs}
    versions = dict(
        (
            await session.exec(
                select(DocumentContent.document_id, DocumentContent.version)
                .join(Document, col(Document.id) == DocumentContent.document_id)
                .where(col(Document.project_id) == project_id)
            )
        ).all()
    )
    ordered: list[UUID] = []
    children: dict[UUID | None, list[Document]] = {}
    for row in docs:
        children.setdefault(row.parent_id, []).append(row)

    def visit(parent: UUID | None) -> None:
        for row in sorted(children.get(parent, []), key=lambda item: (item.position, str(item.id))):
            if row.deleted_at is None and row.status == "active":
                ordered.append(row.id)
                visit(row.id)

    visit(None)
    digest = hashlib.sha256(",".join(map(str, ordered)).encode()).hexdigest()
    return by_id, versions, digest, ordered


def source_order_hash(order: list[UUID], source_id: UUID) -> str:
    prefix = order[: order.index(source_id) + 1] if source_id in order else []
    return hashlib.sha256(",".join(map(str, prefix)).encode()).hexdigest()


def record_data[DataT: BaseModel](
    row: SourceRecord, schema: type[DataT], state: tuple[dict[UUID, Document], dict[UUID, int], str, list[UUID]]
) -> DataT:
    docs, versions, _, ordered = state
    source = docs.get(row.source_document_id) if row.source_document_id else None
    missing = row.source_document_id is not None and (
        source is None or source.deleted_at is not None or source.status != "active"
    )
    stale = missing or (
        row.source_document_id is not None
        and (
            versions.get(row.source_document_id) != row.source_version
            or row.source_order != source_order_hash(ordered, row.source_document_id)
        )
    )
    if isinstance(row, ContinuityIssue) and row.other_document_id:
        other = docs.get(row.other_document_id)
        stale = (
            stale
            or other is None
            or other.status != "active"
            or versions.get(row.other_document_id) != row.other_version
        )
    values = row.model_dump()
    values.update(source_missing=missing, source_stale=stale, source_title=source.title if source else None)
    return schema.model_validate(values)


async def owned_record[RecordT: SourceRecord](
    session: AsyncSession, model: type[RecordT], project_id: UUID, record_id: UUID
) -> RecordT:
    row = await session.get(model, record_id)
    if row is None or row.project_id != project_id:
        raise _not_found()
    return row


async def list_records[RecordT: SourceRecord, DataT: BaseModel](
    session: AsyncSession,
    owner_id: UUID,
    project_id: UUID,
    model: type[RecordT],
    schema: type[DataT],
    page: int,
    page_size: int,
    q: str,
    source_document_id: UUID | None = None,
) -> StudioPage[DataT]:
    await _owned_project(session, owner_id=owner_id, project_id=project_id)
    filters = [col(model.project_id) == project_id]
    if source_document_id is not None:
        filters.append(col(model.source_document_id) == source_document_id)
    if q.strip():
        filters.append(
            or_(
                col(model.title).icontains(q.strip(), autoescape=True),
                col(model.body).icontains(q.strip(), autoescape=True),
            )
        )
    total = (await session.exec(select(func.count()).select_from(model).where(*filters))).one()
    ordering: list[ColumnElement] = [col(model.updated_at).desc(), col(model.id).desc()]
    if model is StoryEvent:
        ordering = [col(StoryEvent.story_order).asc().nulls_last(), col(model.id).asc()]
    elif model is ChapterPlan:
        ordering = [col(ChapterPlan.position).asc(), col(model.id).asc()]
    rows = (
        await session.exec(
            select(model).where(*filters).order_by(*ordering).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()
    state = await source_state(session, project_id)
    return StudioPage(
        items=[record_data(row, schema, state) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size),
    )


async def save_record[RecordT: SourceRecord](
    session: AsyncSession,
    owner_id: UUID,
    project_id: UUID,
    model: type[RecordT],
    payload: SourceInput,
    record_id: UUID | None = None,
) -> RecordT:
    await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
    state = await source_state(session, project_id)
    docs, versions, _, ordered = state
    values = payload.model_dump()
    if model is ChapterSummary and (
        payload.source_document_id not in docs or docs[payload.source_document_id].kind != "manuscript"
    ):
        raise _not_found()
    for key in ("source_document_id", "target_document_id", "other_document_id"):
        document_id = values.get(key)
        if document_id:
            source = docs.get(document_id)
            if source is None or source.status != "active" or source.deleted_at is not None or source.kind == "folder":
                raise _not_found()
    if values.get("character_id"):
        character = await session.get(Character, values["character_id"])
        if character is None or character.project_id != project_id or character.deleted_at is not None:
            raise _not_found()
    if payload.source_document_id:
        current_version = versions.get(payload.source_document_id)
        if payload.source_version is not None and payload.source_version != current_version:
            raise _conflict("source_version_conflict")
        values["source_version"] = current_version
        values["source_order"] = source_order_hash(ordered, payload.source_document_id)
    else:
        values["source_version"] = None
        values["source_order"] = None
    for document_key, version_key, quote_key in (
        ("source_document_id", "source_version", "evidence"),
        ("other_document_id", "other_version", "other_evidence"),
        ("source_document_id", "source_version", "quote"),
    ):
        if values.get(document_key):
            document_id = values[document_key]
            if values.get(version_key) is not None and values[version_key] != versions.get(document_id):
                raise _conflict("source_version_conflict")
            values[version_key] = versions.get(document_id)
            if values.get(quote_key):
                content = await session.get(DocumentContent, document_id)
                if content is None or values[quote_key] not in content.content:
                    raise _conflict("source_quote_changed")
        elif values.get(quote_key):
            raise _conflict("evidence_requires_source")
    row = await owned_record(session, model, project_id, record_id) if record_id else model(project_id=project_id)
    if record_id and row.version != payload.version:
        raise _conflict("record_version_conflict")
    if (
        isinstance(row, ContinuityIssue)
        and values.get("status") == "ignored"
        and not str(values.get("resolution", "")).strip()
    ):
        raise _conflict("ignore_reason_required")
    for key, value in values.items():
        if key != "version":
            setattr(row, key, value)
    row.version = row.version + 1 if record_id else 1
    row.updated_at = datetime.now(UTC)
    session.add(row)
    await session.flush()
    if isinstance(row, ChapterSummary) and row.ai_task_id and row.status in {"confirmed", "rejected"}:
        results = (await session.exec(select(AIResult).where(col(AIResult.task_id) == row.ai_task_id))).all()
        for result in results:
            if result.purpose == "summary" and result.status == "candidate":
                result.status = "accepted" if row.status == "confirmed" else "rejected"
                result.decided_at = datetime.now(UTC)
                session.add(result)
    if isinstance(row, PlotThread):
        now = datetime.now(UTC)
        session.add(
            PlotThreadUpdate(
                thread_id=row.id,
                status=row.status,
                note=row.body,
                document_id=row.source_document_id,
                created_at=now,
                updated_at=now,
            )
        )
    await session.commit()
    await session.refresh(row)
    return row
