"""人物、世界设定与正文引用模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid7

from sqlalchemy import (
    JSON,
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.models.base import TimestampMixin

JSON_VALUE = JSON().with_variant(JSONB(), "postgresql")


class Character(TimestampMixin, table=True):
    """作品内的人物资料。"""

    __tablename__ = "characters"
    __table_args__ = (
        CheckConstraint("length(name) BETWEEN 1 AND 200", name="ck_characters_name_length"),
        CheckConstraint("position >= 0", name="ck_characters_position"),
        UniqueConstraint("project_id", "id", name="uq_characters_project_id_id"),
        Index("ix_characters_project_position", "project_id", "position", "id"),
        Index(
            "ix_characters_project_updated",
            "project_id",
            "updated_at",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        {"comment": "作品内人物资料与可扩展属性"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "人物唯一标识"})
    project_id: UUID = Field(
        foreign_key="projects.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "所属作品标识"},
    )
    name: str = Field(sa_column=Column(Text, nullable=False, comment="人物名称，长度为 1 至 200 个字符"))
    aliases: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON_VALUE, nullable=False, server_default=text("'[]'"), comment="人物别名字符串数组"),
    )
    summary: str = Field(
        default="",
        sa_column=Column(Text, nullable=False, server_default=text("''"), comment="人物简介或角色定位"),
    )
    profile: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON_VALUE, nullable=False, server_default=text("'{}'"), comment="人物结构化扩展资料"),
    )
    position: int = Field(
        default=0,
        sa_column=Column(BigInteger, nullable=False, server_default=text("0"), comment="作品内人物排序位置"),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="人物软删除时间（UTC）"),
    )


class WorldEntry(TimestampMixin, table=True):
    """作品内的层级世界设定。"""

    __tablename__ = "world_entries"
    __table_args__ = (
        CheckConstraint("length(title) BETWEEN 1 AND 200", name="ck_world_entries_title_length"),
        CheckConstraint(
            "category IN ('location', 'faction', 'item', 'rule', 'event', 'other')",
            name="ck_world_entries_category",
        ),
        CheckConstraint("position >= 0", name="ck_world_entries_position"),
        CheckConstraint("id <> parent_id", name="ck_world_entries_not_self_parent"),
        UniqueConstraint("project_id", "id", name="uq_world_entries_project_id_id"),
        ForeignKeyConstraint(
            ["project_id", "parent_id"],
            ["world_entries.project_id", "world_entries.id"],
            name="fk_world_entries_project_parent",
            ondelete="RESTRICT",
        ),
        Index("ix_world_entries_project_parent_position", "project_id", "parent_id", "position", "id"),
        Index("ix_world_entries_parent_id", "parent_id"),
        Index(
            "ix_world_entries_project_updated",
            "project_id",
            "updated_at",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        {"comment": "作品内层级世界设定与结构化属性"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "世界设定唯一标识"})
    project_id: UUID = Field(
        foreign_key="projects.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "所属作品标识"},
    )
    parent_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "父世界设定标识，根节点为空"})
    category: str = Field(
        default="other",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'other'"),
            comment="世界设定分类：location、faction、item、rule、event 或 other",
        ),
    )
    title: str = Field(sa_column=Column(Text, nullable=False, comment="世界设定标题，长度为 1 至 200 个字符"))
    content: str = Field(
        default="",
        sa_column=Column(Text, nullable=False, server_default=text("''"), comment="世界设定正文"),
    )
    attributes: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON_VALUE, nullable=False, server_default=text("'{}'"), comment="世界设定结构化扩展属性"),
    )
    position: int = Field(
        default=0,
        sa_column=Column(BigInteger, nullable=False, server_default=text("0"), comment="同级世界设定排序位置"),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="世界设定软删除时间（UTC）"),
    )


class DocumentCharacterLink(TimestampMixin, table=True):
    """正文与人物的显式引用。"""

    __tablename__ = "document_character_links"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "document_id"],
            ["documents.project_id", "documents.id"],
            name="fk_document_character_links_document",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["project_id", "character_id"],
            ["characters.project_id", "characters.id"],
            name="fk_document_character_links_character",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "project_id",
            "document_id",
            "character_id",
            name="uq_document_character_links_reference",
        ),
        Index("ix_document_character_links_document", "project_id", "document_id"),
        Index("ix_document_character_links_character", "project_id", "character_id"),
        {"comment": "正文文档对同作品人物的显式引用"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "正文人物引用唯一标识"})
    project_id: UUID = Field(
        foreign_key="projects.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "所属作品标识"},
    )
    document_id: UUID = Field(nullable=False, sa_column_kwargs={"comment": "引用人物的正文文档标识"})
    character_id: UUID = Field(nullable=False, sa_column_kwargs={"comment": "被引用的人物标识"})


class DocumentWorldEntryLink(TimestampMixin, table=True):
    """正文与世界设定的显式引用。"""

    __tablename__ = "document_world_entry_links"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "document_id"],
            ["documents.project_id", "documents.id"],
            name="fk_document_world_entry_links_document",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["project_id", "world_entry_id"],
            ["world_entries.project_id", "world_entries.id"],
            name="fk_document_world_entry_links_entry",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "project_id",
            "document_id",
            "world_entry_id",
            name="uq_document_world_entry_links_reference",
        ),
        Index("ix_document_world_entry_links_document", "project_id", "document_id"),
        Index("ix_document_world_entry_links_entry", "project_id", "world_entry_id"),
        {"comment": "正文文档对同作品世界设定的显式引用"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "正文世界设定引用唯一标识"})
    project_id: UUID = Field(
        foreign_key="projects.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "所属作品标识"},
    )
    document_id: UUID = Field(nullable=False, sa_column_kwargs={"comment": "引用世界设定的正文文档标识"})
    world_entry_id: UUID = Field(nullable=False, sa_column_kwargs={"comment": "被引用的世界设定标识"})
