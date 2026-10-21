import { getCurrentEpiWeek } from "@/lib/epi-week";
import { exportResponseProblem, exportFilename } from './exportDownload.mjs';
import { ASEAN11_SCOPE, isAseanDefaultScope } from "@/lib/asean-scope";
import { fetchMapLayer, LAYER_TTL_MS } from "@/lib/map-layer-client.mjs";
import type {
  Source,
  Run,
  SummaryRow,
  DashboardStats,
  PublicDashboard,
  DiseaseEvent,
  CrawlJobStatus,
  CrawlHistoryRow,
  CrawlHistoryJob,
  CrawlHistorySummary,
  InteroperabilityIntegration,
  SourceSummary,
  VectorSightingsResponse,
  LiveFlightsResponse,
  FireHotspotsResponse,
  WorldPopMeta,
  MapHazardsResponse,
  MapEnvironmentResponse,
} from "@/types";

// Client-side: proxy via Next.js rewrites /nlp/api/* → backend-rust:8081/api/*
// Server-side: use internal Docker DNS
function baseURL(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BASE_PATH || "/nlp";
  }

  return process.env.API_INTERNAL_URL || "http://backend-rust:8081";
}

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatApiError(res: Response, json?: any): string {
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      const hadToken = !!localStorage.getItem("auth_token");
      if (hadToken) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        localStorage.removeItem("auth_session_meta");
        try {
          document.cookie = "auth_token=; path=/; max-age=0; SameSite=Lax";
        } catch {}
        window.dispatchEvent(
          new CustomEvent("auth:expired", {
            detail: { reason: json?.code || "unauthorized" },
          })
        );
      }
    }
  }
  if (json?.error && typeof json.error === "string") return json.error;
  if (json?.detail && typeof json.detail === "string") return json.detail;
  if (res.status === 401 || res.status === 403) {
    return `Authentication required (${res.status}). Sign in again if the session expired.`;
  }
  if (res.status === 408) {
    return "URL extraction timed out (408). The source website is slow or blocking crawler access. The article was not lost — retry, or use Re-analyze after a cached row.";
  }
  if (res.status === 429) {
    return "Upstream rate-limited (429). Wait before retrying this layer.";
  }
  if (res.status === 503) {
    return "Service unavailable (503): gateway or upstream overloaded. This is not a generic server crash.";
  }
  if (res.status === 504) {
    return "Gateway Timeout (504): Server or upstream gateway timed out while retrieving data. Please retry or refresh the page.";
  }
  if (res.status === 502) {
    return "Bad Gateway (502): The backend service is unreachable or restarting. Please try again.";
  }
  if (res.status >= 500) {
    return `Upstream error (${res.status}${res.statusText ? `: ${res.statusText}` : ""}).`;
  }
  const text = res.statusText ? `: ${res.statusText}` : "";
  return `API ${res.status}${text}`;
}

export function isAuthFailureMessage(message?: string | null) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("authentication required") ||
    text.includes("401") ||
    text.includes("403") ||
    text.includes("expired session") ||
    text.includes("sign in")
  );
}

export function isTimeoutFailureMessage(message?: string | null) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("504") ||
    text.includes("408") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("gateway timeout")
  );
}

async function parseResponseJson(res: Response) {
  return res.json().catch(() => null);
}

const LEDGER_RETRY_STATUSES = [408, 502, 503, 504];
const LEDGER_RETRIES = 2;
const LEDGER_RETRY_MAX_MS = 5000;

/** Retry-After (seconds) when the server sends it, else 800 ms doubling, plus jitter. */
export function ledgerRetryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter);
  const base = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 800 * 2 ** attempt;
  return Math.min(LEDGER_RETRY_MAX_MS, base) + Math.floor(Math.random() * 250);
}

function waitUnlessAborted(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}

async function fetchLedger(path: string, init?: RequestInit): Promise<Response> {
  const attempt = async (headers: Record<string, string>) =>
    fetch(`${baseURL()}${path}`, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: { ...headers, ...(init?.headers || {}) },
    });
  // Crawl History is login-only (PR 78): never retry it anonymously. Related
  // counts are public (published rows) and may still fall back.
  const loginOnly = isLoginOnlyLedgerPath(path);
  const attemptWithAuth = async () => {
    const res = await attempt(authHeaders());
    if (!loginOnly && (res.status === 401 || res.status === 403)) return await attempt({});
    return res;
  };
  let res = await attemptWithAuth();
  for (let retry = 0; retry < LEDGER_RETRIES && LEDGER_RETRY_STATUSES.includes(res.status); retry++) {
    await waitUnlessAborted(ledgerRetryDelayMs(res.headers.get("Retry-After"), retry), init?.signal);
    res = await attemptWithAuth();
  }
  return res;
}

export function isLoginOnlyLedgerPath(path: string) {
  return path.includes("/api/v1/crawl-history") && !path.includes("/api/v1/crawl-history/summary");
}

function isLedgerPath(path: string) {
  return path.includes("/api/v1/crawl-history") || path.includes("/api/v1/events/related-counts");
}

export async function fetchFrom<T>(path: string, init?: RequestInit): Promise<T> {
  const ledger = isLedgerPath(path);
  const res = ledger
    ? await fetchLedger(path, init)
    : await fetch(`${baseURL()}${path}`, {
        cache: "no-store",
        credentials: "same-origin",
        ...init,
        headers: { ...authHeaders(), ...(init?.headers || {}) },
      });
  if (init?.signal?.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return (json?.data ?? json) as T;
}

export async function postTo<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiErrorWithBody(res, json);
  }

  return (json?.data ?? json) as T;
}

export async function putTo<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw apiErrorWithBody(res, json);

  return (json?.data ?? json) as T;
}

/** PR 136: keep status and the JSON body on the Error so callers can read structured details (e.g. country_conflict). */
function apiErrorWithBody(res: Response, json: any): Error {
  const err = new Error(formatApiError(res, json)) as Error & { status?: number; body?: unknown };
  err.status = res.status;
  err.body = json;
  return err;
}

export async function patchTo<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return (json?.data ?? json) as T;
}

export async function delFrom(path: string): Promise<void> {
  const res = await fetch(`${baseURL()}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(formatApiError(res, json));
  }
}

// ── Auth-aware internal helpers ────────────────────

async function fetchAuth<T>(path: string): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return json.data as T;
}

async function postAuth<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return json.data as T;
}

async function putAuth<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(formatApiError(res, json));
  }
  const json = await res.json().catch(() => null);
  return (json?.data ?? json) as T;
}

async function delAuth(path: string): Promise<void> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
}

// ── Login (special response shape: { success, data: { token } }) ──

export async function loginUser(
  username: string,
  password: string,
): Promise<any> {
  const res = await fetch(`${baseURL()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseResponseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || formatApiError(res, data));
  }
  if (!data?.success) throw new Error(data?.error || "Login failed");
  return data.data;
}

// ── Existing named helpers ─────────────────────────

export const fetchSources = (sourceClass: "EBS" | "IBS" = "EBS") =>
  fetchFrom<Source[]>(`/api/v1/sources?source_class=${sourceClass}`);
export const fetchSource = (id: string) => fetchFrom<Source>(`/api/v1/sources/${id}`);
export const fetchSourceSummary = (sourceClass: "EBS" | "IBS" = "EBS") =>
  fetchFrom<SourceSummary>(`/api/v1/sources/summary?source_class=${sourceClass}`);
export const createSource = (data: Partial<Source>) =>
  postTo<Source>("/api/v1/sources", data);
export const updateSource = (id: string, data: Partial<Source>) =>
  putTo<Source>(`/api/v1/sources/${id}`, data);
export const deleteSource = (id: string) => delFrom(`/api/v1/sources/${id}`);

// ── Interoperability catalog (admin mutations) ───────────────

export const createInteroperabilityIntegration = (data: Partial<InteroperabilityIntegration>) =>
  postAuth<InteroperabilityIntegration>('/api/v1/interoperability-integrations', data);
export const updateInteroperabilityIntegration = (id: string, data: Partial<InteroperabilityIntegration>) =>
  putAuth<InteroperabilityIntegration>(`/api/v1/interoperability-integrations/${id}`, data);
export const deleteInteroperabilityIntegration = (id: string) =>
  delAuth(`/api/v1/interoperability-integrations/${id}`);
export const triggerCollect = (id: string) =>
  postTo<import("./run-now.mjs").RunNowResult>(`/api/v1/sources/${id}/collect`);
