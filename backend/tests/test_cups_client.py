"""Tests fuer die CUPS-Druckuebermittlung.

``pycups`` ist in der Testumgebung nicht installiert (siehe ADR-008) — jede
Interaktion mit der C-Erweiterung wird deshalb ueber ``_connect`` gemockt.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.core.config import Settings
from app.core.errors import AppError
from app.models.printer import Printer
from app.services.printing.cups_client import (
    discover_queues,
    get_job_status,
    submit_print_job,
    validate_queue_name,
)


def _printer(**overrides: object) -> Printer:
    defaults: dict[str, object] = {
        "id": 1,
        "name": "Testdrucker",
        "queue_name": "M110S",
    }
    defaults.update(overrides)
    return Printer(**defaults)  # type: ignore[arg-type]


@pytest.mark.parametrize("name", ["M110S", "queue-1", "queue_1", "A" * 127])
def test_gueltige_warteschlangennamen_werden_akzeptiert(name: str) -> None:
    assert validate_queue_name(name) == name


@pytest.mark.parametrize(
    "name", ["", "mit leerzeichen", "../etc/passwd", "queue;rm -rf", "A" * 128, "ümlaut"]
)
def test_ungueltige_warteschlangennamen_werden_abgelehnt(name: str) -> None:
    with pytest.raises(AppError):
        validate_queue_name(name)


@pytest.mark.asyncio
async def test_submit_print_job_schreibt_datei_und_ruft_printfile(
    settings: Settings, tmp_path: object
) -> None:
    connection = MagicMock()
    connection.printFile.return_value = 42

    with patch("app.services.printing.cups_client._connect", return_value=connection):
        result = await submit_print_job(
            printer=_printer(),
            settings=settings,
            pdf_bytes=b"%PDF-1.4 test",
            title="Testetikett",
            copies=2,
        )

    assert result.cups_job_id == 42
    connection.printFile.assert_called_once()
    args = connection.printFile.call_args
    assert args.args[0] == "M110S"
    assert args.args[3] == {"copies": "2"}


@pytest.mark.asyncio
async def test_submit_print_job_uebersetzt_cups_fehler(settings: Settings) -> None:
    connection = MagicMock()
    connection.printFile.side_effect = RuntimeError("IPP-Fehler")

    with (
        patch("app.services.printing.cups_client._connect", return_value=connection),
        pytest.raises(AppError),
    ):
        await submit_print_job(
            printer=_printer(), settings=settings, pdf_bytes=b"%PDF", title="x", copies=1
        )


@pytest.mark.asyncio
async def test_get_job_status_bildet_ipp_zustaende_ab(settings: Settings) -> None:
    connection = MagicMock()
    connection.getJobAttributes.return_value = {
        "job-state": 9,
        "job-state-reasons": ["job-completed-successfully"],
    }

    with patch("app.services.printing.cups_client._connect", return_value=connection):
        status = await get_job_status(printer=_printer(), settings=settings, cups_job_id=42)

    assert status.status.value == "completed"
    assert status.state_reasons == "job-completed-successfully"


@pytest.mark.asyncio
async def test_get_job_status_liefert_unbekannt_bei_verbindungsfehler(settings: Settings) -> None:
    connection = MagicMock()
    connection.getJobAttributes.side_effect = RuntimeError("kein Server")

    with patch("app.services.printing.cups_client._connect", return_value=connection):
        status = await get_job_status(printer=_printer(), settings=settings, cups_job_id=1)

    assert status.status.value == "unknown"


@pytest.mark.asyncio
async def test_discover_queues_liefert_gefundene_warteschlangen(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    connection = MagicMock()
    connection.getPrinters.return_value = {
        "M110S": {"printer-make-and-model": "Phomemo M110S", "printer-location": "Werkstatt"},
        "mit leerzeichen": {},
    }
    fake_cups = MagicMock()
    fake_cups.Connection.return_value = connection
    monkeypatch.setattr("app.services.printing.cups_client.CUPS_AVAILABLE", True)
    monkeypatch.setattr("app.services.printing.cups_client.cups", fake_cups)

    queues = await discover_queues(settings=settings)

    by_name = {queue.queue_name: queue for queue in queues}
    assert by_name["M110S"].supported is True
    assert by_name["M110S"].model == "Phomemo M110S"
    assert by_name["M110S"].location == "Werkstatt"
    assert by_name["mit leerzeichen"].supported is False


@pytest.mark.asyncio
async def test_discover_queues_ohne_cups_liefert_leere_liste(settings: Settings) -> None:
    assert await discover_queues(settings=settings) == []
