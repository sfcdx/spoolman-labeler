"""Laufzeit-Overrides fuer ausgewaehlte Einstellungen ueber das Setting-Modell.

Nur ein bewusst kleiner Satz an Schluesseln ist ueberschreibbar: der oeffentliche
Spoolman-Link sowie CUPS-Server/-Port. Infrastrukturelle Werte (Datenbankpfad,
interne Spoolman-API-URL, Geheimnisse) bleiben ausschliesslich ueber
Umgebungsvariablen konfigurierbar (siehe app/core/config.py).
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.setting import Setting

#: Einzige ueber die API veraenderbaren Schluessel.
OVERRIDABLE_KEYS: frozenset[str] = frozenset({"spoolman_public_url", "cups_server", "cups_port"})


async def get_overrides(session: AsyncSession) -> dict[str, Any]:
    """Liest alle gesetzten Overrides aus der Datenbank."""
    result = await session.scalars(select(Setting).where(Setting.key.in_(OVERRIDABLE_KEYS)))
    return {row.key: json.loads(row.value_json) for row in result}


async def set_override(session: AsyncSession, key: str, value: Any) -> None:
    """Setzt oder aktualisiert einen einzelnen Override."""
    existing = await session.scalar(select(Setting).where(Setting.key == key))
    if existing is None:
        session.add(Setting(key=key, value_json=json.dumps(value)))
    else:
        existing.value_json = json.dumps(value)
    await session.flush()


async def clear_override(session: AsyncSession, key: str) -> None:
    """Entfernt einen Override — der Wert faellt zurueck auf die env-Vorgabe."""
    existing = await session.scalar(select(Setting).where(Setting.key == key))
    if existing is not None:
        await session.delete(existing)
        await session.flush()


async def get_effective_settings(session: AsyncSession, base: Settings) -> Settings:
    """Liefert ``base`` mit angewendeten Datenbank-Overrides."""
    overrides = await get_overrides(session)
    return base.model_copy(update=overrides) if overrides else base
