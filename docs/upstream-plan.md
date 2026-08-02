# Weg zurück in Spoolman: Ablösung dieses Tools

**Stand:** 2. August 2026

Dieses Werkzeug existiert, weil Spoolman kein serverseitiges Drucken kann. Das
soll sich ändern: Die hier erarbeiteten Funktionen werden Spoolman selbst als
Pull Request angeboten. Geht das durch, wird dieses Repository überflüssig —
das ist ausdrücklich das Ziel und kein Unfall.

## Was bei der Analyse von Spoolmans aktuellem Stand herauskam

Spoolman hat sich seit ADR-001/ADR-004 deutlich weiterentwickelt. Drei Funde
haben den ursprünglichen Plan („unsere Features rüberkopieren") hinfällig
gemacht:

1. **Das Standard-Frontend ist inzwischen SvelteKit/Svelte 5**, nicht mehr
   React. Der React-Client liegt nur noch als Legacy-Fallback hinter
   `SPOOLMAN_LEGACY_CLIENT`. Unser React/Ant-Design-Frontend ist dorthin
   **nicht** übertragbar.
2. **Spoolman hat einen vollwertigen grafischen Etiketten-Designer**
   (Canvas/Konva, Element-Inspektor, Bogen- und Einzeletikettenmodus, Ränder,
   Safe-Zones, DPI, QR mit Logo, PNG-/ZIP-Export). Das ist unseren HTML/CSS-
   Vorlagen deutlich überlegen. Unser Vorlagensystem samt WeasyPrint wäre dort
   ein Rückschritt und wird bewusst **nicht** angeboten.
3. **Spoolmans „Spule hinzufügen"-Dialog kann bereits Stückzahlen** und legt N
   Spulen in einer Schleife an. Der von uns gebaute geführte Workflow ist dort
   also größtenteils schon vorhanden.

Was Spoolman tatsächlich fehlt, ist genau der Kern dieses Projekts: **Drucken
ohne Browser-Druckdialog**, Druckerverwaltung, und das Anlegen-und-sofort-
Drucken in einem Zug.

## Was upstream angeboten wird

- Ein minimaler IPP-Client (`spoolman/printing/ipp.py`) auf Basis von `httpx`.
  **Bewusst nicht `pycups`:** das ist eine C-Erweiterung gegen libcups und
  würde `libcups2-dev` samt Kompilierschritt in Spoolmans Docker-Build zwingen
  — für alle, auch für die Mehrheit, die nie vom Server druckt. Ergebnis: keine
  neue Python-Abhängigkeit, kein neues Systempaket, keine Dockerfile-Änderung.
- Druckerverwaltung (Tabelle, CRUD, Warteschlangen-Discovery, Erreichbarkeits-
  test) und ein Druck-Endpunkt.
- Druckereinstellungen und ein zusätzlicher Druck-Button in der Svelte-
  Oberfläche, beides nur sichtbar, wenn ein Drucker eingerichtet ist.
- „Anlegen und Etiketten drucken" im bestehenden Spulen-Dialog.

**Entscheidende Designentscheidung:** Das Etikett wird weiterhin im Browser vom
vorhandenen Designer gerastert (`renderLabelDataUrl`). Nur das Ziel des
fertigen Bildes ändert sich — statt `window.print()` geht es per POST an den
Server und von dort per IPP an den Drucker. Damit bleibt der Designer die
einzige Renderquelle; wir bauen ihn nirgends serverseitig nach und laufen ihm
auch nicht hinterher, wenn er weiterentwickelt wird.

## Migrationspfad, falls der PR angenommen wird

1. Spoolman-Instanz auf die Version aktualisieren, die das Feature enthält.
2. In Spoolmans Einstellungen unter „Drucker" den vorhandenen CUPS-Drucker
   suchen und übernehmen (dieselbe Warteschlange wie hier konfiguriert).
3. Etikettenvorlage in Spoolmans Designer nachbauen. **Achtung:** ein
   automatischer Import unserer HTML/CSS-Vorlagen in Spoolmans Canvas-Format
   ist nicht vorgesehen und auch nicht sinnvoll — die Formate sind
   grundverschieden. Bei einer Handvoll Vorlagen ist Nachbauen der ehrlichere
   Weg.
4. Prüfen, dass Anlegen und Drucken in Spoolman funktionieren.
5. Erst dann diesen Stack abschalten. Die Druckhistorie dieses Tools ist rein
   lokal und geht dabei verloren — sie wird von Spoolman nicht übernommen (dort
   gibt es bewusst keine Historientabelle, siehe unten).

## Bewusste Lücken gegenüber diesem Tool

Der Upstream-Vorschlag ist absichtlich schmaler als dieses Repository. Nicht
angeboten werden:

- **Druckhistorie mit Wiederholung.** Spoolmans Browserdruck führt auch keine;
  eine zusätzliche Tabelle wäre Ballast, der die Merge-Chancen senkt. Erfolg
  und Fehler werden pro Etikett direkt in der Oberfläche gemeldet.
- **Unser HTML/CSS-Vorlagensystem** samt WeasyPrint und Jinja-Sandbox — durch
  Spoolmans Designer ersetzt.
- **Die Idempotenzschlüssel-Mechanik** der Workflow-Läufe. In Spoolman ist das
  Anlegen ein direkter Aufruf ohne mehrstufigen Workflow.

## Wenn der PR nicht angenommen wird

Dann bleibt dieses Repository, was es ist: ein eigenständiges Tool neben
Spoolman, das über die REST-API spricht und Spoolman-Updates unangetastet
lässt. Es entsteht kein Schaden — außer der investierten Zeit — und keine
Notwendigkeit, irgendetwas zurückzubauen.
