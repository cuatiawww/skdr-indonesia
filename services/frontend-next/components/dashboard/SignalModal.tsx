'use client'
// PR 018: per-signal "Lihat" modal backed by GET /api/v1/signals/:source/:id (EBS alert or Kasus PE).
// Identity, location (+ mini map from the OSM tile proxy when coordinates exist), dates timeline, 7-1-7 durations vs
// target (colour-coded), status/classification, counts, reporter/source text and a link to the PE form.
// Accessibility: role=dialog + aria-modal, Esc and overlay click close, focus trap, focus returns to the opener.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, MapPin, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { peFetch } from '@/lib/pe-api'
import { fmt } from '@/lib/analytics-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { ErrorState } from '@/components/ui/Skeleton'

type StageV = { from: string | null; to: string | null; from_label: string; to_label: string; days: number | null; target: number; on_time: boolean | null }
export type SignalDetail = {
  source: 'ebs' | 'pe'; id: number; ref: string | null; disease: string | null; disease_code: string | null
  status: string | null; verifikasi?: string | null; diagnosa?: string | null; klb?: string | null
  classification: { code: string | null; label: string | null; overridden: boolean; basis: string | null } | null
  location: { province: string | null; kabkota: string | null; kecamatan: string | null; kelurahan?: string | null; unit: string | null; lat: number | null; lng: number | null; exact: boolean }
  timeline: { key: string; label: string; date: string | null }[]
  t717: { detection: StageV; notification: StageV; response: StageV }
  missing: string[]
  counts: { cases: number | null; deaths: number | null }
  texts?: { kronologi: string | null; tindakan: string | null; saran: string | null }
  privacy?: { masked: boolean; replacements: number }
  outcome?: string | null; patient?: { initials: string | null; sex: string | null; age_years: number | null }
  reporter: string | null; ebs_link?: string | null; cluster?: string | null; synced_at?: string | null
  links: { label: string; href: string; status?: string }[]
}

