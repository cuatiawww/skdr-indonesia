'use client'
// PR 029: Manajemen Akses → Log Akses (login/logout, perubahan pengguna & peran), 200 baris terbaru.
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { accessSend, fmtDateTime, type AccessLogRow } from '@/lib/access-api'
import { TableState, tableHeadCls, thCls } from '@/components/master/MasterUi'

export default function LogAksesPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AccessLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows((await accessSend<{ data: AccessLogRow[] }>('GET', '/api/v1/access-log?limit=200')).data || []) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid="access-log-page">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('skdr.access.log.title')}</h1>
          <p className="text-xs text-slate-500">{t('skdr.access.log.subtitle')}</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('skdr.master.refresh')}
        </button>
      </div>
      <TableState loading={loading} error={error} empty={rows.length === 0} />
      {rows.length > 0 && !error && (
        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead><tr className={tableHeadCls}>
              <th className={thCls}>{t('common.date')}</th>
              <th className={thCls}>{t('skdr.access.users.username')}</th>
              <th className={thCls}>{t('skdr.access.log.action')}</th>
              <th className={thCls}>{t('skdr.access.log.detail')}</th>
              <th className={thCls}>IP</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{fmtDateTime(r.created_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{r.username || '—'}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.action.includes('FAILED') ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'}`}>{r.action}</span></td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{Object.keys(r.detail || {}).length ? JSON.stringify(r.detail) : '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
