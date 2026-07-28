# Sicherheitsrichtlinie

## Unterstützte Versionen

Sicherheitsupdates gibt es für das jeweils aktuelle Minor-Release auf `main`.
Ältere Versionen werden nicht rückwirkend gepflegt.

| Version         | Unterstützt |
| --------------- | ----------- |
| Aktuelles Minor | ja          |
| Ältere          | nein        |

---

## Schwachstelle melden

**Bitte melde Sicherheitslücken nicht über öffentliche Issues.**

Nutze stattdessen die private Meldefunktion von GitHub:

1. Reiter **Security** des Repositories öffnen
2. **Report a vulnerability** wählen
3. Beschreibung, betroffene Version und — falls möglich — eine
   Reproduktionsanleitung angeben

Wir bestätigen den Eingang innerhalb von 7 Tagen und halten dich über den
Fortschritt auf dem Laufenden. Nach einem Fix wird die Meldung in den
Release Notes gewürdigt, sofern gewünscht.

---

## Sicherheitsmodell

Spoolman Labeler ist für den Betrieb in einem **vertrauenswürdigen lokalen
Netzwerk** ausgelegt — genau wie Spoolman selbst.

### Was die Anwendung zusichert

- Kein direkter Zugriff auf die Spoolman-Datenbank. Ausschließlich die
  offizielle REST-API wird verwendet.
- Keine generische Proxy-Schnittstelle: Es werden nur die konkret benötigten
  Spoolman-Operationen durchgereicht, jeweils mit eigener Validierung.
- Etikettenvorlagen werden in einer eingeschränkten Jinja2-Sandbox gerendert.
  Kein Dateisystemzugriff, keine ausgehenden Netzwerkanfragen, kein
  JavaScript, harte Zeitbegrenzung beim Rendern.
- Druckernamen und Queue-Namen werden validiert und niemals in eine Shell
  interpoliert.
- Zugangsdaten erscheinen nicht in Logs, Fehlermeldungen oder API-Antworten.
- Der Container läuft als Nicht-Root-Benutzer.
- Eingaben werden über Pydantic validiert.

### Was die Anwendung **nicht** zusichert

- **Keine eingebaute Authentifizierung.** Wer die Weboberfläche erreicht, kann
  Spulen anlegen und drucken. Die Architektur schließt eine spätere
  Authentifizierung nicht aus, der MVP enthält sie aber nicht.
- **Keine Mandantenfähigkeit** und keine Rollen- oder Rechteverwaltung.
- **Keine Absicherung gegen einen bösartigen CUPS-Server.**

### Betriebsempfehlungen

- Port `7913` **nicht** ins öffentliche Internet exponieren.
- Kein Port-Forwarding auf Spoolman Labeler oder CUPS im Router einrichten.
- Wenn Fernzugriff nötig ist: VPN oder ein vorgelagerter Reverse Proxy mit
  eigener Authentifizierung.
- Das CUPS-Webinterface (Port `631`) nur im LAN erreichbar machen.
- Das Verzeichnis `/data` regelmäßig sichern — es enthält Einstellungen,
  Vorlagen und die Druckhistorie.

---

## Umgang mit Geheimnissen

- Geheimnisse gehören in `.env` oder Docker Secrets, niemals ins Repository.
- `.env` ist über `.gitignore` ausgeschlossen. Nur `.env.example` mit
  Platzhalterwerten wird versioniert.
- Als geheim markierte Einstellungen werden in API-Antworten maskiert.
- Die CI führt bei jedem Pull Request einen Secret-Scan aus.

Wenn ein Geheimnis versehentlich veröffentlicht wurde, gilt es als
kompromittiert: zuerst rotieren, dann die Historie bereinigen.
