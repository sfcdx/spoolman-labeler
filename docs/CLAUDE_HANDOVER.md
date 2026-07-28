# Übergabe an Claude Code – Spoolman Labeler

Du übernimmst das Open-Source-Projekt **Spoolman Labeler**:
`https://github.com/sfcdx/spoolman-labeler`.

Es ist eine eigenständige Docker-Webanwendung neben Spoolman. Sie legt neue
Filamentspulen per REST-API an und soll anschließend serverseitig über CUPS ein
Etikett drucken – ohne Browser-Druckdialog.

## Verbindlicher Git-Stand

- **Arbeitsbranch:** `fix/docker-first-build`
- **Draft-PR nach `develop`:** https://github.com/sfcdx/spoolman-labeler/pull/3
- Der Branch ist beim Übergabezeitpunkt **31 Commits vor `develop`** und nicht
  hinter `develop`.
- `main` und `develop` enthalten nur die Analysephase bzw. das zusammengeführte
  Projektgrundgerüst. Niemals direkt nach `main` pushen.
- Die folgenden lokalen Dateien wurden beim Übergabestichtag **inhaltlich
  bytegleich** gegen den GitHub-Branch `fix/docker-first-build` verglichen:
  alle unten genannten neuen und geänderten Dateien.

Der lokale Checkout kann uncommittete Änderungen anzeigen, weil Änderungen in
dieser Umgebung über die GitHub-Contents-API hochgeladen wurden. Für den
tatsächlichen, vollständigen Stand ist der obige GitHub-Branch maßgeblich.

## Zuerst lesen

1. `docs/status.md` – aktueller Status
2. `docs/launch-plan.md` – vollständiger Launch-Plan und Abnahmekriterien
3. `docs/architecture.md` – verbindliche ADRs
4. `CONTRIBUTING.md` – Branch- und Commit-Regeln
5. Bei Detailfragen: `docs/spoolman-api-analysis.md`, `docs/ui-analysis.md`,
   `docs/printing-architecture.md`, `docs/deployment.md`

## Bereits implementiert und lokal verifiziert

### Grundgerüst und Docker-Konfiguration

- FastAPI, SQLAlchemy 2, Alembic, SQLite, React 19, TypeScript, Vite und
  Ant Design sind vorhanden.
- Compose-Variablennamen wurden an `Settings` angeglichen (`LOG_LEVEL`,
  `SPOOLMAN_API_URL`, `CUPS_PORT`, `CUPS_USERNAME`, `CUPS_USE_TLS`,
  `DEFAULT_DPI`, `MAX_PRINT_RETRIES`, `MAX_TEMPLATE_UPLOAD_BYTES` usw.).
- Der Dockerfile-Pfad für `frontend/package-lock.json` wurde korrigiert.
- Healthcheck verwendet beim Zugriff auf den internen Spoolman-Dienst bewusst
  `trust_env=False`, damit Prozess-Proxies ihn nicht fehlleiten.
- Neu bzw. geändert: `.env.example`, `docker-compose.yml`, `Dockerfile`,
  `backend/app/core/config.py`, `backend/tests/test_config.py`, Migration und
  relevante Dokumentation.

### Spoolman-Client und API

- `backend/app/services/spoolman/client.py`
  - getypter HTTPX-Client für Vendor, Filament, Spool und `print_presets`
  - HTTPX ohne Umgebungs-Proxy
  - `color_hex` ohne `#`
  - `extra` als JSON-kodierte Strings
  - Fehlerformate `message` / FastAPI-`detail` werden in `AppError` übersetzt
  - `print_presets` akzeptiert den Setting-Wert sowohl JSON-kodiert als auch
    bereits als Liste
- `backend/app/api/routes/spoolman.py`
  - Listen/Anlegen von Vendor, Filament, Spool
  - `GET /api/spoolman/print-presets`
- Der Router bindet die neuen Endpunkte ein.

### Create-only-Workflow

- `backend/app/services/workflows/create_only.py`
- `POST /api/workflows/create-only`
- Idempotenzschlüssel, Mengenlimit und genau-eins-Validierung für bestehendes
  oder neues Filament.
- Wichtig: Bei einem Fehler nach teilweise angelegten Spulen wird der Lauf als
  `failed`, mit bereits angelegten Spulen-IDs, **persistiert**. Es wird kein
  Exception-Rollback ausgelöst, der diese Historie verlieren würde.
- Technische Ausnahmeinhalte werden nicht an die API bzw. in die sichtbare
  Fehlermeldung übernommen.

### Spoolman-Preset-Migration

- `backend/app/services/rendering/spoolman_preset.py`
- Entscheidung: Spoolmans `print_presets` sind **Importquelle**, nicht
  führender Datenspeicher. Übernommen wird nur dessen Textsyntax, nicht
  `react-to-print`, Grid- oder Browser-Druckcode.
- Unterstützt: `{tag}`, optionale Blöcke und `**fett**`.
- Literaltext wird HTML-escaped; unbekannte Tags werden gemeldet und nicht als
  Jinja-Ausdruck ausgeführt.
- Standard-Spoolfelder werden auf den stabilen Labeler-Kontext `spool.*`
  abgebildet. Dynamische Extra-Felder brauchen noch eine saubere
  Kontext-/UI-Strategie.

### PDF-Renderer

