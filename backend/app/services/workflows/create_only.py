"""Idempotenter Create-only-Workflow ohne Druck-Seiteneffekt."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.models.enums import WorkflowStatus
from app.models.workflow_run import WorkflowRun
from app.services.spoolman import FilamentCreate, SpoolCreate, SpoolFields, SpoolmanClient


class CreateOnlyRequest(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    filament_id: int | None = Field(default=None, gt=0)
    new_filament: FilamentCreate | None = None
    #: Ohne filament_id — die stammt aus request.filament_id oder dem neu
    #: angelegten Filament, siehe run(). Ein hier mitgegebener Wert würde
    #: ohnehin verworfen; SpoolFields lässt ihn deshalb gar nicht erst zu.
    spool: SpoolFields
    quantity: int = Field(default=1, ge=1)


class CreateOnlyService:
    def __init__(self, session: AsyncSession, client: SpoolmanClient, settings: Settings) -> None:
        self.session, self.client, self.settings = session, client, settings

    async def run(self, request: CreateOnlyRequest) -> WorkflowRun:
        existing = await self.session.scalar(
            select(WorkflowRun).where(WorkflowRun.idempotency_key == request.idempotency_key)
        )
        if existing is not None:
            return existing
        if request.quantity > self.settings.max_spools_per_workflow:
            raise ValueError("Maximale Anzahl Spulen überschritten")
        if (request.filament_id is None) == (request.new_filament is None):
            raise ValueError("Genau ein vorhandenes oder neues Filament angeben")
        run = WorkflowRun(
            idempotency_key=request.idempotency_key,
            status=WorkflowStatus.CREATING,
            requested_spool_count=request.quantity,
            request_payload_json=request.model_dump_json(),
        )
        self.session.add(run)
        await self.session.flush()
        try:
            if request.filament_id is not None:
                filament_id = request.filament_id
            else:
                assert request.new_filament is not None
                filament_id = (await self.client.create_filament(request.new_filament)).id
            ids: list[int] = []
            for _ in range(request.quantity):
                payload = SpoolCreate(filament_id=filament_id, **request.spool.model_dump())
                ids.append((await self.client.create_spool(payload)).id)
                run.created_spool_ids_json = json.dumps(ids)
                await self.session.flush()
            run.status, run.completed_at = WorkflowStatus.COMPLETED, datetime.now(UTC)
        except AppError as error:
            # Nicht erneut auslösen: Die Request-Abhängigkeit würde dann die
            # Transaktion zurückrollen und die bereits erzeugten Spulen wären
            # weder im Verlauf noch für einen erneuten Aufruf sichtbar.
            run.status = WorkflowStatus.FAILED
            run.error_code = error.code.value
            run.error_message = error.user_message
            run.completed_at = datetime.now(UTC)
        except Exception:
            # Technische Details gehören ins Log, nicht in die API oder die
            # dauerhaft gespeicherte, vom Frontend lesbare Fehlermeldung.
            run.status = WorkflowStatus.FAILED
            run.error_code = ErrorCode.INTERNAL_ERROR.value
            run.error_message = "Der Workflow konnte nicht abgeschlossen werden."
            run.completed_at = datetime.now(UTC)
        return run
