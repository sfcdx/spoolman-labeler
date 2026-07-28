import { useCallback, useSyncExternalStore } from "react";

function supportsMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/**
 * Beobachtet eine Media Query live.
 *
 * Bewusst `useSyncExternalStore` statt `useState` + `useEffect`: Die Query ist
 * eine externe Datenquelle, der Wert ist damit schon beim ersten Rendern
 * korrekt und es entstehen keine Folgerenderings.
 *
 * Ebenfalls bewusst statt `Grid.useBreakpoint()`, damit die Layout-Umschaltung
 * an einer einzigen, explizit benannten Bedingung haengt.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!supportsMatchMedia()) {
        return () => {};
      }
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => {
        mediaQueryList.removeEventListener("change", onStoreChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => (supportsMatchMedia() ? window.matchMedia(query).matches : false),
    [query],
  );

  // Ohne DOM (Server, Tests ohne Fenster) gilt die Query als nicht erfuellt.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Breakpoint, ab dem die Seitenleiste in einen Drawer wandert. */
export const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
