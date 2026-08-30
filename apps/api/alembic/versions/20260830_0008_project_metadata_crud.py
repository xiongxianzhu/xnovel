"""增加作品创作进度与封面元数据。"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260830_0008"
down_revision: str | None = "20260828_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE_COMMENTS = {"projects": "用户拥有的小说作品与作品级状态"}
COLUMN_COMMENTS = {
    "projects": {
        "id": "作品唯一标识",
        "owner_id": "作品所属用户标识",
        "title": "作品名，长度为 1 至 200 个字符",
        "description": "作品简介或备注",
        "structure_mode": "作品结构模式：single_document 或 tree",
        "update_status": "创作进度：not_started、serializing 或 completed",
        "status": "作品状态：active 或 archived",
        "archived_at": "作品归档时间（UTC）",
        "cover_storage_key": "作品封面随机存储键",
        "cover_mime_type": "作品封面真实 MIME 类型",
        "cover_size_bytes": "作品封面文件大小（字节）",
        "cover_updated_at": "作品封面更新时间（UTC）",
        "deleted_at": "作品软删除时间（UTC）",
        "created_at": "创建时间（UTC）",
        "updated_at": "最后更新时间（UTC）",
    }
}


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.add_column(
            sa.Column(
            "update_status",
            sa.Text(),
            server_default=sa.text("'not_started'"),
            nullable=False,
            comment="创作进度：not_started、serializing 或 completed",
            )
        )
        batch.add_column(sa.Column("cover_storage_key", sa.Text(), nullable=True, comment="作品封面随机存储键"))
        batch.add_column(sa.Column("cover_mime_type", sa.Text(), nullable=True, comment="作品封面真实 MIME 类型"))
        batch.add_column(
            sa.Column("cover_size_bytes", sa.BigInteger(), nullable=True, comment="作品封面文件大小（字节）")
        )
        batch.add_column(
            sa.Column(
            "cover_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="作品封面更新时间（UTC）",
            )
        )
        batch.create_check_constraint(
            "ck_projects_update_status",
            "update_status IN ('not_started', 'serializing', 'completed')",
        )
        batch.create_check_constraint(
            "ck_projects_cover_fields",
            "(cover_storage_key IS NULL AND cover_mime_type IS NULL AND cover_size_bytes IS NULL "
            "AND cover_updated_at IS NULL) OR "
            "(cover_storage_key IS NOT NULL AND cover_mime_type IS NOT NULL AND cover_size_bytes IS NOT NULL "
            "AND cover_updated_at IS NOT NULL)",
        )


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("ck_projects_cover_fields", type_="check")
        batch.drop_constraint("ck_projects_update_status", type_="check")
        batch.drop_column("cover_updated_at")
        batch.drop_column("cover_size_bytes")
        batch.drop_column("cover_mime_type")
        batch.drop_column("cover_storage_key")
        batch.drop_column("update_status")
