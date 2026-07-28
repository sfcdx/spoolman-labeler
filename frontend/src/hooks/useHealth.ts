import { useCallback, useEffect, useRef, useState } from "react";
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
 * Ein Fehler ersetzt die letzte Antwort nicht — die Anzeige bleibt stabil.
 */
export function useHealth(intervalMs: number = HEALTH_POLL_INTERVAL_MS): UseHealthResult {
  const [health, setHealth] = useState<Health | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    getHealth(controller.signal)
      .then((result) => {
        if (cancelled || !mountedRef.current) {
          return;
        }
        setHealth(result);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (cancelled || !mountedRef.current) {
          return;
        }
        const apiError = toApiError(cause);
        if (apiError.code === "REQUEST_ABORTED") {
          return;
        }
        setError(apiError);
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) {
          return;
        }
        setLoading(false);
      });

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
