import { request } from "./client";

/**
 * Rohdaten aus Spoolman. `SpoolmanRecord` in der Backend-API lässt beliebige
 * Zusatzfelder zu (`extra="allow"`) — hier bewusst nur die Felder typisiert,
 * die die Oberfläche tatsächlich anzeigt.
 */
export interface SpoolmanVendor {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface SpoolmanFilament {
  id: number;
  name?: string | null;
  material?: string | null;
  color_hex?: string | null;
  density: number;
  diameter: number;
  vendor?: SpoolmanVendor | null;
  [key: string]: unknown;
}

export function searchVendors(name: string, signal?: AbortSignal): Promise<SpoolmanVendor[]> {
  return request<SpoolmanVendor[]>("/spoolman/vendors", {
    query: { name: name || undefined },
    ...(signal ? { signal } : {}),
  });
}

export function searchFilaments(name: string, signal?: AbortSignal): Promise<SpoolmanFilament[]> {
  return request<SpoolmanFilament[]>("/spoolman/filaments", {
    query: { name: name || undefined },
    ...(signal ? { signal } : {}),
  });
}

export function listPrintPresets(signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  return request<Record<string, unknown>[]>("/spoolman/print-presets", signal ? { signal } : {});
}

export function createVendor(name: string): Promise<SpoolmanVendor> {
  return request<SpoolmanVendor>("/spoolman/vendors", { method: "POST", body: { name } });
}
