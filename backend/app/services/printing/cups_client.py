"""Uebermittlung und Statusabfrage von Druckauftraegen ueber CUPS.

Ergaenzt :mod:`cups_probe` (reine Erreichbarkeitspruefung) um die eigentliche
Druckfunktion. ``pycups`` ist blockierend und laeuft deshalb ausschliesslich
in einem Worker-Thread (``anyio.to_thread.run_sync``), niemals direkt im
Event-Loop.
"""

from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import anyio

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.models.enums import PrintJobStatus
from app.models.printer import Printer
from app.schemas.health import ComponentStatus

logger = get_logger(__name__)

try:  # pragma: no cover - haengt von der Umgebung ab
    import cups

    CUPS_AVAILABLE = True
except ImportError:  # pragma: no cover
    cups = None
    CUPS_AVAILABLE = False

#: CUPS-Warteschlangennamen bestehen laut RFC 2911 / cupsd aus ASCII-Zeichen
#: ohne Leerzeichen oder Schraegstriche. Diese Einschraenkung stellt sicher,
#: dass ein Queue-Name niemals als IPP- oder Pfad-Metazeichen wirken kann,
#: unabhaengig davon, was bereits bei der Eingabe validiert wurde.
_QUEUE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,127}$")

#: IPP-Job-Zustaende (RFC 8011 Abschnitt 5.3.7).
_IPP_STATE_MAP: dict[int, PrintJobStatus] = {
    3: PrintJobStatus.SUBMITTED,  # pending
    4: PrintJobStatus.SUBMITTED,  # pending-held
    5: PrintJobStatus.PROCESSING,
    6: PrintJobStatus.PROCESSING,  # processing-stopped
    7: PrintJobStatus.CANCELLED,
    8: PrintJobStatus.FAILED,  # aborted
    9: PrintJobStatus.COMPLETED,
}


def validate_queue_name(name: str) -> str:
    """Stellt sicher, dass ``name`` ausschliesslich unbedenkliche Zeichen enthaelt.

    Wird sowohl beim Anlegen eines Druckers als auch unmittelbar vor jeder
    CUPS-Operation aufgerufen (Verteidigung in der Tiefe).
    """
    if not _QUEUE_NAME_RE.fullmatch(name):
        raise AppError(
            ErrorCode.VALIDATION_FAILED,
            detail="Warteschlangenname enthält unzulässige Zeichen",
        )
    return name


@dataclass(frozen=True)
class SubmittedJob:
    cups_job_id: int
    rendered_file_path: str


@dataclass(frozen=True)
class JobStatus:
    status: PrintJobStatus
    state_reasons: str | None
    detail: str | None


def _connect(printer: Printer, settings: Settings) -> Any:
    if not CUPS_AVAILABLE or cups is None:
        raise AppError(ErrorCode.CUPS_UNREACHABLE, detail="pycups ist nicht verfügbar")

    # libcups wertet CUPS_SERVER/IPP_PORT vor client.conf aus — das ist der
    # einzige zuverlaessige Weg, denselben Prozess gegen unterschiedlich
    # konfigurierte Drucker sprechen zu lassen (siehe auch cups_probe.py).
    # Bekannte Einschraenkung: Diese Umgebungsvariablen sind prozessweit
    # gueltig. Senden zwei Anfragen mit unterschiedlichem ``cups_server``
    # echt gleichzeitig einen Auftrag ab, kann der spaetere Wert kurzzeitig
    # den frueheren ueberschreiben, bevor ``cups.Connection()`` ihn liest.
    # Bei der Standardkonfiguration (ein CUPS-Server fuer alle Drucker) tritt
    # dieser Fall nicht auf; dokumentiert als bekanntes, geringes Risiko
    # analog zur Idempotenz-Race in CreateOnlyService.
    os.environ["CUPS_SERVER"] = printer.cups_server or settings.cups_server
    os.environ["IPP_PORT"] = str(printer.cups_port or settings.cups_port)
    if settings.cups_username:
        cups.setUser(settings.cups_username)

    try:
        return cups.Connection()
    except Exception as exc:
        logger.warning("cups_connect_failed", extra={"error": type(exc).__name__})
        raise AppError(ErrorCode.CUPS_UNREACHABLE) from exc


def _print_file(
    printer: Printer, settings: Settings, file_path: Path, title: str, copies: int
) -> int:
    connection = _connect(printer, settings)
    queue = validate_queue_name(printer.queue_name)
    options = {"copies": str(copies)}
    try:
        job_id = connection.printFile(queue, str(file_path), title, options)
    except Exception as exc:
        logger.warning(
            "cups_print_failed",
            extra={"printer_id": printer.id, "error": type(exc).__name__},
        )
        raise AppError(ErrorCode.PRINT_SUBMISSION_FAILED) from exc
    return int(job_id)