export type IbsObservation = {
  id?: string;
  source_id?: string;
  source_name?: string;
  disease: string;
  disease_name?: string;
  country: string;
  location: string;
  indicator: string;
  value: number;
  period_type: string;
  period_start: string | null;
  period_end: string | null;
  period_label: string;
  document_url?: string;
  observed_at?: string;
};
// A run queues one background shared-pipeline crawl job (crawl_job_id); a dry-run returns adapter observations.
export type IbsRunResult = {
  run_id: string;
  run_name: string;
  dry_run: boolean;
  adapter_type: string;
  document_url?: string | null;
  crawl_job_id?: string;
  records_found?: number;
  records_written?: number;
  warnings?: string[];
  observations?: IbsObservation[];
};
export const triggerIbsCollect = (id: string) =>
  postTo<IbsRunResult>(`/api/v1/sources/${id}/ibs-collect`);
export const triggerIbsDryRun = (id: string) =>
  postTo<IbsRunResult>(`/api/v1/sources/${id}/ibs-dry-run`);
export const triggerCollectAll = () => postTo("/api/v1/sources/collect-all");
export const stopCollectAll = () => postTo("/api/v1/sources/stop-all");
export const fetchRuns = (sourceId?: string, status?: string) => {
  const params = new URLSearchParams();
  if (sourceId) params.set("source_id", sourceId);
  if (status) params.set("status", status);
  const query = params.toString();
  return fetchFrom<Run[]>(`/api/v1/runs${query ? `?${query}` : ""}`);
};
export const fetchCrawlOps = () => fetchFrom<import("@/types").CrawlOps>("/api/v1/crawl-ops");
export const recomputeSourceCredibility = () =>
  postTo<{ updated: number; threshold: number; meaning: string }>("/api/v1/source-credibility/recompute", {});
export const fetchSummary = () => fetchFrom<SummaryRow[]>("/api/v1/summary");

// ── NLP Keywords ──────────────────────────────────

export const fetchNlpKeywords = (category: string) =>
  fetchFrom<any[]>(`/api/v1/nlp-keywords?category=${category}`);
export const createNlpKeyword = (data: any) =>
  postTo("/api/v1/nlp-keywords", data);
export const updateNlpKeyword = (id: string, data: any) =>
  putTo(`/api/v1/nlp-keywords/${id}`, data);
export const deleteNlpKeyword = (id: string) =>
  delFrom(`/api/v1/nlp-keywords/${id}`);

// ── NLP Labels ────────────────────────────────────

export const fetchNlpLabels = (category: string) =>
  fetchFrom<any[]>(`/api/v1/nlp-labels?category=${category}`);
export const createNlpLabel = (data: any) => postTo("/api/v1/nlp-labels", data);
export const updateNlpLabel = (id: string, data: any) =>
  putTo(`/api/v1/nlp-labels/${id}`, data);
export const deleteNlpLabel = (id: string) =>
  delFrom(`/api/v1/nlp-labels/${id}`);

// ── Outbreak Rules ────────────────────────────────

export const fetchOutbreakRules = () =>
  fetchFrom<any[]>("/api/v1/outbreak-rules");
export const createOutbreakRule = (data: any) =>
  postTo("/api/v1/outbreak-rules", data);
export const updateOutbreakRule = (id: string, data: any) =>
  postTo(`/api/v1/outbreak-rules/${id}/edit`, data);
export const deleteOutbreakRule = (id: string) =>
  delFrom(`/api/v1/outbreak-rules/${id}`);

// ── Users (auth) ──────────────────────────────────

export const fetchUsers = () => fetchAuth<any[]>("/api/v1/users");
export const createUser = (data: any) => postAuth("/api/v1/users", data);
export const updateUser = (id: string, data: any) => postAuth(`/api/v1/users/${id}/edit`, data);
export const deleteUser = (id: string) => delAuth(`/api/v1/users/${id}`);

// ── Roles & Levels (auth) ─────────────────────────

export interface RoleItem {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  is_system?: boolean;
  created_at?: string;
  user_count?: number;
}

export const fetchRoles = () => fetchAuth<RoleItem[]>("/api/v1/roles");
export const createRole = (data: Partial<RoleItem>) => postAuth("/api/v1/roles", data);
export const updateRole = (id: string, data: Partial<RoleItem>) => putAuth(`/api/v1/roles/${id}`, data);
export const deleteRole = (id: string) => delAuth(`/api/v1/roles/${id}`);

// ── Locations ────────────────────────────────────

export const fetchLocations = () => fetchFrom<any[]>("/api/v1/locations");
export const createLocation = (data: any) => postTo("/api/v1/locations", data);
export const updateLocation = (id: string, data: any) =>
  putTo(`/api/v1/locations/${id}`, data);
export const deleteLocation = (id: string) =>
  delFrom(`/api/v1/locations/${id}`);

// ── Master Countries & Regions ────────────────────

export interface MasterCountryAlias {
  id?: string;
  alias: string;
  language?: string | null;
}

export interface MasterCountry {
  id: string;
  name: string;
  iso2: string;
  iso3: string;
  flag_code?: string | null;
  display_order: number;
  is_active: boolean;
  home_region?: string | null;
  primary_language?: string | null;
  alias_count?: number;
  aliases?: MasterCountryAlias[];
  created_at?: string;
  updated_at?: string;
  regions?: Array<{ id: string; name: string; code: string }>;
}

export interface MasterRegion {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  is_active: boolean;
  member_count: number;
  countries: Array<{
    id: string;
    name: string;
    iso2: string;
    iso3: string;
    flag_code?: string | null;
  }>;
  created_at?: string;
  updated_at?: string;
}

export const fetchMasterCountries = (params?: {
  q?: string;
  region_id?: string;
  is_active?: boolean;
  /** PR 136: "active" (default on the backend), "inactive" or "all". */
  status?: "active" | "inactive" | "all";
  page?: number;
  per_page?: number;
}) => {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.region_id) query.set("region_id", params.region_id);
  if (params?.status) query.set("status", params.status);
  else if (typeof params?.is_active === "boolean") query.set("is_active", String(params.is_active));
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return fetchFrom<MasterCountry[]>(`/api/v1/master/countries${qs ? `?${qs}` : ""}`);
};

export const createMasterCountry = (data: Partial<MasterCountry>) =>
  postTo("/api/v1/master/countries", data);

export const updateMasterCountry = (id: string, data: Partial<MasterCountry>) =>
  putTo(`/api/v1/master/countries/${id}`, data);

export const deleteMasterCountry = (id: string) =>
  delFrom(`/api/v1/master/countries/${id}`);

export const fetchMasterCountryAliases = (countryId: string) =>
  fetchFrom<MasterCountryAlias[]>(`/api/v1/master/countries/${countryId}/aliases`);

export const saveMasterCountryAliases = (
  countryId: string,
  data: { aliases: { alias: string; language?: string }[] }
) => postTo<{ message: string; count: number }>(`/api/v1/master/countries/${countryId}/aliases`, data);

export const fetchMasterRegions = (params?: {
  q?: string;
  is_active?: boolean;
  page?: number;
  per_page?: number;
}) => {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (typeof params?.is_active === "boolean") query.set("is_active", String(params.is_active));
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return fetchFrom<MasterRegion[]>(`/api/v1/master/regions${qs ? `?${qs}` : ""}`);
};

export const createMasterRegion = (data: {
  name: string;
  code: string;
  description?: string;
  is_active?: boolean;
  country_ids?: string[];
}) => postTo("/api/v1/master/regions", data);

export const updateMasterRegion = (
  id: string,
  data: {
    name?: string;
    code?: string;
    description?: string;
    is_active?: boolean;
    country_ids?: string[];
  }
) => putTo(`/api/v1/master/regions/${id}`, data);

export const deleteMasterRegion = (id: string) =>
  delFrom(`/api/v1/master/regions/${id}`);

export interface CountryBorderNeighbor {
  id?: string | null;
  name: string;
  iso2?: string | null;
  iso3?: string | null;
  flag_code?: string | null;
  home_region?: string | null;
  in_catalog: boolean;
  cross_region: boolean;
}

export interface CountryBorderRow {
  id: string;
  name: string;
  iso2: string;
  iso3: string;
  flag_code?: string | null;
  home_region?: string | null;
  display_order: number;
  coverage: "bordered" | "no_land_border" | "unlisted";
  neighbors: CountryBorderNeighbor[];
}

