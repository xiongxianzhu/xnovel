"""增加可配置的公开站点名称，保留已有 Logo 和注册设置。"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260905_0011"
down_revision: str | None = "20260830_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMN_COMMENTS = {"site_settings": {"site_name": "公开站点名称，去除首尾空白后为 1–100 个字符"}}


def upgrade() -> None:
    with op.batch_alter_table("site_settings") as batch:
        batch.add_column(sa.Column(
            "site_name", sa.Text(), nullable=False, server_default=sa.text("'xnovel'"),
            comment=COLUMN_COMMENTS["site_settings"]["site_name"],
        ))
        batch.create_check_constraint("ck_site_settings_name_length", "length(trim(site_name)) BETWEEN 1 AND 100")


def downgrade() -> None:
    with op.batch_alter_table("site_settings") as batch:
        batch.drop_constraint("ck_site_settings_name_length", type_="check")
        batch.drop_column("site_name")
