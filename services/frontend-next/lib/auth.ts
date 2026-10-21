import {
  SYSTEM_MODULES,
  type SystemModule,
  getActiveModules,
  isModulePermitted,
  type ActiveModule,
} from './modules';
import type { SidebarGroupConfig } from './menu';
import { PUBLIC_BASE_PATH } from './public-path';

export { SYSTEM_MODULES, type SystemModule };

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const NAV_CACHE_KEY = "sys_nav_cache";

let memoryNavMenu: SidebarGroupConfig[] | null = null;

export function setNavigationCache(menu: SidebarGroupConfig[] | null | undefined) {
  if (Array.isArray(menu) && menu.length > 0) {
    memoryNavMenu = menu;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(menu));
      } catch {}
    }
  }
}

export function getNavigationCache(): SidebarGroupConfig[] | null {
  if (memoryNavMenu) return memoryNavMenu;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(NAV_CACHE_KEY);
      if (stored) {
        memoryNavMenu = JSON.parse(stored);
        return memoryNavMenu;
      }
    } catch {}
  }
  return null;
}

export type AuthUser = {
  token: string;
  user_id: string;
  username: string;
  role: string;
  permissions?: string[];
  full_name?: string;
  display_name?: string;
  email?: string;
};

export const ROLE_PRESET_MODULES: Record<string, string[]> = {
  admin: ['*'],
  data_analyst: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'sources', 'indicator_sources', 'analyze', 'manual_crawler', 'crawl_history', 'processing', 'reports', 'locations', 'disease_master'],
  epidemiologi: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'analyze', 'manual_crawler', 'crawl_history', 'reports', 'locations', 'disease_master', 'outbreak_rules', 'nlp_config'],
  executive: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'reports', 'tv'],
  skk: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'sources', 'indicator_sources', 'manual_crawler', 'crawl_history', 'reports', 'processing'],
  // legacy fallbacks
  operator: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'sources', 'indicator_sources', 'analyze', 'manual_crawler', 'crawl_history', 'reports'],
  viewer: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'reports'],
};