export const fetchCountryBorders = (params?: { q?: string; region_id?: string }) => {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.region_id) query.set("region_id", params.region_id);
  const qs = query.toString();
  return fetchFrom<CountryBorderRow[]>(`/api/v1/master/borders${qs ? `?${qs}` : ""}`);
};

export interface RegionBorderPair {
  id: string;
  region_id: string;
  region_name: string;
  country_id: string;
  country_name: string;
  country_iso3: string;
  neighbor_country_id?: string | null;
  neighbor_country_name: string;
  neighbor_iso2?: string | null;
  neighbor_iso3?: string | null;
  neighbor_home_region?: string | null;
  neighbor_region_id?: string | null;
  neighbor_region_name: string;
  border_type: string;
  verified: boolean;
  notes?: string | null;
  cross_region: boolean;
}

export const fetchRegionBorders = (countryId: string) =>
  fetchFrom<RegionBorderPair[]>(`/api/v1/master/region-borders?country_id=${encodeURIComponent(countryId)}`);

export const saveCountryBorders = (
  countryId: string,
  data: { neighbor_ids: string[]; external_names: string[]; no_land_border: boolean }
) => putTo(`/api/v1/master/borders/${countryId}`, data);

// ── Disease Master (local database catalog) ───────

export interface DiseaseConcept {
  id: string;
  disease_id?: string | null;
  canonical_name: string;
  category?: string | null;
  is_zoonotic?: boolean;
  description?: string | null;
  is_public?: boolean;
  allow_engine?: boolean;
  source: string;
  confidence: number;
  is_active: boolean;
  alias_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DiseaseAlias {
  id: string;
  concept_id: string;
  alias: string;
  normalized_alias?: string | null;
  language?: string | null;
  country_code?: string | null;
  confidence?: number;
  is_active?: boolean;
  created_at?: string | null;
}

export const fetchDiseaseConcepts = (params?: { q?: string; is_active?: boolean; page?: number; per_page?: number }) => {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (typeof params?.is_active === 'boolean') query.set("is_active", String(params.is_active));
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return fetchFrom<DiseaseConcept[]>(`/api/v1/disease-concepts${qs ? `?${qs}` : ""}`);
};

export const createDiseaseConcept = (data: Partial<DiseaseConcept>) =>
  postTo<DiseaseConcept>('/api/v1/disease-concepts', data);
export const updateDiseaseConcept = (id: string, data: Partial<DiseaseConcept>) =>
  putTo<DiseaseConcept>(`/api/v1/disease-concepts/${id}`, data);
export const deleteDiseaseConcept = (id: string) =>
  delFrom(`/api/v1/disease-concepts/${id}`);

export const fetchDiseaseAliases = (conceptId: string) =>
  fetchFrom<DiseaseAlias[]>(`/api/v1/disease-concepts/${conceptId}/aliases`);

export const saveDiseaseAliases = (
  conceptId: string,
  data: { aliases: { country_code?: string; alias: string; language?: string }[] }
) => postTo<{ message: string }>(`/api/v1/disease-concepts/${conceptId}/aliases`, data);

// ── Manual Crawler ───────────────────────────────

export type CrawlJobRequest = {
  disease_concept_ids: string[];
  source_mode: 'data' | 'ibs';
  data_source_ids: string[];
  ibs_source_ids: string[];
  region?: string | null;
  country?: string | null;
  province_city?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  max_articles?: number;
};

export const createCrawlJob = (data: CrawlJobRequest) =>
  postTo<{ job_id: string; status: string }>('/api/v1/manual-crawler/jobs', data);
export const fetchCrawlJob = (id: string) =>
  fetchFrom<CrawlJobStatus>(`/api/v1/manual-crawler/jobs/${encodeURIComponent(id)}`);
export const reprocessCrawlJob = (id: string) =>
  postTo<{ job_id: string; status: string }>(`/api/v1/manual-crawler/jobs/${encodeURIComponent(id)}/reprocess`);

export type CrawlHistoryFilters = {
  page?: number;
  per_page?: number;
  q?: string;
  channel?: string;
  country?: string;
  disease?: string;
  date_from?: string;
  date_to?: string;
  date_field?: string;
  status?: string;
  needs_review?: boolean;
  has_geo?: boolean;
  job_id?: string;
  quality?: string;
  /** PR 157: published | unpublished. */
  publish?: string;
};

function crawlHistoryParams(filters: CrawlHistoryFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.per_page) params.set('per_page', String(filters.per_page));
  if (filters.q) params.set('q', filters.q);
  if (filters.channel && filters.channel !== 'all') params.set('channel', filters.channel);
  if (filters.country && filters.country !== 'all') params.set('country', filters.country);
  if (filters.disease) params.set('disease', filters.disease);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.date_field) params.set('date_field', filters.date_field);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (typeof filters.needs_review === 'boolean') params.set('needs_review', String(filters.needs_review));
  if (typeof filters.has_geo === 'boolean') params.set('has_geo', String(filters.has_geo));
  if (filters.job_id) params.set('job_id', filters.job_id);
  if (filters.quality) params.set('quality', filters.quality);
  // PR 157: published | unpublished (an older backend ignores it).
  if (filters.publish) params.set('publish', filters.publish);
  return params;
}

export const fetchCrawlHistorySummary = () =>
  fetchFrom<CrawlHistorySummary>('/api/v1/crawl-history/summary');

export const fetchCrawlHistoryCountries = () =>
  fetchFrom<string[]>('/api/v1/crawl-history/countries');

let rowsController: AbortController | null = null;

/** A newer rows request cancels the one still in flight, so filter changes never pile up on the server. */
export const fetchCrawlHistoryRows = (filters: CrawlHistoryFilters = {}) => {
  const query = crawlHistoryParams(filters).toString();
  rowsController?.abort();
  rowsController = new AbortController();
  return fetchPaginated<CrawlHistoryRow>(`/api/v1/crawl-history/rows${query ? `?${query}` : ''}`, {
    signal: rowsController.signal,
  });
};

export function cancelCrawlHistoryRows() {
  rowsController?.abort();
  rowsController = null;
}

/** Children of a page of article rows, keyed by row id, in one request. */
export const fetchCrawlHistoryChildren = (rowIds: string[], init?: RequestInit) =>
  fetchFrom<{ children: Record<string, CrawlHistoryRow[]> }>(
    `/api/v1/crawl-history/children?ids=${rowIds.map(encodeURIComponent).join(',')}`,
    init,
  );

export const fetchCrawlHistoryRow = (id: string, channel?: string) => {
  const params = new URLSearchParams();
  if (channel && channel !== 'all') params.set('channel', channel);
  const query = params.toString();
  return fetchFrom<CrawlHistoryRow>(
    `/api/v1/crawl-history/rows/${encodeURIComponent(id)}${query ? `?${query}` : ''}`,
  );
};

export type RelatedArticle = {
  event_id: string;
  raw_report_id?: string | null;
  title?: string | null;
  url?: string | null;
  domain?: string | null;
  source_name?: string | null;
  source_type?: string | null;
  source_credibility?: number | null;
  source_credibility_label?: string | null;
  published_at?: string | null;
  date_case?: string | null;
  country?: string | null;
  place?: string | null;
  cases: number;
  deaths: number;
  same_place: boolean;
  is_anchor: boolean;
  is_reference: boolean;
  needs_review?: boolean | null;
  cases_diff?: number | null;
  deaths_diff?: number | null;
};

export type RelatedArticles = {
  anchor?: { event_id: string; disease?: string | null; country?: string | null; place?: string | null; date_case?: string | null } | null;
  window_days: number;
  related_count: number;
  domain_count: number;
  reference?: RelatedArticle | null;
  figures_differ: boolean;
  articles: RelatedArticle[];
};

// Crawl History is an internal view: ask for unpublished articles too. The
// backend honours it only for Admin/Analyst (events.publish).
export const fetchRelatedCounts = (eventIds: string[], init?: RequestInit) =>
  fetchFrom<{ window_days: number; counts: Record<string, number> }>(
    `/api/v1/events/related-counts?ids=${eventIds.map(encodeURIComponent).join(',')}&include_unpublished=true`,
    init,
  );

export const fetchRelatedArticles = (eventId: string, includeUnpublished = false) =>
  fetchFrom<RelatedArticles>(
    `/api/v1/events/${encodeURIComponent(eventId)}/related${includeUnpublished ? '?include_unpublished=true' : ''}`,
  );

