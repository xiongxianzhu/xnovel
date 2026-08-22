"""作品文档树节点。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
    text,
)
from sqlmodel import Field

from app.models.base import TimestampMixin


class Document(TimestampMixin, table=True):
    """作品内的文档树节点。"""

    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("length(title) BETWEEN 1 AND 200", name="ck_documents_title_length"),
        CheckConstraint("kind IN ('folder', 'manuscript', 'outline', 'note')", name="ck_documents_kind"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_documents_status"),
        CheckConstraint("position >= 0", name="ck_documents_position"),
        CheckConstraint("id <> parent_id", name="ck_documents_not_self_parent"),
        UniqueConstraint("project_id", "id", name="uq_documents_project_id_id"),
        ForeignKeyConstraint(
            ["project_id", "parent_id"],
            ["documents.project_id", "documents.id"],
            name="fk_documents_project_parent",
            ondelete="RESTRICT",
        ),
        Index("ix_documents_project_parent_position", "project_id", "parent_id", "position", "id"),
        Index("ix_documents_parent_id", "parent_id"),
        Index(
            "ix_documents_project_updated",
            "project_id",
            "updated_at",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        {"comment": "作品内可排序的文档树节点"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "文档节点唯一标识"})
    project_id: UUID = Field(
        foreign_key="projects.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "所属作品标识"},
    )
    parent_id: UUID | None = Field(
        default=None,
        sa_column_kwargs={"comment": "父文档节点标识，根节点为空"},
    )
    kind: str = Field(
        default="manuscript",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'manuscript'"),
            comment="文档类型：folder、manuscript、outline 或 note",
        ),
    )
    title: str = Field(sa_column=Column(Text, nullable=False, comment="文档节点标题，长度为 1 至 200 个字符"))
    position: int = Field(
        default=0,
        sa_column=Column(BigInteger, nullable=False, server_default=text("0"), comment="同级排序位置"),
    )
    status: str = Field(
        default="active",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'active'"),
            comment="文档状态：active 或 archived",
        ),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="文档软删除时间（UTC）"),
    )
