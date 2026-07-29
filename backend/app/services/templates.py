"""CRUD-Operationen und Seed fuer Etikettenvorlagen."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models.enums import OutputFormat, QrContentMode
from app.models.template import Template
from app.schemas.template import TemplateCreate, TemplateUpdate

#: Name der mitgelieferten Standardvorlage. Dient als Anker beim erneuten
#: Start, damit sie nicht bei jedem Hochfahren doppelt angelegt wird.
BUILTIN_TEMPLATE_NAME = "Standard 62x29 mm"

_BUILTIN_HTML = """\
<div class="label">
  <div class="info">
    <div class="title">{{ filament.name or filament.material or "Filament" }}</div>
    <div class="row">
      <span class="dot" style="background:#{{ filament.color_hex or 'cccccc' }};"></span>
      {{ filament.material or "" }}
    </div>
    {% if vendor.name %}<div class="row">{{ vendor.name }}</div>{% endif %}
    <div class="row">Spule #{{ spool.id }}</div>
    {% if spool.location %}<div class="row">{{ spool.location }}</div>{% endif %}
    {% if spool.lot_nr %}<div class="row small">Charge: {{ spool.lot_nr }}</div>{% endif %}
  </div>
  <img class="qr" src="{{ qr_code }}" alt="QR-Code">
</div>
"""

_BUILTIN_CSS = """\
* { box-sizing: border-box; }
body { margin: 0; font-family: sans-serif; }
.label {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 2mm;
  gap: 2mm;
}
.info { flex: 1; min-width: 0; overflow: hidden; }
.title {
  font-size: 4mm;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row {
  font-size: 3mm;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 1mm;
}
.row.small { font-size: 2.5mm; color: #444; }
.dot {
  display: inline-block;
  width: 2.5mm;
  height: 2.5mm;
  border-radius: 50%;
  border: 0.2mm solid #999;
  flex-shrink: 0;
}
.qr { width: 22mm; height: 22mm; flex-shrink: 0; }
"""


async def ensure_default_template(session: AsyncSession) -> None:
    """Legt die mitgelieferte Standardvorlage an, falls sie noch fehlt.

    Wird beim Anwendungsstart aufgerufen. Idempotent: ein zweiter Aufruf
    (z. B. nach einem Neustart) legt nichts erneut an.
    """
    existing = await session.scalar(select(Template).where(Template.name == BUILTIN_TEMPLATE_NAME))
    if existing is not None:
        return
    session.add(
        Template(
            name=BUILTIN_TEMPLATE_NAME,
            description="Mitgelieferte Standardvorlage für 62x29-mm-Endlosrollen.",
            html_content=_BUILTIN_HTML,
            css_content=_BUILTIN_CSS,
            width_mm=62.0,
            height_mm=29.0,
            dpi=300,
            output_format=OutputFormat.PDF,
            qr_content_mode=QrContentMode.SPOOLMAN_URI,
            is_default=True,
            is_builtin=True,
        )
    )
    await session.flush()


async def list_templates(session: AsyncSession) -> list[Template]:
    result = await session.scalars(select(Template).order_by(Template.name))
    return list(result)


async def get_template(session: AsyncSession, template_id: int) -> Template:
    template = await session.get(Template, template_id)
    if template is None:
        raise AppError(ErrorCode.TEMPLATE_NOT_FOUND)
    return template


async def get_default_template(session: AsyncSession) -> Template:
    """Loest die Vorlage auf, die ohne explizite Auswahl verwendet wird.

    Bevorzugt die als Standard markierte Vorlage; ohne eine solche die erste
    verfuegbare (nach Name sortiert) — die mitgelieferte Standardvorlage
    existiert immer (siehe ``ensure_default_template``), daher kann diese
    Funktion praktisch nie ins Leere laufen.
    """
    template = await session.scalar(select(Template).where(Template.is_default.is_(True)))
    if template is None:
        template = await session.scalar(select(Template).order_by(Template.name))
    if template is None:
        raise AppError(ErrorCode.TEMPLATE_NOT_FOUND, detail="Keine Vorlage vorhanden")
    return template


async def _clear_other_defaults(session: AsyncSession, exclude_id: int | None) -> None:
    others = await session.scalars(select(Template).where(Template.is_default.is_(True)))
    for other in others:
        if other.id != exclude_id:
            other.is_default = False


async def create_template(session: AsyncSession, data: TemplateCreate) -> Template:
    template = Template(**data.model_dump(), is_builtin=False)
    session.add(template)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise AppError(
            ErrorCode.VALIDATION_FAILED, detail="Eine Vorlage mit diesem Namen existiert bereits"
        ) from exc
    if template.is_default:
        await _clear_other_defaults(session, template.id)
    return template


async def update_template(
    session: AsyncSession, template_id: int, data: TemplateUpdate
) -> Template:
    template = await get_template(session, template_id)
    if template.is_builtin:
        raise AppError(
            ErrorCode.VALIDATION_FAILED,
            detail="Eingebaute Vorlagen können nicht geändert werden — bitte duplizieren",
        )
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(template, field, value)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise AppError(
            ErrorCode.VALIDATION_FAILED, detail="Eine Vorlage mit diesem Namen existiert bereits"
        ) from exc
    if changes.get("is_default"):
        await _clear_other_defaults(session, template.id)
    return template


async def delete_template(session: AsyncSession, template_id: int) -> None:
    template = await get_template(session, template_id)
    if template.is_builtin:
        raise AppError(
            ErrorCode.VALIDATION_FAILED, detail="Eingebaute Vorlagen können nicht gelöscht werden"
        )
    await session.delete(template)
    await session.flush()


async def duplicate_template(session: AsyncSession, template_id: int, new_name: str) -> Template:
    source = await get_template(session, template_id)
    copy = Template(
        name=new_name,
        description=source.description,
        html_content=source.html_content,
        css_content=source.css_content,
        width_mm=source.width_mm,
        height_mm=source.height_mm,
        dpi=source.dpi,
        output_format=source.output_format,
        qr_content_mode=source.qr_content_mode,
        is_default=False,
        is_builtin=False,
    )
    session.add(copy)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise AppError(
            ErrorCode.VALIDATION_FAILED, detail="Eine Vorlage mit diesem Namen existiert bereits"
        ) from exc
    return copy
