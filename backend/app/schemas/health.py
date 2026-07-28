"""Antwortschemata fuer Health und Version."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class ComponentStatus(StrEnum):
    """Zustand einer einzelnen Komponente."""

    OK = "ok"
    DEGRADED = "degraded"
    ERROR = "error"
    #: Bewusst nicht konfiguriert — kein Fehler.
    DISABLED = "disabled"


class HealthResponse(BaseModel):
    """Ergebnis von ``GET /api/health``.

    ``status`` beschreibt die Kernanwendung. Eine gestoerte externe
    Abhaengigkeit — etwa ein nicht erreichbarer Drucker — macht den Container
    nicht ungesund, sondern erscheint als ``degraded`` in der jeweiligen
    Komponente.
    """

    status: ComponentStatus = Field(description="Zustand der Kernanwendung")
    database: ComponentStatus
    spoolman: ComponentStatus
    cups: ComponentStatus
    version: str

    spoolman_detail: str | None = Field(default=None, description="Hinweis bei Störung")
    cups_detail: str | None = Field(default=None, description="Hinweis bei Störung")


class VersionResponse(BaseModel):
    """Ergebnis von ``GET /api/version``."""

    version: str
    app_env: str
