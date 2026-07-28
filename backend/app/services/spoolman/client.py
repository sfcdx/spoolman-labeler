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


class SpoolCreate(BaseModel):
    filament_id: int = Field(gt=0)
    initial_weight: float | None = Field(default=None, ge=0)
    spool_weight: float | None = Field(default=None, ge=0)
    used_weight: float | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=64)
    lot_nr: str | None = Field(default=None, max_length=64)
    comment: str | None = Field(default=None, max_length=1024)
    extra: dict[str, Any] = Field(default_factory=dict)


class SpoolmanRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int


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

    async def vendors(self, name: str | None = None) -> list[SpoolmanRecord]:
        return [
            SpoolmanRecord.model_validate(item)
            for item in await self._request(
                "GET", "/vendor", params={"name": name} if name else None
            )
        ]

    async def filaments(self, name: str | None = None) -> list[SpoolmanRecord]:
        return [
            SpoolmanRecord.model_validate(item)
            for item in await self._request(
                "GET", "/filament", params={"name": name} if name else None
            )
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

    async def create_spool(self, value: SpoolCreate) -> SpoolmanRecord:
        return SpoolmanRecord.model_validate(
            await self._request(
                "POST",
                "/spool",
                json_body=self._payload(value),
                error=ErrorCode.SPOOL_CREATE_FAILED,
            )
        )
