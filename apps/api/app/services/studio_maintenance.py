"""清理自动历史；保留命名检查点、收藏和作者确认资料。"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import OperationalError
from sqlmodel import col, delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import async_session_factory
from app.models.ai import AIResult, AITask
from app.models.document_revision import DocumentRevision


async def cleanup_history(session: AsyncSession, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    await session.exec(
        delete(DocumentRevision).where(
            col(DocumentRevision.checkpoint_name).is_(None), col(DocumentRevision.created_at) < now - timedelta(days=90)
        )
    )
    pinned_tasks = select(AIResult.task_id).where(col(AIResult.pinned).is_(True) | (col(AIResult.status) == "accepted"))
    await session.exec(
        delete(AITask).where(
            col(AITask.status).in_(["succeeded", "failed", "cancelled"]),
            col(AITask.created_at) < now - timedelta(days=30),
            col(AITask.id).not_in(pinned_tasks),
        )
    )
    await session.commit()


async def maintenance_loop() -> None:
    while True:
        try:
            async with async_session_factory() as session:
                await cleanup_history(session)
        except OperationalError:
            # 首次启动可能尚未迁移；不清理正文，不输出数据库内容。
            logging.getLogger(__name__).warning("History cleanup deferred: database unavailable or not migrated")
        await asyncio.sleep(3600)
