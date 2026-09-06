"""作者可见的正文历史接口。"""

from math import ceil
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func
from sqlmodel import col, select

from app.api.deps import SessionDep
from app.core.security import PasswordChangeCompletedContextDep
from app.models.document_content import DocumentContent
from app.models.document_revision import DocumentRevision
from app.schemas.common import APIResponse
from app.schemas.projects import DocumentContentData, DocumentContentUpdateRequest
from app.schemas.revisions import (
    CheckpointRequest,
    RestoreRevisionRequest,
    RevisionDetail,
    RevisionPage,
    RevisionSummary,
)
from app.services.document_revisions import capture_revision
from app.services.projects import _conflict, _editable_document, _not_found, _owned_project, save_document_content

router = APIRouter(prefix="/projects/{project_id}/documents/{document_id}/revisions")


@router.get("", operation_id="listDocumentRevisions")
async def list_revisions(
    project_id: UUID,
    document_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> APIResponse[RevisionPage]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    await _editable_document(session, project_id=project_id, document_id=document_id)
    condition = col(DocumentRevision.document_id) == document_id
    total = (await session.exec(select(func.count()).select_from(DocumentRevision).where(condition))).one()
    rows = (
        await session.exec(
            select(DocumentRevision)
            .where(condition)
            .order_by(col(DocumentRevision.version).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=RevisionPage(
            items=[RevisionSummary.model_validate(row, from_attributes=True) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size),
        ),
    )


@router.post("/checkpoints", operation_id="createDocumentCheckpoint", status_code=201)
async def create_checkpoint(
    project_id: UUID,
    document_id: UUID,
    payload: CheckpointRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> APIResponse[RevisionDetail]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id, lock=True)
    await _editable_document(session, project_id=project_id, document_id=document_id, lock=True)
    content = await session.get(DocumentContent, document_id)
    if content is None:
        raise _not_found()
    if content.version != payload.version:
        raise _conflict("content_version_conflict")
    row = await capture_revision(session, content, payload.name)
    await session.commit()
    await session.refresh(row)
    return APIResponse(code=0, msg="SUCCESS", data=RevisionDetail.model_validate(row, from_attributes=True))


@router.get("/{revision_id}", operation_id="getDocumentRevision")
async def get_revision(
    project_id: UUID,
    document_id: UUID,
    revision_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> APIResponse[RevisionDetail]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    await _editable_document(session, project_id=project_id, document_id=document_id)
    row = await session.get(DocumentRevision, revision_id)
    if row is None or row.document_id != document_id:
        raise _not_found()
    return APIResponse(code=0, msg="SUCCESS", data=RevisionDetail.model_validate(row, from_attributes=True))


@router.post("/{revision_id}/restore", operation_id="restoreDocumentRevision")
async def restore_revision(
    project_id: UUID,
    document_id: UUID,
    revision_id: UUID,
    payload: RestoreRevisionRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> APIResponse[DocumentContentData]:
    snapshot = (await get_revision(project_id, document_id, revision_id, context, session)).data
    data = await save_document_content(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        document_id=document_id,
        payload=DocumentContentUpdateRequest(
            version=payload.version, content=snapshot.content, content_format=snapshot.content_format
        ),  # type: ignore[arg-type]
    )
    return APIResponse(code=0, msg="SUCCESS", data=data)
