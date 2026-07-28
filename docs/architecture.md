# Architektur von Spoolman Labeler

Dieses Dokument konsolidiert die Architekturentscheidungen des Projekts. Es
ist die maßgebliche Referenz für die Implementierung.

Die Detailuntersuchungen, auf denen es beruht, stehen in:

- [`spoolman-api-analysis.md`](spoolman-api-analysis.md) — Spoolman-REST-API
- [`ui-analysis.md`](ui-analysis.md) — Spoolman-Weboberfläche
- [`printing-architecture.md`](printing-architecture.md) — CUPS und PDF-Rendering

**Status:** Entwurf für den MVP. Letzte Aktualisierung: Juli 2026.

---

## 1. Zweck und Abgrenzung

Spoolman Labeler verkürzt den Weg von „Filamentpaket geöffnet" zu
„beschriftete Rolle im Regal" auf einen einzigen Vorgang.

**Wichtige Klarstellung:** Spoolman besitzt bereits eine eigene
Etikettendruck-Funktion mit Template-Sprache, Millimeter-Layout und
QR-Codes. Sie druckt allerdings über `react-to-print`, also über den
**Browser-Druckdialog**, und ist auf Bogendruck ausgelegt.

Unser Mehrwert ist deshalb bewusst anders gelagert:

| Spoolman (eingebaut)                    | Spoolman Labeler                              |
| --------------------------------------- | --------------------------------------------- |
| Browser-Druckdialog                      | Serverseitig über CUPS, ohne Dialog           |
| Bogendruck (A4-Raster)                   | Endlos-Etikettendrucker, ein Etikett pro Rolle |
| Etikettieren vorhandener Spulen          | Wareneingang: anlegen **und** etikettieren    |
| Eine Spule = ein Etikett                 | Mehrere identische Spulen in einem Durchgang  |
| Kein Druckprotokoll                      | Druckhistorie mit Status, Fehler, Retry       |

Wir bauen **kein** Duplikat und **keinen** Fork. Spoolman bleibt das führende
Inventarsystem.

---

## 2. Systemüberblick

```text
                         Docker-Host
 ┌────────────────────────────────────────────────────────────────┐
 │                                                                │
 │  ┌──────────────┐                    ┌──────────────────────┐  │
 │  │   spoolman   │◀───── REST v1 ─────│   spoolman-labeler   │  │
 │  │              │   http://spoolman  │                      │  │
 │  │  :7912→8000  │        :8000       │  :7913               │  │
 │  │              │                    │                      │  │
 │  │  Inventar    │                    │  FastAPI + React     │  │
 │  │  (führend)   │                    │  SQLite @ /data      │  │
 │  └──────────────┘                    └──────────┬───────────┘  │
 │                                                 │ IPP          │
 │                                      ┌──────────▼───────────┐  │
 │                                      │        cups          │  │
 │                                      │  :631 (nur 127.0.0.1)│  │
 │                                      │  Named Volume        │  │
 │                                      │  /etc/cups           │  │
 │                                      └──────────┬───────────┘  │
 └─────────────────────────────────────────────────┼──────────────┘
                                          USB / Netzwerk
                                                   │
                                          ┌────────▼────────┐
                                          │ Etikettendrucker │
                                          └─────────────────┘
```

### Zuständigkeiten

**Spoolman besitzt:** Hersteller, Filamente, Spulen, Gewichte, Lagerorte,
Materialdaten, eigene Custom Fields.

**Spoolman Labeler besitzt:** Weboberfläche für den Workflow,
Druckerkonfiguration, Etikettenvorlagen, Rendering, Druckaufträge,
Druckhistorie, eigene Einstellungen.

Spoolman Labeler führt **keine Schattenkopie** des Inventars. Es speichert von
Spoolman nur die `spool_id` als Fremdreferenz in der Druckhistorie.

---

## 3. Architekturentscheidungen

Jede Entscheidung ist im Format Kontext → Entscheidung → Konsequenzen
festgehalten.

---

### ADR-001 — Kommunikation mit Spoolman ausschließlich über die REST-API

