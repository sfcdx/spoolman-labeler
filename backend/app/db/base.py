"""Gemeinsame Basis aller ORM-Modelle."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Feste Namenskonventionen fuer Constraints. Ohne sie erzeugt SQLite
# unbenannte Constraints, die Alembic spaeter nicht mehr aendern kann.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Basisklasse fuer alle Tabellen."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def utcnow() -> datetime:
    """Zeitzonenbewusster Zeitstempel in UTC."""
    return datetime.now(UTC)


class TimestampMixin:
    """Ergaenzt ``created_at`` und ``updated_at``."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
        nullable=False,
    )
