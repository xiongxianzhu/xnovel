"""AI 上下文、任务终态、取消和候选决策测试。"""

from __future__ import annotations

import base64
import io
import zipfile
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import Settings
from app.models.account import User, UserPreference
from app.models.ai import AIResult, AITask
from app.models.document_content import DocumentContent
from app.schemas.ai import AIResultApplyRequest, AITaskCreateRequest, ProviderConfigCreateRequest
from app.schemas.planning import CharacterCreateRequest, DocumentReferencesUpdateRequest, WorldEntryCreateRequest
from app.schemas.projects import ProjectCreateRequest
from app.services import ai_tasks
from app.services.ai_tasks import apply_ai_result, cancel_ai_task, create_ai_task, execute_ai_task
from app.services.planning import create_character, create_world_entry, update_document_references
from app.services.projects import create_project
from app.services.provider_adapters import ProviderEvent
from app.services.providers import create_provider_config
from app.services.skills import create_skill_from_archive, set_skill_enabled


def _settings(skill_root: Path) -> Settings:
    return Settings(
        secret_key="testing-secret-key-at-least-32-bytes-long",
        xnovel_credential_master_key=base64.b64encode(b"a" * 32).decode(),
        provider_allowed_origins=["http://127.0.0.1:11434"],
        skill_storage_root=skill_root,
        ai_call_timeout_seconds=10,
    )


async def _setup(
    session: AsyncSession,
    settings: Settings,
) -> tuple[User, object, object, object]:
    user = User(
        username="ai-owner",
        email="ai-owner@example.com",
        password_hash="hash",
        nickname="作者",
    )
    session.add(user)
    await session.flush()
    session.add(UserPreference(user_id=user.id))
    await session.commit()
    project = await create_project(session, owner_id=user.id, payload=ProjectCreateRequest(title="AI 作品"))
    provider = await create_provider_config(
        session,
        owner_id=user.id,
        settings=settings,
        payload=ProviderConfigCreateRequest(
            source="custom",
            provider_id="test-provider",
            display_name="测试 Provider",
            protocol="openai_chat",
            base_url="http://127.0.0.1:11434/v1",
            api_key="test-key",
            models=[
                {
                    "model_id": "test-model",
                    "display_name": "Test Model",
                    "context_window": 16000,
                    "max_output_tokens": 2048,
                }
            ],
            default_model_id="test-model",
        ),
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            "SKILL.md",
            "---\nname: ai-helper\ndescription: 测试 Skill\n---\n只输出候选，不修改正文。",
        )
    skill = await create_skill_from_archive(
        session,
        owner_id=user.id,
        filename="ai-helper.skill",
        source=output.getvalue(),
        settings=settings,
    )
    await set_skill_enabled(session, owner_id=user.id, skill_id=skill.id, enabled=True)
    return user, project, provider, skill


