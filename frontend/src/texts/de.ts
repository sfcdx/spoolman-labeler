/**
 * Zentraler Textkatalog (Deutsch).
 *
 * Alle Nutzertexte stehen hier — nicht verstreut im JSX. Damit bleibt eine
 * spaetere Internationalisierung (Post-MVP, siehe docs/ui-analysis.md
 * Abschnitt 8) eine reine Austauschoperation: Die Struktur dieses Objekts
 * entspricht bereits einem i18n-Namespace. Eine i18n-Bibliothek wird hier
 * bewusst noch NICHT eingebunden.
 *
 * Terminologie an Spoolmans deutscher Uebersetzung ausgerichtet
 * (`client/public/locales/de/common.json`, MIT, Copyright (c) 2023
 * Daniel Hultgren) — u. a. "Spule", "Hersteller", "Chargennummer",
 * "Beschriftung drucken", "Vorlage".
 */
export const texts = {
  app: {
    name: "Spoolman Labeler",
    tagline: "Wareneingang: Spule anlegen und Etikett drucken",
    titleSeparator: " – ",
  },

  nav: {
    landmark: "Hauptnavigation",
    skipToContent: "Zum Hauptinhalt springen",
    openMenu: "Navigation öffnen",
    closeMenu: "Navigation schließen",
    collapse: "Navigation einklappen",
    expand: "Navigation ausklappen",
    drawerTitle: "Navigation",
    newSpool: "Neue Spule",
    history: "Druckhistorie",
    templates: "Vorlagen",
    settings: "Einstellungen",
  },

  theme: {
    label: "Farbschema",
    system: "System",
    light: "Hell",
    dark: "Dunkel",
  },

  common: {
    notImplementedTitle: "Noch nicht umgesetzt",
    notImplementedText:
      "Dieser Bereich ist im Grundgerüst als Platzhalter angelegt. Die Funktionen folgen in einem späteren Schritt.",
    reload: "Erneut prüfen",
    loading: "Wird geladen …",
    unknown: "Unbekannt",
  },

  pages: {
    newSpool: {
      title: "Neue Spule",
      subtitle:
        "Filamentspule in Spoolman anlegen und im selben Vorgang ein Etikett drucken.",
      steps: {
        filament: "Filament wählen",
        spool: "Spulendaten erfassen",
        label: "Etikett prüfen",
        print: "Anlegen und drucken",
      },
      hint: "Anlegen und Drucken sind getrennte Schritte: Schlägt der Druck fehl, bleibt die angelegte Spule bestehen und kann erneut gedruckt werden.",
    },
    history: {
      title: "Druckhistorie",
      subtitle: "Alle Druckaufträge mit Status, Fehlermeldung und Wiederholungsmöglichkeit.",
      columns: {
        createdAt: "Zeitpunkt",
        spool: "Spule",
        printer: "Drucker",
        template: "Vorlage",
        status: "Status",
        actions: "Aktionen",
      },
      empty: "Es wurden noch keine Etiketten gedruckt.",
      statusNote:
        "Der Status unterscheidet zwischen „An CUPS übermittelt“ und „Physisch bestätigt“ — die Annahme in der Warteschlange ist noch kein Druckerfolg.",
    },
    templates: {
      title: "Vorlagen",
      subtitle: "Etikettenvorlagen mit Maßen in Millimetern, HTML und CSS.",
      create: "Neue Vorlage",
      empty: "Es sind noch keine Vorlagen angelegt.",
      qrNote:
        "QR-Codes verwenden standardmäßig das Format WEB+SPOOLMAN:S-{id}, damit Spoolmans eigener Scanner sie erkennt.",
    },
    settings: {
      title: "Einstellungen",
      subtitle: "Verbindungen, Drucker und Standardwerte.",
      sections: {
        spoolman: "Spoolman-Verbindung",
        cups: "Drucksystem (CUPS)",
        labels: "Etiketten",
      },
      fields: {
        spoolmanUrl: "Spoolman-Basis-URL",
        cupsServer: "CUPS-Server",
        defaultPrinter: "Standarddrucker",
        defaultTemplate: "Standardvorlage",
      },
      placeholders: {
        spoolmanUrl: "http://example.local:7912",
        cupsServer: "example.local:631",
        notSet: "Nicht gesetzt",
      },
      securityNote:
        "Spoolman kennt keine Authentifizierung. Betreiben Sie den gesamten Stack ausschließlich in einem vertrauenswürdigen lokalen Netzwerk.",
    },
    notFound: {
      title: "Seite nicht gefunden",
      subtitle: "Die aufgerufene Adresse existiert nicht.",
      backHome: "Zur Startseite",
    },
  },

  health: {
    landmark: "Systemstatus",
    heading: "Systemstatus",
    spoolman: "Spoolman",
    cups: "Drucksystem",
    database: "Datenbank",
    version: "Version",
    state: {
      ok: "Erreichbar",
      degraded: "Eingeschränkt",
      error: "Nicht erreichbar",
      unknown: "Unbekannt",
      loading: "Wird geprüft",
    },
    /** Barrierefreiheit: Status wird nie allein über Farbe transportiert. */
    describe: (component: string, state: string): string => `${component}: ${state}`,
    checkFailed: "Der Systemstatus konnte nicht abgerufen werden.",
  },

  errors: {
    network:
      "Der Server ist nicht erreichbar. Bitte prüfen Sie, ob Spoolman Labeler läuft, und versuchen Sie es erneut.",
    invalidResponse: "Der Server hat eine unerwartete Antwort geliefert.",
    http: "Die Anfrage ist fehlgeschlagen.",
    aborted: "Die Anfrage wurde abgebrochen.",
    unknown: "Es ist ein unbekannter Fehler aufgetreten.",
  },
} as const;

export type Texts = typeof texts;