- `backend/app/services/rendering/pdf_renderer.py`
- `LabelRenderer` verwendet Jinja2 `SandboxedEnvironment` mit
  `StrictUndefined`, physische mm-Seitengrößen und WeasyPrint.
- Der URL-Fetcher lässt nur `data:`-URIs und `file:`-Ressourcen unter
  `APP_ASSET_DIR` zu; HTTP(S) und Pfadausbrüche werden geblockt.
- QR-Code wird als SVG-Data-URI mit dem verbindlichen Standard
  `WEB+SPOOLMAN:S-{id}` erzeugt.
- Der Renderer ist noch nicht über Template-CRUD, Druckjobs oder das Frontend
  aufrufbar; das ist die nächste fachliche Integration.

## Nachweislich bestandene Prüfungen

Im Backend:

```bash
cd backend
.venv/bin/python -m pytest        # 47 bestanden
.venv/bin/python -m ruff check .  # bestanden
.venv/bin/python -m mypy app      # bestanden
```

Im Frontend:

```bash
cd frontend
npm test -- --run  # 37 bestanden
npm run lint       # bestanden
npm run build      # bestanden
```

Der Vite-Build meldet lediglich die bekannte Chunk-Größenwarnung (~1,17 MB),
kein Buildfehler.

## Noch nicht verifiziert – nicht als erledigt behaupten

In der bisherigen Umgebung existiert **kein Docker-Daemon**. Daher wurden
folgende Pflichtchecks noch nie real durchgeführt:

```bash
cp .env.example .env
docker compose build
docker compose up -d
curl --fail http://localhost:7913/api/health
docker compose logs --no-color labeler cups
```

Auf einem Docker-Host müssen insbesondere geprüft und bei Bedarf repariert
werden:

1. Debian-trixie-Paketnamen und WeasyPrint-Runtime-Abhängigkeiten.
2. `python3-cups` im uv-venv mit Python 3.13.
3. Rechte des `/data`-Volumes für UID/GID `10001`.
4. Compose-Profile und der CUPS-Sidecar-Start.
5. Healthcheck gegen echten Spoolman- und CUPS-Dienst.

Dieses Gate ist vor einem Merge nach `main` zwingend.

## Nächste Implementierungsreihenfolge

1. **Docker-Realtest zuerst**, falls ein Docker-Host verfügbar ist. Ergebnis
   ehrlich in `docs/status.md` und Architekturabschnitt 9 dokumentieren.
2. **Template- und Druckerprofile:** CRUD-API für die bestehenden Tabellen
   `templates` und `printers`; validiere Größen, DPI, unbekannte Felder und
   sichere Importgrößen.
3. **Preset-Import integrieren:** Presets über den vorhandenen API-Endpunkt
   anzeigen, Importvorschau mit unbekannten Tags, explizite Bestätigung und
   Speicherung als eigene Labeler-Vorlage.
4. **CUPS-Backend:** keinen Shell-Aufruf bauen. pycups in
   `anyio.to_thread.run_sync`, Queue vor Nutzung validieren, PDF übermitteln,
   IPP-Status pollen, `PrintJob` und Fehlerhistorie führen.
5. **Create-and-print-Workflow:** Erst Spoolman anlegen, dann PDF und CUPS.
   Bei Druckfehler muss der Lauf `partial` werden – die Spulen dürfen niemals
   erneut angelegt oder weggerollt werden.
6. **Frontend:** Hauptworkflow, Einstellungen, Vorlagen-/Druckerpflege,
   Druckhistorie und Fehler-/Partial-Zustände. Design an Spoolman anlehnen.
7. Nach jeder Einheit alle Backend- und Frontend-Prüfungen ausführen. Einen
   absichtlich eingebauten Fehler verwenden, um neue Tests wirklich zu
   validieren.

## Nicht verletzen

- Dokumentation, Kommentare und Commit-Nachrichten auf Deutsch; Codebezeichner
  auf Englisch; Conventional Commits.
- Keine personenbezogenen Daten, realen Hostnamen, IPs oder Zugangsdaten im
  Repository. Platzhalter: `192.0.2.x`, `example.local`, `SERVER-IP`.
- Spoolman hat derzeit keine Authentifizierung: kein API-Key-UI bauen.
- Spool-Create braucht mindestens `filament_id`; `extra` ist JSON-kodierter
  String; `color_hex` ohne Raute.
- Fehlende Spoolman-Felder sind fehlend, nicht `null`.
- CUPS-Erfolg bedeutet nur „an das Gerät übergeben“, nie einen garantierten
  physischen Ausdruck.
- QR-Default bleibt `WEB+SPOOLMAN:S-{id}`.
- Spoolman-Code nur bei tatsächlicher Übernahme mit MIT-Attribution in
  `THIRD_PARTY_LICENSES` verwenden. Der aktuelle Importer ist eigenständig.

## Vor jedem Commit

```bash
cd backend && .venv/bin/python -m pytest && .venv/bin/python -m ruff check . \\
  && .venv/bin/python -m mypy app
cd ../frontend && npm test -- --run && npm run lint && npm run build
```

Arbeite auf `fix/docker-first-build` weiter oder erstelle einen `feat/`-Branch
von diesem Stand. Den Draft-PR erst dann als review-ready markieren, wenn der
reale Docker-Start erfolgreich verifiziert ist.
