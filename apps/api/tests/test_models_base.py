"""公共模型字段测试。"""

from datetime import UTC, datetime
from pathlib import Path
from runpy import run_path
from typing import Any
from uuid import uuid7

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, Session, SQLModel, create_engine

from app.models.account import User, UserPreference
from app.models.base import ImmutableTimestampMixin, TimestampMixin
from app.models.site import AdminAuditEvent, AuthRateLimitBucket, SiteSetting


class TimestampedRecord(TimestampMixin, table=True):
    """用于验证时间戳 mixin 的最小表模型。"""

    __tablename__ = "test_timestamped_records"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(default="")


class ImmutableTimestampedRecord(ImmutableTimestampMixin, table=True):
    """用于验证不可变记录时间戳的最小表模型。"""

    __tablename__ = "test_immutable_timestamped_records"

    id: int | None = Field(default=None, primary_key=True)


def test_timestamp_mixin_uses_required_timezone_aware_fields() -> None:
    table = TimestampedRecord.__table__

    assert table.c.created_at.nullable is False
    assert table.c.updated_at.nullable is False
    assert table.c.created_at.type.timezone is True
    assert table.c.updated_at.type.timezone is True
    assert table.c.created_at.server_default is not None
    assert table.c.updated_at.server_default is not None
    assert table.c.updated_at.onupdate is not None


def test_timestamp_mixin_uses_one_database_time_on_insert() -> None:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        record = TimestampedRecord()
        session.add(record)
        session.commit()
        session.refresh(record)

        assert record.created_at is not None
        assert record.updated_at is not None
        assert record.updated_at == record.created_at


def test_timestamp_mixin_advances_only_updated_at_on_update() -> None:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    original_time = datetime(2000, 1, 1, tzinfo=UTC)

    with Session(engine) as session:
        record = TimestampedRecord(
            name="before",
            created_at=original_time,
            updated_at=original_time,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        stored_created_at = record.created_at

        record.name = "after"
        session.add(record)
        session.commit()
        session.refresh(record)

        assert record.created_at == stored_created_at
        assert record.updated_at is not None
        assert stored_created_at is not None
        assert record.updated_at > stored_created_at


def test_immutable_timestamp_mixin_has_no_update_hook() -> None:
    table = ImmutableTimestampedRecord.__table__

    assert table.c.created_at.server_default is not None
    assert table.c.updated_at.server_default is not None
    assert table.c.updated_at.onupdate is None


@pytest.mark.parametrize(
    "model",
    [User, UserPreference, SiteSetting, AdminAuditEvent, AuthRateLimitBucket],
)
def test_t106_tables_have_required_timestamps(model: type[Any]) -> None:
    table = model.__table__  # type: ignore[attr-defined]

    assert table.c.created_at.nullable is False
    assert table.c.updated_at.nullable is False
    assert table.c.created_at.server_default is not None
    assert table.c.updated_at.server_default is not None


def test_all_persistent_tables_and_columns_have_chinese_comments() -> None:
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "20260816_0002_persistence_comments.py"
    migration = run_path(str(migration_path))
    table_comments: dict[str, str] = migration["TABLE_COMMENTS"]
    column_comments: dict[str, dict[str, str]] = migration["COLUMN_COMMENTS"]
    persistent_tables = {
        name: table for name, table in SQLModel.metadata.tables.items() if not name.startswith("test_")
    }

    assert set(table_comments) == set(column_comments) == set(persistent_tables)
    for table_name, table in persistent_tables.items():
        assert table.comment == table_comments[table_name]
        assert _contains_chinese(table.comment)
        assert set(column_comments[table_name]) == set(table.columns.keys())
        for column in table.columns:
            assert column.comment == column_comments[table_name][column.name]
            assert _contains_chinese(column.comment)


def _contains_chinese(value: str | None) -> bool:
    return value is not None and any("\u4e00" <= character <= "\u9fff" for character in value)


def test_site_singleton_and_audit_actor_checks_are_enforced() -> None:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        session.add(SiteSetting(id=2))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(
            AdminAuditEvent(
                actor_type="system",
                admin_id=uuid7(),
                action="invalid",
                target_type="test",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
