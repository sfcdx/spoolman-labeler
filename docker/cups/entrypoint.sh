#!/bin/sh
# Entrypoint des CUPS-Sidecars.
#
# Der gesamte Zweck dieses Skripts ist Update-Stabilitaet. /etc/cups liegt in
# einem Named Volume; ein Image-Update tauscht alles ausser diesem Volume aus.
# Ohne das Muster hier gaebe es zwei Fehlerbilder:
#
#   * Erststart mit leerem Volume oder Bind-Mount -> keine cupsd.conf, cupsd
#     startet mit Compiled-in-Defaults (nur localhost) oder gar nicht.
#   * Spaeteres Update bringt neue Default-Dateien mit -> die kommen nie im
#     bestehenden Volume an ("stiller Langzeit-Drift").
#
# Loesung: Die vollstaendige Default-Konfiguration liegt zur Build-Zeit in
# /etc/cups-bak. Hier wird sie mit `cp -rpn` (no-clobber) nach /etc/cups
# gespiegelt: fehlende Dateien werden ergaenzt, vorhandene NIEMALS
# ueberschrieben. Siehe docs/printing-architecture.md, Abschnitt 4.4.

set -eu

log() { printf '[cups-entrypoint] %s\n' "$*" >&2; }

CUPS_ADMIN="${CUPS_ADMIN:-admin}"
CUPS_PASSWORD="${CUPS_PASSWORD:-}"
TZ="${TZ:-UTC}"

# --- 1) Zeitzone ------------------------------------------------------------
if [ -f "/usr/share/zoneinfo/${TZ}" ]; then
    ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
    printf '%s\n' "$TZ" > /etc/timezone
else
    log "WARNUNG: unbekannte Zeitzone '${TZ}', bleibe bei UTC."
fi

# --- 2) Konfiguration wiederherstellen / ergaenzen --------------------------
if [ ! -f /etc/cups/cupsd.conf ]; then
    log "/etc/cups enthaelt keine cupsd.conf - stelle Defaults aus /etc/cups-bak her."
fi

# Ein einziger Durchlauf genuegt: -n laesst vorhandene Dateien in Ruhe und
# ergaenzt gleichzeitig alles, was ein neueres Image mitbringt.
cp -rpn /etc/cups-bak/. /etc/cups/ 2>/dev/null || true
chown -R root:lp /etc/cups
chmod 0755 /etc/cups

# Zusaetzlicher, von uns kontrollierter Snapshot der Druckerkonfiguration.
# CUPS legt zwar selbst printers.conf.O an, aber der wird bei jeder Aenderung
# ueberschrieben. Dieser hier ist der Stand VOR dem heutigen Start und macht
# Support-Faelle nach einem missglueckten Update deutlich einfacher.
if [ -f /etc/cups/printers.conf ]; then
    cp -p /etc/cups/printers.conf /etc/cups/printers.conf.prestart
fi

# --- 3) Administrator anlegen ----------------------------------------------
if [ -z "$CUPS_PASSWORD" ]; then
    log "FEHLER: CUPS_PASSWORD ist nicht gesetzt. Ohne Passwort waere die"
    log "        Web-Oberflaeche administrativ unbenutzbar. Setze CUPS_PASSWORD"
    log "        in der .env-Datei."
    exit 1
fi

case "$CUPS_PASSWORD" in
    changeme|password|admin|BITTE-AENDERN|BITTE-AeNDERN)
    log "############################################################"
    log "# WARNUNG: CUPS_PASSWORD steht noch auf einem Beispielwert."
    log "#          Bitte in der .env-Datei aendern - zwingend, bevor"
    log "#          CUPS_BIND_ADDRESS auf 0.0.0.0 gesetzt wird."
    log "############################################################"
    ;;
esac

if ! id "$CUPS_ADMIN" >/dev/null 2>&1; then
    log "Lege Administrator '${CUPS_ADMIN}' an."
    useradd --system --no-create-home --shell /usr/sbin/nologin \
            --groups lp,lpadmin "$CUPS_ADMIN"
fi
printf '%s:%s\n' "$CUPS_ADMIN" "$CUPS_PASSWORD" | chpasswd

# --- 4) Laufzeitverzeichnisse ----------------------------------------------
# Bewusst NICHT persistiert (ADR-006): der Spool enthaelt Verweise auf Filter-
# und PPD-Pfade der jeweiligen Image-Version, der Cache einen Treiberindex.
# Beides nach einem Update wiederzuverwenden erzeugt haengende Queues.
mkdir -p /run/cups /run/cups/certs /var/spool/cups /var/cache/cups /var/log/cups
chown -R root:lp /run/cups /var/spool/cups /var/cache/cups /var/log/cups
chmod 0710 /var/spool/cups

# Ein alter Treiberindex ueberlebt einen Container-Neustart im Schreiblayer.
# Nach einem Image-Update ist er falsch; loeschen ist billig, er wird beim
# ersten `lpinfo -m` neu erzeugt.
rm -f /var/cache/cups/ppds.dat /var/cache/cups/job.cache

log "Starte cupsd (Admin: ${CUPS_ADMIN}, TZ: ${TZ})."
exec "$@"
