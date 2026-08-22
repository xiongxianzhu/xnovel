"""作品领域服务。"""

from __future__ import annotations

import hashlib
import math
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
    DocumentSummary,
    ProjectCreateRequest,
    ProjectDetailData,
    ProjectListData,
    ProjectSummary,
)

DEFAULT_DOCUMENT_TITLE = "未命名文档"


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
                    select(func.count()).select_from(Project).where(
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


def _not_found() -> APIException:
    return APIException(status_code=404, code=ErrorCode.NOT_FOUND, msg=ErrorMessage.NOT_FOUND)


def _service_unavailable() -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
    )
