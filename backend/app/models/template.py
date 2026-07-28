"""Etikettenvorlagen."""

from __future__ import annotations

from sqlalchemy import Boolean, CheckConstraint, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import OutputFormat, QrContentMode


class Template(Base, TimestampMixin):
    """Eine Etikettenvorlage aus HTML und CSS mit Jinja2-Platzhaltern."""

    __tablename__ = "templates"
    __table_args__ = (
        CheckConstraint("width_mm > 0", name="width_positive"),
        CheckConstraint("height_mm > 0", name="height_positive"),
        CheckConstraint("dpi >= 50 AND dpi <= 1200", name="dpi_plausible"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(512))

    html_content: Mapped[str] = mapped_column(Text, nullable=False)
    css_content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    width_mm: Mapped[float] = mapped_column(Float, nullable=False)
    height_mm: Mapped[float] = mapped_column(Float, nullable=False)
    dpi: Mapped[int] = mapped_column(Integer, nullable=False, default=300)

    output_format: Mapped[OutputFormat] = mapped_column(
        String(8), nullable=False, default=OutputFormat.PDF
    )
    qr_content_mode: Mapped[QrContentMode] = mapped_column(
        String(16), nullable=False, default=QrContentMode.SPOOLMAN_URI
    )

    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: Mitgelieferte Vorlagen duerfen nicht geloescht, aber dupliziert werden.
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return f"<Template {self.id} {self.name!r} {self.width_mm}x{self.height_mm}mm>"
