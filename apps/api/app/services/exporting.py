"""作品正文导出。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.exceptions import APIException
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.schemas.planning import ExportFormat
from app.services.projects import _owned_project, _service_unavailable


@dataclass(frozen=True)
class ExportedProject:
    content: str
    filename: str
    media_type: str


def _safe_title(value: str) -> str:
    return " ".join(value.replace("\r", " ").replace("\n", " ").split())


def _safe_filename(value: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .")
    return (cleaned or "xnovel")[:80]


async def export_project(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    export_format: ExportFormat,
) -> ExportedProject:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id)
        documents = list(
            (
                await session.exec(
                    select(Document)
                    .where(
                        col(Document.project_id) == project_id,
                        col(Document.deleted_at).is_(None),
                        col(Document.status) == "active",
                        col(Document.kind).in_(["folder", "manuscript"]),
                    )
                    .order_by(col(Document.position), col(Document.id))
                )
            ).all()
        )
        manuscript_ids = [item.id for item in documents if item.kind == "manuscript"]
        contents = (
            list(
                (
                    await session.exec(
                        select(DocumentContent).where(col(DocumentContent.document_id).in_(manuscript_ids))
                    )
                ).all()
            )
            if manuscript_ids
            else []
        )
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc

    by_parent: dict[UUID | None, list[Document]] = {}
    for document in documents:
        by_parent.setdefault(document.parent_id, []).append(document)
    for siblings in by_parent.values():
        siblings.sort(key=lambda item: (item.position, str(item.id)))
    content_by_document = {item.document_id: item.content for item in contents}
    title = _safe_title(project.title)
    chunks: list[str] = []

    def visit(parent_id: UUID | None, depth: int) -> None:
        for document in by_parent.get(parent_id, []):
            heading = _safe_title(document.title)
            if export_format == "markdown":
                level = min(depth + 2, 6)
                chunks.append(f"{'#' * level} {heading}")
            else:
                chunks.append(f"【{heading}】")
            if document.kind == "manuscript":
                body = content_by_document.get(document.id, "")
                if body:
                    chunks.append(body)
            visit(document.id, depth + 1)

    if export_format == "markdown":
        chunks.append(f"# {title}")
    else:
        chunks.append(title)
        chunks.append("=" * max(4, len(title)))
    visit(None, 0)
    rendered = "\n\n".join(chunks).rstrip() + "\n"
    filename_base = _safe_filename(project.title)
    if export_format == "markdown":
        return ExportedProject(content=rendered, filename=f"{filename_base}.md", media_type="text/markdown")
    return ExportedProject(content=rendered, filename=f"{filename_base}.txt", media_type="text/plain")
