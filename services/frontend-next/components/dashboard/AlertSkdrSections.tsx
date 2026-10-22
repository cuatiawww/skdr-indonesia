'use client'
// PR 022: seksi CFR, Alert dan 7-1-7 Dasbor Utama dari Alert SKDR mingguan (/api/v1/alert-skdr), ikut filter dasbor termasuk kategori.
// Tidak ada angka contoh: bila data tidak ada, tampil keadaan kosong / "—" beserta alasannya.
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState, SkeletonChart } from '@/components/ui/Skeleton'
import { fetchAlertSkdr, nf, pf, toQs, type AlertSkdr, type Stage } from '@/lib/alert-skdr'

function useAlert(query: Record<string, unknown>) {
  const qs = toQs(query)
  const [d, setD] = useState<AlertSkdr | null>(null)
  const [err, setErr] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true; setErr(false); setD(null)
    fetchAlertSkdr(qs, tick > 0).then((x) => alive && setD(x)).catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [qs, tick])
  return { d, err, retry: () => setTick((x) => x + 1) }
}
function Kpi({ label, value, sub, tone = 'text-slate-900' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="skdr-card p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-black ${tone}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="skdr-card py-10 text-center text-sm text-slate-500">{children}</p>
const pct = (a: number, b: number) => (b ? (a * 100) / b : null)

/** CFR per penyakit (kematian / kasus Alert SKDR) dengan IK 95% Wilson. */
export function AlertCfr({ query }: { query: Record<string, unknown> }) {
  const { d, err, retry } = useAlert(query)
  if (err) return <ErrorState onRetry={retry} />
  if (!d) return <SkeletonChart />
  const rows = d.cfr.by_disease.filter((r) => r.cfr.den > 0).sort((a, b) => (b.cfr.pct ?? 0) - (a.cfr.pct ?? 0)).slice(0, 15)
    .map((r) => ({ name: r.disease, pct: r.cfr.pct ?? 0, num: r.cfr.num, den: r.cfr.den, lo: r.cfr.ci_low, hi: r.cfr.ci_high,
      err: [Math.max(0, (r.cfr.pct ?? 0) - (r.cfr.ci_low ?? 0)), Math.max(0, (r.cfr.ci_high ?? 0) - (r.cfr.pct ?? 0))] }))
  const o = d.cfr.overall
  return (
    <div className="space-y-3" data-testid="alert-cfr">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label="CFR keseluruhan" value={pf(o.pct)} sub={`IK 95% ${pf(o.ci_low)}–${pf(o.ci_high)}`} tone="text-red-600" />
        <Kpi label="Kematian" value={nf(o.num)} tone="text-red-600" sub="dilaporkan di Alert SKDR" />
        <Kpi label="Kasus" value={nf(o.den)} sub="dilaporkan di Alert SKDR" />
      </div>
      {!rows.length ? <Empty>Belum ada kasus Alert SKDR untuk filter ini, jadi CFR tidak bisa dihitung.</Empty> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="skdr-card p-3" style={{ height: Math.max(320, rows.length * 30 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 8, left: 4, right: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} interval={0} />
                <Tooltip formatter={(_v: any, _k: any, p: any) => [`${pf(p.payload.pct)} (${nf(p.payload.num)}/${nf(p.payload.den)}), IK 95% ${pf(p.payload.lo)}–${pf(p.payload.hi)}`, 'CFR']} />
                <Bar dataKey="pct" isAnimationActive={false} maxBarSize={18} radius={[0, 4, 4, 0]}>
                  {rows.map((r) => <Cell key={r.name} fill={(r.pct ?? 0) >= 5 ? '#dc2626' : (r.pct ?? 0) >= 1 ? '#d97706' : '#0f766e'} />)}
                  <ErrorBar dataKey="err" width={6} strokeWidth={1.5} stroke="#0f172a" direction="x" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="skdr-table-card overflow-x-auto">
            <table className="skdr-table min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-2 py-2">Penyakit</th><th>Kasus</th><th>Kematian</th><th>CFR</th><th>IK 95%</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.name} className="border-b border-slate-100"><td className="px-2 py-1.5 font-semibold">{r.name}</td><td>{nf(r.den)}</td><td className="font-bold text-red-600">{nf(r.num)}</td><td>{pf(r.pct)}</td><td>{pf(r.lo)}–{pf(r.hi)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500">CFR: persentase kematian dari seluruh kasus yang dilaporkan (15 penyakit tertinggi).</p>
    </div>
  )
}

/** Alert SKDR: jumlah, status verifikasi, penetapan KLB, respon 24 jam, per penyakit dan per minggu. */
export function AlertSection({ query }: { query: Record<string, unknown> }) {
  const { d, err, retry } = useAlert(query)
  if (err) return <ErrorState onRetry={retry} />
  if (!d) return <SkeletonChart />
  const k = d.kpis
  if (!k.alerts) return <Empty>Belum ada Alert SKDR untuk filter ini.</Empty>
  const trend = d.trend.map((r) => ({ ...r, label: `M${r.week}`, belum: r.alerts - r.verified }))
  const top = d.by_disease.slice(0, 12).map((r) => ({ name: r.disease, Terverifikasi: r.verified, 'Belum diverifikasi': r.alerts - r.verified }))
  return (
    <div className="space-y-3" data-testid="alert-skdr">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Alert" value={nf(k.alerts)} sub={`${nf(k.units)} unit pelapor`} />
        <Kpi label="Terverifikasi" value={pf(pct(k.verified, k.alerts))} sub={`${nf(k.verified)} dari ${nf(k.alerts)}`} />
        <Kpi label="Respon ≤ 24 jam" value={pf(pct(k.respon24, k.alerts))} sub={`${nf(k.respon24)} alert`} />
        <Kpi label="Ditetapkan KLB" value={nf(k.klb)} sub={pf(pct(k.klb, k.alerts))} tone="text-red-600" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="skdr-card p-3">
          <div className="mb-1 text-sm font-bold text-slate-800">Alert per minggu dan tindak lanjut</div>
          <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 11 }} width={52} />
              <Tooltip formatter={(v: any) => nf(Number(v))} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="verified" name="Terverifikasi" stackId="a" fill="#0f766e" isAnimationActive={false} />
              <Bar dataKey="belum" name="Belum diverifikasi" stackId="a" fill="#cbd5e1" isAnimationActive={false} />
              <Line dataKey="respon24" name="Respon ≤ 24 jam" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer></div>
        </div>
        <div className="skdr-card p-3">
          <div className="mb-1 text-sm font-bold text-slate-800">Status tindak lanjut per penyakit</div>
          <div style={{ height: Math.max(280, top.length * 24 + 50) }}><ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} interval={0} />
              <Tooltip formatter={(v: any) => nf(Number(v))} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Terverifikasi" stackId="s" fill="#0f766e" isAnimationActive={false} />
              <Bar dataKey="Belum diverifikasi" stackId="s" fill="#cbd5e1" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer></div>
        </div>
      </div>
      <div className="skdr-table-card overflow-x-auto">
        <table className="skdr-table min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-2 py-2">Status verifikasi</th><th>Penetapan KLB</th><th className="text-right pr-2">Alert</th><th className="text-right pr-2">%</th></tr></thead>
          <tbody>{d.status.map((s) => (
            <tr key={s.verifikasi + s.klb} className="border-b border-slate-100"><td className="px-2 py-1.5">{s.verifikasi}</td><td>{s.klb}</td><td className="pr-2 text-right font-mono">{nf(s.count)}</td><td className="pr-2 text-right">{pf(pct(s.count, k.alerts))}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Sumber: SKDR – Alert mingguan.</p>
    </div>
  )
}

function StageCard({ title, target, s, basis, reason }: { title: string; target: string; s: Stage | null; basis: string; reason?: string }) {
  const tot = s ? s.on_time + s.late + s.missing : 0
  return (
    <div className="skdr-card flex flex-col p-4" data-testid="t717-alert-stage">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{title} <span className="font-semibold normal-case text-slate-400">· target {target}</span></div>
      {!s || !s.den ? <div className="mt-2 text-sm font-semibold text-slate-500">Data belum tersedia</div> : (
        <>
          <div className="mt-1 text-3xl font-black text-slate-900">{pf(s.pct)}</div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {[{ v: s.on_time, c: 'bg-emerald-500', l: 'Tepat waktu' }, { v: s.late, c: 'bg-red-500', l: 'Terlambat' }, { v: s.missing, c: 'bg-slate-300', l: 'Tanpa tanggal' }]
              .map((p) => (p.v > 0 ? <span key={p.l} className={p.c} style={{ width: `${(p.v * 100) / (tot || 1)}%` }} title={`${p.l}: ${nf(p.v)}`} /> : null))}
          </div>
          <div className="mt-1 text-xs text-slate-500">{nf(s.on_time)} tepat · {nf(s.late)} terlambat · {nf(s.missing)} tanpa data{s.median_days !== null ? ` · median ${s.median_days.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari` : ''}</div>
        </>
      )}
      <p className="mt-2 text-[11px] text-slate-500">{reason || basis}</p>
    </div>
  )
}

/** 7-1-7 dari Alert SKDR: deteksi (tidak tersedia), notifikasi (tanggal verifikasi), respons (flag 24 jam). */
export function AlertT717({ query }: { query: Record<string, unknown> }) {
  const { d, err, retry } = useAlert(query)
  if (err) return <ErrorState onRetry={retry} />
  if (!d) return <SkeletonChart height={160} />
  const t = d.t717
  const rows = d.by_disease.filter((r) => r.notify.den > 0).slice(0, 15)
  return (
    <div className="space-y-3" data-testid="t717-alert">
      <div className="text-sm font-bold text-slate-800">Alert SKDR</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StageCard title="Deteksi" target="≤ 7 hari" s={t.detection} basis="" reason={t.detection_reason} />
        <StageCard title="Notifikasi / verifikasi" target="≤ 1 hari" s={t.notification} basis={t.notification_basis} />
        <StageCard title="Respons" target="≤ 7 hari" s={t.response} basis={t.response_basis} />
      </div>
      {rows.length ? (
        <div className="skdr-table-card overflow-x-auto">
          <table className="skdr-table min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-2 py-2">Penyakit</th><th>Alert</th><th>Verifikasi ≤ 1 hari</th><th>Median (hari)</th><th>Respon ≤ 24 jam</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.disease} className="border-b border-slate-100"><td className="px-2 py-1.5 font-semibold">{r.disease}</td><td>{nf(r.alerts)}</td><td>{pf(r.notify.pct)}</td>
                <td>{r.notify.median_days === null ? '—' : r.notify.median_days.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</td><td>{pf(pct(r.respon24, r.alerts))}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
