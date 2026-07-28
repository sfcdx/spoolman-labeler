#!/bin/sh
# Entrypoint des Anwendungscontainers.
#
# Aufgaben, in dieser Reihenfolge:
#   1. Umgebung pruefen und verstaendlich scheitern, statt spaeter kryptisch.
#   2. Die Unterverzeichnisse unter /data anlegen, falls sie fehlen.
#   3. Datenbankmigrationen ausfuehren (Alembic), falls vorhanden.
#   4. uvicorn als PID 1 des Prozessbaums starten (exec).
#
# Der Container laeuft bereits als nicht-privilegierter User (UID 10001) -
# hier wird bewusst NICHT nachtraeglich die Identitaet gewechselt.

set -eu

log() { printf '[entrypoint] %s\n' "$*" >&2; }
die() { printf '[entrypoint] FEHLER: %s\n' "$*" >&2; exit 1; }

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-7913}"
# Die Anwendung liest DATA_DIR (siehe backend/app/core/config.py).
DATA_DIR="${DATA_DIR:-/data}"
# LOG_LEVEL ist fuer die Anwendung gross geschrieben ("INFO"), uvicorn will es
# klein ("info"). Hier wird umgesetzt, statt zwei Variablen zu pflegen.
LOG_LEVEL="${LOG_LEVEL:-INFO}"
UVICORN_LOG_LEVEL=$(printf '%s' "$LOG_LEVEL" | tr '[:upper:]' '[:lower:]')
APP_WORKERS="${APP_WORKERS:-1}"
# uvicorn vertraut X-Forwarded-* nur von den hier genannten Adressen.
# Default bewusst restriktiv; hinter einem Reverse Proxy anpassen.
APP_FORWARDED_ALLOW_IPS="${APP_FORWARDED_ALLOW_IPS:-127.0.0.1}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"

# --- 1) Umgebung ------------------------------------------------------------

case "$APP_PORT" in
    ''|*[!0-9]*) die "APP_PORT muss eine Zahl sein, ist aber '${APP_PORT}'." ;;
esac

if [ "$(id -u)" = "0" ]; then
    log "WARNUNG: Der Container laeuft als root. Das Image ist auf UID 10001"
    log "         ausgelegt; 'user:' in der Compose-Datei wurde offenbar ueberschrieben."
fi

# --- 2) Datenverzeichnis ----------------------------------------------------

if [ ! -d "$DATA_DIR" ]; then
    die "Datenverzeichnis '${DATA_DIR}' existiert nicht. Volume nicht eingebunden?"
fi

if ! mkdir -p \
        "${DATA_DIR}/templates" \
        "${DATA_DIR}/rendered" \
        "${DATA_DIR}/logs" \
        "${DATA_DIR}/.cache" 2>/dev/null; then
    die "Kein Schreibrecht auf '${DATA_DIR}' (laufe als UID $(id -u), GID $(id -g)).
         Bei einem Bind-Mount muss das Host-Verzeichnis dieser UID gehoeren:
             sudo chown -R 10001:10001 <host-verzeichnis>
         Details: docs/deployment.md, Abschnitt 'Berechtigungsprobleme'."
fi

if [ ! -w "$DATA_DIR" ]; then
    die "'${DATA_DIR}' ist nicht beschreibbar (UID $(id -u), GID $(id -g))."
fi

# --- 3) Migrationen ---------------------------------------------------------
# Idempotent: 'alembic upgrade head' ist ein No-Op, wenn das Schema aktuell ist.
# Das ist der Baustein, der ein 'docker compose pull && up -d' ueber
# Schemaaenderungen hinweg traegt.

if [ "$RUN_MIGRATIONS" != "0" ] && [ -f /app/alembic.ini ] && command -v alembic >/dev/null 2>&1; then
    log "Fuehre Datenbankmigrationen aus (alembic upgrade head) ..."
    if ! alembic -c /app/alembic.ini upgrade head; then
        die "Migration fehlgeschlagen. Der Container startet bewusst nicht mit
             einem inkonsistenten Schema. Backup einspielen oder
             RUN_MIGRATIONS=0 setzen, um ohne Migration zu starten."
    fi
elif [ "$RUN_MIGRATIONS" = "0" ]; then
    log "RUN_MIGRATIONS=0 - Migrationen werden uebersprungen."
fi

# --- 4) Start ---------------------------------------------------------------

# Falls der Aufrufer ein eigenes Kommando uebergeben hat (z. B.
# 'docker compose run --rm spoolman-labeler lpstat -t'), wird das ausgefuehrt.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

log "Starte uvicorn auf ${APP_HOST}:${APP_PORT} (app.main:app)"
exec uvicorn app.main:app \
    --host "$APP_HOST" \
    --port "$APP_PORT" \
    --workers "$APP_WORKERS" \
    --log-level "$UVICORN_LOG_LEVEL" \
    --proxy-headers \
    --forwarded-allow-ips "$APP_FORWARDED_ALLOW_IPS"
