"""正文快照的事务内写入；不主动提交调用方事务。"""

from datetime import UTC, datetime

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.document_content import DocumentContent
from app.models.document_revision import DocumentRevision


async def capture_revision(
    session: AsyncSession, content: DocumentContent, checkpoint_name: str | None = None
) -> DocumentRevision:
    existing = (
        await session.exec(
            select(DocumentRevision).where(
                col(DocumentRevision.document_id) == content.document_id,
                col(DocumentRevision.version) == content.version,
            )
        )
    ).one_or_none()
    if existing is not None:
        if checkpoint_name:
            existing.checkpoint_name = checkpoint_name
            session.add(existing)
        return existing
    now = datetime.now(UTC)
    revision = DocumentRevision(
        document_id=content.document_id,
        version=content.version,
        content=content.content,
        content_format=content.content_format,
        word_count=content.word_count,
        checksum=content.checksum,
        checkpoint_name=checkpoint_name,
        created_at=now,
        updated_at=now,
    )
    session.add(revision)
    await session.flush()
    return revision
