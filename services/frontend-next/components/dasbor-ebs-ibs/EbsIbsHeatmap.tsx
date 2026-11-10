'use client'
// PR 035: Matrix Heatmap (Minggu Epid x Provinsi / Penyakit) directly from transaksi Form EBS, Entri Data Agregat IBS, & Form Individu IBS.
import { useMemo, useState, type MouseEvent } from 'react'
import { Grid3x3 } from 'lucide-react'
import type { EbsDashData, EpiWeekPoint, IbsDashData } from '@/lib/dasbor-ebs-ibs-api'

const nf = (v: number) => new Intl.NumberFormat('id-ID').format(v)

const RAMP_TEAL = ['#f8fafc', '#ccfbf1', '#5eead4', '#14b8a6', '#0f766e', '#115e59']
const RAMP_BLUE = ['#f8fafc', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a']
const RAMP_VIOLET = ['#f8fafc', '#ede9fe', '#c4b5fd', '#8b5cf6', '#6d28d9', '#4c1d95']

function shade(v: number, max: number, ramp: string[]) {
  if (v <= 0 || max <= 0) return ramp[0]
  const idx = Math.min(5, 1 + Math.floor(Math.sqrt(v / max) * 4.999))
  return ramp[idx]
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

type HoverState = {
  label: string
  week: EpiWeekPoint
  aLabel: string
  aVal: number
  bLabel?: string
  bVal?: number
  x: number
  y: number
}

export function EbsMatrixHeatmap({ heatmap }: { heatmap: EbsDashData['heatmap'] }) {
  const [by, setBy] = useState<'province' | 'disease'>('province')
  const [metric, setMetric] = useState<'kasus' | 'laporan'>('kasus')
  const [showAll, setShowAll] = useState(false)
  const [hover, setHover] = useState<HoverState | null>(null)

  const rows = useMemo(() => {
    const src = by === 'province' ? heatmap.by_province : heatmap.by_disease
    return src.map((r) => ({
      id: r.name,
      name: r.name,
      values: metric === 'kasus' ? r.values_kasus : r.values_laporan,
      total: metric === 'kasus' ? r.total_kasus : r.total_laporan,
      laporan: r.total_laporan,
      kasus: r.total_kasus,
      kematian: r.total_kematian,
    })).filter((r) => r.laporan > 0)
  }, [heatmap, by, metric])

  const maxVal = useMemo(() => Math.max(0, ...rows.flatMap((r) => r.values)), [rows])
  const shown = showAll ? rows : rows.slice(0, 15)
  const weeks = heatmap.weeks

  return (
    <div className="skdr-card p-4" data-testid="ebs-matrix-heatmap">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Grid3x3 className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Heatmap Mingguan EBS (Minggu Epid × {by === 'province' ? 'Provinsi' : 'Penyakit Rumor'})</h3>
            <p className="text-xs text-slate-500">Intensitas mingguan berdasarkan data transaksi Form Laporan EBS</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            <button type="button" onClick={() => setBy('province')} className={`rounded-lg px-3 py-1 transition ${by === 'province' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Provinsi</button>
            <button type="button" onClick={() => setBy('disease')} className={`rounded-lg px-3 py-1 transition ${by === 'disease' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Penyakit</button>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            <button type="button" onClick={() => setMetric('kasus')} className={`rounded-lg px-3 py-1 transition ${metric === 'kasus' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Kasus</button>
            <button type="button" onClick={() => setMetric('laporan')} className={`rounded-lg px-3 py-1 transition ${metric === 'laporan' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Laporan</button>
          </div>
        </div>
      </div>

      {!weeks.length || !rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 py-8 text-center text-xs text-slate-500">
          Belum ada data mingguan Form Laporan EBS untuk ditampilkan di heatmap.
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[160px] bg-white pr-3 text-left font-bold text-slate-600">
                  {by === 'province' ? 'Provinsi' : 'Penyakit Rumor'}
                </th>
                {weeks.map((w) => (
                  <th key={`${w.year}-${w.week}`} className="min-w-[26px] whitespace-nowrap px-0.5 text-center font-normal text-slate-400" title={`${w.label} (${w.start})`}>
                    {w.week}
                  </th>
                ))}
                <th className="pl-2 text-right font-bold text-teal-800">Total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 max-w-[200px] truncate bg-white pr-3 font-semibold text-slate-700" title={r.name}>{r.name}</td>
                  {weeks.map((w, i) => {
                    const v = r.values[i] || 0
                    const onEnter = (e: MouseEvent) => setHover({
                      label: r.name, week: w,
                      aLabel: metric === 'kasus' ? 'Kasus' : 'Laporan', aVal: v,
                      x: e.clientX, y: e.clientY,
                    })
                    return (
                      <td
                        key={`${w.year}-${w.week}`}
                        onMouseMove={onEnter}
                        onMouseLeave={() => setHover(null)}
                        className="h-6 rounded-sm border border-slate-100 transition hover:ring-1 hover:ring-slate-400"
                        style={{ background: shade(v, maxVal, RAMP_TEAL) }}
                      />
                    )
                  })}
                  <td className="pl-2 text-right font-mono font-bold text-slate-700">{nf(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <span>Skala {metric === 'kasus' ? 'Kasus' : 'Laporan'}:</span>
              {RAMP_TEAL.map((c, i) => (
                <span key={i} className="h-3 w-5 rounded-sm border border-slate-200" style={{ background: c }} />
              ))}
              <span className="ml-1 font-mono">0 — {nf(maxVal)}</span>
            </div>
            {rows.length > 15 ? (
              <button type="button" onClick={() => setShowAll(!showAll)} className="font-semibold text-primary underline">
                {showAll ? 'Tampilkan 15 teratas' : `Tampilkan semua (${rows.length})`}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {hover ? (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-bold text-slate-800">{hover.label}</div>
          <div className="text-[11px] text-slate-500">{hover.week.label} ({fmtDay(hover.week.start)} – {fmtDay(addDays(hover.week.start, 6))})</div>
          <div className="mt-1 font-semibold text-teal-700">{hover.aLabel}: {nf(hover.aVal)}</div>
        </div>
      ) : null}
    </div>
  )
}

export function IbsMatrixHeatmap({ heatmap }: { heatmap: IbsDashData['heatmap'] }) {
  const [by, setBy] = useState<'province' | 'disease'>('province')
  const [mode, setMode] = useState<'both' | 'agregat' | 'individu'>('both')
  const [showAll, setShowAll] = useState(false)
  const [hover, setHover] = useState<HoverState | null>(null)

  const rows = useMemo(() => {
    const src = by === 'province' ? heatmap.by_province : heatmap.by_disease
    return src.map((r) => ({
      id: r.name,
      name: r.name,
      va: r.values_agregat_kasus,
      vi: r.values_individu_pasien,
      ta: r.total_agregat_kasus,
      ti: r.total_individu_pasien,
    })).filter((r) => {
      if (mode === 'agregat') return r.ta > 0
      if (mode === 'individu') return r.ti > 0
      return r.ta > 0 || r.ti > 0
    })
  }, [heatmap, by, mode])

  const maxA = useMemo(() => Math.max(0, ...rows.flatMap((r) => r.va)), [rows])
  const maxI = useMemo(() => Math.max(0, ...rows.flatMap((r) => r.vi)), [rows])
  const shown = showAll ? rows : rows.slice(0, 15)
  const weeks = heatmap.weeks

  return (
    <div className="skdr-card p-4" data-testid="ibs-matrix-heatmap">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Grid3x3 className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Heatmap Mingguan IBS (Minggu Epid × {by === 'province' ? 'Provinsi' : 'Penyakit Agregat'})</h3>
            <p className="text-xs text-slate-500">Perbandingan sel terpisah: Kasus Entri Data Agregat (atas/biru) &amp; Pasien Form Individu (bawah/ungu) — tidak dijumlahkan</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            <button type="button" onClick={() => setBy('province')} className={`rounded-lg px-3 py-1 transition ${by === 'province' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Provinsi</button>
            <button type="button" onClick={() => setBy('disease')} className={`rounded-lg px-3 py-1 transition ${by === 'disease' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Penyakit</button>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            <button type="button" onClick={() => setMode('both')} className={`rounded-lg px-3 py-1 transition ${mode === 'both' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Keduanya</button>
            <button type="button" onClick={() => setMode('agregat')} className={`rounded-lg px-3 py-1 transition ${mode === 'agregat' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Agregat</button>
            <button type="button" onClick={() => setMode('individu')} className={`rounded-lg px-3 py-1 transition ${mode === 'individu' ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Individu</button>
          </div>
        </div>
      </div>

      {!weeks.length || !rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 py-8 text-center text-xs text-slate-500">
          Belum ada data mingguan Entri Data Agregat maupun Form Individu untuk ditampilkan di heatmap.
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[160px] bg-white pr-3 text-left font-bold text-slate-600">
                  {by === 'province' ? 'Provinsi' : 'Penyakit Agregat'}
                </th>
                {weeks.map((w) => (
                  <th key={`${w.year}-${w.week}`} className="min-w-[26px] whitespace-nowrap px-0.5 text-center font-normal text-slate-400" title={`${w.label} (${w.start})`}>
                    {w.week}
                  </th>
                ))}
                {mode !== 'individu' ? <th className="pl-2 text-right font-bold text-blue-700">Agregat</th> : null}
                {mode !== 'agregat' ? <th className="pl-2 text-right font-bold text-violet-700">Individu</th> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 max-w-[210px] truncate bg-white pr-3 font-semibold text-slate-700" title={r.name}>{r.name}</td>
                  {weeks.map((w, i) => {
                    const a = r.va[i] || 0
                    const ind = r.vi[i] || 0
                    const onMove = (e: MouseEvent) => setHover({
                      label: r.name, week: w,
                      aLabel: mode === 'individu' ? 'Pasien Individu' : 'Kasus Agregat',
                      aVal: mode === 'individu' ? ind : a,
                      bLabel: mode === 'both' ? 'Pasien Individu' : undefined,
                      bVal: mode === 'both' ? ind : undefined,
                      x: e.clientX, y: e.clientY,
                    })
                    return mode === 'both' ? (
                      <td key={`${w.year}-${w.week}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="h-6 overflow-hidden rounded-sm border border-slate-100 p-0 hover:ring-1 hover:ring-slate-400">
                        <div className="h-3" style={{ background: shade(a, maxA, RAMP_BLUE) }} />
                        <div className="h-3" style={{ background: shade(ind, maxI, RAMP_VIOLET) }} />
                      </td>
                    ) : (
                      <td
                        key={`${w.year}-${w.week}`}
                        onMouseMove={onMove}
                        onMouseLeave={() => setHover(null)}
                        className="h-6 rounded-sm border border-slate-100 hover:ring-1 hover:ring-slate-400"
                        style={{ background: mode === 'agregat' ? shade(a, maxA, RAMP_BLUE) : shade(ind, maxI, RAMP_VIOLET) }}
                      />
                    )
                  })}
                  {mode !== 'individu' ? <td className="pl-2 text-right font-mono font-bold text-blue-700">{nf(r.ta)}</td> : null}
                  {mode !== 'agregat' ? <td className="pl-2 text-right font-mono font-bold text-violet-700">{nf(r.ti)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
            <div className="flex flex-wrap items-center gap-4">
              {mode !== 'individu' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-blue-700">Kasus Agregat:</span>
                  {RAMP_BLUE.map((c, i) => <span key={i} className="h-3 w-4 rounded-sm border border-slate-200" style={{ background: c }} />)}
                  <span className="font-mono">0–{nf(maxA)}</span>
                </span>
              ) : null}
              {mode !== 'agregat' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-violet-700">Pasien Individu:</span>
                  {RAMP_VIOLET.map((c, i) => <span key={i} className="h-3 w-4 rounded-sm border border-slate-200" style={{ background: c }} />)}
                  <span className="font-mono">0–{nf(maxI)}</span>
                </span>
              ) : null}
            </div>
            {rows.length > 15 ? (
              <button type="button" onClick={() => setShowAll(!showAll)} className="font-semibold text-primary underline">
                {showAll ? 'Tampilkan 15 teratas' : `Tampilkan semua (${rows.length})`}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {hover ? (
        <div className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="font-bold text-slate-800">{hover.label}</div>
          <div className="text-[11px] text-slate-500">{hover.week.label} ({fmtDay(hover.week.start)} – {fmtDay(addDays(hover.week.start, 6))})</div>
          <div className="mt-1 font-semibold text-blue-700">{hover.aLabel}: {nf(hover.aVal)}</div>
          {hover.bLabel ? <div className="font-semibold text-violet-700">{hover.bLabel}: {nf(hover.bVal || 0)}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