/** EBS free text arrives as HTML fragments; show plain text only (tags dropped, common entities decoded). */
const plain = (s: string) => s.replace(/<\/(li|p|div)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim()

const dmy = (s: string | null) => {
  if (!s) return null
  const [d, tm] = s.split(' ')
  return `${d.split('-').reverse().join('/')}${tm ? ` ${tm}` : ''}`
}

function MiniMap({ lat, lng, exact }: { lat: number; lng: number; exact: boolean }) {
  const { t } = useTranslation()
  const z = exact ? 12 : 9
  const n = 2 ** z
  const xf = ((lng + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  const x0 = Math.floor(xf) - 1, y0 = Math.floor(yf) - 1
  const px = (xf - x0) * 256, py = (yf - y0) * 256
  // 3×3 tiles (768 px) shown in a 100%×176 px window centred on the point
  return (
    <div className="relative h-44 overflow-hidden rounded-xl border border-slate-200 bg-slate-100" data-testid="signal-minimap">
      <div className="absolute" style={{ left: `calc(50% - ${px}px)`, top: `${88 - py}px`, width: 768, height: 768 }}>
        {[0, 1, 2].flatMap((dy) => [0, 1, 2].map((dx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${dx}-${dy}`} alt="" draggable={false} src={`${PUBLIC_BASE_PATH}/osm-tiles/${z}/${(x0 + dx + n) % n}/${y0 + dy}.png`}
            className="absolute h-64 w-64 select-none" style={{ left: dx * 256, top: dy * 256 }} />
        )))}
      </div>
      <MapPin className="absolute left-1/2 top-[88px] h-7 w-7 -translate-x-1/2 -translate-y-full fill-primary text-white drop-shadow" aria-hidden />
      <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-600">{exact ? t('skdr.signal.exactPoint') : t('skdr.signal.areaPoint')}</span>
      <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[9px] text-slate-500">© OpenStreetMap</span>
    </div>
  )
}

function StageRow({ name, s }: { name: string; s: StageV }) {
  const { t } = useTranslation()
  const tone = s.on_time === null ? 'border-slate-200 bg-slate-50 text-slate-500' : s.on_time ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
  return (
    <div className={`rounded-xl border p-2.5 ${tone}`} data-testid="signal-stage">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wide">{name}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-slate-600">{t('skdr.t717.target', { d: s.target })}</span>
      </div>
      <div className="mt-1 text-lg font-black">{s.days === null ? t('skdr.t717.unavailable') : t('skdr.signal.days', { n: s.days })}</div>
      <div className="text-[10.5px] text-slate-600">{s.from_label} → {s.to_label}</div>
      {s.on_time !== null ? <div className="text-[10.5px] font-semibold">{s.on_time ? t('skdr.signal.onTime') : t('skdr.signal.late')}</div> : null}
    </div>
  )
}

export default function SignalModal({ source, id, onClose }: { source: 'ebs' | 'pe'; id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [d, setD] = useState<SignalDetail | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let a = true
    setD(null); setErr('')
    peFetch<{ data: SignalDetail }>(`/api/v1/signals/${source}/${id}`).then((j) => a && setD(j.data)).catch((e) => a && setErr(e.message || 'error'))
    return () => { a = false }
  }, [source, id, tick])

  // focus trap + Esc; restore focus to the opener on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      const f = Array.from(box.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null)
      if (!f.length) { e.preventDefault(); return }
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; opener?.focus?.() }
  }, [onClose])

  const loc = d ? [d.location.unit, d.location.kelurahan, d.location.kecamatan, d.location.kabkota, d.location.province].filter(Boolean).join(', ') : ''
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} data-testid="signal-overlay">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="signal-title" tabIndex={-1} data-testid="signal-modal"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-xl border border-line bg-card shadow-xs outline-none sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-3">
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">{source === 'ebs' ? t('skdr.signal.ebs') : t('skdr.signal.pe')}</div>
            <h2 id="signal-title" className="truncate text-lg font-black text-slate-900">{d ? `${d.ref || `#${d.id}`} · ${d.disease || d.diagnosa || t('skdr.signal.unknownDisease')}` : t('skdr.signal.loading')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} data-testid="signal-close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {err ? <ErrorState message={err} onRetry={() => setTick((x) => x + 1)} /> : null}
          {!d && !err ? (
            <div className="space-y-3" data-testid="signal-skeleton" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : null}
          {d ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-slate-500">{t('skdr.signal.status')}</dt><dd className="font-semibold text-slate-800">{d.status || '—'}{d.verifikasi ? ` · ${d.verifikasi}` : ''}</dd>
                    <dt className="text-slate-500">{t('skdr.signal.classification')}</dt>
                    <dd className="font-semibold text-slate-800">{d.classification?.label || d.classification?.code || (source === 'ebs' ? d.diagnosa || '—' : t('skdr.signal.unclassified'))}{d.classification?.overridden ? ` (${t('skdr.signal.overridden')})` : ''}</dd>
                    {d.klb && !['-1', '0'].includes(d.klb.trim()) ? <><dt className="text-slate-500">KLB</dt><dd className="font-semibold text-slate-800">{d.klb}</dd></> : null}
                    <dt className="text-slate-500">{t('skdr.signal.counts')}</dt>
                    <dd className="font-semibold text-slate-800">{t('skdr.signal.countsVal', { c: d.counts.cases === null ? '—' : fmt(d.counts.cases), m: d.counts.deaths === null ? '—' : fmt(d.counts.deaths) })}</dd>
                    {d.patient ? <><dt className="text-slate-500">{t('skdr.signal.patient')}</dt><dd className="font-semibold text-slate-800">{[d.patient.initials, d.patient.sex, d.patient.age_years !== null ? t('skdr.signal.age', { n: d.patient.age_years }) : null].filter(Boolean).join(' · ') || '—'}</dd></> : null}
                    {d.outcome ? <><dt className="text-slate-500">{t('skdr.signal.outcome')}</dt><dd className="font-semibold text-slate-800">{d.outcome}</dd></> : null}
                    <dt className="text-slate-500">{t('skdr.signal.reporter')}</dt><dd className="font-semibold text-slate-800">{d.reporter || '—'}</dd>
                    {d.cluster ? <><dt className="text-slate-500">{t('skdr.signal.cluster')}</dt><dd className="font-mono font-semibold text-slate-800">{d.cluster}</dd></> : null}
                  </dl>
                  <div className="flex items-start gap-1.5 text-xs text-slate-700"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{loc || t('skdr.signal.noLocation')}</div>
                </div>
                {d.location.lat !== null && d.location.lng !== null ? <MiniMap lat={d.location.lat} lng={d.location.lng} exact={d.location.exact} />
                  : <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">{t('skdr.signal.noCoords')}</div>}
              </div>

              <section>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">{t('skdr.signal.timeline')}</h3>
                <ol className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {d.timeline.map((e) => (
                    <li key={e.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs">
                      <span className="text-slate-600">{e.label}</span>
                      <span className={e.date ? 'font-semibold tabular-nums text-slate-900' : 'text-slate-400'}>{dmy(e.date) || t('skdr.t717.unavailable')}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">{t('skdr.signal.t717')}</h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <StageRow name={t('skdr.t717.detect')} s={d.t717.detection} />
                  <StageRow name={t('skdr.t717.notify')} s={d.t717.notification} />
                  <StageRow name={t('skdr.t717.respond')} s={d.t717.response} />
                </div>
                {d.missing.length ? <p className="mt-2 text-[11px] text-slate-500">{t('skdr.t717.missingField', { f: d.missing.join(', ') })}</p> : null}
              </section>

              {d.texts && (d.texts.kronologi || d.texts.tindakan || d.texts.saran) ? (
                // free text may contain personal names: collapsed by default
                <details className="rounded-xl border border-slate-200 p-3 text-xs" data-testid="signal-texts">
                  <summary className="cursor-pointer font-bold text-slate-700">{t('skdr.signal.sourceText')}
                    {d.privacy?.masked ? <span className="ml-2 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800" data-testid="signal-masked-note">{t('skdr.signal.maskedNote')}</span> : null}</summary>
                  <div className="mt-2 space-y-2">
                    {(['kronologi', 'tindakan', 'saran'] as const).map((k) => d.texts![k] ? (
                      <div key={k}><div className="font-bold text-slate-700">{t(`skdr.signal.${k}`)}</div><p className="whitespace-pre-line text-slate-600">{plain(d.texts![k] as string)}</p></div>
                    ) : null)}
                  </div>
                </details>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {d.links.length ? d.links.map((l) => (
                  <Link key={l.href} href={l.href} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-dark">
                    <ExternalLink className="h-3.5 w-3.5" />{source === 'ebs' ? t('skdr.signal.openPe', { no: l.label }) : t('skdr.signal.openForm')}
                  </Link>
                )) : <span className="text-xs text-slate-500">{t('skdr.signal.noPe')}</span>}
                {d.synced_at ? <span className="ml-auto text-[10.5px] text-slate-400">{t('skdr.signal.synced', { d: dmy(d.synced_at) || '' })}</span> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Small hook: `open(source, id)` + the modal element to render. */
export function useSignalModal() {
  const [sel, setSel] = useState<{ source: 'ebs' | 'pe'; id: number } | null>(null)
  const close = useCallback(() => setSel(null), [])
  const open = useCallback((source: 'ebs' | 'pe', id: number) => setSel({ source, id }), [])
  const modal = sel ? <SignalModal source={sel.source} id={sel.id} onClose={close} /> : null
  return { open, modal }
}

export function LihatButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} data-testid="signal-lihat"
      className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-primary hover:bg-brand-100">{label || t('skdr.signal.view')}</button>
  )
}
