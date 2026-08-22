"""文档当前正文。"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, Column, Index, Integer, Text, text
from sqlmodel import Field

from app.models.base import TimestampMixin


class DocumentContent(TimestampMixin, table=True):
    """非文件夹文档的当前正文与乐观锁版本。"""

    __tablename__ = "document_contents"
    __table_args__ = (
        CheckConstraint("content_format IN ('plain_text', 'markdown')", name="ck_document_contents_format"),
        CheckConstraint("version > 0", name="ck_document_contents_version"),
        CheckConstraint("word_count >= 0", name="ck_document_contents_word_count"),
        Index("ix_document_contents_updated_by", "updated_by"),
        {"comment": "文档当前正文、格式与乐观锁版本"},
    )

    document_id: UUID = Field(
        primary_key=True,
        foreign_key="documents.id",
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "正文所属文档标识，同时作为本表主键"},
    )
    content: str = Field(
        default="",
        sa_column=Column(Text, nullable=False, server_default=text("''"), comment="当前正文内容"),
    )
    content_format: str = Field(
        default="plain_text",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'plain_text'"),
            comment="正文格式：plain_text 或 markdown",
        ),
    )
    version: int = Field(
        default=1,
        sa_column=Column(BigInteger, nullable=False, server_default=text("1"), comment="乐观并发版本号"),
    )
    word_count: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default=text("0"), comment="服务端计算的字数"),
    )
    checksum: str = Field(sa_column=Column(Text, nullable=False, comment="正文内容 SHA-256 小写摘要"))
    updated_by: UUID | None = Field(
        default=None,
        foreign_key="users.id",
        ondelete="SET NULL",
        sa_column_kwargs={"comment": "最近保存正文的用户标识"},
    )
