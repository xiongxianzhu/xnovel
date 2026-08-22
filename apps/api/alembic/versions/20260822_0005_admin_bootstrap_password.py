"""允许可选邮箱并增加首次改密状态。

Revision ID: 20260822_0005
Revises: 20260822_0004
Create Date: 2026-08-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260822_0005"
down_revision: str | None = "20260822_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE_COMMENTS = {
    "users": "Web 用户账户、认证标识与个人资料",
}

COLUMN_COMMENTS = {
    "users": {
        "id": "用户唯一标识",
        "username": "规范化后的唯一用户名",
        "email": "去除首尾空格并转为小写的可选唯一邮箱",
        "email_verified_at": "邮箱验证时间（UTC），未验证时为空",
        "phone_e164": "E.164 格式的唯一手机号，未填写时为空",
        "phone_verified_at": "手机号验证时间（UTC），未验证时为空",
        "password_hash": "Argon2id 密码哈希，不保存或返回明文",
        "nickname": "面向用户展示的名称",
        "must_change_password": "是否必须完成首次密码修改",
        "role": "账户角色：user 或 admin",
        "avatar_source": "头像来源：none、upload 或 url",
        "avatar_storage_key": "上传头像的存储对象键",
        "avatar_mime_type": "上传头像解码后的真实 MIME 类型",
        "avatar_size_bytes": "上传头像的文件大小（字节）",
        "avatar_url": "外部头像的绝对 URL，不由服务端抓取",
        "avatar_updated_at": "头像最后更新时间（UTC）",
        "address": "用户现住址，属于私密资料",
        "birthday": "用户生日，属于私密资料",
        "status": "账户状态：active 或 disabled",
        "last_login_at": "最近一次成功登录时间（UTC）",
        "created_at": "创建时间（UTC）",
        "updated_at": "最后更新时间（UTC）",
    }
}


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "email",
            existing_type=sa.Text(),
            nullable=True,
            existing_comment="去除首尾空格并转为小写的唯一邮箱",
        )
        batch_op.add_column(
            sa.Column(
                "must_change_password",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
                comment="是否必须完成首次密码修改",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("must_change_password")
        batch_op.alter_column(
            "email",
            existing_type=sa.Text(),
            nullable=False,
            existing_comment="去除首尾空格并转为小写的可选唯一邮箱",
        )
