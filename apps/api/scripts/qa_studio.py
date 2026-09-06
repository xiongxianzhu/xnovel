"""只用于本机 xnovel_test 的合成界面验收服务，不连接真实模型。"""

from __future__ import annotations

import asyncio
import io
import json
import re
import zipfile

import uvicorn
from sqlalchemy.engine import make_url
from sqlmodel import col, select

from app.core.config import get_settings
from app.db.session import async_session_factory
from app.main import app
from app.models.account import User, UserPreference
from app.models.site import SiteSetting
from app.models.studio import ChapterSummary, PlotThread, StoryFact
from app.schemas.ai import ProviderConfigCreateRequest
from app.schemas.planning import CharacterCreateRequest, WorldEntryCreateRequest
from app.schemas.projects import DocumentContentUpdateRequest, DocumentCreateRequest, ProjectCreateRequest
from app.schemas.studio import FactInput, SummaryInput, ThreadInput
from app.services import ai_tasks
from app.services.identity import hash_password
from app.services.planning import create_character, create_world_entry
from app.services.projects import create_document, create_project, save_document_content
from app.services.provider_adapters import ProviderEvent
from app.services.providers import create_provider_config
from app.services.skills import create_skill_from_archive, set_skill_enabled
from app.services.studio_records import save_record


async def seed() -> None:
    settings = get_settings()
    url = make_url(settings.database_url)
    if url.database != "xnovel_test" or url.host not in {"localhost", "127.0.0.1"} or settings.app_env != "testing":
        raise RuntimeError("QA server requires a local xnovel_test database and APP_ENV=testing")
    if settings.refresh_cookie_name != "xnovel_studio_qa":
        raise RuntimeError("QA must use an isolated refresh cookie")
    async with async_session_factory() as session:
        existing = (await session.exec(select(User).where(col(User.username) == "qa-admin"))).first()
        if existing:
            return
        admin = User(
            username="qa-admin", nickname="测试作者", role="admin", password_hash=hash_password("Studio-QA-246!")
        )
        session.add(admin)
        await session.flush()
        session.add(UserPreference(user_id=admin.id))
        other = User(username="qa-writer", nickname="另一测试作者", password_hash=hash_password("Studio-QA-246!"))
        session.add(other)
        await session.flush()
        session.add(UserPreference(user_id=other.id))
        site = await session.get(SiteSetting, 1)
        if site:
            site.site_name = "xnovel · 合成测试"
            session.add(site)
        await session.commit()
        project = await create_project(
            session, owner_id=admin.id, payload=ProjectCreateRequest(title="雾港纪事（合成测试）", author="测试作者")
        )
        first = project.initial_document
        second = await create_document(
            session,
            owner_id=admin.id,
            project_id=project.id,
            payload=DocumentCreateRequest(title="第二章 夜航", kind="manuscript"),
        )
        third = await create_document(
            session,
            owner_id=admin.id,
            project_id=project.id,
            payload=DocumentCreateRequest(title="第三章 归潮", kind="manuscript"),
        )
        for document, body in [
            (first, "顾川第一次在旧港见到沈砚。\n\n她递来一枚青铜钥匙，嘱咐他在午夜前找到灯塔。顾川的左手完好无伤。"),
            (second, "沈砚带顾川登上夜航的船。\n\n躲避追兵时，顾川的左手受了伤。他尚不知道青铜钥匙真正的用途。"),
            (third, "顾川站在旧港的灯塔下，重新整理昨夜留下的线索。\n\n【待补】说明钥匙与灯塔的关系。"),
        ]:
            await save_document_content(
                session,
                owner_id=admin.id,
                project_id=project.id,
                document_id=document.id,
                payload=DocumentContentUpdateRequest(content=body, content_format="plain_text", version=1),
            )
        character = await create_character(
            session,
            owner_id=admin.id,
            project_id=project.id,
            payload=CharacterCreateRequest(
                name="顾川", aliases=["阿川"], summary="旧港的巡夜人", profile={"目标": "查明钥匙的用途"}
            ),
        )
        await create_world_entry(
            session,
            owner_id=admin.id,
            project_id=project.id,
            payload=WorldEntryCreateRequest(title="旧港灯塔", category="location", content="午夜后熄灯的旧灯塔。"),
        )
        await save_record(
            session,
            admin.id,
            project.id,
            ChapterSummary,
            SummaryInput(
                title="初遇与青铜钥匙",
                body="顾川在旧港初遇沈砚，接过青铜钥匙，被要求午夜前抵达灯塔。",
                source_document_id=first.id,
                source_version=2,
            ),
        )
        await save_record(
            session,
            admin.id,
            project.id,
            StoryFact,
            FactInput(
                title="顾川左手受伤",
                body="夜航躲避追兵时受伤，仍未知道钥匙的用途。",
                character_id=character.id,
                source_document_id=second.id,
                source_version=2,
                story_order=20,
            ),
        )
        await save_record(
            session,
            admin.id,
            project.id,
            PlotThread,
            ThreadInput(
                title="青铜钥匙的用途",
                body="在灯塔章节回收这条线索。",
                source_document_id=first.id,
                source_version=2,
                target_document_id=second.id,
            ),
        )
        await create_provider_config(
            session,
            owner_id=admin.id,
            settings=settings,
            payload=ProviderConfigCreateRequest(
                source="custom",
                provider_id="qa-local",
                display_name="合成测试模型（不调用外部服务）",
                protocol="openai_chat",
                base_url="http://127.0.0.1:18000/v1",
                api_key="qa-only-key",
                models=[
                    {
                        "model_id": "qa-fixture",
                        "display_name": "QA Fixture",
                        "context_window": 64000,
                        "max_output_tokens": 2048,
                    }
                ],
                default_model_id="qa-fixture",
            ),
        )
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as package:
            package.writestr(
                "SKILL.md",
                "---\nname: qa-continuity\ndescription: 合成的一致性辅助资料\n---\n"
                "只返回可核对的建议。参考[词表](terms.md)。",
            )
            package.writestr("terms.md", "顾川：旧港巡夜人。")
        skill = await create_skill_from_archive(
            session, owner_id=admin.id, filename="qa.skill", source=archive.getvalue(), settings=settings
        )
        await set_skill_enabled(session, owner_id=admin.id, skill_id=skill.id, enabled=True)
        await create_project(
            session, owner_id=other.id, payload=ProjectCreateRequest(title="另一账号的独立作品（合成）")
        )
        print(json.dumps({"qa_project_id": str(project.id), "qa_document_id": str(third.id)}, ensure_ascii=False))


