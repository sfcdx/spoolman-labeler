"""Schemata fuer Druckauftraege (Historie)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import PrintJobStatus


class PrintJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    spoolman_spool_id: int
    printer_id: int | None
    template_id: int | None
    workflow_run_id: int | None
    status: PrintJobStatus
    copies: int
    cups_job_id: int | None
    cups_job_state: str | None
    cups_job_state_reasons: str | None
    error_code: str | None
    error_message: str | None
    attempt_count: int
    submitted_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
