"""Getypter, bewusst schmaler Client für die offizielle Spoolman-REST-API."""

from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode


class VendorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    comment: str | None = Field(default=None, max_length=1024)
    extra: dict[str, Any] = Field(default_factory=dict)


class FilamentCreate(BaseModel):
    density: float = Field(gt=0)
    diameter: float = Field(gt=0)
    name: str | None = Field(default=None, max_length=64)
    vendor_id: int | None = None
    material: str | None = Field(default=None, max_length=64)
    color_hex: str | None = Field(default=None, pattern=r"^#?[0-9a-fA-F]{6,8}$")
    extra: dict[str, Any] = Field(default_factory=dict)


class SpoolFields(BaseModel):
    """Spulenfelder ohne ``filament_id``.

    Getrennt von :class:`SpoolCreate`, damit Aufrufer, die die Filament-ID
    nicht selbst kennen — etwa der Create-only-Workflow, der sie erst aus
    einem neu angelegten Filament erhält — keinen bedeutungslosen
    Platzhalterwert mitgeben müssen.
    """

    initial_weight: float | None = Field(default=None, ge=0)
    spool_weight: float | None = Field(default=None, ge=0)
    used_weight: float | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=64)
    lot_nr: str | None = Field(default=None, max_length=64)
    comment: str | None = Field(default=None, max_length=1024)
    extra: dict[str, Any] = Field(default_factory=dict)


class SpoolCreate(SpoolFields):
    filament_id: int = Field(gt=0)


class SpoolmanRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int


#: Spoolmans Filter-DSL fuer Textfelder (siehe docs/spoolman-api-analysis.md,
#: Abschnitt 4.3): Komma trennt mehrere ODER-verknuepfte Teilstrings, ein in
#: doppelte Anfuehrungszeichen gesetzter Teil erzwingt exakten statt
#: Teilstring-Vergleich. Freitext aus einem Suchfeld soll immer als ein
#: einziger Teilstring gesucht werden — beide Zeichen werden deshalb entfernt.
def _sanitize_text_filter(value: str) -> str:
    return value.replace(",", " ").replace('"', "").strip()


#: Standard- und Maximalwert fuer ``limit`` bei Listen-/Suchanfragen — ohne
#: Begrenzung koennte eine Spoolman-Instanz mit einer sehr grossen
#: Filament-Datenbank (mehrere hundert Eintraege durch die externe
#: Hersteller-Datenbank) eine unbegrenzt grosse Antwort liefern.
DEFAULT_LIST_LIMIT = 50
MAX_LIST_LIMIT = 200


