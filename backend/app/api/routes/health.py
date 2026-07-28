"""Health- und Versionsendpunkte."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.db.session import check_database, get_session
from app.schemas.health import ComponentStatus, HealthResponse, VersionResponse
from app.services.printing.cups_probe import probe_cups

router = APIRouter(tags=["system"])
logger = get_logger(__name__)


async def _probe_spoolman(settings: Settings) -> tuple[ComponentStatus, str | None]:
    """Prueft, ob Spoolman antwortet.

    Es wird bewusst nur die Erreichbarkeit geprueft, nicht die inhaltliche
    Korrektheit. Ein Fehler hier macht die Kernanwendung nicht ungesund.
    """
    url = f"{settings.spoolman_api_base}/info"
    try:
        async with httpx.AsyncClient(timeout=settings.spoolman_timeout_seconds) as client:
            response = await client.get(url)
    except httpx.TimeoutException:
        return ComponentStatus.ERROR, "Zeitüberschreitung bei der Verbindung zu Spoolman"
    except httpx.HTTPError:
        return ComponentStatus.ERROR, "Spoolman ist nicht erreichbar"

    if response.status_code >= 500:
        return ComponentStatus.DEGRADED, f"Spoolman antwortet mit {response.status_code}"
    if response.status_code >= 400:
        return (
            ComponentStatus.DEGRADED,
            f"Unerwartete Antwort von Spoolman ({response.status_code})",
        )
    return ComponentStatus.OK, None


@router.get("/health", response_model=HealthResponse, summary="Systemzustand")
async def health(
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
) -> HealthResponse:
    """Liefert den Zustand der Anwendung und ihrer Abhaengigkeiten.

    Nur ein Datenbankfehler macht die Kernanwendung ungesund und fuehrt zu
    HTTP 503. Gestoerte externe Dienste werden gemeldet, ohne den Container
    als ungesund zu markieren — sonst wuerde ein ausgeschalteter Drucker
    einen Neustart ausloesen.
    """
    database_ok = await check_database(session)
    database_status = ComponentStatus.OK if database_ok else ComponentStatus.ERROR

    spoolman_status, spoolman_detail = await _probe_spoolman(settings)
    cups_status, cups_detail = await probe_cups(settings)

    core_status = ComponentStatus.OK if database_ok else ComponentStatus.ERROR
    if not database_ok:
        response.status_code = 503

    return HealthResponse(
        status=core_status,
        database=database_status,
        spoolman=spoolman_status,
        cups=cups_status,
        version=__version__,
        spoolman_detail=spoolman_detail,
        cups_detail=cups_detail,
    )


@router.get("/version", response_model=VersionResponse, summary="Version")
async def version(settings: Settings = Depends(get_settings)) -> VersionResponse:
    return VersionResponse(version=__version__, app_env=settings.app_env)
