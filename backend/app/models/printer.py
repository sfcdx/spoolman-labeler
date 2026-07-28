"""Druckerprofile."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import BackendType


class Printer(Base, TimestampMixin):
    """Ein konfigurierter Drucker mit seinen Etiketten- und Versatzangaben."""

    __tablename__ = "printers"
    __table_args__ = (
        CheckConstraint("label_width_mm > 0", name="label_width_positive"),
        CheckConstraint("label_height_mm > 0", name="label_height_positive"),
        CheckConstraint("scale_percent > 0", name="scale_positive"),
        CheckConstraint("copies >= 1", name="copies_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    #: Name der CUPS-Queue. Wird vor jeder Verwendung streng validiert,
    #: damit er niemals als Shell-Argument missbraucht werden kann.
    queue_name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    backend_type: Mapped[BackendType] = mapped_column(
        String(16), nullable=False, default=BackendType.CUPS
    )

    cups_server: Mapped[str | None] = mapped_column(String(255))
    cups_port: Mapped[int | None] = mapped_column(Integer)
    use_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    location: Mapped[str | None] = mapped_column(String(255))
    model: Mapped[str | None] = mapped_column(String(255))
    capabilities_json: Mapped[str | None] = mapped_column(Text)

    default_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("templates.id", ondelete="SET NULL")
    )

    label_width_mm: Mapped[float] = mapped_column(Float, nullable=False, default=62.0)
    label_height_mm: Mapped[float] = mapped_column(Float, nullable=False, default=29.0)
    dpi: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    horizontal_offset_mm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    vertical_offset_mm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    scale_percent: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    copies: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(String(64))
    last_error: Mapped[str | None] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<Printer {self.id} {self.queue_name!r}>"