// ─── PR 78: publish / unpublish, Activity Log ───────────────────────────────
export type PublishStatus = 'published' | 'unpublished';

export interface PublishResult {
  status: PublishStatus;
  matched: number;
  changed: number;
  unchanged: number;
  changed_event_ids: string[];
  raw_report_ids: string[];
  ibs_matched?: number;
  changed_ibs_observation_ids?: string[];
}

/** Publish/unpublish whole articles (default) or single events. */
export async function publishEvents(payload: {
  status: PublishStatus;
  eventIds?: string[];
  rawReportIds?: string[];
  /** PR 80: IBS observation rows. */
  ibsObservationIds?: string[];
  reason?: string;
  scope?: 'article' | 'event';
}): Promise<PublishResult> {
  const res = await fetch(`${baseURL()}/api/v1/events/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      status: payload.status,
      event_ids: payload.eventIds || [],
      raw_report_ids: payload.rawReportIds || [],
      ibs_observation_ids: payload.ibsObservationIds || [],
      reason: payload.reason || null,
      scope: payload.scope || 'article',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Publish failed (HTTP ${res.status})`);
  }
  return (json?.data ?? json) as PublishResult;
}

export interface ActivityLogRow {
  id: string;
  user_id?: string | null;
  username?: string | null;
  action: string;
  raw_report_id?: string | null;
  event_id?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
  created_at?: string | null;
  title?: string | null;
  url?: string | null;
}

export interface ActivitySummaryRow {
  username: string;
  user_id?: string | null;
  reviews: number;
  publishes: number;
  unpublishes: number;
  edits: number;
  total: number;
  last_action_at?: string | null;
}

export interface ActivityFilters {
  user?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
  page?: number;
  per_page?: number;
}

