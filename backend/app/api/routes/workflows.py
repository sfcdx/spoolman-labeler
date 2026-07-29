"""Workflow-Endpunkte."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_effective_settings
from app.api.routes.spoolman import get_client
from app.core.config import Settings
from app.core.errors import AppError
from app.db.session import get_session
from app.models.workflow_run import WorkflowRun
from app.schemas.print_job import PrintJobRead
from app.services.spoolman import SpoolmanClient
from app.services.workflows import (
    CreateAndPrintRequest,
    CreateAndPrintService,
    CreateOnlyRequest,
    CreateOnlyService,
    PrintExistingRequest,
    PrintExistingService,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _serialize(run: WorkflowRun) -> dict[str, object]:
    return {
        "workflow_id": run.id,
        "status": run.status,
        "created_spool_ids": json.loads(run.created_spool_ids_json),
        "print_job_ids": json.loads(run.print_job_ids_json),
        "error": (
            {"code": run.error_code, "message": run.error_message}
            if run.error_code is not None
            else None
        ),
    }


@router.post("/create-only")
async def create_only(
    response: Response,
    request: CreateOnlyRequest,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_effective_settings),
    client: SpoolmanClient = Depends(get_client),
) -> dict[str, object]:
    try:
        run = await CreateOnlyService(session, client, settings).run(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if run.status.value == "failed":
        # Der Datensatz muss trotz 502 festgeschrieben werden. Deshalb den
        # Status an der Response setzen statt eine HTTPException auszulösen.
        response.status_code = 502
    return _serialize(run)


@router.post("/create-and-print")
async def create_and_print(
    response: Response,
    request: CreateAndPrintRequest,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_effective_settings),
    client: SpoolmanClient = Depends(get_client),
) -> dict[str, object]:
    """Legt Spulen an und druckt im selben Vorgang ein Etikett je Spule.

    ``partial`` bedeutet: alle Spulen wurden angelegt, mindestens ein Druck
    ist aber fehlgeschlagen. Die Spulen bleiben in jedem Fall bestehen.
    """
    try:
        run = await CreateAndPrintService(session, client, settings).run(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except AppError as error:
        raise HTTPException(status_code=error.status_code, detail=error.user_message) from error
    if run.status.value == "failed":
        response.status_code = 502
    elif run.status.value == "partial":
        response.status_code = 207
    return _serialize(run)


@router.post("/print-existing", response_model=PrintJobRead)
async def print_existing(
    response: Response,
    request: PrintExistingRequest,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_effective_settings),
    client: SpoolmanClient = Depends(get_client),
) -> PrintJobRead:
    """Druckt eine bereits in Spoolman vorhandene Spule, ohne etwas anzulegen.

    Zweiter Einstiegspunkt neben ``create-and-print``: 'vorhandene Spule
    Etikett drucken'.
    """
    try:
        job = await PrintExistingService(session, client, settings).run(request)
    except AppError as error:
        raise HTTPException(status_code=error.status_code, detail=error.user_message) from error
    if job.status.value == "failed":
        response.status_code = 502
    return PrintJobRead.model_validate(job)


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: int, session: AsyncSession = Depends(get_session)
) -> dict[str, object]:
    run = await session.scalar(select(WorkflowRun).where(WorkflowRun.id == workflow_id))
    if run is None:
        raise HTTPException(status_code=404, detail="Workflow-Lauf wurde nicht gefunden")
    return _serialize(run)
