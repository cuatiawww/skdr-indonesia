'use client'
// PR 035: Halaman 1 — Dasbor EBS (data langsung dari Transaksi Form Laporan EBS / `laporan_ebs`).
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Building2, CheckCircle2, FileText, FlaskConical,
  Radio, RotateCcw, ShieldAlert, Skull, Users,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fetchEbsDash, type EbsDashData } from '@/lib/dasbor-ebs-ibs-api'
import { EbsMatrixHeatmap } from '@/components/dasbor-ebs-ibs/EbsIbsHeatmap'
import { ErrorState, SkeletonChart, SkeletonMap } from '@/components/ui/Skeleton'

const EbsIbsLayerMap = dynamic(() => import('@/components/dasbor-ebs-ibs/EbsIbsLayerMap'), {
  ssr: false,
  loading: () => <SkeletonMap />,
})

const nf = (v: number | null | undefined) => new Intl.NumberFormat('id-ID').format(v ?? 0)
const pf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`)

type Filters = {
  status: string
  from: string
  to: string
  province_id: string
  kabkota_id: string
  penyakit: string
  jenis_unit: string
  status_kejadian: string
  klb: string
}

const EMPTY_FILTERS: Filters = {
  status: 'all',
  from: '',
  to: '',
  province_id: '',
  kabkota_id: '',
  penyakit: '',
  jenis_unit: '',
  status_kejadian: '',
  klb: 'all',
}

function EmptyBox({ msg }: { msg: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-xs text-slate-500">
      {msg}
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'teal',
}: {
  icon: any
  label: string
  value: string
  sub?: string
  tone?: 'teal' | 'blue' | 'red' | 'amber' | 'emerald' | 'slate'
}) {
  const toneCls: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700 border-teal-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  return (
    <div className="skdr-card flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneCls[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}

export default function EbsDashboardView({ onCount }: { onCount?: (n: number) => void }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS)
  const [mapLevel, setMapLevel] = useState<'prov' | 'kab'>('prov')
  const [mapParent, setMapParent] = useState<{ id: number; name: string } | null>(null)
  const [data, setData] = useState<EbsDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [retry, setRetry] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(false)
    try {
      const res = await fetchEbsDash({
        ...f,
        level: mapLevel,
        parent: mapParent?.id,
      })
      setData(res)
      onCount?.(res.kpis.total_laporan)
    } catch {
      setErr(true)
    } finally {
      setLoading(false)
    }
  }, [f, mapLevel, mapParent, onCount])

  useEffect(() => {
    load()
  }, [load, retry])

  const kabOpts = useMemo(() => {
    const all = data?.filter_options.kabkota || []
    if (!f.province_id) return all
    return all.filter((k) => String(k.province_id) === f.province_id)
  }, [data, f.province_id])

  const hasFilter = Object.entries(f).some(([k, v]) => (k === 'status' || k === 'klb' ? v !== 'all' : v !== ''))

  const resetAll = () => {
    setF(EMPTY_FILTERS)
    setMapLevel('prov')
    setMapParent(null)
  }

  const pyramidData = useMemo(() => {
    return (data?.age_sex_pyramid || []).map((r) => ({
      label: r.label,
      pria_neg: -r.pria,
      pria: r.pria,
      wanita: r.wanita,
      total: r.total,
    }))
  }, [data])
  const hasAgeData = pyramidData.some((r) => r.total > 0)

  return (
    <div className="space-y-5" data-testid="ebs-dashboard-view">
      {/* Filter Bar */}
      <div className="skdr-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-teal-700" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Filter Transaksi Form Laporan EBS
            </span>
            {data?.kpis.date_min && data?.kpis.date_max ? (
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800">
                Rentang data: {data.kpis.date_min} s.d. {data.kpis.date_max}
              </span>
            ) : null}
          </div>
          {hasFilter ? (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Filter
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Status Laporan
            <select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua Status</option>
              <option value="dikirim">Dikirim</option>
              <option value="draf">Draf</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Dari Tanggal
            <input
              type="date"
              value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Sampai Tanggal
            <input
              type="date"
              value={f.to}
              onChange={(e) => setF({ ...f, to: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Provinsi
            <select
              value={f.province_id}
              onChange={(e) => setF({ ...f, province_id: e.target.value, kabkota_id: '' })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua Provinsi</option>
              {(data?.filter_options.provinces || []).map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Kab/Kota
            <select
              value={f.kabkota_id}
              onChange={(e) => setF({ ...f, kabkota_id: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua Kab/Kota</option>
              {kabOpts.map((k) => (
                <option key={k.id} value={String(k.id)}>{k.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Penyakit Rumor
            <select
              value={f.penyakit}
              onChange={(e) => setF({ ...f, penyakit: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua Penyakit</option>
              {(data?.filter_options.penyakit || []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Jenis Unit
            <select
              value={f.jenis_unit}
              onChange={(e) => setF({ ...f, jenis_unit: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua Unit</option>
              {(data?.filter_options.jenis_unit || []).map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Status Kejadian
            <select
              value={f.status_kejadian}
              onChange={(e) => setF({ ...f, status_kejadian: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua Status Kejadian</option>
              {(data?.filter_options.status_kejadian || []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Kriteria KLB
            <select
              value={f.klb}
              onChange={(e) => setF({ ...f, klb: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua</option>
              <option value="Ya">Ya (KLB)</option>
              <option value="Tidak">Bukan KLB</option>
            </select>
          </label>
        </div>
      </div>

      {err ? <ErrorState onRetry={() => setRetry((x) => x + 1)} /> : null}

      {loading && !data ? (
        <div className="space-y-4">
          <SkeletonMap />
          <SkeletonChart />
        </div>
      ) : data ? (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              icon={FileText}
              label="Total Laporan EBS"
              value={nf(data.kpis.total_laporan)}
              sub={`${nf(data.kpis.dikirim)} dikirim · ${nf(data.kpis.draf)} draf`}
              tone="teal"
            />
            <KpiCard
              icon={Users}
              label="Total Kasus"
              value={nf(data.kpis.total_kasus)}
              sub="Dari isian Jumlah Kasus Form EBS"
              tone="blue"
            />
            <KpiCard
              icon={Skull}
              label="Kematian & CFR"
              value={nf(data.kpis.total_kematian)}
              sub={`CFR: ${pf(data.kpis.cfr_pct)}`}
              tone="red"
            />
            <KpiCard
              icon={ShieldAlert}
              label="Laporan KLB (Ya)"
              value={nf(data.kpis.klb_ya)}
              sub={`${nf(data.kpis.klb_berlangsung)} berlangsung · ${nf(data.kpis.klb_berakhir)} berakhir`}
              tone="amber"
            />
            <KpiCard
              icon={FlaskConical}
              label="Dukungan Lab"
              value={nf(data.kpis.spesimen_ya)}
              sub={`Diperiksa: ${nf(data.kpis.lab_diperiksa)} · Positif: ${nf(data.kpis.lab_positif)}`}
              tone="emerald"
            />
            <KpiCard
              icon={Building2}
              label="Cakupan Pelapor"
              value={nf(data.kpis.unit_unik)}
              sub={`${nf(data.kpis.provinsi_unik)} provinsi · ${nf(data.kpis.kabkota_unik)} kab/kota`}
              tone="slate"
            />
          </div>

          {/* Spatial Layer Map + Region Ranking */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <EbsIbsLayerMap
                mode="ebs"
                level={data.map.level}
                parentName={mapParent?.name}
                regions={data.map.regions}
                points={data.map.points}
                onDrillDown={(id, name) => {
                  setMapLevel('kab')
                  setMapParent({ id, name })
                }}
                onResetLevel={() => {
                  setMapLevel('prov')
                  setMapParent(null)
                }}
              />
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Rekap {data.map.level === 'kab' ? 'Kab/Kota' : 'Provinsi'} Pelapor EBS
                  </h3>
                  <p className="text-xs text-slate-500">Berdasarkan lokasi laporan di transaksi EBS</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {nf(data.map.regions.length)} wilayah
                </span>
              </div>
              {!data.map.regions.length ? (
                <EmptyBox msg="Belum ada wilayah pada transaksi Form Laporan EBS." />
              ) : (
                <div className="max-h-[440px] flex-1 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2">Wilayah</th>
                        <th className="py-2 text-right">Lap</th>
                        <th className="py-2 text-right">Kasus</th>
                        <th className="py-2 text-right">Mati</th>
                        <th className="py-2 text-right">KLB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map.regions.map((r) => (
                        <tr
                          key={r.key}
                          className={data.map.level === 'prov' ? 'cursor-pointer hover:bg-teal-50/50' : 'hover:bg-slate-50'}
                          onClick={() => {
                            if (data.map.level === 'prov') {
                              const id = Number(r.key)
                              if (Number.isFinite(id) && id > 0) {
                                setMapLevel('kab')
                                setMapParent({ id, name: r.name })
                              }
                            }
                          }}
                        >
                          <td className="py-2 pr-2 font-semibold text-slate-800">{r.name}</td>
                          <td className="py-2 text-right tabular-nums text-slate-700">{nf(r.laporan)}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-teal-800">{nf(r.kasus)}</td>
                          <td className="py-2 text-right tabular-nums text-red-600">{nf(r.kematian)}</td>
                          <td className="py-2 text-right tabular-nums text-amber-700">{nf(r.klb)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Heatmap */}
          <EbsMatrixHeatmap heatmap={data.heatmap} />

          {/* Weekly Trend & Top Diseases */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Tren Mingguan Rumor &amp; Kasus EBS</h3>
                <p className="text-xs text-slate-500">Berdasarkan Minggu Epid tanggal rumor / laporan</p>
              </div>
              {!data.weekly_trend.length ? (
                <EmptyBox msg="Belum ada data tren mingguan pada transaksi EBS." />
              ) : (
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.weekly_trend} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="right" dataKey="laporan" name="Jumlah Laporan" fill="#99f6e4" stroke="#0d9488" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="left" type="monotone" dataKey="kasus" name="Jumlah Kasus" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line yAxisId="left" type="monotone" dataKey="kematian" name="Kematian" stroke="#dc2626" strokeWidth={2} dot={{ r: 2.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Penyakit Rumor Terbanyak (Form EBS)</h3>
                <p className="text-xs text-slate-500">Jumlah kasus &amp; jumlah laporan per penyakit rumor</p>
              </div>
              {!data.by_disease.length ? (
                <EmptyBox msg="Belum ada data penyakit rumor pada transaksi EBS." />
              ) : (
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_disease.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="penyakit" width={150} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="kasus" name="Kasus" fill="#0f766e" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="laporan" name="Laporan" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Age-Sex Pyramid + Status Kejadian / Sumber Informasi */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Distribusi Usia &amp; Jenis Kelamin Kasus EBS</h3>
                <p className="text-xs text-slate-500">Diambil dari matriks usia 11 kelompok umur (Laki-laki vs Perempuan)</p>
              </div>
              {!hasAgeData ? (
                <EmptyBox msg="Belum ada isian matriks usia & jenis kelamin pada transaksi EBS." />
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pyramidData} layout="vertical" stackOffset="sign" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => nf(Math.abs(Number(v)))} />
                      <YAxis type="category" dataKey="label" width={65} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => nf(Math.abs(Number(v)))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="pria_neg" name="Laki-laki" stackId="s" fill="#0284c7" radius={[4, 0, 0, 4]} />
                      <Bar dataKey="wanita" name="Perempuan" stackId="s" fill="#e11d48" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Status Kejadian &amp; Sumber Informasi</h3>
                <p className="text-xs text-slate-500">Klasifikasi verifikasi kejadian dan saluran sumber informasi rumor</p>
              </div>
              {!data.by_status_kejadian.length && !data.by_sumber_informasi.length ? (
                <EmptyBox msg="Belum ada data status kejadian maupun sumber informasi." />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Status Kejadian</div>
                    <div className="space-y-2">
                      {data.by_status_kejadian.map((s) => (
                        <div key={s.status_kejadian} className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs">
                          <div className="font-semibold text-slate-800">{s.status_kejadian}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            <b>{nf(s.laporan)}</b> laporan · <b>{nf(s.kasus)}</b> kasus · <b>{nf(s.kematian)}</b> mati
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Sumber Informasi</div>
                    <div className="space-y-2">
                      {data.by_sumber_informasi.slice(0, 8).map((s) => (
                        <div key={s.sumber} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-xs">
                          <span className="truncate pr-2 font-medium text-slate-700">{s.sumber}</span>
                          <span className="shrink-0 font-mono font-bold text-teal-700">{nf(s.laporan)} lap</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Interventions, Lab & Unit Types */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="skdr-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Respon, KLB &amp; Intervensi</h3>
                  <p className="text-xs text-slate-500">Kelengkapan langkah 4 &amp; 5 Form EBS</p>
                </div>
              </div>
              {!data.kpis.total_laporan ? (
                <EmptyBox msg="Belum ada laporan." />
              ) : (
                <div className="space-y-2.5 text-xs">
                  {data.intervensi.map((iv) => {
                    const tot = iv.ya + iv.tidak + iv.kosong
                    const pYa = tot > 0 ? Math.round((iv.ya * 100) / tot) : 0
                    return (
                      <div key={iv.key}>
                        <div className="flex justify-between font-semibold text-slate-700">
                          <span>{iv.label}</span>
                          <span className="tabular-nums text-teal-800">{nf(iv.ya)} Ya ({pYa}%)</span>
                        </div>
                        <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="bg-teal-600" style={{ width: `${pYa}%` }} />
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          Tidak: {nf(iv.tidak)} · Belum diisi: {nf(iv.kosong)}
                        </div>
                      </div>
                    )
                  })}
                  <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                    Detail KLB (dari {nf(data.kpis.klb_ya)} KLB): W1 <b>{nf(data.kpis.w1_ya)}</b> · SK KLB <b>{nf(data.kpis.sk_klb_ya)}</b> · TGC <b>{nf(data.kpis.tgc_ya)}</b>
                  </div>
                </div>
              )}
            </div>

            <div className="skdr-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Hasil Lab &amp; Jenis Tata Laksana</h3>
                  <p className="text-xs text-slate-500">Dari laporan dengan pengambilan spesimen / tata laksana</p>
                </div>
              </div>
              {!data.by_lab_hasil.length && !data.by_tatalaksana.length ? (
                <EmptyBox msg="Belum ada laporan dengan spesimen atau tata laksana kasus." />
              ) : (
                <div className="space-y-4 text-xs">
                  <div>
                    <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Hasil Laboratorium</div>
                    {!data.by_lab_hasil.length ? (
                      <p className="text-slate-400">Tidak ada pengambilan spesimen.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {data.by_lab_hasil.map((l) => (
                          <div key={l.hasil} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                            <span className="truncate pr-2 font-medium text-slate-700">{l.hasil}</span>
                            <span className="shrink-0 font-mono text-[11px] text-slate-600">
                              {nf(l.laporan)} lap · {nf(l.positif)}/{nf(l.diperiksa)} pos
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Jenis Tata Laksana</div>
                    {!data.by_tatalaksana.length ? (
                      <p className="text-slate-400">Tidak ada jenis tata laksana tercatat.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {data.by_tatalaksana.map((t) => (
                          <span key={t.jenis} className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 font-semibold text-teal-800">
                            {t.jenis}: {nf(t.count)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="skdr-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Jenis Unit Pelapor</h3>
                  <p className="text-xs text-slate-500">Distribusi laporan menurut kategori unit</p>
                </div>
              </div>
              {!data.by_jenis_unit.length ? (
                <EmptyBox msg="Belum ada data jenis unit pelapor." />
              ) : (
                <div className="space-y-2 text-xs">
                  {data.by_jenis_unit.map((u) => (
                    <div key={u.jenis_unit} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
                      <div>
                        <div className="font-semibold text-slate-800">{u.jenis_unit}</div>
                        <div className="text-[11px] text-slate-500">{nf(u.unit_unik)} unit unik</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-teal-800">{nf(u.laporan)} lap</div>
                        <div className="text-[11px] text-slate-500">{nf(u.kasus)} kasus</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Non-PII Transaction Table */}
          <div className="skdr-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Transaksi Form Laporan EBS Terbaru</h3>
                <p className="text-xs text-slate-500">Ringkasan non-PII (maks. 50 laporan terbaru sesuai filter)</p>
              </div>
              <Link href="/ebs/laporan" className="text-xs font-bold text-primary hover:underline">
                Buka Daftar Transaksi EBS →
              </Link>
            </div>
            {!data.recent_reports.length ? (
              <div className="p-6 text-center text-xs text-slate-500">Belum ada transaksi Form Laporan EBS yang sesuai filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">No. Laporan</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Tgl Rumor</th>
                      <th className="px-3 py-2.5">Penyakit Rumor</th>
                      <th className="px-3 py-2.5">Status Kejadian</th>
                      <th className="px-3 py-2.5">Unit &amp; Wilayah</th>
                      <th className="px-3 py-2.5 text-right">Kasus</th>
                      <th className="px-3 py-2.5 text-right">Mati</th>
                      <th className="px-3 py-2.5">KLB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recent_reports.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-3 py-2 font-mono font-bold">
                          <Link href={`/ebs/laporan/${r.id}`} className="text-primary hover:underline">{r.no_laporan}</Link>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${r.status === 'dikirim' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.tgl_rumor || r.tgl_laporan || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">
                          {r.penyakit_rumor || '—'}
                          {r.penyakit_terverifikasi ? <div className="text-[10px] font-normal text-teal-700">Verif: {r.penyakit_terverifikasi}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.status_kejadian || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">
                          <div className="font-medium">{r.unit_nama || '—'}</div>
                          <div className="text-[10px] text-slate-400">{[r.kabkota_name, r.province_name].filter(Boolean).join(', ') || '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{r.jml_kasus ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">{r.jml_kematian ?? 0}</td>
                        <td className="px-3 py-2">
                          {r.klb === 'Ya' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              <AlertTriangle className="h-3 w-3" /> {r.klb_status || 'Ya'}
                            </span>
                          ) : (
                            <span className="text-slate-400">{r.klb || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
