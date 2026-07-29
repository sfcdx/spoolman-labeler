"""Tests der Druckhistorie und des erneuten Drucks."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.models.enums import PrintJobStatus
from app.models.print_job import PrintJob
from app.schemas.printer import PrinterCreate
from app.schemas.template import TemplateCreate
from app.services import print_jobs as print_jobs_service
from app.services import printers as printers_service
from app.services import templates as templates_service
from app.services.printing.cups_client import SubmittedJob
from app.services.spoolman import SpoolmanRecord


async def _failed_job(session: AsyncSession) -> PrintJob:
    printer = await printers_service.create_printer(
        session, PrinterCreate(name="Drucker", queue_name="Q1")
    )
    template = await templates_service.create_template(
        session,
        TemplateCreate(
            name="Vorlage", html_content="<p>{{ spool.id }}</p>", width_mm=62, height_mm=29
        ),
    )
    job = PrintJob(
        spoolman_spool_id=42,
        printer_id=printer.id,
        template_id=template.id,
        status=PrintJobStatus.FAILED,
        copies=1,
        error_code=ErrorCode.CUPS_UNREACHABLE.value,
        error_message="Das Drucksystem ist nicht erreichbar.",
        attempt_count=1,
    )
    session.add(job)
    await session.flush()
    return job


@pytest.mark.asyncio
async def test_erneuter_druck_setzt_fehler_zurueck_bei_erfolg(
    session: AsyncSession, settings: Settings
) -> None:
    job = await _failed_job(session)
    client = AsyncMock()
    client.get_spool.return_value = SpoolmanRecord(id=42, filament={})

    with patch(
        "app.services.print_jobs.submit_print_job",
        new=AsyncMock(return_value=SubmittedJob(cups_job_id=9, rendered_file_path="/data/r.pdf")),
    ):
        result = await print_jobs_service.retry_print_job(session, client, settings, job.id)

    assert result.status is PrintJobStatus.SUBMITTED
    assert result.error_code is None
    assert result.attempt_count == 2
    client.get_spool.assert_awaited_once_with(42)


@pytest.mark.asyncio
async def test_erneuter_druck_bleibt_fehlgeschlagen_bei_erneutem_fehler(
    session: AsyncSession, settings: Settings
) -> None:
    job = await _failed_job(session)
    client = AsyncMock()
    client.get_spool.return_value = SpoolmanRecord(id=42, filament={})

    with patch(
        "app.services.print_jobs.submit_print_job",
        new=AsyncMock(side_effect=AppError(ErrorCode.PRINT_SUBMISSION_FAILED)),
    ):
        result = await print_jobs_service.retry_print_job(session, client, settings, job.id)

    assert result.status is PrintJobStatus.FAILED
    assert result.error_code == ErrorCode.PRINT_SUBMISSION_FAILED.value
    assert result.attempt_count == 2


@pytest.mark.asyncio
async def test_abgeschlossener_auftrag_kann_nicht_erneut_gedruckt_werden(
    session: AsyncSession, settings: Settings
) -> None:
    job = await _failed_job(session)
    job.status = PrintJobStatus.COMPLETED
    await session.flush()
    client = AsyncMock()

    with pytest.raises(AppError) as excinfo:
        await print_jobs_service.retry_print_job(session, client, settings, job.id)

    assert excinfo.value.code is ErrorCode.PRINT_JOB_NOT_RETRYABLE
    client.get_spool.assert_not_called()


@pytest.mark.asyncio
async def test_liste_filtert_nach_status(session: AsyncSession) -> None:
    await _failed_job(session)
    await session.flush()

    alle = await print_jobs_service.list_print_jobs(session)
    nur_fehlgeschlagen = await print_jobs_service.list_print_jobs(
        session, status=PrintJobStatus.FAILED
    )
    nur_abgeschlossen = await print_jobs_service.list_print_jobs(
        session, status=PrintJobStatus.COMPLETED
    )

    assert len(alle) == 1
    assert len(nur_fehlgeschlagen) == 1
    assert nur_abgeschlossen == []
