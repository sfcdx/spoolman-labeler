# syntax=docker/dockerfile:1.19
#
# Spoolman Labeler — Anwendungs-Image
# ===================================
#
# Aufbau (drei Stufen plus eine gemeinsame Basis):
#
#   frontend      Node baut das Vite-Frontend nach dist/
#   runtime-base  Debian trixie + genau die Laufzeitpakete, die das fertige
#                 Image braucht. Wird von backend-deps UND runtime als Basis
#                 verwendet, damit der Python-Interpreter in beiden Stufen
#                 bitgleich derselbe ist (siehe Abschnitt "python3-cups" unten).
#   backend-deps  uv installiert die Python-Abhaengigkeiten nach /opt/venv
#   runtime       schlankes Endergebnis, laeuft als nicht-privilegierter User
#
# -----------------------------------------------------------------------------
# Die zentrale Entscheidung: python3-cups (Distro) trifft auf uv (venv)
# -----------------------------------------------------------------------------
# ADR-008 verlangt pycups als Distributionspaket `python3-cups` — arch-nativ,
# ohne Compiler, damit Multi-Arch-Builds (amd64 + arm64) nicht an einer nativen
# Extension scheitern. PyPI liefert fuer pycups ausschliesslich ein sdist.
#
# Das Distributionspaket ist an genau eine Python-Minor-Version gebunden:
#
#   $ apt-cache show python3-cups   # Debian trixie, 2.0.4-2
#   Depends: libc6, libcups2t64, python3 (>= 3.13~), python3 (<< 3.14)
#
# Die Extension heisst `cups.cpython-313-<arch>-linux-gnu.so` und ist damit
# ausschliesslich von CPython 3.13 importierbar. Ein Basisimage
# `python:3.12-slim-trixie` kann sie NICHT laden — das ist der in ADR-008 und in
# docs/printing-architecture.md (Abschnitt 10, Punkt 7) offen gelassene Punkt,
# und er ist damit entschieden:
#
#   * Basis ist `debian:trixie-slim` mit dem python3 der Distribution (3.13).
#     Genau ein Interpreter im Image, ABI passt per Konstruktion.
#   * uv legt das Projekt-venv unter /opt/venv an — erzeugt AUS diesem
#     Interpreter (`--python /usr/bin/python3`) und mit
#     `--system-site-packages`, damit /usr/lib/python3/dist-packages und damit
#     `import cups` auf sys.path liegt.
#   * `UV_PYTHON_DOWNLOADS=never` verhindert, dass uv sich still einen eigenen
#     Standalone-Interpreter herunterlaedt. Das waere der stille Weg, auf dem
#     `import cups` wieder kaputtgeht.
#
# Warum nicht PYTHONPATH=/usr/lib/python3/dist-packages (der naheliegende Weg):
# PYTHONPATH steht in sys.path VOR den site-packages des venv. Distro-Pakete
# wuerden damit uv-verwaltete Pakete verdecken statt umgekehrt. Mit
# `--system-site-packages` ist die Reihenfolge richtig herum:
#
#   /opt/venv/lib/python3.13/site-packages   <- uv gewinnt immer
#   /usr/lib/python3/dist-packages           <- nur, was uv nicht kennt
#
# Ausfuehrliche Begruendung inkl. der verworfenen Alternativen:
# docs/deployment.md, Abschnitt "python3-cups und uv".
# -----------------------------------------------------------------------------


# =============================================================================
# Stufe 1 — Frontend
# =============================================================================
FROM node:26.5.1-trixie-slim AS frontend

WORKDIR /build

ENV CI=1 \
    npm_config_fund=false \
    npm_config_audit=false

# Erst nur die Manifeste kopieren: solange sich package.json/package-lock.json
# nicht aendern, bleibt die (teure) Installationsschicht im Cache.
COPY frontend/package.json frontend/package-lock.json ./

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        echo "WARNUNG: frontend/package-lock.json fehlt - Build ist nicht reproduzierbar." >&2; \
        npm install; \
    fi

COPY frontend/ ./

RUN npm run build \
 && test -d dist \
 && test -n "$(ls -A dist)"