async def submit_print_job(
    *,
    printer: Printer,
    settings: Settings,
    pdf_bytes: bytes,
    title: str,
    copies: int = 1,
) -> SubmittedJob:
    """Schreibt das PDF nach ``rendered_dir`` und uebergibt es an CUPS.

    Die Datei bleibt nach dem Druck bestehen, damit ein Auftrag ohne erneutes
    Rendern wiederholt werden kann (siehe ``payload_hash`` auf ``PrintJob``).
    """
    if copies < 1:
        raise AppError(ErrorCode.VALIDATION_FAILED, detail="Anzahl Kopien muss mindestens 1 sein")

    settings.rendered_dir.mkdir(parents=True, exist_ok=True)
    file_path = settings.rendered_dir / f"{uuid.uuid4().hex}.pdf"
    await anyio.Path(file_path).write_bytes(pdf_bytes)

    try:
        with anyio.fail_after(settings.cups_timeout_seconds):
            job_id = await anyio.to_thread.run_sync(
                _print_file, printer, settings, file_path, title, copies
            )
    except TimeoutError as exc:
        raise AppError(
            ErrorCode.PRINT_SUBMISSION_FAILED, detail="Zeitüberschreitung beim Drucken"
        ) from exc

    return SubmittedJob(cups_job_id=job_id, rendered_file_path=str(file_path))


def _probe_queue(printer: Printer, settings: Settings) -> tuple[ComponentStatus, str | None]:
    connection = _connect(printer, settings)
    queue = validate_queue_name(printer.queue_name)
    try:
        attrs = connection.getPrinterAttributes(queue)
    except Exception as exc:
        logger.warning(
            "cups_test_queue_failed",
            extra={"printer_id": printer.id, "error": type(exc).__name__},
        )
        return ComponentStatus.ERROR, "Die Warteschlange wurde nicht gefunden"
    ipp_state_stopped = 5  # RFC 8011 Abschnitt 5.4.15
    if attrs.get("printer-state") == ipp_state_stopped:
        return ComponentStatus.DEGRADED, "Warteschlange ist angehalten"
    return ComponentStatus.OK, None


async def probe_printer(
    *, printer: Printer, settings: Settings
) -> tuple[ComponentStatus, str | None]:
    """Prueft gezielt einen einzelnen konfigurierten Drucker (Testverbindung)."""
    if not CUPS_AVAILABLE:
        return ComponentStatus.DISABLED, "CUPS-Anbindung ist in dieser Umgebung nicht installiert"
    try:
        with anyio.fail_after(settings.cups_timeout_seconds):
            return await anyio.to_thread.run_sync(_probe_queue, printer, settings)
    except TimeoutError:
        return ComponentStatus.ERROR, "Zeitüberschreitung bei der Verbindung zum Drucksystem"


def _job_attributes(printer: Printer, settings: Settings, cups_job_id: int) -> dict[str, object]:
    connection = _connect(printer, settings)
    try:
        attrs: dict[str, object] = connection.getJobAttributes(cups_job_id)
    except Exception as exc:
        logger.warning(
            "cups_job_status_failed",
            extra={"cups_job_id": cups_job_id, "error": type(exc).__name__},
        )
        raise AppError(ErrorCode.PRINT_STATUS_UNKNOWN) from exc
    return attrs


async def get_job_status(*, printer: Printer, settings: Settings, cups_job_id: int) -> JobStatus:
    """Fragt den aktuellen IPP-Jobstatus ab.

    ``completed`` bedeutet nur, dass CUPS den Auftrag als abgeschlossen
    fuehrt — nicht, dass das Etikett nachweislich physisch gedruckt wurde
    (siehe ADR-013, PrintJobStatus-Dokumentation).
    """
    try:
        with anyio.fail_after(settings.cups_timeout_seconds):
            attrs = await anyio.to_thread.run_sync(_job_attributes, printer, settings, cups_job_id)
    except TimeoutError:
        return JobStatus(
            status=PrintJobStatus.UNKNOWN,
            state_reasons=None,
            detail="Zeitüberschreitung bei der Statusabfrage",
        )
    except AppError:
        return JobStatus(
            status=PrintJobStatus.UNKNOWN, state_reasons=None, detail="Status nicht abrufbar"
        )

    raw_state = attrs.get("job-state")
    state = (
        _IPP_STATE_MAP.get(raw_state, PrintJobStatus.UNKNOWN)
        if isinstance(raw_state, int)
        else PrintJobStatus.UNKNOWN
    )
    reasons = attrs.get("job-state-reasons")
    reasons_str = (
        ", ".join(str(reason) for reason in reasons) if isinstance(reasons, list) else None
    )
    return JobStatus(status=state, state_reasons=reasons_str, detail=None)
