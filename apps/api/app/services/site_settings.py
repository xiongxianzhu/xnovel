"""站点品牌设置与管理员审计。"""

from sqlalchemy.exc import SQLAlchemyError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.core.security import AuthContext
from app.models.site import AdminAuditEvent, SiteSetting
from app.schemas.media import PublicSiteSettingsData


async def update_site_name(session: AsyncSession, *, context: AuthContext, site_name: str) -> PublicSiteSettingsData:
    try:
        setting = await session.get(SiteSetting, 1)
        if setting is None:
            raise APIException(
                status_code=503, code=ErrorCode.SERVICE_UNAVAILABLE, msg=ErrorMessage.SERVICE_UNAVAILABLE
            )
        if setting.site_name != site_name:
            setting.site_name = site_name
            setting.updated_by = context.user.id
            session.add(setting)
            session.add(AdminAuditEvent(
                actor_type="admin",
                admin_id=context.user.id,
                action="site.name_changed",
                target_type="site_settings",
                target_id="1",
                change_summary={"site_name_changed": True},
            ))
            await session.commit()
            await session.refresh(setting)
        return PublicSiteSettingsData(
            site_name=setting.site_name,
            registration_enabled=setting.registration_enabled,
            logo_url=f"/api/v1/media/{setting.logo_storage_key}" if setting.logo_storage_key else None,
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        raise APIException(
            status_code=503, code=ErrorCode.SERVICE_UNAVAILABLE, msg=ErrorMessage.SERVICE_UNAVAILABLE
        ) from exc
