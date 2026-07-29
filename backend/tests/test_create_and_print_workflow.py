"""Tests fuer den Create-and-Print-Workflow.

Kernaussage (ADR-012 / WorkflowStatus.PARTIAL): Sobald eine Spule in Spoolman
angelegt ist, macht ein nachfolgender Druckfehler das niemals rueckgaengig.
Diese Tests sind bewusst mutationsfest formuliert — wird die Rollback-Logik
versehentlich eingebaut, muss mindestens ein Test hier fehlschlagen.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.models.enums import PrintJobStatus, WorkflowStatus
from app.schemas.printer import PrinterCreate, PrinterUpdate
from app.schemas.template import TemplateCreate
from app.services import printers as printers_service
from app.services import templates as templates_service
from app.services.printing.cups_client import SubmittedJob
from app.services.spoolman import SpoolFields, SpoolmanRecord
from app.services.workflows import CreateAndPrintRequest, CreateAndPrintService


async def _printer_and_template(session: AsyncSession) -> tuple[int, int]:
    printer = await printers_service.create_printer(
        session, PrinterCreate(name="Testdrucker", queue_name="TESTQ")
    )
    template = await templates_service.create_template(
        session,
        TemplateCreate(
            name="Testvorlage",
            html_content="<p>{{ spool.id }}</p>",
            width_mm=62,
            height_mm=29,
        ),
    )
    await session.flush()
    return printer.id, template.id


@pytest.mark.asyncio
async def test_erfolgreicher_lauf_legt_an_und_druckt(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.create_spool.side_effect = [
        SpoolmanRecord(id=101, filament={"material": "PLA"}),
        SpoolmanRecord(id=102, filament={"material": "PLA"}),
    ]
    request = CreateAndPrintRequest(
        idempotency_key="cap-0001",
        filament_id=4,
        spool=SpoolFields(),
        quantity=2,
        template_id=template_id,
        printer_id=printer_id,
    )

    with patch(
        "app.services.workflows.create_and_print.submit_print_job",
        new=AsyncMock(return_value=SubmittedJob(cups_job_id=1, rendered_file_path="/data/x.pdf")),
    ) as submit_mock:
        run = await CreateAndPrintService(session, client, settings).run(request)

    assert run.status is WorkflowStatus.COMPLETED
    assert run.created_spool_ids_json == "[101, 102]"
    assert submit_mock.await_count == 2


@pytest.mark.asyncio
async def test_druckfehler_macht_bereits_angelegte_spulen_nicht_rueckgaengig(
    session: AsyncSession, settings: Settings
) -> None:
    """Kernszenario: Spule 101 wird angelegt, der Druck schlaegt fehl.

    Der Lauf muss trotzdem PARTIAL sein — created_spool_ids_json muss die
    Spule weiterhin enthalten, nicht leer sein.
    """
    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.create_spool.side_effect = [SpoolmanRecord(id=101, filament={"material": "PLA"})]
    request = CreateAndPrintRequest(
        idempotency_key="cap-0002",
        filament_id=4,
        spool=SpoolFields(),
        quantity=1,
        template_id=template_id,
        printer_id=printer_id,
    )

    with patch(
        "app.services.workflows.create_and_print.submit_print_job",
        new=AsyncMock(side_effect=AppError(ErrorCode.PRINT_SUBMISSION_FAILED)),
    ):
        run = await CreateAndPrintService(session, client, settings).run(request)

    assert run.status is WorkflowStatus.PARTIAL
    assert run.created_spool_ids_json == "[101]", "Die angelegte Spule darf nicht verschwinden"


@pytest.mark.asyncio
async def test_ein_fehlgeschlagener_druck_stoppt_nicht_die_uebrigen_spulen(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.create_spool.side_effect = [
        SpoolmanRecord(id=201, filament={}),
        SpoolmanRecord(id=202, filament={}),
    ]
    request = CreateAndPrintRequest(
        idempotency_key="cap-0003",
        filament_id=4,
        spool=SpoolFields(),
        quantity=2,
        template_id=template_id,
        printer_id=printer_id,
    )
    submit_mock = AsyncMock(
        side_effect=[
            AppError(ErrorCode.PRINT_SUBMISSION_FAILED),
            SubmittedJob(cups_job_id=2, rendered_file_path="/data/y.pdf"),
        ]
    )

    with patch("app.services.workflows.create_and_print.submit_print_job", new=submit_mock):
        run = await CreateAndPrintService(session, client, settings).run(request)

    assert run.status is WorkflowStatus.PARTIAL
    assert submit_mock.await_count == 2, "Der zweite Druckversuch muss trotzdem stattfinden"


@pytest.mark.asyncio
async def test_lauf_ist_idempotent(session: AsyncSession, settings: Settings) -> None:
    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.create_spool.side_effect = [SpoolmanRecord(id=301, filament={})]
    request = CreateAndPrintRequest(
        idempotency_key="cap-0004",
        filament_id=4,
        spool=SpoolFields(),
        quantity=1,
        template_id=template_id,
        printer_id=printer_id,
    )

    with patch(
        "app.services.workflows.create_and_print.submit_print_job",
        new=AsyncMock(return_value=SubmittedJob(cups_job_id=3, rendered_file_path="/data/z.pdf")),
    ):
        first = await CreateAndPrintService(session, client, settings).run(request)
        second = await CreateAndPrintService(session, client, settings).run(request)

    assert second.id == first.id
    assert client.create_spool.await_count == 1


@pytest.mark.asyncio
async def test_ohne_vorlage_und_drucker_werden_die_standards_verwendet(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, _template_id = await _printer_and_template(session)
    await printers_service.update_printer(session, printer_id, PrinterUpdate(is_default=True))
    client = AsyncMock()
    client.create_spool.side_effect = [
        SpoolmanRecord(id=501, filament={"material": "PLA", "color_hex": "1E88E5"})
    ]
    request = CreateAndPrintRequest(
        idempotency_key="cap-0007",
        filament_id=4,
        spool=SpoolFields(),
        quantity=1,
    )

    with patch(
        "app.services.workflows.create_and_print.submit_print_job",
        new=AsyncMock(return_value=SubmittedJob(cups_job_id=5, rendered_file_path="/data/w.pdf")),
    ):
        run = await CreateAndPrintService(session, client, settings).run(request)

    assert run.status is WorkflowStatus.COMPLETED
    assert run.created_spool_ids_json == "[501]"


@pytest.mark.asyncio
async def test_unbekannte_vorlage_verhindert_dass_ueberhaupt_etwas_angelegt_wird(
    session: AsyncSession, settings: Settings
) -> None:
    printer_id, _ = await _printer_and_template(session)
    client = AsyncMock()
    request = CreateAndPrintRequest(
        idempotency_key="cap-0005",
        filament_id=4,
        spool=SpoolFields(),
        quantity=1,
        template_id=999,
        printer_id=printer_id,
    )

    with pytest.raises(AppError) as excinfo:
        await CreateAndPrintService(session, client, settings).run(request)

    assert excinfo.value.code is ErrorCode.TEMPLATE_NOT_FOUND
    client.create_spool.assert_not_called()


@pytest.mark.asyncio
async def test_print_job_traegt_fehlercode_bei_fehlschlag(
    session: AsyncSession, settings: Settings
) -> None:
    from sqlalchemy import select

    from app.models.print_job import PrintJob

    printer_id, template_id = await _printer_and_template(session)
    client = AsyncMock()
    client.create_spool.side_effect = [SpoolmanRecord(id=401, filament={})]
    request = CreateAndPrintRequest(
        idempotency_key="cap-0006",
        filament_id=4,
        spool=SpoolFields(),
        quantity=1,
        template_id=template_id,
        printer_id=printer_id,
    )

    with patch(
        "app.services.workflows.create_and_print.submit_print_job",
        new=AsyncMock(side_effect=AppError(ErrorCode.CUPS_UNREACHABLE)),
    ):
        run = await CreateAndPrintService(session, client, settings).run(request)
    await session.commit()

    job = await session.scalar(select(PrintJob).where(PrintJob.workflow_run_id == run.id))
    assert job is not None
    assert job.status is PrintJobStatus.FAILED
    assert job.error_code == ErrorCode.CUPS_UNREACHABLE.value
    assert job.attempt_count == 1
