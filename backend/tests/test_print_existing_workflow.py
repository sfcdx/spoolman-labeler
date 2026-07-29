"""Tests fuer den Direktdruck-Workflow einer bereits vorhandenen Spule.

Anders als create_and_print wird hier nie etwas in Spoolman angelegt oder
veraendert — nur gelesen und gedruckt.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.models.enums import PrintJobStatus
from app.models.print_job import PrintJob
from app.schemas.printer import PrinterCreate, PrinterUpdate
from app.schemas.template import TemplateCreate
from app.services import printers as printers_service
from app.services import templates as templates_service
from app.services.printing.cups_client import SubmittedJob
from app.services.spoolman import SpoolmanRecord
from app.services.workflows import PrintExistingRequest, PrintExistingService


async def _printer_and_template(session: AsyncSession) -> tuple[int, int]:
    printer = await printers_service.create_printer(
        session, PrinterCreate(name="Testdrucker", queue_name="TESTQ")
    )
    template = await templates_service.create_template(
        session,
        TemplateCreate(
            name="Testvorlage", html_content="<p>{{ spool.id }}</p>", width_mm=62, height_mm=29
        ),
    )
    await session.flush()
    return printer.id, template.id


async def test_druckt_vorhandene_spule_ohne_sie_anzulegen(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.get_spool.return_value = SpoolmanRecord(id=77, filament={"material": "PLA"})
    request = PrintExistingRequest(spool_id=77, template_id=template_id, printer_id=printer_id)

    with patch(
        "app.services.workflows.print_existing.submit_print_job",
        new=AsyncMock(return_value=SubmittedJob(cups_job_id=9, rendered_file_path="/x.pdf")),
    ):
        job = await PrintExistingService(session, client, settings).run(request)

    assert job.status is PrintJobStatus.SUBMITTED
    assert job.spoolman_spool_id == 77
    client.create_spool.assert_not_called()
    client.create_filament.assert_not_called()


async def test_verwendet_standarddrucker_und_standardvorlage_ohne_angabe(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, _template_id = await _printer_and_template(session)
    await printers_service.update_printer(session, printer_id, PrinterUpdate(is_default=True))
    client = AsyncMock()
    client.get_spool.return_value = SpoolmanRecord(
        id=88, filament={"material": "PLA", "color_hex": "1E88E5"}
    )
    request = PrintExistingRequest(spool_id=88)

    with patch(
        "app.services.workflows.print_existing.submit_print_job",
        new=AsyncMock(return_value=SubmittedJob(cups_job_id=10, rendered_file_path="/y.pdf")),
    ):
        job = await PrintExistingService(session, client, settings).run(request)

    assert job.status is PrintJobStatus.SUBMITTED
    assert job.printer_id == printer_id


async def test_unbekannte_spule_erzeugt_keinen_druckauftrag(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.get_spool.side_effect = AppError(ErrorCode.SPOOL_FETCH_FAILED)
    request = PrintExistingRequest(spool_id=999, template_id=template_id, printer_id=printer_id)

    try:
        await PrintExistingService(session, client, settings).run(request)
    except AppError as error:
        assert error.code is ErrorCode.SPOOL_FETCH_FAILED
    else:
        raise AssertionError("Es haette ein AppError ausgeloest werden muessen")

    await session.commit()
    jobs = list(await session.scalars(select(PrintJob)))
    assert jobs == []


async def test_druckfehler_markiert_den_auftrag_als_fehlgeschlagen(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.get_spool.return_value = SpoolmanRecord(id=55, filament={})
    request = PrintExistingRequest(spool_id=55, template_id=template_id, printer_id=printer_id)

    with patch(
        "app.services.workflows.print_existing.submit_print_job",
        new=AsyncMock(side_effect=AppError(ErrorCode.CUPS_UNREACHABLE)),
    ):
        job = await PrintExistingService(session, client, settings).run(request)

    assert job.status is PrintJobStatus.FAILED
    assert job.error_code == ErrorCode.CUPS_UNREACHABLE.value
