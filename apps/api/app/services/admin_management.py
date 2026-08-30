"""管理员用户管理与审计查询服务。"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.models.account import User, UserPreference
from app.models.session import UserSession
from app.models.site import AdminAuditEvent
from app.schemas.admin.management import (
    AdminUserCreateRequest,
    AdminUserData,
    AdminUserListData,
    AdminUserUpdateRequest,
    LoginAuditData,
    LoginAuditListData,
    OperationAuditData,
    OperationAuditListData,
)
from app.services.identity import (
    IdentityValidationError,
    hash_strong_password,
    validate_account_email,
    validate_nickname,
    validate_username,
)


def _api_error(status_code: int, code: ErrorCode, message: ErrorMessage, **data: object) -> APIException:
    return APIException(status_code=status_code, code=code, msg=message, data=data)


def _validation_error(exc: IdentityValidationError) -> APIException:
    return _api_error(
        422,
        ErrorCode.VALIDATION_ERROR,
        ErrorMessage.VALIDATION_ERROR,
        details=[{"loc": ["body", exc.field], "msg": exc.reason, "type": "value_error"}],
    )


def _user_data(user: User) -> AdminUserData:
    if user.created_at is None or user.updated_at is None:
        raise _api_error(500, ErrorCode.INTERNAL_ERROR, ErrorMessage.INTERNAL_ERROR)
    return AdminUserData(
        id=user.id,
        username=user.username,
        email_masked=_mask_email(user.email),
        phone_masked=_mask_phone(user.phone_e164),
        nickname=user.nickname,
        role=user.role,
        status=user.status,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def list_users(
    session: AsyncSession,
    *,
    offset: int,
    limit: int,
    query: str | None,
    role: str | None,
    status: str | None,
) -> AdminUserListData:
    filters = []
    normalized_query = query.strip() if query else None
    if normalized_query:
        pattern = f"%{normalized_query}%"
        filters.append(or_(col(User.username).ilike(pattern), col(User.nickname).ilike(pattern)))
    if role:
        filters.append(col(User.role) == role)
    if status:
        filters.append(col(User.status) == status)
    try:
        total = (await session.exec(select(func.count()).select_from(User).where(*filters))).one()
        users = (
            await session.exec(
                select(User).where(*filters).order_by(col(User.created_at).desc()).offset(offset).limit(limit)
            )
        ).all()
    except SQLAlchemyError as exc:
        raise _api_error(503, ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE) from exc
    return AdminUserListData(items=[_user_data(user) for user in users], total=total, offset=offset, limit=limit)


async def get_user(session: AsyncSession, user_id: UUID) -> AdminUserData:
    user = await _get_user(session, user_id)
    return _user_data(user)


async def create_user(
    session: AsyncSession,
    *,
    admin_id: UUID,
    payload: AdminUserCreateRequest,
) -> AdminUserData:
    try:
        username = validate_username(payload.username)
        email = validate_account_email(payload.email) if payload.email else None
        nickname = validate_nickname(payload.nickname)
        password_hash = await run_in_threadpool(
            hash_strong_password,
            payload.password,
            username=username,
            email=email,
        )
    except IdentityValidationError as exc:
        raise _validation_error(exc) from exc
    user = User(
        username=username,
        email=email,
        nickname=nickname,
        password_hash=password_hash,
        role=payload.role,
        status="active",
        must_change_password=True,
    )
    try:
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        session.add(
            AdminAuditEvent(
                actor_type="admin",
                admin_id=admin_id,
                action="user.created",
                target_type="user",
                target_id=str(user.id),
                change_summary={"role": user.role, "channel": "web"},
            )
        )
        await session.commit()
        await session.refresh(user)
    except IntegrityError as exc:
        await session.rollback()
        raise _api_error(
            409,
            ErrorCode.ACCOUNT_IDENTIFIER_UNAVAILABLE,
            ErrorMessage.ACCOUNT_IDENTIFIER_UNAVAILABLE,
        ) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _api_error(503, ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE) from exc
    return _user_data(user)


async def update_user(
    session: AsyncSession,
    *,
    admin_id: UUID,
    user_id: UUID,
    payload: AdminUserUpdateRequest,
) -> AdminUserData:
    user = await _get_user(session, user_id)
    fields = payload.model_fields_set
    if user.id == admin_id and ({"role", "status"} & fields):
        requested_demotion = payload.role is not None and payload.role != "admin"
        requested_disable = payload.status is not None and payload.status != "active"
        if requested_demotion or requested_disable:
            raise _api_error(409, ErrorCode.CONFLICT, ErrorMessage.CONFLICT, reason="cannot_modify_self_access")
    changes: dict[str, object] = {}
    try:
        if "username" in fields and payload.username is not None:
            changes["username_changed"] = user.username != validate_username(payload.username)
            user.username = validate_username(payload.username)
        if "email" in fields:
            new_email = validate_account_email(payload.email) if payload.email else None
            changes["email_changed"] = user.email != new_email
            user.email = new_email
            user.email_verified_at = None
        if "nickname" in fields and payload.nickname is not None:
            user.nickname = validate_nickname(payload.nickname)
            changes["nickname_changed"] = True
        if "role" in fields and payload.role is not None:
            changes["role"] = {"from": user.role, "to": payload.role}
            user.role = payload.role
        if "status" in fields and payload.status is not None:
            changes["status"] = {"from": user.status, "to": payload.status}
            user.status = payload.status
    except IdentityValidationError as exc:
        raise _validation_error(exc) from exc
    try:
        session.add(user)
        if payload.status == "disabled":
            now = datetime.now(UTC)
            await session.exec(
                update(UserSession)
                .where(col(UserSession.user_id) == user.id, col(UserSession.revoked_at).is_(None))
                .values(revoked_at=now, revoke_reason="account_disabled", updated_at=now)
            )
        session.add(
            AdminAuditEvent(
                actor_type="admin",
                admin_id=admin_id,
                action="user.updated",
                target_type="user",
                target_id=str(user.id),
                change_summary={"fields": changes, "channel": "web"},
            )
        )
        await session.commit()
        await session.refresh(user)
    except IntegrityError as exc:
        await session.rollback()
        raise _api_error(
            409,
            ErrorCode.ACCOUNT_IDENTIFIER_UNAVAILABLE,
            ErrorMessage.ACCOUNT_IDENTIFIER_UNAVAILABLE,
        ) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _api_error(503, ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE) from exc
    return _user_data(user)


async def disable_user(session: AsyncSession, *, admin_id: UUID, user_id: UUID) -> AdminUserData:
    return await update_user(
        session,
        admin_id=admin_id,
        user_id=user_id,
        payload=AdminUserUpdateRequest(status="disabled"),
    )


async def list_login_audits(
    session: AsyncSession,
    *,
    offset: int,
    limit: int,
    query: str | None,
) -> LoginAuditListData:
    filters = []
    if query and query.strip():
        pattern = f"%{query.strip()}%"
        filters.append(or_(col(User.username).ilike(pattern), col(User.nickname).ilike(pattern)))
    try:
        base = select(UserSession, User).join(User, col(User.id) == col(UserSession.user_id)).where(*filters)
        total = (
            await session.exec(
                select(func.count())
                .select_from(UserSession)
                .join(User, col(User.id) == col(UserSession.user_id))
                .where(*filters)
            )
        ).one()
        rows = (await session.exec(base.order_by(col(UserSession.created_at).desc()).offset(offset).limit(limit))).all()
    except SQLAlchemyError as exc:
        raise _api_error(503, ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE) from exc
    items = [
        LoginAuditData(
            id=login.id,
            user_id=user.id,
            username=user.username,
            nickname=user.nickname,
            created_ip=login.created_ip,
            last_ip=login.last_ip,
            user_agent=login.user_agent,
            created_at=_required_time(login.created_at),
            last_used_at=login.last_used_at,
            expires_at=login.expires_at,
            revoked_at=login.revoked_at,
            revoke_reason=login.revoke_reason,
        )
        for login, user in rows
    ]
    return LoginAuditListData(items=items, total=total, offset=offset, limit=limit)


async def list_operation_audits(
    session: AsyncSession,
    *,
    offset: int,
    limit: int,
    action: str | None,
) -> OperationAuditListData:
    filters = [col(AdminAuditEvent.action).ilike(f"%{action.strip()}%")] if action and action.strip() else []
    admin = User
    try:
        total = (await session.exec(select(func.count()).select_from(AdminAuditEvent).where(*filters))).one()
        rows = (
            await session.exec(
                select(AdminAuditEvent, admin.username)
                .outerjoin(admin, col(admin.id) == col(AdminAuditEvent.admin_id))
                .where(*filters)
                .order_by(col(AdminAuditEvent.created_at).desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    except SQLAlchemyError as exc:
        raise _api_error(503, ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE) from exc
    items = [
        OperationAuditData(
            id=event.id,
            actor_type=event.actor_type,
            admin_id=event.admin_id,
            admin_username=username,
            action=event.action,
            target_type=event.target_type,
            target_id=event.target_id,
            change_summary=event.change_summary,
            created_at=_required_time(event.created_at),
        )
        for event, username in rows
    ]
    return OperationAuditListData(items=items, total=total, offset=offset, limit=limit)


async def _get_user(session: AsyncSession, user_id: UUID) -> User:
    try:
        user = await session.get(User, user_id)
    except SQLAlchemyError as exc:
        raise _api_error(503, ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE) from exc
    if user is None:
        raise _api_error(404, ErrorCode.NOT_FOUND, ErrorMessage.NOT_FOUND)
    return user


def _required_time(value: datetime | None) -> datetime:
    if value is None:
        raise _api_error(500, ErrorCode.INTERNAL_ERROR, ErrorMessage.INTERNAL_ERROR)
    return value


def _mask_email(value: str | None) -> str | None:
    if not value:
        return None
    local, domain = value.split("@", 1)
    return f"{local[:1]}***@{domain}"


def _mask_phone(value: str | None) -> str | None:
    if not value:
        return None
    return f"{value[:3]}****{value[-4:]}"