export function hasModuleAccess(
  user: AuthUser | null,
  moduleKeyOrPath: string,
  navigationMenu?: SidebarGroupConfig[]
): boolean {
  if (!user) return false;
  const role = user.role?.toLowerCase();
  const isAdmin = role === 'admin' || role === 'superadmin' || role === 'webmaster';
  if (isAdmin) return true;

  // Clean path (remove query params)
  const cleanPath = moduleKeyOrPath.split('?')[0];

  // Public / launchpad home portal is always accessible to authenticated users
  if (cleanPath === '/') return true;

  // 1. Dynamic active modules check from active navigation configuration
  const activeMenu = navigationMenu || getNavigationCache();
  const activeModules: ActiveModule[] = getActiveModules(activeMenu || undefined);

  let matchedActiveModule = false;

  for (const mod of activeModules) {
    const parentExplicitlyPermitted =
      user.permissions?.includes(mod.id) ||
      (mod.path && user.permissions?.includes(mod.path)) ||
      (mod.aliases && mod.aliases.some((a) => user.permissions?.includes(a)));

    const isTargetMod =
      mod.id === moduleKeyOrPath ||
      mod.path === cleanPath ||
      (mod.aliases && mod.aliases.includes(moduleKeyOrPath)) ||
      (mod.aliases && mod.aliases.includes(cleanPath)) ||
      (mod.path && mod.path !== '/' && cleanPath.startsWith(mod.path));

    if (isTargetMod) {
      matchedActiveModule = true;
      if (parentExplicitlyPermitted || isModulePermitted(mod, user.permissions)) {
        return true;
      }
    }

    // Check sub-modules
    if (mod.subItems && mod.subItems.length > 0) {
      for (const sub of mod.subItems) {
        const isTargetSub =
          sub.id === moduleKeyOrPath ||
          sub.path === cleanPath ||
          (sub.aliases && sub.aliases.includes(moduleKeyOrPath)) ||
          (sub.aliases && sub.aliases.includes(cleanPath)) ||
          (sub.path && sub.path !== '/' && cleanPath.startsWith(sub.path));

        if (isTargetSub) {
          matchedActiveModule = true;
          // If parent module itself was explicitly granted, or this specific sub-module is permitted, allow access
          if (
            parentExplicitlyPermitted ||
            user.permissions?.includes(sub.id) ||
            user.permissions?.includes(sub.path) ||
            (sub.aliases && sub.aliases.some((a) => user.permissions?.includes(a)))
          ) {
            return true;
          }
        }
      }
    }
  }

  // If the path was matched to an active module or sub-module, but access was not granted above,
  // do not fall through to broad fallback rules.
  if (matchedActiveModule) {
    return false;
  }

  // Direct permission match
  if (user.permissions?.includes(moduleKeyOrPath)) return true;

  // 2. Fallback to static SYSTEM_MODULES path mapping
  const target = SYSTEM_MODULES.find(m => m.path === cleanPath || m.id === moduleKeyOrPath);
  if (target) {
    return user.permissions?.includes(target.id) || false;
  }

  // 3. Fallback to group paths check (exact/scoped permission checks without loose leakage)
  if (cleanPath.startsWith('/main-dashboard') && (user.permissions?.includes('main_dashboard') || user.permissions?.includes('mod_main_dashboard') || user.permissions?.includes('dashboard') || user.permissions?.includes('/main-dashboard'))) return true;
  if (cleanPath.startsWith('/lite-dashboard') && (user.permissions?.includes('lite_dashboard') || user.permissions?.includes('mod_lite_dashboard') || user.permissions?.includes('/lite-dashboard'))) return true;
  if (cleanPath.startsWith('/asean-countries') && (user.permissions?.includes('asean_countries') || user.permissions?.includes('mod_asean_countries') || user.permissions?.includes('/asean-countries'))) return true;
  if (cleanPath.startsWith('/prototype-asean-dashboard') && (user.permissions?.includes('prototype_asean_dashboard') || user.permissions?.includes('mod_prototype_asean_dashboard') || user.permissions?.includes('/prototype-asean-dashboard') || user.permissions?.includes('asean_countries') || user.permissions?.includes('mod_asean_countries') || user.permissions?.includes('main_dashboard') || user.permissions?.includes('mod_main_dashboard_prototype'))) return true;
  if (cleanPath.startsWith('/prototype') && (user.permissions?.includes('prototype') || user.permissions?.includes('/prototype') || user.permissions?.includes('main_dashboard') || user.permissions?.includes('mod_main_dashboard') || user.permissions?.includes('mod_main_dashboard_prototype'))) return true;
  if (cleanPath.startsWith('/asean-3') && (user.permissions?.includes('asean_3') || user.permissions?.includes('mod_asean_3') || user.permissions?.includes('/asean-3'))) return true;
  if (cleanPath.startsWith('/outside-asean') && (user.permissions?.includes('outside_asean') || user.permissions?.includes('mod_outside_asean') || user.permissions?.includes('/outside-asean'))) return true;
  if (cleanPath.startsWith('/analysis-dashboard') && (user.permissions?.includes('analysis_dashboard') || user.permissions?.includes('mod_analysis_dashboard') || user.permissions?.includes('/analysis-dashboard'))) return true;
  if (cleanPath.startsWith('/web-services-dashboard') && (user.permissions?.includes('web_services_dashboard') || user.permissions?.includes('mod_web_services_dashboard') || user.permissions?.includes('/web-services-dashboard'))) return true;
  if (cleanPath.startsWith('/crawling-dashboard') && (user.permissions?.includes('crawling_dashboard') || user.permissions?.includes('mod_crawling_dashboard') || user.permissions?.includes('/crawling-dashboard'))) return true;
  if (cleanPath.startsWith('/disease-dashboard') && (user.permissions?.includes('disease_dashboard') || user.permissions?.includes('mod_disease_dashboard') || user.permissions?.includes('/disease-dashboard'))) return true;
  if (cleanPath.startsWith('/nlp-ai') && (user.permissions?.includes('nlp_ai') || user.permissions?.includes('mod_nlp_ai') || user.permissions?.includes('/nlp-ai'))) return true;
  if (cleanPath.startsWith('/spatial-dashboard') && (user.permissions?.includes('spatial_dashboard') || user.permissions?.includes('mod_spatial_dashboard') || user.permissions?.includes('/spatial-dashboard'))) return true;
  if (cleanPath.startsWith('/countries-dashboard') && (user.permissions?.includes('countries_dashboard') || user.permissions?.includes('mod_countries_dashboard') || user.permissions?.includes('/countries-dashboard'))) return true;
  if (cleanPath.startsWith('/executive-dashboard') && (user.permissions?.includes('executive_dashboard') || user.permissions?.includes('mod_executive_dashboard') || user.permissions?.includes('/executive-dashboard'))) return true;
  if (cleanPath.startsWith('/events') && (user.permissions?.includes('events') || user.permissions?.includes('mod_events') || user.permissions?.includes('/events'))) return true;
  if (cleanPath.startsWith('/sources') && (user.permissions?.includes('sources') || user.permissions?.includes('mod_sources') || user.permissions?.includes('/sources'))) return true;
  if (cleanPath.startsWith('/indicator-sources') && (user.permissions?.includes('indicator_sources') || user.permissions?.includes('mod_indicator_sources') || user.permissions?.includes('/indicator-sources'))) return true;
  if (cleanPath.startsWith('/analyze') && (user.permissions?.includes('analyze') || user.permissions?.includes('mod_analyze') || user.permissions?.includes('/analyze'))) return true;
  if (cleanPath.startsWith('/manual-crawler') && (user.permissions?.includes('manual_crawler') || user.permissions?.includes('mod_crawler') || user.permissions?.includes('/manual-crawler'))) return true;
  if ((cleanPath.startsWith('/crawl-history') || cleanPath.startsWith('/crawling-log') || cleanPath.startsWith('/monitoring-crawling') || cleanPath.startsWith('/ibs-crawling')) && (user.permissions?.includes('crawl_history') || user.permissions?.includes('mod_crawl_history') || user.permissions?.includes('/crawl-history'))) return true;
  if (cleanPath.startsWith('/processing') && (user.permissions?.includes('processing') || user.permissions?.includes('mod_processing') || user.permissions?.includes('/processing'))) return true;
  if ((cleanPath.startsWith('/reports/cms') || cleanPath.startsWith('/reports/drafts') || cleanPath.startsWith('/reports/new') || cleanPath.startsWith('/reports/edit')) && (user.permissions?.includes('reports_cms') || user.permissions?.includes('cms') || user.permissions?.includes('/reports/cms'))) return true;
  if ((cleanPath.startsWith('/reports') || cleanPath.startsWith('/laporan')) && (user.permissions?.includes('reports') || user.permissions?.includes('mod_reports') || user.permissions?.includes('/reports'))) return true;
  if (cleanPath.startsWith('/tv') && (user.permissions?.includes('tv') || user.permissions?.includes('mod_tv') || user.permissions?.includes('/tv'))) return true;
  if (cleanPath.startsWith('/locations') && (user.permissions?.includes('locations') || user.permissions?.includes('mod_locations') || user.permissions?.includes('/locations'))) return true;
  if (cleanPath.startsWith('/master-countries') && (user.permissions?.includes('master_countries') || user.permissions?.includes('mod_master_countries') || user.permissions?.includes('/master-countries'))) return true;
  if (cleanPath.startsWith('/border-countries') && (user.permissions?.includes('border_countries') || user.permissions?.includes('mod_border_countries') || user.permissions?.includes('/border-countries'))) return true;
  if (cleanPath.startsWith('/disease-master') && (user.permissions?.includes('disease_master') || user.permissions?.includes('mod_disease_master') || user.permissions?.includes('/disease-master'))) return true;
  if (cleanPath.startsWith('/source-credibility') && (user.permissions?.includes('credibility') || user.permissions?.includes('mod_credibility') || user.permissions?.includes('source_credibility') || user.permissions?.includes('/source-credibility'))) return true;
  if (cleanPath.startsWith('/outbreak-rules') && (user.permissions?.includes('outbreak_rules') || user.permissions?.includes('mod_outbreak_rules') || user.permissions?.includes('/outbreak-rules'))) return true;
  if ((cleanPath.startsWith('/nlp-labels') || cleanPath.startsWith('/nlp-keywords') || cleanPath.startsWith('/language-markers') || cleanPath.startsWith('/extraction-rules') || cleanPath.startsWith('/language-models')) && (user.permissions?.includes('nlp_config') || user.permissions?.includes('mod_nlp') || user.permissions?.includes('mod_nlp_labels') || user.permissions?.includes('mod_nlp_keywords') || user.permissions?.includes('/nlp-labels'))) return true;
  if (cleanPath.startsWith('/interoperability') && (user.permissions?.includes('interoperability') || user.permissions?.includes('mod_interoperability') || user.permissions?.includes('/interoperability'))) return true;
  if (cleanPath.startsWith('/activity-log') && (user.permissions?.includes('events.publish') || user.permissions?.includes('activity_log') || user.permissions?.includes('/activity-log'))) return true;
  if (cleanPath.startsWith('/business-process')) return true;
  if (cleanPath.startsWith('/console/users') && (user.permissions?.includes('console_users') || user.permissions?.includes('/console/users'))) return true;
  if (cleanPath.startsWith('/console/settings') && (user.permissions?.includes('console_settings') || user.permissions?.includes('/console/settings'))) return true;
  if (cleanPath.startsWith('/console/configuration-modul') && (user.permissions?.includes('configuration_modul') || user.permissions?.includes('/console/configuration-modul'))) return true;
  if (
    (cleanPath.startsWith('/console/user-log-activity') ||
      cleanPath.startsWith('/user-log-activity') ||
      cleanPath.startsWith('/console/log-user-activity') ||
      cleanPath.startsWith('/log-user-activity')) &&
    (user.permissions?.includes('user_log_activity') ||
      user.permissions?.includes('/console/user-log-activity') ||
      user.permissions?.includes('log_user_activity') ||
      user.permissions?.includes('/console/log-user-activity') ||
      user.permissions?.includes('audit_logs') ||
      user.permissions?.includes('audit') ||
      user.permissions?.includes('/user-log-activity') ||
      user.permissions?.includes('/log-user-activity'))
  )
    return true;

  return false;
}

