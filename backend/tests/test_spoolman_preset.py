from app.services.rendering.spoolman_preset import import_spoolman_preset


def test_spoolman_preset_wird_kompatibel_uebersetzt() -> None:
    preset = {
        "name": "62x29",
        "template": "**{filament.name}**\n{Lot {lot_nr}}",
        "labelSettings": {"labelWidth": 62, "labelHeight": 29},
    }
    result = import_spoolman_preset(preset, {"filament.name", "lot_nr"})
    assert "{{ filament.name }}" in result.content
    assert "{% if spool.lot_nr %}Lot {{ spool.lot_nr }}{% endif %}" in result.content
    assert "<strong>{{ filament.name }}</strong>" in result.content
    assert "<br>" in result.content
    assert result.width_mm == 62
    assert result.height_mm == 29
    assert result.unknown_tags == ()


def test_spoolman_preset_escaped_literaltext_und_unbekannte_tags() -> None:
    result = import_spoolman_preset(
        {"template": "<script>x</script> {unbekannt} {id}"},
        set(),
    )

    assert "&lt;script&gt;x&lt;/script&gt;" in result.content
    assert "{{ spool.id }}" in result.content
    assert "{unbekannt}" not in result.content
    assert result.unknown_tags == ("unbekannt",)
