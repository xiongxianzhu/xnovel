"""建立 Phase 3 人物、世界设定与正文引用表。

Revision ID: 20260828_0006
Revises: 20260822_0005
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260828_0006"
down_revision: str | None = "20260822_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
JSON_VALUE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

TABLE_COMMENTS = {
    "characters": "作品内人物资料与可扩展属性",
    "world_entries": "作品内层级世界设定与结构化属性",
    "document_character_links": "正文文档对同作品人物的显式引用",
    "document_world_entry_links": "正文文档对同作品世界设定的显式引用",
}

_TIMESTAMPS = {"created_at": "创建时间（UTC）", "updated_at": "最后更新时间（UTC）"}

COLUMN_COMMENTS = {
    "characters": {
        "id": "人物唯一标识",
        "project_id": "所属作品标识",
        "name": "人物名称，长度为 1 至 200 个字符",
        "aliases": "人物别名字符串数组",
        "summary": "人物简介或角色定位",
        "profile": "人物结构化扩展资料",
        "position": "作品内人物排序位置",
        "deleted_at": "人物软删除时间（UTC）",
        **_TIMESTAMPS,
    },
    "world_entries": {
        "id": "世界设定唯一标识",
        "project_id": "所属作品标识",
        "parent_id": "父世界设定标识，根节点为空",
        "category": "世界设定分类：location、faction、item、rule、event 或 other",
        "title": "世界设定标题，长度为 1 至 200 个字符",
        "content": "世界设定正文",
        "attributes": "世界设定结构化扩展属性",
        "position": "同级世界设定排序位置",
        "deleted_at": "世界设定软删除时间（UTC）",
        **_TIMESTAMPS,
    },
    "document_character_links": {
        "id": "正文人物引用唯一标识",
        "project_id": "所属作品标识",
        "document_id": "引用人物的正文文档标识",
        "character_id": "被引用的人物标识",
        **_TIMESTAMPS,
    },
    "document_world_entry_links": {
        "id": "正文世界设定引用唯一标识",
        "project_id": "所属作品标识",
        "document_id": "引用世界设定的正文文档标识",
        "world_entry_id": "被引用的世界设定标识",
        **_TIMESTAMPS,
    },
}


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            comment="最后更新时间（UTC）",
        ),
    )


def upgrade() -> None:
    op.create_table(
        "characters",
        sa.Column("id", sa.Uuid(), nullable=False, comment="人物唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("name", sa.Text(), nullable=False, comment="人物名称，长度为 1 至 200 个字符"),
        sa.Column("aliases", JSON_VALUE, nullable=False, server_default=sa.text("'[]'"), comment="人物别名字符串数组"),
        sa.Column("summary", sa.Text(), nullable=False, server_default=sa.text("''"), comment="人物简介或角色定位"),
        sa.Column("profile", JSON_VALUE, nullable=False, server_default=sa.text("'{}'"), comment="人物结构化扩展资料"),
        sa.Column(
            "position",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("0"),
            comment="作品内人物排序位置",
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True, comment="人物软删除时间（UTC）"),
        *_timestamps(),
        sa.CheckConstraint("length(name) BETWEEN 1 AND 200", name="ck_characters_name_length"),
        sa.CheckConstraint("position >= 0", name="ck_characters_position"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_characters_project_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_characters"),
        sa.UniqueConstraint("project_id", "id", name="uq_characters_project_id_id"),
        comment="作品内人物资料与可扩展属性",
    )
    op.create_index("ix_characters_project_position", "characters", ["project_id", "position", "id"])
    op.create_index(
        "ix_characters_project_updated",
        "characters",
        ["project_id", "updated_at", "id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
        sqlite_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "world_entries",
        sa.Column("id", sa.Uuid(), nullable=False, comment="世界设定唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("parent_id", sa.Uuid(), nullable=True, comment="父世界设定标识，根节点为空"),
        sa.Column(
            "category",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'other'"),
            comment="世界设定分类：location、faction、item、rule、event 或 other",
        ),
        sa.Column("title", sa.Text(), nullable=False, comment="世界设定标题，长度为 1 至 200 个字符"),
        sa.Column("content", sa.Text(), nullable=False, server_default=sa.text("''"), comment="世界设定正文"),
        sa.Column(
            "attributes",
            JSON_VALUE,
            nullable=False,
            server_default=sa.text("'{}'"),
            comment="世界设定结构化扩展属性",
        ),
        sa.Column(
            "position",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("0"),
            comment="同级世界设定排序位置",
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True, comment="世界设定软删除时间（UTC）"),
        *_timestamps(),
        sa.CheckConstraint("length(title) BETWEEN 1 AND 200", name="ck_world_entries_title_length"),
        sa.CheckConstraint(
            "category IN ('location', 'faction', 'item', 'rule', 'event', 'other')",
            name="ck_world_entries_category",
        ),
        sa.CheckConstraint("position >= 0", name="ck_world_entries_position"),
        sa.CheckConstraint("id <> parent_id", name="ck_world_entries_not_self_parent"),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_world_entries_project_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "parent_id"],
            ["world_entries.project_id", "world_entries.id"],
            name="fk_world_entries_project_parent",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_world_entries"),
        sa.UniqueConstraint("project_id", "id", name="uq_world_entries_project_id_id"),
        comment="作品内层级世界设定与结构化属性",
    )
    op.create_index(
        "ix_world_entries_project_parent_position",
        "world_entries",
        ["project_id", "parent_id", "position", "id"],
    )
    op.create_index("ix_world_entries_parent_id", "world_entries", ["parent_id"])
    op.create_index(
        "ix_world_entries_project_updated",
        "world_entries",
        ["project_id", "updated_at", "id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
        sqlite_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "document_character_links",
        sa.Column("id", sa.Uuid(), nullable=False, comment="正文人物引用唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("document_id", sa.Uuid(), nullable=False, comment="引用人物的正文文档标识"),
        sa.Column("character_id", sa.Uuid(), nullable=False, comment="被引用的人物标识"),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_document_character_links_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "document_id"],
            ["documents.project_id", "documents.id"],
            name="fk_document_character_links_document",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "character_id"],
            ["characters.project_id", "characters.id"],
            name="fk_document_character_links_character",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_document_character_links"),
        sa.UniqueConstraint(
            "project_id",
            "document_id",
            "character_id",
            name="uq_document_character_links_reference",
        ),
        comment="正文文档对同作品人物的显式引用",
    )
    op.create_index(
        "ix_document_character_links_document",
        "document_character_links",
        ["project_id", "document_id"],
    )
    op.create_index(
        "ix_document_character_links_character",
        "document_character_links",
        ["project_id", "character_id"],
    )

    op.create_table(
        "document_world_entry_links",
        sa.Column("id", sa.Uuid(), nullable=False, comment="正文世界设定引用唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("document_id", sa.Uuid(), nullable=False, comment="引用世界设定的正文文档标识"),
        sa.Column("world_entry_id", sa.Uuid(), nullable=False, comment="被引用的世界设定标识"),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_document_world_entry_links_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "document_id"],
            ["documents.project_id", "documents.id"],
            name="fk_document_world_entry_links_document",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "world_entry_id"],
            ["world_entries.project_id", "world_entries.id"],
            name="fk_document_world_entry_links_entry",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_document_world_entry_links"),
        sa.UniqueConstraint(
            "project_id",
            "document_id",
            "world_entry_id",
            name="uq_document_world_entry_links_reference",
        ),
        comment="正文文档对同作品世界设定的显式引用",
    )
    op.create_index(
        "ix_document_world_entry_links_document",
        "document_world_entry_links",
        ["project_id", "document_id"],
    )
    op.create_index(
        "ix_document_world_entry_links_entry",
        "document_world_entry_links",
        ["project_id", "world_entry_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_world_entry_links_entry", table_name="document_world_entry_links")
    op.drop_index("ix_document_world_entry_links_document", table_name="document_world_entry_links")
    op.drop_table("document_world_entry_links")
    op.drop_index("ix_document_character_links_character", table_name="document_character_links")
    op.drop_index("ix_document_character_links_document", table_name="document_character_links")
    op.drop_table("document_character_links")
    op.drop_index("ix_world_entries_project_updated", table_name="world_entries")
    op.drop_index("ix_world_entries_parent_id", table_name="world_entries")
    op.drop_index("ix_world_entries_project_parent_position", table_name="world_entries")
    op.drop_table("world_entries")
    op.drop_index("ix_characters_project_updated", table_name="characters")
    op.drop_index("ix_characters_project_position", table_name="characters")
    op.drop_table("characters")
