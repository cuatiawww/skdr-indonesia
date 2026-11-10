'use client'
// PR 029: SKDR login page. Flow follows NLP-PENYAKIT/ABVC (username/email + password → session → back to the page
// that asked for login, expired-session notice); visuals use the SKDR/Kemenkes design (teal brand palette, lime
// accent, Kemenkes logo, Beranda imagery, Roboto).
import { Suspense, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Lock, LogIn, User } from 'lucide-react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useSettings } from '@/lib/settings-context'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useAuth } from '@/lib/skdr-auth'
import { safeRedirect } from '@/lib/access'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = safeRedirect(params.get('redirect'))
  const expired = params.get('expired')
  const { t } = useTranslation()
  const { settings } = useSettings()
  const { login, user, loading: authLoading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(expired ? t('skdr.auth.expired') : '')

  // already logged in → go straight to the requested page
  useEffect(() => { if (!authLoading && user) router.replace(redirect) }, [authLoading, user, redirect, router])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username.trim(), password)
      router.replace(redirect)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skdr.auth.failed'))
      setBusy(false)
    }
  }

  const logo = settings.login_logo_url || settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/Logo-Kemenkes.png`
  const loginBg = `${PUBLIC_BASE_PATH}/images/bg%20login%20skdr.webp`
  const appName = settings.app_name || t('skdr.layout.appName')
  const tagline = settings.app_tagline || t('skdr.layout.appTagline')
  const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-brand-100'

  return (
    <div className="flex min-h-screen w-full flex-col bg-page lg:flex-row" data-testid="login-page">
      {/* form */}
      <div className="flex w-full flex-col justify-between bg-white p-6 sm:p-10 lg:w-[45%] lg:p-12 xl:w-[42%] xl:p-16 2xl:w-[38%]">
        <div className="h-[4px] -mx-6 -mt-6 mb-6 bg-primary sm:-mx-10 sm:-mt-10 lg:-mx-12 lg:-mt-12 xl:-mx-16 xl:-mt-16" />
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-primary" data-testid="back-landing">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Halaman Utama</span>
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={t('skdr.layout.logo')} className="mb-6 h-12 w-auto object-contain sm:h-14" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <span className="inline-block rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-brand-800">
            {t('skdr.auth.portal')}
          </span>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-brand-900 xl:text-3xl">{t('skdr.auth.title')}</h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">{t('skdr.auth.subtitle', { app: appName })}</p>

          <form onSubmit={submit} className="mt-6 space-y-4" data-testid="login-form">
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('skdr.auth.username')}</span>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input name="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('skdr.auth.usernamePh')} className={inputCls} />
              </div>
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('skdr.auth.password')}</span>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder={t('skdr.auth.passwordPh')} className={`${inputCls} pr-10`} />
                <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)} aria-label={t('skdr.auth.togglePassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div role="alert" data-testid="login-error" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>
            )}

            <button type="submit" disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-700/20 transition hover:bg-primary-dark active:scale-[0.99] disabled:opacity-50">
              {busy ? <span>{t('skdr.auth.signingIn')}</span> : <><LogIn className="h-4 w-4" /><span>{t('skdr.auth.signIn')}</span></>}
            </button>

          </form>
        </div>

        <div className="text-center text-xs text-slate-400">{settings.footer_text || appName} &bull; {tagline}</div>
      </div>

      {/* hero */}
      <div className="relative hidden flex-1 overflow-hidden bg-slate-100 lg:block">
        <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${loginBg}")` }} />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
