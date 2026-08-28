"""作品领域服务。"""

from __future__ import annotations

import hashlib
import math
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.project import Project
from app.schemas.projects import (
    DocumentContentData,
    DocumentContentUpdateRequest,
    DocumentCreateRequest,
    DocumentDeleteData,
    DocumentListData,
    DocumentReorderRequest,
    DocumentSummary,
    DocumentTreeStatus,
    DocumentUpdateRequest,
    ProjectCreateRequest,
    ProjectDetailData,
    ProjectListData,
    ProjectSummary,
)

DEFAULT_DOCUMENT_TITLE = "未命名文档"

CONFLICT_EMPTY_FOLDER_REQUIRED = "folder_not_empty"
CONFLICT_LAST_MANUSCRIPT = "last_active_manuscript"
CONFLICT_INVALID_PARENT = "invalid_parent"
CONFLICT_TREE_CYCLE = "tree_cycle"
CONFLICT_TREE_CHANGED = "tree_changed"
CONFLICT_CONTENT_VERSION = "content_version_conflict"


def _timestamps(value: Any) -> tuple[Any, Any]:
    if value.created_at is None or value.updated_at is None:
        raise APIException(status_code=500, code=ErrorCode.INTERNAL_ERROR, msg=ErrorMessage.INTERNAL_ERROR)
    return value.created_at, value.updated_at


def document_summary(document: Document) -> DocumentSummary:
    created_at, updated_at = _timestamps(document)
    return DocumentSummary(
        id=document.id,
        title=document.title,
        kind=document.kind,
        parent_id=document.parent_id,
        position=document.position,
        status=document.status,
        created_at=created_at,
        updated_at=updated_at,
    )


def document_content_data(content: DocumentContent) -> DocumentContentData:
    created_at, updated_at = _timestamps(content)
    return DocumentContentData(
        document_id=content.document_id,
        content=content.content,
        content_format="plain_text",
        version=content.version,
        word_count=content.word_count,
        checksum=content.checksum,
        created_at=created_at,
        updated_at=updated_at,
    )


def count_document_words(content: str) -> int:
    """统计 CJK 单字与连续 Unicode 字母数字词组。"""

    count = 0
    inside_word = False
    for character in content:
        codepoint = ord(character)
        is_cjk = (
            0x3400 <= codepoint <= 0x4DBF
            or 0x4E00 <= codepoint <= 0x9FFF
            or 0xF900 <= codepoint <= 0xFAFF
            or 0x20000 <= codepoint <= 0x2EBEF
        )
        if is_cjk:
            count += 1
            inside_word = False
        elif character.isalnum():
            if not inside_word:
                count += 1
            inside_word = True
        else:
            inside_word = False
    return count


def project_summary(project: Project) -> ProjectSummary:
    created_at, updated_at = _timestamps(project)
    return ProjectSummary(
        id=project.id,
        title=project.title,
        structure_mode=project.structure_mode,
        status=project.status,
        created_at=created_at,
        updated_at=updated_at,
    )


def project_detail(project: Project, document: Document) -> ProjectDetailData:
    return ProjectDetailData(**project_summary(project).model_dump(), initial_document=document_summary(document))


async def list_projects(
    session: AsyncSession,
    *,
    owner_id: UUID,
    page: int,
    page_size: int,
) -> ProjectListData:
    offset = (page - 1) * page_size
    try:
        total = int(
            (
                await session.exec(
                    select(func.count())
                    .select_from(Project)
                    .where(
                        col(Project.owner_id) == owner_id,
                        col(Project.deleted_at).is_(None),
                    )
                )
            ).one()
        )
        projects = (
            await session.exec(
                select(Project)
                .where(
                    col(Project.owner_id) == owner_id,
                    col(Project.deleted_at).is_(None),
                )
                .order_by(col(Project.updated_at).desc(), col(Project.id).desc())
                .offset(offset)
                .limit(page_size)
            )
        ).all()
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc

    return ProjectListData(
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
        items=[project_summary(project) for project in projects],
    )


async def create_project(
    session: AsyncSession,
    *,
    owner_id: UUID,
    payload: ProjectCreateRequest,
) -> ProjectDetailData:
    project = Project(owner_id=owner_id, title=payload.title)
    document = Document(project_id=project.id, title=DEFAULT_DOCUMENT_TITLE, kind="manuscript", position=0)
    content = DocumentContent(
        document_id=document.id,
        content="",
        content_format="plain_text",
        version=1,
        word_count=0,
        checksum=hashlib.sha256(b"").hexdigest(),
    )
    try:
        session.add(project)
        await session.flush()
        session.add(document)
        session.add(content)
        await session.commit()
        await session.refresh(project)
        await session.refresh(document)
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return project_detail(project, document)


