# Druck-Architektur für Spoolman Labeler

> Stand der Recherche: 2026-07-28. Alle genannten Images, Debian-Pakete und Python-Bibliotheken
> wurden gegen die jeweiligen Upstream-Quellen (Docker Hub, GitHub-Raw-Dockerfiles, PyPI-JSON-API,
> packages.debian.org / packages.ubuntu.com) verifiziert. Quellen am Ende des Dokuments.

## Kurzfassung (TL;DR)

| Frage | Empfehlung |
| --- | --- |
| CUPS-Betrieb | **Variante B — CUPS-Sidecar im selben Compose-Stack**, per Compose-`profiles` abschaltbar, damit Varianten A und C ohne Datei-Edit erreichbar bleiben |
| CUPS-Image | MVP: `anujdatar/cups` (calver-Tag gepinnt) — als einziges der geprüften Images mit robustem Persistenz-Entrypoint. Ziel-Zustand: **eigenes schlankes Image** unter `docker/cups/Dockerfile`, per buildx nach GHCR |
| USB | `devices:` + `device_cgroup_rules:` (usbfs, Major 189) statt `privileged: true` |
| Persistenz | Named Volume auf `/etc/cups` + Entrypoint-Restore aus `/etc/cups-bak`. `/var/spool/cups` **nicht** persistieren |
| Python → CUPS | **pycups**, installiert als Distro-Paket `python3-cups` (kein Compiler, arch-nativ), Aufrufe über `anyio.to_thread.run_sync` |
| PDF-Renderer | **WeasyPrint 69** mit restriktivem `url_fetcher` |
| Statusermittlung | IPP-`job-state` + `job-state-reasons` pollen; `completed` ehrlich als „an das Gerät übergeben" dokumentieren |

---

## 1. Ausgangslage und Zielbild

Spoolman Labeler soll für Endnutzer per `git clone` + `docker compose up -d` lauffähig sein. Die
Zielgruppe betreibt typischerweise einen Homeserver, ein NAS (Synology/QNAP/Unraid) oder einen
Raspberry Pi — also amd64 **und** arm64, teilweise noch armv7. Zwei harte Anforderungen des
Auftraggebers steuern jede Entscheidung in diesem Dokument:

1. **Autonomie**: Nach dem Klonen darf kein manuelles CUPS-Setup auf dem Host nötig sein.
2. **Update-Stabilität**: `docker compose pull && docker compose up -d` darf die Druckerkonfiguration
   nicht zerstören.

