"""稿件检索、导入与交稿预检入口。"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Query, UploadFile
from sqlalchemy import or_
from sqlmodel import col, select

from app.api.deps import SessionDep
from app.core.security import PasswordChangeCompletedContextDep
from app.models.document_content import DocumentContent
from app.models.planning import Character, DocumentCharacterLink, DocumentWorldEntryLink, WorldEntry
from app.models.studio import RevisionNote, StyleRule
from app.schemas.common import APIResponse
from app.schemas.manuscript_tools import (
    ExportDocument,
    ExportPreview,
    ExportSelection,
    ExportWarning,
    ImpactHit,
    ImportCommit,
    ImportPreview,
    ImportResult,
    SearchHit,
)
from app.schemas.studio import StudioPage
from app.services.exporting import _safe_filename, _safe_title
from app.services.manuscript_tools import MAX_IMPORT_BYTES, commit_import, preview_import, search_manuscript
from app.services.projects import _conflict, _not_found, _owned_project
from app.services.studio_records import source_state

router = APIRouter()


@router.get("/projects/{project_id}/search", operation_id="searchProjectManuscript")
async def search(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    include_archived: bool = False,
) -> APIResponse[StudioPage[SearchHit]]:
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=await search_manuscript(session, context.user.id, project_id, q, page, page_size, include_archived),
    )


@router.post("/manuscript-imports/preview", operation_id="previewManuscriptImport")
async def import_preview(
    context: PasswordChangeCompletedContextDep,
    file: Annotated[UploadFile, File()],
    encoding: str = "auto",
    split: str = "auto",
) -> APIResponse[ImportPreview]:
    if not (file.filename or "").lower().endswith((".txt", ".md", ".markdown")):
        raise _conflict("import_file_type_invalid")
    raw = await file.read(MAX_IMPORT_BYTES + 1)
    return APIResponse(code=0, msg="SUCCESS", data=preview_import(raw, file.filename or "", encoding, split))


@router.post("/manuscript-imports", operation_id="commitManuscriptImport", status_code=201)
async def import_commit(
    payload: ImportCommit, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[ImportResult]:
    return APIResponse(code=0, msg="SUCCESS", data=await commit_import(session, context.user.id, payload))


@router.post("/projects/{project_id}/export-preview", operation_id="previewProjectExport")
async def export_preview(
    project_id: UUID, payload: ExportSelection, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[ExportPreview]:
    project = await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    docs, _, _, order = await source_state(session, project_id)
    selection = payload.document_ids or [item for item in order if docs[item].kind == "manuscript"]
    if len(selection) != len(set(selection)) or any(
        item not in order or docs[item].kind != "manuscript" for item in selection
    ):
        raise _conflict("export_selection_invalid")
    contents = {
        row.document_id: row
        for row in (
            await session.exec(select(DocumentContent).where(col(DocumentContent.document_id).in_(selection)))
        ).all()
    }
    warnings: list[ExportWarning] = []
    titles: set[str] = set()
    chunks = (
        [f"# {_safe_title(project.title)}" if payload.format == "markdown" else project.title]
        if payload.include_titles
        else []
    )
    selected = []
    for document_id in selection:
        doc = docs[document_id]
        body = contents.get(document_id)
        if body is None:
            raise _conflict("export_source_missing")
        if not body.content.strip():
            warnings.append(ExportWarning(document_id=document_id, kind="empty", title=doc.title))
        if doc.title in titles:
            warnings.append(ExportWarning(document_id=document_id, kind="duplicate", title=doc.title))
        if any(marker in body.content for marker in ("TODO", "【待补】", "[待补]")):
            warnings.append(ExportWarning(document_id=document_id, kind="placeholder", title=doc.title))
        titles.add(doc.title)
        selected.append(
            ExportDocument(document_id=document_id, title=doc.title, version=body.version, word_count=body.word_count)
        )
        if payload.include_titles:
            chunks.append(
                f"## {_safe_title(doc.title)}" if payload.format == "markdown" else f"【{_safe_title(doc.title)}】"
            )
        chunks.append(body.content)
    notes = (
        await session.exec(
            select(RevisionNote).where(col(RevisionNote.project_id) == project_id, col(RevisionNote.status) == "open")
        )
    ).all()
    warnings.extend(
        ExportWarning(document_id=note.source_document_id, kind="revision", title=note.title)
        for note in notes
        if note.source_document_id is None or note.source_document_id in selection
    )
    extension = "md" if payload.format == "markdown" else "txt"
    return APIResponse(
        code=0,
        msg="SUCCESS",
        data=ExportPreview(
            documents=selected,
            warnings=warnings,
            filename=f"{_safe_filename(project.title)}.{extension}",
            content=payload.separator.join(chunks).rstrip() + "\n",
        ),
    )


@router.get("/projects/{project_id}/impact", operation_id="getSettingImpact")
async def setting_impact(
    project_id: UUID,
    entity_id: UUID,
    kind: str,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    previous_name: str = Query(default="", max_length=200),
) -> APIResponse[list[ImpactHit]]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    terms = [previous_name] if previous_name.strip() else []
    if kind == "character":
        entity = await session.get(Character, entity_id)
        if entity is None or entity.project_id != project_id or entity.deleted_at is not None:
            raise _not_found()
        terms.extend([entity.name, *entity.aliases])
        linked = (
            await session.exec(
                select(DocumentCharacterLink.document_id).where(
                    col(DocumentCharacterLink.character_id) == entity_id,
                    col(DocumentCharacterLink.project_id) == project_id,
                )
            )
        ).all()
    elif kind == "world":
        entry = await session.get(WorldEntry, entity_id)
        if entry is None or entry.project_id != project_id or entry.deleted_at is not None:
            raise _not_found()
        terms.append(entry.title)
        linked = (
            await session.exec(
                select(DocumentWorldEntryLink.document_id).where(
                    col(DocumentWorldEntryLink.world_entry_id) == entity_id,
                    col(DocumentWorldEntryLink.project_id) == project_id,
                )
            )
        ).all()
    else:
        raise _not_found()
    docs, _, _, order = await source_state(session, project_id)
    rows = (
        await session.exec(
            select(DocumentContent).where(
                col(DocumentContent.document_id).in_(order),
                col(DocumentContent.document_id).in_(linked)
                | or_(*[col(DocumentContent.content).icontains(term, autoescape=True) for term in terms if term]),
            )
        )
    ).all()
    results = []
    for row in rows:
        term = next((term for term in terms if term in row.content), "")
        start = row.content.find(term) if term else 0
        results.append(
            ImpactHit(
                document_id=row.document_id,
                title=docs[row.document_id].title,
                evidence=row.content[max(0, start - 40) : start + 160],
                explicit_reference=row.document_id in linked,
            )
        )
    return APIResponse(code=0, msg="SUCCESS", data=results)


@router.get("/projects/{project_id}/style-check", operation_id="checkProjectStyle")
async def style_check(
    project_id: UUID, document_id: UUID, context: PasswordChangeCompletedContextDep, session: SessionDep
) -> APIResponse[list[ExportWarning]]:
    await _owned_project(session, owner_id=context.user.id, project_id=project_id)
    docs, _, _, order = await source_state(session, project_id)
    if document_id not in order:
        raise _not_found()
    content = await session.get(DocumentContent, document_id)
    rules = (
        await session.exec(
            select(StyleRule).where(col(StyleRule.project_id) == project_id, col(StyleRule.kind) == "term")
        )
    ).all()
    warnings = [
        ExportWarning(document_id=document_id, kind="term", title=f"{rule.body} → {rule.preferred}")
        for rule in rules
        if content and rule.body and rule.body in content.content
    ]
    return APIResponse(code=0, msg="SUCCESS", data=warnings)
