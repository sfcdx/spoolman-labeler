# Projektstatus

**Letzte Aktualisierung:** 29. Juli 2026

## Vollständiger Umbau: zwei Workflow-Pfade, Spoolman-Schnittstelle gehärtet (29. Juli 2026)

Auftrag: den zuvor bewusst zurückgestellten großen Umbauwunsch (einseitiges,
an Spoolman angelehntes Formular; „vorhandene Spule drucken" als eigener
Pfad) jetzt vollständig umsetzen, plus eine gezielte Sicherheits-/
Schwachstellenanalyse der Datenschnittstelle zu Spoolman (Etikettenvorlagen,
große Filament-Datenbank).

**Sicherheitsanalyse — zwei echte Befunde behoben:**
- ADR-014 versprach eine harte Render-Zeitbegrenzung für Etiketten-PDFs, die
  nie durchgesetzt wurde: `render_pdf` lief synchron und unbegrenzt direkt im
  Request-Handler. Ein aus einem Spoolman-Preset importiertes und danach
  verändertes Template mit teurem CSS hätte den gesamten (Single-Worker-)
  Event-Loop blockieren können — DoS für die ganze Anwendung, nicht nur den
  Request. Behoben: `render_pdf` läuft jetzt in einem abbrechbaren
  Worker-Thread (`anyio.to_thread.run_sync(..., abandon_on_cancel=True)`)
  mit `anyio.fail_after(render_timeout_seconds)`.
- **Echter Produktionsbug gefunden:** Spoolman lässt Felder mit dem Wert
  `null` in JSON-Antworten komplett weg (`exclude_none=True`), statt sie als
  `null` zu senden. Die Jinja-Sandbox (`StrictUndefined`) brach deshalb bei
  jedem Spoolman-Datensatz mit auch nur einem fehlenden Feld ab — reproduzierbar
  sogar mit der mitgelieferten Standardvorlage, sobald z. B. der Filamentname
  nicht gesetzt war. `build_label_context` belegt jetzt alle bekannten
  Spool-/Filament-/Vendor-Felder mit `None` vor, bevor Nutzerdaten
  überschrieben werden. War bereits als Backlog-Punkt „fehlende Keys statt
  null erwarten" bekannt, jetzt mit Regressionstest verifiziert und behoben
  (`tests/test_label_context.py`).
- Kleinere Härtung: `SpoolmanClient.vendors()`/`filaments()` sanieren
  Freitext vor dem Versand (Komma/Anführungszeichen hätten Spoolmans
  Filter-DSL sonst ungewollt als ODER-Verknüpfung bzw. Exakt-Vergleich
  interpretiert) und begrenzen `limit` serverseitig auf maximal 200 — relevant
  bei einer großen, über die externe Herstellerdatenbank gefüllten
  Filament-Liste.

**Neu, Backend:**
- `GET /api/spoolman/spools/search` — durchsucht bestehende, nicht
  archivierte Spulen (Freitext über Filament-/Herstellername, zwei separate
  Spoolman-Anfragen mit ID-Deduplizierung, da Spoolmans Query-Parameter
  UND-verknüpft sind).
- `POST /api/workflows/print-existing` — neuer zweiter Workflow-Einstieg:
  druckt eine bestehende Spule direkt, ohne in Spoolman irgendetwas
  anzulegen oder zu verändern.
- `POST /api/workflows/create-and-print`: `template_id`/`printer_id` sind
  jetzt optional. Ohne Angabe löst der Server automatisch die Standardvorlage
  bzw. den Standarddrucker auf (`templates_service.get_default_template`,
  `printers_service.get_default_printer`) — Kernwunsch „viel presetten,
  kürzere Workflows" aus der Nutzerrückmeldung.

**Neu, Frontend:**
- `NewSpoolPage` vollständig neu gebaut: kein vierstufiger Assistent mehr,
  sondern zwei klare Einstiegspfade — „Vorhandene Spule drucken" (Suche +
  Direktdruck ohne Neuanlage) und „Neue Spule" (einseitiges Formular statt
  Wizard, größere Eingaben). Drucker-/Vorlagenauswahl ist standardmäßig
  ausgeblendet (serverseitiger Default) und nur über ein „Erweitert"-Panel
  erreichbar.

