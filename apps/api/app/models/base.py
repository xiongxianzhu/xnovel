"""SQLModel 公共 mixin 与基类约定。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from sqlalchemy import DateTime, func
from sqlmodel import Field, SQLModel

UTC_DATETIME = cast(type[Any], DateTime(timezone=True))


class TimestampMixin(SQLModel):
    """由数据库生成的公共 UTC 时间戳字段。"""

    created_at: datetime | None = Field(
        default=None,
        sa_type=UTC_DATETIME,
        nullable=False,
        sa_column_kwargs={"server_default": func.now(), "comment": "创建时间（UTC）"},
    )
    updated_at: datetime | None = Field(
        default=None,
        sa_type=UTC_DATETIME,
        nullable=False,
        sa_column_kwargs={
            "server_default": func.now(),
            "onupdate": func.now(),
            "comment": "最后更新时间（UTC）",
        },
    )


class ImmutableTimestampMixin(TimestampMixin):
    """创建后保持两个时间相等的追加记录时间戳。"""

    updated_at: datetime | None = Field(
        default=None,
        sa_type=UTC_DATETIME,
        nullable=False,
        sa_column_kwargs={"server_default": func.now(), "comment": "最后更新时间（UTC）"},
    )
