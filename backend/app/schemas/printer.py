"""Schemata fuer Druckerprofile."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BackendType

#: Siehe app/services/printing/cups_client.py::_QUEUE_NAME_RE — dieselbe
#: Einschraenkung, hier zusaetzlich an der Systemgrenze durchgesetzt.
_QUEUE_NAME_PATTERN = r"^[A-Za-z0-9_-]{1,127}$"


class PrinterBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    queue_name: str = Field(min_length=1, max_length=128, pattern=_QUEUE_NAME_PATTERN)
    backend_type: BackendType = BackendType.CUPS

    cups_server: str | None = Field(default=None, max_length=255)
    cups_port: int | None = Field(default=None, ge=1, le=65535)
    use_tls: bool = False

    location: str | None = Field(default=None, max_length=255)
    model: str | None = Field(default=None, max_length=255)

    default_template_id: int | None = Field(default=None, gt=0)

    label_width_mm: float = Field(default=62.0, gt=0, le=1000)
    label_height_mm: float = Field(default=29.0, gt=0, le=1000)
    dpi: int = Field(default=300, ge=50, le=1200)
    horizontal_offset_mm: float = Field(default=0.0, ge=-100, le=100)
    vertical_offset_mm: float = Field(default=0.0, ge=-100, le=100)
    scale_percent: float = Field(default=100.0, gt=0, le=400)
    copies: int = Field(default=1, ge=1, le=100)

    is_default: bool = False
    is_enabled: bool = True


class PrinterCreate(PrinterBase):
    pass


class PrinterUpdate(BaseModel):
    """Alle Felder optional — nur uebergebene Werte werden geaendert (PATCH)."""

    name: str | None = Field(default=None, min_length=1, max_length=128)
    queue_name: str | None = Field(
        default=None, min_length=1, max_length=128, pattern=_QUEUE_NAME_PATTERN
    )
    backend_type: BackendType | None = None
    cups_server: str | None = Field(default=None, max_length=255)
    cups_port: int | None = Field(default=None, ge=1, le=65535)
    use_tls: bool | None = None
    location: str | None = Field(default=None, max_length=255)
    model: str | None = Field(default=None, max_length=255)
    default_template_id: int | None = Field(default=None, gt=0)
    label_width_mm: float | None = Field(default=None, gt=0, le=1000)
    label_height_mm: float | None = Field(default=None, gt=0, le=1000)
    dpi: int | None = Field(default=None, ge=50, le=1200)
    horizontal_offset_mm: float | None = Field(default=None, ge=-100, le=100)
    vertical_offset_mm: float | None = Field(default=None, ge=-100, le=100)
    scale_percent: float | None = Field(default=None, gt=0, le=400)
    copies: int | None = Field(default=None, ge=1, le=100)
    is_default: bool | None = None
    is_enabled: bool | None = None


class PrinterRead(PrinterBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    last_seen_at: datetime | None = None
    last_status: str | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class PrinterTestResult(BaseModel):
    status: str
    detail: str | None = None


class DiscoveredPrinter(BaseModel):
    """Eine auf dem CUPS-Server bereits vorhandene, noch nicht importierte Warteschlange."""

    queue_name: str
    model: str | None = None
    location: str | None = None
    #: ``False`` bedeutet: der Name enthaelt Zeichen ausserhalb von
    #: ``_QUEUE_NAME_PATTERN`` und kann in dieser Anwendung nicht als
    #: Drucker angelegt werden.
    supported: bool
