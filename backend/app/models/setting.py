"""Persistente Einstellungen als Schluessel-Wert-Paare."""

from __future__ import annotations

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Setting(Base, TimestampMixin):
    """Eine einzelne Einstellung.

    Der Wert wird als JSON abgelegt, damit auch Zahlen, Wahrheitswerte und
    verschachtelte Strukturen ohne zusaetzliche Spalten moeglich sind.

    ``is_secret`` markiert Werte, die in API-Antworten maskiert und niemals
    geloggt werden.
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    value_json: Mapped[str] = mapped_column(Text, nullable=False, default="null")
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return f"<Setting {self.key}>"