const SESSION_META_KEY = "auth_session_meta";

// PR 114: fallbacks only; real values come from the backend (system_settings 'session').
export const DEFAULT_IDLE_TIMEOUT_SECONDS = 8 * 3600;
export const DEFAULT_ABSOLUTE_TIMEOUT_SECONDS = 7 * 24 * 3600;
const SERVER_PING_KEY = "auth_session_server_ping";

export type SessionMeta = {
  createdAt: number;
  lastActivityAt: number;
  idleTimeoutSeconds: number;
  absoluteTimeoutSeconds: number;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function getSessionMeta(): SessionMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuthSession(data: {
  token: string;
  user_id?: string;
  username?: string;
  role?: string;
  permissions?: string[];
  session?: {
    idle_timeout_seconds?: number;
    absolute_timeout_seconds?: number;
    created_at?: string;
    last_activity_at?: string;
  };
  [key: string]: any;
}) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data));

  const idleSecs = data.session?.idle_timeout_seconds || DEFAULT_IDLE_TIMEOUT_SECONDS;
  const absSecs = data.session?.absolute_timeout_seconds || DEFAULT_ABSOLUTE_TIMEOUT_SECONDS;
  const meta: SessionMeta = {
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    idleTimeoutSeconds: idleSecs,
    absoluteTimeoutSeconds: absSecs,
  };
  localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
  localStorage.setItem(SERVER_PING_KEY, String(Date.now()));

  // Set cookie for browser session handling
  try {
    document.cookie = `auth_token=${encodeURIComponent(data.token)}; path=/; max-age=${absSecs}; SameSite=Lax`;
  } catch {}
}

