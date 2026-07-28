"""Begrenzte, validierte Spoolman-Endpunkte für das Frontend."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.config import Settings, get_settings
from app.services.spoolman import FilamentCreate, SpoolCreate, SpoolmanClient, VendorCreate
from app.services.spoolman.client import SpoolmanRecord

router = APIRouter(prefix="/spoolman", tags=["spoolman"])


def get_client(settings: Settings = Depends(get_settings)) -> SpoolmanClient:
    return SpoolmanClient(settings)


@router.get("/vendors", response_model=list[SpoolmanRecord])
async def vendors(
    name: str | None = Query(default=None, max_length=64),
    client: SpoolmanClient = Depends(get_client),
) -> list[SpoolmanRecord]:
    return await client.vendors(name)


@router.get("/filaments", response_model=list[SpoolmanRecord])
async def filaments(
    name: str | None = Query(default=None, max_length=64),
    client: SpoolmanClient = Depends(get_client),
) -> list[SpoolmanRecord]:
    return await client.filaments(name)


@router.get("/print-presets")
async def print_presets(
    client: SpoolmanClient = Depends(get_client),
) -> list[dict[str, object]]:
    """Liefert importierbare Presets, ohne Spoolman-Daten zu verändern."""
    return await client.print_presets()


@router.post("/vendors", response_model=SpoolmanRecord)
async def create_vendor(
    value: VendorCreate, client: SpoolmanClient = Depends(get_client)
) -> SpoolmanRecord:
    return await client.create_vendor(value)


@router.post("/filaments", response_model=SpoolmanRecord)
async def create_filament(
    value: FilamentCreate, client: SpoolmanClient = Depends(get_client)
) -> SpoolmanRecord:
    return await client.create_filament(value)


@router.post("/spools", response_model=SpoolmanRecord)
async def create_spool(
    value: SpoolCreate, client: SpoolmanClient = Depends(get_client)
) -> SpoolmanRecord:
    return await client.create_spool(value)
