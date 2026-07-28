"""Kompatibler Import der Spoolman-Druckvorlagen ohne Browser-Druckcode."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Any

_TAG = re.compile(r"\{([a-zA-Z][\w.]*)\}")
_OPTIONAL = re.compile(r"\{([^{}]*\{[a-zA-Z][\w.]*\}[^{}]*)\}")

# Der Import bleibt absichtlich eine Übersetzung, keine Übernahme von
# Spoolmans React-Druckcode. Die Werte werden später ausschließlich durch den
# eigenen Renderer befüllt.
SPOOLMAN_TAG_MAP: dict[str, str] = {
    "id": "spool.id",
    "registered": "spool.registered",
    "first_used": "spool.first_used",
    "last_used": "spool.last_used",
    "price": "spool.price",
    "initial_weight": "spool.initial_weight",
    "spool_weight": "spool.spool_weight",
    "remaining_weight": "spool.remaining_weight",
    "used_weight": "spool.used_weight",
    "remaining_length": "spool.remaining_length",
    "used_length": "spool.used_length",
    "location": "spool.location",
    "lot_nr": "spool.lot_nr",
    "comment": "spool.comment",
    "archived": "spool.archived",
}


@dataclass(frozen=True)
class ImportedPreset:
    name: str
    content: str
    width_mm: float | None
    height_mm: float | None
    unknown_tags: tuple[str, ...]


def import_spoolman_preset(
    preset: dict[str, Any], known_tags: set[str] | None = None
) -> ImportedPreset:
    """Übersetzt Spoolmans Textsyntax in eine sichere, prüfbare Zwischenform.

    Die Zeichenformatierung bleibt bewusst Text: HTML entsteht erst im eigenen,
    sandboxed Renderer. Optionale Spoolman-Blöcke werden als Jinja-``if``
    übertragen; unbekannte Tags werden sichtbar gemeldet.
    """
    settings = preset.get("labelSettings", {})
    if not isinstance(settings, dict):
        settings = {}
    source = str(preset.get("template", ""))
    allowed = set(SPOOLMAN_TAG_MAP) | (known_tags or set())
    unknown = tuple(sorted({tag for tag in _TAG.findall(source) if tag not in allowed}))

    def optional(match: re.Match[str]) -> str:
        block = match.group(1)
        tag = _TAG.search(block)
        if tag is None:
            return block
        key = _to_jinja_name(tag.group(1))
        return f"{{% if {key} %}}{block}{{% endif %}}"

    # Spoolman-Presets sind Text. Literaltext wird vor der Umwandlung von Tags
    # escaped, damit ein Preset niemals HTML oder Script in die Vorschau
    # einschleusen kann. Die wenigen HTML-Elemente danach stammen nur von uns.
    content = html.escape(source)
    content = _OPTIONAL.sub(optional, content)
    content = _TAG.sub(_replace_tag(allowed), content)
    content = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", content)
    content = content.replace("\n", "<br>\n")
    return ImportedPreset(
        name=str(preset.get("name") or "Importierte Spoolman-Vorlage"),
        content=content,
        width_mm=_number(settings.get("labelWidth")),
        height_mm=_number(settings.get("labelHeight")),
        unknown_tags=unknown,
    )


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _replace_tag(allowed: set[str]) -> Any:
    def replace(match: re.Match[str]) -> str:
        tag = match.group(1)
        if tag not in allowed:
            return "?"
        return "{{ " + _to_jinja_name(tag) + " }}"

    return replace


def _to_jinja_name(tag: str) -> str:
    return SPOOLMAN_TAG_MAP.get(tag, tag)
