'use client'
// PR 029: client auth state for SKDR (flow after NLP-PENYAKIT/ABVC: login → session check → guard → logout).
// The session token lives only in an HttpOnly cookie set by the backend; the browser sends it automatically with
// every same-origin request, so existing fetch() calls need no Authorization header.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { hasPerm } from '@/lib/access'

export type SkdrUser = {
  id: string
  username: string
  full_name: string | null
  role: string
  role_name: string
  permissions: string[]
  /** true for the seeded admin / new users / admin-reset passwords until they pick their own password */
  must_change_password?: boolean
}

type Ctx = {
  user: SkdrUser | null
  /** true until the first /api/auth/session answer */
  loading: boolean
  refresh: () => Promise<SkdrUser | null>
  login: (username: string, password: string) => Promise<SkdrUser>
  logout: () => Promise<void>
  can: (perm?: string) => boolean
}

const AuthContext = createContext<Ctx>({
  user: null,
  loading: true,
  refresh: async () => null,
  login: async () => { throw new Error('AuthProvider missing') },
  logout: async () => {},
  can: () => false,
})

export const UNAUTHORIZED_EVENT = 'skdr:unauthorized'

/** Call from API helpers when the backend answers 401 so the guard can send the user to /login. */
export function notifyUnauthorized() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
}

const api = (p: string) => `${PUBLIC_BASE_PATH}${p}`

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SkdrUser | null>(null)
  const [loading, setLoading] = useState(true)
  const lastCheck = useRef(0)

  const refresh = useCallback(async () => {
    lastCheck.current = Date.now()
    try {
      const res = await fetch(api('/api/auth/session'), { cache: 'no-store', credentials: 'same-origin' })
      if (res.ok) {
        const j = await res.json()
        const u: SkdrUser | null = j?.data?.user || null
        setUser(u)
        return u
      }
      if (res.status === 401) { setUser(null); return null }
      return user
    } catch {
      return user // network hiccup: keep current state
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // re-validate when the tab regains focus (at most once a minute) so idle/absolute expiry is noticed
  useEffect(() => {
    const onFocus = () => { if (Date.now() - lastCheck.current > 60_000) refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(api('/api/auth/login'), {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j?.success) throw new Error(j?.error || `HTTP ${res.status}`)
    setUser(j.data.user)
    lastCheck.current = Date.now()
    return j.data.user as SkdrUser
  }, [])

  const logout = useCallback(async () => {
    try { await fetch(api('/api/auth/logout'), { method: 'POST', credentials: 'same-origin', keepalive: true }) } catch {}
    setUser(null)
    // other tabs: storage event → they re-check the session
    try { localStorage.setItem('skdr_logout_at', String(Date.now())) } catch {}
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'skdr_logout_at') refresh() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const can = useCallback((perm?: string) => !!user && hasPerm(user.permissions, perm), [user])

  return <AuthContext.Provider value={{ user, loading, refresh, login, logout, can }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
