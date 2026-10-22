'use client'
// PR 022: Epi curve (Alert SKDR mingguan) — kasus per minggu epid ditumpuk per penyakit / kategori, kematian di grafik bawah,
// rata-rata bergerak, ambang (rerata + k·SD minggu sebelumnya) dan pembanding tahun lalu. Ikut filter dasbor (termasuk kategori).
import { useEffect, useMemo, useState } from 'react'
import { Bar, Brush, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { fetchFrom } from '@/lib/api'
import { ErrorState, SkeletonChart } from '@/components/ui/Skeleton'
import { nf, pf, toQs, type Ci } from '@/lib/alert-skdr'

type Wk = { year: number; week: number; label: string; cases: number; deaths: number; alerts: number; klb_alerts: number; ma: number | null; threshold: number | null; above: boolean; prev_cases: number | null; prev_deaths: number | null }
type Epi = { group: string; weeks: Wk[]; groups: { label: string; cases: number[]; deaths: number[]; total_cases: number; total_deaths: number }[]
  totals: { cases: number; deaths: number; cfr: Ci }; prev_available: boolean; prev_year: number | null; config: { ma_weeks: number; baseline_weeks: number; sd_k: number; max_kasus_per_alert: number | null }
  outliers: Outlier[]; outliers_prev: Outlier[] }
type Outlier = { year: number; week: number; disease: string; kabkota: string | null; province: string | null; cases: number; deaths: number }
const COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#65a30d', '#0891b2', '#9a3412', '#64748b']

function Toggle({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${on ? 'border-slate-300 bg-slate-50 font-semibold text-slate-800' : 'border-slate-200 text-slate-500'}`}>
      <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={on} onChange={(e) => set(e.target.checked)} />{children}
    </label>
  )
}

export default function EpiCurve({ query }: { query: Record<string, unknown> }) {
  const [group, setGroup] = useState<'disease' | 'kategori' | 'total'>('disease')
  const [stack, setStack] = useState(true)
  const [showMa, setShowMa] = useState(true)
  const [showThr, setShowThr] = useState(true)
  const [showPrev, setShowPrev] = useState(true)
  const [showDeaths, setShowDeaths] = useState(true)
  const [d, setD] = useState<Epi | null>(null)
  const [err, setErr] = useState(false)
  const [tick, setTick] = useState(0)
  const qs = toQs({ ...query, group })
  useEffect(() => {
    let alive = true; setErr(false); setD(null)
    fetchFrom<Epi>(`/api/v1/epicurve?${qs}`).then((x) => alive && setD(x)).catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [qs, tick])
  const stacked = stack && group !== 'total'
  const rows = useMemo(() => (d?.weeks || []).map((w, i) => {
    const r: Record<string, number | string | null | boolean> = { ...w }
    if (stacked) d!.groups.forEach((g, k) => { r[`c${k}`] = g.cases[i]; r[`d${k}`] = g.deaths[i] })
    r.alertDot = w.above ? w.cases : null
    return r
  }), [d, stacked])
  const above = (d?.weeks || []).filter((w) => w.above)
  const csv = () => {
    if (!d) return
    const head = ['tahun', 'minggu', 'kasus', 'kematian', 'alert', 'alert_klb', `rata2_${d.config.ma_weeks}mg`, 'ambang', 'di_atas_ambang', 'kasus_tahun_lalu', 'kematian_tahun_lalu', ...d.groups.map((g) => `kasus_${g.label}`)]
    const lines = d.weeks.map((w, i) => [w.year, w.week, w.cases, w.deaths, w.alerts, w.klb_alerts, w.ma?.toFixed(2) ?? '', w.threshold?.toFixed(2) ?? '', w.above ? 1 : 0, w.prev_cases ?? '', w.prev_deaths ?? '', ...d.groups.map((g) => g.cases[i])].join(','))
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `epi-curve-${group}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  if (err) return <ErrorState onRetry={() => setTick((x) => x + 1)} />
  if (!d) return <SkeletonChart height={360} />
  return (
    <div className="skdr-card p-4" data-testid="epi-curve">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-sm font-bold text-slate-800">Epi curve per minggu epidemiologi</div>
        <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" aria-label="Kelompokkan menurut" data-testid="epi-group">
          <option value="disease">Per penyakit</option><option value="kategori">Per kategori</option><option value="total">Total</option>
        </select>
        {group !== 'total' ? <Toggle on={stack} set={setStack}>Tumpuk</Toggle> : null}
        <Toggle on={showMa} set={setShowMa}>Rata-rata {d.config.ma_weeks} minggu</Toggle>
        <Toggle on={showThr} set={setShowThr}>Ambang alert</Toggle>
        <Toggle on={showPrev} set={setShowPrev}>Tahun {d.prev_year ?? 'lalu'}</Toggle>
        <Toggle on={showDeaths} set={setShowDeaths}>Kematian</Toggle>
        <button type="button" onClick={csv} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />CSV</button>
      </div>
      {!d.weeks.length ? <p className="py-10 text-center text-sm text-slate-500">Belum ada data Alert SKDR untuk filter ini.</p> : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
            <div><b className="text-lg text-slate-900">{nf(d.totals.cases)}</b> kasus</div>
            <div><b className="text-lg text-red-600">{nf(d.totals.deaths)}</b> kematian</div>
            <div><b className="text-lg text-slate-900">{pf(d.totals.cfr.pct)}</b> CFR (IK 95% {pf(d.totals.cfr.ci_low)}–{pf(d.totals.cfr.ci_high)})</div>
            <div><b className={`text-lg ${above.length ? 'text-amber-600' : 'text-slate-900'}`}>{nf(above.length)}</b> minggu di atas ambang</div>
          </div>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} syncId="epi" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={52} />
                <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {stacked ? d.groups.map((g, k) => <Bar key={g.label} dataKey={`c${k}`} name={g.label} stackId="c" fill={COLORS[k % COLORS.length]} isAnimationActive={false} />)
                  : <Bar dataKey="cases" name="Kasus" fill={COLORS[0]} isAnimationActive={false} />}
                {showPrev && d.prev_available ? <Line dataKey="prev_cases" name={`Kasus ${d.prev_year}`} stroke="#94a3b8" strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} /> : null}
                {showMa ? <Line dataKey="ma" name={`Rata-rata ${d.config.ma_weeks} minggu`} stroke="#0f172a" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls /> : null}
                {showThr ? <Line dataKey="threshold" name={'Ambang'} stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls /> : null}
                {showThr ? <Line dataKey="alertDot" name="Di atas ambang" stroke="none" dot={{ r: 4, fill: '#dc2626' }} legendType="circle" isAnimationActive={false} /> : null}
                <Brush dataKey="label" height={18} travellerWidth={8} stroke="#94a3b8" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {showDeaths ? (
            <div className="mt-3 h-[150px]" data-testid="epi-deaths">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} syncId="epi" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={52} />
                  <Tooltip />
                  {stacked ? d.groups.map((g, k) => <Bar key={g.label} dataKey={`d${k}`} name={`Kematian ${g.label}`} stackId="d" fill={COLORS[k % COLORS.length]} fillOpacity={0.75} isAnimationActive={false} />)
                    : <Bar dataKey="deaths" name="Kematian" fill="#dc2626" isAnimationActive={false} />}
                  {showPrev && d.prev_available ? <Line dataKey="prev_deaths" name={`Kematian ${d.prev_year}`} stroke="#94a3b8" strokeDasharray="2 3" dot={false} isAnimationActive={false} /> : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-slate-500">
            Sumber: SKDR – Alert mingguan. Garis ambang menandai minggu dengan kasus lebih tinggi dari biasanya.
            {!d.prev_available ? ` Data tahun ${d.prev_year ?? 'sebelumnya'} belum tersinkron, jadi garis pembanding tidak ditampilkan.` : ''}
          </p>
          {d.outliers.length || d.outliers_prev.length ? (
            <div className="mt-2 border-l-2 border-amber-400 bg-amber-50/60 px-3 py-1.5 text-[11px] text-amber-900" data-testid="epi-outliers">
              <b>Perlu dicek di sumber:</b> {nf(d.outliers.length + d.outliers_prev.length)} laporan dengan angka tidak wajar tidak dimasukkan ke grafik:{' '}
              {[...d.outliers, ...d.outliers_prev].slice(0, 6).map((o) => `${o.disease} ${o.kabkota || o.province || ''} ${o.year}-M${o.week} (${nf(o.cases)})`).join(' · ')}
            </div>
          ) : null}
          {above.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]" data-testid="epi-above">
              <span className="font-bold text-red-700">Minggu di atas ambang:</span>
              {above.map((w) => <span key={w.label} className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{w.label} · {nf(w.cases)} (ambang {nf(Math.round(w.threshold ?? 0))})</span>)}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
