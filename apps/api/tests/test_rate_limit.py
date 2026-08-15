"""注册限流测试。"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.site import AuthRateLimitBucket
from app.services.rate_limit import increment_registration_limits, normalize_client_ip


def test_client_ip_normalization_handles_mapped_ipv4() -> None:
    assert normalize_client_ip("::ffff:192.0.2.1") == "192.0.2.1"
    assert normalize_client_ip("2001:0db8::1") == "2001:db8::1"


@pytest.mark.anyio
async def test_identity_bucket_allows_three_and_rejects_fourth(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    now = datetime(2026, 8, 16, 10, 5, tzinfo=UTC)
    results = []
    async with session_factory() as session:
        for _ in range(4):
            results.append(
                await increment_registration_limits(
                    session,
                    secret_key="testing-secret",
                    client_ip="192.0.2.1",
                    username="writer",
                    email="writer@example.com",
                    now=now,
                )
            )

        rows = (await session.exec(select(AuthRateLimitBucket))).all()

    assert [result.allowed for result in results] == [True, True, True, False]
    assert all(result.retry_after_seconds == 300 for result in results)
    assert sorted(row.attempt_count for row in rows) == [4, 4]
    assert all(len(row.key_hash) == 32 for row in rows)


@pytest.mark.anyio
async def test_source_bucket_allows_ten_and_rejects_eleventh(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    now = datetime(2026, 8, 16, 10, 5, tzinfo=UTC)
    results = []
    async with session_factory() as session:
        for index in range(11):
            results.append(
                await increment_registration_limits(
                    session,
                    secret_key="testing-secret",
                    client_ip="192.0.2.1",
                    username=f"writer-{index}",
                    email=f"writer-{index}@example.com",
                    now=now,
                )
            )

    assert [result.allowed for result in results] == ([True] * 10) + [False]