export function recordUserActivity() {
  if (typeof window === "undefined") return;
  const token = getToken();
  if (!token) return;
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (raw) {
      const meta: SessionMeta = JSON.parse(raw);
      const now = Date.now();
      // Throttle updates to once every 10 seconds
      if (now - meta.lastActivityAt > 10000) {
        meta.lastActivityAt = now;
        localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
      }
    }
  } catch {}
}

/** Sync timeouts from the server's live policy (shared across tabs via localStorage). */
export function syncSessionPolicy(session?: { idle_timeout_seconds?: number; absolute_timeout_seconds?: number }) {
  if (typeof window === "undefined" || !session) return;
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (!raw) return;
    const meta: SessionMeta = JSON.parse(raw);
    if (session.idle_timeout_seconds) meta.idleTimeoutSeconds = session.idle_timeout_seconds;
    if (session.absolute_timeout_seconds) meta.absoluteTimeoutSeconds = session.absolute_timeout_seconds;
    localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
  } catch {}
}

export function getLastServerPing(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(SERVER_PING_KEY) || 0) || 0;
}

export function markServerPing() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SERVER_PING_KEY, String(Date.now())); } catch {}
}

/**
 * PR 114 sliding refresh: if the user was active locally since the last server
 * contact and the server hasn't been pinged recently, call /api/auth/session so
 * the backend's last_activity_at is extended before the idle window closes.
 * Shared timestamp in localStorage means only one tab pings.
 */
