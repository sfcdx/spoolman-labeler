"""Endpunkte fuer Etikettenvorlagen."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.schemas.template import (
    TemplateCreate,
    TemplateDuplicateRequest,
    TemplateImportRequest,
    TemplateImportResponse,
    TemplatePreviewRequest,
    TemplateRead,
    TemplateUpdate,
)
from app.services import templates as templates_service
from app.services.rendering import LabelRenderer
from app.services.rendering.label_context import SAMPLE_SPOOL, build_label_context
from app.services.rendering.spoolman_preset import import_spoolman_preset

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateRead])
async def list_templates(session: AsyncSession = Depends(get_session)) -> list[TemplateRead]:
    return [
        TemplateRead.model_validate(template)
        for template in await templates_service.list_templates(session)
    ]


@router.post("", response_model=TemplateRead, status_code=201)
async def create_template(
    data: TemplateCreate, session: AsyncSession = Depends(get_session)
) -> TemplateRead:
    template = await templates_service.create_template(session, data)
    return TemplateRead.model_validate(template)


@router.get("/{template_id}", response_model=TemplateRead)
async def get_template(
    template_id: int, session: AsyncSession = Depends(get_session)
) -> TemplateRead:
    return TemplateRead.model_validate(await templates_service.get_template(session, template_id))


@router.patch("/{template_id}", response_model=TemplateRead)
async def update_template(
    template_id: int, data: TemplateUpdate, session: AsyncSession = Depends(get_session)
) -> TemplateRead:
    template = await templates_service.update_template(session, template_id, data)
    return TemplateRead.model_validate(template)


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: int, session: AsyncSession = Depends(get_session)) -> None:
    await templates_service.delete_template(session, template_id)


@router.post("/{template_id}/duplicate", response_model=TemplateRead, status_code=201)
async def duplicate_template(
    template_id: int, data: TemplateDuplicateRequest, session: AsyncSession = Depends(get_session)
) -> TemplateRead:
    template = await templates_service.duplicate_template(session, template_id, data.name)
    return TemplateRead.model_validate(template)


@router.post("/import-spoolman", response_model=TemplateImportResponse, status_code=201)
async def import_spoolman_template(
    data: TemplateImportRequest, session: AsyncSession = Depends(get_session)
) -> TemplateImportResponse:
    """Uebersetzt ein Spoolman-Textpreset in eine eigene Vorlage.

    Der Import ist eine Uebersetzung, keine Uebernahme von Spoolmans
    Druckcode (siehe services/rendering/spoolman_preset.py). Unbekannte Tags
    werden im Ergebnis sichtbar gemeldet statt still verworfen.
    """
    imported = import_spoolman_preset(data.preset)
    template = await templates_service.create_template(
        session,
        TemplateCreate(
            name=data.name or imported.name,
            description="Importiert aus einem Spoolman-Preset.",
            html_content=imported.content,
            css_content="body { margin: 0; font-family: sans-serif; font-size: 3mm; }",
            width_mm=imported.width_mm or 62.0,
            height_mm=imported.height_mm or 29.0,
        ),
    )
    return TemplateImportResponse(
        template=TemplateRead.model_validate(template), unknown_tags=list(imported.unknown_tags)
    )


@router.post("/preview", status_code=200)
async def preview_template(
    data: TemplatePreviewRequest, settings: Settings = Depends(get_settings)
) -> Response:
    """Rendert eine (noch nicht gespeicherte) Vorlage mit Beispieldaten."""
    renderer = LabelRenderer(settings)
    context = build_label_context(SAMPLE_SPOOL, renderer.qr_data_uri(SAMPLE_SPOOL["id"]))
    pdf_bytes = renderer.render_pdf(
        html_content=data.html_content,
        css_content=data.css_content,
        width_mm=data.width_mm,
        height_mm=data.height_mm,
        context=context,
    )
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/{template_id}/preview", status_code=200)
async def preview_saved_template(
    template_id: int,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Rendert eine bereits gespeicherte Vorlage mit Beispieldaten."""
    template = await templates_service.get_template(session, template_id)
    renderer = LabelRenderer(settings)
    context = build_label_context(SAMPLE_SPOOL, renderer.qr_data_uri(SAMPLE_SPOOL["id"]))
    pdf_bytes = renderer.render_pdf(
        html_content=template.html_content,
        css_content=template.css_content,
        width_mm=template.width_mm,
        height_mm=template.height_mm,
        context=context,
    )
    return Response(content=pdf_bytes, media_type="application/pdf")
