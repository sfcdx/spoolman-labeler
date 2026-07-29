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
        "spool": spool,
        "filament": filament,
        "vendor": vendor,
        "qr_code": qr_data_uri,
    }
