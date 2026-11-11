'use client'
// PR 052: grafik Dasbor MBG yang mempertahankan opsi panel "KERACUNAN MAKAN MBG" Kemkes (jenis grafik Column/Line/Bar,
// label data, urutan Nama Daerah/Tertinggi/Terendah) dan menambah kurva epidemi menurut granularitas waktu.
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Seg } from '@/components/analisa/ui'
import { EmptyBox, nf } from '@/components/dasbor-mbg/MbgUi'
import type { MbgRankRow } from '@/lib/dasbor-mbg-api'
import { aggregateSeries, jenisLabel, type Gran, type Jenis } from '@/lib/dasbor-mbg-filter'

export type ChartKind = 'column' | 'line' | 'bar'
export type SortKind = 'nama' | 'tertinggi' | 'terendah'

const JENIS_COLOR: Record<Jenis, string> = { kejadian: '#ea580c', kasus: '#dc2626', meninggal: '#1e293b' }

export function ChartToolbar({ kind, setKind, labels, setLabels, sort, setSort, testId }: {
  kind: ChartKind; setKind: (k: ChartKind) => void; labels: boolean; setLabels: (b: boolean) => void; sort?: SortKind; setSort?: (s: SortKind) => void; testId?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <Seg value={kind} onChange={setKind} options={[{ value: 'column', label: 'Column' }, { value: 'line', label: 'Line' }, { value: 'bar', label: 'Bar' }]} />
      {sort && setSort ? <Seg value={sort} onChange={setSort} options={[{ value: 'nama', label: 'Nama Daerah' }, { value: 'tertinggi', label: 'Tertinggi' }, { value: 'terendah', label: 'Terendah' }]} /> : null}
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-600">
        <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="h-3.5 w-3.5 accent-teal-700" /> Label data
      </label>
    </div>
  )
}