function activityQuery(filters: ActivityFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchActivityLog(filters: ActivityFilters = {}) {
  const res = await fetch(`${baseURL()}/api/v1/activity-log${activityQuery(filters)}`, {
    cache: 'no-store',
    headers: { ...authHeaders() },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(json?.error || `Activity Log failed (HTTP ${res.status})`);
  return {
    rows: (json?.data || []) as ActivityLogRow[],
    total: Number(json?.total || 0),
    page: Number(json?.page || 1),
    totalPages: Number(json?.total_pages || 1),
  };
}

export async function fetchActivitySummary(filters: ActivityFilters = {}) {
  const { page: _page, per_page: _perPage, ...rest } = filters;
  const res = await fetch(`${baseURL()}/api/v1/activity-log/summary${activityQuery(rest)}`, {
    cache: 'no-store',
    headers: { ...authHeaders() },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(json?.error || `Activity summary failed (HTTP ${res.status})`);
  return (json?.data || []) as ActivitySummaryRow[];
}

export const deleteCrawlHistoryRow = (id: string) =>
  delAuth(`/api/v1/crawl-history/rows/${encodeURIComponent(id)}`);

export const fetchCrawlHistoryJobs = (filters: CrawlHistoryFilters = {}) => {
  const query = crawlHistoryParams(filters).toString();
  return fetchPaginated<CrawlHistoryJob>(`/api/v1/crawl-history/jobs${query ? `?${query}` : ''}`);
};

export const fetchCrawlHistoryJob = (id: string) =>
  fetchFrom<CrawlHistoryJob>(`/api/v1/crawl-history/jobs/${encodeURIComponent(id)}`);

// PR 99: a hung export (proxy/backend) must end in an error, not silence.
const EXPORT_TIMEOUT_MS = 120_000;

export async function downloadCrawlHistoryExport(
  filters: CrawlHistoryFilters,
  format: 'csv' | 'xlsx',
): Promise<number> {
  const params = crawlHistoryParams({ ...filters, page: undefined, per_page: 5000 });
  params.set('format', format);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
  let res: Response;
  let blob: Blob;
  try {
    res = await fetchLedger(`/api/v1/crawl-history/rows?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      const json = await parseResponseJson(res);
      throw new Error(formatApiError(res, json));
    }
    blob = await res.blob();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Export timed out after ${EXPORT_TIMEOUT_MS / 1000}s; narrow the filters and retry`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
  const problem = exportResponseProblem(res.headers.get('Content-Type'), blob.size, format);
  if (problem) throw new Error(problem);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = exportFilename(
    res.headers.get('Content-Disposition'),
    format === 'csv' ? 'crawl-history.csv' : 'crawl-history.xls',
  );
  // Firefox ignores a click on a detached anchor; revoke late so a large blob
  // is fully read before the URL dies.
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
  return blob.size;
}

// ── Source Credibility ──────────────────────────

export const fetchCredibility = () =>
  fetchFrom<any[]>("/api/v1/source-credibility");
export const createCredibility = (data: any) =>
  postTo("/api/v1/source-credibility", data);
export const updateCredibility = (id: string, data: any) =>
  putTo(`/api/v1/source-credibility/${id}`, data);
export const deleteCredibility = (id: string) =>
  delFrom(`/api/v1/source-credibility/${id}`);


// ── Crawling Stats ─────────────────────────────────────
export interface MonthlyPerformanceItem {
  month_num: number;
  month_label: string;
  sub_label: string;
  news_count: number;
  social_count: number;
  ibs_count: number;
  total_count: number;
}

// PR 101: every raw_reports row falls in exactly one bucket; buckets sum to total.
export interface StatusBreakdown {
  processed_health: number;
  non_health: number;
  waiting: number;
  in_progress: number;
  stuck: number;
  failed: number;
  duplicate: number;
  archived: number;
  other: number;
  stuck_after_minutes: number;
}

export interface CrawlingStatsLive {
  total: number;
  status_breakdown: StatusBreakdown;
  throughput_per_minute: number;
  throughput_window_minutes: number;
  poll_seconds: number;
  server_time: string;
}

// PR 146: activity counters for the live pipeline card (windows and thresholds from system_settings.dashboard_live).
export interface ActivityHour {
  hour: string;
  added: number;
  processed: number;
  health: number;
}

export interface ActivityQueue {
  name: string;
  ok: boolean;
  ready?: number;
  consumers?: number;
  error?: string;
}

export interface CrawlingStatsActivity {
  short_window_minutes: number;
  long_window_hours: number;
  added_short: number;
  added_long: number;
  processed_short: number;
  processed_long: number;
  health_short: number;
  health_long: number;
  throughput_per_hour_short: number;
  throughput_per_hour_long: number;
  last_added_at: string | null;
  last_batch_size: number;
  batch_gap_minutes: number;
  last_processed_at: string | null;
  minutes_since_last_processed: number | null;
  minutes_since_last_added: number | null;
  oldest_waiting_at: string | null;
  oldest_waiting_minutes: number | null;
  last_run: { status: string | null; started_at: string | null; finished_at: string | null; records_found: number | null };
  hourly: ActivityHour[];
  delta_window_hours: number;
  added_delta_window: number;
  processed_delta_window: number;
  health_delta_window: number;
  deltas: {
    mode: "snapshot" | "timestamps";
    base_at: string | null;
    window_hours: number;
    partial: boolean;
    values: Partial<Record<keyof StatusBreakdown | "total", number>>;
  } | null;
  stall: { active: boolean; threshold_minutes: number; waiting: number };
  no_new_data: { active: boolean; threshold_minutes: number };
  queues: ActivityQueue[];
  queue_alerts: string[];
  display_time_zone: string | null;
  display_time_zone_label: string | null;
  poll_seconds: number;
}

export interface CrawlingStats {
  total: number;
  this_month: number;
  last_month: number;
  total_processed: number;
  health_stored_in_db?: number;
  non_health_stored_in_db?: number;
  stored_in_db?: number;
  nlp_processing?: number;
  status_breakdown?: StatusBreakdown;
  backlog_count?: number;
  backlog_warning_threshold?: number;
  backlog_warning?: boolean;
  total_news?: number;
  total_social?: number;
  total_ibs?: number;
  monthly_performance?: MonthlyPerformanceItem[];
  current_month: string;
  previous_month: string;
  live_crawled: number;
  current_live_crawl?: number;
  total_crawled_all_time?: number;
  active_run_count: number;
  active_since: string | null;
  collector_status: "RUNNING" | "IDLE" | string;
  last_report_at: string | null;
  last_run_at?: string | null;
  enabled_sources?: number;
  crawler_mode?: string;
  by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
}

export type IbsSurveillanceKpi = {
  diseases_detected: number;
  countries_monitored: number;
  sources_count: number;
  total_observations: number;
  total_cases: number;
  total_deaths: number;
};

export type IbsDiseaseSummary = {
  disease: string;
  countries_count: number;
  observations_count: number;
  total_cases: number;
  total_deaths: number;
};

export type IbsCountrySummary = {
  country: string;
  diseases_count: number;
  observations_count: number;
  total_cases: number;
  total_deaths: number;
};

export type IbsDashboard = {
  catalog: { total: number; enabled: number; paused: number; never_run: number };
  runs: { success: number; failed: number; running: number; window_days: number };
  pages_found: number;
  facts_written: number;
  by_day: { date: string; pages_found: number; facts_written: number; failed_runs: number }[];
  by_source: {
    source_id: string;
    name: string;
    disease_scope: string;
    pages_found: number;
    facts_written: number;
    last_status: string | null;
    last_job_id: string | null;
    headline?: IbsFact;
  }[];
  by_status: { status: string; sources: number }[];
  by_disease: IbsFact[];
  recent_runs: {
    run_id: string;
    started_at: string;
    source_name: string;
    disease_scope: string;
    status: string;
    pages_found: number;
    facts_written: number;
    crawl_job_id: string | null;
    error: string | null;
  }[];
  surveillance_kpi?: IbsSurveillanceKpi;
  disease_summary?: IbsDiseaseSummary[];
  country_summary?: IbsCountrySummary[];
  recent_observations?: IbsObservation[];
};

export type IbsFact = {
  source_id: string;
  disease: string;
  cases: number;
  deaths: number;
  period_type: string;
  place: string;
  location_name: string;
  is_headline: boolean;
};

export const fetchIbsDashboard = (params?: { days?: number; sourceId?: string }) => {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.sourceId) query.set("source_id", params.sourceId);
  const suffix = query.toString();
  return fetchFrom<IbsDashboard>(`/api/v1/ibs/dashboard${suffix ? `?${suffix}` : ""}`);
};

export const fetchCrawlingStats = (filters?: { country?: string; year?: number }) => {
  const params = new URLSearchParams();
  if (filters?.country && filters.country !== "all" && filters.country !== "ASEAN") {
    params.set("country", filters.country);
  }
  if (filters?.year) {
    params.set("year", String(filters.year));
  }
  const query = params.toString();
  return fetchFrom<CrawlingStats>(`/api/v1/crawling-stats${query ? `?${query}` : ""}`);
};

export const fetchCrawlingStatsLive = () =>
  fetchFrom<CrawlingStatsLive>("/api/v1/crawling-stats/live", { cache: "no-store" });
export const fetchCrawlingStatsActivity = () =>
  fetchFrom<CrawlingStatsActivity>("/api/v1/crawling-stats/activity", { cache: "no-store" });

export const fetchCrawlingPerformance = (filters?: { country?: string; year?: number }) => {
  const params = new URLSearchParams();
  if (filters?.country && filters.country !== "all" && filters.country !== "ASEAN") {
    params.set("country", filters.country);
  }
  if (filters?.year) {
    params.set("year", String(filters.year));
  }
  const query = params.toString();
  return fetchFrom<{
    total_news: number;
    total_social: number;
    total_ibs: number;
    total_crawled: number;
    monthly_performance: MonthlyPerformanceItem[];
  }>(`/api/v1/crawling-performance${query ? `?${query}` : ""}`);
};

// ── Events ────────────────────────────────────────

export const fetchEvents = (params?: {
  page?: number;
  per_page?: number;
  q?: string;
  disease?: string;
  source_type?: string;
  outbreak_alert?: boolean;
  date_from?: string;
  date_to?: string;
  is_health_related?: boolean;
}) => {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  if (params?.q) query.set("q", params.q);
  if (params?.disease) query.set("disease", params.disease);
  if (params?.source_type) query.set("source_type", params.source_type);
  if (params?.outbreak_alert !== undefined) query.set("outbreak_alert", String(params.outbreak_alert));
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  if (params?.is_health_related !== undefined) query.set("is_health_related", String(params.is_health_related));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchFrom<DiseaseEvent[]>(`/api/v1/events${suffix}`);
};

// ── Language Markers ──────────────────────────

export const fetchLanguageMarkers = () =>
  fetchFrom<any[]>("/api/v1/language-markers");
export const createLanguageMarker = (data: any) =>
  postTo("/api/v1/language-markers", data);
export const updateLanguageMarker = (id: string, data: any) =>
  putTo(`/api/v1/language-markers/${id}`, data);
export const deleteLanguageMarker = (id: string) =>
  delFrom(`/api/v1/language-markers/${id}`);

// ── Extraction Rules ──────────────────────────

export const fetchExtractionRules = () =>
  fetchFrom<any[]>("/api/v1/extraction-rules");
export const createExtractionRule = (data: any) =>
  postTo("/api/v1/extraction-rules", data);
export const updateExtractionRule = (id: string, data: any) =>
  putTo(`/api/v1/extraction-rules/${id}`, data);
export const deleteExtractionRule = (id: string) =>
  delFrom(`/api/v1/extraction-rules/${id}`);

// ── Language Models ─────────────────────────────

export const fetchLanguageModels = () =>
  fetchFrom<any[]>("/api/v1/language-models");
export const createLanguageModel = (data: any) =>
  postTo("/api/v1/language-models", data);
export const updateLanguageModel = (id: string, data: any) =>
  putTo(`/api/v1/language-models/${id}`, data);
export const deleteLanguageModel = (id: string) =>
  delFrom(`/api/v1/language-models/${id}`);

// ── Dashboard Stats ─────────────────────────────

export const fetchDashboardStats = () =>
  fetchFrom<DashboardStats>("/api/v1/events/stats");
export interface PublicDashboardApiParams {
  country?: string;
  scope?: string;
  year?: number;
  source?: "ibs" | "ebs" | "skdr" | string;
  disease?: string;
  start_year?: number;
  start_week?: number;
  end_year?: number;
  end_week?: number;
}

/** ASEAN week-1→current-epi-week window shared by dashboard, TV, and reports. */
export function withDefaultDashboardParams(
  filters?: PublicDashboardApiParams,
): PublicDashboardApiParams {
  const epi = getCurrentEpiWeek();
  const country = !filters?.country || filters.country === "all" ? "ASEAN" : filters.country;
  const scope =
    filters?.scope ||
    (isAseanDefaultScope(country) ? ASEAN11_SCOPE : country === "global" ? "global" : undefined);
  return {
    country,
    scope,
    disease: filters?.disease && filters.disease !== "" ? filters.disease : "all",
    start_year: filters?.start_year ?? epi.year,
    start_week: filters?.start_week ?? 1,
    end_year: filters?.end_year ?? epi.year,
    end_week: filters?.end_week ?? epi.week,
    year: filters?.year ?? filters?.end_year ?? epi.year,
    source: filters?.source,
  };
}

function applyDashboardParams(filters?: PublicDashboardApiParams) {
  const merged = withDefaultDashboardParams(filters);
  const params = new URLSearchParams();
  params.set("country", merged.country || "ASEAN");
  if (merged.scope) params.set("scope", merged.scope);
  if (merged.year) params.set("year", String(merged.year));
  if (merged.source && merged.source !== "all") params.set("source", merged.source);
  if (merged.disease && merged.disease !== "all") params.set("disease", merged.disease);
  if (merged.start_year) params.set("start_year", String(merged.start_year));
  params.set("start_week", String(merged.start_week ?? 1));
  if (merged.end_year) params.set("end_year", String(merged.end_year));
  if (merged.end_week) params.set("end_week", String(merged.end_week));
  return params;
}

export const fetchPublicDashboard = (filters?: PublicDashboardApiParams) => {
  const query = applyDashboardParams(filters).toString();
  return fetchFrom<PublicDashboard>(`/api/v1/public-dashboard?${query}`);
};

// Indicator-Based Surveillance pillar: reads ONLY ibs_observations (never
// disease_events/NLP), so IBS data is never mixed with EBS. Published-only
// (unpublished IBS source rows are never served publicly).
export const fetchIbsSurveillance = (filters?: PublicDashboardApiParams) => {
  const query = applyDashboardParams(filters).toString();
  return fetchFrom<PublicDashboard>(`/api/v1/ibs/surveillance?${query}`);
};

export const fetchKpiSnapshot = (filters?: PublicDashboardApiParams) => {
  const query = applyDashboardParams(filters).toString();
  return fetchFrom<{
    kpis: PublicDashboard["kpis"];
    snapshot?: {
      id?: string;
      computed_at?: string;
      filter_key?: string;
      stale?: boolean;
    };
  }>(`/api/v1/kpi-snapshot?${query}`);
};

export interface KpiEventRow {
  id: string;
  location_name: string;
  country: string;
  disease_classification: string;
  case_count: number;
  death_count: number;
  confidence: number;
  outbreak_alert: boolean;
  needs_review: boolean;
  source_name: string;
  source_type: string;
  url: string;
  published_at: string;
}

export const fetchKpiEvents = (
  filters?: PublicDashboardApiParams & { page?: number; per_page?: number },
) => {
  const params = applyDashboardParams(filters);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.per_page) params.set("per_page", String(filters.per_page));
  return fetchPaginated<KpiEventRow>(`/api/v1/kpi-events?${params.toString()}`);
};

export type RegionHazardEvent = {
  id?: string | number | null;
  source?: string | null;
  kind?: string | null;
  title?: string | null;
  latitude: number;
  longitude: number;
  magnitude?: number | null;
  alert_level?: string | null;
  when?: string | number | null;
  url?: string | null;
};

export type RegionContext = {
  country: string;
  display_name: string;
  iso2: string;
  iso3: string;
  capital: { name: string; latitude: number; longitude: number };
  timezone: string;
  updated_at?: string;
  weather?: {
    status?: string;
    source?: string;
    attribution?: string;
    error?: string;
    precip_today_mm?: number | null;
    current?: {
      temperature_c?: number | null;
      relative_humidity_pct?: number | null;
      precipitation_mm?: number | null;
      weather_code?: number | null;
      wind_speed_kmh?: number | null;
      observed_at?: string | null;
    };
  };
  air_quality?: {
    status?: string;
    source?: string;
    attribution?: string;
    error?: string;
    current?: {
      european_aqi?: number | null;
      us_aqi?: number | null;
      aqi_label?: string | null;
      pm2_5?: number | null;
      pm10?: number | null;
      so2?: number | null;
    };
  };
  climate?: {
    status?: string;
    source?: string;
    attribution?: string;
    error?: string;
    averages?: { t2m_c?: number | null; rh2m_pct?: number | null; precip_mm?: number | null };
  };
  usgs?: { status?: string; source?: string; error?: string; events?: RegionHazardEvent[] };
  gdacs?: { status?: string; source?: string; error?: string; events?: RegionHazardEvent[] };
  hazards?: RegionHazardEvent[];
  layers?: { inarisk?: Array<{ key: string; label: string; provider: string; url: string }>; note?: string };
  sources?: Array<{ name: string; provider: string; status: string; source_url?: string }>;
};

export const fetchRegionContext = (country: string) =>
  fetchFrom<RegionContext>(`/api/v1/region-context?country=${encodeURIComponent(country)}`);

export const fetchPipelineHealth = () => fetchFrom<{
  status: string;
  nlp?: { status?: string; service?: string; model?: string };
  last_event_at?: string | null;
  last_collector_run?: Record<string, unknown> | null;
  collector_runs_24h?: number;
  collector_failures_24h?: number;
}>("/api/v1/pipeline-health");

export const fetchIbsSummary = async (_filters?: { year?: number; province?: string }) => {
  throw new Error("SKDR IBS is detached");
};

export const fetchEbsSummary = async (_filters?: { year?: number; province?: string }) => {
  throw new Error("SKDR EBS is detached");
};

// ── URL Analyze ──────────────────────────────────

export const analyzeUrl = async (url: string, options?: {
  forceRefresh?: boolean;
  onProgress?: (job: { status?: string; stage?: string; job_id?: string }) => void;
  signal?: AbortSignal;
}) => {
  const { waitForAnalysis } = await import("./analysis-job.mjs");
  // Interactive URL analysis must use the dedicated async worker. The old
  // synchronous/force-refresh flags made the browser wait for crawling and
  // NLP in the API request, which caused 504s and defeated URL caching.
  const res = await fetch(`${baseURL()}/api/v1/analyze-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      url,
      async: true,
      force_refresh: Boolean(options?.forceRefresh),
    }),
    signal: options?.signal ?? AbortSignal.timeout(45000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));
  const initial = (json?.data ?? json) as any;
  return waitForAnalysis(initial, async (id: string) => {
    const res = await fetch(baseURL() + "/api/v1/analysis-jobs/" + encodeURIComponent(id),
      { cache: "no-store", headers: authHeaders(), signal: AbortSignal.timeout(45000) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(formatApiError(res, json));
    return json.data;
  }, {
    timeout: 600000,
    onProgress: options?.onProgress,
    signal: options?.signal,
  } as {
    timeout?: number;
    onProgress?: (job: { status?: string; stage?: string; job_id?: string }) => void;
    signal?: AbortSignal;
  });
};


export interface AnalysisJobItem {
  job_id: string;
  url: string;
  normalized_url?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial' | string;
  stage?: string;
  result?: any;
  warnings?: string[] | null;
  error?: string | null;
  submitted_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export const submitAnalysisJob = async (
  url: string,
  options?: { forceRefresh?: boolean; submittedBy?: string; signal?: AbortSignal }
): Promise<{ job_id: string; status: string; cached?: boolean }> => {
  const res = await fetch(`${baseURL()}/api/v1/analyze-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      url,
      async: true,
      force_refresh: Boolean(options?.forceRefresh),
      submitted_by: options?.submittedBy,
    }),
    signal: options?.signal ?? AbortSignal.timeout(45000),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  const data = (json?.data ?? json) as any;
  return {
    job_id: String(data.job_id || data.id),
    status: data.status,
    cached: Boolean(data.cached),
  };
};

export const fetchAnalysisJobs = async (params?: {
  limit?: number;
  offset?: number;
  q?: string;
  status?: string;
}): Promise<{ data: AnalysisJobItem[]; total: number; limit: number; offset: number }> => {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);

  const query = sp.toString() ? `?${sp.toString()}` : "";
  const res = await fetch(`${baseURL()}/api/v1/analysis-jobs${query}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return {
    data: (json?.data ?? []) as AnalysisJobItem[],
    total: Number(json?.total) || 0,
    limit: Number(json?.limit) || 50,
    offset: Number(json?.offset) || 0,
  };
};

export const fetchAnalysisJob = async (id: string): Promise<any> => {
  const res = await fetch(`${baseURL()}/api/v1/analysis-jobs/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: authHeaders(),
    signal: AbortSignal.timeout(45000),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return json?.data ?? json;
};

export const deleteAnalysisJob = async (id: string): Promise<void> => {
  const res = await fetch(`${baseURL()}/api/v1/analysis-jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
};

// ── Pagination helper ────────────────────────────

export async function fetchPaginated<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T[]; total: number; totalPages: number }> {
  const ledger = isLedgerPath(path);
  const res = ledger
    ? await fetchLedger(path, init)
    : await fetch(`${baseURL()}${path}`, { cache: "no-store", ...init, headers: authHeaders() });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return {
    data: (json?.data ?? []) as T[],
    total: (json?.total as number) || 0,
    totalPages: (json?.total_pages as number) || 1,
  };
}

// ── Spatial Heatmap ──────────────────────────────

export interface HeatmapMonthData {
  month_num: number;
  month_name: string;
  cases: number;
  deaths: number;
  events: number;
  alerts: number;
}

export interface HeatmapDiseaseData {
  disease: string;
  cases: number;
  deaths: number;
  events: number;
  alerts: number;
  latest_published?: string;
  latest_published_label?: string;
}

export interface HeatmapCountryData {
  country: string;
  iso: string;
  total_cases: number;
  total_deaths: number;
  total_events: number;
  months: HeatmapMonthData[];
  diseases?: HeatmapDiseaseData[];
}

export interface SpatialHeatmapResponse {
  year: number;
  countries: HeatmapCountryData[];
  summary: {
    total_countries: number;
    total_cases: number;
    total_deaths: number;
    total_events: number;
    snapshot_id?: string;
    snapshot_computed_at?: string;
    snapshot_filter_key?: string;
    snapshot_stale?: boolean;
    kpi_source?: string;
  };
}

export const fetchSpatialHeatmap = (filters?: PublicDashboardApiParams) => {
  const query = applyDashboardParams(filters).toString();
  return fetchFrom<SpatialHeatmapResponse>(`/api/v1/spatial-heatmap?${query}`);
};

// ?? Disease Trend Overview ????????????????????????

export interface DiseaseCountryBreakdown {
  country: string;
  iso: string;
  cases: number;
  deaths: number;
  events: number;
  alerts: number;
}

export interface PriorityDiseaseAlert {
  disease: string;
  top_country: string;
  top_country_iso: string;
  top_country_cases: number;
  total_asean_cases: number;
  total_deaths: number;
  event_count: number;
  alert_count: number;
  latest_published: string;
  latest_published_label: string;
  severity: "TINGGI" | "SEDANG" | "RENDAH";
  country_breakdown: DiseaseCountryBreakdown[];
}

export interface TrendSeries {
  key: string;
  disease: string;
}

export interface DiseaseDailyTrend {
  date: string;
  date_label: string;
  [seriesKey: string]: string | number;
}

export interface DiseaseTrendOverviewData {
  summary: {
    total_diseases: number;
    top_burden_disease: string;
    top_burden_country: string;
    total_cases_tracked: number;
    total_deaths?: number;
    total_events?: number;
    trend_days: number;
    snapshot_id?: string;
    snapshot_computed_at?: string;
    snapshot_filter_key?: string;
    snapshot_stale?: boolean;
    kpi_source?: string;
  };
  priority_alerts: PriorityDiseaseAlert[];
  trend_series: TrendSeries[];
  daily_trends: DiseaseDailyTrend[];
}

export const fetchDiseaseTrendOverview = (filters?: PublicDashboardApiParams & { days?: number }) => {
  const params = applyDashboardParams(filters);
  if (filters?.days) params.set('days', String(filters.days));
  return fetchFrom<DiseaseTrendOverviewData>(`/api/v1/disease-trend-overview?${params.toString()}`);
};

// ?? Morbidity & Mortality ?????????????????????????

export interface WeeklyMorbidityMortality {
  year: number;
  month?: number;
  month_label?: string;
  week: number;
  week_label: string;
  morbidity: number;
  mortality: number;
  cfr_pct: number;
  news_coverage?: number;
  event_count?: number;
}

export interface DiseaseMorbidityMortality {
  disease: string;
  total_cases: number;
  total_deaths: number;
  cfr_pct: number;
  event_count: number;
}

export interface MorbidityMortalityResponse {
  summary: {
    total_morbidity: number;
    total_mortality: number;
    cfr_pct: number;
    total_news_coverage?: number;
    total_events?: number;
    selected_disease: string;
    weeks: number;
    snapshot_id?: string;
    snapshot_computed_at?: string;
    snapshot_filter_key?: string;
    snapshot_stale?: boolean;
    kpi_source?: string;
  };
  weekly_trends: WeeklyMorbidityMortality[];
  top_diseases: DiseaseMorbidityMortality[];
}

export const fetchMorbidityMortality = (params?: PublicDashboardApiParams & { weeks?: number }) => {
  const q = applyDashboardParams(params);
  if (params?.weeks) q.set('weeks', String(params.weeks));
  return fetchFrom<MorbidityMortalityResponse>(`/api/v1/morbidity-mortality?${q.toString()}`);
};
// ── External Map Layers API ───────────────────────────────────────────
// Cached + queued. Pass AbortSignal so toggling a layer OFF cancels in-flight work.

type LayerInit = RequestInit & { cacheKey?: string };

async function fetchCachedLayer<T>(
  path: string,
  cacheKey: string,
  ttlMs: number,
  init?: LayerInit,
): Promise<T> {
  const { cacheKey: overrideKey, signal, ...rest } = init || {};
  const { data } = await fetchMapLayer<T>({
    cacheKey: overrideKey || cacheKey,
    ttlMs,
    signal,
    request: (nextSignal) => fetchFrom<T>(path, { ...rest, signal: nextSignal }),
  });
  return data;
}

export const fetchVectorSightings = (init?: LayerInit) =>
  fetchCachedLayer<VectorSightingsResponse>(
    "/api/v1/map-layers/vectors",
    "vectors",
    LAYER_TTL_MS.vectors,
    init,
  );

export const fetchLiveFlights = (init?: LayerInit) =>
  fetchCachedLayer<LiveFlightsResponse>(
    "/api/v1/map-layers/flights",
    "flights",
    LAYER_TTL_MS.flights,
    init,
  );

export const fetchFireHotspots = (init?: LayerInit) =>
  fetchCachedLayer<FireHotspotsResponse>(
    "/api/v1/map-layers/fires",
    "fires",
    LAYER_TTL_MS.fires,
    init,
  );

/** PR 110: GBIF occurrences via the backend (basePath + auth header + shared cache). */
export type WildlifeOccurrencesResponse = {
  status: string;
  source: string;
  total: number;
  results: any[];
  error?: string;
  cached?: boolean;
  stale?: boolean;
};

export const fetchWildlifeOccurrences = (
  params: { preset?: "map" | "modal"; country?: string } = {},
  init?: LayerInit,
) => {
  const q = new URLSearchParams({ preset: params.preset || "map" });
  if (params.country && params.country !== "ALL") q.set("country", params.country);
  return fetchCachedLayer<WildlifeOccurrencesResponse>(
    `/api/v1/map-layers/wildlife?${q.toString()}`,
    `wildlife:${q.toString()}`,
    LAYER_TTL_MS.wildlife,
    init,
  );
};

export const fetchWorldPopMeta = (iso3?: string, init?: LayerInit) => {
  const q = iso3 ? `?iso3=${encodeURIComponent(iso3)}` : "";
  const key = `population:${(iso3 || "IDN").toUpperCase()}`;
  return fetchCachedLayer<WorldPopMeta>(
    `/api/v1/map-layers/population${q}`,
    key,
    LAYER_TTL_MS.population,
    init,
  );
};

export const fetchMapHazards = (init?: LayerInit) =>
  fetchCachedLayer<MapHazardsResponse>(
    "/api/v1/map-layers/hazards",
    "hazards",
    LAYER_TTL_MS.hazards,
    init,
  );

export const fetchMapEnvironment = (init?: LayerInit) =>
  fetchCachedLayer<MapEnvironmentResponse>(
    "/api/v1/map-layers/environment",
    "environment",
    LAYER_TTL_MS.environment,
    init,
  );


export interface NLPCorrectionPayload {
  event_id?: string;
  raw_report_id?: string;
  field_name: 'case_count' | 'death_count' | 'disease' | 'location' | 'province' | 'city' | 'country' | 'date_case' | 'event';
  original_value?: string;
  corrected_value: string;
  correction_source?: string;
  text_snippet?: string;
  language?: string;
  corrected_by?: string;
  review_reason?: string;
  evidence_offset_start?: number;
  evidence_offset_end?: number;
  prediction_version?: string;
  review_action?: 'corrected' | 'confirmed' | 'rejected' | 'added' | 'deleted';
}

/** PR 135: master Province (level 1) / City-Regency (level 2) options for Crawl History edits. */
export async function fetchAdminAreas(params: { country: string; level: 1 | 2; admin1?: string; q?: string }): Promise<
  { value: string; label: string; admin1?: string | null; hint?: string | null }[]
> {
  const query = new URLSearchParams({ country: params.country, level: String(params.level) });
  if (params.admin1) query.set('admin1', params.admin1);
  if (params.q) query.set('q', params.q);
  const data = await fetchFrom<any>(`/api/v1/crawl-history/admin-areas?${query.toString()}`);
  return Array.isArray(data) ? data : [];
}

export type CrawlHistoryEdit = {
  event_id?: string;
  country?: string;
  place?: { province: string | null; city: string | null };
  case_date?: { precision: string; value: string };
  reason?: string;
};

/** PR 135: one-transaction place / case date edit (persisted, Activity Log, Edited-by). */
export async function saveCrawlHistoryEdit(rowId: string, body: CrawlHistoryEdit): Promise<{
  id: string; target: 'event' | 'snapshot'; fields: string[]; province?: string | null; city?: string | null;
  country?: string | null; case_date?: { precision: string; start: string; end: string; text?: string | null; label: string } | null;
  edited_by?: string;
}> {
  return postTo(`/api/v1/crawl-history/rows/${encodeURIComponent(rowId)}/edit`, body);
}

export async function submitNLPCorrection(
  payload: NLPCorrectionPayload
): Promise<{ status: string; message: string; correction_id?: string; event_id?: string }> {
  const base = baseURL();
  const directEndpoint = `${base}/api/v1/nlp-corrections`;

  try {
    const res = await fetch(directEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const json = await parseResponseJson(res);
    if (res.ok) {
      const data = (json?.data ?? json) as any;
      return {
        status: 'ok',
        message: 'Correction recorded successfully',
        correction_id: data?.correction_id || data?.id,
        event_id: data?.event_id || payload.event_id,
      };
    }
  } catch {
    // Fall back to Next.js route handler /correct
  }

  const fallbackEndpoint = `${base}/correct`;
  const res = await fetch(fallbackEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.detail || 'Failed to save correction to the server');
  }

  return data;
}

export async function fetchNLPTrainingDataset(
  limit: number = 5000
): Promise<{ total_examples: number; human_corrected_count: number; data: any[] }> {
  const endpoint = typeof window !== 'undefined'
    ? `${baseURL()}/api/v1/nlp/export-dataset?limit=${limit}`
    : `http://disease-nlp-python:8000/export-dataset?limit=${limit}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { ...authHeaders() },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  const fallbackEndpoint = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? `http://localhost:8000/export-dataset?limit=${limit}`
    : `http://disease-nlp-python:8000/export-dataset?limit=${limit}`;

  const fallbackRes = await fetch(fallbackEndpoint);
  if (!fallbackRes.ok) {
    throw new Error('Failed to export dataset from the NLP service');
  }
  return await fallbackRes.json();
}


export interface MarkReviewedPayload {
  eventId?: string | null;
  rawReportId?: string | null;
  reviewed?: boolean;
  reviewedBy?: string;
  notes?: string;
}

export async function markArticleReviewed(payload: MarkReviewedPayload) {
  const body = {
    event_id: payload.eventId || null,
    raw_report_id: payload.rawReportId || null,
    reviewed: payload.reviewed !== false,
    reviewed_by: payload.reviewedBy || 'operator',
    notes: payload.notes || null,
  };

  const base = baseURL();
  const directEndpoint = `${base}/api/v1/nlp/reviews`;

  try {
    const res = await fetch(directEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data;
    }
  } catch {
    // Fall back to Next.js route handler /mark-reviewed
  }

  const endpoint = `${base}/mark-reviewed`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.detail || 'Failed to update review status');
  }

  return data;
}

export interface AuditLogItem {
  id: string;
  user_id?: string | null;
  username?: string | null;
  role?: string;
  user_role?: string;
  action: string;
  resource?: string | null;
  detail?: any;
  details?: any;
  ip_address?: string | null;
  status?: string;
  created_at: string;
}

export interface AuditStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_roles: number;
  total_logs: number;
  today_logs: number;
  period_total_activities?: number;
  period_logins?: number;
  period_failed_logins?: number;
  period_logouts?: number;
  period_active_users?: number;
  after_hours_activities?: number;
  avg_session_duration_minutes?: number;
  top_active_user?: {
    username: string;
    role: string;
    count: number;
  } | null;
}

export interface AuditTrendPoint {
  date: string;
  total_activities: number;
  logins: number;
  logouts: number;
  failed_logins: number;
  active_users: number;
}

export interface UserTrackingData {
  found: boolean;
  searched_username?: string;
  message?: string;
  user?: {
    id?: string | null;
    username: string;
    email?: string | null;
    role?: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
  };
  is_currently_logged_in?: boolean;
  current_session?: {
    created_at?: string;
    last_activity_at?: string;
    expires_at?: string;
  } | null;
  last_login_at?: string | null;
  last_login_ip?: string | null;
  last_logout_at?: string | null;
  last_failed_login_at?: string | null;
  total_logins?: number;
  total_failed_logins?: number;
  total_activities?: number;
  auth_history?: AuditLogItem[];
  recent_activities?: AuditLogItem[];
}

export interface AuditFilterOptions {
  users: string[];
  roles: string[];
  actions: string[];
  resources: string[];
}

export interface AuditLogsQueryParams {
  page?: number;
  per_page?: number;
  q?: string;
  username?: string;
  role?: string;
  action?: string;
  resource?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export async function fetchAuditLogs(params: AuditLogsQueryParams = {}): Promise<{
  data: AuditLogItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  if (params.q) query.set("q", params.q);
  if (params.username) query.set("username", params.username);
  if (params.role) query.set("role", params.role);
  if (params.action) query.set("action", params.action);
  if (params.resource) query.set("resource", params.resource);
  if (params.status) query.set("status", params.status);
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);

  const qs = query.toString();
  const res = await fetch(`${baseURL()}/api/v1/console/audit-logs${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));

  return {
    data: Array.isArray(json?.data) ? json.data : [],
    total: typeof json?.total === "number" ? json.total : 0,
    page: typeof json?.page === "number" ? json.page : 1,
    per_page: typeof json?.per_page === "number" ? json.per_page : 20,
    total_pages: typeof json?.total_pages === "number" ? json.total_pages : 1,
  };
}

export async function fetchAuditStats(params: AuditLogsQueryParams = {}): Promise<AuditStats> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.username) query.set("username", params.username);
  if (params.role) query.set("role", params.role);
  if (params.action) query.set("action", params.action);
  if (params.resource) query.set("resource", params.resource);
  if (params.status) query.set("status", params.status);
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);

  const qs = query.toString();
  const res = await fetch(`${baseURL()}/api/v1/console/audit-logs/stats${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  const payload = (json?.data && typeof json.data === "object") ? json.data : json;
  return {
    total_users: Number(payload?.total_users) || 0,
    active_users: Number(payload?.active_users) || 0,
    inactive_users: Number(payload?.inactive_users) || 0,
    total_roles: Number(payload?.total_roles) || 0,
    total_logs: Number(payload?.total_logs) || 0,
    today_logs: Number(payload?.today_logs) || 0,
    period_total_activities: typeof payload?.period_total_activities === "number" ? payload.period_total_activities : undefined,
    period_logins: typeof payload?.period_logins === "number" ? payload.period_logins : undefined,
    period_failed_logins: typeof payload?.period_failed_logins === "number" ? payload.period_failed_logins : undefined,
    period_logouts: typeof payload?.period_logouts === "number" ? payload.period_logouts : undefined,
    period_active_users: typeof payload?.period_active_users === "number" ? payload.period_active_users : undefined,
    after_hours_activities: typeof payload?.after_hours_activities === "number" ? payload.after_hours_activities : undefined,
    avg_session_duration_minutes: typeof payload?.avg_session_duration_minutes === "number" ? payload.avg_session_duration_minutes : undefined,
    top_active_user: payload?.top_active_user && typeof payload.top_active_user === "object" ? payload.top_active_user : null,
  };
}

export async function fetchAuditTrend(params: AuditLogsQueryParams = {}): Promise<AuditTrendPoint[]> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.username) query.set("username", params.username);
  if (params.role) query.set("role", params.role);
  if (params.action) query.set("action", params.action);
  if (params.resource) query.set("resource", params.resource);
  if (params.status) query.set("status", params.status);
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);

  const qs = query.toString();
  const res = await fetch(`${baseURL()}/api/v1/console/audit-logs/trend${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  const rawData = Array.isArray(json?.data) ? json.data : [];
  return rawData.map((pt: any) => ({
    date: String(pt?.date || ""),
    total_activities: Number(pt?.total_activities) || 0,
    logins: Number(pt?.logins) || 0,
    logouts: Number(pt?.logouts) || 0,
    failed_logins: Number(pt?.failed_logins) || 0,
    active_users: Number(pt?.active_users) || 0,
  }));
}

export async function fetchUserTracking(username: string): Promise<UserTrackingData> {
  const res = await fetch(`${baseURL()}/api/v1/console/audit-logs/user-tracking?username=${encodeURIComponent(username.trim())}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return (json?.data && typeof json.data === "object") ? json.data : json;
}

export async function fetchAuditFilters(): Promise<AuditFilterOptions> {
  const res = await fetch(`${baseURL()}/api/v1/console/audit-logs/filters`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const json = await parseResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, json));
  const payload = (json?.data && typeof json.data === "object") ? json.data : json;
  return {
    users: Array.isArray(payload?.users) ? payload.users : [],
    roles: Array.isArray(payload?.roles) ? payload.roles : [],
    actions: Array.isArray(payload?.actions) ? payload.actions : [],
    resources: Array.isArray(payload?.resources) ? payload.resources : [],
  };
}

