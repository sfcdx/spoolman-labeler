# Launch-Plan für Spoolman Labeler

**Ziel:** Ein installierbares, nachvollziehbar getestetes Docker-Compose-Projekt,
das neue Spulen ausschließlich über Spoolmans REST-API anlegt, ein individuelles
PDF-Etikett erzeugt und es serverseitig über CUPS übermittelt.

Dieses Dokument gleicht das Ausgangskonzept mit dem tatsächlichen
Repository-Stand ab. Ein Punkt ist erst erledigt, wenn Implementierung, Tests,
Dokumentation und – wo erforderlich – ein echter Containerlauf vorliegen.

## 1. Abnahmekriterien zum Launch

| Bereich | Muss nachweisbar funktionieren |
| --- | --- |
| Installation | `cp .env.example .env` und `docker compose up -d --build` starten den Standardstack auf Linux. |
| Netzwerk | Labeler auf Port 7913, Spoolman auf 7912; intern wird `http://spoolman:8000` verwendet. |
| Persistenz | SQLite, Vorlagen und gerenderte Dateien liegen ausschließlich unter `/data`. |
| Spoolman | Suche, Hersteller-/Filament-Anlage, Spulenanlage und Einzelabruf über `/api/v1`; kein DB-Zugriff. |
| Workflow | Mehrere identische Spulen erhalten einzelne IDs; Idempotenz verhindert Doppelanlagen. |
| Etikett | HTML/CSS/Jinja2 wird sandboxed zu PDF in exakten Millimetern gerendert; QR-Code ist `WEB+SPOOLMAN:S-{id}`. |
| Drucken | CUPS-Queues sind ermittelbar; Übermittlung, CUPS-Job-ID, Status, Fehler und Retry sind persistent. |
| UI | Neue Spule, Historie, Vorlagen, Einstellungen; responsive Light-/Dark-UI im Spoolman-Stil. |
| Betrieb | Non-root-Image, Healthcheck, sichere Defaults, keine Secrets in Logs, Backups/Updates dokumentiert. |
| Qualität | Backend-/Frontend-Unit-Tests, Mock-Integrationstest und echter Compose-Smoke-Test bestehen. |

## 2. Aktueller Abgleich

| Thema aus dem Ausgangskonzept | Stand | Fehlende Arbeit |
| --- | --- | --- |
| Analyse und ADRs | erledigt | API vor Release gegen laufendes Spoolman prüfen. |
| Backend-/Frontend-Grundgerüst | erledigt | Konfigurationsvertrag mit Compose vereinheitlichen. |
| Docker-/CUPS-Entwurf | angelegt | echter Image-Build, Laufzeitrechte, CUPS-Sidecar und Host-/LAN-Variante testen. |
| Spoolman-Integration | fehlt | getypter Client, Datenmodelle, Fehler-Mapping, validierte Proxy-Routen. |
| Template/PDF/QR | fehlt | sichere Jinja2-Sandbox, WeasyPrint, Standardvorlage, Preview/Export. |
| CUPS-Workflow | Probe vorhanden | Druckerverwaltung, Jobstatus, Persistenz, Retry/Testdruck. |
| Hauptworkflow | fehlt | Create-only/Create-and-print, Mengen, Idempotenz, partieller Fehler. |
| Einstellungen/Historie | UI-Platzhalter | vollständige CRUD-API und Bedienoberfläche. |
| CI/Release | fehlt | GitHub Actions, Containerbuild, Security-/Dependency-Checks, Releaseprozess. |

## 3. Umsetzungsreihenfolge

### A. Deployment-Vertrag zuerst

1. Alle Compose-Variablen auf die Pydantic-Felder abbilden; keine still ignorierten
   Variablen (`SPOOLMAN_API_URL`, `CUPS_USERNAME`, `LOG_LEVEL`, `DEFAULT_DPI` usw.).
2. CUPS-Adresse eindeutig als Host plus Port modellieren; Sidecar, Docker-Host und
   externer Server müssen dieselbe Anwendungskonfiguration verwenden.
3. Compose-Konfiguration in einem automatisierten Test rendern und den Startpfad
   (`entrypoint` → Migration → Uvicorn → Healthcheck) testen.
4. Ein echter Docker-Host führt Build, `up`, Healthcheck, Migration und
   Nicht-root-Dateischreibtest aus. Dieser Punkt ist eine harte Merge-Sperre für `main`.

### B. Spoolman-Client

