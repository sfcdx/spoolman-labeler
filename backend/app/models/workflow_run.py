"""Workflow-Laeufe mit Idempotenzschutz."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import WorkflowStatus


class WorkflowRun(Base, TimestampMixin):
    """Ein Durchlauf von „Speichern und drucken".

    Der ``idempotency_key`` ist eindeutig. Ein wiederholter Request mit
    demselben Schluessel liefert das Ergebnis des ersten Laufs zurueck,
    statt erneut Spulen anzulegen (siehe ADR-012).
    """

    __tablename__ = "workflow_runs"
    __table_args__ = (CheckConstraint("requested_spool_count >= 1", name="spool_count_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False
    )
    status: Mapped[WorkflowStatus] = mapped_column(
        String(16), nullable=False, default=WorkflowStatus.PENDING, index=True
    )

    requested_spool_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    #: JSON-Liste der in Spoolman erzeugten Spulen-IDs.
    created_spool_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    #: JSON-Liste der zugehoerigen Druckauftrags-IDs.
    print_job_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    #: Angefragte Nutzdaten ohne Geheimnisse. Wird nur zur Nachvollziehbarkeit
    #: gespeichert und niemals unveraendert wieder abgeschickt.
    request_payload_json: Mapped[str | None] = mapped_column(Text)

    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<WorkflowRun {self.id} {self.status}>"
