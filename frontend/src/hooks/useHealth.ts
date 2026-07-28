import { useCallback, useEffect, useState } from "react";
import { getHealth, toApiError, type ApiError, type Health } from "../api";

export interface UseHealthResult {
  health: Health | undefined;
  error: ApiError | undefined;
  loading: boolean;
  refresh: () => void;
}

/** Standardintervall der Statusabfrage in Millisekunden. */
export const HEALTH_POLL_INTERVAL_MS = 30_000;

/**
 * Fragt `GET /api/health` ab und wiederholt das in festem Intervall.
 *
 * Eine fehlgeschlagene Abfrage loescht die zuletzt bekannte Antwort nicht —
 * die Anzeige bleibt stabil und meldet zusaetzlich den Fehler.
 */
export function useHealth(intervalMs: number = HEALTH_POLL_INTERVAL_MS): UseHealthResult {
  const [health, setHealth] = useState<Health | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    // Alle Zustandsaenderungen bewusst in genau einem Zweig, damit React sie
    // zu einem einzigen Rendering zusammenfasst.
    void (async () => {
      try {
        const result = await getHealth(controller.signal);
        if (cancelled) {
          return;
        }
        setHealth(result);
        setError(undefined);
        setLoading(false);
      } catch (cause) {
        if (cancelled) {
          return;
        }
        const apiError = toApiError(cause);
        if (apiError.code === "REQUEST_ABORTED") {
          return;
        }
        setError(apiError);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tick]);

  useEffect(() => {
    if (intervalMs <= 0) {
      return;
    }
    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs, refresh]);

  return { health, error, loading, refresh };
}
