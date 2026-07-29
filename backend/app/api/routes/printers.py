"""Endpunkte fuer Druckerprofile."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.schemas.printer import (
    PrinterCreate,
    PrinterRead,
    PrinterTestResult,
    PrinterUpdate,
)
from app.services import printers as printers_service
from app.services.printing.cups_client import probe_printer

router = APIRouter(prefix="/printers", tags=["printers"])


@router.get("", response_model=list[PrinterRead])
async def list_printers(session: AsyncSession = Depends(get_session)) -> list[PrinterRead]:
    return [
        PrinterRead.model_validate(printer)
        for printer in await printers_service.list_printers(session)
    ]


@router.post("", response_model=PrinterRead, status_code=201)
async def create_printer(
    data: PrinterCreate, session: AsyncSession = Depends(get_session)
) -> PrinterRead:
    printer = await printers_service.create_printer(session, data)
    return PrinterRead.model_validate(printer)


@router.get("/{printer_id}", response_model=PrinterRead)
async def get_printer(printer_id: int, session: AsyncSession = Depends(get_session)) -> PrinterRead:
    return PrinterRead.model_validate(await printers_service.get_printer(session, printer_id))


@router.patch("/{printer_id}", response_model=PrinterRead)
async def update_printer(
    printer_id: int, data: PrinterUpdate, session: AsyncSession = Depends(get_session)
) -> PrinterRead:
    printer = await printers_service.update_printer(session, printer_id, data)
    return PrinterRead.model_validate(printer)


@router.delete("/{printer_id}", status_code=204)
async def delete_printer(printer_id: int, session: AsyncSession = Depends(get_session)) -> None:
    await printers_service.delete_printer(session, printer_id)


@router.post("/{printer_id}/test", response_model=PrinterTestResult)
async def test_printer(
    printer_id: int,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> PrinterTestResult:
    """Prueft die Erreichbarkeit der Warteschlange.

    Ein nicht erreichbarer Drucker ist ein gueltiges Testergebnis, kein
    Fehler des Endpunkts selbst — die Antwort bleibt daher immer HTTP 200.
    """
    printer = await printers_service.get_printer(session, printer_id)
    status, detail = await probe_printer(printer=printer, settings=settings)
    return PrinterTestResult(status=status.value, detail=detail)
