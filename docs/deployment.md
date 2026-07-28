# Betrieb von Spoolman Labeler

Dieses Dokument beschreibt Installation, Betrieb, Update und Fehlersuche des
Docker-Stacks. Die Entscheidungen dahinter stehen in
[`architecture.md`](architecture.md) (ADR-005 bis ADR-009) und
[`printing-architecture.md`](printing-architecture.md).

**Stand:** Juli 2026 · **Zielplattformen:** `linux/amd64` und `linux/arm64`

---

## Inhalt

1. [Schnellstart](#1-schnellstart)
2. [Die drei CUPS-Varianten](#2-die-drei-cups-varianten)
3. [USB-Drucker einrichten](#3-usb-drucker-einrichten)
4. [Netzwerkdrucker einrichten](#4-netzwerkdrucker-einrichten)
5. [Backup und Restore](#5-backup-und-restore)
6. [Updates](#6-updates)
7. [Fehlerbehebung](#7-fehlerbehebung)
8. [Anhang: `python3-cups` und `uv`](#8-anhang-python3-cups-und-uv)
9. [Anhang: gepinnte Images und Pakete](#9-anhang-gepinnte-images-und-pakete)

---

## 1. Schnellstart

```bash
git clone https://github.com/sfcdx/spoolman-labeler.git
cd spoolman-labeler

cp .env.example .env
$EDITOR .env          # mindestens CUPS_PASSWORD setzen

docker compose up -d --build
```

Danach erreichbar:

| Dienst | Adresse | Bindung per Default |
| --- | --- | --- |
| Spoolman Labeler | `http://<host>:7913` | `0.0.0.0` (LAN) |
| Spoolman | `http://<host>:7912` | `0.0.0.0` (LAN) |
| CUPS-Weboberflaeche | `http://localhost:631` | **`127.0.0.1`** (nur Host) |

Der Zustand des Stacks:

```bash
docker compose ps
docker compose logs -f spoolman-labeler
```

### Sicherheitshinweis

Spoolman kennt **keinerlei** Authentifizierung (ADR-002) — wer die URL
erreicht, hat vollen Schreib- und Loeschzugriff auf das Inventar. Spoolman
Labeler bringt aus demselben Grund im MVP ebenfalls keine Anmeldung mit. Der
gesamte Stack gehoert in ein vertrauenswuerdiges lokales Netz und **nie** an
ein Port-Forwarding aus dem Internet.

Die CUPS-Weboberflaeche ist deshalb per Default an `127.0.0.1` gebunden. Wer
sie aus dem LAN braucht, oeffnet sie bewusst — und aendert vorher das Passwort:

```dotenv
CUPS_PASSWORD=<etwas Zufaelliges, z. B. aus `openssl rand -base64 24`>
CUPS_BIND_ADDRESS=0.0.0.0
```

Die schonendere Alternative ohne LAN-Exposition ist ein SSH-Tunnel:

```bash
ssh -L 6631:localhost:631 nutzer@homeserver
# danach im Browser: http://localhost:6631/admin
```

---

## 2. Die drei CUPS-Varianten

Alle drei Varianten laufen mit **derselben** `docker-compose.yml`. Umgeschaltet
wird ausschliesslich in `.env` — das haelt ein spaeteres `git pull`
konfliktfrei, was selbst ein Stueck Update-Stabilitaet ist.

Zwei Variablen genuegen:

* `COMPOSE_PROFILES` — welche Dienste ueberhaupt starten
* `CUPS_SERVER` — der **Hostname** des CUPS-Servers (der Port steht getrennt
  in `CUPS_PORT`, Default 631)

| Variante | `COMPOSE_PROFILES` | `CUPS_SERVER` |
| --- | --- | --- |
| **B** — Sidecar im Stack (Default) | `spoolman,cups` | `cups` |
| **A** — CUPS auf dem Docker-Host | `spoolman` | `host.docker.internal` |
| **C** — CUPS-Server im LAN | `spoolman` | `printserver.example.local` |

Nach jeder Aenderung:

```bash
docker compose up -d --remove-orphans
```

`--remove-orphans` raeumt den Container weg, der durch das entfernte Profil
nicht mehr Teil des Stacks ist. Das zugehoerige **Volume bleibt bestehen** —
ein versehentliches Umschalten kostet also keine Druckerkonfiguration.

### 2.1 Variante B — CUPS-Sidecar (Default)

Nichts zu tun. `docker compose up -d` liefert einen vollstaendigen
Druckserver inklusive Treibern; die Anwendung erreicht ihn ueber den
Compose-internen Namen `cups`.

Das ist die einzige Variante, die die Autonomie-Anforderung erfuellt: nach dem
Klonen ist kein manuelles CUPS-Setup auf dem Host noetig.

### 2.2 Variante A — CUPS laeuft auf dem Docker-Host

```dotenv
COMPOSE_PROFILES=spoolman
CUPS_SERVER=host.docker.internal
```

`host.docker.internal` existiert unter Linux nicht von Haus aus. Die
Compose-Datei setzt deshalb dauerhaft

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

— nicht auskommentiert, sondern immer aktiv, damit diese Variante ohne
Bearbeitung der Compose-Datei funktioniert. Ungenutzt kostet der Eintrag
nichts.

Zusaetzlich muss der Host-`cupsd` auf der Docker-Bridge lauschen. Debian und
Ubuntu liefern `Listen localhost:631` aus. In `/etc/cups/cupsd.conf`:

```apache
Listen 0.0.0.0:631

<Location />
  Order allow,deny
  Allow @LOCAL
</Location>
```

```bash
sudo systemctl restart cups
```

> **Das ist ein bewusster Eingriff.** Damit ist CUPS fuer das gesamte LAN
> erreichbar, nicht nur fuer Docker. Wer das nicht will, nimmt die folgende
> Variante.

#### Variante A ohne Netzwerk-Listener: der Unix-Socket

`libcups` spricht den Socket transparent — kein Listener, keine Aenderung an
`cupsd.conf`. In `docker-compose.override.yml` (die Datei ist in `.gitignore`
und ueberlebt `git pull`):

```yaml
services:
  spoolman-labeler:
    volumes:
      - /run/cups/cups.sock:/run/cups/cups.sock
    environment:
      CUPS_SERVER: ""
```

Fallstricke: Der Pfad heisst je nach Distribution `/run/cups/cups.sock` oder
`/var/run/cups/cups.sock`, und der Container-Prozess (UID 10001) braucht
Leserechte am Socket — auf dem Host gehoert er meist `root:lp` mit `0660`.
Als dokumentierte Alternative fuer Poweruser ausgezeichnet, als Default zu
fragil.

### 2.3 Variante C — CUPS-Server im LAN

```dotenv
COMPOSE_PROFILES=spoolman
CUPS_SERVER=printserver.example.local
CUPS_ADMIN=<Benutzername auf dem Printserver>
CUPS_PASSWORD=<dessen Passwort>
```

Wenn der Server TLS erzwingt (`DefaultEncryption Required`):

```dotenv
CUPS_USE_TLS=true
```

Der Drucker-URI-Drift ist hier der haeufigste Aerger: Wir haben keine
Kontrolle ueber die PPDs und die Queue-Namen auf dem Fremdserver. Wird dort
eine Queue umbenannt, laeuft `DEFAULT_PRINTER` ins Leere.

### 2.4 Spoolman laeuft bereits woanders

Symmetrisch zu den CUPS-Varianten:

```dotenv
COMPOSE_PROFILES=cups
SPOOLMAN_API_URL=http://192.0.2.10:7912
SPOOLMAN_PUBLIC_URL=http://192.0.2.10:7912
```

> Wenn Spoolman **in** diesem Stack laeuft, ist die richtige URL
> `http://spoolman:8000` — der **Container**-Port. Die `7912` ist nur der nach
> aussen gemappte Host-Port. Das ist die haeufigste Fehlkonfiguration an
> dieser Stelle.

### 2.5 Eigenes, schlankes CUPS-Image

ADR-005 legt fuer den MVP `anujdatar/cups` fest und kuendigt mittelfristig ein
eigenes Image an. Es liegt fertig unter `docker/cups/` und wird ebenfalls rein
ueber `.env` aktiviert:

```dotenv
COMPOSE_FILE=docker-compose.yml:docker-compose.cups.yml
```

```bash
docker compose build cups
docker compose up -d
```

Unterschiede zum Fremd-Image:

| | `anujdatar/cups` | `docker/cups` (eigenes) |
| --- | --- | --- |
| Treiberauswahl | `printer-driver-all` (loest ueber `Recommends` auf, aus Debian testing entfernt) | explizite Liste: ptouch, dymo, brlaser, cups-pdf |
| HP-Inkjet-Stack | enthalten (`hplip`, `openprinting-ppds`, …) | nicht enthalten |
| Groesse | ~183 MB | deutlich kleiner (nicht gemessen) |
| Zugriffskontrolle | `Allow All` in `<Location />` | `Allow @LOCAL` |
| Sicherheitsupdates | Fremd-Maintainer, monatlicher Rebuild | **unsere Aufgabe** |

Der letzte Punkt ist der Grund, warum das Fremd-Image der Default bleibt:
Ohne einen zeitgesteuerten CI-Rebuild ist ein eigenes Image schnell schlechter
als jedes gepflegte Fremd-Image.

---

## 3. USB-Drucker einrichten

### 3.1 Einmalige Einrichtung

```bash
# 1) Angeschlossene Drucker anzeigen
docker compose exec cups lpinfo -v
#   direct usb://Brother/QL-800?serial=000J1Z123456

# 2) Passenden Treiber suchen
docker compose exec cups sh -c "LC_ALL=C lpinfo -m | grep -i 'QL-800'"

# 3) Queue anlegen
docker compose exec cups lpadmin \
  -p QL800 -E \
  -v "usb://Brother/QL-800?serial=000J1Z123456" \
  -m "<Wert aus Schritt 2>" \
  -o media=Custom.62x29mm \
  -o printer-is-shared=false

# 4) Kontrolle
docker compose exec cups lpstat -p QL800
```

Alternativ ueber die Weboberflaeche auf `http://localhost:631/admin`
(Anmeldung mit `CUPS_ADMIN` / `CUPS_PASSWORD`).

Danach in `.env`:

```dotenv
DEFAULT_PRINTER=QL800
DEFAULT_LABEL_WIDTH_MM=62
DEFAULT_LABEL_HEIGHT_MM=29
```

> **Die Etikettengroesse muss auf beiden Seiten uebereinstimmen.** Ein PDF von
> 62 × 29 mm auf einer als 62 × 100 mm konfigurierten Queue wird von CUPS
> zentriert oder skaliert — mit sichtbar unscharfem Text.

> **Zum PPD-Namen in Schritt 2:** `printer-driver-ptouch` liefert keine
> fertigen `.ppd`-Dateien aus, sondern einen dynamischen Generator unter
> `/usr/lib/cups/driver/ptouch`. Die konkreten Namen entstehen erst zur
> Laufzeit und muessen deshalb tatsaechlich aus `lpinfo -m` abgelesen werden —
> ein aus der Dokumentation abgeschriebener Wert ist eine Wette.

### 3.2 Die entscheidende Regel: `?serial=`-URI verwenden

`lpinfo -v` meldet USB-Drucker in zwei Formen. **Immer die mit `?serial=`
nehmen.** Eine positionsbasierte URI (`usb://…/001/005`) bricht bei jedem
Um- und Wiedereinstecken und bei jedem Host-Reboot, weil die Device-Nummer
eine fortlaufende Zaehler-ID ist. Ueber die Seriennummer findet das
libusb-Backend das Geraet unabhaengig von Bus- und Device-Nummer wieder.

### 3.3 Was beim Aus- und Wiedereinstecken passiert

Drei Ebenen muessen stimmen, und der uebliche Ratschlag `devices:` deckt nur
zwei davon ab:

1. **Sichtbarkeit des Device-Node.** `/dev/bus/usb` ist als
   Verzeichnis-Bind-Mount durchgereicht. Neue Nodes, die der Host nach dem
   Container-Start anlegt, erscheinen dadurch im Container. (Bei `--device`
   ohne Verzeichnis-Mount waere das nicht so.)

2. **cgroup-Erlaubnis.** `devices:` allein legt die Allow-Liste beim
   Container-Start fest. Ein danach neu vergebener Minor wird vom Kernel mit
   `EPERM` blockiert, obwohl der Node sichtbar ist — das ist die Ursache des
   klassischen „nach dem Wiedereinstecken druckt es nicht mehr, bis ich den
   Container neu starte". Dagegen steht in der Compose-Datei:

   ```yaml
   device_cgroup_rules:
     - 'c 189:* rmw'      # usbfs, Major 189, alle Minor-Nummern
   ```

   Kein `privileged: true` (ADR-007): das gaebe dem Container Zugriff auf
   saemtliche Block- und Character-Devices des Hosts, inklusive Festplatten.

3. **Stabile Device-URI in CUPS.** Siehe 3.2.

Erwartetes Verhalten: Drucker abziehen → die Queue geht in
`processing-stopped` mit `printer-state-reasons: connecting-to-device` bzw.
`offline-report`. Drucker wieder einstecken → CUPS setzt den Job wegen
`ErrorPolicy retry-job` selbstaendig fort. Die Oberflaeche zeigt in dieser
Zeit „laeuft, aber blockiert", nicht „Fehler".

Etikettendrucker im Dauerbetrieb werden ohnehin selten umgesteckt — der
Hotplug-Fall ist wichtig, aber nicht kritisch.

### 3.4 Wenn USB gar nicht funktioniert

Die erste Debug-Frage lautet immer: **laeuft auf dem Host selbst ein `cupsd`
oder ein `ipp-usb`-Daemon?** Beide greifen das Geraet ab, und der Container
bekommt dann `Device or resource busy`.

```bash
systemctl status cups ipp-usb 2>/dev/null
sudo systemctl disable --now cups cups-browsed ipp-usb
```

Danach die Sichtbarkeit im Container pruefen:

```bash
docker compose exec cups lsusb
docker compose exec cups ls -l /dev/bus/usb/
```

---

## 4. Netzwerkdrucker einrichten

**Avahi/mDNS ist bewusst nicht Teil des Setups** (ADR-007). Netzwerkdrucker
werden ueber eine explizite URI eingebunden — was ohnehin die stabilere
Variante ist. `lpinfo -v` wird also **keine** `dnssd://…`-Eintraege zeigen;
das ist kein Fehler.

Warum kein Avahi:

* mDNS kommt im Docker-Bridge-Netz nicht durch. Avahi braucht praktisch
  `network_mode: host` — das wiederum bricht die Compose-DNS-Aufloesung, die
  Anwendung koennte `cups:631` nicht mehr erreichen.
* Auf 5353/udp kollidiert es mit dem Host-Avahi, den nahezu jedes NAS fuer
  SMB-/AFP-Advertising betreibt.
* Die verbreitete Begleitempfehlung `-v /var/run/dbus:/var/run/dbus` ist
  **gefaehrlich**: der Container startet einen eigenen `dbus-daemon`, der den
  System-D-Bus-Socket des Hosts ueberschreibt. Auf Systemd-Hosts legt das
  systemd-Kommunikation und NAS-Management-Oberflaechen lahm, bis der
  Container entfernt wird. Dieser Mount taucht in dieser Dokumentation nicht
  auf, und das ist Absicht.

### 4.1 Voraussetzung: feste Adresse

Vor allem anderen: **eine DHCP-Reservierung fuer den Drucker anlegen.** Eine
IP-basierte URI ist genau so lange stabil, wie die Adresse stabil ist. Das ist
ein Satz Konfiguration im Router und loest das Problem dauerhaft besser als
mDNS, dessen Namensaufloesung selbst wieder ausfallen kann.

### 4.2 IPP Everywhere / driverless (moderne Netzwerkdrucker)

```bash
docker compose exec cups lpadmin \
  -p QL800N -E \
  -v ipp://192.0.2.50/ipp/print \
  -m everywhere \
  -o printer-is-shared=false
```

`-m everywhere` laesst CUPS die Faehigkeiten per IPP beim Drucker erfragen —
kein PPD noetig. Das ist auch die Variante mit den besten Statusmeldungen,
weil der Drucker echte IPP-Job-Zustaende zurueckliefert.

Erreichbarkeit vorher pruefen:

```bash
docker compose exec cups ipptool -tv ipp://192.0.2.50/ipp/print get-printer-attributes.test
```

### 4.3 Rohes Socket / JetDirect (viele Etikettendrucker)

```bash
docker compose exec cups lpadmin \
  -p ZD420 -E \
  -v socket://192.0.2.51:9100 \
  -m "<Wert aus `lpinfo -m`>" \
  -o media=Custom.62x29mm \
  -o printer-is-shared=false
```

> **Ehrlichkeitshinweis zum Status:** Das `socket`-Backend meldet Erfolg,
> sobald die TCP-Verbindung die Bytes geschluckt hat. Ein Drucker, dem die
> Rolle ausgeht, kann trotzdem `completed` produzieren. Die Oberflaeche
> formuliert deshalb „an den Drucker uebergeben" statt „gedruckt" (ADR-013).
> Wo die Wahl besteht, ist `ipp://` dem `socket://` vorzuziehen.

### 4.4 Ohne Drucker entwickeln

Beide CUPS-Images bringen `printer-driver-cups-pdf` mit:

```bash
docker compose exec cups lpadmin -p PDF -E -v cups-pdf:/ -m drv:///cupsfilters.drv/pwgrast.drv
docker compose exec cups sh -c 'ls -l /var/spool/cups-pdf/*'
```

---

## 5. Backup und Restore

Zu sichern sind **zwei** Dinge. Beide liegen in Named Volumes und damit
ausserhalb der Container — ein `docker compose down` (ohne `-v`) und jedes
Image-Update lassen sie unangetastet.

| Volume | Mount | Inhalt |
| --- | --- | --- |
| `spoolman-labeler_labeler-data` | `/data` | SQLite-Datenbank, Vorlagen, gerenderte Etiketten, Logs |
| `spoolman-labeler_cups-config` | `/etc/cups` | **Druckerkonfiguration**: `printers.conf`, generierte PPDs, `cupsd.conf` |
| `spoolman-labeler_spoolman-data` | `/home/app/.local/share/spoolman` | Spoolmans eigenes Inventar |

Die genauen Namen zeigt `docker volume ls`.

### 5.1 Sichern

```bash
#!/bin/sh
# backup.sh — im Repo-Verzeichnis ausfuehren
set -eu
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

# Anwendungsdaten. SQLite mag es nicht, mitten im Schreibvorgang kopiert zu
# werden - deshalb der Container kurz gestoppt. Bei einem Etikettenwerkzeug
# sind die paar Sekunden verschmerzbar.
docker compose stop spoolman-labeler
docker compose run --rm --no-deps --entrypoint sh spoolman-labeler \
    -c 'tar -cf - -C /data .' > "backups/labeler-data-${STAMP}.tar"
docker compose start spoolman-labeler

# Druckerkonfiguration. Laeuft im laufenden Betrieb, cupsd schreibt hier
# nur bei Konfigurationsaenderungen.
docker compose exec -T cups tar -cf - -C /etc/cups . \
    > "backups/cups-config-${STAMP}.tar"

# Spoolman-Inventar
docker compose exec -T spoolman tar -cf - -C /home/app/.local/share/spoolman . \
    > "backups/spoolman-data-${STAMP}.tar"

echo "Fertig: backups/*-${STAMP}.tar"
```

Wer den Stack nicht anfassen will, sichert die Volumes direkt — funktioniert
auch bei gestopptem Stack:

```bash
docker run --rm \
  -v spoolman-labeler_cups-config:/src:ro \
  -v "$PWD/backups:/dst" \
  debian:trixie-slim \
  tar -cf /dst/cups-config.tar -C /src .
```

### 5.2 Wiederherstellen

```bash
# Druckerkonfiguration
docker compose stop cups
docker compose run --rm --no-deps --entrypoint sh cups \
    -c 'rm -rf /etc/cups/* && tar -xf - -C /etc/cups' < backups/cups-config-<STAMP>.tar
docker compose start cups
docker compose exec cups lpstat -p        # Kontrolle: Queues wieder da?

# Anwendungsdaten
docker compose stop spoolman-labeler
docker compose run --rm --no-deps --entrypoint sh spoolman-labeler \
    -c 'rm -rf /data/* && tar -xf - -C /data' < backups/labeler-data-<STAMP>.tar
docker compose start spoolman-labeler
```

> **Restore aus einem aelteren Image-Stand:** Ein `/etc/cups`-Backup enthaelt
> PPDs, die zu den Filtern der damaligen Image-Version passen. Nach einem
> Restore in ein neueres Image sicherheitshalber
> `docker compose restart cups` und einen Testdruck fahren. Notfalls die
> betroffene Queue mit `lpadmin -x <NAME>` loeschen und neu anlegen — die
> Anwendungsdaten in `/data` sind davon nicht betroffen.

### 5.3 Was **nicht** gesichert wird — und warum

`/var/spool/cups` (Job-Dateien) und `/var/cache/cups` (Treiberindex,
`job.cache`) sind bewusst nicht persistiert (ADR-006). Dort stehen Verweise
auf Filter- und PPD-Pfade der jeweiligen Image-Version; nach einem Update
fuehren sie zu haengenden Queues und `Filter failed`. Ein Etikettendruck ist
ein Sekundenvorgang — es gibt keinen Grund, Jobs ueber Neustarts zu retten.

Die Anwendung fuehrt ihren eigenen Job-Status in ihrer eigenen Datenbank und
markiert beim Start verlorene Jobs als `unknown`.

---

## 6. Updates

Update-Stabilitaet ist eine Kernanforderung: **`docker compose pull &&
docker compose up -d` darf die Druckerkonfiguration nicht zerstoeren.**

### 6.1 Der Ablauf

```bash
cd spoolman-labeler
git pull                                    # neue Compose-Datei und Doku

# Version in .env erhoehen, falls die Release Notes das verlangen:
#   LABELER_VERSION=0.2.0

docker compose pull                         # nur solange nicht lokal gebaut wird
docker compose up -d
docker compose ps                           # alle Dienste "healthy"?
```

Wird lokal gebaut (Zustand bis zum ersten veroeffentlichten Image):

```bash
git pull
docker compose build --pull
docker compose up -d
```

`--pull` sorgt dafuer, dass auch die Basis-Images aktualisiert werden — sonst
baut Docker auf einer alten, lokal zwischengespeicherten Schicht weiter.

### 6.2 Was dabei genau passiert

`docker compose up -d` legt fuer jeden Dienst mit geaendertem Image einen
**neuen Container** an und wirft den alten weg. Alles, was nur im
Schreiblayer des Containers lag, ist damit weg. Ueberleben tun ausschliesslich
die Named Volumes:

| | ueberlebt das Update? | warum |
| --- | --- | --- |
| Drucker, Queues, PPDs (`/etc/cups`) | **ja** | Named Volume `cups-config` |
| Datenbank, Vorlagen (`/data`) | **ja** | Named Volume `labeler-data` |
| Spoolman-Inventar | **ja** | Named Volume `spoolman-data` |
| CUPS-Admin-User (`/etc/shadow`) | nein | wird bei jedem Start aus `CUPS_ADMIN`/`CUPS_PASSWORD` neu angelegt |
| Wartende Druckauftraege | nein | Absicht, siehe 5.3 |
| Treiberindex `ppds.dat` | nein | Absicht — ein veralteter Index nach einem Image-Update ist eine aktive Fehlerquelle |

### 6.3 Warum die Druckerkonfiguration wirklich erhalten bleibt

Ein Named Volume auf `/etc/cups` allein reicht **nicht**, und genau hier
scheitern die meisten Setups. Es gibt zwei Fallstricke:

1. **Der Erststart.** Docker befuellt ein leeres Named Volume beim allerersten
   Anlegen aus dem Image — bei einem **Bind-Mount** dagegen kopiert es
   **nichts**. Der Host-Pfad ueberdeckt `/etc/cups` vollstaendig, `cupsd`
   findet keine `cupsd.conf` und startet mit Compiled-in-Defaults, die nur auf
   `localhost` lauschen. Deshalb steht in der Compose-Datei ein **Named
   Volume**, kein Bind-Mount.

2. **Der stille Langzeit-Drift.** Die Vorbefuellung greift nur **einmal**.
   Bringt ein spaeteres Image-Update eine geaenderte Default-`cupsd.conf` mit
   (neue Direktive, geaenderte Policy), kommt sie im bestehenden Volume nie
   an.

Beides loest der Entrypoint-Vertrag:

* Zur **Build-Zeit** liegt die vollstaendige Default-Konfiguration
  unveraenderlich unter `/etc/cups-bak` (`RUN cp -rp /etc/cups /etc/cups-bak`).
* Im **Entrypoint** wird sie mit `cp -rpn` (no-clobber) nach `/etc/cups`
  gespiegelt: fehlende Dateien werden ergaenzt, vorhandene **niemals**
  ueberschrieben.

```sh
cp -rpn /etc/cups-bak/. /etc/cups/
```

Damit funktionieren Erststart und Update gleichermassen, neue Default-Dateien
kommen an, und nutzereigene Aenderungen bleiben unangetastet. Das war das
ausschlaggebende Kriterium bei der Wahl von `anujdatar/cups` gegenueber
`olbat/cupsd` (ADR-005); unser eigenes Image unter `docker/cups/`
implementiert denselben Vertrag und legt zusaetzlich vor jedem Start einen
Snapshot `printers.conf.prestart` an.

### 6.4 Datenbankmigrationen

Der Entrypoint des Anwendungscontainers fuehrt vor dem Start
`alembic upgrade head` aus — idempotent, also ein No-Op, wenn das Schema
bereits aktuell ist. Schlaegt die Migration fehl, **startet der Container
bewusst nicht**, statt mit einem inkonsistenten Schema weiterzulaufen.

Notausstieg fuer die Fehlersuche:

```dotenv
RUN_MIGRATIONS=0
```

**Vor einem Update mit Schemaaenderung immer erst `/data` sichern** (Abschnitt
5.1). Ein Downgrade auf eine aeltere Anwendungsversion ist nicht vorgesehen.

### 6.5 Zurueckrollen

Weil alle Tags gepinnt sind, ist ein Rollback ein Wert in `.env`:

```dotenv
LABELER_VERSION=0.1.0
```

```bash
docker compose up -d
```

Die Volumes bleiben, wo sie sind. Achtung: Wenn das neuere Image eine
Migration eingespielt hat, kann die aeltere Anwendung mit dem neuen Schema
moeglicherweise nichts anfangen — dann zusaetzlich das `/data`-Backup
zurueckspielen.

### 6.6 Updates des CUPS-Images

`CUPS_IMAGE` in `.env` ist ebenfalls gepinnt (`anujdatar/cups:26.07.01`).
Das Fremd-Image wird monatlich mit frischen Debian-Paketen neu gebaut, die
CalVer-Tags lauten `JJ.MM.TT`. Ein Update ist damit ein bewusster Schritt:

```dotenv
CUPS_IMAGE=anujdatar/cups:26.08.01
```

```bash
docker compose pull cups && docker compose up -d cups
docker compose exec cups lpstat -p        # Queues noch da?
```

---

## 7. Fehlerbehebung

### 7.1 Berechtigungsprobleme

Der Anwendungscontainer laeuft als **UID/GID 10001** (nicht als root).

**Named Volume (Default):** Docker uebernimmt beim ersten Anlegen Inhalt
**und Eigentuemer** aus dem Image. Es gibt nichts zu tun.

**Bind-Mount:** Docker uebernimmt gar nichts, das Host-Verzeichnis behaelt
seinen Eigentuemer. Symptom im Log:

```
[entrypoint] FEHLER: Kein Schreibrecht auf '/data' (laufe als UID 10001, GID 10001).
```

Abhilfe:

```bash
sudo chown -R 10001:10001 /pfad/zum/host-verzeichnis
```

Oder — auf NAS-Systemen oft praktischer — die UID des Containers an die des
Hosts anpassen, ueber `docker-compose.override.yml` (in `.gitignore`,
ueberlebt `git pull`):

```yaml
services:
  spoolman-labeler:
    user: "1000:1000"
```

> Beides gleichzeitig geht schief: Wird `user:` **nach** dem ersten Start
> geaendert, gehoert das bereits befuellte Volume noch der alten UID. Dann
> einmalig:
> ```bash
> docker compose run --rm --user root --entrypoint sh spoolman-labeler \
>     -c 'chown -R 1000:1000 /data'
> ```

Der CUPS-Container laeuft bewusst **als root** — die usbfs-Nodes unter
`/dev/bus/usb` gehoeren auf dem Host `root:root`, und `cupsd` legt selbst
privilegien-getrennte Kindprozesse fuer die Filter an. Ihn auf einen
unprivilegierten Nutzer zu zwingen bricht den USB-Zugriff.

### 7.2 AppArmor und SELinux

**AppArmor** (Debian, Ubuntu) laesst Docker in aller Regel in Ruhe. Wenn USB
trotz korrekter `devices:`-Konfiguration nicht geht, zuerst nachsehen:

```bash
sudo dmesg | grep -i apparmor | tail -20
sudo aa-status | head
```

Zum **Testen** (nicht als Dauerzustand) in `docker-compose.override.yml`:

```yaml
services:
  cups:
    security_opt:
      - apparmor=unconfined
```

Hilft das, ist ein eigenes AppArmor-Profil die richtige Antwort — nicht
`unconfined` auf Dauer.

**SELinux** (Fedora, RHEL, Rocky, teilweise Synology) ist der haeufigere Fall.
Symptom: `Permission denied` auf einem Bind-Mount, obwohl die
Dateiberechtigungen stimmen.

```bash
sudo ausearch -m avc -ts recent | tail -20
```

Bind-Mounts brauchen dort ein Label-Suffix:

```yaml
volumes:
  - /srv/labeler-data:/data:Z      # Z = privates Label nur fuer diesen Container
                                   # z = geteiltes Label fuer mehrere Container
```

Named Volumes — der Default in diesem Stack — haben dieses Problem nicht. Das
ist einer der Gruende fuer die Entscheidung in ADR-006.

Fuer den Geraetezugriff:

```bash
sudo setsebool -P container_use_devices on
```

### 7.3 ARM64 und Raspberry Pi

Alle Images des Stacks sind Multi-Arch:

| Image | amd64 | arm64 | armv7 |
| --- | --- | --- | --- |
| `spoolman-labeler` (dieses Repo) | ✓ | ✓ | nicht unterstuetzt |
| `ghcr.io/donkie/spoolman` | ✓ | ✓ | ✓ |
| `anujdatar/cups` | ✓ | ✓ | ✓ |

**armv7 (32-Bit) wird von diesem Image nicht unterstuetzt.** Ein Raspberry Pi
3 oder 4 mit 32-Bit-Raspberry-Pi-OS faellt damit raus; mit dem 64-Bit-Image
(`arm64`) laeuft er problemlos. Grund: die Python-Abhaengigkeiten (`pydantic-core`,
`greenlet`, `Pillow`, `cffi`) liefern fuer armv7 nur teilweise Wheels und
muessten kompiliert werden — das kostet Build-Zeit und schleppt eine Toolchain
mit, ohne dass ein 32-Bit-System hier einen Vorteil haette.

Weitere Hinweise fuer den Pi:

* **SD-Karten.** SQLite unter `/data` schreibt haeufig. Fuer den Dauerbetrieb
  ist eine USB-SSD deutlich besser als eine SD-Karte.
* **`device_cgroup_rules` und cgroup v1.** Aeltere NAS-Systeme (Synology DSM,
  QNAP QTS) und aeltere Raspberry-Pi-OS-Staende bringen teils cgroup v1 mit.
  Ob die Regel dort greift, ist nicht verifiziert. Wenn USB partout nicht
  funktioniert, ist `privileged: true` der dokumentierte Notnagel — in
  `docker-compose.override.yml`, mit dem Wissen, dass der Container damit
  Zugriff auf alle Geraete des Hosts bekommt:

  ```yaml
  services:
    cups:
      privileged: true
  ```

* **Selbst bauen auf dem Pi** ist moeglich (`docker compose build`), dauert
  aber deutlich laenger. Cross-Builds vom Entwicklungsrechner:

  ```bash
  docker buildx build --platform linux/amd64,linux/arm64 \
      -t ghcr.io/sfcdx/spoolman-labeler:0.1.0 --push .
  ```

  Weil im Image **nichts kompiliert wird** (siehe Abschnitt 8), ist der
  QEMU-Overhead dabei vernachlaessigbar.

### 7.4 Haeufige Symptome

| Symptom | Ursache und Abhilfe |
| --- | --- |
| `docker compose config` bricht mit `required variable CUPS_PASSWORD is missing a value` ab | In `.env` ist `CUPS_PASSWORD` leer. Der Wert wird auch dann gebraucht, wenn CUPS extern laeuft — er bleibt dort nur ungenutzt. Ein leerer Wert wuerde einen CUPS-Administrator ohne Passwort anlegen. |
| Anwendung erreicht Spoolman nicht | `SPOOLMAN_API_URL` zeigt auf `:7912` statt `:8000`. Innerhalb des Compose-Netzes gilt der **Container**-Port: `http://spoolman:8000`. |
| `CUPS_UNREACHABLE` bei Variante A | Der Host-`cupsd` lauscht nur auf `localhost`. Siehe 2.2 — oder den Unix-Socket verwenden. |
| Web-UI von CUPS meldet „Unauthorized" trotz korrekter Zugangsdaten | Der Unix-Socket-Listener fehlt. Die Web-UI-CGIs brauchen `Listen /run/cups/cups.sock` fuer ihren privilegierten Back-Channel. Im eigenen Image ist er gesetzt. |
| CUPS antwortet mit „Bad Request" | `ServerAlias *` fehlt. Der Container wird unter wechselnden Namen angesprochen (`cups`, Container-IP, `127.0.0.1`); ohne `ServerAlias` lehnt `cupsd` wegen Host-Header-Mismatch ab. |
| `lpinfo -v` zeigt den USB-Drucker nicht | Auf dem Host laeuft `cups` oder `ipp-usb` und haelt das Geraet. Siehe 3.4. |
| Nach dem Wiedereinstecken druckt es nicht mehr | `device_cgroup_rules` greift nicht (alte Docker-Version, cgroup v1) oder die Device-URI ist positionsbasiert statt `?serial=`. Siehe 3.2 und 3.3. |
| Etikett unscharf oder verschoben | `@page`-Groesse und PPD-Mediengroesse weichen ab. Beide auf dieselben Millimeterwerte setzen. |
| Schrift sieht anders aus als in der Vorschau | Die im Template genannte Familie ist im Image nicht vorhanden; Pango faellt still auf einen Ersatz zurueck. Im Image liegen DejaVu und Liberation. Weitere Familien als `@font-face` mit lokaler Datei einbinden oder das Image erweitern. |
| Job bleibt ewig in `processing` | Der Drucker meldet `processing-stopped` (leere Rolle, Deckel offen). Das ist Absicht: mit `ErrorPolicy retry-job` setzt CUPS selbst fort. `docker compose exec cups lpstat -p` zeigt den Grund im Klartext. |
| Alter Auftrag in der Historie wechselt auf „unbekannt" | Abgeschlossene Jobs fallen nach `MaxJobs` aus der CUPS-History; `getJobAttributes` liefert dann `client-error-not-found`. Wird bewusst auf `unknown` gemappt, nicht auf `failed`. |

### 7.5 Diagnose-Kommandos

```bash
docker compose ps                                  # Health-Status aller Dienste
docker compose logs -f --tail=100 spoolman-labeler
docker compose logs -f --tail=100 cups

# CUPS-Sicht aus dem Anwendungscontainer heraus - prueft die komplette Kette
# aus CUPS_SERVER, Netzwerk und Authentifizierung:
docker compose exec spoolman-labeler sh -c 'lpstat -h "${CUPS_SERVER}:${CUPS_PORT}" -t'
docker compose exec spoolman-labeler python -c "import cups; print(cups.Connection().getPrinters())"

# Vollstaendiger CUPS-Zustand
docker compose exec cups sh -c 'LC_ALL=C lpstat -t'
docker compose exec cups lsusb

# Healthcheck der Anwendung manuell ausloesen
docker compose exec spoolman-labeler /opt/venv/bin/python /usr/local/bin/healthcheck.py; echo "rc=$?"
```

---

## 8. Anhang: `python3-cups` und `uv`

Dieser Abschnitt loest den in **ADR-008** und in
`architecture.md`, Abschnitt 9, Punkt 1 offen gelassenen Punkt.

### 8.1 Das Problem

Zwei Vorgaben stehen sich scheinbar im Weg:

* **ADR-008** verlangt `pycups` als **Distributionspaket** `python3-cups`.
  Grund: PyPI liefert fuer `pycups` ausschliesslich ein sdist, `pip install`
  kompiliert also immer und braucht `gcc` plus `libcups2-dev`. Unter
  QEMU-emuliertem arm64 ist das ein echtes Multi-Arch-Risiko. Das
  Distributionspaket ist arch-natives, vorkompiliertes Binaerpaket.
* **ADR-003** verlangt Abhaengigkeitsverwaltung mit **uv** und `uv.lock` —
  also ein virtuelles Environment, in dem uv der alleinige Herr ist.

Ein Distributionspaket landet in `/usr/lib/python3/dist-packages`, ein
uv-venv in `<venv>/lib/pythonX.Y/site-packages`. Ohne Zutun sehen sich die
beiden nicht.

### 8.2 Der harte Befund: die Python-Version ist nicht frei waehlbar

Das Distributionspaket ist an **genau eine** Python-Minor-Version gebunden:

```
Package: python3-cups   (Debian trixie, 2.0.4-2)
Depends: libc6, libcups2t64, python3 (>= 3.13~), python3 (<< 3.14)
```

Die Extension heisst `cups.cpython-313-<arch>-linux-gnu.so` und ist
ausschliesslich von CPython **3.13** importierbar. Daraus folgt unmittelbar:

* Ein Basisimage `python:3.12-slim-trixie` kann `python3-cups` **nicht**
  benutzen. `apt-get install python3-cups` wuerde dort zusaetzlich Debians
  eigenes Python 3.13 nachziehen — zwei Interpreter im Image, und der, den uv
  benutzt, kann die Extension trotzdem nicht laden.
* Debian bookworm (Python 3.11) und trixie (3.13) bieten kein Python 3.12 an.
  Es gibt **keine** Debian-Version, in der „Python 3.12 + Distro-pycups"
  zusammen existieren.

Genau dieses Risiko ist in `printing-architecture.md`, Abschnitt 10, Punkt 7
als „praktisch testen" vermerkt. Der Test ist hiermit erledigt, und das
Ergebnis ist negativ.

### 8.3 Die geprueften Optionen

| Option | Bewertung |
| --- | --- |
| **A** — `python:3.12-slim-trixie` + `apt install python3-cups` | **Scheidet aus.** ABI-Mismatch, siehe 8.2. Genau die Falle, vor der die Recherche gewarnt hat. |
| **B** — `PYTHONPATH=/usr/lib/python3/dist-packages` | **Funktioniert, ist aber falsch herum.** `PYTHONPATH` steht in `sys.path` **vor** den site-packages des venv. Jedes Distro-Paket wuerde ein uv-verwaltetes Paket gleichen Namens verdecken — die Lockfile waere nur noch eine Empfehlung. |
| **C** — `pycups` per pip/uv aus dem sdist in einer Builder-Stage kompilieren | Technisch gangbar (die Toolchain bliebe in der Builder-Stage), widerspricht aber ADR-008 direkt und macht den arm64-Build von einem Compiler abhaengig. |
| **D** — die `.so` aus dem Distro-Paket in ein uv-eigenes Standalone-Python kopieren | Nicht belastbar. `python-build-standalone` ist gegen andere glibc- und OpenSSL-Staende gebaut; „laeuft vermutlich" ist als Fundament zu wenig. |
| **E** — venv aus dem Distro-Interpreter, mit `--system-site-packages` | **Gewaehlt.** Siehe 8.4. |

### 8.4 Die Loesung

```dockerfile
FROM debian:trixie-20260713-slim

RUN apt-get install -y --no-install-recommends python3 python3-cups cups-client

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON=/usr/bin/python3 \
    UV_PYTHON_DOWNLOADS=never

RUN uv venv --python /usr/bin/python3 --system-site-packages /opt/venv

RUN uv sync --locked --no-dev --no-install-project
```

Vier Bausteine, jeder mit einem eigenen Zweck:

1. **`debian:trixie-slim` als Basis, `python3` aus der Distribution.**
   Genau ein Interpreter im Image. Die ABI-Bindung von `python3-cups` passt
   per Konstruktion, nicht per Zufall.

2. **`uv venv --system-site-packages`.** Das schreibt
   `include-system-site-packages = true` in `pyvenv.cfg` und haengt
   `/usr/lib/python3/dist-packages` **hinten** an `sys.path` an:

   ```
   /opt/venv/lib/python3.13/site-packages   <- uv gewinnt immer
   /usr/lib/python3/dist-packages           <- nur, was uv nicht kennt
   ```

   Das ist die Umkehrung von Option B und der eigentliche Grund fuer diese
   Wahl: `import cups` findet das Distro-Paket, und trotzdem kann kein
   Distro-Paket jemals ein uv-verwaltetes verdecken.

3. **Das venv wird vorab von Hand angelegt, nicht von `uv sync`.** `uv sync`
   kennt keinen Schalter fuer `--system-site-packages`. Es uebernimmt aber ein
   vorhandenes, kompatibles venv und laesst dessen `pyvenv.cfg` unangetastet.
   Deshalb die Reihenfolge `uv venv` → `uv sync`.

4. **`UV_PYTHON_DOWNLOADS=never`.** Ohne diese Zeile koennte uv sich
   stillschweigend einen eigenen Standalone-Interpreter herunterladen — etwa
   weil `requires-python` in `pyproject.toml` es nahelegt. Das venv haette
   dann keinen Bezug mehr zu den dist-packages, und `import cups` schluege
   erst zur Laufzeit fehl. Der harte Riegel ist hier billiger als die
   Fehlersuche spaeter.

### 8.5 Was empirisch geprueft wurde

Mit `uv` gegen ein venv mit `--system-site-packages`:

* `uv venv --system-site-packages` schreibt
  `include-system-site-packages = true` — bestaetigt.
* `uv sync` **erhaelt** die Einstellung und erzeugt das venv nicht neu —
  bestaetigt.
* `uv sync` laeuft im Exact-Modus und entfernt Pakete, die nicht in der
  Lockfile stehen — es raeumt dabei aber **ausschliesslich** in den
  site-packages des venv auf. Pakete in `/usr/lib/python3/dist-packages`
  bleiben unberuehrt — bestaetigt.
* Existiert ein Paket **sowohl** in dist-packages als auch in der Lockfile,
  installiert uv trotzdem die Lockfile-Version ins venv, und diese gewinnt
  beim Import — bestaetigt.

Der Dockerfile verifiziert das zusaetzlich zur Build-Zeit und bricht ab, wenn
eine der Annahmen nicht mehr stimmt:

```dockerfile
RUN grep -q '^include-system-site-packages = true$' "$UV_PROJECT_ENVIRONMENT/pyvenv.cfg" \
 && "$UV_PROJECT_ENVIRONMENT/bin/python" -c "import cups"
```

### 8.6 Folge fuer das Backend-Manifest

Das Laufzeit-Python ist **3.13**, nicht 3.12. `backend/pyproject.toml` muss
das zulassen:

```toml
[project]
requires-python = ">=3.12"      # richtig: offenes Intervall
# requires-python = ">=3.12,<3.13"   # bricht den Container-Build
```

ADR-003 nennt „Python 3.12" als Untergrenze des Stacks, nicht als Obergrenze;
3.13 ist damit vereinbar. Es gaebe zwei Alternativen, falls 3.12 jemals hart
gefordert waere — beide mit spuerbaren Nachteilen:

* `ubuntu:24.04` als Basis (Python 3.12 **und** `python3-cups` vorhanden),
  dafuer ein groesseres Basisimage und eine andere Distribution als der
  CUPS-Sidecar;
* `pycups` doch kompilieren (Option C oben), gegen ADR-008.

### 8.7 Nebenbedingung: alles andere muss als Wheel vorliegen

Damit im Image tatsaechlich **nichts** kompiliert wird, muessen alle uebrigen
Abhaengigkeiten Wheels fuer `cp313` auf `manylinux` **amd64 und aarch64**
mitbringen. Fuer den vorgesehenen Stack ist das der Fall (`pydantic-core`,
`SQLAlchemy`, `greenlet`, `Pillow`, `cffi`, `Brotli`, `uvicorn`, `httpx`).

Kommt jemals eine Abhaengigkeit dazu, die nur als sdist existiert, gibt es
eine Escape-Luke im Dockerfile — die Toolchain bleibt dabei in der
Builder-Stage und landet nicht im Laufzeit-Image:

```bash
docker buildx build --build-arg INSTALL_BUILD_DEPS=1 ...
```

### 8.8 WeasyPrint: die Systembibliotheken

WeasyPrint 69 ist reines Python, braucht aber Pango ≥ 1.44 fuer das
Textshaping. Die Liste stammt aus der WeasyPrint-Dokumentation
(*First Steps → Debian ≥ 11 → inside a virtualenv using wheels*):

| Paket | wofuer |
| --- | --- |
| `libpango-1.0-0` | Textlayout — das Kernstueck |
| `libpangoft2-1.0-0` | FreeType-Anbindung von Pango |
| `libharfbuzz-subset0` | Font-Subsetting beim PDF-Schreiben |
| `fontconfig` | `fc-cache`, damit der Schriftindex zur Build-Zeit feststeht |

`libgobject-2.0` und `libfontconfig` kommen als Abhaengigkeit von
`libpango-1.0-0` mit und muessen nicht einzeln genannt werden. Cairo wird seit
WeasyPrint 53 **nicht** mehr gebraucht — WeasyPrint schreibt das PDF selbst
ueber `pydyf`.

Zusaetzlich installiert das Image **Schriften**, und das ist keine Kosmetik:

| Paket | Familien |
| --- | --- |
| `fonts-dejavu-core` | DejaVu Sans / Serif / Mono — WeasyPrints Ausweichfamilie |
| `fonts-liberation2` | metrisch kompatibel zu Arial, Helvetica, Times New Roman, Courier New |

Fehlt eine im Template genannte Familie, faellt Pango **still** auf einen
Ersatz zurueck. Die Textbreite aendert sich dabei, und auf einem 62 mm breiten
Etikett bricht die Zeile dann um. Genau deshalb liegen die Basisfamilien fest
im Image, und `fc-cache -f` laeuft zur Build-Zeit: dasselbe HTML erzeugt auf
amd64 und arm64 dasselbe PDF.

Weitere Familien nachruesten — in `docker-compose.override.yml`, ohne das
Image anzufassen:

```yaml
services:
  spoolman-labeler:
    volumes:
      - ./fonts:/usr/local/share/fonts:ro
```

```bash
docker compose exec spoolman-labeler fc-cache -f   # nur mit --user root
```

Sauberer ist, die Schrift als `@font-face` mit lokaler Datei unterhalb des
Asset-Verzeichnisses einzubinden — der `url_fetcher` laesst genau diesen Pfad
zu (ADR-009).

---

## 9. Anhang: gepinnte Images und Pakete

Kein `:latest` — nirgends. Ein Update ist immer ein bewusster, nachvollziehbarer
Schritt.

### 9.1 Laufzeit-Images (docker-compose.yml)

| Dienst | Image | Warum dieser Tag |
| --- | --- | --- |
| `spoolman` | `ghcr.io/donkie/spoolman:0.25.0` | zum Zeitpunkt der Erstellung neuester Release-Tag; amd64/arm64/armv7 |
| `cups` | `anujdatar/cups:26.07.01` | CalVer-Tag, monatlicher Rebuild mit frischen Debian-Paketen; als einziges geprueftes Image mit Persistenz-Entrypoint **und** konfigurierbaren Zugangsdaten (ADR-005) |
| `spoolman-labeler` | `ghcr.io/sfcdx/spoolman-labeler:0.1.0` | dieses Repo |

### 9.2 Build-Images (Dockerfile)

| Stufe | Image | Warum |
| --- | --- | --- |
| Frontend | `node:24.18.0-trixie-slim` | aktives LTS, gleiche Distributionsbasis wie die Laufzeit |
| Laufzeit + Abhaengigkeiten | `debian:trixie-20260713-slim` | datumsgestempelter, unveraenderlicher Tag statt des rollenden `trixie-slim`; liefert Python 3.13 und damit die Basis fuer `python3-cups` |
| uv | `ghcr.io/astral-sh/uv:0.11.33` | uv wird per `COPY --from` uebernommen — kein Installer-Skript aus dem Netz, kein zusaetzlicher Netzzugriff im Build |

Wer noch strenger pinnen will, ersetzt die Tags durch Digests:

```bash
docker buildx imagetools inspect debian:trixie-20260713-slim --format '{{.Manifest.Digest}}'
```

### 9.3 Debian-Pakete im Laufzeit-Image

| Paket | wofuer |
| --- | --- |
| `python3` | CPython 3.13 aus der Distribution |
| `python3-cups` | pycups 2.0.4, arch-nativ, ohne Compiler (ADR-008) |
| `cups-client` | `lpstat`, `lpinfo`, `lpadmin` fuer Diagnose und Support |
| `libpango-1.0-0`, `libpangoft2-1.0-0`, `libharfbuzz-subset0`, `fontconfig` | WeasyPrint 69 |
| `fonts-dejavu-core`, `fonts-liberation2` | reproduzierbares Schriftbild |
| `ca-certificates`, `tzdata` | TLS gegen Spoolman, korrekte Zeitstempel |
| `tini` | PID 1: Signalweiterleitung und Zombie-Reaping |

`libcups2t64` wird von `python3-cups` und `cups-client` selbst nachgezogen und
deshalb bewusst nicht namentlich genannt — der `t64`-Suffix ist ein
Transitionsdetail, das sich wieder aendern kann.

### 9.4 Debian-Pakete im eigenen CUPS-Image

`cups`, `cups-client`, `cups-filters`, `cups-ipp-utils`,
`printer-driver-ptouch` (Brother P-touch und QL),
`printer-driver-dymo` (Dymo LabelWriter), `printer-driver-brlaser`
(Brother-Monochromlaser), `printer-driver-cups-pdf` (virtueller Drucker fuer
Tests), `usbutils`, `ca-certificates`, `tzdata`, `tini`.

**Bewusst nicht enthalten:** `printer-driver-all` (loest ueber `Recommends`
auf und wurde aus Debian testing entfernt — genau deshalb steht hier eine
explizite Liste), `avahi-daemon` (ADR-007, siehe Abschnitt 4), `hplip`,
`openprinting-ppds`, `hpijs-ppds`, `foomatic-db-compressed-ppds`, `smbclient`.

### 9.5 Umgebungsvariablen der Anwendung

Die Anwendung liest ihre Konfiguration mit `pydantic-settings` **ohne
Praefix** und case-insensitiv. Die Variablennamen entsprechen damit eins zu
eins den Feldern in `backend/app/core/config.py`; unbekannte Variablen werden
ignoriert. Zwei Stolperstellen sind erwaehnenswert:

* **`LOG_LEVEL` nur in Grossbuchstaben.** Das Feld ist ein
  `Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]` — ein
  `LOG_LEVEL=info` laesst den Container beim Start an der Validierung
  scheitern. Der Entrypoint setzt den Wert fuer uvicorn selbst auf
  Kleinschreibung um; es gibt bewusst nur diese eine Variable.
* **`CUPS_SERVER` enthaelt nur den Hostnamen**, der Port steht getrennt in
  `CUPS_PORT`. Die Anwendung baut daraus die von `libcups` ausgewerteten
  Variablen `CUPS_SERVER` und `IPP_PORT`. Ein `CUPS_SERVER=cups:631` waere
  also doppelt gemoppelt.

| Variable | Feld | Default im Stack |
| --- | --- | --- |
| `APP_HOST`, `APP_PORT`, `APP_ENV` | `app_host`, `app_port`, `app_env` | `0.0.0.0`, `7913`, `production` |
| `LOG_LEVEL` | `log_level` | `INFO` |
| `DATA_DIR`, `STATIC_DIR` | `data_dir`, `static_dir` | `/data`, `/app/static` |
| `DATABASE_URL` | `database_url` | SQLite unter `/data` |
| `SPOOLMAN_API_URL` | `spoolman_api_url` | `http://spoolman:8000` |
| `SPOOLMAN_PUBLIC_URL` | `spoolman_public_url` | `http://localhost:7912` |
| `SPOOLMAN_TIMEOUT_SECONDS` | `spoolman_timeout_seconds` | `10` |
| `SPOOLMAN_API_TOKEN` | `spoolman_api_token` | leer (reserviert, ADR-002) |
| `CUPS_SERVER`, `CUPS_PORT` | `cups_server`, `cups_port` | `cups`, `631` |
| `CUPS_USERNAME`, `CUPS_PASSWORD` | `cups_username`, `cups_password` | aus `CUPS_ADMIN` / `CUPS_PASSWORD` |
| `CUPS_USE_TLS`, `CUPS_TIMEOUT_SECONDS` | `cups_use_tls`, `cups_timeout_seconds` | `false`, `10` |
| `DEFAULT_PRINTER`, `DEFAULT_TEMPLATE` | dito | leer |
| `DEFAULT_LABEL_WIDTH_MM`, `DEFAULT_LABEL_HEIGHT_MM`, `DEFAULT_DPI` | dito | `62`, `29`, `300` |
| `MAX_SPOOLS_PER_WORKFLOW`, `MAX_PRINT_RETRIES` | dito | `50`, `2` |
| `MAX_TEMPLATE_UPLOAD_BYTES` | `max_template_upload_bytes` | `1048576` |
| `RENDER_TIMEOUT_SECONDS` | `render_timeout_seconds` | `15` |

**Docker Secrets.** Zu `CUPS_PASSWORD`, `CUPS_USERNAME` und
`SPOOLMAN_API_TOKEN` wertet die Anwendung zusaetzlich `<NAME>_FILE` aus — den
Pfad zu einer Datei mit dem Wert. Ein direkt gesetztes `<NAME>` hat Vorrang.

```yaml
# docker-compose.override.yml
services:
  spoolman-labeler:
    environment:
      CUPS_PASSWORD_FILE: /run/secrets/cups_password
    secrets: [cups_password]
secrets:
  cups_password:
    file: ./secrets/cups_password.txt
```

> Das gilt nur fuer den **Anwendungs**container. Der CUPS-Sidecar liest
> ausschliesslich `CUPS_PASSWORD` direkt aus der Umgebung — `.env` bleibt dort
> die einzige Quelle.

---

## 10. Was hier bewusst offen bleibt

Ehrlichkeit statt Vollstaendigkeitsanspruch — diese Punkte muessen an realer
Hardware geprueft werden:

1. **Der PPD-Name des Brother QL-800.** `printer-driver-ptouch` liefert keine
   fertigen PPD-Dateien, sondern einen dynamischen Generator
   (`/usr/lib/cups/driver/ptouch`). Der konkrete Name entsteht erst zur
   Laufzeit und muss aus `lpinfo -m` abgelesen werden.
2. **Ob `printer-driver-all` im Fremd-Image tatsaechlich
   `printer-driver-ptouch` mitbringt.** Pruefen mit
   `docker run --rm anujdatar/cups:26.07.01 dpkg -l | grep printer-driver`.
   Falls nein, ist das sofort das Argument fuer das eigene Image
   (Abschnitt 2.5).
3. **Ob `device_cgroup_rules` auf NAS-Systemen mit cgroup v1 greift.** Der
   `privileged`-Notnagel bleibt deshalb dokumentiert (7.3).
4. **Ob Docker beim Verzeichnis-Bind-Mount von `/dev/bus/usb` neue Nodes
   zuverlaessig propagiert.** Falls Hotplug nicht funktioniert, ist
   `- /dev/bus/usb:/dev/bus/usb:rslave` der naechste Versuch.
5. **Die tatsaechliche Groesse des eigenen CUPS-Images.** Bisher nur
   geschaetzt, nicht gemessen.
