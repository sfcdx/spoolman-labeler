"""CRUD-Operationen fuer Druckerprofile."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models.printer import Printer
from app.schemas.printer import PrinterCreate, PrinterUpdate


async def list_printers(session: AsyncSession) -> list[Printer]:
    result = await session.scalars(select(Printer).order_by(Printer.name))
    return list(result)


async def get_printer(session: AsyncSession, printer_id: int) -> Printer:
    printer = await session.get(Printer, printer_id)
    if printer is None:
        raise AppError(ErrorCode.PRINTER_NOT_FOUND)
    return printer


async def get_default_printer(session: AsyncSession) -> Printer:
    """Loest den Drucker auf, der ohne explizite Auswahl verwendet wird.

    Bevorzugt den als Standard markierten, aktivierten Drucker; ohne einen
    solchen den ersten aktivierten Drucker (nach Name sortiert). Ermoeglicht
    einen verkuerzten Workflow ('viel presetten -> kuerzere Workflows'), bei
    dem Drucker/Vorlage nicht bei jedem Druck erneut ausgewaehlt werden
    muessen.
    """
    printer = await session.scalar(
        select(Printer).where(Printer.is_default.is_(True), Printer.is_enabled.is_(True))
    )
    if printer is None:
        printer = await session.scalar(
            select(Printer).where(Printer.is_enabled.is_(True)).order_by(Printer.name)
        )
    if printer is None:
        raise AppError(
            ErrorCode.PRINTER_NOT_FOUND,
            detail="Kein aktivierter Drucker vorhanden — bitte in den Einstellungen anlegen",
        )
    return printer


async def _clear_other_defaults(session: AsyncSession, exclude_id: int | None) -> None:
    others = await session.scalars(select(Printer).where(Printer.is_default.is_(True)))
    for other in others:
        if other.id != exclude_id:
            other.is_default = False


async def create_printer(session: AsyncSession, data: PrinterCreate) -> Printer:
    printer = Printer(**data.model_dump())
    session.add(printer)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise AppError(
            ErrorCode.VALIDATION_FAILED, detail="Warteschlangenname bereits vergeben"
        ) from exc
    if printer.is_default:
        await _clear_other_defaults(session, printer.id)
    return printer


async def update_printer(session: AsyncSession, printer_id: int, data: PrinterUpdate) -> Printer:
    printer = await get_printer(session, printer_id)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(printer, field, value)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise AppError(
            ErrorCode.VALIDATION_FAILED, detail="Warteschlangenname bereits vergeben"
        ) from exc
    if changes.get("is_default"):
        await _clear_other_defaults(session, printer.id)
    return printer


async def delete_printer(session: AsyncSession, printer_id: int) -> None:
    printer = await get_printer(session, printer_id)
    await session.delete(printer)
    await session.flush()
