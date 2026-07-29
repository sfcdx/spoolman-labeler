"""Schemata fuer Etikettenvorlagen."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OutputFormat, QrContentMode


class TemplateBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    html_content: str = Field(min_length=1)
    css_content: str = ""
    width_mm: float = Field(gt=0, le=1000)
    height_mm: float = Field(gt=0, le=1000)
    dpi: int = Field(default=300, ge=50, le=1200)
    output_format: OutputFormat = OutputFormat.PDF
    qr_content_mode: QrContentMode = QrContentMode.SPOOLMAN_URI
    is_default: bool = False


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    """Alle Felder optional — nur uebergebene Werte werden geaendert (PATCH)."""

    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    html_content: str | None = Field(default=None, min_length=1)
    css_content: str | None = None
    width_mm: float | None = Field(default=None, gt=0, le=1000)
    height_mm: float | None = Field(default=None, gt=0, le=1000)
    dpi: int | None = Field(default=None, ge=50, le=1200)
    output_format: OutputFormat | None = None
    qr_content_mode: QrContentMode | None = None
    is_default: bool | None = None


class TemplateRead(TemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_builtin: bool
    created_at: datetime
    updated_at: datetime


class TemplateImportRequest(BaseModel):
    """Preset im Original-Spoolman-Format (``labelSettings`` + ``template``)."""

    preset: dict[str, object]
    name: str | None = Field(default=None, max_length=128)


class TemplateImportResponse(BaseModel):
    template: TemplateRead
    unknown_tags: list[str]


class TemplateDuplicateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class TemplatePreviewRequest(BaseModel):
    html_content: str = Field(min_length=1)
    css_content: str = ""
    width_mm: float = Field(gt=0, le=1000)
    height_mm: float = Field(gt=0, le=1000)