**Ergebnis:** 114 Backend-Tests (vorher 101), 57 Frontend-Tests (vorher 55).
Ruff, mypy --strict, ESLint, Prettier, `tsc --noEmit`, Produktionsbuild:
durchgehend grün.

**Bewusst nicht umgesetzt** (siehe auch weiter unten „Bewusst nicht in
diesem Schritt umgesetzt" des vorherigen Schritts, weiterhin gültig):
- Zwei getrennte Vorlagen-„Datenbanken" (Labeler-intern vs. laufend aus
  Spoolman gesynct) — der Spoolman-Preset-Import bleibt ein Einmal-Import.
- Visuelle 1:1-Nachbildung der Spoolman-Screenshots (z. B. große Kachel-
  Auswahl statt `Segmented`-Umschalter für die zwei Einstiegspfade,
  Farb-Swatches direkt in der Ergebnisliste der Spulensuche statt nur in der
  Detailansicht) — funktional gleichwertig umgesetzt, aber nicht pixelgenau
  am Vorbild.

## Einstellungen editierbar, CUPS-Drucker-Discovery, mobile Nachschärfung (29. Juli 2026)

Nutzerfeedback nach der ersten produktiven Nutzung (Screenshots von Spoolmans
eigenem „Spule anlegen"-Formular als Vorbild) benannte mehrere konkrete
Lücken. Umgesetzt wurde der Teil mit dem besten Aufwand-Nutzen-Verhältnis;
größere strukturelle Wünsche sind unten bewusst als offen dokumentiert.

**Neu, Backend:**
- Das bisher komplett unangebundene `Setting`-Modell (Schlüssel-Wert-Tabelle,
  existierte bereits im Grundschema) ist jetzt über `GET/PUT /api/settings`
  und `DELETE /api/settings/{key}` erreichbar. Überschreibbar sind bewusst
  nur drei Werte: `spoolman_public_url`, `cups_server`, `cups_port` —
  sicherheitsrelevante oder infrastrukturelle Werte (DB-Pfad, interne
  Spoolman-API-URL, Zugangsdaten) bleiben ausschließlich über
  Umgebungsvariablen konfigurierbar. `app/api/deps.py::get_effective_settings`
  wendet vorhandene Overrides auf die Laufzeitkonfiguration an und ersetzt
  `Depends(get_settings)` überall dort, wo diese drei Werte tatsächlich
  wirken (Workflows, Druckerverbindungstest, Retry).
- Behebt den gemeldeten Fehler „Spoolman-Instanz-Link kann nicht gesetzt
  werden": Die Spoolman-URL war zuvor nur als statischer Platzhaltertext in
  der Oberfläche zu sehen, ohne jede Backend-Anbindung.
- `GET /api/printers/discover`: fragt den konfigurierten CUPS-Server nach
  bereits vorhandenen Warteschlangen (`cups_client.discover_queues`), auch
  solchen, die extern per `lpadmin` angelegt wurden. Adressiert den
  gemeldeten Fall „Drucker im Backend installiert, aber im Frontend nicht
  auswählbar" — vorher gab es keine Möglichkeit, existierende Warteschlangen
  überhaupt zu sehen, nur manuelles Abtippen des exakten Namens.

**Neu, Frontend:**
- `SettingsPage`: Die bisherigen statischen „Spoolman-Verbindung"/
  „Drucksystem (CUPS)"-Karten sind durch echte Formulare ersetzt
  (Speichern/Zurücksetzen auf Vorgabe, sichtbare Kennzeichnung ob ein Wert
  angepasst wurde, „Spoolman öffnen"-Link sobald eine URL gesetzt ist).
  Neuer „Drucker suchen"-Button zeigt gefundene CUPS-Warteschlangen; ein
  Klick auf „Übernehmen" öffnet das Anlage-Formular mit Warteschlangenname,
  Modell und Standort vorausgefüllt.
- `TemplatesPage`: Formular hatte trotz vollständiger Backend-Unterstützung
  keinen Schalter für `is_default` — ergänzt, analog zum bestehenden
  Drucker-Formular.
- `NewSpoolPage`: Der blaue Infohinweis ist jetzt wegklickbar und bleibt es
  dauerhaft (Zustand in `localStorage`, nicht nur pro Sitzung).

**Ergebnis:** 101 Backend-Tests (vorher 92), 55 Frontend-Tests, Ruff,
mypy --strict, ESLint, Prettier, `tsc --noEmit` und der Produktionsbuild
sind grün.

**Bewusst nicht in diesem Schritt umgesetzt** (Nutzerwunsch war breiter als
das hier Gelieferte — als bekannte Folgearbeit festgehalten):
- Eine vollständige, an Spoolmans eigenem „Spule anlegen"-Formular
  orientierte Neugestaltung von `NewSpoolPage` (einseitiges statt
  vierstufiges Formular, große gruppierte Filament-Datenbank-Suche wie im
  Screenshot gezeigt) — der bestehende Workflow wählt bereits automatisch
  Standarddrucker/-vorlage vor und überspringt so implizit unnötige Klicks,
  ist aber weiterhin ein vierstufiger Assistent statt einer einzigen Seite.
- Ein eigener „vorhandene Spule erneut etikettieren"-Pfad ohne Neuanlage:
  `SpoolmanClient` hat weiterhin keine Methode, um bestehende Spulen zu
  suchen/aufzulisten (nur `get_spool` per ID). Ein Druck ohne Neuanlage ist
  nur über die Druckhistorie (`retry`) möglich, nicht als eigenständiger
  Einstiegspunkt.
- Zwei getrennte Vorlagen-„Datenbanken" (Labeler-intern vs. aus Spoolman
  gesynct) mit Auswahlmöglichkeit — der bestehende Import bleibt ein
  Einmal-Import (Kopie zum Zeitpunkt des Imports), keine laufende
  Synchronisation mit Spoolmans Presets.
- `cups_server`/`cups_port` sind als Override erreichbar, aber die
  Oberfläche unterscheidet nicht explizit zwischen den drei
  CUPS-Deployment-Varianten aus ADR-005 — für den Standardfall (Docker-
  Sidecar) ist das Feld unnötig, wird aber weiterhin angezeigt.

## Hauptworkflow vollständig funktionsfähig (29. Juli 2026)

Nach der Produktivinstallation neben Spoolman (siehe Installationsprotokoll
im Castrum Vault) zeigte ein Funktionsaudit: Die Infrastruktur lief, aber
der eigentliche Zweck des Tools — Filament/Spule auswählen oder anlegen,
Vorlage wählen, drucken — war im Backend nur als Skelett und im Frontend nur
als Platzhalter vorhanden. Das ist jetzt nachgeholt:

**Neu, Backend:**
- CUPS-Druckübermittlung (`app/services/printing/cups_client.py`):
  `submit_print_job`/`get_job_status` über `pycups` in einem Worker-Thread,
  mit strenger Warteschlangennamen-Validierung (Verteidigung in der Tiefe,
  auch wenn der Name bereits beim Anlegen des Druckers geprüft wurde).
- Drucker- und Vorlagen-CRUD-APIs (`/api/printers`, `/api/templates`) inkl.
  Default-Flag-Exklusivität, Vorlagen-Duplizierung, Spoolman-Preset-Import
  und PDF-Vorschau (sowohl für gespeicherte als auch für noch nicht
  gespeicherte Vorlagen).
- Eine mitgelieferte Standardvorlage (62×29 mm) wird beim Anwendungsstart
  automatisch angelegt (`ensure_default_template`), damit der Workflow ohne
  manuelle Ersteinrichtung nutzbar ist.
- `POST /api/workflows/create-and-print`: legt Spulen an und druckt im
  selben Vorgang je ein Etikett. Ein Druckfehler macht die bereits erfolgte
  Spoolman-Anlage **niemals** rückgängig — der Lauf endet als `partial`
  (ADR-012). Mutationsgetestet: eine absichtlich eingebaute Rollback-Logik
  ließ den entsprechenden Test fehlschlagen.
- Druckhistorie (`GET /api/print-jobs`) mit Retry-Endpunkt, der die Spule
  frisch aus Spoolman lädt statt veraltete Werte erneut zu drucken.
- `SpoolmanClient.get_spool` ergänzt; zwei neue Fehlercodes
  (`PRINT_JOB_NOT_FOUND`, `PRINT_JOB_NOT_RETRYABLE`) statt einer
  Zweckentfremdung von `VALIDATION_FAILED`.
- Keine Schemaänderung nötig — die Tabellen `printers`/`templates`/
  `print_jobs` existierten bereits in der Grundschema-Migration, waren nur
  unangebunden.

**Neu, Frontend:**
- `NewSpoolPage`: vierstufiger Workflow (Filament, Spule, Etikett, Drucken)
  gegen `create-and-print`. Zeigt `completed`/`partial`/`failed` sichtbar
  unterschiedlich; bei `partial` bleibt die angelegte Spule sichtbar mit
  Verweis auf die Druckhistorie.
- `TemplatesPage`: CRUD, Duplizieren, Spoolman-Preset-Import, PDF-Vorschau.
  Eingebaute Vorlagen sind vor Änderung/Löschung geschützt.
- `SettingsPage`: Drucker-CRUD inkl. Standard-Flag und Testverbindung.
- `PrintHistoryPage`: echte Daten mit Statusfilter und Retry für
  fehlgeschlagene/abgebrochene Aufträge.
- Neue API-Client-Module (`printers`, `templates`, `workflows`, `printJobs`,
  `spoolman`). `createAndPrint()` liest den Antwort-Body bewusst unabhängig
  vom HTTP-Status (200/207/502), weil der generische `request()`-Wrapper bei
  Nicht-2xx-Antworten sonst `created_spool_ids` verwerfen würde — und genau
  das ist die Information, die eine bereits angelegte, aber nicht gedruckte
  Spule sichtbar macht.

**Ergebnis:** 92 Backend-Tests (vorher 49), 47 Frontend-Tests (vorher 37),
Ruff, mypy --strict, ESLint, Prettier, `tsc --noEmit` und der
Produktionsbuild sind grün.

**Bewusst nicht in diesem Schritt umgesetzt:**
- Das bei der Produktivinstallation von Hermes dokumentierte
  Phomemo-M110S-Setup (Custom-CUPS-Image mit Treiber, USB-Passthrough,
  Queue-Init-Skript) ist weiterhin **nicht** im Repository nachgeführt —
  siehe „Weiterhin offen" unten. Es lief bislang nur lokal auf dem
  Produktivsystem und würde einen künftigen `git pull`/Rebuild ohne
  erneute manuelle Einrichtung nicht überstehen.
- Auflisten/Auswählen **bestehender** Spools (Wiederholungsdruck ohne
  Neuanlage) ist weiterhin nicht umgesetzt — der aktuelle Workflow legt
  immer eine neue Spule an. War nicht Teil des expliziten Auftrags
  („Filament/Spule auswählen oder anlegen, Vorlage wählen, drucken").

## Vollständiger Review vor Produktionseinsatz (28. Juli 2026)

Vor dem geplanten Einsatz neben einer produktiven Spoolman-Instanz wurde der
gesamte Code- und Doku-Stand systematisch durchgesehen (nicht nur die zuletzt
geänderten Dateien). Ergebnis:

**Behoben:**
- Dockerfile setzte `APP_DATA_DIR`/`APP_STATIC_DIR`/`APP_ASSET_DIR`, aber
  weder `config.py` (kein `env_prefix`) noch `entrypoint.sh` (liest explizit
  `DATA_DIR`) werteten diese Namen aus — toter Code, unbemerkt nur weil die
  Python-Defaults zufällig identisch waren. Korrigiert auf die tatsächlich
  gelesenen Namen. Mit CI erneut verifiziert (Lauf 30400362473).
- README: veralteter Entwicklungsstand-Hinweis entfernt, `CUPS_PASSWORD`
  als Pflichtfeld im Schnellstart ergänzt, arm64-Aussage auf den echten
  Verifikationsstand korrigiert (nur amd64 ist über CI gebaut, arm64 ist im
  Dockerfile vorbereitet, aber nie tatsächlich gebaut worden).

**Bekannt, nicht behoben (niedriges Risiko):**
- `CreateOnlyService.run()`: schmales Race-Fenster, wenn zwei Requests mit
  identischem `idempotency_key` echt gleichzeitig eintreffen — beide könnten
  den Uniqueness-Check passieren, bevor einer committet. Bei
  `APP_WORKERS=1` (Default) nur innerhalb eines einzelnen Async-Event-Loops
  möglich, also sehr unwahrscheinlich, aber nicht ausgeschlossen. Ein
  eindeutiger DB-Constraint auf `idempotency_key` existiert bereits; im
  Konfliktfall käme aktuell ein 500er statt eines sauberen 409. Für den
  produktiven Single-User-Betrieb im LAN kein praktisches Risiko.
- `docker/cups/Dockerfile` (eigenes CUPS-Image, ADR-005-Zielzustand) wird
  von keiner CI-Pipeline gebaut. Nur relevant, wer `docker-compose.cups.yml`
  aktiv einbindet — nicht der Default.
- Keine funktionale Auffälligkeit in `SpoolmanClient`, `LabelRenderer`,
  `useHealth`, dem API-Client oder den Compose-/`.env.example`-Dateien
  gefunden. Kein `subprocess`/`eval`/`dangerouslySetInnerHTML` im gesamten
  Code — insbesondere für die künftige CUPS-Anbindung (Queue-Namen als
  Nutzereingabe) eine wichtige Randbedingung, die bislang eingehalten wird.

Frischer Testlauf zum Zeitpunkt des Reviews: 49 Backend-Tests, Ruff,
mypy --strict, Alembic-Check, 37 Frontend-Tests, ESLint, Prettier,
Frontend-Build — alle grün.

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
| Backend-Tests | 92 bestanden |
| Backend-Linting (Ruff) | bestanden |
| Backend-Typprüfung (mypy --strict) | bestanden |
| Frontend-Tests | 47 bestanden |
| Frontend-Linting (ESLint) | bestanden |
| Frontend-Produktionsbuild | bestanden |
| **Docker Build und Boot-Test (GitHub Actions)** | **bestanden** — run [30414032783](https://github.com/sfcdx/spoolman-labeler/actions/runs/30414032783) (Commit `84adb6f`, Hauptworkflow/Vorlagen/Drucker/Historie) |

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

1. Phomemo-M110S-Setup ins Repository nachführen (siehe „Weiterhin offen"):
   `docker/cups/Dockerfile.phomemo`, Compose-Overlay, gepinnter
   Treiber-Vendor-Snapshot mit Lizenztext, idempotentes Queue-Init-Skript,
   CI-Regressionstest. Ohne das überlebt die auf dem Produktivsystem bereits
   eingerichtete Druckfunktion keinen künftigen `git pull`/Image-Rebuild.
2. Bestehende Spools aus Spoolman auflisten und auswählen (Wiederholungsdruck
   ohne Neuanlage) — aktuell legt der Workflow immer eine neue Spule an.
3. PPD-Name realer Etikettendrucker an Hardware verifizieren, sobald mehr
   Modelle im Einsatz sind (bisher nur Phomemo M110S produktiv getestet,
   siehe Castrum-Vault-Installationsprotokoll).

## Weiterhin offen

- **Phomemo-M110S-Produktionssetup nicht im Repository getrackt.** Beim
  Funktionsaudit auf dem Produktivsystem (Castrum-Vault-Installations-
  protokoll, Nachtrag „Git-/Docker-Upgrade-Vertrag") wurde festgestellt, dass
  Treiber (`vivier/phomemo-tools`, Commit `d0522f058df7915674640b71aa6256d9
  6bde4fd6`, GPL-3.0), Custom-CUPS-Image, USB-Passthrough-Overlay und die
  angelegte CUPS-Queue ausschließlich lokal auf dem LXC existieren. Ein
  ungesicherter `git pull`/Compose-Rebuild auf diesem System würde die
  Druckfunktion ohne Vorwarnung wieder deaktivieren. Empfohlener,
  noch nicht umgesetzter Weg: gepinnter Vendor-Snapshot (Lizenztext +
  Prüfsumme) statt Live-Fetch, `docker/cups/Dockerfile.phomemo`,
  `docker-compose.phomemo.yml`-Overlay, `scripts/ensure-phomemo-m110s.sh`
  als idempotentes Init-Skript, CI-Regressionstest fürs Custom-Image. Bis
  dahin: vor jedem Upgrade auf diesem System das dokumentierte Runbook aus
  dem Castrum Vault befolgen, niemals `docker compose down -v` oder
  `git reset --hard`/`git clean -fd` im Produktiv-Checkout ausführen.
- Auswahl bestehender Spoolman-Spulen (Wiederholungsdruck ohne Neuanlage).
- Branch Protection für `main` und `develop` (Pull Request erforderlich, CI
  muss grün sein) — braucht Zugriff auf die Repository-Einstellungen.
- GHCR-Veröffentlichung bei einem Versions-Tag.
- Bundle-Splitting im Frontend (aktuell ein Chunk, ca. 394 kB gzip).
