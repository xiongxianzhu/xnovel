"""将作品名称上限调整为 100 个字符。"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260830_0009"
down_revision: str | None = "20260830_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("ck_projects_title_length", type_="check")
        batch.create_check_constraint(
            "ck_projects_title_length",
            "length(title) BETWEEN 1 AND 100",
        )


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("ck_projects_title_length", type_="check")
        batch.create_check_constraint(
            "ck_projects_title_length",
            "length(title) BETWEEN 1 AND 200",
        )
