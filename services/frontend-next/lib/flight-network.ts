// PR 111: Flight Connection route network API (backend-rust flight_network.rs).
import { fetchFrom } from "@/lib/api";

export type FlightBand = { code: string; label: string; min_degree: number; color: string; radius_px: number };
export type FlightSource = {
  code: string; name: string; license: string; attribution: string;
  data_as_of?: string | null; refreshed_at?: string | null; row_count?: number | null;
};
export type FlightAirport = {
  iata: string; icao?: string | null; name: string; city?: string | null; country_iso2: string;
  latitude: number; longitude: number; degree: number; band?: string | null; near_outbreak: boolean;
};
export type FlightDestination = FlightAirport & { airline_count: number; airlines: string[] };
export type FlightAirportsResponse = {
  status: string; source: string; region: string; regions: string[]; total: number;
  near_outbreak_count: number; outbreak_radius_km: number; outbreak_lookback_days: number;
  bands: FlightBand[]; sources: FlightSource[]; airports: FlightAirport[]; cached?: boolean; error?: string;
};
export type FlightRoutesResponse = {
  status: string; region: string; origin: FlightAirport; total: number; total_all_regions: number;
  outbreak_radius_km: number; destinations: FlightDestination[]; cached?: boolean; error?: string;
};

export const REGION_LABELS: Record<string, string> = {
  ASEAN: "ASEAN",
  ASEAN_PLUS_THREE: "ASEAN+3",
  GLOBAL: "Global",
};

/** PR 117: the backend answers 503 when the DB pool is busy (retryable). Retry once after a short wait. */
async function withBusyRetry<T>(run: () => Promise<T>, signal?: AbortSignal | null, waitMs = 2000): Promise<T> {
  try {
    return await run();
  } catch (err: any) {
    if (err?.name === "AbortError" || signal?.aborted || !String(err?.message || err).includes("503")) throw err;
    await new Promise<void>((resolve, reject) => {
      const id = setTimeout(resolve, waitMs);
      signal?.addEventListener("abort", () => { clearTimeout(id); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
    return run();
  }
}

export const fetchFlightAirports = (region?: string, init?: RequestInit) =>
  withBusyRetry(
    () => fetchFrom<FlightAirportsResponse>(
      `/api/v1/map-layers/flight-airports${region ? `?region=${encodeURIComponent(region)}` : ""}`,
      init,
    ),
    init?.signal,
  );

export const fetchFlightRoutes = (airport: string, region?: string, init?: RequestInit) => {
  const q = new URLSearchParams({ airport });
  if (region) q.set("region", region);
  return withBusyRetry(() => fetchFrom<FlightRoutesResponse>(`/api/v1/map-layers/flight-routes?${q.toString()}`, init), init?.signal);
};
