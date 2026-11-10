'use client'

import { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import type { EpiWeekPoint } from '@/lib/dasbor-ebs-ibs-api'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'

const RAMP_EMERALD = ['#f8fafc', '#d1fae5', '#6ee7b7', '#10b981', '#059669', '#065f46']
const RAMP_AMBER = ['#f8fafc', '#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#92400e']
const RAMP_CRIMSON = ['#f8fafc', '#ffedd5', '#fdba74', '#f97316', '#dc2626', '#991b1b']

function rampColor(v: number, max: number, ramp: string[]) {
  if (v <= 0 || max <= 0) return ramp[0]
  const idx = Math.min(5, 1 + Math.floor(Math.sqrt(v / max) * 4.999))
  return ramp[idx]
}

const nf = (v: number) => new Intl.NumberFormat('id-ID').format(v)

type MatrixRow = {
  id: string | number
  name: string
  values: number[]
  total: number
  extra: string
}

function MatrixGrid({
  weeks,
  rows,
  rowHeader,
  ramp,
  unitLabel,
  emptyMsg,
}: {
  weeks: EpiWeekPoint[]
  rows: MatrixRow[]
  rowHeader: string
  ramp: string[]
  unitLabel: string
  emptyMsg: string
}) {
  const [hover, setHover] = useState<{ row: string; week: string; val: number } | null>(null)
  const maxCell = useMemo(() => {
    let m = 0
    for (const r of rows) for (const v of r.values) if (v > m) m = v
    return m
  }, [rows])

  if (!weeks.length || !rows.length) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-xs text-slate-500">
        {emptyMsg}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <span>Intensitas (0 — {nf(maxCell)} {unitLabel}):</span>
          {ramp.map((c, i) => (
            <span key={i} className="h-3 w-4 rounded border border-slate-200" style={{ background: c }} />
          ))}
        </div>
        {hover ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
            {hover.row} · <span className="text-slate-900">{hover.week}</span>: <b>{nf(hover.val)}</b> {unitLabel}
          </div>
        ) : (
          <span className="text-slate-400">Arahkan kursor pada sel untuk melihat detail mingguan</span>
        )}
      </div>

      <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-30 min-w-[180px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-bold text-slate-700">
                {rowHeader}
              </th>
              {weeks.map((w) => (
                <th
                  key={`${w.year}-${w.week}`}
                  title={`${w.label} (mulai ${w.start})`}
                  className="min-w-[44px] border-b border-slate-200 px-1 py-2 text-center font-semibold text-slate-600"
                >
                  <div>M{w.week}</div>
                  <div className="text-[9px] font-normal text-slate-400">{w.year}</div>
                </th>
              ))}
              <th className="sticky right-0 z-30 min-w-[74px] border-b border-l border-slate-200 bg-slate-50 px-2.5 py-2 text-right font-bold text-slate-700">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-1.5 font-semibold text-slate-800">
                  <div className="truncate max-w-[210px]" title={r.name}>{r.name}</div>
                  {r.extra ? <div className="text-[9px] font-normal text-slate-400">{r.extra}</div> : null}
                </td>
                {r.values.map((v, idx) => {
                  const bg = rampColor(v, maxCell, ramp)
                  const darkText = maxCell > 0 && v / maxCell > 0.45
                  const wk = weeks[idx]
                  return (
                    <td
                      key={idx}
                      onMouseEnter={() => setHover({ row: r.name, week: wk?.label || '-', val: v })}
                      onMouseLeave={() => setHover(null)}
                      style={{ background: bg }}
                      className={`border-b border-l border-slate-100 px-1 py-1.5 text-center tabular-nums transition-opacity ${
                        darkText ? 'font-bold text-white' : v > 0 ? 'font-semibold text-slate-800' : 'text-slate-300'
                      }`}
                    >
                      {v > 0 ? nf(v) : '·'}
                    </td>
                  )
                })}
                <td className="sticky right-0 z-10 border-b border-l border-slate-200 bg-slate-50/95 px-2.5 py-1.5 text-right font-extrabold tabular-nums text-slate-800">
                  {nf(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function GiziMatrixHeatmap({ heatmap }: { heatmap: GiziDashData['heatmap'] }) {
  const [axis, setAxis] = useState<'prov' | 'form'>('prov')
  const [metric, setMetric] = useState<'vol' | 'gap'>('vol')

  const rows: MatrixRow[] = useMemo(() => {
    if (axis === 'prov') {
      return heatmap.by_province.map((p) => ({
        id: p.id,
        name: p.name,
        values: metric === 'gap' ? p.values_belum_baik : p.values_kunjungan,
        total: metric === 'gap' ? p.rekap12_belum_baik : p.total_kunjungan,
        extra: `F12: ${nf(p.rekap12_baik)} baik · ${nf(p.rekap12_belum_baik)} blm`,
      }))
    }
    return heatmap.by_form.map((f) => ({
      id: f.form_no,
      name: f.name,
      values: metric === 'gap' ? f.values_tidak_sesuai : f.values_tersimpan,
      total: metric === 'gap' ? f.total_tidak_sesuai : f.total_tersimpan,
      extra: `${nf(f.total_tidak_sesuai)} tidak sesuai / ${nf(f.total_tersimpan)} form`,
    }))
  }, [heatmap, axis, metric])

  const unitLabel = axis === 'prov'
    ? (metric === 'gap' ? 'F12 belum baik' : 'kunjungan')
    : (metric === 'gap' ? 'form tidak sesuai' : 'form terisi')

  return (
    <div className="skdr-card p-4" data-testid="gizi-matrix-heatmap">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Flame className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Matrix Heatmap Mingguan Pengawasan Gizi</h3>
            <p className="text-xs text-slate-500">Distribusi intensitas kunjungan &amp; ketidakpatuhan Form 1–13 per Minggu Epid</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setAxis('prov')}
              className={`rounded-md px-2.5 py-1 font-semibold ${axis === 'prov' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Provinsi
            </button>
            <button
              type="button"
              onClick={() => setAxis('form')}
              className={`rounded-md px-2.5 py-1 font-semibold ${axis === 'form' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Formulir F1–F13
            </button>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setMetric('vol')}
              className={`rounded-md px-2.5 py-1 font-semibold ${metric === 'vol' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600'}`}
            >
              {axis === 'prov' ? 'Kunjungan' : 'Form Terisi'}
            </button>
            <button
              type="button"
              onClick={() => setMetric('gap')}
              className={`rounded-md px-2.5 py-1 font-semibold ${metric === 'gap' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600'}`}
            >
              {axis === 'prov' ? 'F12 Belum Baik' : 'Tidak Sesuai'}
            </button>
          </div>
        </div>
      </div>

      <MatrixGrid
        weeks={heatmap.weeks}
        rows={rows}
        rowHeader={axis === 'prov' ? 'Provinsi' : 'Formulir Pengawasan'}
        ramp={metric === 'gap' ? RAMP_AMBER : RAMP_EMERALD}
        unitLabel={unitLabel}
        emptyMsg="Belum ada transaksi kunjungan pengawasan gizi pada rentang filter ini."
      />
    </div>
  )
}

export function KeracunanMatrixHeatmap({ heatmap }: { heatmap: KeracunanDashData['heatmap'] }) {
  const [metric, setMetric] = useState<'kasus' | 'kejadian'>('kasus')

  const rows: MatrixRow[] = useMemo(
    () => heatmap.by_province.map((p) => ({
      id: p.id,
      name: p.name,
      values: metric === 'kasus' ? p.values_kasus : p.values_kejadian,
      total: metric === 'kasus' ? p.total_kasus : p.total_kejadian,
      extra: `${nf(p.total_kejadian)} kejadian · ${nf(p.total_meninggal)} meninggal`,
    })),
    [heatmap, metric],
  )

  return (
    <div className="skdr-card p-4" data-testid="keracunan-matrix-heatmap">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <Flame className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Matrix Heatmap Mingguan Keracunan Pangan MBG</h3>
            <p className="text-xs text-slate-500">Sebaran Minggu Epid tanggal kejadian keracunan pangan per Provinsi</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMetric('kasus')}
            className={`rounded-md px-2.5 py-1 font-semibold ${metric === 'kasus' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600'}`}
          >
            Jumlah Kasus
          </button>
          <button
            type="button"
            onClick={() => setMetric('kejadian')}
            className={`rounded-md px-2.5 py-1 font-semibold ${metric === 'kejadian' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-600'}`}
          >
            Jumlah Kejadian
          </button>
        </div>
      </div>

      <MatrixGrid
        weeks={heatmap.weeks}
        rows={rows}
        rowHeader="Provinsi"
        ramp={RAMP_CRIMSON}
        unitLabel={metric === 'kasus' ? 'kasus' : 'kejadian'}
        emptyMsg="Belum ada transaksi kejadian keracunan pangan MBG pada rentang filter ini."
      />
    </div>
  )
}
