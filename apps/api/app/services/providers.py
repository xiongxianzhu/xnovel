"""Provider 配置、模型与凭据服务。"""

from __future__ import annotations

import math
from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import delete, func, or_, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import Settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.models.ai import AICredential, AIProviderConfig, AIProviderModel, AITask
from app.schemas.ai import (
    ProviderConfigCreateRequest,
    ProviderConfigData,
    ProviderConfigDeleteData,
    ProviderConfigListData,
    ProviderConfigUpdateRequest,
    ProviderModelData,
)
from app.services.ai_credentials import CredentialCipher
from app.services.provider_catalog import BUILTIN_PROVIDERS
from app.services.provider_security import normalize_provider_url, origin_of, validate_provider_target


def _timestamps(value: AIProviderConfig) -> tuple[datetime, datetime]:
    if value.created_at is None or value.updated_at is None:
        raise _unavailable()
    return value.created_at, value.updated_at


async def _models(session: AsyncSession, config_id: UUID) -> list[AIProviderModel]:
    return list(
        (
            await session.exec(
                select(AIProviderModel)
                .where(col(AIProviderModel.provider_config_id) == config_id)
                .order_by(col(AIProviderModel.created_at), col(AIProviderModel.id))
            )
        ).all()
    )


async def _config_data(
    session: AsyncSession,
    config: AIProviderConfig,
    *,
    settings: Settings,
) -> ProviderConfigData:
    models = await _models(session, config.id)
    credential = await session.get(AICredential, config.credential_id) if config.credential_id else None
    created_at, updated_at = _timestamps(config)
    base_url = effective_base_url(config)
    allowed = {origin_of(normalize_provider_url(item)) for item in settings.provider_allowed_origins}
    return ProviderConfigData(
        id=config.id,
        source=config.source,  # type: ignore[arg-type]
        provider_id=config.provider_id,
        display_name=config.display_name,
        protocol=config.protocol,  # type: ignore[arg-type]
        base_url=base_url,
        configured=credential is not None,
        key_hint=credential.key_hint if credential else None,
        unauthenticated_warning=credential is None and origin_of(base_url) in allowed,
        default_model_id=config.default_model_id,
        enabled=config.enabled,
        models=[
            ProviderModelData(
                id=item.id,
                model_id=item.model_id,
                display_name=item.display_name,
                context_window=item.context_window,
                max_output_tokens=item.max_output_tokens,
                supports_streaming=item.supports_streaming,
                enabled=item.enabled,
            )
            for item in models
        ],
        created_at=created_at,
        updated_at=updated_at,
    )


def effective_base_url(config: AIProviderConfig) -> str:
    if config.base_url:
        return config.base_url
    item = BUILTIN_PROVIDERS.get(config.provider_id)
    if item is None:
        raise _unavailable()
    return item.base_url


async def _validated_config_values(
    payload: ProviderConfigCreateRequest,
    settings: Settings,
) -> tuple[str, bool]:
    if payload.source == "builtin":
        catalog = BUILTIN_PROVIDERS.get(payload.provider_id)
        if catalog is None or catalog.protocol != payload.protocol:
            raise _validation("builtin_provider_mismatch")
        url = payload.base_url or catalog.base_url
        if not payload.api_key and catalog.requires_key:
            raise _validation("provider_key_required")
    else:
        if payload.provider_id in BUILTIN_PROVIDERS or not payload.base_url:
            raise _validation("custom_provider_invalid")
        url = payload.base_url
    normalized = await validate_provider_target(url, settings.provider_allowed_origins)
    unauthenticated = not payload.api_key
    if unauthenticated and origin_of(normalized) not in {
        origin_of(normalize_provider_url(item)) for item in settings.provider_allowed_origins
    }:
        raise _validation("provider_key_required")
    return normalized, unauthenticated


