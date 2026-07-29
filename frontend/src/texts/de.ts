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
      subtitle: "Spule etikettieren: vorhandene Spule sofort drucken oder neue Spule anlegen.",
      hint: "Anlegen und Drucken sind getrennte Schritte: Schlägt der Druck fehl, bleibt die angelegte Spule bestehen und kann erneut gedruckt werden.",
      entry: {
        existing: "Vorhandene Spule Etikett drucken",
        existingHint: "Eine bereits in Spoolman angelegte Spule suchen und direkt drucken.",
        new: "Neue Spule",
        newHint: "Filament und Spulendaten erfassen und im selben Vorgang drucken.",
      },
      existing: {
        searchPlaceholder: "Spule suchen (Filament oder Hersteller) …",
        none: "Keine Spule ausgewählt",
        selectedTitle: "Ausgewählte Spule",
        spoolId: "Spoolman-ID",
        material: "Material",
        location: "Lagerort",
        printAction: "Drucken",
        printing: "Wird gedruckt …",
        printSuccess: "Druckauftrag wurde ausgelöst",
        printFailed: "Druck fehlgeschlagen",
        searchAgain: "Weitere Spule suchen",
        printAgain: "Erneut drucken",
      },
      filament: {
        sectionTitle: "Filament",
        modeExisting: "Vorhandenes Filament",
        modeNew: "Neues Filament anlegen",
        search: "Filament suchen (Name oder Material)",
        searchPlaceholder: "z. B. PLA, Prusament …",
        selected: "Ausgewähltes Filament",
        none: "Kein Filament ausgewählt",
        vendor: "Hersteller",
        vendorPlaceholder: "Hersteller suchen oder neu anlegen",
        vendorNew: (name: string): string => `„${name}“ wird beim Anlegen neu erstellt`,
        name: "Bezeichnung",
        material: "Material",
        colorHex: "Farbe (Hex, ohne #)",
        density: "Dichte (g/cm³)",
        diameter: "Durchmesser (mm)",
      },
      spool: {
        sectionTitle: "Spulendaten",
        quantity: "Anzahl Spulen",
        quantityHint: "Jede Spule erhält eine eigene Spoolman-ID und ein eigenes Etikett.",
        location: "Lagerort",
        lotNr: "Chargennummer",
        comment: "Kommentar",
        initialWeight: "Anfangsgewicht (g)",
        spoolWeight: "Leergewicht der Spule (g)",
      },
      advanced: {
        toggle: "Erweitert: Drucker und Vorlage",
        template: "Vorlage",
        printer: "Drucker",
        copies: "Kopien je Etikett",
        auto: "Es wird die hinterlegte Standardvorlage bzw. der Standarddrucker verwendet.",
        noTemplates: "Es sind noch keine Vorlagen vorhanden.",
        noPrinters: "Es ist noch kein Drucker eingerichtet.",
        goToTemplates: "Zu den Vorlagen",
        goToSettings: "Zu den Einstellungen",
      },
      submit: {
        action: "Anlegen und drucken",
        submitting: "Wird angelegt und gedruckt …",
        again: "Weitere Spule anlegen",
        back: "Zurück",
        next: "Weiter",
        resultTitle: "Ergebnis",
        statusLabel: {
          completed: "Erfolgreich angelegt und gedruckt",
          partial: "Angelegt, Druck teilweise fehlgeschlagen",
          failed: "Anlegen fehlgeschlagen",
        },
        createdSpools: "Angelegte Spulen (Spoolman-ID)",
        partialHint:
          "Die Spulen sind unwiderruflich in Spoolman angelegt. Fehlgeschlagene Drucke lassen sich in der Druckhistorie erneut auslösen.",
        goToHistory: "Zur Druckhistorie",
      },
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
      status: {
        queued: "In Warteschlange",
        submitted: "An CUPS übermittelt",
        processing: "Wird gedruckt",
        completed: "Abgeschlossen",
        failed: "Fehlgeschlagen",
        cancelled: "Abgebrochen",
        unknown: "Unbekannt",
      },
      filterAll: "Alle",
      retry: "Erneut drucken",
      retrying: "Wird erneut gedruckt …",
      loadFailed: "Die Druckhistorie konnte nicht geladen werden.",
      spoolLabel: (id: number): string => `Spule #${id}`,
      noPrinter: "Kein Drucker hinterlegt",
      noTemplate: "Keine Vorlage hinterlegt",
    },
    templates: {
      title: "Vorlagen",
      subtitle: "Etikettenvorlagen mit Maßen in Millimetern, HTML und CSS.",
      create: "Neue Vorlage",
      empty: "Es sind noch keine Vorlagen angelegt.",
      qrNote:
        "QR-Codes verwenden standardmäßig das Format WEB+SPOOLMAN:S-{id}, damit Spoolmans eigener Scanner sie erkennt.",
      builtin: "Eingebaut",
      fields: {
        name: "Name",
        description: "Beschreibung",
        html: "HTML",
        css: "CSS",
        width: "Breite (mm)",
        height: "Höhe (mm)",
        isDefault: "Als Standardvorlage verwenden",
      },
      actions: {
        edit: "Bearbeiten",
        duplicate: "Duplizieren",
        delete: "Löschen",
        preview: "Vorschau",
        save: "Speichern",
        cancel: "Abbrechen",
        importSpoolman: "Spoolman-Preset importieren",
      },
      duplicateNamePrompt: "Name der Kopie",
      deleteConfirm: "Diese Vorlage wirklich löschen?",
      builtinProtected: "Eingebaute Vorlagen können nicht geändert oder gelöscht werden.",
      importHint:
        "Fügen Sie ein Spoolman-Preset als JSON ein (aus Spoolman: Einstellungen → Etiketten exportieren).",
      importUnknownTags: (tags: string[]): string =>
        `Unbekannte Platzhalter wurden als „?“ übernommen: ${tags.join(", ")}`,
      saveFailed: "Die Vorlage konnte nicht gespeichert werden.",
      previewFailed: "Die Vorschau konnte nicht erzeugt werden.",
    },
    settings: {
      title: "Einstellungen",
      subtitle: "Verbindungen, Drucker und Standardwerte.",
      sections: {
        spoolman: "Spoolman-Verbindung",
        cups: "Drucksystem (CUPS)",
        labels: "Etiketten",
        printers: "Drucker",
      },
      fields: {
        spoolmanUrl: "Spoolman-Basis-URL",
        cupsServer: "CUPS-Server",
        cupsPort: "CUPS-Port",
        defaultPrinter: "Standarddrucker",
        defaultTemplate: "Standardvorlage",
        name: "Name",
        queueName: "CUPS-Warteschlange",
        location: "Standort",
        model: "Modell",
        labelWidth: "Etikettenbreite (mm)",
        labelHeight: "Etikettenhöhe (mm)",
        copies: "Kopien",
        isDefault: "Standarddrucker",
      },
      placeholders: {
        spoolmanUrl: "http://example.local:7912",
        cupsServer: "example.local:631",
        notSet: "Nicht gesetzt",
      },
      securityNote:
        "Spoolman kennt keine Authentifizierung. Betreiben Sie den gesamten Stack ausschließlich in einem vertrauenswürdigen lokalen Netzwerk.",
      connection: {
        save: "Speichern",
        reset: "Auf Vorgabe zurücksetzen",
        saveFailed: "Die Einstellung konnte nicht gespeichert werden.",
        overridden: "Angepasst",
        default: "Vorgabe aus der Umgebungskonfiguration",
        openSpoolman: "Spoolman öffnen",
        cupsHint:
          "Wird bereits mit dem Stack ausgeliefert (siehe Docker-Compose). Nur ändern, wenn ein externer CUPS-Server verwendet wird.",
      },
      discover: {
        button: "Drucker suchen",
        searching: "Suche läuft …",
        empty: "Auf dem konfigurierten CUPS-Server wurden keine Warteschlangen gefunden.",
        failed: "Die Drucker-Suche ist fehlgeschlagen.",
        unsupported: "Name enthält nicht unterstützte Zeichen",
        use: "Übernehmen",
        title: "Gefundene CUPS-Warteschlangen",
      },
      printers: {
        add: "Drucker hinzufügen",
        empty: "Es ist noch kein Drucker eingerichtet.",
        test: "Verbindung testen",
        testing: "Verbindung wird geprüft …",
        deleteConfirm: "Diesen Drucker wirklich löschen?",
        save: "Speichern",
        cancel: "Abbrechen",
        edit: "Bearbeiten",
        delete: "Löschen",
        saveFailed: "Der Drucker konnte nicht gespeichert werden.",
      },
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
