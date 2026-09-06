"""在独立 xnovel_test 数据库验证 1000 章/300 万字；拒绝写入其他数据库。"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import platform
import statistics
from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid7

from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url

from app.api.deps import get_db
from app.core.config import get_settings
from app.db.session import async_session_factory, engine
from app.main import app
from app.models.account import User, UserPreference
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.project import Project
from app.models.studio import ChapterSummary, PlotThread, StoryFact
from app.services.identity import hash_password
from app.services.studio_records import source_order_hash


async def benchmark() -> None:
    url = make_url(get_settings().database_url)
    if url.database != "xnovel_test" or url.host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("Benchmark writes require a local xnovel_test database")
    now = datetime.now(UTC)
    username = f"bench-{str(uuid7())[-8:]}"
    password = "Synthetic-Benchmark-246!"
    async with async_session_factory() as session:
        user = User(
            username=username,
            nickname="性能测试作者（合成）",
            password_hash=hash_password(password),
            created_at=now,
            updated_at=now,
        )
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        project = Project(owner_id=user.id, title="千章长篇性能样本（合成数据）", created_at=now, updated_at=now)
        session.add(project)
        await session.flush()
        documents = [
            Document(
                project_id=project.id,
                title=f"第{index + 1:04d}章",
                kind="manuscript",
                position=index,
                created_at=now,
                updated_at=now,
            )
            for index in range(1000)
        ]
        session.add_all(documents)
        await session.flush()
        order = [document.id for document in documents]
        for index, document in enumerate(documents):
            text = ("雾城夜雨巡夜人走过长街寻找线索铜门灯火城中旧港记忆" * 150)[:3000]
            if index == 499:
                text = "唯一线索青铜密钥" + text[len("唯一线索青铜密钥") :]
            session.add(
                DocumentContent(
                    document_id=document.id,
                    content=text,
                    content_format="plain_text",
                    version=1,
                    word_count=3000,
                    checksum=hashlib.sha256(text.encode()).hexdigest(),
                    updated_by=user.id,
                    created_at=now,
                    updated_at=now,
                )
            )
            session.add(
                ChapterSummary(
                    project_id=project.id,
                    title=f"第{index + 1}章前情",
                    body="合成摘要：作者确认的剧情进展。",
                    source_document_id=document.id,
                    source_version=1,
                    source_order=source_order_hash(order, document.id),
                    status="confirmed",
                    created_at=now,
                    updated_at=now,
                )
            )
        for index in range(200):
            source = documents[index * 4]
            session.add(
                StoryFact(
                    project_id=project.id,
                    title=f"人物状态{index}",
                    body="合成事实：人物在港口。",
                    source_document_id=source.id,
                    source_version=1,
                    source_order=source_order_hash(order, source.id),
                    created_at=now,
                    updated_at=now,
                )
            )
        for index in range(100):
            session.add(
                PlotThread(
                    project_id=project.id,
                    title=f"未完成线索{index}",
                    body="合成线索，等待作者处理。",
                    created_at=now,
                    updated_at=now,
                )
            )
        await session.commit()
        project_id = project.id
        document_id = documents[-1].id

    async def database():
        async with async_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = database
    timings: dict[str, list[float]] = {"list": [], "recall": [], "search": []}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login = await client.post("/api/v1/auth/login", json={"identifier": username, "password": password})
        login.raise_for_status()
        headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}
        paths = {
            "list": f"/api/v1/projects/{project_id}/studio/summaries?page=10&page_size=50",
            "recall": f"/api/v1/projects/{project_id}/studio/recall?document_id={document_id}",
            "search": f"/api/v1/projects/{project_id}/search?q=雾城&page=10&page_size=50",
        }
        for name, path in paths.items():
            warmup = await client.get(path, headers=headers)
            warmup.raise_for_status()
            for _ in range(30):
                start = perf_counter()
                response = await client.get(path, headers=headers)
                response.raise_for_status()
                timings[name].append((perf_counter() - start) * 1000)
        rare = await client.get(f"/api/v1/projects/{project_id}/search?q=唯一线索青铜密钥", headers=headers)
        assert rare.json()["data"]["total"] == 1
    app.dependency_overrides.clear()
    async with engine.connect() as connection:
        from sqlalchemy import text

        version = (await connection.execute(text("SHOW server_version"))).scalar_one()
    result = {
        "chapters": 1000,
        "characters": 3000000,
        "facts": 200,
        "threads": 100,
        "samples_per_endpoint": 30,
        "postgresql": version,
        "os": platform.system(),
        "logical_cpus": os.cpu_count(),
        "transport": "HTTPX ASGI + real PostgreSQL",
        "measurements_ms": {
            name: {"median": round(statistics.median(values), 2), "p95": round(sorted(values)[28], 2)}
            for name, values in timings.items()
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result["measurements_ms"]["list"]["p95"] <= 1000
    assert result["measurements_ms"]["recall"]["p95"] <= 1000
    assert result["measurements_ms"]["search"]["p95"] <= 2000
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(benchmark())
