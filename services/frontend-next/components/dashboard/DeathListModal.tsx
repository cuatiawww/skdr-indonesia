'use client'
// PR 018: list of deaths among non-confirmed PE reports (starred CFR rows: suspek / probabel / GHPR), from
// GET /api/v1/signals/pe-deaths within the global filters. Each row's "Lihat" opens the per-signal detail modal.
// Same accessibility as SignalModal: dialog, Esc / overlay close, focus trap, focus restored.
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { peFetch, STATUS_STYLE } from '@/lib/pe-api'
import { ErrorState } from '@/components/ui/Skeleton'
import { LihatButton, useSignalModal } from '@/components/dashboard/SignalModal'

type Row = { id: number; no_pe: string; unit: string | null; kabkota: string | null; province: string | null; date: string | null; epi_week: string | null; status: string; classification: string | null; death_date: string | null }

export default function DeathListModal({ title, form, codes, qs, onClose }: { title: string; form: string; codes: string[]; qs: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const { open, modal } = useSignalModal()
  const childOpen = !!modal

  useEffect(() => {
    let a = true
    setRows(null); setErr('')
    const p = new URLSearchParams(qs); p.set('form', form); p.set('classes', codes.join(','))
    peFetch<{ data: Row[] }>(`/api/v1/signals/pe-deaths?${p.toString()}`).then((j) => a && setRows(j.data)).catch((e) => a && setErr(e.message || 'error'))
    return () => { a = false }
  }, [form, codes, qs, tick])

  useEffect(() => {
    if (childOpen) return
    const opener = document.activeElement as HTMLElement | null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      const f = Array.from(box.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')).filter((x) => x.offsetParent !== null)
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [onClose, childOpen])

  const dmy = (s: string | null) => (s ? s.split('-').reverse().join('/') : '—')
  return (
    <div className="fixed inset-0 z-[990] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} data-testid="deaths-overlay">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="deaths-title" tabIndex={-1} data-testid="deaths-modal"
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-t-xl border border-line bg-card shadow-xs outline-none sm:rounded-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b skdr-rule bg-card px-5 py-3">
          <div>
            <div className="skdr-eyebrow">{t('skdr.cfrList.eyebrow')}</div>
            <h2 id="deaths-title" className="text-lg font-black text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-slate-600 hover:bg-page"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">
          {err ? <ErrorState message={err} onRetry={() => setTick((x) => x + 1)} /> : null}
          {!rows && !err ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-page" />)}</div> : null}
          {rows ? (rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="border-b skdr-rule text-[10.5px] uppercase tracking-wide text-slate-500">
                  <tr><th className="py-1.5 pr-2">{t('skdr.cfrList.no')}</th><th className="px-2">{t('skdr.cfrList.unit')}</th><th className="px-2">{t('skdr.cfrList.kab')}</th>
                    <th className="px-2">{t('skdr.cfrList.week')}</th><th className="px-2">{t('skdr.cfrList.date')}</th><th className="px-2">{t('skdr.cfrList.status')}</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 pr-2 font-mono font-semibold text-slate-800">{r.no_pe}</td>
                      <td className="px-2 text-slate-700">{r.unit || '—'}</td>
                      <td className="px-2 text-slate-700">{r.kabkota || '—'}<span className="text-slate-400">{r.province ? ` · ${r.province}` : ''}</span></td>
                      <td className="px-2 tabular-nums text-slate-600">{r.epi_week || '—'}</td>
                      <td className="px-2 tabular-nums text-slate-600">{dmy(r.date)}</td>
                      <td className="px-2"><span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span></td>
                      <td className="pl-2 text-right"><LihatButton onClick={() => open('pe', r.id)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-slate-500">{t('skdr.cfrList.empty')}</p>) : null}
          <p className="mt-3 text-[11px] text-slate-500">{t('skdr.cfrList.note')}</p>
        </div>
      </div>
      {modal}
    </div>
  )
}