async def get_project(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
) -> ProjectDetailData:
    try:
        project = (
            await session.exec(
                select(Project).where(
                    col(Project.id) == project_id,
                    col(Project.owner_id) == owner_id,
                    col(Project.deleted_at).is_(None),
                )
            )
        ).one_or_none()
        if project is None:
            raise _not_found()
        document = (
            await session.exec(
                select(Document)
                .where(
                    col(Document.project_id) == project.id,
                    col(Document.deleted_at).is_(None),
                    col(Document.parent_id).is_(None),
                )
                .order_by(col(Document.position), col(Document.id))
            )
        ).first()
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    if document is None:
        raise APIException(status_code=500, code=ErrorCode.INTERNAL_ERROR, msg=ErrorMessage.INTERNAL_ERROR)
    return project_detail(project, document)


async def _owned_project(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    lock: bool = False,
) -> Project:
    statement = select(Project).where(
        col(Project.id) == project_id,
        col(Project.owner_id) == owner_id,
        col(Project.deleted_at).is_(None),
    )
    if lock:
        statement = statement.with_for_update()
    project = (await session.exec(statement)).one_or_none()
    if project is None:
        raise _not_found()
    return project


async def _visible_document(
    session: AsyncSession,
    *,
    project_id: UUID,
    document_id: UUID,
    active_only: bool = False,
    lock: bool = False,
) -> Document:
    statement = select(Document).where(
        col(Document.id) == document_id,
        col(Document.project_id) == project_id,
        col(Document.deleted_at).is_(None),
    )
    if active_only:
        statement = statement.where(col(Document.status) == "active")
    if lock:
        statement = statement.with_for_update()
    document = (await session.exec(statement)).one_or_none()
    if document is None:
        raise _not_found()
    return document


def _parent_filter(parent_id: UUID | None) -> Any:
    if parent_id is None:
        return col(Document.parent_id).is_(None)
    return col(Document.parent_id) == parent_id


async def _active_siblings(
    session: AsyncSession,
    *,
    project_id: UUID,
    parent_id: UUID | None,
    lock: bool = False,
) -> list[Document]:
    statement = (
        select(Document)
        .where(
            col(Document.project_id) == project_id,
            col(Document.deleted_at).is_(None),
            col(Document.status) == "active",
            _parent_filter(parent_id),
        )
        .order_by(col(Document.position), col(Document.id))
    )
    if lock:
        statement = statement.with_for_update()
    return list((await session.exec(statement)).all())


async def _load_documents(
    session: AsyncSession,
    *,
    project_id: UUID,
    tree_status: DocumentTreeStatus,
) -> list[Document]:
    statement = select(Document).where(
        col(Document.project_id) == project_id,
        col(Document.deleted_at).is_(None),
    )
    if tree_status != "all":
        statement = statement.where(col(Document.status) == tree_status)
    documents = list((await session.exec(statement)).all())
    return sorted(documents, key=lambda item: (str(item.parent_id or ""), item.position, str(item.id)))


def _touch_project(project: Project) -> datetime:
    now = datetime.now(UTC)
    project.updated_at = now
    return now


def _conflict(reason: str) -> APIException:
    return APIException(
        status_code=409,
        code=ErrorCode.CONFLICT,
        msg=ErrorMessage.CONFLICT,
        data={"reason": reason},
    )


def _same_timestamp(actual: datetime | None, expected: datetime) -> bool:
    if actual is None:
        return False
    normalized_actual = actual.replace(tzinfo=UTC) if actual.tzinfo is None else actual.astimezone(UTC)
    normalized_expected = expected.replace(tzinfo=UTC) if expected.tzinfo is None else expected.astimezone(UTC)
    return normalized_actual == normalized_expected


async def list_documents(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    tree_status: DocumentTreeStatus,
) -> DocumentListData:
    try:
        await _owned_project(session, owner_id=owner_id, project_id=project_id)
        documents = await _load_documents(session, project_id=project_id, tree_status=tree_status)
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    return DocumentListData(items=[document_summary(document) for document in documents])


async def _editable_document(
    session: AsyncSession,
    *,
    project_id: UUID,
    document_id: UUID,
    lock: bool = False,
) -> Document:
    document = await _visible_document(
        session,
        project_id=project_id,
        document_id=document_id,
        active_only=True,
        lock=lock,
    )
    if document.kind == "folder":
        raise _not_found()
    return document


async def get_document_content(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    document_id: UUID,
) -> DocumentContentData:
    try:
        await _owned_project(session, owner_id=owner_id, project_id=project_id)
        await _editable_document(session, project_id=project_id, document_id=document_id)
        content = await session.get(DocumentContent, document_id)
        if content is None:
            raise APIException(
                status_code=500,
                code=ErrorCode.INTERNAL_ERROR,
                msg=ErrorMessage.INTERNAL_ERROR,
            )
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    return document_content_data(content)