async def list_provider_configs(
    session: AsyncSession,
    *,
    owner_id: UUID,
    settings: Settings,
    page: int,
    page_size: int,
    query: str | None,
) -> ProviderConfigListData:
    filters = [col(AIProviderConfig.owner_id) == owner_id]
    normalized_query = query.strip() if query else ""
    if normalized_query:
        pattern = f"%{normalized_query}%"
        filters.append(
            or_(
                col(AIProviderConfig.display_name).ilike(pattern),
                col(AIProviderConfig.provider_id).ilike(pattern),
                col(AIProviderConfig.base_url).ilike(pattern),
            )
        )
    try:
        total = int((await session.exec(select(func.count()).select_from(AIProviderConfig).where(*filters))).one())
        configs = list(
            (
                await session.exec(
                    select(AIProviderConfig)
                    .where(*filters)
                    .order_by(col(AIProviderConfig.updated_at).desc(), col(AIProviderConfig.id).desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            ).all()
        )
        items = [await _config_data(session, item, settings=settings) for item in configs]
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _unavailable() from exc
    return ProviderConfigListData(
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
        items=items,
    )


async def delete_provider_config(
    session: AsyncSession,
    *,
    owner_id: UUID,
    config_id: UUID,
    settings: Settings,
) -> ProviderConfigDeleteData:
    try:
        config = await get_provider_config(
            session,
            owner_id=owner_id,
            config_id=config_id,
            settings=settings,
            lock=True,
        )
        credential_id = config.credential_id
        await session.exec(
            update(AITask)
            .where(col(AITask.owner_id) == owner_id, col(AITask.provider_config_id) == config_id)
            .values(provider_config_id=None)
        )
        await session.exec(delete(AIProviderConfig).where(col(AIProviderConfig.id) == config_id))
        if credential_id:
            await session.exec(delete(AICredential).where(col(AICredential.id) == credential_id))
        await session.commit()
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable() from exc
    return ProviderConfigDeleteData(id=config_id, deleted=True)


async def get_provider_config(
    session: AsyncSession,
    *,
    owner_id: UUID,
    config_id: UUID,
    settings: Settings,
    lock: bool = False,
) -> AIProviderConfig:
    statement = select(AIProviderConfig).where(
        col(AIProviderConfig.id) == config_id,
        col(AIProviderConfig.owner_id) == owner_id,
    )
    if lock:
        statement = statement.with_for_update()
    config = (await session.exec(statement)).one_or_none()
    if config is None:
        raise _not_found()
    return config


async def read_provider_config_data(
    session: AsyncSession,
    *,
    owner_id: UUID,
    config_id: UUID,
    settings: Settings,
) -> ProviderConfigData:
    try:
        config = await get_provider_config(
            session,
            owner_id=owner_id,
            config_id=config_id,
            settings=settings,
        )
        return await _config_data(session, config, settings=settings)
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _unavailable() from exc


async def create_provider_config(
    session: AsyncSession,
    *,
    owner_id: UUID,
    payload: ProviderConfigCreateRequest,
    settings: Settings,
) -> ProviderConfigData:
    normalized_url, _ = await _validated_config_values(payload, settings)
    config_id = uuid7()
    model_rows = [
        AIProviderModel(
            id=uuid7(),
            provider_config_id=config_id,
            model_id=item.model_id,
            display_name=item.display_name,
            context_window=item.context_window,
            max_output_tokens=item.max_output_tokens,
            supports_streaming=item.supports_streaming,
            enabled=item.enabled,
        )
        for item in payload.models
    ]
    default_model = next(item for item in model_rows if item.model_id == payload.default_model_id)
    credential: AICredential | None = None
    if payload.api_key:
        credential_id = uuid7()
        cipher = CredentialCipher.from_settings(settings)
        ciphertext, nonce, hint = cipher.encrypt(owner_id, credential_id, payload.api_key)
        credential = AICredential(
            id=credential_id,
            owner_id=owner_id,
            ciphertext=ciphertext,
            nonce=nonce,
            master_key_version=cipher.key_version,
            key_hint=hint,
        )
    config = AIProviderConfig(
        id=config_id,
        owner_id=owner_id,
        source=payload.source,
        provider_id=payload.provider_id,
        display_name=payload.display_name,
        protocol=payload.protocol,
        base_url=normalized_url if payload.source == "custom" or payload.base_url else None,
        credential_id=credential.id if credential else None,
        default_model_id=default_model.id,
        enabled=payload.enabled,
    )
    try:
        if credential:
            session.add(credential)
        session.add(config)
        for model in model_rows:
            session.add(model)
        await session.commit()
        await session.refresh(config)
    except IntegrityError as exc:
        await session.rollback()
        raise _conflict("provider_id_unavailable") from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable() from exc
    return await _config_data(session, config, settings=settings)


async def update_provider_config(
    session: AsyncSession,
    *,
    owner_id: UUID,
    config_id: UUID,
    payload: ProviderConfigUpdateRequest,
    settings: Settings,
) -> ProviderConfigData:
    try:
        config = await get_provider_config(
            session,
            owner_id=owner_id,
            config_id=config_id,
            settings=settings,
            lock=True,
        )
        create_shape = ProviderConfigCreateRequest(
            source=config.source,
            provider_id=config.provider_id,
            display_name=payload.display_name,
            protocol=config.protocol,
            base_url=payload.base_url,
            api_key=payload.api_key or ("existing" if config.credential_id and not payload.clear_api_key else None),
            models=payload.models,
            default_model_id=payload.default_model_id,
            enabled=payload.enabled,
        )
        normalized_url, _ = await _validated_config_values(create_shape, settings)
        old_credential = await session.get(AICredential, config.credential_id) if config.credential_id else None
        if payload.clear_api_key and old_credential:
            config.credential_id = None
            await session.flush()
            await session.delete(old_credential)
        elif payload.api_key:
            if old_credential is None:
                old_credential = AICredential(id=uuid7(), owner_id=owner_id)
            cipher = CredentialCipher.from_settings(settings)
            ciphertext, nonce, hint = cipher.encrypt(owner_id, old_credential.id, payload.api_key)
            old_credential.ciphertext = ciphertext
            old_credential.nonce = nonce
            old_credential.algorithm = "AES-256-GCM"
            old_credential.master_key_version = cipher.key_version
            old_credential.key_hint = hint
            session.add(old_credential)
            config.credential_id = old_credential.id
        old_models = await _models(session, config.id)
        for item in old_models:
            await session.delete(item)
        model_rows = [
            AIProviderModel(
                id=uuid7(),
                provider_config_id=config.id,
                model_id=item.model_id,
                display_name=item.display_name,
                context_window=item.context_window,
                max_output_tokens=item.max_output_tokens,
                supports_streaming=item.supports_streaming,
                enabled=item.enabled,
            )
            for item in payload.models
        ]
        config.display_name = payload.display_name
        config.base_url = normalized_url if config.source == "custom" or payload.base_url else None
        config.default_model_id = next(item.id for item in model_rows if item.model_id == payload.default_model_id)
        config.enabled = payload.enabled
        session.add(config)
        for item in model_rows:
            session.add(item)
        await session.commit()
        await session.refresh(config)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _unavailable() from exc
    return await _config_data(session, config, settings=settings)


async def decrypt_provider_key(
    session: AsyncSession,
    *,
    owner_id: UUID,
    config: AIProviderConfig,
    settings: Settings,
) -> str | None:
    if config.credential_id is None:
        return None
    credential = await session.get(AICredential, config.credential_id)
    if credential is None or credential.owner_id != owner_id:
        raise _unavailable()
    cipher = CredentialCipher.from_settings(settings)
    return cipher.decrypt(
        owner_id,
        credential.id,
        credential.ciphertext,
        credential.nonce,
        credential.master_key_version,
    )


def _validation(reason: str) -> APIException:
    return APIException(
        status_code=422,
        code=ErrorCode.VALIDATION_ERROR,
        msg=ErrorMessage.VALIDATION_ERROR,
        data={"reason": reason},
    )


def _conflict(reason: str) -> APIException:
    return APIException(
        status_code=409,
        code=ErrorCode.CONFLICT,
        msg=ErrorMessage.CONFLICT,
        data={"reason": reason},
    )


def _not_found() -> APIException:
    return APIException(status_code=404, code=ErrorCode.NOT_FOUND, msg=ErrorMessage.NOT_FOUND)


def _unavailable() -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
    )
