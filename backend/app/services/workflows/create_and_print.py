"""Idempotenter Workflow: Spulen anlegen und im selben Vorgang etikettieren.

Anlegen und Drucken sind fachlich getrennte Schritte (siehe
``WorkflowStatus.PARTIAL``-Dokumentation): Sobald eine Spule in Spoolman
angelegt ist, macht kein nachfolgender Druckfehler das jemals rueckgaengig.
Ein Lauf mit erfolgreicher Anlage aber fehlgeschlagenem Druck endet als
``PARTIAL`` — die Spule bleibt bestehen und kann ueber die Druckhistorie
erneut gedruckt werden.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.models.enums import PrintJobStatus, WorkflowStatus
from app.models.print_job import PrintJob
from app.models.printer import Printer
from app.models.template import Template
from app.models.workflow_run import WorkflowRun
from app.services import printers as printers_service
from app.services import templates as templates_service
from app.services.printing.cups_client import submit_print_job
from app.services.rendering import LabelRenderer
from app.services.rendering.label_context import build_label_context
from app.services.spoolman import FilamentCreate, SpoolCreate, SpoolFields, SpoolmanClient
from app.services.spoolman.client import SpoolmanRecord


class CreateAndPrintRequest(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    filament_id: int | None = Field(default=None, gt=0)
    new_filament: FilamentCreate | None = None
    #: Ohne filament_id — siehe CreateOnlyRequest fuer die Begruendung.
    spool: SpoolFields
    quantity: int = Field(default=1, ge=1)
    template_id: int = Field(gt=0)
    printer_id: int = Field(gt=0)
    #: ``None`` uebernimmt die Voreinstellung des gewaehlten Druckers.
    copies: int | None = Field(default=None, ge=1, le=100)


class CreateAndPrintService:
    def __init__(self, session: AsyncSession, client: SpoolmanClient, settings: Settings) -> None:
        self.session, self.client, self.settings = session, client, settings
        self.renderer = LabelRenderer(settings)

    async def run(self, request: CreateAndPrintRequest) -> WorkflowRun:
        existing = await self.session.scalar(
            select(WorkflowRun).where(WorkflowRun.idempotency_key == request.idempotency_key)
        )
        if existing is not None:
            return existing
        if request.quantity > self.settings.max_spools_per_workflow:
            raise ValueError("Maximale Anzahl Spulen überschritten")
        if (request.filament_id is None) == (request.new_filament is None):
            raise ValueError("Genau ein vorhandenes oder neues Filament angeben")

        # Fehlende Vorlage/Drucker sind ein reiner Eingabefehler und werden
        # geprueft, bevor ueberhaupt etwas in Spoolman angelegt wird.
        template = await templates_service.get_template(self.session, request.template_id)
        printer = await printers_service.get_printer(self.session, request.printer_id)
        copies = request.copies or printer.copies

        run = WorkflowRun(
            idempotency_key=request.idempotency_key,
            status=WorkflowStatus.CREATING,
            requested_spool_count=request.quantity,
            request_payload_json=request.model_dump_json(),
        )
        self.session.add(run)
        await self.session.flush()

        created_ids: list[int] = []
        records: list[SpoolmanRecord] = []
        try:
            if request.filament_id is not None:
                filament_id = request.filament_id
            else:
                assert request.new_filament is not None
                filament_id = (await self.client.create_filament(request.new_filament)).id
            for _ in range(request.quantity):
                payload = SpoolCreate(filament_id=filament_id, **request.spool.model_dump())
                record = await self.client.create_spool(payload)
                records.append(record)
                created_ids.append(record.id)
                run.created_spool_ids_json = json.dumps(created_ids)
                await self.session.flush()
        except AppError as error:
            # Nicht erneut ausloesen: Die Request-Abhaengigkeit wuerde sonst
            # die Transaktion zurueckrollen und bereits erzeugte Spulen waeren
            # weder im Verlauf noch fuer einen erneuten Aufruf sichtbar.
            run.status = WorkflowStatus.FAILED
            run.error_code = error.code.value
            run.error_message = error.user_message
            run.completed_at = datetime.now(UTC)
            return run
        except Exception:
            run.status = WorkflowStatus.FAILED
            run.error_code = ErrorCode.INTERNAL_ERROR.value
            run.error_message = "Der Workflow konnte nicht abgeschlossen werden."
            run.completed_at = datetime.now(UTC)
            return run

        run.status = WorkflowStatus.PRINTING
        await self.session.flush()

        print_job_ids: list[int] = []
        any_print_failed = False
        for record in records:
            print_job = PrintJob(
                spoolman_spool_id=record.id,
                printer_id=printer.id,
                template_id=template.id,
                workflow_run_id=run.id,
                status=PrintJobStatus.QUEUED,
                copies=copies,
            )
            self.session.add(print_job)
            await self.session.flush()
            print_job_ids.append(print_job.id)
            run.print_job_ids_json = json.dumps(print_job_ids)

            await self._print_one(print_job, record, template, printer, copies)
            if print_job.status is PrintJobStatus.FAILED:
                any_print_failed = True
            await self.session.flush()

        run.status = WorkflowStatus.PARTIAL if any_print_failed else WorkflowStatus.COMPLETED
        run.completed_at = datetime.now(UTC)
        return run

    async def _print_one(
        self,
        print_job: PrintJob,
        record: SpoolmanRecord,
        template: Template,
        printer: Printer,
        copies: int,
    ) -> None:
        """Rendert und druckt genau eine Spule; Fehler bleiben lokal am Job.

        Ein Druckfehler darf niemals den Lauf abbrechen — die uebrigen Spulen
        dieses Auftrags sollen trotzdem gedruckt werden (siehe Modul-Docstring).
        """
        print_job.attempt_count += 1
        try:
            context = build_label_context(record.model_dump(), self.renderer.qr_data_uri(record.id))
            pdf_bytes = self.renderer.render_pdf(
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
            return
        except Exception:
            print_job.status = PrintJobStatus.FAILED
            print_job.error_code = ErrorCode.INTERNAL_ERROR.value
            print_job.error_message = "Der Druckauftrag konnte nicht übermittelt werden."
            print_job.completed_at = datetime.now(UTC)
            return

        print_job.status = PrintJobStatus.SUBMITTED
        print_job.cups_job_id = submitted.cups_job_id
        print_job.rendered_file_path = submitted.rendered_file_path
        print_job.submitted_at = datetime.now(UTC)