@pytest.mark.anyio
async def test_ai_task_uses_minimal_manifest_and_saves_candidate_then_applies_atomically(
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
    monkeypatch,
) -> None:
    settings = _settings(tmp_path / "skills")
    async with session_factory() as session:
        user, project, provider, skill = await _setup(session, settings)
        character = await create_character(
            session,
            owner_id=user.id,
            project_id=project.id,
            payload=CharacterCreateRequest(name="沈砚", summary="记者"),
        )
        world = await create_world_entry(
            session,
            owner_id=user.id,
            project_id=project.id,
            payload=WorldEntryCreateRequest(title="雾城", category="location", content="多雾"),
        )
        await update_document_references(
            session,
            owner_id=user.id,
            project_id=project.id,
            document_id=project.initial_document.id,
            payload=DocumentReferencesUpdateRequest(
                character_ids=[character.id],
                world_entry_ids=[world.id],
            ),
        )
        task_data, execution = await create_ai_task(
            session,
            owner_id=user.id,
            settings=settings,
            payload=AITaskCreateRequest(
                project_id=project.id,
                document_id=project.initial_document.id,
                provider_config_id=provider.id,
                task_type="rewrite",
                instruction="润色选区",
                selected_text="雨夜归来",
                skill_ids=[skill.id],
            ),
        )
        assert task_data.context_manifest["selected_text"] is True
        assert task_data.context_manifest["references"] == {
            "character_count": 1,
            "world_entry_count": 1,
        }
        assert task_data.context_manifest["skills"][0]["content_sha256"]
        assert "雨夜归来" not in task_data.model_dump_json()

    async def fake_stream_provider(**_):
        yield ProviderEvent(type="delta", text="润色候选")
        yield ProviderEvent(
            type="usage",
            usage={
                "input_tokens": 10,
                "output_tokens": 4,
                "cache_read_tokens": None,
                "reasoning_tokens": None,
            },
        )

    monkeypatch.setattr(ai_tasks, "async_session_factory", session_factory)
    monkeypatch.setattr(ai_tasks, "get_settings", lambda: settings)
    monkeypatch.setattr(ai_tasks, "stream_provider", fake_stream_provider)
    await execute_ai_task(execution)

    async with session_factory() as session:
        task = await session.get(AITask, execution.task_id)
        result = (await session.exec(select(AIResult).where(AIResult.task_id == execution.task_id))).one()
        assert task is not None
        assert task.status == "succeeded"
        assert task.input_tokens == 10
        assert result.content == "润色候选"
        decision = await apply_ai_result(
            session,
            owner_id=user.id,
            result_id=result.id,
            payload=AIResultApplyRequest(
                document_id=project.initial_document.id,
                version=1,
                content="作者确认后的正文",
            ),
        )
        content = await session.get(DocumentContent, project.initial_document.id)
        assert decision.result.status == "applied"
        assert decision.document_version == 2
        assert content is not None and content.content == "作者确认后的正文"


@pytest.mark.anyio
async def test_cancelled_task_is_terminal_and_produces_no_candidate(
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path / "skills")
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        _, execution = await create_ai_task(
            session,
            owner_id=user.id,
            settings=settings,
            payload=AITaskCreateRequest(
                project_id=project.id,
                document_id=project.initial_document.id,
                provider_config_id=provider.id,
                task_type="brainstorm",
                instruction="提供三个方向",
            ),
        )
        cancelled = await cancel_ai_task(session, owner_id=user.id, task_id=execution.task_id)
        assert cancelled.status == "cancelled"

    async with session_factory() as session:
        assert (await session.exec(select(AIResult).where(AIResult.task_id == execution.task_id))).first() is None


@pytest.mark.anyio
async def test_candidate_apply_rejects_stale_document_version(
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path / "skills")
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        task = AITask(
            owner_id=user.id,
            project_id=project.id,
            document_id=project.initial_document.id,
            provider_config_id=provider.id,
            task_type="rewrite",
            provider="test-provider",
            model="test-model",
            instruction="测试",
            status="succeeded",
            started_at=project.created_at,
            finished_at=project.updated_at,
        )
        session.add(task)
        await session.flush()
        result = AIResult(project_id=project.id, task_id=task.id, content="候选")
        session.add(result)
        await session.commit()
        with pytest.raises(Exception) as captured:
            await apply_ai_result(
                session,
                owner_id=user.id,
                result_id=result.id,
                payload=AIResultApplyRequest(
                    document_id=project.initial_document.id,
                    version=99,
                    content="候选",
                ),
            )
        assert "CONFLICT" in str(captured.value)
        await session.refresh(result)
        assert result.status == "candidate"


@pytest.mark.anyio
async def test_user_ai_concurrency_slot_rejects_third_running_task(
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path / "skills")
    async with session_factory() as session:
        user, project, provider, _ = await _setup(session, settings)
        executions = []
        for index in range(3):
            _, execution = await create_ai_task(
                session,
                owner_id=user.id,
                settings=settings,
                payload=AITaskCreateRequest(
                    project_id=project.id,
                    document_id=project.initial_document.id,
                    provider_config_id=provider.id,
                    task_type="brainstorm",
                    instruction=f"并发任务 {index}",
                ),
            )
            executions.append(execution)

        assert await ai_tasks._claim_task(session, executions[0], settings) is not None
        assert await ai_tasks._claim_task(session, executions[1], settings) is not None
        assert await ai_tasks._claim_task(session, executions[2], settings) is None
        rejected = await session.get(AITask, executions[2].task_id)
        assert rejected is not None
        assert rejected.status == "failed"
        assert rejected.error_code == "AI_CONCURRENCY_LIMIT"