Punkt 2 ist der eigentlich anspruchsvolle Teil. Ein Container-Update ersetzt das Image vollständig;
alles, was nicht in einem Volume liegt, ist weg. Gleichzeitig ist der naive Reflex („dann mounte ich
eben `/etc/cups`") genau die Stelle, an der die meisten Setups beim *ersten* Start scheitern.
Abschnitt 4.4 behandelt das im Detail.

---

## 2. Vergleich der drei Varianten

### 2.1 Übersicht

| Kriterium | A: CUPS auf dem Host | B: CUPS-Sidecar im Stack | C: Externer CUPS-Server im LAN |
| --- | --- | --- | --- |
| Einrichtungsaufwand Nutzer | Hoch — `apt install cups`, User in `lpadmin`, `cupsd.conf` für Remote-Zugriff öffnen, Firewall | **Sehr gering** — `docker compose up -d`, danach Web-UI auf `:631` | Gering, falls Server existiert; sonst höchster Aufwand |
| USB-Drucker | Nativ, problemlos (udev, `plugdev`, Hotplug funktioniert) | Funktioniert, aber Passthrough nötig (Abschnitt 4.3) | Nur wenn der Drucker am externen Server hängt |
| Netzwerkdrucker | Problemlos | Problemlos (IPP/socket/lpd sind reines TCP) | Problemlos |
| Update-Stabilität | **Sehr hoch** — CUPS wird gar nicht angefasst | Hoch, **wenn** Persistenz korrekt (Abschnitt 4.4); sonst Totalverlust der Queues | **Sehr hoch** — außerhalb unseres Lebenszyklus |
| Persistenz Druckerkonfiguration | Host-`/etc/cups`, überlebt alles | Volume-abhängig | Fremdverantwortung |
| Support-Aufwand für uns | Hoch — beliebig viele Host-Distributionen | Mittel — eine kontrollierte Umgebung | Niedrig |
| Portabilität NAS/Synology | Schlecht — DSM/QTS bringen teils kein oder ein exotisches CUPS mit | Gut | Gut |
| Typische Fallstricke | `Listen localhost:631`; SELinux/AppArmor; `host.docker.internal` unter Linux nicht vorhanden | Volume-Overlay beim Erststart; USB-Hotplug; Avahi-Kollisionen | Auth/Verschlüsselung; Erreichbarkeit; Drucker-URI-Drift |

### 2.2 Variante A — CUPS auf dem Docker-Host

Der App-Container spricht Port 631 des Hosts an. Unter Linux existiert `host.docker.internal`
**nicht** von Haus aus; es muss explizit gemappt werden:

```yaml
services:
  labeler:
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Docker Engine >= 20.10
    environment:
      CUPS_SERVER: "host.docker.internal:631"
```

Zusätzlich muss der Host-`cupsd` auf der Docker-Bridge lauschen — Debian/Ubuntu liefern per Default
`Listen localhost:631` aus. Der Nutzer muss also `/etc/cups/cupsd.conf` editieren:

```apache
Listen 0.0.0.0:631
<Location />
  Order allow,deny
  Allow @LOCAL
</Location>
```

Damit ist CUPS aber für das gesamte LAN offen, nicht nur für Docker — ein Sicherheitsschritt, den
man einem Endnutzer nicht unkommentiert zumuten sollte.

**Deutlich sauberere Alternative innerhalb von Variante A**: statt TCP den Unix-Domain-Socket
mounten. libcups spricht den Socket transparent, kein Netzwerk-Listener nötig, keine
`cupsd.conf`-Änderung:

```yaml
services:
  labeler:
    volumes:
      - /run/cups/cups.sock:/run/cups/cups.sock
    # kein CUPS_SERVER nötig; libcups nutzt den Default-Socket
```

Fallstrick: der Container-Prozess braucht passende UID/GID-Rechte am Socket (Gruppe `lp`), und der
Pfad variiert (`/run/cups/cups.sock` vs. `/var/run/cups/cups.sock`). Als *dokumentierte Alternative*
für Poweruser ist das exzellent, als Default zu fragil.

**Bewertung**: Höchste Update-Stabilität, aber verfehlt die Autonomie-Anforderung klar. Nicht als
Default geeignet.

### 2.3 Variante B — CUPS-Sidecar

Ein zweiter Service im selben `docker-compose.yml`. Die App erreicht ihn über den Compose-internen
DNS-Namen (`cups:631`); der Nutzer erreicht die CUPS-Web-UI über einen gemappten Port.

Das erfüllt die Autonomie-Anforderung exakt: ein `docker compose up -d` liefert einen kompletten,
funktionsfähigen Print-Server inklusive Treiber. Der gesamte Rest dieses Dokuments (Abschnitt 4)
behandelt die Feinheiten, die zwischen „funktioniert am Testtag" und „überlebt Updates" liegen.

**Bewertung**: Default-Empfehlung.

### 2.4 Variante C — Externer CUPS-Server im LAN

Reine Konfigurationssache: `CUPS_SERVER=printserver.lan:631`. Für uns der billigste Fall, weil wir
weder Treiber noch Persistenz noch USB verantworten.

Fallstricke: Authentifizierung (viele LAN-CUPS-Instanzen erwarten Basic-Auth), TLS
(`DefaultEncryption Required` → pycups braucht `cups.setEncryption()`), und die Tatsache, dass wir
keinerlei Kontrolle über die installierten PPDs haben.

**Bewertung**: Muss unterstützt werden (reine Env-Variable), aber kein Default.

### 2.5 Konsequenz für das Compose-Design

Alle drei Varianten lassen sich in **einer** Compose-Datei abbilden, wenn der Sidecar in ein
Compose-Profil gelegt wird und die App ausschließlich über `CUPS_SERVER` konfiguriert wird. Details
in Abschnitt 8.

---

## 3. Ergänzende Betrachtung: warum nicht „CUPS mit ins App-Image"?

Eine vierte, oft gesehene Variante ist, `cupsd` und die FastAPI-App in **einen** Container zu packen
(supervisord/s6). Das wirkt zunächst noch autonomer, ist aber die schlechteste Option für unsere
Anforderungen:

- Zwei Prozesse unter einem PID-1-Supervisor → Signal-/Zombie-Handling, unklare Restart-Semantik.
- Die App kann nicht mehr unabhängig von CUPS aktualisiert werden; jedes App-Update rebootet den
  Print-Server.
- Das App-Image erbt ~200 MB Treiberdaten, die bei jedem App-Release neu gezogen werden.
- Nutzer mit vorhandenem CUPS (Variante A/C) schleppen den toten Ballast mit.

Deshalb bleibt es bei der Sidecar-Trennung.

---

## 4. Variante B im Detail

### 4.1 Verfügbare CUPS-Docker-Images

Geprüft wurden die vier meistgenutzten Kandidaten. Entscheidend sind für uns vier Dinge:
Multi-Arch (amd64 **und** arm64), aktueller Build, mitgelieferte Label-Drucker-Treiber, und ob das
Image ein Persistenz-Konzept für `/etc/cups` mitbringt.

#### `olbat/cupsd`

- **Aktualität**: sehr gut. Docker Hub zeigt wöchentliche Tags (`stable-2026-07-20`, `2026-07-13`,
  `2026-07-06`, …), letzter Push 2026-07-20.
- **Multi-Arch**: `linux/amd64` und `linux/arm64`, mit expliziten Suffix-Tags (`latest-amd64`,
  `latest-arm64`). **Kein armv7** — Raspberry Pi 3 mit 32-Bit-OS fällt raus.
- **Größe**: ~219 MB komprimiert (amd64), ~218 MB (arm64) für `stable-2026-07-20`.
- **Basis**: `debian:stable-slim`.
- **Treiber** (`Dockerfile.stable`): `cups`, `cups-client`, `cups-bsd`, `cups-filters`,
  `foomatic-db-compressed-ppds`, `printer-driver-all`, `openprinting-ppds`, `hpijs-ppds`, `hp-ppd`,
  `hplip`, `smbclient`, `printer-driver-cups-pdf`.
  Das `-testing`-Variant-Dockerfile listet die Treiber explizit auf — inklusive
  `printer-driver-brlaser`, `printer-driver-dymo` und `printer-driver-ptouch`.
- **Persistenz**: ✗ **Kein Entrypoint, kein `/etc/cups`-Backup, kein `VOLUME`.** Das Image kopiert
  eine eigene `cupsd.conf` per `COPY` nach `/etc/cups/cupsd.conf` und startet direkt
  `CMD ["/usr/sbin/cupsd", "-f"]`. Ein leerer **Bind-Mount** auf `/etc/cups` überdeckt damit die
  gesamte Default-Konfiguration und der Container startet nicht sauber.
- **Credentials**: Admin-User ist im Image fest auf `print`/`print` gebacken (`useradd … --password=$(mkpasswd print)`),
  ohne Env-Override.
- **cupsd.conf**: `Listen *:631`, zusätzlich `Listen /run/cups/cups.sock` (nötig, damit die Web-UI-CGIs
  ihren privilegierten Back-Channel bekommen — sonst schlagen Admin-Aktionen trotz korrekter
  Credentials mit „Unauthorized" fehl), `ServerAlias *`, `Browsing Yes`, `DefaultEncryption IfRequested`.
  `<Location />` und `<Location /admin>` stehen auf `Allow all`; die eigentliche Absicherung passiert
  eine Ebene tiefer über `<Policy default>` mit `Require user @SYSTEM` für
  `CUPS-Add-Modify-Printer` etc.

#### `anujdatar/cups`

- **Aktualität**: Images werden monatlich neu gebaut (CalVer-Tags `26.07.01`, `26.06.01`,
  `26.05.01`, …; `latest` = `26.07.01`, gepusht vor ~4 Wochen). Der *Dockerfile-Quellstand* ist seit
  Dezember 2023 unverändert — die monatlichen Rebuilds ziehen aber frische Debian-Pakete, d. h.
  Sicherheitsupdates kommen an.
- **Multi-Arch**: `linux/amd64` (~183 MB), `linux/arm64` (~178–184 MB), **zusätzlich `linux/arm/v7`**
  (~165 MB). Explizit auf Raspberry Pi 3B+ und 4 getestet.
- **Basis**: `debian:stable-slim`.
- **Treiber**: `cups`, `cups-filters`, `printer-driver-all`, `printer-driver-cups-pdf`,
  `printer-driver-foo2zjs`, `foomatic-db-compressed-ppds`, `openprinting-ppds`, `hpijs-ppds`,
  `hp-ppd`, `hplip`, `avahi-daemon`, `usbutils`.
- **Persistenz**: ✓ **Genau das Muster, das wir brauchen.** Das Dockerfile legt
  `RUN cp -rp /etc/cups /etc/cups-bak` an, deklariert `VOLUME ["/etc/cups"]`, und der Entrypoint
  stellt bei Bedarf wieder her:

  ```sh
  if [ ! -f /etc/cups/cupsd.conf ]; then
      cp -rpn /etc/cups-bak/* /etc/cups/
  fi
  ```

  Damit funktioniert sowohl der leere Bind-Mount als auch das leere Named Volume beim Erststart,
  und ein bestehendes Volume wird bei Updates **nicht** überschrieben.
- **Credentials**: über `CUPSADMIN` / `CUPSPASSWORD` konfigurierbar; der Entrypoint legt den User
  bei Bedarf an und steckt ihn in `lpadmin`. Zusätzlich `TZ`.
- **cupsd.conf**: wird zur Build-Zeit per `sed` angepasst — `Listen 0.0.0.0:631`, `Browsing On`,
  `Allow All` in `<Location />`, `Allow All` + `Require user @SYSTEM` in `<Location /admin>`,
  `ServerAlias *`, `DefaultEncryption Never`.
- **Ports**: 631/tcp und 5353/udp (Avahi).

#### Weitere gesichtete Images

- `mwatz1234/cupsd` — Fork von `olbat/cupsd` mit zusätzlichen ARM-Builds (arm64, armv7, armv6).
  Sinnvoll nur, falls man olbats Treiberumfang **und** armv7 braucht; erbt olbats fehlende
  Persistenz.
- `chuckcharlie/cups-avahi-airprint`, `SickHub/docker-cups-airprint`,
  `drpsychick/airprint-bridge` — AirPrint-Relays. Lösen ein anderes Problem (iOS-Discovery) und
  bringen die volle Avahi/D-Bus-Komplexität mit. Für uns irrelevant.
- `Zynthasius39/cupsd` — olbat plus proprietäre Canon-UFR-II-Treiber. Nischenfall.

#### Bewertung und Empfehlung

| | `olbat/cupsd` | `anujdatar/cups` |
| --- | --- | --- |
| Rebuild-Frequenz | wöchentlich | monatlich |
| amd64 / arm64 | ✓ / ✓ | ✓ / ✓ |
| armv7 (Pi 3, 32-Bit) | ✗ | ✓ |
| Größe (komprimiert, amd64) | ~219 MB | ~183 MB |
| brlaser / dymo / ptouch | ✓ (über `printer-driver-all`) | ✓ (über `printer-driver-all`) |
| `printer-driver-cups-pdf` | ✓ | ✓ |
| Persistenz-Entrypoint | ✗ | ✓ |
| Admin-Credentials konfigurierbar | ✗ (`print`/`print` hart) | ✓ (`CUPSADMIN`/`CUPSPASSWORD`) |
| Socket-Listener für Web-UI-Admin | ✓ (`Listen /run/cups/cups.sock`) | ✗ (nur TCP) |

**Empfehlung für den MVP: `anujdatar/cups`, gepinnt auf einen CalVer-Tag** (z. B. `26.07.01`, nicht
`latest`). Ausschlaggebend sind die zwei Punkte, die direkt auf die Auftraggeber-Anforderung
einzahlen: der Persistenz-Entrypoint (Update-Stabilität) und die konfigurierbaren Credentials
(kein hartkodiertes `print`/`print` im Default-Setup). Der Nachteil — seltenere Rebuilds — wird
dadurch abgefedert, dass die monatlichen Builds frische Debian-Pakete ziehen.

> **Wichtiger Fallstrick bei `printer-driver-all`**: Das Paket zieht seine Treiber über
> **`Recommends`**, nicht über `Depends`. Beide Images installieren ohne `--no-install-recommends`,
> daher landen `printer-driver-ptouch`, `printer-driver-dymo` und `printer-driver-brlaser`
> tatsächlich im Image. Würde ein Maintainer jemals `--no-install-recommends` ergänzen, verschwänden
> sämtliche Treiber lautlos. Zusätzlich merkt olbats `-testing`-Dockerfile an, dass
> `printer-driver-all` **aus Debian testing entfernt wurde** — das Paket wird also mit dem nächsten
> Debian-Stable-Release verschwinden. Beide Images tragen dieses Risiko.

### 4.2 Alternative: eigenes schlankes Image im Repo

Ein `docker/cups/Dockerfile` auf Debian-Basis, gebaut per `docker buildx` und veröffentlicht nach
GHCR.

**Dafür spricht:**

- **Explizite Treiberliste** statt `printer-driver-all` → immun gegen dessen Entfernung aus Debian
  und gegen `Recommends`-Semantik.
- **Deutlich kleiner**: ohne `hplip`, `openprinting-ppds`, `hpijs-ppds`, `smbclient` und die
  komplette `foomatic-db-compressed-ppds` landet man erfahrungsgemäß bei ~120–150 MB statt 180–220 MB.
  Für ein Etiketten-Tool ist der HP-Inkjet-Treiberstack schlicht Ballast.
- **Persistenz und Credentials nach unserer Spezifikation**, nicht nach der eines Fremd-Maintainers.
- **Multi-Arch nach unserem Bedarf**: `linux/amd64,linux/arm64` (optional armv7) über
  `docker/build-push-action` — die Treiberpakete sind alle arch-unabhängig verfügbar, es wird nichts
  kompiliert, daher ist der QEMU-Overhead beim Cross-Build vernachlässigbar.
- **Update-Stabilität wird zu unserem Problem** — was hier ein Vorteil ist: wir können den
  Entrypoint-Vertrag (`/etc/cups-bak`) garantieren und in unseren eigenen Integrationstests prüfen.

**Dagegen spricht:**

- Wir übernehmen die Pflege inklusive der Sicherheitsupdates. Das erfordert einen
  **zeitgesteuerten CI-Rebuild** (z. B. wöchentlich per `schedule`-Trigger), sonst ist das eigene
  Image schnell schlechter als jedes gepflegte Fremd-Image.
- Größerer Aufwand vor dem ersten Release.

**Bewertung**: Für den MVP overkill, mittelfristig aber die richtige Antwort — insbesondere wegen
des `printer-driver-all`-Risikos. Empfohlener Pfad: MVP mit `anujdatar/cups` ausliefern, das eigene
Image parallel aufbauen und per Tag-Wechsel in der Compose-Datei umschalten.

Skizze:

```dockerfile
# docker/cups/Dockerfile
FROM debian:trixie-slim

ENV DEBIAN_FRONTEND=noninteractive \
    CUPS_ADMIN=admin \
    CUPS_PASSWORD=changeme \
    TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
      cups \
      cups-client \
      cups-filters \
      cups-ipp-utils \
      printer-driver-ptouch \
      printer-driver-dymo \
      printer-driver-brlaser \
      printer-driver-cups-pdf \
      usbutils \
      ca-certificates \
      tzdata \
      whois \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY cupsd.conf /etc/cups/cupsd.conf
RUN chown root:lp /etc/cups/cupsd.conf \
 && cp -rp /etc/cups /etc/cups-bak

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 631
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD lpstat -r >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/sbin/cupsd", "-f", "-l"]
```

```sh
#!/bin/sh
# docker/cups/entrypoint.sh
set -eu

# 1) Defaults nach /etc/cups spiegeln, falls das Volume leer ist (Erststart)
if [ ! -f /etc/cups/cupsd.conf ]; then
    echo "[entrypoint] /etc/cups ist leer - stelle Defaults aus /etc/cups-bak wieder her"
    cp -rpn /etc/cups-bak/. /etc/cups/
fi

# 2) Fehlende Unterverzeichnisse ergaenzen, ohne bestehende Dateien anzufassen.
#    Faengt den Fall ab, dass ein aelteres Volume neue Default-Dateien nicht kennt.
cp -rpn /etc/cups-bak/. /etc/cups/ 2>/dev/null || true
chown -R root:lp /etc/cups

# 3) Admin-User idempotent anlegen / Passwort setzen
if ! id "$CUPS_ADMIN" >/dev/null 2>&1; then
    useradd -r -G lp,lpadmin -s /usr/sbin/nologin "$CUPS_ADMIN"
fi
echo "${CUPS_ADMIN}:${CUPS_PASSWORD}" | chpasswd

# 4) Laufzeitverzeichnisse
mkdir -p /run/cups /var/spool/cups /var/cache/cups
chown -R root:lp /run/cups /var/spool/cups /var/cache/cups

exec "$@"
```

Der doppelte `cp -rpn` in Schritt 1+2 ist Absicht: Schritt 1 erkennt den Erststart, Schritt 2 fängt
den Fall ab, dass ein *bestehendes* Volume neu hinzugekommene Default-Dateien (z. B. eine neue
`snmp.conf`) noch nicht kennt. `-n` (no-clobber) garantiert, dass nutzereigene Änderungen niemals
überschrieben werden — genau die Update-Stabilität, die gefordert ist.

### 4.3 USB-Passthrough

#### Wie CUPS unter Linux auf USB-Drucker zugreift

Zwei Pfade existieren:

| Pfad | Device-Node | Major | Verwendung |
| --- | --- | --- | --- |
| libusb (Default in aktuellem CUPS) | `/dev/bus/usb/BBB/DDD` | 189 | CUPS-`usb`-Backend spricht direkt über usbfs |
| Kernel-Treiber `usblp` (Legacy) | `/dev/usb/lp0` | 180 | älterer Pfad; CUPS entkoppelt `usblp` normalerweise aktiv |

Für den Container ist **`/dev/bus/usb` der relevante Pfad**. `/dev/usb/lp0` zusätzlich
durchzureichen schadet nicht, löst aber das Problem nicht — und wenn `usblp` das Gerät hält, kann
das libusb-Backend es nicht mehr öffnen (`Device or resource busy`).

#### Die vier Optionen, von unsicher nach sicher

**1. `privileged: true`** — funktioniert immer, inklusive Hotplug (weil `/dev` komplett
durchgereicht und die cgroup-Device-Liste leer, also alles erlaubt ist). Gibt dem Container aber
Zugriff auf *alle* Block- und Character-Devices des Hosts, inklusive Festplatten. **Nicht als
Default.**

**2. `devices: ["/dev/bus/usb:/dev/bus/usb"]`** — der gängigste Ratschlag. Docker läuft beim
Container-Start das Verzeichnis ab und legt für **jeden zu diesem Zeitpunkt existierenden**
Device-Node eine cgroup-Allow-Regel an. Funktioniert, solange der Drucker beim Start eingesteckt ist
und nie abgezogen wird.

**3. Einzelnes Device (`/dev/bus/usb/001/005`)** — maximal restriktiv, aber praktisch unbrauchbar:
die Device-Nummer (`005`) ist eine fortlaufende Zähler-ID, die sich bei **jedem** Ein-/Ausstecken
**und bei jedem Host-Reboot** ändert. Nicht empfehlen.

**4. `devices:` + `device_cgroup_rules:` — die empfohlene Kombination.** Die cgroup-Regel erlaubt
den kompletten usbfs-Major-Bereich, unabhängig davon, welche Minor-Nummer beim Neuanstecken vergeben
wird:

```yaml
services:
  cups:
    devices:
      - /dev/bus/usb:/dev/bus/usb
    device_cgroup_rules:
      - 'c 189:* rmw'      # usbfs: alle USB-Geraete, Character-Device Major 189
```

`device_cgroup_rules` ist Teil der aktuellen Compose Spec und von Docker Compose v2 unterstützt.
(Historische Warnung: in den alten `version: "3.x"`-Schemata war das Feld zeitweise nicht erlaubt —
die versionslose Compose-Spec-Datei, die wir ohnehin schreiben, ist davon nicht betroffen.)

#### Hotplug: was beim Ein-/Ausstecken wirklich passiert

Drei Ebenen müssen stimmen, und `devices:` allein deckt nur zwei davon ab:

1. **Sichtbarkeit des Node im Container.** `/dev/bus/usb` wird per Bind-Mount durchgereicht; neue
   Nodes, die der Host-`devtmpfs` nach Container-Start anlegt, erscheinen bei einem Verzeichnis-
   Bind-Mount im Container. (Bei `--device` ohne Verzeichnis-Mount erscheinen sie **nicht**.)
2. **cgroup-Erlaubnis.** Ohne `device_cgroup_rules` gilt die Allow-Liste vom Container-Start →
   der neue Minor wird vom Kernel mit `EPERM` blockiert, obwohl der Node sichtbar ist. Das ist der
   Grund für das klassische „nach dem Wiedereinstecken druckt es nicht mehr, bis ich den Container
   neu starte".
3. **CUPS-seitige Neuerkennung.** Selbst mit korrektem Node und cgroup: Die in `printers.conf`
   hinterlegte Device-URI muss stabil bleiben. Verwendet man eine URI der Form
   `usb://Brother/QL-800?serial=000J1Z123456`, findet das libusb-Backend das Gerät nach dem
   Wiedereinstecken über die Seriennummer wieder — unabhängig von Bus/Device-Nummer. Verwendet man
   dagegen eine positionsbasierte URI, bricht es. **Wir sollten in der Doku explizit dazu raten, die
   von `lpinfo -v` gemeldete `?serial=`-URI zu übernehmen.**

#### udev-Fallstricke

- Im Container läuft **kein** `udevd`. Das ist für CUPS unkritisch, weil das libusb-Backend beim
  `lpinfo -v` selbst über usbfs enumeriert und nicht auf udev-Events wartet.
- Auf dem **Host** dagegen gelten die üblichen Regeln: Läuft dort ebenfalls ein `cupsd` oder ein
  `ipp-usb`-Daemon, greift dieser das Gerät ab und der Container bekommt `Device or resource busy`.
  In der Doku als erste Debug-Frage aufnehmen: „Läuft auf dem Host ein CUPS oder `ipp-usb`?"
- Gerätepermissions: Die Nodes unter `/dev/bus/usb` gehören auf dem Host meist `root:root` mit
  `0664` und werden von udev je nach Distribution auf `plugdev`/`lp` umgesetzt. Der `cupsd` im
  Container läuft als `root` und ist davon nicht betroffen — ein weiterer Grund, den CUPS-Sidecar
  **nicht** mit `user:` auf einen unprivilegierten Nutzer zu zwingen.

#### Empfehlung

`devices:` + `device_cgroup_rules: ['c 189:* rmw']` als Default, `privileged: true` nur als
dokumentierter Notnagel für exotische Kernel/NAS-Systeme. Und in der Doku darauf hinweisen, dass
Etikettendrucker im Dauerbetrieb ohnehin selten umgesteckt werden — der Hotplug-Fall ist wichtig,
aber nicht kritisch.

### 4.4 Persistenz

#### Welche Verzeichnisse zählen

| Pfad | Inhalt | Persistieren? |
| --- | --- | --- |
| `/etc/cups` | `cupsd.conf`, `printers.conf`, `classes.conf`, `subscriptions.conf`, `ppd/*.ppd`, `client.conf` | **Ja — das ist die Druckerkonfiguration** |
| `/etc/cups/ppd/` | Die pro Drucker generierten PPDs | Ja (Unterverzeichnis von oben) |
| `/var/spool/cups` | Job-Control-Dateien (`c00001`) und Spool-Daten (`d00001-001`) | **Nein, bewusst nicht** — siehe unten |
| `/var/cache/cups` | `job.cache`, PPD-Cache, `ppds.dat` (Treiberindex) | Nein — wird beim Start regeneriert; ein veralteter Cache nach einem Image-Update ist eine aktive Fehlerquelle |
| `/var/log/cups` | `error_log`, `access_log`, `page_log` | Optional; für Support-Fälle nützlich |
| `/etc/shadow` / `/etc/passwd` | CUPS-Admin-User | Nein — der Entrypoint legt ihn bei jedem Start aus Env-Variablen neu an |

Zu `/var/spool/cups`: Das Persistieren wirkt intuitiv richtig, ist aber schädlich. Nach einem
Container-Update stehen dort Jobs mit Verweisen auf PPDs und Filter-Pfade der *alten* Image-Version.
CUPS versucht diese beim Start zu reaktivieren, was zu hängenden Queues und `Filter failed` führt.
Ein Etikettendruck ist ein Sekunden-Vorgang — es gibt keinen Grund, Jobs über Neustarts zu retten.
Die App sollte ihren eigenen Job-Status in ihrer eigenen DB führen (Abschnitt 7) und beim Start
verlorene Jobs als `unknown` markieren.

#### Der Erststart-Fallstrick im Detail

Docker verhält sich bei den zwei Mount-Typen **unterschiedlich**, und genau hier entsteht die
Verwirrung:

- **Named Volume, leer, auf ein Verzeichnis, das im Image Inhalt hat**: Docker kopiert den
  Image-Inhalt beim allerersten Anlegen des Volumes hinein. `/etc/cups` ist danach korrekt gefüllt.
  Scheint zu funktionieren.
- **Bind-Mount (Host-Pfad) auf dasselbe Verzeichnis**: Docker kopiert **nichts**. Der Host-Pfad
  überdeckt `/etc/cups` vollständig; `cupsd` findet keine `cupsd.conf` und stirbt bzw. startet mit
  Compiled-in-Defaults, die nur auf `localhost` lauschen.

Damit hat man zwei Probleme:

1. Wer in der Doku ein Bind-Mount empfiehlt (weil Nutzer die Config gerne im Repo-Verzeichnis
   sehen), bricht den Erststart.
2. Selbst mit Named Volume greift die Vorbefüllung **nur einmal**. Bringt ein späteres Image-Update
   eine geänderte Default-`cupsd.conf` mit (neue Direktive, geänderte Policy), kommt sie nie im
   Volume an. Das ist der stille Langzeit-Drift, der Update-Prozesse instabil macht.

#### Die robuste Lösung

Das Standardmuster, das `anujdatar/cups` bereits implementiert und das wir für ein eigenes Image
übernehmen sollten:

1. Zur **Build-Zeit** die fertige Default-Konfiguration nach `/etc/cups-bak` sichern
   (`RUN cp -rp /etc/cups /etc/cups-bak`).
2. Im **Entrypoint** vor dem `cupsd`-Start prüfen und ergänzen — mit `cp -rpn` (no-clobber), sodass
   fehlende Dateien aufgefüllt, vorhandene aber nie überschrieben werden.

Damit funktionieren Bind-Mount und Named Volume gleichermaßen, der Erststart ist sauber, spätere
Updates ergänzen neue Default-Dateien und lassen nutzereigene Änderungen in Ruhe. Siehe das
Entrypoint-Skript in Abschnitt 4.2.

Eine sinnvolle Ergänzung ist ein **Config-Backup vor jedem Start**:

```sh
# im Entrypoint, vor dem cupsd-Start
if [ -f /etc/cups/printers.conf ]; then
    cp -p /etc/cups/printers.conf "/etc/cups/printers.conf.bak"
fi
```

CUPS selbst legt bereits `printers.conf.O` (old) an, aber ein zusätzlicher, von uns kontrollierter
Snapshot macht Support-Fälle deutlich einfacher.

#### Empfehlung für die Compose-Datei

**Named Volume**, nicht Bind-Mount — weil es unabhängig von Host-UID/Permissions funktioniert und
auf NAS-Systemen mit exotischen Dateisystemen deutlich weniger Ärger macht:

```yaml
volumes:
  cups-config:

services:
  cups:
    volumes:
      - cups-config:/etc/cups
```

Und in der Doku ein Backup-Rezept mitliefern, damit „Named Volume = unsichtbar" nicht als Nachteil
empfunden wird:

```bash
# Druckerkonfiguration sichern
docker compose exec cups tar -cf - -C /etc/cups . > cups-config-backup.tar

# Wiederherstellen
docker compose exec -T cups tar -xf - -C /etc/cups < cups-config-backup.tar
docker compose restart cups
```

### 4.5 Netzwerk, Erreichbarkeit und Absicherung

#### Warum die Default-Config nicht reicht

Debian liefert `cupsd.conf` mit `Listen localhost:631` aus. Im Container bedeutet das: nur die
Container-eigene Loopback-Adresse — weder der App-Container noch der Nutzer kommen dran. Ein
CUPS-Image, das das nicht anpasst, ist unbrauchbar; beide geprüften Images tun es (olbat via
`COPY cupsd.conf`, anujdatar via `sed` zur Build-Zeit).

#### Die nötigen Direktiven

```apache
# /etc/cups/cupsd.conf

# Auf allen Container-Interfaces lauschen.
# Die Isolation macht Docker (Port-Mapping), nicht cupsd.
Listen 0.0.0.0:631

# Unix-Socket: die Web-UI-CGIs oeffnen darueber einen privilegierten Back-Channel
# zu cupsd. Ohne diesen Listener schlagen Admin-Aktionen in der Web-UI mit
# "Unauthorized" fehl, obwohl die Credentials stimmen.
Listen /run/cups/cups.sock

# Der Container wird unter wechselnden Namen angesprochen (Service-Name "cups",
# Container-IP, Host-IP). Ohne ServerAlias lehnt cupsd Requests mit
# "Bad Request" wegen Host-Header-Mismatch ab.
ServerAlias *

WebInterface Yes
DefaultAuthType Basic
DefaultEncryption IfRequested

# Wiederholversuche statt sofortigem Abbruch, wenn der Drucker kurz weg ist
ErrorPolicy retry-job

<Location />
  Order allow,deny
  Allow @LOCAL
</Location>

<Location /admin>
  Order allow,deny
  Allow @LOCAL
</Location>

<Location /admin/conf>
  AuthType Default
  Require user @SYSTEM
  Order allow,deny
  Allow @LOCAL
</Location>

<Location /admin/log>
  AuthType Default
  Require user @SYSTEM
  Order allow,deny
  Allow @LOCAL
</Location>
```

Zu `Allow @LOCAL` vs. `Allow all`: `@LOCAL` erlaubt alle Adressen aus direkt angeschlossenen
Subnetzen — im Bridge-Netz von Docker ist das genau das Compose-Netzwerk plus der Host. Das ist
strenger als `Allow all` (was beide geprüften Images setzen) und für unseren Fall ausreichend.
Wichtig: Die eigentliche Absicherung administrativer Operationen passiert unabhängig davon auf der
**Policy-Ebene** (`<Policy default>` mit `Require user @SYSTEM` für `CUPS-Add-Modify-Printer`,
`CUPS-Delete-Printer`, `Pause-Printer`, …). `Allow all` in `<Location />` heißt also nicht, dass
jeder Drucker anlegen darf — es heißt nur, dass jeder eine HTTP-Verbindung aufbauen darf.

#### Port-Exposition: der wichtigste Sicherheitspunkt

Der Default darf **niemals** `ports: ["631:631"]` sein. Das bindet auf `0.0.0.0` des Hosts, und
falls der Host eine öffentliche IP hat oder der Router Port-Forwarding macht, hängt eine
CUPS-Admin-Oberfläche mit bekannten Default-Credentials im Internet.

```yaml
services:
  cups:
    ports:
      # Default: nur vom Host selbst erreichbar (SSH-Tunnel / lokaler Browser)
      - "127.0.0.1:631:631"
```

Für Nutzer, die die Web-UI aus dem LAN brauchen (der Normalfall bei einem Headless-NAS), eine
dokumentierte, bewusste Opt-in-Variante über eine `.env`-Variable:

```yaml
services:
  cups:
    ports:
      - "${CUPS_BIND_ADDRESS:-127.0.0.1}:631:631"
```

```dotenv
# .env
# 127.0.0.1 = nur lokal (Default, empfohlen)
# 0.0.0.0   = im gesamten LAN erreichbar - nur setzen, wenn CUPS_PASSWORD geaendert wurde!
CUPS_BIND_ADDRESS=127.0.0.1
CUPS_ADMIN=admin
CUPS_PASSWORD=changeme
```

Ergänzend sollte der Entrypoint beim Start **warnen**, wenn `CUPS_PASSWORD` noch auf dem
Default-Wert steht — das ist billig zu implementieren und fängt den häufigsten Fehler ab.

Der App-Container braucht das Port-Mapping übrigens gar nicht: Er erreicht `cups:631` über das
Compose-interne Netzwerk. Das Mapping existiert ausschließlich für die menschliche Administration.

### 4.6 Avahi / mDNS

**Kurz: für unseren Anwendungsfall nicht nötig, und im Container teuer.**

Wozu man es bräuchte:

- **DNS-SD-Discovery von Netzwerkdruckern** (`lpinfo -v` zeigt `dnssd://…`-URIs) für
  driverless/IPP-Everywhere-Drucker.
- **Advertising unserer eigenen Queues** in Richtung iOS/macOS (AirPrint) — für uns irrelevant.

Wogegen es spricht:

- **Port-Kollision auf 5353/udp.** Läuft der Container in `network_mode: host` (was Avahi praktisch
  voraussetzt, weil mDNS Multicast im Bridge-Netz nicht durchkommt), kollidiert er mit dem
  Host-Avahi, den nahezu jedes NAS für SMB-/AFP-Advertising betreibt. Typisches Symptom im Log:
  `bind() failed: Address in use`, gefolgt von `Failed to create IPv4 socket, proceeding in IPv6
  only mode` — und danach funktioniert Discovery scheinbar, aber unzuverlässig.
- **Der D-Bus-Fallstrick.** Viele Anleitungen (auch olbats README) empfehlen
  `-v /var/run/dbus:/var/run/dbus`. Das ist gefährlich: Der Container startet einen eigenen
  `dbus-daemon`, der in dieses geteilte Verzeichnis schreibt und den **System-D-Bus-Socket des Hosts
  überschreibt**. Auf Systemd-Hosts bringt das systemd-Kommunikation, `smartd` und
  NAS-Management-Oberflächen zum Erliegen, bis der Container entfernt wird. **Diesen Mount niemals
  in unsere Doku aufnehmen.**
- `network_mode: host` bricht gleichzeitig die Compose-DNS-Auflösung — die App könnte den Sidecar
  nicht mehr über `cups:631` erreichen, sondern nur noch über `localhost:631`.

**Empfehlung**: Avahi im Default-Setup deaktiviert lassen. Netzwerkdrucker werden über eine
explizite URI eingebunden, was ohnehin die stabilere Variante ist:

```bash
# IPP-Everywhere / driverless (moderne Netzwerkdrucker)
lpadmin -p QL800 -E -v ipp://192.0.2.50/ipp/print -m everywhere

# Rohes Socket/JetDirect (Zebra, viele Label-Drucker)
lpadmin -p ZD420 -E -v socket://192.0.2.51:9100 -m drv:///…

# USB mit stabiler Seriennummern-URI
lpadmin -p QL800 -E -v "usb://Brother/QL-800?serial=000J1Z123456" \
        -P /usr/share/ppd/ptouch/Brother-QL-800-ptouch.ppd
```

Eine IP-basierte URI erfordert eine DHCP-Reservierung für den Drucker — das ist ein Doku-Satz und
löst das Problem dauerhaft besser als mDNS, dessen Namensauflösung selbst wieder ausfallen kann.

Für Nutzer, die Discovery unbedingt wollen, dokumentieren wir `network_mode: host` als Alternative
inklusive der Warnung zur 5353-Kollision — aber **ohne** den D-Bus-Mount.

---

## 5. Python-Anbindung an CUPS

### 5.1 `pycups`

Die offizielle Python-Bindung des OpenPrinting-Projekts, ein dünner C-Wrapper um `libcups`.

- **Version**: 2.0.4 (Release 2024-04-18).
- **Distribution auf PyPI**: **ausschließlich sdist** (`pycups-2.0.4.tar.gz`), **keine Wheels**.
  `pip install pycups` kompiliert also immer — und braucht dafür `gcc` und `libcups2-dev`.

**Funktioniert es gegen einen entfernten CUPS-Server?** Ja, uneingeschränkt. `libcups` spricht IPP
über TCP; „lokal" ist nur der Default. Zwei Wege:

```python
import cups

cups.setServer("cups")        # Compose-Service-Name des Sidecars
cups.setPort(631)
cups.setUser("admin")
cups.setPasswordCB(lambda prompt: "changeme")
# cups.setEncryption(cups.HTTP_ENCRYPT_REQUIRED)  # nur bei TLS-CUPS (Variante C)

conn = cups.Connection()
printers = conn.getPrinters()
```

Wichtig: `setServer`/`setUser`/`setPasswordCB` sind **prozessglobale** Zustände in libcups und
müssen **vor** `cups.Connection()` gesetzt sein. In einem async-Webserver mit mehreren Worker-Threads
ist das eine echte Falle — die saubere Lösung ist, den State genau einmal beim App-Start zu setzen
und pro Aufruf eine frische `Connection` zu erzeugen.

Alternativ und deutlich robuster: **`CUPS_SERVER` als Environment-Variable**. libcups liest den
Server in dieser Reihenfolge: `CUPS_SERVER` → `~/.cups/client.conf` → `/etc/cups/client.conf`. Die
Env-Variable überschreibt beide Dateien. Damit ist die Server-Wahl reine Deployment-Konfiguration und
taucht im Code gar nicht auf:

```yaml
services:
  labeler:
    environment:
      CUPS_SERVER: "cups:631"
```

**Der Compiler-Punkt und wie man ihn umgeht.** Die Anforderung lautet, dass Multi-Arch-Builds nicht
an nativen Extensions scheitern dürfen. `pip install pycups` unter QEMU-emuliertem arm64 funktioniert,
kostet aber Build-Zeit und schleppt eine Toolchain ins Image (oder erzwingt einen Multi-Stage-Build).
Die deutlich elegantere Lösung: **das Distro-Paket nehmen**.

`python3-cups` ist in Debian für alle relevanten Architekturen als vorkompiliertes Binärpaket
vorhanden (in Trixie Version `2.0.4-2+b2`, inklusive arm64) — exakt dieselbe pycups-Version wie auf
PyPI. `apt-get install python3-cups` ist arch-nativ, braucht **null Kompilierung**, und der
Multi-Arch-Build ist damit genauso schnell wie ein reiner Python-Build:

```dockerfile
FROM python:3.12-slim-trixie

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3-cups \
      libcups2 \
      cups-client \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Distro-pycups fuer das venv sichtbar machen
ENV PYTHONPATH=/usr/lib/python3/dist-packages
```

Der Preis: Das `dist-packages`-Verzeichnis muss über `PYTHONPATH` oder ein venv mit
`--system-site-packages` erreichbar gemacht werden, und die Python-Minor-Version des Images muss zur
Debian-Python-Version passen. Bei einem `python:3.12-slim-trixie`-Image (Trixie liefert Python 3.13)
passt das **nicht** automatisch — hier ist entweder ein `debian:trixie-slim`-Basisimage mit
`python3` aus der Distro die einfachere Wahl, oder man kompiliert pycups doch per pip. Beide Wege
sind gangbar; die Distro-Variante ist für Multi-Arch deutlich angenehmer.

**Blocking-Problem**: pycups ist synchron und blockiert den Thread. In FastAPI **niemals direkt in
einer `async def`-Route aufrufen**, sonst steht der gesamte Event-Loop:

```python
import anyio, cups

async def list_printers() -> dict:
    def _work():
        return cups.Connection().getPrinters()
    return await anyio.to_thread.run_sync(_work)
```

### 5.2 `pyipp` und reine IPP-Bibliotheken

`pyipp` (Chris Talkington) ist ein asynchroner IPP-Client: Version 0.17.2 (2025-06-15), **reines
Python mit Wheel** auf PyPI, Abhängigkeiten `aiohttp`, `yarl`, `deepmerge`, `backoff`,
`awesomeversion`. Wird von Home Assistant für dessen IPP-Integration verwendet.

**Vorteile:**

- Keine nativen Extensions → Multi-Arch-Builds trivial, kein `libcups2-dev`, kein Compiler.
- Nativ async, passt bruchlos in FastAPI.
- Spricht IPP direkt über HTTP — funktioniert auch gegen Drucker **ohne** CUPS dazwischen.

**Nachteile:**

- Der Schwerpunkt liegt klar auf **Monitoring**, nicht auf Job-Submission. Die Doku für
  `Print-Job` / `Create-Job` + `Send-Document` ist dünn; es existiert ein offener Issue, in dem
  genau das nachgefragt wird (ctalkington/python-ipp#105).
- Kein Zugriff auf CUPS-spezifische Operationen (`CUPS-Get-Printers`, `CUPS-Add-Modify-Printer`,
  PPD-Handling). Für ein Tool, das Etikettenformate als PPD-Optionen setzt, ist das eine spürbare
  Lücke.
- Deutlich kleinere Nutzerbasis als pycups.

**Bewertung**: Sehr gute Wahl für **Status-Polling** (Abschnitt 7), riskante Wahl als alleinige
Submission-Schnittstelle im MVP.

### 5.3 CUPS-CLI (`lp`, `lpstat`, `lpadmin`)

Erfordert nur das Paket `cups-client` im App-Image (~2 MB) — keine Bindings, kein Compiler, perfekt
Multi-Arch.

```python
import asyncio, os

async def print_pdf(printer: str, pdf_path: str, copies: int = 1) -> str:
    env = {**os.environ, "CUPS_SERVER": os.environ["CUPS_SERVER"]}
    proc = await asyncio.create_subprocess_exec(
        "lp", "-d", printer, "-n", str(copies), "--", pdf_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(err.decode())
    # "request id is QL800-42 (1 file(s))"
    return out.decode().split("request id is ")[1].split()[0]
```

**Vorteile:** null Build-Komplexität, nativ async über `create_subprocess_exec`, dieselbe
`CUPS_SERVER`-Semantik wie pycups.

**Nachteile:**

- **Parsing statt API.** `lpstat`-Ausgaben sind lokalisiert und formatinstabil. Ein
  `LC_ALL=C`-Zwang ist Pflicht, aber selbst dann ist das Parsing fragil.
- **Deutlich schlechtere Statusinformationen.** Die für uns wichtigen IPP-Attribute
  (`job-state-reasons`, `job-impressions-completed`) sind über `lpstat` nur unvollständig oder gar
  nicht erreichbar. Genau daran hängt aber Anforderung 5 dieses Dokuments.

**Shell-Injection-Risiko:** Real, aber vollständig vermeidbar. Drei Regeln:

1. **Niemals `shell=True`**, niemals f-String-Kommandozeilen. `create_subprocess_exec` mit
   Argumentliste übergibt direkt an `execve()` — es gibt keine Shell, die etwas interpretieren
   könnte.
2. **`--` vor dem Dateipfad**, damit ein Pfad, der mit `-` beginnt, nicht als Option gelesen wird.
   (Das ist kein Injection-, aber ein Argument-Injection-Vektor.)
3. **Druckernamen gegen eine Allowlist validieren**, die aus `CUPS-Get-Printers` stammt. Ein vom
   Nutzer frei wählbarer `-d`-Wert ist die eigentliche Angriffsfläche:

```python
import re
PRINTER_NAME_RE = re.compile(r"\A[A-Za-z0-9_.-]{1,127}\Z")

def validate_printer(name: str, known: set[str]) -> str:
    if not PRINTER_NAME_RE.match(name) or name not in known:
        raise ValueError(f"unbekannter Drucker: {name!r}")
    return name
```

Auch die von der App erzeugten PDF-Pfade sollten aus einem festen Arbeitsverzeichnis mit
generierten Dateinamen stammen und nie aus Nutzereingaben.

### 5.4 Empfehlung

**Für den MVP: pycups als primäre Schnittstelle, über das Distro-Paket `python3-cups` installiert.**

Begründung:

1. **Statusqualität ist das Kernargument.** Anforderung 5 verlangt eine belastbare Unterscheidung
   zwischen „liegt in der Queue" und „wurde gedruckt". `conn.getJobAttributes(job_id)` liefert
   `job-state`, `job-state-reasons`, `job-impressions-completed` und `job-printer-state-message` in
   einem Aufruf und als typisierte Python-Objekte. Über die CLI ist das nicht sauber zu bekommen.
2. **Kein Compiler nötig**, wenn man `python3-cups` per apt installiert — der Multi-Arch-Einwand
   entfällt damit vollständig. Die Debian-Version ist identisch zur PyPI-Version (2.0.4).
3. **Remote funktioniert transparent** über `CUPS_SERVER` — derselbe Code deckt Variante A, B und C
   ab, ohne Fallunterscheidung.
4. **PPD- und Optionshandling**: Etikettenformate (`media`, `PageSize`, `Resolution`,
   `BrCutAtEnd` bei Brother QL) werden als Optionen-Dict an `printFile()` übergeben. Reine
   IPP-Bibliotheken zwingen hier zu deutlich mehr Handarbeit.

Konkret:

```python
# app/printing/cups_client.py
import os, anyio, cups

def _connect() -> "cups.Connection":
    # CUPS_SERVER aus der Umgebung wird von libcups automatisch beruecksichtigt.
    if user := os.getenv("CUPS_USER"):
        cups.setUser(user)
        pw = os.getenv("CUPS_PASSWORD", "")
        cups.setPasswordCB(lambda prompt: pw)
    return cups.Connection()

async def submit(printer: str, pdf_path: str, title: str,
                 options: dict[str, str] | None = None) -> int:
    def _work() -> int:
        conn = _connect()
        return conn.printFile(printer, pdf_path, title, options or {})
    return await anyio.to_thread.run_sync(_work)

async def job_attributes(job_id: int) -> dict:
    def _work() -> dict:
        return _connect().getJobAttributes(job_id, requested_attributes=[
            "job-state", "job-state-reasons", "job-impressions-completed",
            "job-printer-state-message", "time-at-completed", "job-name",
        ])
    return await anyio.to_thread.run_sync(_work)
```

**Dokumentierte Ergänzungen**, nicht Ersatz:

- **`cups-client` zusätzlich ins App-Image** (~2 MB). `lpstat -r`, `lpinfo -v` und `lpadmin` sind
  für den Healthcheck und für Support-Sessions (`docker compose exec labeler lpstat -t`) Gold wert.
- **`pyipp` als Option für ein späteres Status-Polling**, falls sich das Threadpool-Polling mit
  pycups unter Last als Engpass erweist. Ein sauber abstrahiertes `PrintBackend`-Protocol im Code
  hält diese Tür offen und kostet fast nichts.

**Klar nicht empfohlen**: `lp`-Subprocess als *einzige* Schnittstelle. Die Ersparnis (kein
`python3-cups`) steht in keinem Verhältnis zum Verlust an Statusinformation.

---

## 6. PDF-Rendering: HTML+CSS mit exakten Millimeter-Maßen

### 6.1 Die Anforderung

Ein Brother-QL-Endlosetikett mit 62 mm Breite und 29 mm Länge muss als PDF mit **exakt**
62 mm × 29 mm MediaBox herauskommen. Weicht das PDF auch nur um Zehntelmillimeter ab, skaliert CUPS
(bzw. der Ghostscript-Filter) das Ergebnis auf die PPD-Seitengröße — mit sichtbar unscharfem Text
und verschobenen Rändern. Bei einem Etikett von 29 mm Höhe fallen 0,3 mm Versatz sofort auf.

### 6.2 Vergleich

| Kriterium | WeasyPrint | Playwright / Chromium | wkhtmltopdf |
| --- | --- | --- | --- |
| Aktuelle Version | 69.0 | laufend | 0.12.6 (Juni 2020) |
| Wartungsstand | aktiv (CourtBouillon) | aktiv (Microsoft) | **Repo am 2023-01-02 archiviert** |
| `@page { size: 62mm 29mm }` | ✓ CSS Paged Media ist die Kern-Domäne | ⚠ dokumentierter Rundungsfehler | ⚠ nur über `--page-width/--page-height` |
| Image-Zuwachs | ~50–80 MB (Pango/HarfBuzz + Python-Deps) | **~300–500 MB** (Chromium + X-Libs) | ~80 MB (QtWebKit) |
| arm64 | ✓ (Pango via apt, Python-Deps mit arm64-Wheels) | ⚠ zusätzliche Build-Komplexität, große Images | ⚠ inoffizielle Builds |
| JavaScript | nein | ja | eingeschränkt |
| Moderne CSS | Flexbox ✓, Grid teilweise | vollständig | Stand ~2012, kein Flexbox/Grid |
| Netzwerkzugriff aus Templates unterbindbar | ✓ sauber über `url_fetcher` | ⚠ nur über Request-Interception / Sandbox-Flags | ✗ CVE-2022-35583 (SSRF, CVSS 9.8) |
| Speicher / Startzeit | gering, In-Process | hoher RAM-Bedarf, Browser-Prozess pro Render | mittel |

### 6.3 Bewertung im Einzelnen

**wkhtmltopdf — ausgeschlossen.** Das Upstream-Repository wurde am 2023-01-02 archiviert; die letzte
Stable-Version stammt aus Juni 2020. Es basiert auf QtWebKit, das seit 2016 aus keinem offiziellen
Qt-Release mehr ausgeliefert wird und keine Sicherheitsupdates mehr erhält. CVE-2022-35583 (SSRF,
CVSS 9.8) bleibt dauerhaft offen. Für eine Anwendung, die HTML aus nutzerdefinierten Templates
rendert, ist das nicht vertretbar.

**Playwright/Chromium — überdimensioniert und ausgerechnet beim Kernkriterium schwach.** Für
allgemeines HTML-Rendering die genaueste Engine, aber:

- Es existiert ein dokumentierter Bug in der PDF-Seitengrößenberechnung: Chromium rechnet
  intern in Zoll, und die Konvertierung in `crPdf.ts` (`PagePaperFormats`,
  `convertPrintParameterToInches()`) rundet so, dass A4 als **210,2 mm × 297,3 mm** statt
  210 mm × 297 mm herauskommt (microsoft/playwright#31263, geschlossen). Das betrifft die
  benannten Formate; explizite `width`/`height`-Angaben in `page.pdf()` sind besser, aber genau
  diese Rundungslogik ist die Ursache und nicht auf A-Formate beschränkt. Für Etiketten, wo genau
  diese Genauigkeit das Kernkriterium ist, ist das ein schlechtes Vorzeichen.
- ~300–500 MB Image-Zuwachs — auf einem Raspberry Pi mit SD-Karte relevant.
- Ein Browser-Prozess pro Render; ohne Warm-Pool 300–800 ms Latenz und mehrere hundert MB RAM.
  Auf einem Pi 4 neben Spoolman ist das spürbar.
- Chromium führt JavaScript und lädt externe Ressourcen aus — die Absicherung gegen SSRF aus
  Templates ist mehr Arbeit als bei WeasyPrint.

**WeasyPrint — die passende Wahl.** Eine reine Python-Implementierung von CSS 2.1 Paged Media plus
Teilen von CSS Level 3. Der Renderpfad ist HTML parsen → Render-Tree → CSS anwenden → Textshaping
über Pango/HarfBuzz → PDF über `pydyf`. Kein Browser, keine V8, kein DOM über das hinaus, was CSS
braucht.

- **Physische Maße sind das Kerngeschäft.** `@page { size: 62mm 29mm; margin: 0 }` wird direkt in
  die PDF-MediaBox übersetzt, ohne Zoll-Zwischenschritt.
- **Sicherheit ist gut lösbar**: WeasyPrint erlaubt einen eigenen `url_fetcher`, mit dem sich
  jeglicher Netzwerkzugriff aus Templates hart unterbinden lässt (siehe unten). Das ist eine
  saubere, dokumentierte API — kein Nachrüsten über Interception-Hooks.
- **Kleinster Footprint** der drei Kandidaten und deterministisch: dasselbe HTML erzeugt auf amd64
  und arm64 dasselbe PDF, solange dieselben Schriften installiert sind.
- **Einschränkung**: kein JavaScript, und die CSS-Grid-Unterstützung ist gegenüber einem Browser
  eingeschränkt. Für Etikettenlayouts (absolute Positionierung, Flexbox, Tabellen) ist das kein
  Problem — sollte aber in der Template-Doku stehen.

### 6.4 Empfehlung: WeasyPrint

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 \
      libpangoft2-1.0-0 \
      libharfbuzz-subset0 \
      fonts-dejavu-core \
 && apt-get clean && rm -rf /var/lib/apt/lists/*
```

```python
# app/rendering/pdf.py
from pathlib import Path
from weasyprint import HTML, CSS
from weasyprint.urls import default_url_fetcher

ASSET_ROOT = Path("/app/assets").resolve()

def sandboxed_url_fetcher(url: str, timeout: int = 10, ssl_context=None):
    """Erlaubt ausschliesslich data:-URIs und Dateien unterhalb von ASSET_ROOT.
    Verhindert SSRF und lokales Path-Traversal aus Templates."""
    if url.startswith("data:"):
        return default_url_fetcher(url, timeout, ssl_context)
    if url.startswith("file://"):
        target = Path(url[7:].split("?", 1)[0]).resolve()
        if target.is_relative_to(ASSET_ROOT):
            return default_url_fetcher(url, timeout, ssl_context)
    raise ValueError(f"externer Zugriff aus Template blockiert: {url!r}")

LABEL_CSS = CSS(string="""
@page { size: 62mm 29mm; margin: 0; }
html, body { margin: 0; padding: 0; width: 62mm; height: 29mm; }
""")

def render_label(html: str, out_path: Path) -> Path:
    HTML(string=html, base_url=str(ASSET_ROOT),
         url_fetcher=sandboxed_url_fetcher).write_pdf(out_path, stylesheets=[LABEL_CSS])
    return out_path
```

Zwei Praxishinweise:

- **`@page`-Größe und PPD-Größe müssen übereinstimmen.** Ein 62 mm × 29 mm PDF auf eine als
  `62mm × 100mm` konfigurierte Queue geschickt wird von CUPS zentriert oder skaliert. In der
  `lpadmin`-Doku dieselben Maße verwenden und beim Submit explizit
  `options={"media": "Custom.62x29mm", "fit-to-page": "false"}` setzen.
- **Schriften ins Image legen.** WeasyPrint rendert mit den im Container installierten Schriften.
  Fehlt die im Template referenzierte Familie, fällt Pango still auf einen Ersatz zurück und die
  Textbreite ändert sich — bei einem 62-mm-Etikett bricht das schnell um. `fonts-dejavu-core` als
  Basis, plus die tatsächlich genutzte Familie explizit installieren oder als `@font-face` mit
  lokaler Datei einbinden.

---

## 7. Druckerstatus über IPP/CUPS

### 7.1 Die relevanten Attribute

**`job-state`** (RFC 8011 §5.3.7, `type1 enum`):

| Wert | Name | Bedeutung |
| --- | --- | --- |
| 3 | `pending` | Job ist angenommen und wartet auf Bearbeitung |
| 4 | `pending-held` | Job wartet, ist aber blockiert (Auth fehlt, angehalten, Ressource fehlt) |
| 5 | `processing` | Job wird gerade verarbeitet/gedruckt |
| 6 | `processing-stopped` | Verarbeitung begonnen, aber unterbrochen (Papier leer, Deckel offen, Gerät offline) |
| 7 | `canceled` | Durch Nutzer oder Operator abgebrochen |
| 8 | `aborted` | Durch das System abgebrochen (Fehler) |
| 9 | `completed` | Verarbeitung abgeschlossen |

Die Zustände 7, 8 und 9 sind **terminal**; ab dort ändert sich `job-state` nicht mehr.

**`job-state-reasons`** (`1setOf type2 keyword`) — liefert das *Warum* und ist der eigentlich
informative Teil. Für uns relevant:

| Keyword | Bedeutung |
| --- | --- |
| `none` | kein besonderer Grund |
| `job-incoming` | Job wird noch übertragen |
| `job-data-insufficient` | Job angelegt, Daten noch nicht vollständig |
| `job-printing` | wird gerade physisch gedruckt (CUPS setzt das während `processing`) |
| `job-completed-successfully` | fehlerfrei abgeschlossen |
| `job-completed-with-warnings` | abgeschlossen, mit Warnungen |
| `job-completed-with-errors` | abgeschlossen, Ausgabe möglicherweise unvollständig |
| `job-canceled-by-user` | Abbruch durch den Eigentümer |
| `job-canceled-by-operator` | Abbruch durch einen Administrator |
| `aborted-by-system` | Systemabbruch, z. B. Filter-Crash |
| `document-format-error` | PDF wurde nicht akzeptiert |
| `printer-stopped` | Ziel-Queue ist gestoppt |
| `printer-stopped-partly` | Teil einer Klasse ist gestoppt |
| `resources-are-not-ready` | Medien/Ressourcen fehlen |
| `job-restartable` | Job kann neu gestartet werden |
| `cups-waiting-for-job-completed` | **CUPS-spezifisch**: Backend fertig, CUPS wartet auf Bestätigung des Geräts |

**`printer-state`** (RFC 8011 §5.4.11): `3 = idle`, `4 = processing`, `5 = stopped`.

**`printer-state-reasons`** — beschreibt, *warum* eine Queue gestoppt ist. Die Keywords tragen
optionale Suffixe `-report` (informativ), `-warning` (Aufmerksamkeit nötig) und `-error`
(blockierend). Häufig: `none`, `media-empty`, `media-needed`, `media-jam`, `toner-empty`,
`toner-low`, `cover-open`, `door-open`, `offline-report`, `connecting-to-device`, `timed-out`,
`paused`, `shutdown`, `other`. Für Etikettendrucker sind `media-empty-error` (Rolle leer),
`media-jam-error` und `connecting-to-device` die praktisch wichtigsten.

### 7.2 Was `completed` *nicht* garantiert

Der entscheidende Punkt für ehrliches Erwartungsmanagement: **CUPS setzt `job-state = completed`,
sobald das Backend den Job erfolgreich abgeschlossen zurückmeldet** — also wenn die Daten an das
Gerät übergeben wurden. Das ist **kein** Beweis dafür, dass physisch ein Etikett aus dem Drucker
kam.

In der Praxis:

- **USB-Etikettendrucker** (Brother QL, Dymo): Das libusb-Backend meldet erst Erfolg, wenn der
  Drucker die Daten angenommen hat. Ein `completed` ist hier ein sehr guter Näherungswert — ein
  Papierstau oder eine leere Rolle führt in aller Regel zu `processing-stopped` mit
  `printer-state-reasons: media-empty-error` bzw. `media-jam-error`, nicht zu `completed`.
- **`socket://` (JetDirect, Port 9100)**: Deutlich schwächer. Das Backend meldet Erfolg, sobald die
  TCP-Verbindung die Bytes geschluckt hat. Ein Drucker, dem die Rolle ausgeht, kann trotzdem
  `completed` produzieren.
- **IPP/IPPS-Backend**: Am besten, weil der Zielserver echte IPP-Job-Zustände zurückliefert.

Eine belastbarere Bestätigung liefert `job-impressions-completed` (Anzahl tatsächlich verarbeiteter
Seiten) — sofern der Treiber das Attribut überhaupt füllt. Für die UI heißt das: „an den Drucker
übergeben" ist die ehrlichste Formulierung für `completed`, und `printer-state-reasons` sollte
parallel angezeigt werden, damit der Nutzer eine leere Rolle sofort sieht.

### 7.3 Mapping-Vorschlag

```python
# app/printing/status.py
from enum import StrEnum

class JobStatus(StrEnum):
    SUBMITTED  = "submitted"   # von uns abgeschickt, CUPS-Job-ID noch nicht bestaetigt
    QUEUED     = "queued"      # in der Queue, wartet
    PROCESSING = "processing"  # wird verarbeitet/gedruckt
    COMPLETED  = "completed"   # an den Drucker uebergeben
    FAILED     = "failed"      # abgebrochen wegen Fehler
    CANCELLED  = "cancelled"   # bewusst abgebrochen
    UNKNOWN    = "unknown"     # Zustand nicht ermittelbar

IPP_PENDING            = 3
IPP_PENDING_HELD       = 4
IPP_PROCESSING         = 5
IPP_PROCESSING_STOPPED = 6
IPP_CANCELED           = 7
IPP_ABORTED            = 8
IPP_COMPLETED          = 9

_ERROR_REASONS = {
    "job-completed-with-errors",
    "document-format-error",
    "aborted-by-system",
    "unsupported-compression",
    "compression-error",
    "unsupported-document-format",
}
_CANCEL_REASONS = {"job-canceled-by-user", "job-canceled-by-operator"}


def map_job_state(job_state: int, reasons: list[str] | None) -> tuple[JobStatus, str | None]:
    """Bildet IPP job-state + job-state-reasons auf unseren Status ab.
    Rueckgabe: (Status, menschenlesbares Detail oder None)."""
    reasons = set(reasons or [])
    detail = ", ".join(sorted(reasons - {"none"})) or None

    match job_state:
        case s if s == IPP_PENDING:
            return JobStatus.QUEUED, detail
        case s if s == IPP_PENDING_HELD:
            # angehalten: fuer den Nutzer weiterhin "wartend", aber mit Grund
            return JobStatus.QUEUED, detail or "job held"
        case s if s == IPP_PROCESSING:
            return JobStatus.PROCESSING, detail
        case s if s == IPP_PROCESSING_STOPPED:
            # Druck begonnen, aber blockiert (Rolle leer, Deckel offen, Geraet weg).
            # Bewusst NICHT failed: CUPS setzt mit ErrorPolicy retry-job selbst fort.
            return JobStatus.PROCESSING, detail or "printer stopped"
        case s if s == IPP_CANCELED:
            return JobStatus.CANCELLED, detail
        case s if s == IPP_ABORTED:
            return JobStatus.FAILED, detail or "aborted by system"
        case s if s == IPP_COMPLETED:
            if reasons & _ERROR_REASONS:
                return JobStatus.FAILED, detail
            if reasons & _CANCEL_REASONS:
                return JobStatus.CANCELLED, detail
            return JobStatus.COMPLETED, detail
        case _:
            return JobStatus.UNKNOWN, detail
```

Die bewusste Design-Entscheidung: **`processing-stopped` (6) wird auf `PROCESSING` abgebildet, nicht
auf `FAILED`.** Mit `ErrorPolicy retry-job` in der `cupsd.conf` versucht CUPS es selbstständig
weiter, sobald der Fehler behoben ist. Ein sofortiges `failed` in der UI wäre falsch — richtig ist,
den Status als „läuft, aber blockiert" zu zeigen und `printer-state-reasons` als Klartext daneben zu
stellen („Etikettenrolle leer"). Ein Timeout in der App (z. B. 5 Minuten in `processing`) kann den
Job danach auf `FAILED` setzen.

### 7.4 Polling und der Fallstrick verschwindender Jobs

```python
async def poll_job(job_id: int) -> tuple[JobStatus, str | None]:
    def _work():
        conn = _connect()
        try:
            attrs = conn.getJobAttributes(job_id, requested_attributes=[
                "job-state", "job-state-reasons", "job-impressions-completed",
            ])
        except cups.IPPError as exc:
            # (1030, 'client-error-not-found') -> Job aus der History gefallen.
            # NICHT als Fehler werten: der Job kann laengst erfolgreich gewesen sein.
            return JobStatus.UNKNOWN, "job no longer known to cupsd"
        return map_job_state(attrs.get("job-state", 0),
                             attrs.get("job-state-reasons"))
    return await anyio.to_thread.run_sync(_work)
```

Zwei Punkte, die in der Praxis beißen:

1. **Jobs verschwinden.** Abgeschlossene Jobs bleiben nur so lange abfragbar, wie
   `PreserveJobHistory` / `MaxJobs` in der `cupsd.conf` es erlauben. Danach liefert
   `getJobAttributes` `client-error-not-found`. Das muss auf `UNKNOWN` gemappt werden, **niemals**
   auf `FAILED` — sonst wechseln erfolgreiche Etiketten nach einer Weile in der Historie auf „Fehler".
   Ergänzend in der `cupsd.conf` des Sidecars großzügig konfigurieren:

   ```apache
   PreserveJobHistory Yes
   PreserveJobFiles No       # Spool-Daten nicht aufheben, nur Metadaten
   MaxJobs 500
   ```

   `PreserveJobFiles No` ist wichtig: sonst füllen sich mit jedem Etikett die Spool-Daten.

2. **Terminale Zustände nicht weiterpollen.** Sobald ein Job `COMPLETED`, `FAILED` oder `CANCELLED`
   erreicht hat, den Poll-Task beenden und den Endzustand in der eigenen DB einfrieren. Die App
   sollte den letzten bekannten Status ohnehin persistieren, damit ein Container-Neustart die
   Historie nicht verliert.

Für den Drucker parallel dazu:

```python
async def printer_health(printer: str) -> dict:
    def _work():
        attrs = _connect().getPrinterAttributes(printer, requested_attributes=[
            "printer-state", "printer-state-reasons", "printer-state-message",
            "printer-is-accepting-jobs",
        ])
        return {
            "state": {3: "idle", 4: "processing", 5: "stopped"}.get(
                attrs.get("printer-state"), "unknown"),
            "reasons": [r for r in attrs.get("printer-state-reasons", []) if r != "none"],
            "message": attrs.get("printer-state-message"),
            "accepting": attrs.get("printer-is-accepting-jobs", False),
        }
    return await anyio.to_thread.run_sync(_work)
```

**Alternative zum Polling**: CUPS unterstützt IPP-Notifications
(`Create-Job-Subscription` + `Get-Notifications`, RFC 3995/3996). Das erspart das Poll-Intervall,
ist aber deutlich aufwändiger und für Etikettendrucke, die in Sekunden fertig sind, nicht nötig. Ein
Polling mit 1 s Intervall und 60 s Deckel ist für den MVP angemessen.

---

## 8. Referenz-Setup

### `docker-compose.yml`

```yaml
name: spoolman-labeler

services:
  labeler:
    image: ghcr.io/sfcdx/spoolman-labeler:${LABELER_VERSION:-latest}
    restart: unless-stopped
    depends_on:
      cups:
        condition: service_healthy
        required: false          # Variante A/C: Sidecar ist gar nicht gestartet
    environment:
      # Variante B (Default): Compose-interner Sidecar
      # Variante A: "host.docker.internal:631"  (+ extra_hosts unten aktivieren)
      # Variante C: "printserver.lan:631"
      CUPS_SERVER: "${CUPS_SERVER:-cups:631}"
      CUPS_USER: "${CUPS_ADMIN:-admin}"
      CUPS_PASSWORD: "${CUPS_PASSWORD:-changeme}"
      SPOOLMAN_URL: "${SPOOLMAN_URL:-http://spoolman:7912}"
    # Nur fuer Variante A einkommentieren:
    # extra_hosts:
    #   - "host.docker.internal:host-gateway"
    ports:
      - "${LABELER_BIND_ADDRESS:-0.0.0.0}:8000:8000"
    volumes:
      - labeler-data:/data

  cups:
    # Sidecar laeuft im Default-Profil mit. Wer CUPS auf dem Host oder im LAN
    # betreibt, setzt COMPOSE_PROFILES=no-cups in der .env.
    profiles: ["", "cups"]
    image: anujdatar/cups:26.07.01     # bewusst gepinnt, nicht :latest
    restart: unless-stopped
    environment:
      CUPSADMIN: "${CUPS_ADMIN:-admin}"
      CUPSPASSWORD: "${CUPS_PASSWORD:-changeme}"
      TZ: "${TZ:-Europe/Berlin}"
    ports:
      # Default 127.0.0.1 - Web-UI nur lokal. Fuer LAN-Zugriff bewusst
      # CUPS_BIND_ADDRESS=0.0.0.0 setzen UND CUPS_PASSWORD aendern.
      - "${CUPS_BIND_ADDRESS:-127.0.0.1}:631:631"
    volumes:
      - cups-config:/etc/cups
      # /var/spool/cups und /var/cache/cups bewusst NICHT persistieren
      - /dev/bus/usb:/dev/bus/usb
    devices:
      - /dev/bus/usb:/dev/bus/usb
    device_cgroup_rules:
      - 'c 189:* rmw'          # usbfs, ueberlebt Re-Plug ohne privileged
    healthcheck:
      test: ["CMD-SHELL", "lpstat -r >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s

volumes:
  labeler-data:
  cups-config:
```

### `.env.example`

```dotenv
# --- CUPS ---------------------------------------------------------------
# Variante B (Default): Sidecar im Stack
CUPS_SERVER=cups:631
# Variante A: CUPS auf dem Docker-Host
#   CUPS_SERVER=host.docker.internal:631
#   COMPOSE_PROFILES=no-cups
#   -> zusaetzlich extra_hosts im labeler-Service einkommentieren
# Variante C: CUPS-Server im LAN
#   CUPS_SERVER=printserver.lan:631
#   COMPOSE_PROFILES=no-cups

CUPS_ADMIN=admin
# UNBEDINGT aendern, bevor CUPS_BIND_ADDRESS auf 0.0.0.0 gesetzt wird!
CUPS_PASSWORD=changeme

# 127.0.0.1 = CUPS-Web-UI nur vom Host erreichbar (empfohlen)
# 0.0.0.0   = im gesamten LAN erreichbar
CUPS_BIND_ADDRESS=127.0.0.1

TZ=Europe/Berlin
```

### Ersteinrichtung eines Druckers (Doku-Auszug)

```bash
docker compose up -d

# 1) Angeschlossene USB-Drucker anzeigen lassen
docker compose exec cups lpinfo -v
#   direct usb://Brother/QL-800?serial=000J1Z123456

# 2) Passenden Treiber suchen
docker compose exec cups lpinfo -m | grep -i "QL-800"

# 3) Queue anlegen (die ?serial=-URI verwenden - sie ueberlebt das Umstecken)
docker compose exec cups lpadmin \
  -p QL800 -E \
  -v "usb://Brother/QL-800?serial=000J1Z123456" \
  -m "ptouch/Brother-QL-800-ptouch.ppd" \
  -o media=Custom.62x29mm \
  -o printer-is-shared=false

# 4) Testdruck
docker compose exec cups lpstat -p QL800
```

Alternativ über die Web-UI auf `http://localhost:631/admin` (Login mit `CUPS_ADMIN` /
`CUPS_PASSWORD`). Bei Zugriff von einem anderen Rechner ohne LAN-Exposition:
`ssh -L 6631:localhost:631 user@homeserver` und dann `http://localhost:6631/admin`.

---

## 9. Entscheidung für Spoolman Labeler

### Default-Setup

1. **CUPS-Sidecar im Compose-Stack (Variante B).** Das ist die einzige Variante, die die
   Autonomie-Anforderung („`git clone` + `docker compose up -d` und es druckt") erfüllt, ohne dass
   wir für beliebige Host-Distributionen Support leisten müssen. Der Sidecar liegt in einem
   Compose-Profil, sodass Nutzer mit vorhandenem CUPS ihn per `COMPOSE_PROFILES=no-cups`
   abschalten, ohne die Compose-Datei zu editieren — das hält spätere `git pull` konfliktfrei, was
   selbst ein Stück Update-Stabilität ist.

2. **Image: `anujdatar/cups`, gepinnt auf einen CalVer-Tag.** Ausschlaggebend gegenüber dem
   häufiger gebauten `olbat/cupsd` sind genau die zwei Eigenschaften, die auf die
   Auftraggeber-Anforderung einzahlen: der `/etc/cups-bak`-Entrypoint (Konfiguration überlebt
   `docker compose pull`) und konfigurierbare Admin-Credentials statt hartkodiertem `print`/`print`.
   Dazu kommt armv7-Support für ältere Raspberry Pis. Ein gepinnter Tag statt `latest` sorgt dafür,
   dass ein `docker compose pull` ein bewusster, von uns getesteter Schritt ist.

3. **Mittelfristig: eigenes Image unter `docker/cups/`.** Der Hauptgrund ist nicht Größe, sondern
   Risiko: Beide geprüften Images beziehen ihre Treiber über `printer-driver-all`, das per
   `Recommends` (nicht `Depends`) auflöst und **bereits aus Debian testing entfernt wurde**. Mit dem
   nächsten Debian-Stable-Release verschwinden damit potenziell alle Treiber aus beiden Images. Ein
   eigenes Image mit expliziter Liste (`printer-driver-ptouch`, `printer-driver-dymo`,
   `printer-driver-brlaser`, `printer-driver-cups-pdf`) ist gegen dieses Szenario immun, spart
   nebenbei ~60 MB und gibt uns die Kontrolle über den Entrypoint-Vertrag. Voraussetzung ist ein
   zeitgesteuerter CI-Rebuild — ohne den wäre das eigene Image schlechter als jedes gepflegte
   Fremd-Image.

4. **Persistenz: Named Volume auf `/etc/cups`**, kombiniert mit dem `cp -rpn`-Entrypoint-Muster.
   `/var/spool/cups` und `/var/cache/cups` **bewusst nicht** persistieren — dort liegen Referenzen
   auf Filter- und PPD-Pfade der alten Image-Version, die nach einem Update zu hängenden Queues
   führen. Ein `docker compose exec cups tar`-Backup-Rezept gehört in die README.

5. **USB: `devices:` + `device_cgroup_rules: ['c 189:* rmw']`**, nicht `privileged: true`. Die
   cgroup-Regel deckt den Re-Plug-Fall ab, ohne dem Container Zugriff auf Host-Festplatten zu geben.
   In der Doku ausdrücklich zur `?serial=`-Device-URI raten, weil positionsbasierte URIs bei jedem
   Umstecken brechen.

6. **Port 631 bindet per Default auf `127.0.0.1`.** LAN-Exposition ist ein bewusstes Opt-in über
   `CUPS_BIND_ADDRESS`, gekoppelt an eine Warnung, das Default-Passwort zu ändern. Der
   App-Container braucht das Mapping ohnehin nicht — er nutzt das Compose-Netzwerk.

7. **Kein Avahi/mDNS im Default.** Nicht nötig (Drucker werden per expliziter URI eingebunden),
   erzwingt `network_mode: host` (was die Compose-DNS-Auflösung bricht), kollidiert auf 5353/udp mit
   dem Host-Avahi jedes NAS — und die verbreitete Empfehlung `-v /var/run/dbus:/var/run/dbus`
   überschreibt den System-D-Bus-Socket des Hosts. Diesen Mount nehmen wir nicht in die Doku auf.

8. **Python: pycups**, installiert als Distro-Paket `python3-cups` (arch-nativ, kein Compiler,
   damit kein Multi-Arch-Risiko), Server-Auswahl ausschließlich über die `CUPS_SERVER`-Umgebung,
   alle Aufrufe über `anyio.to_thread.run_sync`. Zusätzlich `cups-client` ins App-Image für
   Healthchecks und Support. Der Code kapselt CUPS hinter einem `PrintBackend`-Protocol, damit ein
   späterer Wechsel auf `pyipp` (rein async) eine lokale Änderung bleibt.

9. **PDF: WeasyPrint 69** mit einem `url_fetcher`, der alles außer `data:`-URIs und Dateien unter
   `/app/assets` blockiert. Playwright fällt wegen ~300–500 MB Image-Zuwachs und dokumentierter
   Rundungsfehler bei physischen Seitenmaßen aus — ausgerechnet bei unserem Kernkriterium.
   wkhtmltopdf ist seit Januar 2023 archiviert und trägt eine offene CVSS-9.8-SSRF-Lücke.

10. **Status: `job-state` + `job-state-reasons` pollen**, `processing-stopped` als `processing`
    (nicht `failed`) abbilden, weil `ErrorPolicy retry-job` selbstständig fortsetzt, und
    `client-error-not-found` auf `unknown` (nicht `failed`), weil abgeschlossene Jobs aus der
    CUPS-History fallen. In der UI ehrlich „an den Drucker übergeben" statt „gedruckt" formulieren
    und `printer-state-reasons` daneben anzeigen.

### Dokumentierte Alternativen

| Situation | Konfiguration |
| --- | --- |
| CUPS läuft bereits auf dem Host | `COMPOSE_PROFILES=no-cups`, `CUPS_SERVER=host.docker.internal:631`, `extra_hosts` aktivieren, Host-`cupsd` auf `0.0.0.0:631` öffnen |
| Host-CUPS ohne Netzwerk-Listener | `COMPOSE_PROFILES=no-cups`, `/run/cups/cups.sock` in den App-Container mounten, `CUPS_SERVER` leer lassen |
| Zentraler Print-Server im LAN | `COMPOSE_PROFILES=no-cups`, `CUPS_SERVER=printserver.lan:631`, ggf. `cups.setEncryption()` für TLS |
| Netzwerkdrucker-Discovery gewünscht | Sidecar auf `network_mode: host` umstellen, `CUPS_SERVER=localhost:631` — mit Warnung zur 5353-Kollision, **ohne** D-Bus-Mount |
| Exotisches NAS, USB geht nicht | `privileged: true` als dokumentierter Notnagel |
| Kein Drucker vorhanden (Entwicklung) | `printer-driver-cups-pdf` ist in beiden Images enthalten: `lpadmin -p PDF -E -v cups-pdf:/ -m ...`, Output landet in `/var/spool/cups-pdf` |

---

## 10. Offene Punkte

Folgendes konnte im Rahmen dieser Recherche **nicht** verifiziert werden und sollte vor dem Release
praktisch getestet werden:

1. **PPD-Name für den Brother QL-800.** Dass `printer-driver-ptouch` die QL-Serie abdeckt, ist
   belegt (foomatic-XMLs `Brother-QL-800.xml` und `Brother-QL-810W.xml` existieren im
   Upstream-Repo). Der exakte Pfad des von `lpinfo -m` gemeldeten PPD-Namens ist nicht verifiziert —
   die Angabe `ptouch/Brother-QL-800-ptouch.ppd` in Abschnitt 8 ist eine plausible Annahme, kein
   geprüfter Wert. **Muss am realen Gerät ermittelt werden.**

2. **Ob der QL-800 im „Editor Lite"-Modus stört.** Der QL-800 hat einen Modus, in dem er sich als
   USB-Massenspeicher meldet statt als Drucker. Ob das den libusb-Zugriff aus dem Container
   blockiert, ist ungeprüft.

3. **Ob `printer-driver-all` in `anujdatar/cups` tatsächlich `printer-driver-ptouch` mitbringt.**
   Die Kette ist plausibel (kein `--no-install-recommends` im Dockerfile → `Recommends` werden
   installiert → `printer-driver-ptouch` ist als `Recommends` von `printer-driver-all` gelistet),
   aber nicht am laufenden Image verifiziert. Prüfen mit:
   `docker run --rm anujdatar/cups:26.07.01 dpkg -l | grep printer-driver`.
   **Falls nein, ist das ein sofortiges Argument für das eigene Image.**

4. **Verhalten von `device_cgroup_rules` auf NAS-Systemen.** Synology DSM und QNAP QTS bringen
   teilweise ältere Docker-Versionen und cgroup v1 mit. Ob die Regel dort greift, ist ungeprüft.
   Der `privileged`-Fallback sollte deshalb dokumentiert bleiben.

5. **Ob Docker beim Verzeichnis-Bind-Mount von `/dev/bus/usb` neue Nodes zuverlässig propagiert.**
   Die Recherche nennt `rslave`-Mount-Propagation als kritischen Faktor; Compose setzt die
   Propagation für Bind-Mounts nicht automatisch auf `rslave`. Falls Hotplug im Test nicht
   funktioniert, ist `- /dev/bus/usb:/dev/bus/usb:rslave` der nächste Versuch.

6. **Exakter Umfang der CSS-Grid-Unterstützung in WeasyPrint 69.** Flexbox wird unterstützt; der
   Grid-Support wurde in neueren Versionen ergänzt, sein Reifegrad ist nicht verifiziert. Für
   Etikettenlayouts vermutlich irrelevant, sollte aber in der Template-Doku eingegrenzt werden.

7. **Python-Versions-Kompatibilität zwischen Basisimage und `python3-cups`.** Die Empfehlung, das
   Distro-Paket zu nutzen, setzt voraus, dass die Python-Minor-Version des Basisimages der
   Debian-Version entspricht. Bei `python:3.x-slim-*`-Images ist das nicht garantiert. Praktisch
   testen; im Zweifel `debian:trixie-slim` + `python3` aus der Distro verwenden oder pycups doch per
   pip in einem Multi-Stage-Build kompilieren.

8. **`job-impressions-completed` bei Brother/Dymo.** Ob die Treiber dieses Attribut überhaupt
   füllen, ist ungeprüft. Falls nicht, entfällt die genaueste Bestätigungsmöglichkeit und
   `job-state = completed` bleibt der einzige Indikator.

9. **Image-Größe des eigenen CUPS-Images.** Die genannten ~120–150 MB sind eine Schätzung auf Basis
   der Differenz zu den geprüften Images, kein Messwert.

10. **Langzeitverfügbarkeit von `printer-driver-all`.** Dass es aus Debian testing entfernt wurde,
    stammt aus einem Kommentar in olbats `Dockerfile` und wurde nicht gegen den Debian-Bugtracker
    verifiziert. Der genaue Zeitpunkt, ab dem Debian stable betroffen ist, ist damit offen.

---

## 11. Quellen

**CUPS-Docker-Images**

- [olbat/dockerfiles — cupsd](https://github.com/olbat/dockerfiles/tree/master/cupsd) ·
  [Dockerfile.stable](https://github.com/olbat/dockerfiles/blob/master/cupsd/Dockerfile.stable) ·
  [Dockerfile (testing)](https://github.com/olbat/dockerfiles/blob/master/cupsd/Dockerfile) ·
  [cupsd.conf](https://github.com/olbat/dockerfiles/blob/master/cupsd/cupsd.conf) ·
  [README](https://github.com/olbat/dockerfiles/blob/master/cupsd/README.md)
- [olbat/cupsd auf Docker Hub — Tags, Architekturen, Größen](https://hub.docker.com/r/olbat/cupsd/tags)
- [anujdatar/cups-docker](https://github.com/anujdatar/cups-docker) ·
  [Dockerfile](https://github.com/anujdatar/cups-docker/blob/main/Dockerfile) ·
  [entrypoint.sh](https://github.com/anujdatar/cups-docker/blob/main/entrypoint.sh) ·
  [README](https://github.com/anujdatar/cups-docker/blob/main/README.md)
- [anujdatar/cups auf Docker Hub — Tags, Architekturen, Größen](https://hub.docker.com/r/anujdatar/cups/tags)
- [mwatz1234/cupsd — ARM-Fork von olbat](https://github.com/mwatz1234/cupsd)
- [chuckcharlie/cups-avahi-airprint](https://github.com/chuckcharlie/cups-avahi-airprint) ·
  [SickHub/docker-cups-airprint](https://github.com/SickHub/docker-cups-airprint)

**Druckertreiber**

- [Debian: printer-driver-ptouch (sid)](https://packages.debian.org/sid/printer-driver-ptouch)
- [Debian: printer-driver-brlaser (sid)](https://packages.debian.org/sid/text/printer-driver-brlaser)
- [Ubuntu: printer-driver-all — Recommends-Liste](https://packages.ubuntu.com/noble/printer-driver-all)
- [trialinfo/ptouch-driver — CUPS/Foomatic-Treiber für Brother P-touch und QL](https://github.com/trialinfo/ptouch-driver)
- [philpem/printer-driver-ptouch](https://github.com/philpem/printer-driver-ptouch)
- [OpenPrinting — Treiber „ptouch"](https://openprinting.github.io/foomatic/driver/ptouch)

**Docker / Compose**

- [Docker Docs — Compose file: services (`devices`, `device_cgroup_rules`)](https://docs.docker.com/reference/compose-file/services/)
- [compose-spec#62 — Add support for `device_cgroup_rules`](https://github.com/compose-spec/compose-spec/issues/62)
- [docker/compose#8251 — `device_cgroup_rules` support removed in 3.x](https://github.com/docker/compose/issues/8251)
- [Marc Merlin — USB-Geräte in Docker ohne `--privileged`](https://marc.merlins.org/perso/linux/post_2018-12-20_Accessing-USB-Devices-In-Docker-_ttyUSB0_-dev-bus-usb-_-for-fastboot_-adb_-without-using-privileged.html)
- [lowRISC/container-hotplug — Hotplug-Devices in laufende Container](https://github.com/lowRISC/container-hotplug)
- [Fixing `host.docker.internal` in Docker Compose on Linux](https://abhihyder.medium.com/fixing-host-docker-internal-issue-in-docker-compose-on-linux-f733006dfa12)

**CUPS-Konfiguration und Avahi**

- [CUPS — Printer Sharing / Remote-Zugriff](https://www.cups.org/doc/sharing.html)
- [Debian Manpages — client.conf(5) (`ServerName`, `CUPS_SERVER`)](https://manpages.debian.org/testing/cups-client/client.conf.5.en.html)
- [ArchWiki — CUPS (Remote-Server, `CUPS_SERVER`)](https://wiki.archlinux.org/title/CUPS)
- [Jeff Rafter — Docker, CUPS-PDF, Avahi und AirPrint](https://jeffrafter.com/docker-and-cups-pdf/)
- [balena Forums — Avahi/mDNS im Container](https://forums.balena.io/t/avahi-mdns-not-working-in-container/6997)

**Python-Bindings**

- [OpenPrinting/pycups](https://github.com/OpenPrinting/pycups) ·
  [PyPI-Metadaten (2.0.4, nur sdist)](https://pypi.org/pypi/pycups/json)
- [Debian: python3-cups in trixie (2.0.4-2+b2, arm64)](https://packages.debian.org/trixie/python3-cups)
- [ctalkington/python-ipp (pyipp)](https://github.com/ctalkington/python-ipp) ·
  [PyPI-Metadaten (0.17.2, Wheel)](https://pypi.org/pypi/pyipp/json) ·
  [Issue #105 — Print-Job-Beispiele](https://github.com/ctalkington/python-ipp/issues/105)

**PDF-Rendering**

- [WeasyPrint — PyPI-Metadaten (69.0)](https://pypi.org/pypi/weasyprint/json)
- [WeasyPrint 69 — First Steps / Systemabhängigkeiten](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html)
- [microsoft/playwright#31263 — Wrong PDF Paper Sizes Calculation](https://github.com/microsoft/playwright/issues/31263)
- [wkhtmltopdf — Releases (letzte Stable 0.12.6, Juni 2020)](https://github.com/wkhtmltopdf/wkhtmltopdf/releases)
- [wkhtmltopdf — Status-Seite](https://wkhtmltopdf.org/status.html)
- [Doppio — „wkhtmltopdf is now abandonware"](https://doc.doppio.sh/article/wkhtmltopdf-is-now-abandonware)
- [PDF4.dev — Playwright vs. WeasyPrint (2026)](https://pdf4.dev/blog/playwright-vs-weasyprint) ·
  [wkhtmltopdf-Alternativen 2026](https://pdf4.dev/blog/wkhtmltopdf-alternatives-2026)

**IPP-Spezifikation**

- [RFC 8011 — IPP/1.1: Model and Semantics (`job-state`, `job-state-reasons`, `printer-state`)](https://www.rfc-editor.org/rfc/rfc8011.html)
- [RFC 8010 — IPP/1.1: Encoding and Transport](https://www.rfc-editor.org/rfc/rfc8010.html)
- [PWG — How to Use the Internet Printing Protocol](https://www.pwg.org/ipp/ippguide.pdf)
- [apple/cups — scheduler/job.c (`job-state-reasons`-Keywords in CUPS)](https://github.com/apple/cups/issues/1955)
- [Red Hat Bugzilla #1207154 — `cups-waiting-for-job-completed`](https://bugzilla.redhat.com/show_bug.cgi?id=1207154)
