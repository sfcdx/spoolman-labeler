/**
 * Tests der Werte, die uns mit Spoolman kompatibel halten.
 *
 * Diese Datei prueft bewusst gegen **literale** Werte statt gegen die
 * exportierten Konstanten. Ein Test, der `COLOR_PRIMARY` importiert und dann
 * mit `COLOR_PRIMARY` vergleicht, ist tautologisch: Aendert jemand die
 * Konstante, aendert sich die Erwartung mit und der Test bleibt gruen.
 *
 * Genau das war hier der Fall — beide Werte liessen sich unbemerkt
 * veraendern, obwohl 34 Tests liefen.
 *
 * Die Werte stammen aus der Untersuchung des Spoolman-Quellcodes,
 * siehe `docs/ui-analysis.md` und ADR-004.
 */

import { describe, expect, it } from "vitest";

import { COLOR_MODE_STORAGE_KEY, COLOR_PRIMARY } from "./colorMode";

describe("Kompatibilitaet mit Spoolman", () => {
  it("verwendet Spoolmans Primaerfarbe #dc7734", () => {
    // Spoolman setzt genau einen Design-Token-Override. Weicht dieser Wert
    // ab, wirkt die Anwendung nicht mehr wie eine Erweiterung von Spoolman,
    // und antd leitet im Dark Mode eine andere Ableitung ab.
    expect(COLOR_PRIMARY).toBe("#dc7734");
  });

  it("speichert die Farbmodus-Vorliebe unter dem Schluessel colorMode", () => {
    // Denselben Schluessel nutzt Spoolman. Laufen beide Anwendungen unter
    // derselben Herkunft, teilen sie sich damit die Einstellung.
    expect(COLOR_MODE_STORAGE_KEY).toBe("colorMode");
  });

  it("gibt die Primaerfarbe als vollstaendigen Hex-Wert mit Raute an", () => {
    // antd erwartet einen parsebaren Farbwert. Ein fehlendes `#` faellt sonst
    // erst zur Laufzeit im Browser auf.
    expect(COLOR_PRIMARY).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
