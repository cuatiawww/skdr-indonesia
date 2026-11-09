'use client'
// PR 029: page guard (flow after NLP-PENYAKIT AuthGuard). Public pages render directly; protected pages wait for
// the session, send anonymous users to /login?redirect=<page>, and show a 403 card when the role lacks the permission.
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, LayoutDashboard, ShieldAlert } from 'lucide-react'
import { routeNeed } from '@/lib/access'
import { UNAUTHORIZED_EVENT, useAuth } from '@/lib/skdr-auth'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const { user, loading, can, refresh } = useAuth()
  const { t } = useTranslation()
  const need = routeNeed(pathname)

  useEffect(() => {
    if (need.kind === 'public' || loading || user) return
    // window.location (not useSearchParams) so pages need no Suspense boundary
    const target = pathname + window.location.search
    router.replace(`/login?redirect=${encodeURIComponent(target)}`)
  }, [need.kind, loading, user, router, pathname])

  // An API call answered 401 (session expired / revoked): re-check, then the effect above redirects.
  useEffect(() => {
    const on = () => { refresh() }
    window.addEventListener(UNAUTHORIZED_EVENT, on)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, on)
  }, [refresh])

  if (need.kind === 'public') return <>{children}</>
  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" data-testid="auth-wait">
        <div className="text-sm text-slate-400">{loading ? t('common.loading') : t('common.redirecting')}</div>
      </div>
    )
  }
  if (!can(need.perm)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12" data-testid="auth-forbidden">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-slate-900">{t('skdr.auth.forbiddenTitle')}</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {t('skdr.auth.forbiddenBody', { role: user.role_name })}
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <button onClick={() => router.back()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto">
              <ArrowLeft className="h-3.5 w-3.5" /> {t('common.back')}
            </button>
            <Link href="/dashboard"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark sm:w-auto">
              <LayoutDashboard className="h-3.5 w-3.5" /> {t('skdr.auth.toDashboard')}
            </Link>
          </div>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
