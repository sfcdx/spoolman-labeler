# Projektstand und nächste Schritte

Stand: Juli 2026 · Branch `develop` · noch kein Release

Dieses Dokument beschreibt, wo das Projekt steht und womit weitergearbeitet
wird. Es wird bei jedem Phasenabschluss aktualisiert.

---

## Was fertig ist

### Phase 1 — Analyse (abgeschlossen, in `main`)

| Dokument | Inhalt |
| -------- | ------ |
| `docs/spoolman-api-analysis.md` | Spoolman-REST-API, aus dem Quellcode belegt |
| `docs/ui-analysis.md` | Weboberfläche, Design-Tokens, QR-Formate, Lizenz |
| `docs/printing-architecture.md` | CUPS-Varianten, PDF-Renderer, IPP-Status |
| `docs/architecture.md` | 14 Architekturentscheidungen mit Begründung |

### Phase 2 — Grundgerüst (abgeschlossen)

**Backend** (`backend/`) — 32 Tests, `ruff` und `mypy --strict` ohne Befund

- Konfiguration über Pydantic, Geheimnisse zusätzlich über `<NAME>_FILE`
- Strukturiertes Logging mit rekursivem Entfernen von Geheimnissen
- Datenmodell für alle sechs Tabellen, Alembic-Migration ohne Drift
- `GET /api/health` mit getrenntem Status je Komponente

**Frontend** (`frontend/`) — 37 Tests, Build und Lint grün

- React 19, TypeScript, Vite, Ant Design 5 ohne Refine
- Theme mit Light, Dark und Systemmodus, Spoolmans Primärfarbe `#dc7734`
- Sidebar-Layout mit Drawer auf Mobilgeräten, vier Platzhalterseiten
- Typisierter API-Client, Systemstatus im Footer

**Docker** (`Dockerfile`, `docker-compose.yml`, `docker/`)

- Multi-stage Build, Non-root, Healthcheck, `/data` persistent
- CUPS-Sidecar, Varianten über `COMPOSE_PROFILES` in der `.env` umschaltbar
- `python3-cups` und `uv` zusammengeführt, zur Bauzeit geprüft

---

## Was als Nächstes ansteht

### Sofort: das Container-Image bauen

Das ist die wichtigste offene Aufgabe. Das Image wurde **nie gebaut** — in der
Entwicklungsumgebung fehlte ein Docker-Daemon und die Debian-Spiegel waren
gesperrt. Geprüft sind nur Syntax und Auflösung der Compose-Datei.

```bash
docker compose build
docker compose up -d
curl http://localhost:7913/api/health
```

Erwartbare Stolpersteine: Paketnamen für WeasyPrint unter trixie, das
Zusammenspiel von `python3-cups` mit dem venv, Rechte auf `/data`.

### Phase 3 — Spoolman-Anbindung

Typisierter Client in `backend/app/services/spoolman/`. Die Fallstricke sind
aus der API-Analyse bekannt und als Aufgaben festgehalten:

- `extra`-Felder sind JSON-kodierte Strings, nicht Klartext
- `color_hex` immer ohne führende Raute senden
- Fehlende Schlüssel statt `null` erwarten (`exclude_none=True`)
- Zwei verschiedene Fehler-Body-Formen behandeln
- Filtersyntax: Komma trennt ODER, Anführungszeichen bedeuten exakt

### Phase 4 — Etikettenrenderer

WeasyPrint mit restriktivem `url_fetcher`, Jinja2-Sandbox, Standardvorlage
62 × 29 mm, QR-Code im Format `WEB+SPOOLMAN:S-{id}`.

### Phase 5 bis 8

CUPS-Anbindung, Hauptworkflow mit Idempotenz, Einstellungen und Historie,
Qualitätssicherung. Die Reihenfolge steht im Ausgangskonzept.

---

## Offene Punkte

Die vollständige Liste steht in [`architecture.md`](architecture.md),
Abschnitt 9. Die drei wichtigsten:

1. **Das Image wurde nie gebaut** — siehe oben.
2. **PPD-Name des Brother QL-800** ist eine Annahme und muss am Gerät geprüft
   werden.
3. **Die OpenAPI-Spezifikation von Spoolman** war nicht abrufbar. Die
   API-Analyse stammt aus dem Quellcode und sollte gegen eine laufende
   Instanz geprüft werden.

---

## Noch nicht eingerichtet

Diese Punkte brauchen Zugriff auf die Repository-Einstellungen:

- **Branch Protection** für `main` und `develop`: Pull Request erforderlich,
  Secret-Scan muss grün sein. Ohne das lässt sich die Absicherung umgehen.
- **CI-Workflows** für Lint, Typprüfung, Tests und Image-Build. Bisher gibt es
  nur den Secret-Scan.
- **GHCR-Veröffentlichung** beim Setzen eines Versions-Tags.

---

## Arbeitsweise

Branch-Modell, Commit-Konventionen und Release-Prozess stehen in
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

Zwei Gewohnheiten haben sich bewährt und sollten beibehalten werden:

**Grüne Tests beweisen nichts, solange sie nichts prüfen.** Bei jedem
Testpaket wurde ein Fehler absichtlich eingebaut, um zu sehen, ob er
auffällt. Im Frontend hat das eine echte Lücke aufgedeckt: Die Tests
verglichen eine Konstante mit sich selbst und konnten deshalb nie
fehlschlagen. Betroffen waren ausgerechnet die beiden Werte, die uns mit
Spoolman kompatibel halten.

**Nicht Verifiziertes wird als solches gekennzeichnet.** Ein Commit, der
etwas als geprüft ausgibt, das nur plausibel aussieht, kostet später mehr
Zeit, als er spart.
