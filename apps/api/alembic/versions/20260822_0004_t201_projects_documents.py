"""建立 T-201 作品、文档树与当前正文表。

Revision ID: 20260822_0004
Revises: 20260821_0003
Create Date: 2026-08-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260822_0004"
down_revision: str | None = "20260821_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE_COMMENTS: dict[str, str] = {
    "projects": "用户拥有的小说作品与作品级状态",
    "documents": "作品内可排序的文档树节点",
    "document_contents": "文档当前正文、格式与乐观锁版本",
}

_TIMESTAMP_COMMENTS = {
    "created_at": "创建时间（UTC）",
    "updated_at": "最后更新时间（UTC）",
}

COLUMN_COMMENTS: dict[str, dict[str, str]] = {
    "projects": {
        "id": "作品唯一标识",
        "owner_id": "作品所属用户标识",
        "title": "作品名，长度为 1 至 200 个字符",
        "description": "作品简介或备注",
        "structure_mode": "作品结构模式：single_document 或 tree",
        "status": "作品状态：active 或 archived",
        "archived_at": "作品归档时间（UTC）",
        "deleted_at": "作品软删除时间（UTC）",
        **_TIMESTAMP_COMMENTS,
    },
    "documents": {
        "id": "文档节点唯一标识",
        "project_id": "所属作品标识",
        "parent_id": "父文档节点标识，根节点为空",
        "kind": "文档类型：folder、manuscript、outline 或 note",
        "title": "文档节点标题，长度为 1 至 200 个字符",
        "position": "同级排序位置",
        "status": "文档状态：active 或 archived",
        "deleted_at": "文档软删除时间（UTC）",
        **_TIMESTAMP_COMMENTS,
    },
    "document_contents": {
        "document_id": "正文所属文档标识，同时作为本表主键",
        "content": "当前正文内容",
        "content_format": "正文格式：plain_text 或 markdown",
        "version": "乐观并发版本号",
        "word_count": "服务端计算的字数",
        "checksum": "正文内容 SHA-256 小写摘要",
        "updated_by": "最近保存正文的用户标识",
        **_TIMESTAMP_COMMENTS,
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
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False, comment="作品唯一标识"),
        sa.Column("owner_id", sa.Uuid(), nullable=False, comment="作品所属用户标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="作品名，长度为 1 至 200 个字符"),
        sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''"), comment="作品简介或备注"),
        sa.Column(
            "structure_mode",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'tree'"),
            comment="作品结构模式：single_document 或 tree",
        ),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'active'"),
            comment="作品状态：active 或 archived",
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True, comment="作品归档时间（UTC）"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True, comment="作品软删除时间（UTC）"),
        *_timestamps(),
        sa.CheckConstraint("length(title) BETWEEN 1 AND 200", name="ck_projects_title_length"),
        sa.CheckConstraint("structure_mode IN ('single_document', 'tree')", name="ck_projects_structure_mode"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_projects_status"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name="fk_projects_owner_id", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
        sa.UniqueConstraint("owner_id", "id", name="uq_projects_owner_id_id"),
        comment="用户拥有的小说作品与作品级状态",
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"], unique=False)
    op.create_index(
        "ix_projects_owner_status_updated",
        "projects",
        ["owner_id", "status", "updated_at", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
        sqlite_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), nullable=False, comment="文档节点唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("parent_id", sa.Uuid(), nullable=True, comment="父文档节点标识，根节点为空"),
        sa.Column(
            "kind",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'manuscript'"),
            comment="文档类型：folder、manuscript、outline 或 note",
        ),
        sa.Column("title", sa.Text(), nullable=False, comment="文档节点标题，长度为 1 至 200 个字符"),
        sa.Column("position", sa.BigInteger(), nullable=False, server_default=sa.text("0"), comment="同级排序位置"),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'active'"),
            comment="文档状态：active 或 archived",
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True, comment="文档软删除时间（UTC）"),
        *_timestamps(),
        sa.CheckConstraint("length(title) BETWEEN 1 AND 200", name="ck_documents_title_length"),
        sa.CheckConstraint("kind IN ('folder', 'manuscript', 'outline', 'note')", name="ck_documents_kind"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_documents_status"),
        sa.CheckConstraint("position >= 0", name="ck_documents_position"),
        sa.CheckConstraint("id <> parent_id", name="ck_documents_not_self_parent"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_documents_project_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["project_id", "parent_id"],
            ["documents.project_id", "documents.id"],
            name="fk_documents_project_parent",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_documents"),
        sa.UniqueConstraint("project_id", "id", name="uq_documents_project_id_id"),
        comment="作品内可排序的文档树节点",
    )
    op.create_index(
        "ix_documents_project_parent_position",
        "documents",
        ["project_id", "parent_id", "position", "id"],
        unique=False,
    )
    op.create_index("ix_documents_parent_id", "documents", ["parent_id"], unique=False)
    op.create_index(
        "ix_documents_project_updated",
        "documents",
        ["project_id", "updated_at", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
        sqlite_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "document_contents",
        sa.Column("document_id", sa.Uuid(), nullable=False, comment="正文所属文档标识，同时作为本表主键"),
        sa.Column("content", sa.Text(), nullable=False, server_default=sa.text("''"), comment="当前正文内容"),
        sa.Column(
            "content_format",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'plain_text'"),
            comment="正文格式：plain_text 或 markdown",
        ),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default=sa.text("1"), comment="乐观并发版本号"),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default=sa.text("0"), comment="服务端计算的字数"),
        sa.Column("checksum", sa.Text(), nullable=False, comment="正文内容 SHA-256 小写摘要"),
        sa.Column("updated_by", sa.Uuid(), nullable=True, comment="最近保存正文的用户标识"),
        *_timestamps(),
        sa.CheckConstraint("content_format IN ('plain_text', 'markdown')", name="ck_document_contents_format"),
        sa.CheckConstraint("version > 0", name="ck_document_contents_version"),
        sa.CheckConstraint("word_count >= 0", name="ck_document_contents_word_count"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name="fk_document_contents_document_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name="fk_document_contents_updated_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("document_id", name="pk_document_contents"),
        comment="文档当前正文、格式与乐观锁版本",
    )
    op.create_index("ix_document_contents_updated_by", "document_contents", ["updated_by"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_document_contents_updated_by", table_name="document_contents")
    op.drop_table("document_contents")
    op.drop_index("ix_documents_project_updated", table_name="documents")
    op.drop_index("ix_documents_parent_id", table_name="documents")
    op.drop_index("ix_documents_project_parent_position", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_projects_owner_status_updated", table_name="projects")
    op.drop_index("ix_projects_owner_id", table_name="projects")
    op.drop_table("projects")
