'use client'
// PR 021: Klaster - KLB dari Alert SKDR mingguan (dikelompokkan per kab/kota + penyakit) dan laporan EBS bertanda KLB / klaster tidak lazim.
import { Waypoints } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState } from '@/components/ui/Skeleton'
import { tableHeadCls, thCls } from '@/components/master/MasterUi'
import { useEffect, useState } from 'react'
import { fetchFrom } from '@/lib/api'

type T = {
  kpis: { alerts: number; klb_alerts: number; klb_cases: number; klb_deaths: number; clusters: number; respon24: number; ebs_klb: number; ebs_klb_cases: number; ebs_klb_deaths: number }
  clusters: { disease: string; kabkota: string | null; province: string | null; alerts: number; units: number; cases: number; deaths: number; first_week: string; last_week: string; respon24: number }[]
  by_disease: { disease: string; alerts: number; klb_alerts: number; klb_cases: number }[]
  trend: { year: number; week: number; alerts: number; klb_alerts: number }[]
  ebs: { no_ebs: string | null; date: string | null; disease: string | null; kabkota: string | null; province: string | null; cases: number; deaths: number; status: string | null }[]
}
const nf = (n: number) => (n ?? 0).toLocaleString('id-ID')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '-')

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="skdr-card p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-black text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}

const PER = 15
const page = <X,>(rows: X[], p: number) => rows.slice(p * PER, p * PER + PER)
/** PR 022: pager for the cluster / EBS lists */
function Pager({ n, p, set }: { n: number; p: number; set: (v: number) => void }) {
  const last = Math.max(0, Math.ceil(n / PER) - 1)
  if (n <= PER) return null
  const btn = 'rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold disabled:opacity-40'
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500" data-testid="pager">
      <button type="button" className={btn} disabled={p <= 0} onClick={() => set(p - 1)}>‹ Sebelumnya</button>
      <span>{nf(p * PER + 1)}–{nf(Math.min(n, p * PER + PER))} dari {nf(n)}</span>
      <button type="button" className={btn} disabled={p >= last} onClick={() => set(p + 1)}>Berikutnya ›</button>
    </div>
  )
}

