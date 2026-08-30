"""增加独立作品作者署名，保留旧作品内容。"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260830_0010"
down_revision: str | None = "20260830_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMN_COMMENTS = {"projects": {"author": "作品作者署名，最多 100 个字符，可留空"}}


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.add_column(
            sa.Column(
                "author",
                sa.Text(),
                nullable=False,
                server_default=sa.text("''"),
                comment=COLUMN_COMMENTS["projects"]["author"],
            )
        )
        batch.create_check_constraint("ck_projects_author_length", "length(author) <= 100")


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("ck_projects_author_length", type_="check")
        batch.drop_column("author")
