/**
 * Steuerbarer `matchMedia`-Ersatz fuer Tests.
 *
 * jsdom bringt `matchMedia` nicht mit. Der Ersatz hier ist bewusst keine
 * Attrappe, die immer `false` liefert: Er kann waehrend eines Tests seinen
 * Zustand aendern und feuert dann echte `change`-Events — nur so laesst sich
 * der `system`-Modus des Farbschemas pruefen.
 */

type ChangeListener = (event: MediaQueryListEvent) => void;

interface FakeMediaQueryList {
  media: string;
  matches: boolean;
  onchange: ChangeListener | null;
  listeners: Set<ChangeListener>;
}

export interface MatchMediaController {
  /** Setzt `(prefers-color-scheme: dark)`. */
  setPrefersDark: (dark: boolean) => void;
  /** Setzt alle `max-width`-Abfragen (mobiles Layout). */
  setMobile: (mobile: boolean) => void;
  /** Entfernt alle registrierten Abfragen und setzt den Zustand zurueck. */
  reset: () => void;
}

interface MatchMediaState {
  prefersDark: boolean;
  mobile: boolean;
}

const state: MatchMediaState = { prefersDark: false, mobile: false };
const registry = new Map<string, FakeMediaQueryList>();

function evaluate(query: string): boolean {
  const normalized = query.toLowerCase();
  if (normalized.includes("prefers-color-scheme: dark")) {
    return state.prefersDark;
  }
  if (normalized.includes("prefers-color-scheme: light")) {
    return !state.prefersDark;
  }
  if (normalized.includes("max-width")) {
    return state.mobile;
  }
  return false;
}

function notifyAll(): void {
  for (const entry of registry.values()) {
    const next = evaluate(entry.media);
    if (next === entry.matches) {
      continue;
    }
    entry.matches = next;
    const event = { matches: next, media: entry.media } as MediaQueryListEvent;
    entry.onchange?.(event);
    for (const listener of entry.listeners) {
      listener(event);
    }
  }
}

function createMediaQueryList(query: string): MediaQueryList {
  const entry: FakeMediaQueryList = {
    media: query,
    matches: evaluate(query),
    onchange: null,
    listeners: new Set(),
  };
  registry.set(query, entry);

  const api = {
    get media() {
      return entry.media;
    },
    get matches() {
      return entry.matches;
    },
    get onchange() {
      return entry.onchange;
    },
    set onchange(listener: ChangeListener | null) {
      entry.onchange = listener;
    },
    addEventListener: (type: string, listener: ChangeListener) => {
      if (type === "change") {
        entry.listeners.add(listener);
      }
    },
    removeEventListener: (type: string, listener: ChangeListener) => {
      if (type === "change") {
        entry.listeners.delete(listener);
      }
    },
    // Veraltete API, die einige Bibliotheken noch nutzen.
    addListener: (listener: ChangeListener) => entry.listeners.add(listener),
    removeListener: (listener: ChangeListener) => entry.listeners.delete(listener),
    dispatchEvent: () => true,
  };

  return api as unknown as MediaQueryList;
}

/** Installiert den Ersatz auf `window` und liefert die Steuerung zurueck. */
export function installMatchMedia(): MatchMediaController {
  window.matchMedia = ((query: string) =>
    registry.has(query)
      ? ({
          ...createMediaQueryListFromExisting(query),
        } as MediaQueryList)
      : createMediaQueryList(query)) as typeof window.matchMedia;

  return controller;
}

/**
 * Liefert fuer eine bereits registrierte Abfrage dieselbe Instanz, damit
 * Listener aus mehreren Aufrufen denselben Zustand sehen.
 */
function createMediaQueryListFromExisting(query: string): MediaQueryList {
  const entry = registry.get(query);
  if (!entry) {
    return createMediaQueryList(query);
  }
  return {
    get media() {
      return entry.media;
    },
    get matches() {
      return entry.matches;
    },
    get onchange() {
      return entry.onchange;
    },
    set onchange(listener: ChangeListener | null) {
      entry.onchange = listener;
    },
    addEventListener: (type: string, listener: ChangeListener) => {
      if (type === "change") {
        entry.listeners.add(listener);
      }
    },
    removeEventListener: (type: string, listener: ChangeListener) => {
      if (type === "change") {
        entry.listeners.delete(listener);
      }
    },
    addListener: (listener: ChangeListener) => entry.listeners.add(listener),
    removeListener: (listener: ChangeListener) => entry.listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
}

export const controller: MatchMediaController = {
  setPrefersDark: (dark: boolean) => {
    state.prefersDark = dark;
    notifyAll();
  },
  setMobile: (mobile: boolean) => {
    state.mobile = mobile;
    notifyAll();
  },
  reset: () => {
    registry.clear();
    state.prefersDark = false;
    state.mobile = false;
  },
};