1. Pydantic-Transportmodelle mit optionalen Feldern für Spoolmans
   `exclude_none=True`-Antworten.
2. HTTPX-Client mit `trust_env=False`, Timeouts, sauberem Fehler-Mapping und
   JSON-Kodierung von Custom Fields.
3. Hersteller, Filamente, Custom Fields und einzelne Spulen lesen; Hersteller,
   Filament und Spule anlegen.
4. Mock-Integrationstests für Erfolg, 400/404/422/5xx/Timeout sowie Payload-Regeln.

### C. Rendering und Druck

1. Template- und Druckjob-CRUD auf der vorhandenen SQLite-Migration aufbauen.
   Spoolmans `print_presets` werden als **Importquelle**, nicht als führender
   Datenspeicher unterstützt: Ein Importadapter liest die Preset-Struktur und
   übersetzt die dokumentierte Mini-Syntax (`{tag}`, optionale Blöcke,
   `**fett**`) in den stabilen Labeler-View-Model-Kontext. Unbekannte Tags
   werden vor dem Speichern angezeigt und niemals still als Code ausgeführt.
   Wir übernehmen weder `react-to-print` noch die Bogen-/Rasterlogik, da sie
   dem serverseitigen Einzel-Etikett-Druck über CUPS widersprechen.
2. Jinja2-Sandbox, strikten Platzhalter-Kontext, blockierte externe Ressourcen,
   Rendergrößen- und Zeitlimit einführen.
3. PDF mit WeasyPrint, Standardvorlage 62 × 29 mm und QR-Code erzeugen.
4. CUPS-Queue-Ermittlung, Testdruck, PDF-Übermittlung, Statusabbildung und Retry
   implementieren. „An CUPS übermittelt“ nie als physisch gedruckt ausgeben.

### D. End-to-End-Workflow und UI

1. Persistente Idempotenz-Workflow-Runs; Create-only, Create-and-print und
   Wiederholungsdruck ohne erneute Spoolman-Anlage.
2. React-Formular mit Filamentsuche, Neu-Anlage, Mengen und klarer Teilfehleranzeige.
3. Einstellungen, Vorlagenverwaltung und Druckhistorie an echte API anbinden.
4. Mock-E2E: Filament → mehrere Spulen → PDF → Fake-CUPS-Job → Historie.

### E. Release-Gate

1. CI: Backend/Frontend-Lint, Typprüfung, Tests, Docker-Build und SBOM/Scan.
2. Dokumentation: schneller Start, CUPS-Varianten, USB-/Netzwerkdrucker, Backup,
   Update, Fehlerbehebung und bekannte Einschränkungen.
3. Staging-Compose-Lauf auf amd64; zusätzlich arm64-Build prüfen.
4. Erst bei allen Gates: PR nach `main`, Review, Merge und versioniertes Release.

## 4. Technische Zusatzanforderungen für Docker und CUPS

- Keine Host-Pfade oder Passwörter im Image; `.env` bleibt lokal und Secrets können
  über `*_FILE` kommen.
- Der Labeler braucht keinen privilegierten Modus. USB-Passthrough ist ausschließlich
  Aufgabe des optionalen CUPS-Sidecars und nutzt eine enge cgroup-Regel.
- CUPS-Webadministration ist standardmäßig nur an `127.0.0.1` gebunden.
- Container-Health bewertet Datenbank und Anwendung als kritisch; Spoolman und CUPS
  erscheinen getrennt als degradierte externe Abhängigkeiten.
- SQLite ist ein Single-Writer-Deployment: vorläufig genau ein Labeler-Worker.
- Der Renderer schreibt nur in `/data/rendered`; Cleanup und Speichergrenzen sind
  Teil des Render-Jobs.
- Alle CUPS- und HTTP-Aufrufe erhalten feste Timeouts; Shell-Aufrufe mit
  nutzerkontrollierten Queue-Namen sind verboten.

## 5. Verifikationsprotokoll

| Prüfstufe | Status |
| --- | --- |
| Backend 32 Tests, Ruff, mypy | bestanden |
| Frontend 37 Tests, ESLint, Produktionsbuild | bestanden |
| Dockerfile-Pfad für `package-lock.json` | korrigiert, aber noch ohne echten Build |
| Docker Compose Build/Start/Healthcheck | offen – Docker-Daemon in dieser Umgebung fehlt |
| CUPS realer Testdruck | offen – Drucker/Server nicht verfügbar |
| Spoolman Mock-Integration | offen |
| End-to-End-Workflow | offen |
