'use client'
// PR 023: panel analitik EBS di Dasbor Utama (data API EBS SKDR, ikut filter dasbor termasuk kategori). Tanpa angka contoh.
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState, SkeletonChart } from '@/components/ui/Skeleton'
import { nf, pf } from '@/lib/alert-skdr'
import { fetchEbsAnalitik, type EbsAnalitik } from '@/lib/ebs-analitik'

const COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#65a30d', '#0891b2', '#9a3412', '#64748b', '#475569']
const pct = (a: number, b: number) => (b ? (a * 100) / b : null)
function useEbs(query: Record<string, unknown>, extra: Record<string, string> = {}) {
  const key = JSON.stringify([query, extra])
  const [d, setD] = useState<EbsAnalitik | null>(null)
  const [err, setErr] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true; setErr(false); setD(null)
    fetchEbsAnalitik(query, extra).then((x) => alive && setD(x)).catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [key, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return { d, err, retry: () => setTick((x) => x + 1) }
}
const Card = ({ title, children, testId, note }: { title: string; children: React.ReactNode; testId?: string; note?: React.ReactNode }) => (
  <div className="skdr-card p-3" data-testid={testId}>
    <div className="mb-2 text-sm font-bold text-slate-800">{title}</div>{children}
    {note ? <p className="mt-2 text-[11px] text-slate-500">{note}</p> : null}
  </div>
)
const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-slate-500">{children}</p>
const th = 'px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500'
const td = 'px-2 py-1.5'

/** Ringkasan: jenis unit pelapor (donut, klik = filter panel ini), peringkat unit, unit diam. */
export function EbsUnitPanel({ query }: { query: Record<string, unknown> }) {
  const [ku, setKu] = useState('')
  const { d, err, retry } = useEbs(query, ku ? { kel_unit: ku } : {})
  const all = useEbs(query)
  if (err || all.err) return <ErrorState onRetry={() => { retry(); all.retry() }} />
  if (!d || !all.d) return <SkeletonChart height={260} />
  const kel = all.d.kel_unit
  return (
    <div className="space-y-3" data-testid="ebs-unit">
      <div className="text-sm font-bold text-slate-800">Unit pelapor EBS {ku ? <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs">Jenis unit: {ku} <button type="button" className="ml-1 font-bold" onClick={() => setKu('')} aria-label="Hapus filter jenis unit">×</button></span> : null}</div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Jenis unit pelapor" testId="ebs-kel-unit" note="Klik irisan untuk memfilter peringkat dan unit diam.">
          {!kel.length ? <Empty>Belum ada laporan EBS untuk filter ini.</Empty> : (
            <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><PieChart>
              <Pie data={kel} dataKey="reports" nameKey="kel_unit" innerRadius={55} outerRadius={90} isAnimationActive={false} onClick={(x: any) => setKu(x?.kel_unit === ku ? '' : x?.kel_unit || '')}>
                {kel.map((k, i) => <Cell key={k.kel_unit} fill={COLORS[i % COLORS.length]} opacity={!ku || ku === k.kel_unit ? 1 : 0.35} cursor="pointer" />)}
              </Pie>
              <Tooltip formatter={(v: any, _n: any, p: any) => [`${nf(Number(v))} laporan (${pf(pct(Number(v), all.d!.kpis.reports))})`, p.payload.kel_unit]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart></ResponsiveContainer></div>
          )}
        </Card>
        <Card title={`Unit pelapor teraktif`} testId="ebs-units">
          {!d.units.length ? <Empty>Tidak ada unit pada filter ini.</Empty> : (
            <div className="max-h-[260px] overflow-auto"><table className="w-full text-xs"><thead><tr><th className={th}>Unit</th><th className={th}>Jenis</th><th className={`${th} text-right`}>Laporan</th><th className={`${th} text-right`}>Kasus</th></tr></thead>
              <tbody>{d.units.map((u, i) => <tr key={i} className="border-b border-slate-100"><td className={td}><div className="font-semibold">{u.unit}</div><div className="text-[10px] text-slate-400">{u.kabkota}</div></td><td className={td}>{u.kel_unit}</td><td className={`${td} text-right font-mono`}>{nf(u.reports)}</td><td className={`${td} text-right font-mono`}>{nf(u.cases)}</td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card title={`Unit berhenti melapor (${nf(d.silent.count)} dari ${nf(d.silent.active_base)} unit aktif)`} testId="ebs-silent"
          note={`Unit yang biasanya melapor tetapi tidak mengirim laporan dalam ${d.config.silent_weeks} minggu terakhir.`}>
          {!d.silent.rows.length ? <Empty>Tidak ada unit yang berhenti melapor.</Empty> : (
            <div className="max-h-[260px] overflow-auto"><table className="w-full text-xs"><thead><tr><th className={th}>Unit</th><th className={`${th} text-right`}>Lap. sebelumnya</th><th className={th}>Terakhir</th></tr></thead>
              <tbody>{d.silent.rows.map((u, i) => <tr key={i} className="border-b border-slate-100"><td className={td}><div className="font-semibold">{u.unit}</div><div className="text-[10px] text-slate-400">{[u.kel_unit, u.kabkota].filter(Boolean).join(' · ')}</div></td><td className={`${td} text-right font-mono`}>{nf(u.base_reports)}</td><td className={`${td} whitespace-nowrap font-mono`}>{u.last}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    </div>
  )
}

/** Alert: funnel + tren status (sts_rumor), matriks diagnosa awal → verifikasi, KLB 3 status, histogram + flag, kelas tindakan/saran. */
export function EbsAlertPanel({ query }: { query: Record<string, unknown> }) {
  const { d, err, retry } = useEbs(query)
  const statuses = useMemo(() => (d?.funnel || []).map((f) => f.status), [d])
  const trend = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>()
    for (const r of d?.status_trend || []) { const row = m.get(r.week) || { week: r.week.slice(5) }; row[r.status] = r.count; m.set(r.week, row) }
    return [...m.values()]
  }, [d])
  const mx = useMemo(() => {
    const rows = d?.diagnosa_matrix || []
    const tot = new Map<string, number>(); const totV = new Map<string, number>()
    rows.forEach((r) => { tot.set(r.awal, (tot.get(r.awal) || 0) + r.count); totV.set(r.verifikasi, (totV.get(r.verifikasi) || 0) + r.count) })
    const awal = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0])
    const ver = [...totV.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0])
    const cell = new Map(rows.map((r) => [`${r.awal}|${r.verifikasi}`, r.count]))
    const changed = rows.filter((r) => r.verifikasi !== '(belum)' && r.awal.toLowerCase() !== r.verifikasi.toLowerCase()).reduce((a, r) => a + r.count, 0)
    const all = rows.filter((r) => r.verifikasi !== '(belum)').reduce((a, r) => a + r.count, 0)
    return { awal, ver, cell, tot, changed, all, max: Math.max(1, ...rows.map((r) => r.count)) }
  }, [d])
  if (err) return <ErrorState onRetry={retry} />
  if (!d) return <SkeletonChart />
  if (!d.kpis.reports) return <Empty>Belum ada laporan EBS untuk filter ini.</Empty>
  const top = d.funnel[0]?.count || 1
  return (
    <div className="space-y-3" data-testid="ebs-alert">
      <div className="text-sm font-bold text-slate-800">Laporan EBS</div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card title="Status laporan (funnel)" testId="ebs-funnel">
          <div className="space-y-1.5">{d.funnel.map((f, i) => (
            <div key={f.status} className="text-xs"><div className="flex justify-between"><span className="font-semibold">{f.status}</span><span className="font-mono">{nf(f.count)} · {pf(pct(f.count, d.kpis.reports))}</span></div>
              <div className="mt-0.5 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full" style={{ width: `${(f.count * 100) / top}%`, background: COLORS[i % COLORS.length] }} /></div></div>
          ))}</div>
        </Card>
        <Card title="Status laporan per minggu" testId="ebs-status-trend">
          <div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} width={44} />
            <Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />
            {statuses.map((s, i) => <Bar key={s} dataKey={s} stackId="s" fill={COLORS[i % COLORS.length]} isAnimationActive={false} />)}
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>
      <Card title={`Diagnosa awal → hasil verifikasi (${pf(pct(mx.changed, mx.all))} berubah dari ${nf(mx.all)} laporan terverifikasi)`} testId="ebs-matrix"
        note="Baris: diagnosa saat laporan masuk. Kolom: diagnosa setelah diverifikasi.">
        <div className="overflow-auto"><table className="text-[11px]"><thead><tr><th className={th}>Awal → Verifikasi</th>{mx.ver.map((v) => <th key={v} className="max-w-[90px] px-1 py-1 text-left align-bottom font-semibold text-slate-500" title={v}><div className="line-clamp-3">{v}</div></th>)}</tr></thead>
          <tbody>{mx.awal.map((a) => <tr key={a}><td className="whitespace-nowrap pr-2 font-semibold" title={a}>{a.length > 34 ? `${a.slice(0, 34)}…` : a}</td>
            {mx.ver.map((v) => { const c = mx.cell.get(`${a}|${v}`) || 0; const diag = a.toLowerCase() === v.toLowerCase()
              return <td key={v} className="h-7 min-w-[54px] px-1 text-center font-mono" title={`${a} → ${v}: ${nf(c)}`}
                style={{ background: c ? (diag ? `rgba(15,118,110,${0.15 + 0.85 * Math.sqrt(c / mx.max)})` : `rgba(217,119,6,${0.15 + 0.85 * Math.sqrt(c / mx.max)})`) : undefined, color: c / mx.max > 0.4 ? 'white' : undefined }}>{c ? nf(c) : ''}</td> })}</tr>)}</tbody></table></div>
      </Card>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Penetapan KLB" testId="ebs-klb">
          <table className="w-full text-xs"><thead><tr><th className={th}>Status</th><th className={`${th} text-right`}>Laporan</th><th className={`${th} text-right`}>Kasus</th><th className={`${th} text-right`}>Kematian</th></tr></thead>
            <tbody>{d.klb.map((k) => <tr key={k.code} className="border-b border-slate-100"><td className={`${td} font-semibold ${k.code === '1' ? 'text-red-600' : ''}`}>{k.label}</td><td className={`${td} text-right font-mono`}>{nf(k.reports)}</td><td className={`${td} text-right font-mono`}>{nf(k.cases)}</td><td className={`${td} text-right font-mono`}>{nf(k.deaths)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Jumlah kasus per laporan" testId="ebs-hist" >
          <div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.histogram.map((h) => ({ ...h, label: h.to === null ? `≥${h.from}` : h.from === h.to ? `${h.from}` : `${h.from}–${h.to}` }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis scale="sqrt" tick={{ fontSize: 10 }} width={48} /><Tooltip formatter={(v: any) => nf(Number(v))} />
            <Bar dataKey="count" name="Laporan" fill="#0f766e" isAnimationActive={false} />
          </BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Perlu dicek di sumber" testId="ebs-flags" note="Laporan dengan angka yang tidak biasa.">
          {!d.flags.length ? <Empty>Tidak ada.</Empty> : (
            <div className="max-h-[220px] overflow-auto"><table className="w-full text-[11px]"><tbody>{d.flags.map((f, i) => (
              <tr key={i} className="border-b border-slate-100"><td className={td}><div className="font-mono">{f.no_ebs}</div><div className="text-slate-400">{f.date} · {f.kabkota}</div></td><td className={td}>{f.disease}</td>
                <td className={`${td} text-right font-mono`}>{nf(f.cases)} / {nf(f.deaths)}</td><td className={`${td} ${f.reason.startsWith('kematian') || f.reason.startsWith('di atas') ? 'text-red-600' : 'text-amber-700'}`}>{f.reason}</td></tr>))}</tbody></table></div>
          )}
        </Card>
      </div>
      {d.text_classes.length ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{d.text_classes.map((tc) => (
          <Card key={tc.field} title={tc.field === 'tindakan' ? 'Jenis tindakan yang dilaporkan' : 'Kebutuhan dukungan (saran)'} testId={`ebs-${tc.field}`}
            note="Satu laporan bisa masuk lebih dari satu kelompok.">
            <div className="h-[220px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={tc.classes} layout="vertical" margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="kelas" width={170} tick={{ fontSize: 10 }} interval={0} />
              <Tooltip formatter={(v: any) => `${nf(Number(v))} laporan (${pf(pct(Number(v), tc.filled))})`} /><Bar dataKey="count" fill="#2563eb" isAnimationActive={false} />
            </BarChart></ResponsiveContainer></div>
          </Card>))}</div>
      ) : null}
    </div>
  )
}

/** 7-1-7: tahap Respons EBS dari update_date − create_date. */
export function EbsResponsCard({ query }: { query: Record<string, unknown> }) {
  const { d, err, retry } = useEbs(query)
  if (err) return <ErrorState onRetry={retry} />
  if (!d) return <SkeletonChart height={140} />
  const r = d.respons
  const tot = r.on_time + r.late + r.missing || 1
  return (
    <div className="space-y-2" data-testid="ebs-respons">
      <div className="text-sm font-bold text-slate-800">EBS · Respons ≤ {d.config.respons_target_days} hari</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="skdr-card p-4">
          <div className="text-3xl font-black text-slate-900">{pf(r.pct)}</div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {[{ v: r.on_time, c: 'bg-emerald-500' }, { v: r.late, c: 'bg-red-500' }, { v: r.missing, c: 'bg-slate-300' }].map((p, i) => p.v > 0 ? <span key={i} className={p.c} style={{ width: `${(p.v * 100) / tot}%` }} /> : null)}
          </div>
          <div className="mt-1 text-xs text-slate-500">{nf(r.on_time)} tepat · {nf(r.late)} terlambat · {nf(r.missing)} belum diperbarui{r.median_days !== null ? ` · median ${r.median_days.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari` : ''}</div>
          <p className="mt-2 text-[11px] text-slate-500">Lama respons: dari laporan masuk sampai pertama ditindaklanjuti.</p>
        </div>
        <div className="skdr-card overflow-auto p-3 md:col-span-2">
          <table className="w-full text-xs"><thead><tr><th className={th}>Penyakit</th><th className={`${th} text-right`}>Laporan</th><th className={`${th} text-right`}>Diperbarui</th><th className={`${th} text-right`}>≤ {d.config.respons_target_days} hari</th><th className={`${th} text-right`}>Median</th></tr></thead>
            <tbody>{r.by_disease.map((x) => <tr key={x.disease} className="border-b border-slate-100"><td className={`${td} font-semibold`}>{x.disease}</td><td className={`${td} text-right font-mono`}>{nf(x.reports)}</td><td className={`${td} text-right font-mono`}>{nf(x.with_update)}</td><td className={`${td} text-right`}>{pf(x.pct)}</td><td className={`${td} text-right font-mono`}>{x.median_days === null ? '—' : x.median_days.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  )
}

/** Tren: laporan EBS per minggu dibanding tahun lalu. */
export function EbsPrevYear({ query }: { query: Record<string, unknown> }) {
  const { d, err, retry } = useEbs(query)
  if (err) return <ErrorState onRetry={retry} />
  if (!d) return <SkeletonChart height={220} />
  return (
    <Card title="Laporan EBS per minggu dibanding tahun lalu" testId="ebs-prev-year"
      note={d.prev_available ? 'Garis abu-abu: minggu yang sama tahun sebelumnya.' : 'Data tahun sebelumnya belum ada untuk periode ini.'}>
      {!d.weekly.length ? <Empty>Belum ada laporan EBS untuk periode ini.</Empty> : (
        <div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={d.weekly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} width={48} />
          <Tooltip formatter={(v: any) => nf(Number(v))} /><Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="reports" name="Laporan EBS" fill="#d97706" isAnimationActive={false} />
          {d.prev_available ? <Line dataKey="prev_reports" name="Tahun lalu" stroke="#64748b" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} /> : null}
        </ComposedChart></ResponsiveContainer></div>
      )}
    </Card>
  )
}