async def save_document_content(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    document_id: UUID,
    payload: DocumentContentUpdateRequest,
) -> DocumentContentData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        document = await _editable_document(
            session,
            project_id=project_id,
            document_id=document_id,
            lock=True,
        )
        content = (
            await session.exec(
                select(DocumentContent).where(col(DocumentContent.document_id) == document_id).with_for_update()
            )
        ).one_or_none()
        if content is None:
            raise APIException(
                status_code=500,
                code=ErrorCode.INTERNAL_ERROR,
                msg=ErrorMessage.INTERNAL_ERROR,
            )
        if content.version != payload.version:
            raise _conflict(CONFLICT_CONTENT_VERSION)

        now = _touch_project(project)
        content.content = payload.content
        content.content_format = payload.content_format
        content.version += 1
        content.word_count = count_document_words(payload.content)
        content.checksum = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
        content.updated_by = owner_id
        content.updated_at = now
        document.updated_at = now
        session.add(content)
        session.add(document)
        await session.commit()
        await session.refresh(content)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return document_content_data(content)


async def create_document(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    payload: DocumentCreateRequest,
) -> DocumentSummary:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        if payload.parent_id is not None:
            parent = await _visible_document(
                session,
                project_id=project_id,
                document_id=payload.parent_id,
                active_only=True,
                lock=True,
            )
            if parent.kind != "folder":
                raise _conflict(CONFLICT_INVALID_PARENT)
        siblings = await _active_siblings(
            session,
            project_id=project_id,
            parent_id=payload.parent_id,
            lock=True,
        )
        document = Document(
            project_id=project_id,
            parent_id=payload.parent_id,
            kind=payload.kind,
            title=payload.title,
            position=len(siblings),
        )
        session.add(document)
        if payload.kind != "folder":
            session.add(
                DocumentContent(
                    document_id=document.id,
                    content="",
                    content_format="plain_text",
                    version=1,
                    word_count=0,
                    checksum=hashlib.sha256(b"").hexdigest(),
                )
            )
        _touch_project(project)
        await session.commit()
        await session.refresh(document)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return document_summary(document)


async def _ensure_not_last_manuscript(
    session: AsyncSession,
    *,
    project_id: UUID,
    document: Document,
) -> None:
    if document.kind != "manuscript" or document.status != "active":
        return
    count = int(
        (
            await session.exec(
                select(func.count())
                .select_from(Document)
                .where(
                    col(Document.project_id) == project_id,
                    col(Document.kind) == "manuscript",
                    col(Document.status) == "active",
                    col(Document.deleted_at).is_(None),
                )
            )
        ).one()
    )
    if count <= 1:
        raise _conflict(CONFLICT_LAST_MANUSCRIPT)


async def _ensure_empty_folder(session: AsyncSession, *, document: Document) -> None:
    if document.kind != "folder":
        return
    child = (
        await session.exec(
            select(Document.id).where(
                col(Document.project_id) == document.project_id,
                col(Document.parent_id) == document.id,
                col(Document.deleted_at).is_(None),
            )
        )
    ).first()
    if child is not None:
        raise _conflict(CONFLICT_EMPTY_FOLDER_REQUIRED)


async def _compact_active_siblings(
    session: AsyncSession,
    *,
    project_id: UUID,
    parent_id: UUID | None,
    now: datetime,
) -> None:
    siblings = await _active_siblings(session, project_id=project_id, parent_id=parent_id, lock=True)
    for position, sibling in enumerate(siblings):
        if sibling.position != position:
            sibling.position = position
            sibling.updated_at = now
            session.add(sibling)


async def update_document(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    document_id: UUID,
    payload: DocumentUpdateRequest,
) -> DocumentSummary:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        document = await _visible_document(
            session,
            project_id=project_id,
            document_id=document_id,
            lock=True,
        )
        old_parent_id = document.parent_id
        now = _touch_project(project)
        if payload.title is not None:
            document.title = payload.title
        if payload.status is not None and payload.status != document.status:
            if payload.status == "archived":
                await _ensure_empty_folder(session, document=document)
                await _ensure_not_last_manuscript(session, project_id=project_id, document=document)
                document.status = "archived"
                document.updated_at = now
                session.add(document)
                await session.flush()
                await _compact_active_siblings(
                    session,
                    project_id=project_id,
                    parent_id=old_parent_id,
                    now=now,
                )
            else:
                if document.parent_id is not None:
                    parent = await _visible_document(
                        session,
                        project_id=project_id,
                        document_id=document.parent_id,
                        active_only=True,
                        lock=True,
                    )
                    if parent.kind != "folder":
                        raise _conflict(CONFLICT_INVALID_PARENT)
                siblings = await _active_siblings(
                    session,
                    project_id=project_id,
                    parent_id=document.parent_id,
                    lock=True,
                )
                document.status = "active"
                document.position = len(siblings)
        document.updated_at = now
        session.add(document)
        await session.commit()
        await session.refresh(document)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return document_summary(document)


