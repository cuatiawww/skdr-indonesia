'use client'
// PR 021: Laboratorium - pemeriksaan spesimen dan hasil laboratorium dari Alert SKDR mingguan (+ diagnosa EBS yang menyebut hasil lab).
import { FlaskConical } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState } from '@/components/ui/Skeleton'
import { tableHeadCls, thCls } from '@/components/master/MasterUi'
import { useEffect, useState } from 'react'
import { fetchFrom } from '@/lib/api'

type T = {
  kpis: { alerts: number; with_specimen: number; with_result: number; positive: number; negative: number; other: number; cases: number; units_with_specimen: number; in_process: number }
  by_disease: { disease: string; alerts: number; with_specimen: number; positive: number; negative: number; other: number }[]
  by_province: { province: string; alerts: number; with_specimen: number; positive: number }[]
  trend: { year: number; week: number; alerts: number; with_specimen: number; positive: number }[]
  specimens: { specimen: string | null; count: number }[]
  recent: { year: number; week: number; disease: string; unit: string | null; kabkota: string | null; province: string | null; specimen: string | null; result: string | null; result_class: string; cases: number }[]
  ebs_lab: { diagnosa: string; reports: number; cases: number }[]
  /** PR 028: province × disease matrix (newer backends only) */
  by_province_disease?: { provinces: string[]; diseases: string[]; cells: ({ alerts: number; with_specimen: number; positive: number } | null)[][] }
}
export type LabData = T
const nf = (n: number) => (n ?? 0).toLocaleString('id-ID')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '-')
const CLS: Record<string, string> = { positif: 'bg-red-50 text-red-700 border-red-200', negatif: 'bg-emerald-50 text-emerald-700 border-emerald-200', lainnya: 'bg-slate-50 text-slate-600 border-slate-200', proses: 'bg-blue-50 text-blue-700 border-blue-200', belum: 'bg-amber-50 text-amber-700 border-amber-200' }
const CLS_LABEL: Record<string, string> = { positif: 'Positif', negatif: 'Negatif', proses: 'Dalam proses', lainnya: 'Hasil lain', belum: 'Belum ada hasil' }

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="skdr-card p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-black text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}