**Kontext.** Spoolman speichert seine Daten in SQLite oder PostgreSQL. Ein
direkter Datenbankzugriff wäre technisch möglich und kurzfristig bequemer.

**Entscheidung.** Wir sprechen ausschließlich `/api/v1/` über HTTP an. Kein
Datenbank-Treiber für Spoolman, keine gemeinsamen Volumes für Spoolman-Daten,
kein Schema-Wissen.

**Konsequenzen.**
- Spoolman-Updates brechen uns nicht durch Schemaänderungen.
- Spoolmans eigene Validierung und Geschäftslogik greift immer.
- Wir sind an das gebunden, was die API anbietet — akzeptiert.
- Netzwerkfehler werden zu einem normalen, zu behandelnden Fall.

---

### ADR-002 — Keine Authentifizierung gegenüber Spoolman, LAN-only als Betriebsmodell

**Kontext.** Das Ausgangskonzept sah ein optionales API-Key-Feld vor. Die
Untersuchung des Quellcodes ergab: Spoolman hat **keinerlei**
Authentifizierung — keine Middleware, keine Security-Dependencies. Wer die URL
erreicht, hat vollen Schreib- und Löschzugriff.

**Entscheidung.** Wir bauen kein API-Key-Feld, das ins Leere liefe. Stattdessen
dokumentieren wir deutlich, dass der gesamte Stack ins vertrauenswürdige
lokale Netzwerk gehört. Der HTTP-Client bekommt dennoch einen Platz für
zukünftige Auth-Header, damit eine spätere Spoolman-Version ohne Umbau
unterstützt werden kann.

**Konsequenzen.**
- Ein ehrlicher Sicherheitshinweis in README und `SECURITY.md` statt eines
  Sicherheitsgefühls ohne Substanz.
- Spoolman Labeler bringt im MVP ebenfalls keine Anmeldung mit — es wäre
  wirkungslos, solange Spoolman daneben offen erreichbar ist.
- Die Architektur verhindert eine spätere Authentifizierung nicht.

---

### ADR-003 — Backend: Python 3.13, FastAPI, SQLAlchemy 2, Alembic

**Kontext.** Das Konzept gibt diesen Stack vor. Er passt zudem zu Spoolman
selbst, das ebenfalls FastAPI verwendet.

**Entscheidung.** FastAPI, Pydantic v2, SQLAlchemy 2.x mit
Alembic-Migrationen, `httpx` als Spoolman-Client, `uvicorn` als Server.
Abhängigkeiten und Lockfile werden mit **uv** verwaltet.

**Korrektur der Python-Version.** Das Konzept nannte Python 3.12. Im Container
läuft stattdessen **Python 3.13**. Grund: Debian trixie liefert 3.13 als
Standard-`python3`, und das Distributionspaket `python3-cups` ist gegen genau
diese Version gebaut. Die Erweiterung heißt `cups.cpython-313-*.so` und lässt
sich aus Python 3.12 nicht laden. Ein Image auf Basis von
`python:3.12-slim-trixie` scheidet damit aus, sobald wir `python3-cups`
verwenden wollen — und das wollen wir aus den in ADR-008 genannten Gründen.

`backend/pyproject.toml` fordert `requires-python = ">=3.12"`, bleibt also
auch für lokale Entwicklung unter 3.12 nutzbar. Nur das Container-Image ist
auf 3.13 festgelegt.

**Konsequenzen.**
- Reproduzierbare Builds über `uv.lock`.
- Pydantic validiert Ein- und Ausgaben an einer Stelle.
- Alembic macht Schemaänderungen bei Updates nachvollziehbar.
- Die Python-Version des Images ist an die Debian-Basis gekoppelt. Ein Wechsel
  der Basis muss gegen `python3-cups` geprüft werden.

---

### ADR-004 — Frontend: React 19 + TypeScript + Vite + Ant Design 5, ohne Refine

**Kontext.** Spoolmans Oberfläche ist React 19 + Refine 5 + Ant Design 5 +
Vite. Bemerkenswert: Es gibt genau **einen** Design-Token-Override,
`colorPrimary: "#dc7734"`. Alles Übrige ist Ant-Design-Standard. Spoolman
„ist" optisch im Kern Ant Design mit oranger Primärfarbe.

