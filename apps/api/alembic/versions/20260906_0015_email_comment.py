"""补齐早期可选邮箱迁移遗漏的 PostgreSQL 列注释。"""

import sqlalchemy as sa

from alembic import op

revision = "20260906_0015"
down_revision = "20260906_0014"
branch_labels = None
depends_on = None

TABLE_COMMENTS: dict[str, str] = {}
COLUMN_COMMENTS = {"users": {"email": "去除首尾空格并转为小写的可选唯一邮箱"}}


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column(
            "users", "email", existing_type=sa.Text(), existing_nullable=True, comment=COLUMN_COMMENTS["users"]["email"]
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column(
            "users",
            "email",
            existing_type=sa.Text(),
            existing_nullable=True,
            comment="去除首尾空格并转为小写的唯一邮箱",
        )
