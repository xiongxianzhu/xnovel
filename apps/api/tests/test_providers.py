"""Provider 配置、凭据和协议适配测试。"""

from __future__ import annotations

import base64

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import Settings
from app.core.exceptions import APIException
from app.models.account import User
from app.models.ai import AICredential
from app.schemas.ai import ProviderConfigCreateRequest, ProviderConfigUpdateRequest
from app.services.provider_adapters import parse_provider_payload
from app.services.providers import (
    _validated_config_values,
    create_provider_config,
    delete_provider_config,
    list_provider_configs,
    update_provider_config,
)


def _settings() -> Settings:
    return Settings(
        secret_key="testing-secret-key-at-least-32-bytes-long",
        xnovel_credential_master_key=base64.b64encode(b"m" * 32).decode(),
        provider_allowed_origins=["http://127.0.0.1:11434"],
    )


def _payload(api_key: str | None = "sk-secret-value") -> ProviderConfigCreateRequest:
    return ProviderConfigCreateRequest(
        source="custom",
        provider_id="local-test",
        display_name="本地测试",
        protocol="openai_chat",
        base_url="http://127.0.0.1:11434/v1",
        api_key=api_key,
        models=[
            {
                "model_id": "model-a",
                "display_name": "Model A",
                "context_window": 8192,
                "max_output_tokens": 1024,
            }
        ],
        default_model_id="model-a",
    )


@pytest.mark.anyio
async def test_provider_config_encrypts_key_and_never_returns_plaintext(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = (await session.exec(select(User))).first()
        if user is None:
            user = User(
                username="provider-owner",
                email="provider-owner@example.com",
                password_hash="hash",
                nickname="作者",
            )
            session.add(user)
            await session.commit()
        created = await create_provider_config(
            session,
            owner_id=user.id,
            payload=_payload(),
            settings=_settings(),
        )
        credential = (await session.exec(select(AICredential))).one()
        listed = await list_provider_configs(
            session,
            owner_id=user.id,
            settings=_settings(),
            page=1,
            page_size=20,
            query=None,
        )

        assert created.configured is True
        assert created.key_hint == "••••alue"
        assert credential.ciphertext != b"sk-secret-value"
        assert "sk-secret-value" not in listed.model_dump_json()
        assert listed.items[0].models[0].model_id == "model-a"
        deleted = await delete_provider_config(
            session,
            owner_id=user.id,
            config_id=created.id,
            settings=_settings(),
        )
        assert deleted.deleted is True
        assert (await session.exec(select(AICredential))).first() is None


@pytest.mark.anyio
async def test_custom_allowed_origin_can_be_explicitly_unauthenticated(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = User(
            username="provider-no-key",
            email="provider-no-key@example.com",
            password_hash="hash",
            nickname="作者",
        )
        session.add(user)
        await session.commit()
        created = await create_provider_config(
            session,
            owner_id=user.id,
            payload=_payload(api_key=None).model_copy(update={"provider_id": "local-no-key"}),
            settings=_settings(),
        )
        assert created.configured is False
        assert created.unauthenticated_warning is True


@pytest.mark.anyio
async def test_provider_update_replaces_models_and_rotates_key(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = User(
            username="provider-update",
            email="provider-update@example.com",
            password_hash="hash",
            nickname="作者",
        )
        session.add(user)
        await session.commit()
        created = await create_provider_config(
            session,
            owner_id=user.id,
            payload=_payload().model_copy(update={"provider_id": "local-update"}),
            settings=_settings(),
        )
        updated = await update_provider_config(
            session,
            owner_id=user.id,
            config_id=created.id,
            payload=ProviderConfigUpdateRequest(
                display_name="更新后",
                base_url="http://127.0.0.1:11434/v1",
                api_key="new-secret-key",
                models=[
                    {
                        "model_id": "model-b",
                        "display_name": "Model B",
                        "context_window": 16000,
                        "max_output_tokens": 2048,
                    }
                ],
                default_model_id="model-b",
            ),
            settings=_settings(),
        )
        assert updated.display_name == "更新后"
        assert [item.model_id for item in updated.models] == ["model-b"]
        assert updated.key_hint == "••••-key"


def test_protocol_payload_parsers_normalize_delta_and_usage() -> None:
    chat = parse_provider_payload(
        "openai_chat",
        {
            "choices": [{"delta": {"content": "你好"}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2},
        },
    )
    responses = parse_provider_payload(
        "openai_responses",
        {"type": "response.output_text.delta", "delta": "世界"},
    )
    anthropic = parse_provider_payload(
        "anthropic",
        {"type": "content_block_delta", "delta": {"text": "候选"}},
    )
    google = parse_provider_payload(
        "google",
        {"candidates": [{"content": {"parts": [{"text": "文本"}]}}]},
    )
    assert [item.text for item in chat if item.type == "delta"] == ["你好"]
    assert next(item for item in chat if item.type == "usage").usage["input_tokens"] == 3
    assert responses[0].text == "世界"
    assert anthropic[0].text == "候选"
    assert google[0].text == "文本"


@pytest.mark.anyio
async def test_builtin_provider_cannot_use_mismatched_protocol() -> None:
    payload = _payload().model_copy(update={"source": "builtin", "provider_id": "openai", "protocol": "anthropic"})
    with pytest.raises(APIException):
        await _validated_config_values(payload, _settings())
