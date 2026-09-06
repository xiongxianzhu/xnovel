"""跨章检索与稿件导入：只在最终确认时提交正文。"""

import hashlib
import re
from datetime import UTC, datetime
from math import ceil
from uuid import UUID

from sqlalchemy import Select, String, cast, func, literal, or_, union_all
from sqlalchemy import select as sql_select
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.import_receipt import ImportReceipt
from app.models.planning import Character, WorldEntry
from app.models.project import Project
from app.schemas.manuscript_tools import ImportChapter, ImportCommit, ImportPreview, ImportResult, SearchHit
from app.schemas.studio import StudioPage
from app.services.projects import _conflict, _not_found, _owned_project, count_document_words

MAX_IMPORT_BYTES = 20 * 1024 * 1024


async def search_manuscript(
    session: AsyncSession,
    owner_id: UUID,
    project_id: UUID,
    q: str,
    page: int,
    page_size: int,
    include_archived: bool = False,
) -> StudioPage[SearchHit]:
    await _owned_project(session, owner_id=owner_id, project_id=project_id)
    query = q.strip()
    if not query:
        return StudioPage(items=[], page=page, page_size=page_size, total=0, pages=0)
    doc_filter = [
        col(Document.project_id) == project_id,
        col(Document.deleted_at).is_(None),
        or_(
            col(Document.title).icontains(query, autoescape=True),
            col(DocumentContent.content).icontains(query, autoescape=True),
        ),
    ]
    if not include_archived:
        doc_filter.append(col(Document.status) == "active")
    documents: Select = (
        sql_select(
            col(Document.id).label("id"),
            literal("document").label("kind"),
            col(Document.title).label("title"),
            col(DocumentContent.content).label("body"),
            col(DocumentContent.version).label("version"),
        )
        .join(DocumentContent)
        .where(*doc_filter)
    )
    characters: Select = sql_select(
        col(Character.id), literal("character"), col(Character.name), col(Character.summary), literal(None)
    ).where(
        col(Character.project_id) == project_id,
        col(Character.deleted_at).is_(None),
        or_(
            col(Character.name).icontains(query, autoescape=True),
            cast(Character.aliases, String).icontains(query, autoescape=True),
            cast(Character.profile, String).icontains(query, autoescape=True),
            col(Character.summary).icontains(query, autoescape=True),
        ),
    )
    world: Select = sql_select(
        col(WorldEntry.id), literal("world"), col(WorldEntry.title), col(WorldEntry.content), literal(None)
    ).where(
        col(WorldEntry.project_id) == project_id,
        col(WorldEntry.deleted_at).is_(None),
        or_(
            col(WorldEntry.title).icontains(query, autoescape=True),
            col(WorldEntry.content).icontains(query, autoescape=True),
            cast(WorldEntry.attributes, String).icontains(query, autoescape=True),
        ),
    )
    combined = union_all(documents, characters, world).subquery()
    total = (await session.execute(select(func.count()).select_from(combined))).scalar_one()
    rows = (
        await session.execute(
            sql_select(combined)
            .order_by(combined.c.kind, combined.c.title, combined.c.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    character_rows = {
        item.id: item
        for item in (
            await session.exec(
                select(Character).where(col(Character.id).in_([row.id for row in rows if row.kind == "character"]))
            )
        ).all()
    }
    world_rows = {
        item.id: item
        for item in (
            await session.exec(
                select(WorldEntry).where(col(WorldEntry.id).in_([row.id for row in rows if row.kind == "world"]))
            )
        ).all()
    }
    hits = []
    for row in rows:
        body = str(row.body)
        if row.kind == "character":
            character = character_rows[row.id]
            body = "\n".join(
                [
                    character.name,
                    character.summary,
                    *character.aliases,
                    *[f"{key}: {value}" for key, value in character.profile.items()],
                ]
            )
        elif row.kind == "world":
            entry = world_rows[row.id]
            body = "\n".join(
                [entry.title, entry.content, *[f"{key}: {value}" for key, value in entry.attributes.items()]]
            )
        start = body.casefold().find(query.casefold())
        excerpt = body[max(0, start - 50) : max(0, start - 50) + 180]
        hits.append(
            SearchHit(
                id=row.id,
                kind=row.kind,
                title=row.title,
                excerpt=excerpt,
                document_version=row.version,
                match_start=start if start >= 0 and row.kind == "document" else None,
            )
        )
    return StudioPage(items=hits, page=page, page_size=page_size, total=total, pages=ceil(total / page_size))


def preview_import(raw: bytes, filename: str, encoding: str = "auto", split: str = "auto") -> ImportPreview:
    if len(raw) > MAX_IMPORT_BYTES:
        raise _conflict("import_too_large")
    allowed = {"utf-8", "utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "gb18030"}
    if encoding == "auto":
        if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            encoding = "utf-16"
        else:
            try:
                raw.decode("utf-8-sig")
                encoding = "utf-8-sig"
            except UnicodeDecodeError:
                encoding = "gb18030"
    if encoding not in allowed:
        raise _conflict("import_encoding_invalid")
    try:
        content = raw.decode(encoding).replace("\r\n", "\n").replace("\r", "\n")
    except UnicodeDecodeError as exc:
        raise _conflict("import_encoding_invalid") from exc
    if "\x00" in content or not content.strip():
        raise _conflict("import_text_invalid")
    title = re.sub(r"\.(?:txt|md|markdown)$", "", filename, flags=re.I)[:100] or "导入作品"
    pattern = re.compile(
        r"^(?:#{1,6}\s+(.+)|((?:第[零〇一二三四五六七八九十百千万两\d]+[章回节卷]|Chapter\s+\d+).*))$", re.I
    )
    chapters: list[ImportChapter] = []
    heading = title
    lines: list[str] = []
    for line in content.split("\n"):
        match = pattern.match(line.strip()) if split != "none" else None
        if match:
            if lines or chapters:
                chapters.append(ImportChapter(title=heading[:200], content="\n".join(lines).strip("\n")))
            heading = (match.group(1) or match.group(2)).strip()
            lines = []
        else:
            lines.append(line)
    if lines or not chapters:
        chapters.append(ImportChapter(title=heading[:200], content="\n".join(lines).strip("\n")))
    if len(chapters) > 1000:
        raise _conflict("import_chapter_limit")
    names = [chapter.title for chapter in chapters]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    return ImportPreview(title=title, encoding=encoding, chapters=chapters, duplicate_titles=duplicates)


async def commit_import(session: AsyncSession, owner_id: UUID, payload: ImportCommit) -> ImportResult:
    digest = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
    previous = await session.get(ImportReceipt, payload.request_id)
    if previous:
        if previous.owner_id != owner_id:
            raise _not_found()
        if previous.payload_hash != digest:
            raise _conflict("import_request_changed")
        return ImportResult(project_id=previous.project_id, imported=previous.imported, skipped=previous.skipped)
    if sum(len(ch.content.encode()) for ch in payload.chapters) > MAX_IMPORT_BYTES:
        raise _conflict("import_too_large")
    now = datetime.now(UTC)
    if payload.project_id:
        project = await _owned_project(session, owner_id=owner_id, project_id=payload.project_id, lock=True)
    else:
        project = Project(owner_id=owner_id, title=payload.title, created_at=now, updated_at=now)
        session.add(project)
        await session.flush()
    documents = (await session.exec(select(Document).where(col(Document.project_id) == project.id))).all()
    existing = {row.title for row in documents if row.deleted_at is None}
    position = max((row.position for row in documents if row.parent_id is None), default=-1) + 1
    imported = skipped = 0
    for chapter in payload.chapters:
        if payload.duplicate_policy == "skip" and chapter.title in existing:
            skipped += 1
            continue
        document = Document(
            project_id=project.id,
            title=chapter.title,
            position=position,
            kind="manuscript",
            created_at=now,
            updated_at=now,
        )
        session.add(document)
        await session.flush()
        session.add(
            DocumentContent(
                document_id=document.id,
                content=chapter.content,
                content_format="plain_text",
                version=1,
                word_count=count_document_words(chapter.content),
                checksum=hashlib.sha256(chapter.content.encode()).hexdigest(),
                updated_by=owner_id,
                created_at=now,
                updated_at=now,
            )
        )
        existing.add(chapter.title)
        position += 1
        imported += 1
    if not imported and not documents:
        await session.rollback()
        raise _conflict("import_empty_result")
    project.structure_mode = "tree"
    project.updated_at = now
    session.add(project)
    receipt = ImportReceipt(
        id=payload.request_id,
        owner_id=owner_id,
        project_id=project.id,
        payload_hash=digest,
        imported=imported,
        skipped=skipped,
        created_at=now,
        updated_at=now,
    )
    session.add(receipt)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        previous = await session.get(ImportReceipt, payload.request_id)
        if previous and previous.owner_id == owner_id and previous.payload_hash == digest:
            return ImportResult(project_id=previous.project_id, imported=previous.imported, skipped=previous.skipped)
        raise _conflict("import_conflict") from exc
    return ImportResult(project_id=project.id, imported=imported, skipped=skipped)
