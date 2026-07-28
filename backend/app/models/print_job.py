"""Druckauftraege."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import PrintJobStatus


class PrintJob(Base, TimestampMixin):
    """Ein an CUPS uebermittelter Druckauftrag.

    ``spoolman_spool_id`` ist eine reine Fremdreferenz. Wir halten keine Kopie
    der Spulendaten — Spoolman bleibt das fuehrende System.
    """

    __tablename__ = "print_jobs"
    __table_args__ = (CheckConstraint("copies >= 1", name="copies_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    spoolman_spool_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    printer_id: Mapped[int | None] = mapped_column(
        ForeignKey("printers.id", ondelete="SET NULL"), index=True
    )
    template_id: Mapped[int | None] = mapped_column(ForeignKey("templates.id", ondelete="SET NULL"))
    workflow_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("workflow_runs.id", ondelete="SET NULL"), index=True
    )

    status: Mapped[PrintJobStatus] = mapped_column(
        String(16), nullable=False, default=PrintJobStatus.QUEUED, index=True
    )
    copies: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    #: Pfad der gerenderten Datei unterhalb von ``/data/rendered``.
    #: Wird beim Aufraeumen geleert, der Auftrag bleibt in der Historie.
    rendered_file_path: Mapped[str | None] = mapped_column(String(512))
    #: Hash der Renderdaten, um identische Wiederholungsdrucke zu erkennen.
    payload_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    cups_job_id: Mapped[int | None] = mapped_column(Integer)
    #: Rohwerte aus IPP, damit ein unklarer Status nachvollziehbar bleibt.
    cups_job_state: Mapped[str | None] = mapped_column(String(32))
    cups_job_state_reasons: Mapped[str | None] = mapped_column(String(512))

    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<PrintJob {self.id} spool={self.spoolman_spool_id} {self.status}>"