**Entscheidung.** Wir übernehmen React + TypeScript + Vite + Ant Design 5 und
setzen denselben Token. **Refine lassen wir weg.**

**Begründung.** Refine ist ein Framework für datengetriebene CRUD-Backoffices.
Unsere Anwendung ist ein geführter Wizard mit genau einem Hauptpfad. Refine
brächte Abstraktionen für Probleme, die wir nicht haben.

**Konsequenzen.**
- Ein `ConfigProvider` mit einem Token reproduziert Spoolmans Erscheinungsbild
  einschließlich korrektem Dark Mode (dort leitet Ant Design `#be682f` ab).
- Von Spoolman übernommene Snippets passen ohne Anpassung.
- Der Theme-Umschalter bekommt dieselben drei Zustände (`system|light|dark`)
  und denselben `localStorage`-Schlüssel `colorMode`.

---

### ADR-005 — CUPS als Sidecar-Container, per Compose-Profil umschaltbar

**Kontext.** Die Anforderung lautet: `git clone` plus `docker compose up -d`
soll zu einem funktionierenden Drucksystem führen, ohne dass der Nutzer
vorher manuell CUPS auf dem Host einrichtet. Zugleich müssen Updates die
Druckerkonfiguration unangetastet lassen.

**Entscheidung.** Ein CUPS-Sidecar im selben Compose-Stack ist der **Default**.
Er liegt in einem Compose-`profile`, sodass die Varianten „CUPS auf dem Host"
und „externer CUPS-Server im LAN" allein über `.env` erreichbar bleiben —
ohne Bearbeitung der Compose-Datei.

Für den MVP verwenden wir `anujdatar/cups`, auf einen konkreten Tag gepinnt.
Es war das einzige geprüfte Image mit einem echten Persistenz-Entrypoint
(`cp -rpn /etc/cups-bak/* /etc/cups/`) und konfigurierbaren
Admin-Zugangsdaten.

**Konsequenzen.**
- Nicht bewertete Alternative `olbat/cupsd` scheidet aus: kein Entrypoint,
  kein `/etc/cups`-Backup — ein leerer Bind-Mount zerstört den Erststart — und
  fest verdrahtete Zugangsdaten.
- **Mittelfristig bauen wir ein eigenes Image** unter `docker/cups/`. Der
  Hauptgrund ist nicht die Größe, sondern dass beide geprüften Images ihre
  Treiber über `printer-driver-all` beziehen. Dieses Paket löst über
  `Recommends` statt `Depends` auf und wurde laut Kommentar im Dockerfile von
  olbat bereits aus Debian testing entfernt. Darauf wollen wir langfristig
  nicht bauen.

---

### ADR-006 — Persistenz von CUPS: nur `/etc/cups`, bewusst nicht der Spool

**Kontext.** Damit die Druckerkonfiguration ein Container-Update übersteht,
muss sie außerhalb des Containers liegen. Naheliegend wäre, alle
Zustandsverzeichnisse zu mounten.

**Entscheidung.** Als Named Volume persistiert wird **ausschließlich**
`/etc/cups`. `/var/spool/cups` und `/var/cache/cups` werden **nicht**
persistiert.

**Begründung.** Der Spool und der Cache enthalten Verweise auf Filter- und
PPD-Pfade der jeweiligen Image-Version. Übersteht dieser Zustand ein Update
auf ein Image mit anderen Pfaden, entstehen hängende Queues, die nur durch
manuelles Aufräumen wieder freizubekommen sind. Der Verlust laufender Jobs
beim Neustart ist demgegenüber unkritisch — ein Etikett wird eben neu
gedruckt.

**Konsequenzen.**
- Ein Container-Update erhält Drucker, Queues und Optionen.
- Ein Named Volume (kein Bind-Mount) verhindert, dass ein leeres
  Host-Verzeichnis die Default-Konfiguration beim ersten Start überdeckt.
- Backup und Restore von `/etc/cups` werden dokumentiert.

---