# =============================================================================
# Stufe 2a — gemeinsame Laufzeitbasis
# =============================================================================
# Diese Stufe enthaelt exakt die Pakete, die im Endergebnis landen sollen.
# backend-deps und runtime bauen beide darauf auf, damit /opt/venv im
# Endergebnis auf denselben /usr/bin/python3 zeigt, mit dem es erzeugt wurde.
FROM debian:trixie-20260713-slim AS runtime-base

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
 && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      # --- Python-Laufzeit (Debian trixie => CPython 3.13) -------------------
      python3 \
      # --- CUPS-Anbindung ---------------------------------------------------
      # python3-cups ist pycups 2.0.4 als arch-natives Binaerpaket. Es zieht
      # libcups2t64 selbst nach; wir nennen die Bibliothek deshalb bewusst
      # nicht beim Namen (der t64-Suffix ist ein Transitionsdetail).
      python3-cups \
      # lpstat/lpinfo/lpadmin fuer Support-Sessions und manuelle Diagnose
      # (docs/printing-architecture.md, Abschnitt 5.4).
      cups-client \
      # --- WeasyPrint 69 ----------------------------------------------------
      # Exakt die Liste aus der WeasyPrint-Dokumentation, Abschnitt
      # "Debian >= 11 / inside a virtualenv using wheels".
      # libgobject-2.0 und libfontconfig kommen als Abhaengigkeit von
      # libpango-1.0-0 bzw. libpangoft2-1.0-0 mit.
      libpango-1.0-0 \
      libpangoft2-1.0-0 \
      libharfbuzz-subset0 \
      # fc-cache, damit der Schriftindex zur Build-Zeit feststeht und nicht
      # beim ersten Render erzeugt werden muss.
      fontconfig \
      # --- Schriften --------------------------------------------------------
      # Fehlt eine im Template genannte Familie, faellt Pango still auf einen
      # Ersatz zurueck und die Textbreite aendert sich. Auf einem 62-mm-Etikett
      # bricht das sofort um. Deshalb liegen die Basisfamilien fest im Image:
      #   fonts-dejavu-core   DejaVu Sans/Serif/Mono  (WeasyPrint-Default)
      #   fonts-liberation2   metrisch kompatibel zu Arial/Helvetica/
      #                       Times New Roman/Courier New
      fonts-dejavu-core \
      fonts-liberation2 \
      # --- Sonstiges --------------------------------------------------------
      ca-certificates \
      tzdata \
      # PID 1: Signalweiterleitung und Zombie-Reaping, unabhaengig davon, ob
      # der Betreiber `init: true` gesetzt hat.
      tini \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f \
 # Sicherung: bricht den Build ab, falls die Distro-Bindung jemals nicht mehr
 # zum Interpreter passt. Besser hier laut scheitern als spaeter zur Laufzeit.
 && python3 -c "import cups; print('pycups ok, python', __import__('sys').version)"


# =============================================================================
# Stufe 2b — Python-Abhaengigkeiten mit uv
# =============================================================================
FROM runtime-base AS backend-deps

# uv aus dem offiziellen, gepinnten Image. Kein curl|sh, kein Netzzugriff zur
# Installation von uv selbst.
COPY --from=ghcr.io/astral-sh/uv:0.11.33 /uv /uvx /usr/local/bin/

