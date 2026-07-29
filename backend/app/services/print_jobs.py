"""Lesezugriff und Wiederholung fuer Druckauftraege (Historie)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.models.enums import PrintJobStatus
from app.models.print_job import PrintJob
from app.services import printers as printers_service
from app.services import templates as templates_service
from app.services.printing.cups_client import submit_print_job
from app.services.rendering import LabelRenderer
from app.services.rendering.label_context import build_label_context
from app.services.spoolman import SpoolmanClient


async def list_print_jobs(
    session: AsyncSession, *, status: PrintJobStatus | None = None, limit: int = 100
) -> list[PrintJob]:
    query = select(PrintJob).order_by(PrintJob.created_at.desc()).limit(limit)
    if status is not None:
        query = query.where(PrintJob.status == status)
    result = await session.scalars(query)
    return list(result)


async def get_print_job(session: AsyncSession, print_job_id: int) -> PrintJob:
    job = await session.get(PrintJob, print_job_id)
    if job is None:
        raise AppError(ErrorCode.PRINT_JOB_NOT_FOUND)
    return job


async def retry_print_job(
    session: AsyncSession, client: SpoolmanClient, settings: Settings, print_job_id: int
) -> PrintJob:
    """Rendert eine Spule erneut und uebermittelt sie erneut an CUPS.

    Die Spule wird frisch aus Spoolman geladen, damit das Etikett den
    aktuellen Stand zeigt statt der Werte vom ersten (fehlgeschlagenen)
    Versuch. Nur Auftraege mit ``is_retryable`` (fehlgeschlagen/abgebrochen)
    duerfen erneut gedruckt werden — ein bereits abgeschlossener oder noch
    laufender Auftrag bliebe sonst doppelt in der Warteschlange.
    """
    job = await get_print_job(session, print_job_id)
    if not job.status.is_retryable:
        raise AppError(ErrorCode.PRINT_JOB_NOT_RETRYABLE)
    if job.printer_id is None or job.template_id is None:
        raise AppError(
            ErrorCode.VALIDATION_FAILED,
            detail="Drucker oder Vorlage dieses Auftrags existiert nicht mehr",
        )

    printer = await printers_service.get_printer(session, job.printer_id)
    template = await templates_service.get_template(session, job.template_id)
    renderer = LabelRenderer(settings)

    job.attempt_count += 1
    job.error_code = None
    job.error_message = None
    job.completed_at = None

    try:
        record = await client.get_spool(job.spoolman_spool_id)
        context = build_label_context(record.model_dump(), renderer.qr_data_uri(record.id))
        pdf_bytes = renderer.render_pdf(
            html_content=template.html_content,
            css_content=template.css_content,
            width_mm=template.width_mm,
            height_mm=template.height_mm,
            context=context,
        )
        submitted = await submit_print_job(
            printer=printer,
            settings=settings,
            pdf_bytes=pdf_bytes,
            title=f"Spoolman-Labeler Spule {record.id} (Wiederholung)",
            copies=job.copies,
        )
    except AppError as error:
        job.status = PrintJobStatus.FAILED
        job.error_code = error.code.value
        job.error_message = error.user_message
        job.completed_at = datetime.now(UTC)
        await session.flush()
        return job
    except Exception:
        job.status = PrintJobStatus.FAILED
        job.error_code = ErrorCode.INTERNAL_ERROR.value
        job.error_message = "Der Druckauftrag konnte nicht übermittelt werden."
        job.completed_at = datetime.now(UTC)
        await session.flush()
        return job

    job.status = PrintJobStatus.SUBMITTED
    job.cups_job_id = submitted.cups_job_id
    job.rendered_file_path = submitted.rendered_file_path
    job.submitted_at = datetime.now(UTC)
    await session.flush()
    return job