### ADR-007 — USB-Drucker über `devices` und `device_cgroup_rules`, nicht `privileged`

**Kontext.** USB-Etikettendrucker müssen in den CUPS-Container
durchgereicht werden. Der im Netz verbreitete Weg ist `privileged: true`.

**Entscheidung.**

```yaml
devices:
  - /dev/bus/usb:/dev/bus/usb
device_cgroup_rules:
  - 'c 189:* rmw'
```

Kein `privileged`. Kein Mount von `/var/run/dbus`.

**Begründung.** Die `device_cgroup_rules`-Zeile ist der Teil, der das
**Aus- und Wiedereinstecken** des Druckers überlebt: Ein neuer Device-Node
unter einer anderen Nummer bleibt von der Regel abgedeckt, während ein
statischer `devices`-Eintrag allein ins Leere liefe.

Ausdrücklich **nicht** übernommen wird das häufig kopierte
`-v /var/run/dbus:/var/run/dbus`. Es überschreibt den System-D-Bus-Socket des
Hosts und ist ein erheblicher Eingriff in das Wirtssystem.

**Konsequenzen.**
- Deutlich kleinere Angriffsfläche als bei `privileged`.
- Avahi/mDNS steht im Container nicht zur Verfügung. Netzwerkdrucker werden
  über ihre Adresse eingerichtet statt per Autodiscovery — ein akzeptabler
  Tausch, der dokumentiert wird.

---

### ADR-008 — CUPS-Anbindung über `pycups` aus dem Distributionspaket

**Kontext.** Drei Wege standen zur Wahl: `pycups` (C-Erweiterung), `pyipp`
(reines Python, async) und Aufrufe der CUPS-Kommandozeile.

**Entscheidung.** `pycups`, installiert als **Distributionspaket**
`python3-cups` statt über PyPI. Die Serverwahl erfolgt ausschließlich über die
Umgebungsvariable `CUPS_SERVER`, die `libcups` vor `client.conf` auswertet.
Alle blockierenden Aufrufe laufen über `anyio.to_thread.run_sync`.

**Begründung.**
- PyPI liefert für `pycups` nur ein sdist. Das erzwingt Compiler und
  `libcups2-dev` im Build und ist bei Multi-Arch-Builds unter Emulation ein
  echtes Risiko. Das Distributionspaket ist für `arm64` fertig vorhanden.
- Gegen die Kommandozeile spricht vor allem die **Statusqualität**:
  `job-state-reasons` ist über `lpstat` nicht verlässlich auszulesen. Hinzu
  käme das Risiko von Shell-Injection über Drucker- und Queue-Namen.
- `pyipp` bleibt als dokumentierte Option für reines Status-Polling; als
  Übermittlungsweg ist seine Print-Job-Unterstützung zu dünn.

**Gelöst in Phase 2.** Das Zusammenspiel des Distributionspakets mit der
`uv`-verwalteten Umgebung sieht so aus:

```dockerfile
uv venv --python /usr/bin/python3 --system-site-packages /opt/venv
```

Die virtuelle Umgebung wird über dem System-Python angelegt und sieht dessen
`dist-packages` — dort liegt `python3-cups`. Alle übrigen Abhängigkeiten
installiert `uv` aus `uv.lock` in die Umgebung selbst.

Ausschlaggebend für `--system-site-packages` statt `PYTHONPATH`: Die
`dist-packages` landen damit **hinter** den venv-eigenen `site-packages` im
Suchpfad. Gäbe es ein Distributionspaket gleichen Namens wie eine gesperrte
Abhängigkeit, gewänne immer die Version aus `uv.lock`. Bei `PYTHONPATH` wäre
die Reihenfolge umgekehrt und der Lockfile ausgehebelt.

Das Dockerfile prüft diese Annahme zur Bauzeit und bricht ab, wenn `import
cups` in der Umgebung fehlschlägt. Ein stillschweigend kaputtes Image kann so
nicht entstehen.

---

### ADR-009 — PDF-Rendering mit WeasyPrint und restriktivem `url_fetcher`