function SeriesChart({ data, xKey, yKey, name, kind, labels, color, height, refY, refLabel, yDomain }: {
  data: any[]; xKey: string; yKey: string; name: string; kind: ChartKind; labels: boolean; color: string; height: number; refY?: number; refLabel?: string; yDomain?: [number, number]
}) {
  const fmt = (v: any) => (typeof v === 'number' ? v.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : v)
  if (kind === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 18, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={yDomain} />
          <Tooltip formatter={(v: any) => [fmt(v), name]} />
          {refY !== undefined ? <ReferenceLine y={refY} stroke="#dc2626" strokeDasharray="4 4" label={{ value: refLabel, fontSize: 10, fill: '#dc2626', position: 'insideTopRight' }} /> : null}
          <Line type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls>
            {labels ? <LabelList dataKey={yKey} position="top" fontSize={10} formatter={fmt} /> : null}
          </Line>
        </LineChart>
      </ResponsiveContainer>
    )
  }
  const horizontal = kind === 'bar'
  return (
    <ResponsiveContainer width="100%" height={horizontal ? Math.max(height, data.length * 26 + 40) : height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 18, right: horizontal ? 40 : 16, left: horizontal ? 8 : 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        {horizontal ? <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} domain={yDomain} /> : <XAxis dataKey={xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />}
        {horizontal ? <YAxis type="category" dataKey={xKey} width={150} tick={{ fontSize: 10 }} interval={0} /> : <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={yDomain} />}
        <Tooltip formatter={(v: any) => [fmt(v), name]} />
        {refY !== undefined ? (horizontal ? <ReferenceLine x={refY} stroke="#dc2626" strokeDasharray="4 4" /> : <ReferenceLine y={refY} stroke="#dc2626" strokeDasharray="4 4" label={{ value: refLabel, fontSize: 10, fill: '#dc2626', position: 'insideTopRight' }} />) : null}
        <Bar dataKey={yKey} name={name} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={42}>
          {labels ? <LabelList dataKey={yKey} position={horizontal ? 'right' : 'top'} fontSize={10} formatter={fmt} /> : null}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export type RegionLevel = 'provinsi' | 'kabkota' | 'kecamatan'
export const LEVEL_LABEL: Record<RegionLevel, string> = { provinsi: 'Provinsi', kabkota: 'Kab/Kota', kecamatan: 'Kecamatan' }

/** Kemkes-style regional chart: incidents/cases/deaths per region, level follows the wilayah cascade (overridable). */
export function RegionChart({ ranking, jenis, autoLevel, testId = 'region-chart' }: {
  ranking?: { provinsi: MbgRankRow[]; kabkota: MbgRankRow[]; kecamatan: MbgRankRow[] }; jenis: Jenis; autoLevel: RegionLevel; testId?: string
}) {
  const [kind, setKind] = useState<ChartKind>('column')
  const [labels, setLabels] = useState(true)
  const [sort, setSort] = useState<SortKind>('tertinggi')
  const [level, setLevel] = useState<RegionLevel | null>(null)
  const [all, setAll] = useState(false)
  const lv = level || autoLevel
  const rows = useMemo(() => {
    const r = [...(ranking?.[lv] || [])].filter((x) => x.name !== '(Belum diisi)' || x[jenis] > 0)
    if (sort === 'nama') r.sort((a, b) => a.name.localeCompare(b.name, 'id'))
    else if (sort === 'tertinggi') r.sort((a, b) => b[jenis] - a[jenis] || a.name.localeCompare(b.name, 'id'))
    else r.sort((a, b) => a[jenis] - b[jenis] || a.name.localeCompare(b.name, 'id'))
    return r
  }, [ranking, lv, sort, jenis])
  const shown = all ? rows : rows.slice(0, 40)
  return (
    <div data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Seg value={lv} onChange={(v) => setLevel(v)} options={(['provinsi', 'kabkota', 'kecamatan'] as RegionLevel[]).map((v) => ({ value: v, label: LEVEL_LABEL[v] }))} />
        <ChartToolbar kind={kind} setKind={setKind} labels={labels} setLabels={setLabels} sort={sort} setSort={setSort} />
      </div>
      {!shown.length ? <EmptyBox msg={`Belum ada ${jenisLabel(jenis).toLowerCase()} per ${LEVEL_LABEL[lv].toLowerCase()} pada filter ini.`} /> : (
        <>
          <SeriesChart data={shown} xKey="name" yKey={jenis} name={jenisLabel(jenis)} kind={kind} labels={labels} color={JENIS_COLOR[jenis]} height={320} />
          {rows.length > 40 ? (
            <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 text-[11px] font-bold text-primary hover:underline">
              {all ? 'Tampilkan 40 teratas' : `Tampilkan semua ${nf(rows.length)} ${LEVEL_LABEL[lv].toLowerCase()}`}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

/** Epidemic curve by onset/incident date bucketed to the selected granularity (empty buckets kept as zero). */
export function EpiCurve({ series, jenis, gran, testId = 'epi-curve' }: {
  series?: { tanggal: string; kejadian: number; kasus: number; meninggal: number }[]; jenis: Jenis; gran: Gran; testId?: string
}) {
  const [kind, setKind] = useState<ChartKind>('column')
  const [labels, setLabels] = useState(false)
  const data = useMemo(() => aggregateSeries(series || [], gran, ['kejadian', 'kasus', 'meninggal']), [series, gran])
  return (
    <div data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2"><ChartToolbar kind={kind} setKind={setKind} labels={labels} setLabels={setLabels} /></div>
      {!data.length ? <EmptyBox msg="Belum ada kejadian keracunan pada periode & wilayah terpilih." /> : (
        <SeriesChart data={data} xKey="label" yKey={jenis} name={jenisLabel(jenis)} kind={kind} labels={labels} color={JENIS_COLOR[jenis]} height={300} />
      )}
    </div>
  )
}

/** Average supervision score trend (F3–F11) with the 80 threshold, plus visit volume as context. */
export function SkorTrend({ series, gran }: { series?: { tanggal: string; kunjungan: number; skor_sum: number; skor_n: number }[]; gran: Gran }) {
  const [kind, setKind] = useState<ChartKind>('line')
  const [labels, setLabels] = useState(true)
  const data = useMemo(() => aggregateSeries(series || [], gran, ['kunjungan', 'skor_sum', 'skor_n']).map((r) => ({ ...r, skor: r.skor_n ? Math.round((r.skor_sum / r.skor_n) * 10) / 10 : null })), [series, gran])
  return (
    <div data-testid="skor-trend">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2"><ChartToolbar kind={kind} setKind={setKind} labels={labels} setLabels={setLabels} /></div>
      {!data.some((d) => d.skor !== null) ? <EmptyBox msg="Belum ada skor penerapan SOP (F3–F11) pada periode terpilih." /> : (
        <SeriesChart data={data} xKey="label" yKey="skor" name="Rata-rata skor SOP" kind={kind} labels={labels} color="#047857" height={280} refY={80} refLabel="Ambang 80" yDomain={[0, 100]} />
      )}
    </div>
  )
}