async def _validate_target_parent(
    session: AsyncSession,
    *,
    project_id: UUID,
    document: Document,
    target_parent_id: UUID | None,
) -> None:
    ancestor_id = target_parent_id
    while ancestor_id is not None:
        if ancestor_id == document.id:
            raise _conflict(CONFLICT_TREE_CYCLE)
        ancestor = await _visible_document(
            session,
            project_id=project_id,
            document_id=ancestor_id,
            active_only=True,
            lock=True,
        )
        if ancestor.kind != "folder":
            raise _conflict(CONFLICT_INVALID_PARENT)
        ancestor_id = ancestor.parent_id


async def reorder_documents(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    payload: DocumentReorderRequest,
) -> DocumentListData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        document = await _visible_document(
            session,
            project_id=project_id,
            document_id=payload.document_id,
            active_only=True,
            lock=True,
        )
        await _validate_target_parent(
            session,
            project_id=project_id,
            document=document,
            target_parent_id=payload.target_parent_id,
        )
        source_parent_id = document.parent_id
        expected_parents = {source_parent_id, payload.target_parent_id}
        groups_by_parent = {group.parent_id: group for group in payload.groups}
        if len(groups_by_parent) != len(payload.groups) or set(groups_by_parent) != expected_parents:
            raise _conflict(CONFLICT_TREE_CHANGED)

        source_siblings = await _active_siblings(
            session,
            project_id=project_id,
            parent_id=source_parent_id,
            lock=True,
        )
        target_siblings = (
            source_siblings
            if source_parent_id == payload.target_parent_id
            else await _active_siblings(
                session,
                project_id=project_id,
                parent_id=payload.target_parent_id,
                lock=True,
            )
        )
        actual_documents = {item.id: item for item in source_siblings + target_siblings}
        submitted_items = [item for group in payload.groups for item in group.items]
        submitted_ids = [item.id for item in submitted_items]
        if len(submitted_ids) != len(set(submitted_ids)) or set(submitted_ids) != set(actual_documents):
            raise _conflict(CONFLICT_TREE_CHANGED)
        for item in submitted_items:
            if not _same_timestamp(actual_documents[item.id].updated_at, item.updated_at):
                raise _conflict(CONFLICT_TREE_CHANGED)

        source_final_ids = [item.id for item in groups_by_parent[source_parent_id].items]
        if source_parent_id == payload.target_parent_id:
            if set(source_final_ids) != {item.id for item in source_siblings}:
                raise _conflict(CONFLICT_TREE_CHANGED)
        else:
            target_final_ids = [item.id for item in groups_by_parent[payload.target_parent_id].items]
            if set(source_final_ids) != {item.id for item in source_siblings if item.id != document.id}:
                raise _conflict(CONFLICT_TREE_CHANGED)
            if set(target_final_ids) != {item.id for item in target_siblings} | {document.id}:
                raise _conflict(CONFLICT_TREE_CHANGED)
        if payload.document_id not in {item.id for item in groups_by_parent[payload.target_parent_id].items}:
            raise _conflict(CONFLICT_TREE_CHANGED)

        now = _touch_project(project)
        for parent_id, group in groups_by_parent.items():
            for position, item in enumerate(group.items):
                current = actual_documents[item.id]
                current.parent_id = parent_id
                current.position = position
                current.updated_at = now
                session.add(current)
        await session.commit()
        documents = await _load_documents(session, project_id=project_id, tree_status="active")
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return DocumentListData(items=[document_summary(item) for item in documents])


async def delete_document(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    document_id: UUID,
) -> DocumentDeleteData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        document = await _visible_document(
            session,
            project_id=project_id,
            document_id=document_id,
            lock=True,
        )
        await _ensure_empty_folder(session, document=document)
        await _ensure_not_last_manuscript(session, project_id=project_id, document=document)
        old_parent_id = document.parent_id
        was_active = document.status == "active"
        now = _touch_project(project)
        document.deleted_at = now
        document.updated_at = now
        session.add(document)
        await session.flush()
        if was_active:
            await _compact_active_siblings(
                session,
                project_id=project_id,
                parent_id=old_parent_id,
                now=now,
            )
        await session.commit()
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return DocumentDeleteData(id=document_id, deleted=True)


def _not_found() -> APIException:
    return APIException(status_code=404, code=ErrorCode.NOT_FOUND, msg=ErrorMessage.NOT_FOUND)


def _service_unavailable() -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
    )