**Kontext.** Etiketten müssen aus HTML und CSS in **exakten physischen
Millimetermaßen** entstehen. Geprüft wurden WeasyPrint, Playwright/Chromium
und wkhtmltopdf.

**Entscheidung.** WeasyPrint, konfiguriert mit einem restriktiven
`url_fetcher`, der alles außer `data:`-URIs und einem festen Asset-Verzeichnis
blockiert.

**Begründung.**
- **Playwright fällt ausgerechnet beim Kernkriterium durch:** ein
  dokumentierter Rundungsfehler bei der Zoll-Umrechnung führt dazu, dass A4
  als 210,2 × 297,3 mm herauskommt. Bei einem 62 × 29 mm großen Etikett ist
  ein solcher Versatz nicht hinnehmbar. Dazu kämen 300–500 MB Image.
- **wkhtmltopdf ist seit Januar 2023 archiviert** und hat eine offene
  SSRF-Schwachstelle mit CVSS 9.8. Ausgeschlossen.
- WeasyPrint rechnet nativ in physischen Einheiten und respektiert
  `@page { size: 62mm 29mm }` exakt.

**Konsequenzen.**
- Der `url_fetcher` setzt die Sicherheitsanforderung „keine externen
  Ressourcen aus Vorlagen" technisch durch, statt sie nur zu dokumentieren.
- Kein JavaScript in Vorlagen — WeasyPrint führt keines aus. Das ist hier ein
  Vorteil.
- Schriften müssen im Image vorhanden sein und werden mitgeliefert.

---

### ADR-010 — QR-Codes im Format `WEB+SPOOLMAN:S-{id}`

**Kontext.** Spoolmans eingebauter Scanner erkennt genau zwei Muster:

```text
web+spoolman:s-<id>                    (case-insensitive)
http(s)://<host>/spool/show/<id>       (ohne Base-Path, ohne Query)
```

**Entscheidung.** `WEB+SPOOLMAN:S-{id}` ist der Default. Die HTTP-URL ist eine
Option und wird mit einem Hinweis versehen.

**Begründung.** Nur so bleiben unsere gedruckten Etiketten mit Spoolmans
eigenem Scan-Workflow kompatibel. Zusätzlich ist das kurze Schema auf kleinen
Etiketten deutlich besser lesbar, weil größere QR-Module möglich sind.

**Konsequenzen.**
- Läuft Spoolman unter einem Base-Path wie `/spoolman`, erkennt der eigene
  Scanner die HTTP-Variante nicht. Das UI weist beim Umschalten darauf hin.
- Die Basis-URL lesen wir aus Spoolmans Einstellung `base_url` über die API,
  statt sie erneut abzufragen.
- Es gibt kein `F-`/`V-`-Äquivalent — QR-Codes existieren nur für Spulen.

---

### ADR-011 — SQLite als eigene Datenbank, auf PostgreSQL vorbereitet

**Entscheidung.** SQLite unter `/data/spoolman-labeler.db`, angesprochen über
SQLAlchemy. Keine SQLite-spezifischen Konstrukte im Anwendungscode, alle
Schemaänderungen über Alembic.

**Konsequenzen.** Ein späterer Wechsel auf PostgreSQL erfordert eine geänderte
`DATABASE_URL` und einen Migrationspfad, aber keinen Umbau der Anwendung.

---

### ADR-012 — Speichern und Drucken sind getrennte Operationen

**Kontext.** Ein Druckfehler darf nicht dazu führen, dass eine bereits in
Spoolman angelegte Spule verschwindet oder doppelt entsteht.

**Entscheidung.** Der Workflow ist zweistufig. Stufe 1 legt die Spule(n) in
Spoolman an und gilt danach als abgeschlossen. Stufe 2 rendert und druckt.
Ein Fehler in Stufe 2 **rollt Stufe 1 niemals zurück**. Der Wiederholungsdruck
greift auf die bestehende `spool_id` zu und erzeugt nie neue Spulen.

Gegen Doppelklicks und wiederholte Requests schützt ein `idempotency_key`,
der serverseitig in `workflow_runs` festgehalten wird.

