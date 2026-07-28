"""Nachvollziehbare Ereignisse."""

from __future__ import annotations

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AuditEvent(Base, TimestampMixin):
    """Ein protokolliertes Ereignis.

    Bewusst schlank gehalten. Es duerfen keine Geheimnisse und keine
    personenbezogenen Daten in ``metadata_json`` landen.
    """

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[str | None] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<AuditEvent {self.id} {self.event_type}>"
