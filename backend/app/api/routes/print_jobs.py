"""Endpunkte fuer die Druckhistorie."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_effective_settings
from app.api.routes.spoolman import get_client
from app.core.config import Settings
from app.db.session import get_session
from app.models.enums import PrintJobStatus
from app.schemas.print_job import PrintJobRead
from app.services import print_jobs as print_jobs_service
from app.services.spoolman import SpoolmanClient

router = APIRouter(prefix="/print-jobs", tags=["print-jobs"])


@router.get("", response_model=list[PrintJobRead])
async def list_print_jobs(
    status: PrintJobStatus | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> list[PrintJobRead]:
    jobs = await print_jobs_service.list_print_jobs(session, status=status, limit=limit)
    return [PrintJobRead.model_validate(job) for job in jobs]


@router.get("/{print_job_id}", response_model=PrintJobRead)
async def get_print_job(
    print_job_id: int, session: AsyncSession = Depends(get_session)
) -> PrintJobRead:
    return PrintJobRead.model_validate(
        await print_jobs_service.get_print_job(session, print_job_id)
    )


@router.post("/{print_job_id}/retry", response_model=PrintJobRead)
async def retry_print_job(
    print_job_id: int,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_effective_settings),
    client: SpoolmanClient = Depends(get_client),
) -> PrintJobRead:
    job = await print_jobs_service.retry_print_job(session, client, settings, print_job_id)
    return PrintJobRead.model_validate(job)
