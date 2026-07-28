"""Erreichbarkeitspruefung des CUPS-Servers.

``pycups`` ist eine C-Erweiterung, die im Container aus dem Distributionspaket
``python3-cups`` stammt (siehe ADR-008). Der Import erfolgt bewusst defensiv,
damit Tests und die lokale Entwicklung ohne installiertes CUPS funktionieren.
"""

from __future__ import annotations

import os
from typing import Any

import anyio

from app.core.config import Settings
from app.core.logging import get_logger
from app.schemas.health import ComponentStatus

logger = get_logger(__name__)

try:  # pragma: no cover - haengt von der Umgebung ab
    import cups

    CUPS_AVAILABLE = True
except ImportError:  # pragma: no cover
    cups = None
    CUPS_AVAILABLE = False


def _connect_and_list(settings: Settings) -> dict[str, Any]:
    """Baut eine CUPS-Verbindung auf und liest die Queues.

    Laeuft blockierend und gehoert deshalb in einen Worker-Thread.

    Der Server wird ueber die Umgebungsvariable ``CUPS_SERVER`` gewaehlt, die
    ``libcups`` noch vor ``client.conf`` auswertet. Das ist der einzige
    zuverlaessige Weg, einen entfernten Server anzusprechen.
    """
    if cups is None:  # pragma: no cover
        msg = "pycups ist nicht verfügbar"
        raise RuntimeError(msg)

    os.environ["CUPS_SERVER"] = settings.cups_server
    os.environ["IPP_PORT"] = str(settings.cups_port)

    if settings.cups_username:
        cups.setUser(settings.cups_username)

    connection = cups.Connection()
    printers: dict[str, Any] = connection.getPrinters()
    return printers


async def probe_cups(settings: Settings) -> tuple[ComponentStatus, str | None]:
    """Prueft, ob CUPS erreichbar ist und Queues meldet.

    Ein nicht erreichbarer Drucker darf den Container nicht ungesund machen.
    Deshalb wird hier zwischen „nicht konfiguriert", „gestoert" und „in
    Ordnung" unterschieden, statt einfach einen Fehler zu werfen.
    """
    if not CUPS_AVAILABLE:
        return ComponentStatus.DISABLED, "CUPS-Anbindung ist in dieser Umgebung nicht installiert"

    if not settings.cups_server:
        return ComponentStatus.DISABLED, "Kein CUPS-Server konfiguriert"

    try:
        with anyio.fail_after(settings.cups_timeout_seconds):
            printers = await anyio.to_thread.run_sync(_connect_and_list, settings)
    except TimeoutError:
        return ComponentStatus.ERROR, "Zeitüberschreitung bei der Verbindung zum Drucksystem"
    except Exception as exc:
        # Die Ausnahme kann den Hostnamen enthalten, aber keine Zugangsdaten.
        logger.warning("cups_probe_failed", extra={"error": type(exc).__name__})
        return ComponentStatus.ERROR, "Das Drucksystem ist nicht erreichbar"

    if not printers:
        return ComponentStatus.DEGRADED, "Verbindung steht, es ist aber kein Drucker eingerichtet"

    return ComponentStatus.OK, None
