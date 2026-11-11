'use client'
// PR 044: right floating panel of the Spasial map (ABVC-style "Region overview"): ringkasan + kurva epid,
// hotspot ranking (wilayah / unit pelapor), and detail of the clicked wilayah.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiQuery, fetchAnalisa, nf, type AFilter } from '@/lib/analisa-api'
import { areaVal, fmtPct, METRICS, STATUS, type Area, type Metric, type SpasialResp, type Titik } from '@/lib/spasial-api'
import { InfoTip, Seg } from '@/components/analisa/ui'

type Tab = 'ringkasan' | 'hotspot' | 'detail'

function Curve({ rows, h = 120 }: { rows: { label: string; kasus: number; alert?: number }[]; h?: number }) {
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
          <Tooltip formatter={(v: any) => nf(v)} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
          <Bar dataKey="kasus" name="Kasus" fill="#0f766e" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const chgCls = (v: number | null) => (v === null ? 'text-slate-400' : v > 0 ? 'text-red-600' : v < 0 ? 'text-emerald-600' : 'text-slate-500')

export default function SpasialPanel({ f, data, titik, metric, selected, onPickArea, onPickTitik, onClose, onClear, className, closeIcon = 'right' }: {
  f: AFilter; data: SpasialResp | null; titik: Titik[]; metric: Metric; selected: Area | null
  onPickArea: (a: Area) => void; onPickTitik: (t: Titik) => void; onClose: () => void; onClear: () => void; className?: string; closeIcon?: 'left' | 'right'
}) {
  const [tab, setTab] = useState<Tab>('ringkasan')
  const [hs, setHs] = useState<'wilayah' | 'unit'>('wilayah')
  const [det, setDet] = useState<any>(null)
  const [detLoading, setDetLoading] = useState(false)
  useEffect(() => { if (selected) setTab('detail') }, [selected])
  const lv = data?.level === 'kabkota' ? 'kab' : 'prov'
  const fq = apiQuery(f)
  useEffect(() => {
    setDet(null)
    if (!selected) return
    let alive = true
    setDetLoading(true)
    fetchAnalisa('spasial/wilayah', f, { wlv: lv, wid: selected.id }).then((d) => alive && setDet(d)).catch(() => alive && setDet({ error: true })).finally(() => alive && setDetLoading(false))
    return () => { alive = false }
  }, [selected?.id, lv, fq]) // eslint-disable-line react-hooks/exhaustive-deps
  const mt = METRICS.find((x) => x.key === metric)!
  const ranked = useMemo(() => {
    const as = (data?.wilayah || []).map((a) => ({ a, v: areaVal(a, metric, -1) }))
    const ok = metric === 'chg_minggu' ? as.filter((x) => x.v !== null && x.a.minggu_ini >= 5) : metric === 'cfr' ? as.filter((x) => x.v !== null && x.a.kasus >= 20) : as.filter((x) => (x.v || 0) > 0)
    return ok.sort((x, y) => (y.v || 0) - (x.v || 0)).slice(0, 20)
  }, [data, metric])
  const units = useMemo(() => [...titik].sort((a, b) => b.k - a.k).slice(0, 20), [titik])
  const maxV = Math.max(1, ...ranked.map((x) => Math.abs(x.v || 0)))
  const maxU = Math.max(1, ...units.map((x) => x.k))
  const r = data?.ringkasan
  const fmtV = (v: number | null) => (metric === 'cfr' || metric === 'chg_minggu' ? fmtPct(v, metric === 'chg_minggu') : nf(v))
  const lvLabel = data?.level === 'kabkota' ? 'Kab/Kota' : 'Provinsi'
  const matriksHref = (() => {
    const p = new URLSearchParams(fq)
    const u = new URLSearchParams()
    u.set('sumber', f.sumber); u.set('startYear', String(f.sy)); u.set('startWeek', String(f.sw)); u.set('endYear', String(f.ey)); u.set('endWeek', String(f.ew))
    if (selected) { if (lv === 'prov') u.set('prov', String(selected.id)); else { if (f.prov) u.set('prov', f.prov); u.set('kab', String(selected.id)) } }
    if (p.get('penyakit')) u.set('penyakit', p.get('penyakit')!)
    return `/dashboard/matriks-analisa?${u.toString()}`
  })()

  return (
    <aside className={`flex h-full flex-col overflow-hidden ${className || "rounded-2xl border border-slate-200 bg-slate-50/95 shadow-xl backdrop-blur"}`}>

      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-800">{selected ? selected.nama : (data?.meta?.breadcrumb || []).map((c: any) => c.label).slice(-1)[0] || 'Indonesia'}</p>
          <p className="text-[11px] text-slate-500">{data?.meta?.periode_label} · {data?.meta?.sumber_label}</p>
        </div>
        <div className="flex items-center gap-1">
          {selected ? <button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"><X className="mr-0.5 inline h-3 w-3" />Wilayah</button> : null}
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Tutup panel">{closeIcon === "left" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
        </div>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
        {([['ringkasan', 'Ringkasan'], ['hotspot', 'Hotspot'], ['detail', 'Detail wilayah']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`spasial-tab-${k}`}
            className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-bold ${tab === k ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-100'}`}>{l}</button>
        ))}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[11px] text-slate-700">
        {!data ? <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat…</p> : null}
        {data && tab === 'ringkasan' ? (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">Ringkasan</p>
              <ul className="list-disc space-y-1 pl-4 leading-snug">{(data.interpretasi || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Kurva epidemi (kasus per minggu epid)<InfoTip text="Jumlah kasus per minggu epid pada wilayah & filter terpilih." /></p>
              <Curve rows={r?.kurva || []} />
              <div className="mt-1 grid grid-cols-3 gap-1 text-center">
                <div><p className="text-slate-400">{data.minggu_lalu}</p><b className="tabular-nums">{nf(r?.minggu_lalu)}</b></div>
                <div><p className="text-slate-400">{data.minggu_ini}</p><b className="tabular-nums">{nf(r?.minggu_ini)}</b></div>
                <div><p className="text-slate-400">Perubahan</p><b className={chgCls(r?.chg_minggu ?? null)}>{fmtPct(r?.chg_minggu, true)}</b></div>
              </div>
            </section>
          </>
        ) : null}
        {data && tab === 'hotspot' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-3" data-testid="spasial-hotspot">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Hotspot<InfoTip text={`Peringkat menurut indikator warna peta (${mt.label}). Perubahan dihitung hanya untuk wilayah dengan ≥ 5 kasus minggu ini; CFR hanya untuk wilayah dengan ≥ 20 kasus. Unit pelapor diurutkan menurut kasus.`} /></p>
              <Seg value={hs} onChange={(v) => setHs(v)} options={[{ value: 'wilayah', label: lvLabel }, { value: 'unit', label: 'Unit pelapor' }]} testId="spasial-hotspot-jenis" />
            </div>
            {hs === 'wilayah' ? (
              ranked.length ? <ol className="space-y-1">{ranked.map(({ a, v }, i) => (
                <li key={a.id}><button type="button" onClick={() => onPickArea(a)} className={`w-full rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 ${selected?.id === a.id ? 'bg-teal-50' : ''}`} data-testid="hotspot-item">
                  <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><span className="w-4 text-right font-black text-slate-400">{i + 1}</span><span className="truncate font-bold">{a.nama}</span></span>
                    <span className="shrink-0 text-right"><b className="tabular-nums">{fmtV(v)}</b> <span className={`ml-1 text-[10px] font-bold ${chgCls(a.chg_minggu)}`}>{a.chg_minggu === null ? '' : `${a.chg_minggu > 0 ? '▲' : a.chg_minggu < 0 ? '▼' : '■'}${Math.abs(a.chg_minggu).toLocaleString('id-ID', { maximumFractionDigits: 0 })}%`}</span></span></div>
                  <div className="ml-5 mt-0.5 h-1.5 rounded bg-slate-100"><div className={`h-1.5 rounded ${metric === 'chg_minggu' ? 'bg-red-500' : 'bg-teal-600'}`} style={{ width: `${Math.max(2, (Math.abs(v || 0) / maxV) * 100)}%` }} /></div>
                </button></li>))}</ol> : <p className="text-slate-500">Tidak ada wilayah yang memenuhi syarat untuk indikator ini.</p>
            ) : (
              units.length ? <ol className="space-y-1">{units.map((t, i) => (
                <li key={t.idx}><button type="button" onClick={() => onPickTitik(t)} className="w-full rounded-lg px-1.5 py-1 text-left hover:bg-slate-50" data-testid="hotspot-unit">
                  <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><span className="w-4 text-right font-black text-slate-400">{i + 1}</span><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS[t.st]?.color }} /><span className="truncate font-bold">{t.unit}</span></span><b className="shrink-0 tabular-nums">{nf(t.k)}</b></div>
                  <div className="ml-5 truncate text-[10px] text-slate-500">{[t.kec ? `Kec. ${t.kec}` : null, t.kab].filter(Boolean).join(' · ')}{t.a ? ` · ${nf(t.a)} ${t.src === 'ebs' ? 'sinyal' : 'alert'}` : ''}{t.b ? ` · ${nf(t.b)} KLB` : ''}</div>
                  <div className="ml-5 mt-0.5 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-teal-600" style={{ width: `${Math.max(2, (t.k / maxU) * 100)}%` }} /></div>
                </button></li>))}</ol> : <p className="text-slate-500">Tidak ada unit pelapor bertitik.</p>
            )}
          </section>
        ) : null}
        {data && tab === 'detail' ? (
          !selected ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-slate-500">Klik wilayah atau baris hotspot untuk melihat detail: penyakit teratas, {data.level === 'kabkota' ? 'kecamatan' : 'kab/kota'} dan unit pelapor teratas, serta kurva mingguan.</p> : (
            <>
              <section className="rounded-xl border-2 border-teal-700/20 bg-white p-3" data-testid="spasial-detail">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-slate-400">Kasus</p><b className="text-base tabular-nums">{nf(selected.kasus)}</b></div>
                  <div><p className="text-slate-400">Kematian</p><b className="text-base tabular-nums">{nf(selected.kematian)}</b></div>
                  <div><p className="text-slate-400">CFR</p><b className="text-base tabular-nums">{selected.kasus ? fmtPct(selected.cfr) : '–'}</b></div>
                  <div><p className="text-slate-400">vs minggu lalu</p><b className={chgCls(selected.chg_minggu)}>{fmtPct(selected.chg_minggu, true)}</b></div>
                  <div><p className="text-slate-400">vs periode lalu</p><b className={chgCls(selected.chg_periode)}>{fmtPct(selected.chg_periode, true)}</b></div>
                  <div><p className="text-slate-400">KLB</p><b className={selected.klb ? 'text-red-600' : ''}>{nf(selected.klb)}</b></div>
                </div>
                {detLoading ? <p className="mt-2 flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat detail…</p> : null}
                {det?.kurva ? <div className="mt-2"><Curve rows={det.kurva} h={110} /></div> : null}
                <Link href={matriksHref} className="mt-2 block rounded-lg border border-teal-200 bg-teal-50 px-2 py-1.5 text-center text-[11px] font-bold text-teal-800 hover:bg-teal-100">Buka wilayah ini di Matriks Analisa</Link>
              </section>
              {det?.penyakit ? <Mini title="Penyakit teratas" rows={det.penyakit} /> : null}
              {det?.sub ? <Mini title={`${det.sub_label} teratas`} rows={det.sub} /> : null}
              {det?.unit ? <Mini title="Unit pelapor teratas" rows={det.unit} /> : null}
              {det?.error ? <p className="text-red-600">Detail gagal dimuat.</p> : null}
            </>
          )
        ) : null}
      </div>
    </aside>
  )
}

function Mini({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{title}</p>
      <table className="w-full text-[11px]"><thead><tr className="text-slate-400"><th className="text-left font-semibold">Nama</th><th className="text-right font-semibold">Kasus</th><th className="text-right font-semibold">Mati</th><th className="text-right font-semibold">Alert</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="max-w-[150px] truncate py-0.5" title={r.nama}>{r.nama}{r.kecamatan ? <span className="text-slate-400"> · {r.kecamatan}</span> : null}</td><td className="text-right tabular-nums">{nf(r.kasus)}</td><td className="text-right tabular-nums">{nf(r.kematian)}</td><td className="text-right tabular-nums">{nf(r.alert)}{r.klb ? <span className="ml-0.5 font-bold text-red-600">·{r.klb} KLB</span> : null}</td></tr>)}</tbody></table>
    </section>
  )
}
