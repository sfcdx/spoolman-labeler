"""Workflow: eine bereits in Spoolman vorhandene Spule direkt bedrucken.

Ergaenzt ``create_and_print`` (Neuanlage + Druck) um den zweiten, vom Nutzer
gewuenschten Einstiegspunkt: "vorhandene Spule Etikett drucken", ohne dass
dabei irgendetwas in Spoolman angelegt oder veraendert wird.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field
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


class PrintExistingRequest(BaseModel):
    spool_id: int = Field(gt=0)
    #: ``None`` loest serverseitig Standardvorlage/-drucker auf, siehe
    #: ``create_and_print.CreateAndPrintRequest``.
    template_id: int | None = Field(default=None, gt=0)
    printer_id: int | None = Field(default=None, gt=0)
    copies: int | None = Field(default=None, ge=1, le=100)


class PrintExistingService:
    def __init__(self, session: AsyncSession, client: SpoolmanClient, settings: Settings) -> None:
        self.session, self.client, self.settings = session, client, settings
        self.renderer = LabelRenderer(settings)

    async def run(self, request: PrintExistingRequest) -> PrintJob:
        template = (
            await templates_service.get_template(self.session, request.template_id)
            if request.template_id is not None
            else await templates_service.get_default_template(self.session)
        )
        printer = (
            await printers_service.get_printer(self.session, request.printer_id)
            if request.printer_id is not None
            else await printers_service.get_default_printer(self.session)
        )
        copies = request.copies or printer.copies

        # Die Spule wird vor dem Anlegen des PrintJob-Datensatzes geladen:
        # existiert sie nicht (mehr) in Spoolman, soll kein verwaister
        # Druckauftrag in der Historie landen.
        record = await self.client.get_spool(request.spool_id)

        print_job = PrintJob(
            spoolman_spool_id=record.id,
            printer_id=printer.id,
            template_id=template.id,
            status=PrintJobStatus.QUEUED,
            copies=copies,
        )
        self.session.add(print_job)
        await self.session.flush()

        print_job.attempt_count += 1
        try:
            context = build_label_context(record.model_dump(), self.renderer.qr_data_uri(record.id))
            pdf_bytes = await self.renderer.render_pdf(
                html_content=template.html_content,
                css_content=template.css_content,
                width_mm=template.width_mm,
                height_mm=template.height_mm,
                context=context,
            )
            submitted = await submit_print_job(
                printer=printer,
                settings=self.settings,
                pdf_bytes=pdf_bytes,
                title=f"Spoolman-Labeler Spule {record.id}",
                copies=copies,
            )
        except AppError as error:
            print_job.status = PrintJobStatus.FAILED
            print_job.error_code = error.code.value
            print_job.error_message = error.user_message
            print_job.completed_at = datetime.now(UTC)
            await self.session.flush()
            return print_job
        except Exception:
            print_job.status = PrintJobStatus.FAILED
            print_job.error_code = ErrorCode.INTERNAL_ERROR.value
            print_job.error_message = "Der Druckauftrag konnte nicht übermittelt werden."
            print_job.completed_at = datetime.now(UTC)
            await self.session.flush()
            return print_job

        print_job.status = PrintJobStatus.SUBMITTED
        print_job.cups_job_id = submitted.cups_job_id
        print_job.rendered_file_path = submitted.rendered_file_path
        print_job.submitted_at = datetime.now(UTC)
        await self.session.flush()
        return print_job
