"""Endpunkte fuer ueberschreibbare Laufzeit-Einstellungen."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.schemas.settings import AppSettingsRead, AppSettingsUpdate
from app.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])

SettingKey = Literal["spoolman_public_url", "cups_server", "cups_port"]


async def _read(session: AsyncSession, settings: Settings) -> AppSettingsRead:
    overrides = await settings_service.get_overrides(session)
    return AppSettingsRead(
        spoolman_public_url=overrides.get("spoolman_public_url", settings.spoolman_public_url),
        spoolman_public_url_overridden="spoolman_public_url" in overrides,
        cups_server=overrides.get("cups_server", settings.cups_server),
        cups_server_overridden="cups_server" in overrides,
        cups_port=overrides.get("cups_port", settings.cups_port),
        cups_port_overridden="cups_port" in overrides,
    )


@router.get("", response_model=AppSettingsRead)
async def read_settings(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AppSettingsRead:
    return await _read(session, settings)


@router.put("", response_model=AppSettingsRead)
async def update_settings(
    data: AppSettingsUpdate,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AppSettingsRead:
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        await settings_service.set_override(session, key, value)
    return await _read(session, settings)


@router.delete("/{key}", response_model=AppSettingsRead)
async def clear_setting(
    key: SettingKey,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AppSettingsRead:
    await settings_service.clear_override(session, key)
    return await _read(session, settings)