**Konsequenzen.**
- Die Erfolgsansicht muss den Teilerfolg klar darstellen: Spule angelegt,
  Druck fehlgeschlagen, mit Wiederholungsmöglichkeit.
- Druckaufträge sind eigene Entitäten mit eigenem Lebenszyklus.

---

### ADR-013 — Ehrliche Unterscheidung zwischen „übermittelt" und „gedruckt"

**Kontext.** CUPS bestätigt die Annahme eines Auftrags in der Queue. Ob das
Etikett physisch aus dem Drucker kam, ist damit nicht gesagt.

**Entscheidung.** Die Oberfläche unterscheidet sprachlich zwischen
**„An CUPS übermittelt"** und **„Physisch bestätigt"**. Ein physischer
Druckerfolg wird nie behauptet, wenn lediglich die Queue den Auftrag
angenommen hat. Das Statusmapping stützt sich auf die IPP-Attribute
`job-state` und `job-state-reasons`.

Interne Status: `queued`, `submitted`, `processing`, `completed`, `failed`,
`cancelled`, `unknown`.

---

### ADR-014 — Etikettenvorlagen in einer Jinja2-Sandbox

**Entscheidung.** Vorlagen sind HTML + CSS mit Jinja2-Platzhaltern, gerendert
in einer `SandboxedEnvironment`. Kein Dateisystemzugriff, keine ausgehenden
Netzwerkanfragen (durch den `url_fetcher` erzwungen), kein JavaScript, harte
Zeitbegrenzung, Größenbegrenzung beim Import.

Der Template-Kontext ist ein **stabiler View-Model-Layer**, der bewusst von
Spoolmans Rohmodell entkoppelt ist. Ändert Spoolman ein Feld, passen wir eine
Stelle an, nicht jede Vorlage.

**Konsequenzen.**
- Vorlagen überleben Spoolman-Updates.
- Fehlende Werte müssen im View-Model abgefangen werden — Spoolman lässt
  `null`-Felder komplett weg, statt sie als `null` zu senden.

---

## 4. Datenmodell

Tabellen der eigenen SQLite-Datenbank:

| Tabelle         | Zweck                                                     |
| --------------- | --------------------------------------------------------- |
| `settings`      | Schlüssel-Wert-Einstellungen, Geheimnisse markiert        |
| `printers`      | Druckerprofile mit Maßen, Offsets, Standardvorlage        |
| `templates`     | Etikettenvorlagen mit HTML, CSS, Maßen, DPI               |
| `print_jobs`    | Einzelne Druckaufträge mit Status und CUPS-Job-ID         |
| `workflow_runs` | Workflow-Läufe mit Idempotenzschlüssel und Ergebnis       |
| `audit_events`  | Optional: nachvollziehbare Ereignisse                      |

Die Feldlisten stehen im Ausgangskonzept und werden bei der Implementierung in
`backend/app/models/` festgeschrieben.

**Regel:** In `workflow_runs.request_payload_json` werden keine Geheimnisse im
Klartext abgelegt.

---

## 5. Validierung

Aus der API-Analyse übernommene Grenzen, die wir **vor** dem Spoolman-Request
prüfen, damit Fehler früh und verständlich auftreten:

| Feld              | Grenze              |
| ----------------- | ------------------- |
| `location`        | max. 64 Zeichen     |
| `lot_nr`          | max. 64 Zeichen     |
| `comment`         | max. 1024 Zeichen   |
| `price`, Gewichte | ≥ 0                 |
| `color_hex`       | ohne führende Raute |

Weitere Regeln: Anzahl Spulen ≥ 1 und ≤ `MAX_SPOOLS_PER_WORKFLOW`,
Etikettenmaße > 0, DPI plausibel, QR-Inhalt nicht leer, keine unbekannten
Template-Felder, kein zweiter Create mit identischem Idempotenzschlüssel.

---

## 6. Fehlerklassen

