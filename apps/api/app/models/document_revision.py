"""作者可浏览和恢复的不可变正文快照。"""

from uuid import UUID, uuid7

from sqlalchemy import CheckConstraint, Column, Index, Text, UniqueConstraint
from sqlmodel import Field

from app.models.base import ImmutableTimestampMixin


class DocumentRevision(ImmutableTimestampMixin, table=True):
    __tablename__ = "document_revisions"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_document_revisions_version"),
        UniqueConstraint("document_id", "version", name="uq_document_revisions_version"),
        Index("ix_document_revisions_document_created", "document_id", "created_at"),
        {"comment": "正文保存前的不可变版本快照；命名检查点不自动清理"},
    )
    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "正文快照标识"})
    document_id: UUID = Field(
        foreign_key="documents.id", nullable=False, ondelete="CASCADE", sa_column_kwargs={"comment": "所属文档标识"}
    )
    version: int = Field(nullable=False, sa_column_kwargs={"comment": "来源正文版本"})
    content: str = Field(sa_column=Column(Text, nullable=False, comment="该版本的完整正文"))
    content_format: str = Field(default="plain_text", sa_column_kwargs={"comment": "正文格式"})
    word_count: int = Field(default=0, sa_column_kwargs={"comment": "该版本的字数"})
    checksum: str = Field(sa_column_kwargs={"comment": "正文 SHA-256 摘要"})
    checkpoint_name: str | None = Field(default=None, sa_column_kwargs={"comment": "命名检查点，为空表示自动快照"})