async def fixture_stream(**kwargs):
    messages = "\n".join(message["content"] for message in kwargs["messages"])
    if '"issues"' in messages:
        current = re.search(r'<current document_id="([^"]+)">\n(.*?)\n</current>', messages, re.S)
        other = re.search(r'<source document_id="([^"]+)">\n(.*?)\n</source>', messages, re.S)
        issues = []
        if current and other:
            issues.append(
                {
                    "title": "合成验收疑点",
                    "explanation": "仅用于验证证据展示和人工处理，不代表真实模型判断。",
                    "evidence": current.group(2).strip().splitlines()[0],
                    "other_document_id": other.group(1),
                    "other_evidence": other.group(2).strip().splitlines()[0],
                }
            )
        result = json.dumps({"issues": issues}, ensure_ascii=False)
    else:
        result = "合成摘要候选：顾川与沈砚围绕旧港、青铜钥匙和灯塔展开行动。请作者核对来源后确认。"
    await asyncio.sleep(2)
    yield ProviderEvent(type="delta", text=result[: len(result) // 2])
    await asyncio.sleep(2)
    yield ProviderEvent(type="delta", text=result[len(result) // 2 :])
    yield ProviderEvent(type="usage", usage={"input_tokens": 200, "output_tokens": 60})


async def serve() -> None:
    await seed()
    ai_tasks.stream_provider = fixture_stream
    await uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=18000, access_log=False, log_level="warning")
    ).serve()


if __name__ == "__main__":
    asyncio.run(serve())