class SpoolmanClient:
    def __init__(self, settings: Settings) -> None:
        self.base_url = settings.spoolman_api_base
        self.timeout = settings.spoolman_timeout_seconds

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        error: ErrorCode = ErrorCode.SPOOLMAN_UNREACHABLE,
    ) -> Any:
        try:
            async with httpx.AsyncClient(timeout=self.timeout, trust_env=False) as client:
                response = await client.request(
                    method, f"{self.base_url}{path}", json=json_body, params=params
                )
        except httpx.TimeoutException as exc:
            raise AppError(ErrorCode.SPOOLMAN_UNREACHABLE, detail="Zeitüberschreitung") from exc
        except httpx.HTTPError as exc:
            raise AppError(ErrorCode.SPOOLMAN_UNREACHABLE) from exc
        if response.is_error:
            try:
                detail = response.json().get("message") or response.json().get("detail")
            except (ValueError, AttributeError):
                detail = None
            raise AppError(
                ErrorCode.SPOOLMAN_VALIDATION_FAILED if response.status_code < 500 else error,
                detail=str(detail) if detail else None,
            )
        return response.json()

    @staticmethod
    def _payload(model: BaseModel) -> dict[str, Any]:
        payload = model.model_dump(exclude_none=True)
        if "color_hex" in payload:
            payload["color_hex"] = payload["color_hex"].lstrip("#")
        if payload.get("extra") == {}:
            payload.pop("extra", None)
        elif "extra" in payload:
            payload["extra"] = {key: json.dumps(value) for key, value in payload["extra"].items()}
        return payload

    async def vendors(
        self, name: str | None = None, limit: int = DEFAULT_LIST_LIMIT
    ) -> list[SpoolmanRecord]:
        params: dict[str, Any] = {"limit": min(limit, MAX_LIST_LIMIT)}
        if name:
            params["name"] = _sanitize_text_filter(name)
        return [
            SpoolmanRecord.model_validate(item)
            for item in await self._request("GET", "/vendor", params=params)
        ]

    async def filaments(
        self, name: str | None = None, limit: int = DEFAULT_LIST_LIMIT
    ) -> list[SpoolmanRecord]:
        params: dict[str, Any] = {"limit": min(limit, MAX_LIST_LIMIT)}
        if name:
            params["name"] = _sanitize_text_filter(name)
        return [
            SpoolmanRecord.model_validate(item)
            for item in await self._request("GET", "/filament", params=params)
        ]

    async def search_spools(
        self, query: str | None = None, limit: int = DEFAULT_LIST_LIMIT
    ) -> list[SpoolmanRecord]:
        """Sucht bestehende (nicht archivierte) Spulen fuer den Direktdruck-Pfad.

        Spoolmans Query-Parameter sind untereinander UND-verknuepft — eine
        einzelne Anfrage kann also nicht „Filamentname ODER Herstellername
        enthaelt X" ausdruecken. Bei einer Freitextsuche werden deshalb zwei
        Anfragen (Filamentname, Herstellername) gestellt und deren Treffer
        anhand der Spulen-ID dedupliziert.
        """
        capped_limit = min(limit, MAX_LIST_LIMIT)
        if not query:
            items = await self._request(
                "GET",
                "/spool",
                params={
                    "limit": capped_limit,
                    "sort": "filament.vendor.name:asc,filament.name:asc",
                },
            )
            return [SpoolmanRecord.model_validate(item) for item in items]

        sanitized = _sanitize_text_filter(query)
        by_filament, by_vendor = (
            await self._request(
                "GET", "/spool", params={"limit": capped_limit, "filament.name": sanitized}
            ),
            await self._request(
                "GET", "/spool", params={"limit": capped_limit, "filament.vendor.name": sanitized}
            ),
        )
        merged: dict[int, dict[str, Any]] = {}
        for item in [*by_filament, *by_vendor]:
            merged[item["id"]] = item
        return [
            SpoolmanRecord.model_validate(item) for item in list(merged.values())[:capped_limit]
        ]

    async def print_presets(self) -> list[dict[str, Any]]:
        """Liest Spoolmans serverseitig gespeicherte Druck-Presets.

        Die Spoolman-API liefert den Setting-Wert versionsabhängig als
        JSON-kodierten String oder bereits als Liste. Beides ist kompatibel;
        alles andere wird bewusst nicht als Vorlage weiterverarbeitet.
        """
        response = await self._request("GET", "/setting/print_presets")
        value = response.get("value") if isinstance(response, dict) else None
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                raise AppError(
                    ErrorCode.SPOOLMAN_VALIDATION_FAILED,
                    detail="Druckvorlagen sind kein gültiges JSON",
                ) from exc
        if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
            raise AppError(
                ErrorCode.SPOOLMAN_VALIDATION_FAILED,
                detail="Druckvorlagen haben ein ungültiges Format",
            )
        return value

    async def create_vendor(self, value: VendorCreate) -> SpoolmanRecord:
        return SpoolmanRecord.model_validate(
            await self._request(
                "POST",
                "/vendor",
                json_body=self._payload(value),
                error=ErrorCode.VENDOR_CREATE_FAILED,
            )
        )

    async def create_filament(self, value: FilamentCreate) -> SpoolmanRecord:
        return SpoolmanRecord.model_validate(
            await self._request(
                "POST",
                "/filament",
                json_body=self._payload(value),
                error=ErrorCode.FILAMENT_CREATE_FAILED,
            )
        )

    async def get_spool(self, spool_id: int) -> SpoolmanRecord:
        """Laedt eine Spule mit vollstaendig verschachteltem Filament/Hersteller.

        Wird fuer den erneuten Druck gebraucht: Der Etiketteninhalt soll den
        aktuellen Stand zeigen, nicht die Werte zum Zeitpunkt des ersten
        Drucks (siehe ``retry_print_job`` in ``app/services/print_jobs.py``).
        """
        return SpoolmanRecord.model_validate(
            await self._request("GET", f"/spool/{spool_id}", error=ErrorCode.SPOOL_FETCH_FAILED)
        )

    async def create_spool(self, value: SpoolCreate) -> SpoolmanRecord:
        return SpoolmanRecord.model_validate(
            await self._request(
                "POST",
                "/spool",
                json_body=self._payload(value),
                error=ErrorCode.SPOOL_CREATE_FAILED,
            )
        )
