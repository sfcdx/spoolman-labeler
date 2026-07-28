#!/usr/bin/env python3
"""Docker-HEALTHCHECK fuer den Anwendungscontainer.

Bewusst ohne curl/wget: das Laufzeit-Image enthaelt keines von beiden, und die
Standardbibliothek reicht voellig aus.

Exit-Codes nach Docker-Konvention:
    0  gesund
    1  ungesund
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

PORT = os.environ.get("APP_PORT", "7913")
PATH = os.environ.get("APP_HEALTH_PATH", "/api/health")
TIMEOUT = float(os.environ.get("APP_HEALTH_TIMEOUT", "4"))

# Immer ueber die Loopback-Adresse: der Healthcheck darf nicht davon abhaengen,
# an welche Adresse die Anwendung sonst gebunden ist, und erzeugt so auch
# keinen Verkehr im Compose-Netz.
URL = f"http://127.0.0.1:{PORT}{PATH}"


def main() -> int:
    request = urllib.request.Request(URL, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310
            if response.status != 200:
                print(f"unhealthy: HTTP {response.status} von {URL}", file=sys.stderr)
                return 1
            body = response.read(4096)
    except urllib.error.HTTPError as exc:
        print(f"unhealthy: HTTP {exc.code} von {URL}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, OSError) as exc:
        print(f"unhealthy: {URL} nicht erreichbar ({exc})", file=sys.stderr)
        return 1

    # Der Endpunkt darf einen Status im Body melden. Ist der Body kein JSON
    # oder enthaelt er kein "status", zaehlt allein HTTP 200.
    try:
        payload = json.loads(body)
    except (ValueError, TypeError):
        return 0

    if isinstance(payload, dict):
        status = str(payload.get("status", "ok")).lower()
        if status not in {"ok", "healthy", "up", "pass"}:
            print(f"unhealthy: status={status!r}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