/** PR 021: seksi Laboratorium - dipakai di Dasbor Utama / dasbor kategori (query = filter dasbor) dan halaman /laboratorium. */
/** PR 028: `data` = already-loaded /laboratorium response (Zoonosis Lite modal); then this section does not fetch again. */
export default function LabSection({ query, showHeader = true, data }: { query: Record<string, unknown>; showHeader?: boolean; data?: T | null }) {
  const [own, setD] = useState<T | null>(null)
  const d = data !== undefined ? data : own
  const [error, setError] = useState(false)
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)])).toString()
  const load = () => { if (data !== undefined) return; setError(false); fetchFrom<T>(`/api/v1/laboratorium?${qs}`).then(setD).catch(() => setError(true)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [qs])
  const k = d?.kpis
  const trend = (d?.trend || []).map((r) => ({ ...r, label: `M${r.week}` }))
  return (
    <section id="section-laboratorium" data-testid="section-laboratorium" className="skdr-section w-full space-y-4 scroll-mt-24">
      {showHeader ? <div><div className="skdr-eyebrow">Laboratorium</div><h2 className="skdr-section-title">Laboratorium</h2><p className="skdr-section-desc">Spesimen diperiksa dan hasil laboratorium dari Alert SKDR mingguan.</p></div> : null}
      {error ? <ErrorState onRetry={load} /> : null}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Alert SKDR" value={k ? nf(k.alerts) : '...'} sub={k ? `${nf(k.cases)} kasus` : undefined} />
        <Kpi label="Spesimen diperiksa" value={k ? nf(k.with_specimen) : '...'} sub={k ? `${pct(k.with_specimen, k.alerts)} dari alert, ${nf(k.units_with_specimen)} unit` : undefined} />
        <Kpi label="Ada hasil" value={k ? nf(k.with_result) : '...'} sub={k ? pct(k.with_result, k.with_specimen) + ' dari spesimen' : undefined} />
        <Kpi label="Positif" value={k ? nf(k.positive) : '...'} sub={k ? pct(k.positive, k.with_result) + ' dari hasil' : undefined} />
        <Kpi label="Negatif" value={k ? nf(k.negative) : '...'} sub={k ? `${nf(k.in_process)} masih dalam proses` : undefined} />
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="skdr-card p-4">
          <div className="skdr-eyebrow">Tren mingguan</div>
          <h2 className="skdr-section-title">Alert, spesimen, dan hasil positif per minggu epidemiologi</h2>
          <div className="mt-3 h-72"><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
            <Line type="monotone" dataKey="alerts" name="Alert" stroke="#94a3b8" dot={false} />
            <Line type="monotone" dataKey="with_specimen" name="Spesimen" stroke="rgb(var(--brand-600))" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="positive" name="Positif" stroke="#DC2626" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div>
        </article>
        <article className="skdr-card p-4">
          <div className="skdr-eyebrow">Per penyakit</div>
          <h2 className="skdr-section-title">Spesimen dan hasil per penyakit</h2>
          <div className="mt-3 h-72"><ResponsiveContainer><BarChart data={d?.by_disease || []} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={12} /><YAxis type="category" dataKey="disease" width={150} fontSize={11} /><Tooltip /><Legend />
            <Bar dataKey="positive" name="Positif" stackId="a" fill="#DC2626" /><Bar dataKey="negative" name="Negatif" stackId="a" fill="#10B981" /><Bar dataKey="other" name="Dalam proses / lain" stackId="a" fill="#94a3b8" /></BarChart></ResponsiveContainer></div>
        </article>
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="skdr-card p-4 xl:col-span-2">
          <div className="skdr-eyebrow">Per provinsi</div>
          <h2 className="skdr-section-title">Provinsi dengan spesimen terbanyak</h2>
          <table className="skdr-table mt-3 text-left text-xs"><thead><tr className={tableHeadCls}><th className={thCls}>Provinsi</th><th className={`${thCls} text-right`}>Alert</th><th className={`${thCls} text-right`}>Spesimen</th><th className={`${thCls} text-right`}>Positif</th></tr></thead>
            <tbody>{(d?.by_province || []).map((r) => <tr key={r.province}><td className="px-4 py-2 font-medium">{r.province}</td><td className="px-4 py-2 text-right font-mono">{nf(r.alerts)}</td><td className="px-4 py-2 text-right font-mono">{nf(r.with_specimen)}</td><td className="px-4 py-2 text-right font-mono">{nf(r.positive)}</td></tr>)}</tbody></table>
        </article>
        <article className="skdr-card p-4">
          <div className="skdr-eyebrow">Status pemeriksaan spesimen</div>
          <h2 className="skdr-section-title">Nilai &quot;spesimen diperiksa&quot; pada alert</h2>
          <p className="mt-1 text-[11px] text-slate-500">Status pemeriksaan spesimen pada alert yang memiliki spesimen.</p>
          <ul className="mt-3 space-y-1.5 text-xs">{(d?.specimens || []).map((r, i) => <li key={i} className="flex justify-between gap-2 border-b border-slate-100 pb-1"><span className="truncate" title={r.specimen || ''}>{r.specimen || '-'}</span><span className="font-mono font-bold">{nf(r.count)}</span></li>)}</ul>
          {(d?.ebs_lab || []).length ? <div className="mt-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Laporan EBS dengan hasil laboratorium</div>
            <ul className="mt-2 space-y-1 text-xs">{d!.ebs_lab.map((r) => <li key={r.diagnosa} className="flex justify-between gap-2"><span>{r.diagnosa}</span><span className="font-mono">{nf(r.reports)} laporan</span></li>)}</ul></div> : null}
        </article>
      </section>
      <section className="skdr-card p-4">
        <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /><h2 className="skdr-section-title">Pemeriksaan terbaru</h2></div>
        <p className="skdr-section-desc">50 alert terbaru yang mencatat spesimen. Nama orang disamarkan.</p>
        <div className="mt-3 overflow-x-auto"><table className="skdr-table text-left text-xs"><thead><tr className={tableHeadCls}>
          <th className={thCls}>Minggu</th><th className={thCls}>Penyakit</th><th className={thCls}>Unit / Wilayah</th><th className={thCls}>Spesimen</th><th className={thCls}>Hasil</th><th className={`${thCls} text-right`}>Kasus</th></tr></thead>
          <tbody>{(d?.recent || []).map((r, i) => <tr key={i}>
            <td className="whitespace-nowrap px-4 py-2 font-mono">{r.year}-M{r.week}</td><td className="px-4 py-2 font-medium">{r.disease}</td>
            <td className="px-4 py-2"><div>{r.unit || '-'}</div><div className="text-[11px] text-slate-400">{[r.kabkota, r.province].filter(Boolean).join(', ')}</div></td>
            <td className="max-w-xs px-4 py-2">{r.specimen || '-'}</td>
            <td className="max-w-sm px-4 py-2"><span className={`mr-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${CLS[r.result_class] || CLS.lainnya}`}>{CLS_LABEL[r.result_class] || r.result_class}</span>{r.result || ''}</td>
            <td className="px-4 py-2 text-right font-mono">{nf(r.cases)}</td></tr>)}</tbody></table></div>
      </section>
    </section>
  )
}
