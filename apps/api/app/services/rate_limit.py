"""注册入口的持久化固定窗口限流。"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid7

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.sql.schema import Table
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.site import AuthRateLimitBucket

WINDOW_SECONDS = 600
SOURCE_LIMIT = 10
IDENTITY_LIMIT = 3
_KEY_DERIVATION_MESSAGE = b"xnovel:auth-rate-limit:key:v1"


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int


def normalize_client_ip(value: str) -> str:
    address = ipaddress.ip_address(value)
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return str(address.ipv4_mapped)
    return address.compressed


def _key_digest(secret_key: str, scope: str, values: list[str]) -> bytes:
    derived_key = hmac.new(secret_key.encode(), _KEY_DERIVATION_MESSAGE, hashlib.sha256).digest()
    payload = json.dumps([scope, *values], ensure_ascii=False, separators=(",", ":")).encode()
    return hmac.new(derived_key, payload, hashlib.sha256).digest()


def _window(now: datetime) -> tuple[datetime, int]:
    epoch = int(now.timestamp())
    started_epoch = epoch - (epoch % WINDOW_SECONDS)
    started_at = datetime.fromtimestamp(started_epoch, tz=UTC)
    retry_after = max(1, math.ceil((started_at + timedelta(seconds=WINDOW_SECONDS) - now).total_seconds()))
    return started_at, retry_after


async def _increment_bucket(
    session: AsyncSession,
    *,
    scope: str,
    key_hash: bytes,
    window_started_at: datetime,
) -> int:
    dialect_name = session.bind.dialect.name if session.bind is not None else ""
    values = {
        "id": uuid7(),
        "scope": scope,
        "key_hash": key_hash,
        "window_started_at": window_started_at,
        "window_seconds": WINDOW_SECONDS,
        "attempt_count": 1,
    }
    table = cast(Table, AuthRateLimitBucket.__table__)  # type: ignore[attr-defined]
    statement: Any
    if dialect_name == "postgresql":
        statement = postgresql_insert(table).values(**values)
    elif dialect_name == "sqlite":
        statement = sqlite_insert(table).values(**values)
    else:
        raise RuntimeError("unsupported database dialect")
    statement = statement.on_conflict_do_update(
        index_elements=["scope", "key_hash", "window_started_at"],
        set_={
            "attempt_count": table.c.attempt_count + 1,
            "updated_at": func.now(),
        },
    ).returning(table.c.attempt_count)
    result = await session.exec(statement)
    return int(result.one()[0])


async def increment_registration_limits(
    session: AsyncSession,
    *,
    secret_key: str,
    client_ip: str,
    username: str,
    email: str,
    now: datetime | None = None,
) -> RateLimitResult:
    current_time = now or datetime.now(UTC)
    window_started_at, retry_after = _window(current_time)
    normalized_ip = normalize_client_ip(client_ip)
    source_count = await _increment_bucket(
        session,
        scope="registration_source",
        key_hash=_key_digest(secret_key, "registration_source", [normalized_ip]),
        window_started_at=window_started_at,
    )
    identity_count = await _increment_bucket(
        session,
        scope="registration_source_identity",
        key_hash=_key_digest(
            secret_key,
            "registration_source_identity",
            [normalized_ip, username, email],
        ),
        window_started_at=window_started_at,
    )
    await session.commit()
    return RateLimitResult(
        allowed=source_count <= SOURCE_LIMIT and identity_count <= IDENTITY_LIMIT,
        retry_after_seconds=retry_after,
    )
