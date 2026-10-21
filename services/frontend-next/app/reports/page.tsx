'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardPlus, RefreshCw } from 'lucide-react'
import { fetchCaseReports, type CaseReport } from '@/lib/skdr-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const fmt = (n: number) => n.toLocaleString('id-ID')

export default function CaseReportsPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<CaseReport[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    fetchCaseReports().then(setRows).catch((e: Error) => setError(t('skdr.reports.loadFailed', { error: e.message })))
  }, [t])
  useEffect(load, [load])
  const th = 'px-3 py-2 text-left'

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">{t('skdr.reports.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('skdr.reports.subtitle', { count: rows.length })}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100">
            <RefreshCw className="h-4 w-4" /> {t('skdr.reports.refresh')}
          </button>
          <Link href="/form" className="inline-flex items-center gap-2 rounded-2xl bg-[#0060A9] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#004b85]">
            <ClipboardPlus className="h-4 w-4" /> {t('skdr.reports.newReport')}
          </Link>
        </div>
      </section>
      <article className="overflow-x-auto border border-[#cfe0f1] bg-white" style={{ borderRadius: '17px 17px 22px 17px' }}>
        {error ? <p className="p-5 text-sm text-red-600">{error}</p> : rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-400">{t('skdr.reports.empty')}</p> : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className={th}>{t('skdr.reports.colDate')}</th><th className={th}>{t('skdr.reports.colDisease')}</th>
                <th className={th}>{t('skdr.reports.colProvince')}</th><th className={th}>{t('skdr.reports.colKabkota')}</th>
                <th className={th}>{t('skdr.reports.colLocation')}</th>
                <th className="px-3 py-2 text-right">{t('skdr.reports.colCases')}</th><th className="px-3 py-2 text-right">{t('skdr.reports.colDeaths')}</th>
                <th className={th}>{t('skdr.reports.colCoords')}</th><th className={th}>{t('skdr.reports.colStatus')}</th>
                <th className={th}>{t('skdr.reports.colNotes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50/40">
                  <td className="whitespace-nowrap px-3 py-2">{r.report_date}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{r.disease}</td>
                  <td className="px-3 py-2">{r.province || '-'}</td>
                  <td className="px-3 py-2">{r.kabkota || '-'}</td>
                  <td className="px-3 py-2">{r.location}</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(r.cases)}</td>
                  <td className="px-3 py-2 text-right font-bold text-red-600">{fmt(r.deaths)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : t('skdr.reports.unmapped')}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${r.is_reviewed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                      {r.is_reviewed ? t('skdr.reports.reviewed') : t('skdr.reports.unreviewed')}
                    </span>
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-slate-500" title={r.notes || ''}>{r.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>
  )
}
