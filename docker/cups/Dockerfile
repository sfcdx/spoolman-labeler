# syntax=docker/dockerfile:1.19
#
# Schlanker CUPS-Sidecar fuer Spoolman Labeler
# ============================================
#
# Der MVP nutzt laut ADR-005 das Fremd-Image `anujdatar/cups` (gepinnt). Dieses
# Image hier ist der in ADR-005 angekuendigte Zielzustand und laesst sich ohne
# Aenderung an docker-compose.yml aktivieren:
#
#     # .env
#     COMPOSE_FILE=docker-compose.yml:docker-compose.cups.yml
#
# Warum ueberhaupt ein eigenes Image (docs/printing-architecture.md, 4.2):
#
#   * Beide geprueften Fremd-Images beziehen ihre Treiber ueber
#     `printer-driver-all`. Das Paket loest ueber `Recommends` statt `Depends`
#     auf - ein `--no-install-recommends` beim Maintainer wuerde saemtliche
#     Treiber lautlos verschwinden lassen. Zusaetzlich ist es laut Kommentar in
#     olbats Dockerfile bereits aus Debian testing entfernt worden.
#     Hier steht stattdessen eine explizite Liste.
#   * Ohne hplip, openprinting-ppds, hpijs-ppds, smbclient und
#     foomatic-db-compressed-ppds faellt der komplette HP-Inkjet-Treiberstack
#     weg. Fuer ein Etikettenwerkzeug ist das Ballast.
#   * Der Entrypoint-Vertrag (/etc/cups-bak) ist damit unser eigener und
#     testbar, statt vom Wohlwollen eines Fremd-Maintainers abzuhaengen.
#
# ACHTUNG bei der Pflege: Dieses Image erbt die Verantwortung fuer
# Sicherheitsupdates. Ohne zeitgesteuerten CI-Rebuild (z. B. woechentlich) ist
# es schnell schlechter als jedes gepflegte Fremd-Image.

FROM debian:trixie-20260713-slim

ARG VERSION=0.0.0-dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Spoolman Labeler CUPS" \
      org.opencontainers.image.description="Schlanker CUPS-Server mit Etikettendrucker-Treibern" \
      org.opencontainers.image.source="https://github.com/sfcdx/spoolman-labeler" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}"

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    CUPS_ADMIN=admin \
    TZ=UTC

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
 && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      # --- CUPS selbst ------------------------------------------------------
      cups \
      cups-client \
      cups-filters \
      # ipptool: fuer Diagnose gegen echte IPP-Drucker
      cups-ipp-utils \
      # --- Treiber: explizit, NICHT ueber printer-driver-all ----------------
      # Brother P-touch und QL-Serie. Liefert /usr/lib/cups/driver/ptouch,
      # einen dynamischen PPD-Generator - die konkreten PPD-Namen erscheinen
      # daher erst zur Laufzeit in `lpinfo -m`.
      printer-driver-ptouch \
      # Dymo LabelWriter
      printer-driver-dymo \
      # Brother-Monochromlaser (QL-Modelle mit Laser-Firmware, HL-Serie)
      printer-driver-brlaser \
      # Virtueller PDF-Drucker: erlaubt Entwicklung und Tests ohne Hardware.
      printer-driver-cups-pdf \
      # --- Werkzeuge --------------------------------------------------------
      # lsusb - erste Debug-Frage bei USB-Problemen
      usbutils \
      ca-certificates \
      tzdata \
      # PID 1: Signalweiterleitung und Zombie-Reaping
      tini \
 && rm -rf /var/lib/apt/lists/*

# Bewusst NICHT installiert:
#   avahi-daemon  -> braucht network_mode: host (bricht die Compose-DNS-
#                    Aufloesung), kollidiert auf 5353/udp mit dem Host-Avahi
#                    jedes NAS, und die verbreitete Begleitempfehlung
#                    "-v /var/run/dbus:/var/run/dbus" ueberschreibt den
#                    System-D-Bus-Socket des Hosts. ADR-007.
#   printer-driver-all, hplip, openprinting-ppds, foomatic-db-compressed-ppds
#                 -> siehe Kommentar oben.

COPY cupsd.conf /etc/cups/cupsd.conf

RUN chown root:lp /etc/cups/cupsd.conf \
 && chmod 0640 /etc/cups/cupsd.conf \
 # Der Kern des Persistenz-Vertrags: die vollstaendige Default-Konfiguration
 # liegt unveraenderlich im Image. Der Entrypoint spiegelt sie mit `cp -rpn`
 # nach /etc/cups, ohne je etwas zu ueberschreiben.
 && cp -rp /etc/cups /etc/cups-bak

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

# Kein VOLUME-Statement: Das Volume kommt aus docker-compose.yml. Ein VOLUME
# hier wuerde bei einem blossen `docker run` anonyme Volumes erzeugen, die
# niemand aufraeumt.

EXPOSE 631

# cupsd laeuft als root - das ist hier richtig, nicht nachlaessig: die
# usbfs-Nodes unter /dev/bus/usb gehoeren auf dem Host root:root, und cupsd
# legt selbst privilegien-getrennte Kindprozesse fuer die Filter an.
# Siehe docs/printing-architecture.md, Abschnitt 4.3.

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD ["/bin/sh", "-c", "LC_ALL=C lpstat -r >/dev/null 2>&1"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
# Nur -f (Vordergrund). Die Skizze in docs/printing-architecture.md, Abschnitt
# 4.2, nennt "cupsd -f -l" - das ist ein Fehler in der Vorlage: -l weist cupsd
# an, seine Listening-Sockets per Socket-Activation von launchd/systemd
# entgegenzunehmen (LISTEN_FDS). Im Container gibt es die nicht, cupsd wuerde
# dann nicht auf 631 lauschen. Siehe cupsd(8).
CMD ["/usr/sbin/cupsd", "-f"]
