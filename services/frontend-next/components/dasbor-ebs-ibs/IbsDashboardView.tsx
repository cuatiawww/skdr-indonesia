'use client'
// PR 035: Halaman 2 — Dasbor IBS (data langsung dari Transaksi Entri Data Agregat `laporan_ibs` & Form Individu `laporan_ibs_individu`).
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, Building2, ClipboardList, FileSpreadsheet, FlaskConical,
  HeartPulse, RotateCcw, Skull, Stethoscope, Users,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fetchIbsDash, type IbsDashData, type VitalStat } from '@/lib/dasbor-ebs-ibs-api'
import { IbsMatrixHeatmap } from '@/components/dasbor-ebs-ibs/EbsIbsHeatmap'
import { ErrorState, SkeletonChart, SkeletonMap } from '@/components/ui/Skeleton'

const EbsIbsLayerMap = dynamic(() => import('@/components/dasbor-ebs-ibs/EbsIbsLayerMap'), {
  ssr: false,
  loading: () => <SkeletonMap />,
})

const nf = (v: number | null | undefined) => new Intl.NumberFormat('id-ID').format(v ?? 0)
const pf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`)

type Filters = {
  ibs_source: string
  status: string
  tahun: string
  start_week: string
  end_week: string
  province_id: string
  kabkota_id: string
  penyakit: string
  jenis_unit: string
}

const EMPTY_FILTERS: Filters = {
  ibs_source: 'all',
  status: 'all',
  tahun: '',
  start_week: '',
  end_week: '',
  province_id: '',
  kabkota_id: '',
  penyakit: '',
  jenis_unit: '',
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
  tone = 'blue',
}: {
  icon: any
  label: string
  value: string
  sub?: string
  tone?: 'blue' | 'violet' | 'red' | 'emerald' | 'amber' | 'slate'
}) {
  const toneCls: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
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

function VitalCard({ label, unit, stat }: { label: string; unit: string; stat: VitalStat }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
      <div className="font-bold text-slate-700">{label}</div>
      {stat.count === 0 ? (
        <div className="mt-1.5 text-[11px] text-slate-400">Belum ada isian</div>
      ) : (
        <>
          <div className="mt-1 text-lg font-black text-violet-800 tabular-nums">
            {stat.avg} <span className="text-xs font-semibold text-slate-500">{unit}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Min {stat.min} · Maks {stat.max} ({nf(stat.count)} pasien)
          </div>
        </>
      )}
    </div>
  )
}

export default function IbsDashboardView({ onCount }: { onCount?: (n: number) => void }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS)
  const [mapLevel, setMapLevel] = useState<'prov' | 'kab'>('prov')
  const [mapParent, setMapParent] = useState<{ id: number; name: string } | null>(null)
  const [data, setData] = useState<IbsDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [retry, setRetry] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(false)
    try {
      const res = await fetchIbsDash({
        ...f,
        level: mapLevel,
        parent: mapParent?.id,
      })
      setData(res)
      onCount?.(res.kpis.agregat.total_laporan + res.kpis.individu.total_laporan)
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

  const hasFilter = Object.entries(f).some(([k, v]) => (k === 'status' || k === 'ibs_source' ? v !== 'all' : v !== ''))

  const resetAll = () => {
    setF(EMPTY_FILTERS)
    setMapLevel('prov')
    setMapParent(null)
  }

  const activeDiseases = useMemo(() => {
    return (data?.by_disease || [])
      .filter((d) => d.agregat_kasus > 0 || d.individu_pasien > 0 || d.agregat_lab > 0)
      .map((d) => ({ ...d, label: `${d.kode_sms} · ${d.nama}` }))
  }, [data])

  const pyramidData = useMemo(() => {
    return (data?.individu_demographics.by_age_group || []).map((r) => ({
      group: r.group,
      pria_neg: -r.pria,
      pria: r.pria,
      wanita: r.wanita,
      total: r.total,
    }))
  }, [data])
  const hasIndAge = pyramidData.some((r) => r.total > 0)

  const showAgr = f.ibs_source !== 'individu'
  const showInd = f.ibs_source !== 'agregat'

  return (
    <div className="space-y-5" data-testid="ibs-dashboard-view">
      {/* Filter Bar */}
      <div className="skdr-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-blue-700" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Filter Transaksi IBS (Entri Data Agregat &amp; Form Individu)
            </span>
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
            Sumber Form IBS
            <select
              value={f.ibs_source}
              onChange={(e) => setF({ ...f, ibs_source: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua (Agregat + Individu)</option>
              <option value="agregat">Entri Data Agregat</option>
              <option value="individu">Form Individu</option>
            </select>
          </label>

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
            Tahun
            <select
              value={f.tahun}
              onChange={(e) => setF({ ...f, tahun: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua Tahun</option>
              {(data?.filter_options.years || []).map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Minggu Awal
            <input
              type="number"
              min={1}
              max={53}
              placeholder="1"
              value={f.start_week}
              onChange={(e) => setF({ ...f, start_week: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Minggu Akhir
            <input
              type="number"
              min={1}
              max={53}
              placeholder="53"
              value={f.end_week}
              onChange={(e) => setF({ ...f, end_week: e.target.value })}
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
            Penyakit Agregat
            <select
              value={f.penyakit}
              onChange={(e) => setF({ ...f, penyakit: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua (24 Penyakit)</option>
              {(data?.filter_options.diseases || []).map((d) => (
                <option key={d.kode} value={d.kode}>{d.kode_sms} — {d.nama}</option>
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
          {/* KPIs Split Clearly: Entri Data Agregat vs Form Individu */}
          {showAgr ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-blue-800">
                <FileSpreadsheet className="h-4 w-4" /> Ringkasan Entri Data Agregat Mingguan (IBS)
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  icon={ClipboardList}
                  label="Laporan Agregat"
                  value={nf(data.kpis.agregat.total_laporan)}
                  sub={`${nf(data.kpis.agregat.dikirim)} dikirim · ${nf(data.kpis.agregat.draf)} draf`}
                  tone="blue"
                />
                <KpiCard
                  icon={Users}
                  label="Total Kasus Agregat"
                  value={nf(data.kpis.agregat.total_kasus)}
                  sub={`Nihil kasus: ${nf(data.kpis.agregat.nihil_count)} laporan`}
                  tone="blue"
                />
                <KpiCard
                  icon={Skull}
                  label="Kematian & CFR"
                  value={nf(data.kpis.agregat.total_kematian)}
                  sub={`CFR Agregat: ${pf(data.kpis.agregat.cfr_pct)}`}
                  tone="red"
                />
                <KpiCard
                  icon={FlaskConical}
                  label="Pemeriksaan Lab"
                  value={nf(data.kpis.agregat.total_lab)}
                  sub="Total kolom Jumlah Lab"
                  tone="emerald"
                />
                <KpiCard
                  icon={Activity}
                  label="Total Kunjungan"
                  value={nf(data.kpis.agregat.total_kunjungan)}
                  sub={`Proporsi kasus: ${pf(data.kpis.agregat.proporsi_kunjungan_pct)}`}
                  tone="amber"
                />
                <KpiCard
                  icon={Building2}
                  label="Unit Pelapor Agregat"
                  value={nf(data.kpis.agregat.unit_unik)}
                  sub={`${nf(data.kpis.agregat.provinsi_unik)} prov · ${nf(data.kpis.agregat.kabkota_unik)} kab/kota`}
                  tone="slate"
                />
              </div>
            </div>
          ) : null}

          {showInd ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-violet-800">
                <Stethoscope className="h-4 w-4" /> Ringkasan Form Individu (Pasien IBS)
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  icon={Stethoscope}
                  label="Total Form Individu"
                  value={nf(data.kpis.individu.total_laporan)}
                  sub={`${nf(data.kpis.individu.dikirim)} dikirim · ${nf(data.kpis.individu.draf)} draf`}
                  tone="violet"
                />
                <KpiCard
                  icon={Users}
                  label="Komposisi Kelamin"
                  value={`${nf(data.kpis.individu.pria)} L / ${nf(data.kpis.individu.wanita)} P`}
                  sub={`${nf(data.kpis.individu.unit_unik)} unit · ${nf(data.kpis.individu.provinsi_unik)} prov`}
                  tone="violet"
                />
                <KpiCard
                  icon={HeartPulse}
                  label="Status Akhir Pasien"
                  value={`${nf(data.kpis.individu.meninggal)} Meninggal`}
                  sub={`Perawatan: ${nf(data.kpis.individu.dalam_perawatan)} · Sakit: ${nf(data.kpis.individu.sakit)} · Sehat: ${nf(data.kpis.individu.sehat)}`}
                  tone="red"
                />
                <KpiCard
                  icon={ClipboardList}
                  label="Kelengkapan Klinis"
                  value={`${nf(data.kpis.individu.dengan_vital)} Vital`}
                  sub={`Catatan SOAP terisi: ${nf(data.kpis.individu.dengan_soap)} pasien`}
                  tone="emerald"
                />
              </div>
            </div>
          ) : null}

          {/* Spatial Layer Map + Region Breakdown */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <EbsIbsLayerMap
                mode="ibs"
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
                    Rekap {data.map.level === 'kab' ? 'Kab/Kota' : 'Provinsi'} IBS
                  </h3>
                  <p className="text-xs text-slate-500">Entri Data Agregat &amp; Form Individu per wilayah</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {nf(data.map.regions.length)} wilayah
                </span>
              </div>
              {!data.map.regions.length ? (
                <EmptyBox msg="Belum ada data wilayah pada transaksi IBS." />
              ) : (
                <div className="max-h-[440px] flex-1 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2">Wilayah</th>
                        <th className="py-2 text-right">Lap Agr</th>
                        <th className="py-2 text-right">Kasus Agr</th>
                        <th className="py-2 text-right">Pasien Ind</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map.regions.map((r) => (
                        <tr
                          key={r.key}
                          className={data.map.level === 'prov' ? 'cursor-pointer hover:bg-blue-50/50' : 'hover:bg-slate-50'}
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
                          <td className="py-2 text-right tabular-nums text-slate-600">{nf(r.agregat_laporan)}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-blue-700">{nf(r.agregat_kasus)}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-violet-700">{nf(r.individu_pasien)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Matrix Heatmap */}
          <IbsMatrixHeatmap heatmap={data.heatmap} />

          {/* Weekly Trend & Disease Breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Tren Mingguan IBS (Minggu Epid)</h3>
                <p className="text-xs text-slate-500">Sumbu terpisah: Kasus Agregat (kiri) vs Pasien Form Individu (kanan)</p>
              </div>
              {!data.weekly_trend.length ? (
                <EmptyBox msg="Belum ada data mingguan transaksi IBS." />
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.weekly_trend} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="agr" tick={{ fontSize: 11, fill: '#1d4ed8' }} allowDecimals={false} />
                      <YAxis yAxisId="ind" orientation="right" tick={{ fontSize: 11, fill: '#7c3aed' }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {showAgr ? <Bar yAxisId="agr" dataKey="agregat_kasus" name="Kasus Agregat" fill="#93c5fd" stroke="#2563eb" radius={[4, 4, 0, 0]} /> : null}
                      {showAgr ? <Line yAxisId="agr" type="monotone" dataKey="agregat_lab" name="Pemeriksaan Lab" stroke="#0d9488" strokeWidth={2} dot={{ r: 2.5 }} /> : null}
                      {showInd ? <Line yAxisId="ind" type="monotone" dataKey="individu_pasien" name="Pasien Form Individu" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} /> : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Penyakit Agregat Terlapor (24 Penyakit SKDR-IBS)</h3>
                <p className="text-xs text-slate-500">Hanya menampilkan penyakit dengan kasus/pasien &gt; 0 pada transaksi aktif</p>
              </div>
              {!activeDiseases.length ? (
                <EmptyBox msg="Belum ada kasus atau pasien tercatat di tabel 24 penyakit IBS." />
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activeDiseases.slice(0, 12)} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {showAgr ? <Bar dataKey="agregat_kasus" name="Kasus Agregat" fill="#2563eb" radius={[0, 4, 4, 0]} /> : null}
                      {showInd ? <Bar dataKey="individu_pasien" name="Pasien Form Individu" fill="#7c3aed" radius={[0, 4, 4, 0]} /> : null}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Individual Form Demographics & Clinical Vitals */}
          {showInd ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="skdr-card flex flex-col p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-800">Demografi Umur &amp; Kelamin (Form Individu)</h3>
                  <p className="text-xs text-slate-500">Piramida pasien berdasarkan tahun/bulan/hari di Form Individu</p>
                </div>
                {!hasIndAge ? (
                  <EmptyBox msg="Belum ada data pasien pada Form Individu IBS." />
                ) : (
                  <div className="h-[290px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pyramidData} layout="vertical" stackOffset="sign" margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => nf(Math.abs(Number(v)))} />
                        <YAxis type="category" dataKey="group" width={78} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => nf(Math.abs(Number(v)))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="pria_neg" name="Pria" stackId="s" fill="#0284c7" radius={[4, 0, 0, 4]} />
                        <Bar dataKey="wanita" name="Wanita" stackId="s" fill="#e11d48" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="skdr-card p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-800">Status Akhir, Imunisasi &amp; Pekerjaan</h3>
                  <p className="text-xs text-slate-500">Agregasi klinis dari Form Individu (non-PII)</p>
                </div>
                {!data.kpis.individu.total_laporan ? (
                  <EmptyBox msg="Belum ada data Form Individu." />
                ) : (
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">Status Akhir</div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.individu_demographics.by_status_akhir.map((s) => (
                          <span key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                            {s.label}: <b className="text-violet-800">{nf(s.count)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">Status Imunisasi</div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.individu_demographics.by_status_imunisasi.map((s) => (
                          <span key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                            {s.label}: <b>{nf(s.count)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">Pekerjaan Teratas</div>
                      <div className="space-y-1">
                        {data.individu_demographics.by_pekerjaan.slice(0, 5).map((p) => (
                          <div key={p.label} className="flex justify-between rounded bg-slate-50 px-2.5 py-1">
                            <span className="text-slate-700">{p.label}</span>
                            <span className="font-mono font-bold text-slate-800">{nf(p.count)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="skdr-card p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-800">Tanda Vital &amp; Antropometri (Form Individu)</h3>
                  <p className="text-xs text-slate-500">Rata-rata, min &amp; maks dari pasien yang diukur</p>
                </div>
                {!data.kpis.individu.total_laporan ? (
                  <EmptyBox msg="Belum ada data pemeriksaan Form Individu." />
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <VitalCard label="Suhu Tubuh" unit="°C" stat={data.individu_demographics.vital_summary.suhu} />
                      <VitalCard label="IMT" unit="kg/m²" stat={data.individu_demographics.vital_summary.imt} />
                      <VitalCard label="Sistole" unit="mmHg" stat={data.individu_demographics.vital_summary.sistole} />
                      <VitalCard label="Diastole" unit="mmHg" stat={data.individu_demographics.vital_summary.diastole} />
                    </div>
                    <div className="text-xs">
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">Kategori IMT</div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.individu_demographics.by_imt_kategori.filter((k) => k.count > 0).map((k) => (
                          <span key={k.kategori} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-semibold text-violet-800">
                            {k.kategori}: {nf(k.count)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Reporting Units Breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="skdr-card p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-800">Jenis &amp; Kelompok Unit Pelapor</h3>
              </div>
              {!data.by_jenis_unit.length && !data.by_kelompok.length ? (
                <EmptyBox msg="Belum ada data unit pelapor." />
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5">
                    {data.by_jenis_unit.map((u) => (
                      <div key={u.jenis_unit} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                        <span className="font-semibold text-slate-800">{u.jenis_unit}</span>
                        <span className="font-mono text-[11px] text-slate-600">
                          Agr: <b>{nf(u.agregat_laporan)}</b> ({nf(u.agregat_kasus)} ks) · Ind: <b>{nf(u.individu_pasien)}</b>
                        </span>
                      </div>
                    ))}
                  </div>
                  {data.by_kelompok.length ? (
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">Kelompok Unit (Agregat)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.by_kelompok.map((k) => (
                          <span key={k.kelompok} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                            {k.kelompok}: {nf(k.laporan)} lap ({nf(k.kasus)} ks)
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="skdr-card p-4 lg:col-span-2">
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Unit / Puskesmas Pelapor Teratas</h3>
                  <p className="text-xs text-slate-500">Diurutkan berdasarkan total kasus agregat dan pasien form individu</p>
                </div>
                <span className="text-xs font-semibold text-slate-500">{nf(data.top_units.length)} unit</span>
              </div>
              {!data.top_units.length ? (
                <EmptyBox msg="Belum ada unit pelapor pada filter aktif." />
              ) : (
                <div className="max-h-[260px] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2">Unit Pelapor</th>
                        <th className="py-2 pr-2">Wilayah</th>
                        <th className="py-2 text-right">Lap Agr</th>
                        <th className="py-2 text-right">Kasus Agr</th>
                        <th className="py-2 text-right">Kunjungan</th>
                        <th className="py-2 text-right">Pasien Ind</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.top_units.map((u, idx) => (
                        <tr key={`${u.unit_nama}-${idx}`} className="hover:bg-slate-50/70">
                          <td className="py-2 pr-2 font-semibold text-slate-800">
                            {u.unit_nama}
                            {u.jenis_unit ? <div className="text-[10px] font-normal text-slate-400">{u.jenis_unit}</div> : null}
                          </td>
                          <td className="py-2 pr-2 text-slate-600">{[u.kabkota_name, u.province_name].filter(Boolean).join(', ') || '—'}</td>
                          <td className="py-2 text-right tabular-nums">{nf(u.agregat_laporan)}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-blue-700">{nf(u.agregat_kasus)}</td>
                          <td className="py-2 text-right tabular-nums text-slate-600">{nf(u.agregat_kunjungan)}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-violet-700">{nf(u.individu_pasien)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Recent Non-PII Transaction Tables */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {showAgr ? (
              <div className="skdr-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Entri Data Agregat Terbaru</h3>
                    <p className="text-xs text-slate-500">Maks. 50 laporan mingguan sesuai filter</p>
                  </div>
                  <Link href="/ibs/laporan" className="text-xs font-bold text-primary hover:underline">
                    Daftar Agregat →
                  </Link>
                </div>
                {!data.recent_agregat.length ? (
                  <div className="p-6 text-center text-xs text-slate-500">Belum ada transaksi Entri Data Agregat.</div>
                ) : (
                  <div className="max-h-[340px] overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2">No. Laporan</th>
                          <th className="px-3 py-2">Periode</th>
                          <th className="px-3 py-2">Unit &amp; Wilayah</th>
                          <th className="px-3 py-2 text-right">Kasus</th>
                          <th className="px-3 py-2 text-right">Kunj.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.recent_agregat.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-3 py-2 font-mono font-bold">
                              <Link href={`/ibs/laporan/${r.id}`} className="text-primary hover:underline">{r.no_laporan}</Link>
                              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] uppercase ${r.status === 'dikirim' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                              {r.tahun && r.minggu ? `M${String(r.minggu).padStart(2, '0')}/${r.tahun}` : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-800">{r.unit_nama || '—'}</div>
                              <div className="text-[10px] text-slate-400">{[r.kabkota_name, r.province_name].filter(Boolean).join(', ') || '—'}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-blue-700">{nf(r.total_kasus)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{nf(r.total_kunjungan)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {showInd ? (
              <div className="skdr-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Form Individu Terbaru (Non-PII)</h3>
                    <p className="text-xs text-slate-500">Tanpa identitas pribadi pasien; maks. 50 laporan</p>
                  </div>
                  <Link href="/ibs/individu" className="text-xs font-bold text-primary hover:underline">
                    Daftar Form Individu →
                  </Link>
                </div>
                {!data.recent_individu.length ? (
                  <div className="p-6 text-center text-xs text-slate-500">Belum ada transaksi Form Individu IBS.</div>
                ) : (
                  <div className="max-h-[340px] overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2">No. Laporan</th>
                          <th className="px-3 py-2">Penyakit &amp; Tgl</th>
                          <th className="px-3 py-2">Demografi</th>
                          <th className="px-3 py-2">Unit &amp; Wilayah</th>
                          <th className="px-3 py-2">Status Akhir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.recent_individu.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-3 py-2 font-mono font-bold">
                              <Link href={`/ibs/individu/${r.id}`} className="text-primary hover:underline">{r.no_laporan}</Link>
                              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] uppercase ${r.status === 'dikirim' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-800">{r.penyakit_label || r.penyakit_kode || '—'}</div>
                              <div className="text-[10px] text-slate-400">{r.tgl_periksa || '—'}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                              {[r.kelamin, r.umur].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-800">{r.unit_nama || '—'}</div>
                              <div className="text-[10px] text-slate-400">{[r.kabkota_name, r.province_name].filter(Boolean).join(', ') || '—'}</div>
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-700">{r.status_akhir || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

