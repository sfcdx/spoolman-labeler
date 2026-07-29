"""Schemata fuer die ueberschreibbaren Laufzeit-Einstellungen."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class AppSettingsRead(BaseModel):
    spoolman_public_url: str
    spoolman_public_url_overridden: bool
    cups_server: str
    cups_server_overridden: bool
    cups_port: int
    cups_port_overridden: bool


class AppSettingsUpdate(BaseModel):
    """Nur uebergebene Felder werden geaendert (PATCH-Semantik ueber PUT)."""

    spoolman_public_url: str | None = Field(default=None, min_length=1, max_length=512)
    cups_server: str | None = Field(default=None, min_length=1, max_length=255)
    cups_port: int | None = Field(default=None, ge=1, le=65535)

    @field_validator("spoolman_public_url")
    @classmethod
    def _require_http_scheme(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("http://", "https://")):
            msg = "URL muss mit http:// oder https:// beginnen"
            raise ValueError(msg)
        return value.rstrip("/") if value else value