# Escape-Luke: Alle Laufzeitabhaengigkeiten des Projekts muessen Wheels fuer
# cp313 auf amd64 UND arm64 mitbringen — dann wird hier nichts kompiliert und
# der Multi-Arch-Build unter QEMU bleibt schnell. Sollte jemals eine
# Abhaengigkeit dazukommen, die nur als sdist existiert:
#   docker buildx build --build-arg INSTALL_BUILD_DEPS=1 ...
# Die Toolchain bleibt in dieser Stufe und landet nicht im Endergebnis.
ARG INSTALL_BUILD_DEPS=0
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    if [ "$INSTALL_BUILD_DEPS" = "1" ]; then \
        apt-get update && apt-get install -y --no-install-recommends \
            build-essential python3-dev libffi-dev libjpeg-dev libopenjp2-7-dev \
        && rm -rf /var/lib/apt/lists/*; \
    fi

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON=/usr/bin/python3 \
    # Niemals einen eigenen Interpreter herunterladen: der wuerde die
    # ABI-Bindung an python3-cups brechen.
    UV_PYTHON_DOWNLOADS=never \
    # Hardlinks funktionieren ueber den Cache-Mount hinweg nicht zuverlaessig.
    UV_LINK_MODE=copy \
    # .pyc zur Build-Zeit erzeugen -> schnellerer Kaltstart im Container.
    UV_COMPILE_BYTECODE=1

WORKDIR /app

# Das venv wird bewusst VORAB und von Hand angelegt, nicht von `uv sync`:
# nur so bekommt es `include-system-site-packages = true`. `uv sync` uebernimmt
# ein vorhandenes, kompatibles venv und laesst die Einstellung unangetastet.
RUN uv venv --python /usr/bin/python3 --system-site-packages "$UV_PROJECT_ENVIRONMENT" \
 && grep -q '^include-system-site-packages = true$' "$UV_PROJECT_ENVIRONMENT/pyvenv.cfg" \
 && "$UV_PROJECT_ENVIRONMENT/bin/python" -c "import cups"

# Nur Manifest und Lockfile einhaengen: die Abhaengigkeitsschicht wird damit
# ausschliesslich ungueltig, wenn sich pyproject.toml oder uv.lock aendert —
# nicht bei jeder Quelltextaenderung.
# --no-install-project: das Projekt selbst wird nicht als Paket installiert.
#   Der Quelltext liegt im Endergebnis unter /app und wird von dort importiert
#   (app.main:app). Damit ist der Build unabhaengig davon, ob backend/ ein
#   installierbares Paket mit build-backend ist.
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    --mount=type=bind,source=backend/pyproject.toml,target=/app/pyproject.toml \
    --mount=type=bind,source=backend/uv.lock,target=/app/uv.lock \
    uv sync --locked --no-dev --no-install-project

# Gegenprobe: nach dem sync muss `import cups` weiterhin funktionieren.
# Faengt den Fall ab, dass uv das venv doch neu erzeugt haette - dann waere
# die Verbindung zu den dist-packages weg und der Fehler faellt erst zur
# Laufzeit auf. Hier bricht der Build ab, und das ist richtig so.
RUN grep -q '^include-system-site-packages = true$' "$UV_PROJECT_ENVIRONMENT/pyvenv.cfg" \
 && "$UV_PROJECT_ENVIRONMENT/bin/python" -c "import cups; print('pycups im venv sichtbar')" \
 # WeasyPrint ist laut ADR-009 gesetzt, gehoert aber dem Backend-Manifest.
 # Hier nur eine Warnung, damit dieser Build nicht an einer Datei scheitert,
 # die er nicht besitzt.
 && ("$UV_PROJECT_ENVIRONMENT/bin/python" -c "import weasyprint" \
     || echo "WARNUNG: weasyprint fehlt in backend/pyproject.toml - Etikettenrendering wird nicht funktionieren." >&2)


# =============================================================================
# Stufe 3 — Laufzeit-Image
# =============================================================================
FROM runtime-base AS runtime

ARG VERSION=0.0.0-dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Spoolman Labeler" \
      org.opencontainers.image.description="Wareneingang und Etikettendruck fuer Spoolman" \
      org.opencontainers.image.source="https://github.com/sfcdx/spoolman-labeler" \
      org.opencontainers.image.documentation="https://github.com/sfcdx/spoolman-labeler/blob/main/docs/deployment.md" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}"

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Vom Anwendungscode gelesene Defaults. Alles hier ist nicht-geheim.
    #
    # Namen ohne APP_-Praefix: Settings (backend/app/core/config.py) hat
    # keinen env_prefix und liest Feldnamen direkt (data_dir -> DATA_DIR).
    # APP_HOST/APP_PORT sind Ausnahmen - die werden nicht von Settings,
    # sondern vom Entrypoint fuer den uvicorn-Aufruf gelesen (siehe
    # docker/labeler/entrypoint.sh).
    APP_HOST=0.0.0.0 \
    APP_PORT=7913 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static \
    ASSET_DIR=/app/assets \
    DATABASE_URL=sqlite+aiosqlite:////data/spoolman-labeler.db \
    XDG_CACHE_HOME=/data/.cache
# XDG_CACHE_HOME zeigt bewusst nach /data: /app gehoert root und ist fuer den
# App-User nicht beschreibbar. Ohne diesen Zeiger versuchte fontconfig bei
# jedem Render in $HOME/.cache zu schreiben und kippte eine Warnung ins Log.

# Nicht-privilegierter User. Feste, hohe ID, damit sie sich nicht zufaellig mit
# einem Host-User ueberschneidet.
RUN groupadd --system --gid 10001 labeler \
 && useradd --system --uid 10001 --gid 10001 \
      --home-dir /app --shell /usr/sbin/nologin labeler

COPY --from=backend-deps /opt/venv /opt/venv

WORKDIR /app

# Quelltext und gebautes Frontend gehoeren root und sind fuer den App-User nur
# lesbar. Die Anwendung schreibt ausschliesslich unterhalb von /data.
COPY backend/ /app/
COPY --from=frontend /build/dist /app/static
COPY docker/labeler/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/labeler/healthcheck.py /usr/local/bin/healthcheck.py

RUN chmod 0755 /usr/local/bin/entrypoint.sh \
 && mkdir -p /app/assets \
 # /data gehoert dem App-User. Beim ERSTEN Mount eines leeren Named Volume
 # uebernimmt Docker Inhalt und Eigentuemer aus dem Image - damit passt die
 # Berechtigung ohne Zutun des Betreibers. Bei einem Bind-Mount gilt das
 # nicht; siehe docs/deployment.md, Abschnitt Fehlerbehebung.
 && mkdir -p /data/templates /data/rendered /data/logs /data/.cache \
 && chown -R 10001:10001 /data \
 && chmod 0750 /data \
 # Byte-Code des Anwendungscodes vorkompilieren (das venv ist bereits
 # kompiliert). Fehler hier sind nicht fatal.
 && python -m compileall -q /app/app >/dev/null 2>&1 || true

USER 10001:10001

EXPOSE 7913

# Der Healthcheck spricht ausschliesslich 127.0.0.1 an und wertet /api/health
# aus. Kein curl noetig - das Skript nutzt die Python-Standardbibliothek.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["/opt/venv/bin/python", "/usr/local/bin/healthcheck.py"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
