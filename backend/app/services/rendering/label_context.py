"""Gemeinsamer Jinja-Kontext fuer echte und Vorschau-Etiketten.

Die Feldnamen unter ``spool`` folgen bewusst ``SPOOLMAN_TAG_MAP``
(``spoolman_preset.py``), damit importierte Spoolman-Vorlagen ohne Anpassung
funktionieren. ``filament`` und ``vendor`` stehen zusaetzlich zur Verfuegung,
weil Spoolmans eigene Vorlagen sie nicht kennen, eigene Vorlagen aber oft
Material und Hersteller anzeigen wollen.
"""

from __future__ import annotations

from typing import Any

#: Realistische, klar als Beispiel erkennbare Werte fuer die Vorlagenvorschau.
#: Enthaelt bewusst keine echten Namen oder Adressen.
SAMPLE_SPOOL: dict[str, Any] = {
    "id": 1,
    "registered": "2026-01-01T10:00:00Z",
    "first_used": None,
    "last_used": None,
    "price": 19.99,
    "initial_weight": 1000.0,
    "spool_weight": 200.0,
    "remaining_weight": 750.0,
    "used_weight": 250.0,
    "remaining_length": 300000.0,
    "used_length": 100000.0,
    "location": "Regal A2",
    "lot_nr": "LOT-2026-001",
    "comment": "Beispieldaten für die Vorschau",
    "archived": False,
    "filament": {
        "id": 1,
        "name": "PLA Beispiel",
        "material": "PLA",
        "color_hex": "1E88E5",
        "vendor": {"id": 1, "name": "Beispielhersteller"},
    },
}


#: Spoolman laesst Felder mit dem Wert ``null`` in JSON-Antworten komplett
#: weg (``exclude_none=True``, siehe docs/spoolman-api-analysis.md Abschnitt
#: 3.1/4.1/5.1) statt sie als ``null`` zu senden. Ohne diese Vorbelegung wuerde
#: z. B. ``{{ filament.name or filament.material }}`` in der Jinja-Sandbox
#: (``StrictUndefined``) nicht auf den Fallback zurueckfallen, sondern mit
#: einem ``UndefinedError`` abbrechen, sobald Spoolman ein einziges
#: null-Feld ausgelassen hat — was im Normalbetrieb staendig vorkommt.
_SPOOL_DEFAULTS: dict[str, Any] = {
    "first_used": None,
    "last_used": None,
    "price": None,
    "initial_weight": None,
    "spool_weight": None,
    "remaining_weight": None,
    "remaining_length": None,
    "location": None,
    "lot_nr": None,
    "comment": None,
    "extra": {},
}
_FILAMENT_DEFAULTS: dict[str, Any] = {
    "id": None,
    "name": None,
    "material": None,
    "price": None,
    "weight": None,
    "spool_weight": None,
    "article_number": None,
    "comment": None,
    "settings_extruder_temp": None,
    "settings_bed_temp": None,
    "color_hex": None,
    "multi_color_hexes": None,
    "multi_color_direction": None,
    "external_id": None,
    "extra": {},
}
_VENDOR_DEFAULTS: dict[str, Any] = {
    "id": None,
    "name": None,
    "comment": None,
    "empty_spool_weight": None,
    "external_id": None,
    "extra": {},
}


def build_label_context(spool: dict[str, Any], qr_data_uri: str) -> dict[str, Any]:
    """Baut den Render-Kontext aus einem Spoolman-Spulen-Datensatz.

    ``spool`` ist bewusst das rohe, von Spoolman gelieferte Dict — Jinja loest
    ``spool.location`` sowohl fuer Objekte als auch fuer Dicts auf.
    """
    filament = spool.get("filament")
    filament = filament if isinstance(filament, dict) else {}
    vendor = filament.get("vendor")
    vendor = vendor if isinstance(vendor, dict) else {}
    return {
        "spool": {**_SPOOL_DEFAULTS, **spool},
        "filament": {**_FILAMENT_DEFAULTS, **filament},
        "vendor": {**_VENDOR_DEFAULTS, **vendor},
        "qr_code": qr_data_uri,
    }
