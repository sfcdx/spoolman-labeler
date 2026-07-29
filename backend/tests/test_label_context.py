"""Tests fuer build_label_context — insbesondere fehlende Spoolman-Felder.

Spoolman laesst Felder mit dem Wert ``null`` in JSON-Antworten komplett weg
(``exclude_none=True``, siehe docs/spoolman-api-analysis.md). Ohne
Vorbelegung dieser Felder wuerde die Jinja-Sandbox (``StrictUndefined``)
beim Rendern eines ganz normalen, aber nur teilweise befuellten
Spoolman-Datensatzes abbrechen.
"""

from __future__ import annotations

from app.core.config import Settings
from app.services.rendering.label_context import build_label_context
from app.services.rendering.pdf_renderer import LabelRenderer
from app.services.templates import _BUILTIN_CSS, _BUILTIN_HTML


def test_fehlende_felder_werden_zu_none_statt_undefined() -> None:
    context = build_label_context({"id": 1, "filament": {"vendor": {"name": "ACME"}}}, "data:x")

    assert context["spool"]["location"] is None
    assert context["filament"]["name"] is None
    assert context["filament"]["color_hex"] is None
    assert context["vendor"]["name"] == "ACME"


def test_ganz_ohne_filament_und_vendor_bleibt_es_definiert() -> None:
    context = build_label_context({"id": 1}, "data:x")

    assert context["filament"]["name"] is None
    assert context["vendor"]["name"] is None


async def test_builtin_vorlage_rendert_minimalen_spoolman_datensatz(settings: Settings) -> None:
    """Regressionstest: ein Spoolman-Datensatz mit nur wenigen Feldern (so wie
    er in der Praxis ankommt, weil Spoolman null-Felder auslaesst) darf die
    mitgelieferte Standardvorlage nicht zum Absturz bringen.
    """
    renderer = LabelRenderer(settings)
    context = build_label_context(
        {"id": 42, "filament": {"material": "PLA", "color_hex": "1E88E5"}}, "data:x"
    )

    rendered = await renderer.render_pdf(
        html_content=_BUILTIN_HTML,
        css_content=_BUILTIN_CSS,
        width_mm=62,
        height_mm=29,
        context=context,
    )

    assert rendered.startswith(b"%PDF")
