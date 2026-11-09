// PR 029: route access rules (shared by middleware.ts, AuthGuard and AppShell). Pure functions, no React.
// Backend enforces the same split on the API (services/backend-rust/src/auth.rs `classify`).
//   Every page except /login needs a session (dashboards included, any role).
//   Dasbor         → login (any role)
//   Dasbor Limited → login + permission `dashboard_limited`
//   Tata Kelola    → login + permission `tatakelola` (finer: master_data, integrasi, user_management)
export type Area = 'home' | 'dashboard' | 'tatakelola' | 'bare'
export type Need = { kind: 'public' } | { kind: 'login' } | { kind: 'perm'; perm: string }

const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`)

const DASHBOARD_PREFIXES = ['/dashboard', '/main-dashboard', '/dasbor', '/penyakit', '/tv', '/dokumentasi', '/laboratorium', '/klaster']
const TATAKELOLA_PREFIXES = ['/tatakelola', '/pe', '/ebs', '/integrasi', '/master']

export const LIMITED_PREFIXES = ['/dashboard/spasial', '/dashboard/matriks-analisa']

export function routeArea(pathname: string): Area {
  const p = pathname || '/'
  if (p === '/login') return 'bare'
  if (p === '/') return 'home'
  if (TATAKELOLA_PREFIXES.some((x) => under(p, x))) return 'tatakelola'
  if (DASHBOARD_PREFIXES.some((x) => under(p, x))) return 'dashboard'
  return 'home'
}

export function routeNeed(pathname: string): Need {
  const p = pathname || '/'
  if (LIMITED_PREFIXES.some((x) => under(p, x))) return { kind: 'perm', perm: 'dashboard_limited' }
  if (['/tatakelola/pengguna', '/tatakelola/peran', '/tatakelola/log-akses'].some((x) => under(p, x))) return { kind: 'perm', perm: 'user_management' }
  if (under(p, '/master')) return { kind: 'perm', perm: 'master_data' }
  if (under(p, '/ebs') || under(p, '/integrasi')) return { kind: 'perm', perm: 'integrasi' }
  if (TATAKELOLA_PREFIXES.some((x) => under(p, x))) return { kind: 'perm', perm: 'tatakelola' }
  if (p === '/login') return { kind: 'public' }
  return { kind: 'login' }
}

export function hasPerm(permissions: string[] | undefined | null, perm?: string): boolean {
  if (!perm) return true
  const list = permissions || []
  return list.includes('*') || list.includes(perm)
}

/** Only allow same-app relative redirects after login (no open redirect). */
export function safeRedirect(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/login')) return fallback
  return raw
}
