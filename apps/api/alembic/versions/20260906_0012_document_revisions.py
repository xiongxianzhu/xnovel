"""增加正文版本与命名检查点，不生成虚构的历史版本。"""

import sqlalchemy as sa

from alembic import op

revision = "20260906_0012"
down_revision = "20260905_0011"
branch_labels = None
depends_on = None


TABLE_COMMENTS = {"document_revisions": "正文保存前的不可变版本快照；命名检查点不自动清理"}

COLUMN_COMMENTS = {
    "document_revisions": {
        "checkpoint_name": "命名检查点，为空表示自动快照",
        "checksum": "正文 SHA-256 摘要",
        "content": "该版本的完整正文",
        "content_format": "正文格式",
        "created_at": "创建时间（UTC）",
        "document_id": "所属文档标识",
        "id": "正文快照标识",
        "updated_at": "最后更新时间（UTC）",
        "version": "来源正文版本",
        "word_count": "该版本的字数",
    }
}


def upgrade() -> None:
    op.create_table(
        "document_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True, comment="正文快照标识"),
        sa.Column(
            "document_id",
            sa.Uuid(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
            comment="所属文档标识",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="来源正文版本"),
        sa.Column("content", sa.Text(), nullable=False, comment="该版本的完整正文"),
        sa.Column("content_format", sa.String(), nullable=False, comment="正文格式"),
        sa.Column("word_count", sa.Integer(), nullable=False, comment="该版本的字数"),
        sa.Column("checksum", sa.String(), nullable=False, comment="正文 SHA-256 摘要"),
        sa.Column("checkpoint_name", sa.String(), nullable=True, comment="命名检查点，为空表示自动快照"),
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
        sa.CheckConstraint("version > 0", name="ck_document_revisions_version"),
        sa.UniqueConstraint("document_id", "version", name="uq_document_revisions_version"),
        comment="正文保存前的不可变版本快照；命名检查点不自动清理",
    )
    op.create_index("ix_document_revisions_document_created", "document_revisions", ["document_id", "created_at"])


def downgrade() -> None:
    op.drop_table("document_revisions")
