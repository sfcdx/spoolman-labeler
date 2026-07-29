"""Gemeinsame FastAPI-Abhaengigkeiten."""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.services import settings as settings_service


async def get_effective_settings(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Settings:
    """Liefert die Konfiguration mit in der Datenbank hinterlegten Overrides.

    Betrifft ausschliesslich Werte, die in den Einstellungen gesetzt werden
    koennen (Spoolman-Link, CUPS-Server/-Port) — siehe
    ``app.services.settings.OVERRIDABLE_KEYS``.
    """
    overrides = await settings_service.get_overrides(session)
    return settings.model_copy(update=overrides) if overrides else settings