```text
SPOOLMAN_UNREACHABLE      TEMPLATE_NOT_FOUND      CUPS_UNREACHABLE
SPOOLMAN_AUTH_FAILED      TEMPLATE_INVALID        PRINTER_NOT_FOUND
SPOOLMAN_VALIDATION_FAILED TEMPLATE_RENDER_FAILED PRINTER_OFFLINE
VENDOR_CREATE_FAILED      QR_RENDER_FAILED        PRINT_SUBMISSION_FAILED
FILAMENT_CREATE_FAILED                            PRINT_STATUS_UNKNOWN
SPOOL_CREATE_FAILED       DATABASE_ERROR          PRINT_CANCEL_FAILED
SPOOL_FETCH_FAILED        CONFIGURATION_ERROR
                          IDEMPOTENCY_CONFLICT
                          INTERNAL_ERROR
```

Spoolman antwortet in **zwei** Body-Formen, die beide behandelt werden müssen:
`{"message": ...}` bei 400/403/404/500 und FastAPIs `{"detail": [...]}` bei
422.

Die Oberfläche zeigt verständliche deutsche Texte. Logs und API-Antworten
dürfen strukturierte technische Details enthalten — aber niemals Geheimnisse.

---

## 7. Definition of Done

Eine Funktion gilt als fertig, wenn sie

1. implementiert ist und validierte Eingaben verwendet,
2. Fehler sichtbar und verständlich behandelt,
3. strukturierte Logs erzeugt,
4. durch Tests abgedeckt ist,
5. dokumentiert ist,
6. keine offensichtlichen Sicherheitsprobleme aufweist,
7. **in Docker** funktioniert,
8. keinen direkten Zugriff auf die Spoolman-Datenbank verwendet.

---

## 8. Nicht Bestandteil des MVP

Grafischer Drag-and-drop-Etikettendesigner, WebUSB, RFID und NFC, native
Smartphone-App, Cloud-Druck, Benutzer- und Rollenverwaltung,
Mandantenfähigkeit, Bearbeiten vorhandener Spoolman-Spulen, Lager- und
Versandetiketten, native Treiber je Druckermodell, automatische physische
Druckbestätigung, Spoolman-Fork oder Sidebar-Patch in Spoolman.

---

## 9. Offene Punkte

Diese Punkte sind bewusst noch nicht entschieden oder müssen an realer
Hardware verifiziert werden:

1. **Das Container-Image wurde noch nie gebaut.** In der Entwicklungsumgebung
   stand kein Docker-Daemon zur Verfügung, und die Debian-Spiegel waren
   gesperrt. Geprüft sind Syntax, Auflösung der Compose-Datei in allen
   Profil-Kombinationen und die Existenz aller Image-Tags — **nicht** aber,
   ob `docker build` durchläuft. Das ist vor dem ersten Release zwingend
   nachzuholen.
2. **Paketnamen für WeasyPrint** wurden gegen die Upstream-Dokumentation und
   `packages.ubuntu.com` belegt, nicht gegen einen trixie-Paketindex.
3. **PPD-Name des Brother QL-800** — der Wert in den Einrichtungsbeispielen ist
   eine Annahme und muss am Gerät geprüft werden. `printer-driver-ptouch`
   erzeugt PPDs dynamisch.
4. **Ob `printer-driver-all` tatsächlich `printer-driver-ptouch` mitzieht** —
   falls nein, ist das sofort das Argument für das eigene CUPS-Image.
5. **Ob `device_cgroup_rules` unter cgroup v1 greift** — geprüft ist nur die
   Konfiguration, nicht das Verhalten auf einem älteren Host.
6. **Die OpenAPI-Spezifikation von Spoolman** konnte nicht abgerufen werden.
   Die gesamte API-Analyse stammt aus dem Quellcode des `master`-Branch. Vor
   dem Release sollte sie gegen eine laufende Instanz geprüft werden.
7. **Sortiersyntax für Extra-Felder** in der Spoolman-API ist ungetestet.

Erledigt seit der ersten Fassung:

- ~~Verzahnung von `python3-cups` mit der `uv`-Umgebung~~ — in ADR-008 gelöst.
- ~~Bundle-Größe von Ant Design~~ — gemessen: 368 kB gzip in einem einzigen
  Chunk. Code-Splitting steht aus, solange die Seiten Platzhalter sind.