export async function keepSessionAlive(): Promise<{ valid: boolean; reason?: string } | null> {
  const meta = getSessionMeta();
  if (!meta || !getToken()) return null;
  const lastPing = getLastServerPing();
  const pingEvery = Math.min(5 * 60 * 1000, Math.max(30 * 1000, (meta.idleTimeoutSeconds * 1000) / 4));
  if (meta.lastActivityAt <= lastPing || Date.now() - lastPing < pingEvery) return null;
  markServerPing();
  return await validateServerSession();
}

export function checkSessionTimeout(): { expired: boolean; reason?: 'idle' | 'absolute' } {
  if (typeof window === "undefined") return { expired: false };
  const token = getToken();
  if (!token) return { expired: false };
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (!raw) return { expired: false };
    const meta: SessionMeta = JSON.parse(raw);
    const now = Date.now();

    // Check absolute timeout
    if (now - meta.createdAt >= meta.absoluteTimeoutSeconds * 1000) {
      return { expired: true, reason: 'absolute' };
    }

    // Check idle timeout
    if (now - meta.lastActivityAt >= meta.idleTimeoutSeconds * 1000) {
      return { expired: true, reason: 'idle' };
    }
  } catch {}
  return { expired: false };
}

export async function validateServerSession(): Promise<{ valid: boolean; user?: AuthUser; reason?: string }> {
  if (typeof window === "undefined") return { valid: false };
  const token = getToken();
  if (!token) return { valid: false };

  // Check client-side timeout first
  const timeoutCheck = checkSessionTimeout();
  if (timeoutCheck.expired) {
    clearAuthSession();
    return { valid: false, reason: timeoutCheck.reason };
  }

  try {
    const basePath = (PUBLIC_BASE_PATH || "/nlp").replace(/\/$/, "");
    const res = await fetch(`${basePath}/api/auth/session`, {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });

    if (res.status === 401) {
      const json = await res.json().catch(() => null);
      clearAuthSession();
      return { valid: false, reason: json?.code || "unauthorized" };
    }

    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.success && json?.data?.user) {
        markServerPing();
        syncSessionPolicy(json?.data?.session);
        recordUserActivity();
        return { valid: true, user: json.data.user };
      }
    }
    return { valid: true };
  } catch {
    return { valid: true };
  }
}

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  if (!getToken()) return false;
  const timeoutCheck = checkSessionTimeout();
  if (timeoutCheck.expired) {
    clearAuthSession();
    return false;
  }
  return true;
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(SESSION_META_KEY);
  localStorage.removeItem(SERVER_PING_KEY);
  localStorage.removeItem(NAV_CACHE_KEY);
  try {
    document.cookie = "auth_token=; path=/; max-age=0; SameSite=Lax";
  } catch {}
}

export function logout() {
  const basePath = (PUBLIC_BASE_PATH || "/nlp").replace(/\/$/, "");
  const token = getToken();
  clearAuthSession();
  if (token) {
    fetch(`${basePath}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {});
  }
  window.location.href = `${basePath}/login`;
}
