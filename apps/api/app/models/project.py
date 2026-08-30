"""作品聚合根。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, Index, Text, UniqueConstraint, text
from sqlmodel import Field

from app.models.base import TimestampMixin


class Project(TimestampMixin, table=True):
    """用户拥有的小说作品。"""

    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("length(title) BETWEEN 1 AND 100", name="ck_projects_title_length"),
        CheckConstraint("length(author) <= 100", name="ck_projects_author_length"),
        CheckConstraint("structure_mode IN ('single_document', 'tree')", name="ck_projects_structure_mode"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_projects_status"),
        CheckConstraint(
            "update_status IN ('not_started', 'serializing', 'completed')",
            name="ck_projects_update_status",
        ),
        CheckConstraint(
            "(cover_storage_key IS NULL AND cover_mime_type IS NULL AND cover_size_bytes IS NULL "
            "AND cover_updated_at IS NULL) OR "
            "(cover_storage_key IS NOT NULL AND cover_mime_type IS NOT NULL AND cover_size_bytes IS NOT NULL "
            "AND cover_updated_at IS NOT NULL)",
            name="ck_projects_cover_fields",
        ),
        UniqueConstraint("owner_id", "id", name="uq_projects_owner_id_id"),
        Index("ix_projects_owner_id", "owner_id"),
        Index(
            "ix_projects_owner_status_updated",
            "owner_id",
            "status",
            "updated_at",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        {"comment": "用户拥有的小说作品与作品级状态"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "作品唯一标识"})
    owner_id: UUID = Field(
        foreign_key="users.id",
        nullable=False,
        ondelete="RESTRICT",
        sa_column_kwargs={"comment": "作品所属用户标识"},
    )
    title: str = Field(sa_column=Column(Text, nullable=False, comment="作品名，长度为 1 至 200 个字符"))
    author: str = Field(
        default="",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("''"),
            comment="作品作者署名，最多 100 个字符，可留空",
        ),
    )
    description: str = Field(
        default="",
        sa_column=Column(Text, nullable=False, server_default=text("''"), comment="作品简介或备注"),
    )
    structure_mode: str = Field(
        default="tree",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'tree'"),
            comment="作品结构模式：single_document 或 tree",
        ),
    )
    update_status: str = Field(
        default="not_started",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'not_started'"),
            comment="创作进度：not_started、serializing 或 completed",
        ),
    )
    status: str = Field(
        default="active",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'active'"),
            comment="作品状态：active 或 archived",
        ),
    )
    archived_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="作品归档时间（UTC）"),
    )
    cover_storage_key: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="作品封面随机存储键"),
    )
    cover_mime_type: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="作品封面真实 MIME 类型"),
    )
    cover_size_bytes: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, nullable=True, comment="作品封面文件大小（字节）"),
    )
    cover_updated_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="作品封面更新时间（UTC）"),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="作品软删除时间（UTC）"),
    )
