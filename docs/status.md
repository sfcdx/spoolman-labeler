# Projektstatus

**Letzte Aktualisierung:** 28. Juli 2026
**Arbeitsbranch:** `fix/docker-first-build` (Draft-PR #3 nach `develop`)

## Erledigt

- Phase 1: Spoolman-API, Oberfläche, Drucksystem und Architektur untersucht.
- Backend-Grundgerüst: FastAPI, SQLAlchemy 2, Alembic, SQLite, Healthcheck und
  strukturierte Fehlerbehandlung.
- Frontend-Grundgerüst: React, TypeScript, Vite, Ant Design, responsives Layout
  sowie System-, Hell- und Dunkelmodus.
- Docker-/Compose-Setup mit nicht privilegiertem Anwendungscontainer,
  optionalem Spoolman-Dienst und CUPS-Sidecar.
- Getypter Spoolman-Client mit Hersteller-, Filament-, Spulen- und
  `print_presets`-Zugriff; Eingaben und Spoolman-Fehler werden begrenzt bzw.
  in stabile Fehlercodes übersetzt.
- Create-only-Workflow mit Idempotenz und persistierter Fehlerspur für bereits
  in Spoolman angelegte Spulen.
- Kompatibler Import von Spoolman-Textpresets; er übernimmt ausdrücklich nicht
  dessen Browser-Druckcode und entschärft Literaltext beim Import.
- Serverseitiger PDF-Renderer: Jinja-Sandbox, physische Seitenmaße, QR-Code im
  Spoolman-Format und ein URL-Fetcher ohne Netzfreigabe (über WeasyPrints
  `URLFetcher`, nicht die deprecated `default_url_fetcher`-Funktion).
- **CI-Pipelines** (`.github/workflows/`): `backend-ci.yml` und
  `frontend-ci.yml` führen Lint, Typprüfung und Tests bei jedem Push und
  Pull Request aus. `docker-build.yml` baut das Anwendungsimage auf einem
  GitHub-Actions-Runner, startet den vollständigen Compose-Stack inklusive
  CUPS-Sidecar und prüft den Healthcheck inhaltlich.
- **USB-Passthrough als optionaler Override** (`docker-compose.usb.yml`):
  `devices: /dev/bus/usb` war zuvor fest in `docker-compose.yml` verdrahtet
  und ließ den `cups`-Dienst auf jedem Host ohne diesen Pfad hart scheitern —
  das betraf auch reine Netzwerkdrucker-Betreiber. Jetzt per `COMPOSE_FILE`
  in `.env` optional zuschaltbar, wie der bestehende Schalter für das eigene
  CUPS-Image.

## Verifiziert

| Prüfung | Ergebnis |
| --- | --- |
| Backend-Tests | 49 bestanden |
| Backend-Linting (Ruff) | bestanden |
| Backend-Typprüfung (mypy --strict) | bestanden |
| Frontend-Tests | 37 bestanden |
| Frontend-Linting (ESLint) | bestanden |
| Frontend-Produktionsbuild | bestanden |
| **Docker Build und Boot-Test (GitHub Actions)** | **bestanden** — run [30398489617](https://github.com/sfcdx/spoolman-labeler/actions/runs/30398489617) |

Der Docker-Realtest umfasst: `docker compose build`, vollständiger
Stack-Start mit `up -d --wait` (Spoolman + Labeler + CUPS-Sidecar, alle
Healthchecks grün), inhaltliche Prüfung von `GET /api/health`
(`status == "ok"`, nicht nur HTTP 200), Auslieferung des Frontends und
Bestätigung, dass der Anwendungscontainer nicht als root läuft.

Bei mehreren Testpaketen wurde zusätzlich ein Fehler absichtlich eingebaut,
um zu prüfen, ob er auffällt (Mutationstest) — u. a. beim `SpoolFields`-Fix,
der WeasyPrint-Pfadausbruch-Absicherung und dem QR-Format.

## Warum der Docker-Build nicht in der Entwicklungsumgebung selbst lief

In der Sandbox, in der Backend und Frontend entstanden sind, blieb ein
direkter Docker-Build unmöglich: Ein Docker-Daemon ließ sich zwar starten,
aber die Netzwerk-Policy der Umgebung blockiert den Layer-Download von den
CDN-Hosts, an die sowohl Docker Hub als auch GHCR umleiten
(`production.cloudfront.docker.com`, `pkg-containers.githubusercontent.com`)
— eine bewusste Policy-Denial, kein Bug. Die Verifikation läuft deshalb auf
GitHub-Actions-Runnern mit regulärem Internetzugang und ist dort bei jedem
Push wiederholbar, nicht nur einmalig von Hand geprüft.

## Nächste Schritte

1. `fix/docker-first-build` nach `develop` mergen (dieser Branch enthält
   `develop` vollständig, Fast-Forward möglich), danach nach `main` — beides
   erst, nachdem CI für den jeweiligen Zielstand grün ist.
2. Template- und Druckerprofile als CRUD-API und UI anbinden.
3. CUPS-Backend: `pycups` in `anyio.to_thread.run_sync`, Queue-Validierung,
   PDF-Übermittlung, IPP-Statusabfrage, `PrintJob`- und Fehlerhistorie.
4. Create-and-print-Workflow: erst Spoolman anlegen, dann PDF und CUPS-Druck.
   Ein Druckfehler darf die bereits angelegten Spulen niemals zurückrollen
   oder erneut anlegen — der Lauf wird `partial`.
5. Frontend: Hauptworkflow, Einstellungen, Vorlagen-/Druckerpflege,
   Druckhistorie mit Fehler- und Partial-Zuständen.
6. PPD-Name des Brother QL-800 an echter Hardware verifizieren
   (`docs/architecture.md`, Abschnitt 9, Punkt 2).

## Weiterhin offen

- Branch Protection für `main` und `develop` (Pull Request erforderlich, CI
  muss grün sein) — braucht Zugriff auf die Repository-Einstellungen.
- GHCR-Veröffentlichung bei einem Versions-Tag.
- Bundle-Splitting im Frontend (aktuell ein Chunk, 368 kB gzip).
