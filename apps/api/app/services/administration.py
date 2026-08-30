"""首个管理员与全局注册开关领域服务。"""

from __future__ import annotations

import asyncio

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.account import User, UserPreference
from app.models.site import AdminAuditEvent, SiteSetting
from app.services.identity import (
    IdentityValidationError,
    hash_bootstrap_password,
    hash_strong_password,
    validate_account_email,
    validate_nickname,
    validate_username,
    verify_password,
)


class AdministrationError(Exception):
    """CLI 可安全展示的领域错误。"""

    def __init__(self, exit_code: int, message: str) -> None:
        super().__init__(message)
        self.exit_code = exit_code
        self.message = message


async def create_first_admin(
    session: AsyncSession,
    *,
    username_input: str,
    email_input: str | None = None,
    nickname_input: str,
    password_input: str = "123456",
    bootstrap: bool = False,
) -> User:
    try:
        username = validate_username(username_input)
        email = validate_account_email(email_input) if email_input else None
        nickname = validate_nickname(nickname_input)
        password_digest = (
            await asyncio.to_thread(hash_bootstrap_password, password_input)
            if bootstrap
            else await asyncio.to_thread(
                hash_strong_password,
                password_input,
                username=username,
                email=email,
            )
        )
    except IdentityValidationError as exc:
        raise AdministrationError(2, f"{exc.field}: {exc.reason}") from exc

    try:
        async with session.begin():
            setting_statement = select(SiteSetting).where(col(SiteSetting.id) == 1).with_for_update()
            setting = (await session.exec(setting_statement)).one_or_none()
            if setting is None:
                raise AdministrationError(5, "site settings are not initialized")

            admin_statement = select(User.id).where(col(User.role) == "admin").limit(1)
            if (await session.exec(admin_statement)).first() is not None:
                raise AdministrationError(4, "an administrator already exists")

            admin = User(
                username=username,
                email=email,
                password_hash=password_digest,
                nickname=nickname,
                must_change_password=True,
                role="admin",
                status="active",
            )
            session.add(admin)
            await session.flush()
            session.add(UserPreference(user_id=admin.id))
            session.add(
                AdminAuditEvent(
                    actor_type="system",
                    admin_id=None,
                    action="admin.bootstrap_created",
                    target_type="user",
                    target_id=str(admin.id),
                    change_summary={"channel": "cli"},
                )
            )
        return admin
    except AdministrationError:
        raise
    except IntegrityError as exc:
        await session.rollback()
        raise AdministrationError(4, "an account identifier is unavailable") from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise AdministrationError(5, "database operation failed") from exc


async def set_registration_enabled(
    session: AsyncSession,
    *,
    admin_username_input: str,
    password_input: str,
    enabled: bool,
) -> bool:
    try:
        admin_username = validate_username(admin_username_input)
    except IdentityValidationError as exc:
        raise AdministrationError(2, f"{exc.field}: {exc.reason}") from exc

    try:
        async with session.begin():
            admin_statement = select(User).where(col(User.username) == admin_username).with_for_update()
            admin = (await session.exec(admin_statement)).one_or_none()
            if (
                admin is None
                or admin.role != "admin"
                or admin.status != "active"
                or not await asyncio.to_thread(verify_password, password_input, admin.password_hash)
            ):
                raise AdministrationError(3, "administrator authentication failed")

            setting_statement = select(SiteSetting).where(col(SiteSetting.id) == 1).with_for_update()
            setting = (await session.exec(setting_statement)).one_or_none()
            if setting is None:
                raise AdministrationError(5, "site settings are not initialized")
            if setting.registration_enabled == enabled:
                return False

            previous = setting.registration_enabled
            setting.registration_enabled = enabled
            setting.updated_by = admin.id
            session.add(setting)
            session.add(
                AdminAuditEvent(
                    actor_type="admin",
                    admin_id=admin.id,
                    action="site.registration_enabled_changed",
                    target_type="site_settings",
                    target_id="1",
                    change_summary={
                        "old_value": previous,
                        "new_value": enabled,
                        "channel": "cli",
                    },
                )
            )
        return True
    except AdministrationError:
        raise
    except (SQLAlchemyError, ValueError) as exc:
        await session.rollback()
        raise AdministrationError(5, "database operation failed") from exc