/** PR 021: seksi Klaster & KLB - dipakai di Dasbor Utama / dasbor kategori (query = filter dasbor) dan halaman /klaster. */
export default function KlasterSection({ query, showHeader = true }: { query: Record<string, unknown>; showHeader?: boolean }) {
  const [d, setD] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const [pg, setPg] = useState(0)
  const [pgE, setPgE] = useState(0)
  const [cari, setCari] = useState('')
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)])).toString()
  const load = () => { setError(false); fetchFrom<T>(`/api/v1/klaster?${qs}`).then(setD).catch(() => setError(true)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [qs])
  const k = d?.kpis
  const q = cari.trim().toLowerCase()
  const filt = (rows: T['clusters']) => (q ? rows.filter((r) => [r.disease, r.kabkota, r.province].some((x) => (x || '').toLowerCase().includes(q))) : rows)
  const trend = (d?.trend || []).map((r) => ({ ...r, label: `M${r.week}` }))
  return (
    <section id="section-klaster" data-testid="section-klaster" className="skdr-section w-full space-y-4 scroll-mt-24">
      {showHeader ? <div><div className="skdr-eyebrow">Klaster</div><h2 className="skdr-section-title">Klaster & KLB</h2><p className="skdr-section-desc">Klaster KLB dari Alert SKDR (per kab/kota dan penyakit) dan laporan EBS bertanda KLB.</p></div> : null}
      {error ? <ErrorState onRetry={load} /> : null}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Klaster KLB" value={k ? nf(k.clusters) : '...'} sub="kab/kota x penyakit" />
        <Kpi label="Alert KLB" value={k ? nf(k.klb_alerts) : '...'} sub={k ? `${pct(k.klb_alerts, k.alerts)} dari ${nf(k.alerts)} alert` : undefined} />
        <Kpi label="Kasus KLB" value={k ? nf(k.klb_cases) : '...'} sub={k ? `${nf(k.klb_deaths)} kematian` : undefined} />
        <Kpi label="Respons 24 jam" value={k ? pct(k.respon24, k.alerts) : '...'} sub={k ? `${nf(k.respon24)} alert direspons` : undefined} />
        <Kpi label="EBS KLB / klaster" value={k ? nf(k.ebs_klb) : '...'} sub={k ? `${nf(k.ebs_klb_cases)} kasus, ${nf(k.ebs_klb_deaths)} kematian` : undefined} />
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="skdr-card p-4">
          <div className="skdr-eyebrow">Tren mingguan</div>
          <h2 className="skdr-section-title">Alert KLB per minggu epidemiologi</h2>
          <div className="mt-3 h-72"><ResponsiveContainer><BarChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
            <Bar dataKey="klb_alerts" name="Alert KLB" fill="#DC2626" /></BarChart></ResponsiveContainer></div>
        </article>
        <article className="skdr-card p-4">
          <div className="skdr-eyebrow">Per penyakit</div>
          <h2 className="skdr-section-title">Penyakit dengan alert KLB terbanyak</h2>
          <div className="mt-3 h-72"><ResponsiveContainer><BarChart data={d?.by_disease || []} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={12} /><YAxis type="category" dataKey="disease" width={150} fontSize={11} /><Tooltip /><Legend />
            <Bar dataKey="klb_alerts" name="Alert KLB" fill="#DC2626" /><Bar dataKey="klb_cases" name="Kasus KLB" fill="rgb(var(--brand-600))" /></BarChart></ResponsiveContainer></div>
        </article>
      </section>
      <section className="skdr-card p-4">
        <div className="flex items-center gap-2"><Waypoints className="h-4 w-4 text-primary" /><h2 className="skdr-section-title">Daftar klaster KLB</h2></div>
        <p className="skdr-section-desc">Satu baris = satu kabupaten/kota dan satu penyakit dengan alert KLB pada periode terpilih, diurutkan dari kasus terbanyak.</p>
        <input value={cari} onChange={(e) => { setCari(e.target.value); setPg(0) }} placeholder="Cari penyakit / kab/kota / provinsi" className="mt-3 w-full max-w-sm rounded-lg border border-slate-200 px-3 py-1.5 text-xs" data-testid="klaster-cari" />
        <div className="mt-3 max-h-[560px] overflow-auto"><table className="skdr-table text-left text-xs"><thead><tr className={tableHeadCls}>
          <th className={thCls}>Penyakit</th><th className={thCls}>Kab/Kota</th><th className={thCls}>Provinsi</th><th className={`${thCls} text-right`}>Alert</th><th className={`${thCls} text-right`}>Unit</th>
          <th className={`${thCls} text-right`}>Kasus</th><th className={`${thCls} text-right`}>Kematian</th><th className={thCls}>Minggu</th><th className={`${thCls} text-right`}>Respons 24 jam</th></tr></thead>
          <tbody>{page(filt(d?.clusters || []), pg).map((r, i) => <tr key={i}>
            <td className="px-4 py-2 font-medium">{r.disease}</td><td className="px-4 py-2">{r.kabkota || '-'}</td><td className="px-4 py-2">{r.province || '-'}</td>
            <td className="px-4 py-2 text-right font-mono">{nf(r.alerts)}</td><td className="px-4 py-2 text-right font-mono">{nf(r.units)}</td>
            <td className="px-4 py-2 text-right font-mono font-bold">{nf(r.cases)}</td><td className="px-4 py-2 text-right font-mono">{nf(r.deaths)}</td>
            <td className="whitespace-nowrap px-4 py-2 font-mono">{r.first_week === r.last_week ? r.first_week : `${r.first_week} s.d. ${r.last_week}`}</td>
            <td className="px-4 py-2 text-right font-mono">{pct(r.respon24, r.alerts)}</td></tr>)}</tbody></table>
          {d && !d.clusters.length ? <div className="p-6 text-center text-sm text-slate-500">Tidak ada alert KLB pada periode dan filter ini.</div> : null}</div>
        <Pager n={filt(d?.clusters || []).length} p={pg} set={setPg} />
      </section>
      <section className="skdr-card p-4">
        <h2 className="skdr-section-title">Laporan EBS bertanda KLB atau klaster tidak lazim</h2>
        <div className="mt-3 max-h-[560px] overflow-auto"><table className="skdr-table text-left text-xs"><thead><tr className={tableHeadCls}>
          <th className={thCls}>No. EBS</th><th className={thCls}>Tanggal</th><th className={thCls}>Penyakit</th><th className={thCls}>Wilayah</th><th className={`${thCls} text-right`}>Kasus</th><th className={`${thCls} text-right`}>Kematian</th><th className={thCls}>Status</th></tr></thead>
          <tbody>{page(d?.ebs || [], pgE).map((r, i) => <tr key={i}>
            <td className="px-4 py-2 font-mono">{r.no_ebs || '-'}</td><td className="whitespace-nowrap px-4 py-2 font-mono">{r.date || '-'}</td><td className="px-4 py-2 font-medium">{r.disease || '-'}</td>
            <td className="px-4 py-2">{[r.kabkota, r.province].filter(Boolean).join(', ') || '-'}</td><td className="px-4 py-2 text-right font-mono">{nf(r.cases)}</td><td className="px-4 py-2 text-right font-mono">{nf(r.deaths)}</td>
            <td className="px-4 py-2">{r.status || '-'}</td></tr>)}</tbody></table>
          {d && !d.ebs.length ? <div className="p-6 text-center text-sm text-slate-500">Tidak ada laporan EBS bertanda KLB pada periode dan filter ini.</div> : null}</div>
        <Pager n={(d?.ebs || []).length} p={pgE} set={setPgE} />
      </section>
    </section>
  )
}
