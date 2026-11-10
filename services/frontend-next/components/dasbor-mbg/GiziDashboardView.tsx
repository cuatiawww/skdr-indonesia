'use client'
// PR 036: Halaman 1 — Pengawasan Gizi MBG (langsung dari transaksi `mbg_kunjungan` & `mbg_form` Form 1–13).
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award, Building2, CheckCircle2, ClipboardCheck, ClipboardList,
  MapPin, RotateCcw, ShieldAlert, Utensils,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fetchGiziDash, type GiziDashData } from '@/lib/dasbor-mbg-api'
import { GiziMatrixHeatmap } from '@/components/dasbor-mbg/MbgHeatmap'
import { EmptyBox, KpiCard, RatioBar, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { ErrorState, SkeletonChart, SkeletonMap } from '@/components/ui/Skeleton'

const EbsIbsLayerMap = dynamic(() => import('@/components/dasbor-ebs-ibs/EbsIbsLayerMap'), {
  ssr: false,
  loading: () => <SkeletonMap />,
})

type Filters = {
  status: string
  rekap12: string
  from: string
  to: string
  province_id: string
  kabkota_id: string
  sppg: string
}

const EMPTY_FILTERS: Filters = {
  status: 'all',
  rekap12: 'all',
  from: '',
  to: '',
  province_id: '',
  kabkota_id: '',
  sppg: '',
}

export default function GiziDashboardView({ onCount }: { onCount?: (n: number) => void }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS)
  const [mapLevel, setMapLevel] = useState<'prov' | 'kab'>('prov')
  const [mapParent, setMapParent] = useState<{ id: number; name: string } | null>(null)
  const [data, setData] = useState<GiziDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [retry, setRetry] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(false)
    try {
      const res = await fetchGiziDash({
        ...f,
        level: mapLevel,
        parent: mapParent?.id ?? '',
      })
      setData(res)
      onCount?.(res.kpis.total_kunjungan)
    } catch {
      setErr(true)
    } finally {
      setLoading(false)
    }
  }, [f, mapLevel, mapParent, onCount])

  useEffect(() => { load() }, [load, retry])

  const kabOptions = useMemo(() => {
    const all = data?.filter_options.kabkota || []
    if (!f.province_id) return all
    return all.filter((k) => String(k.province_id) === f.province_id)
  }, [data, f.province_id])

  const hasFilters = Boolean(
    f.status !== 'all' || f.rekap12 !== 'all' || f.from || f.to || f.province_id || f.kabkota_id || f.sppg,
  )

  return (
    <div className="space-y-5" data-testid="gizi-dashboard-view">
      {/* Filter Bar */}
      <div className="skdr-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Utensils className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Filter Pengawasan Gizi MBG</h3>
              <p className="text-xs text-slate-500">
                Sumber langsung: transaksi <code className="text-[11px]">mbg_kunjungan</code> &amp; <code className="text-[11px]">mbg_form</code> (Form 1–13)
                {data?.kpis.date_min ? ` · Periode data: ${data.kpis.date_min} s/d ${data.kpis.date_max}` : ''}
              </p>
            </div>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setF(EMPTY_FILTERS)
                setMapLevel('prov')
                setMapParent(null)
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Filter
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Status Kunjungan
            <select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua (Dikirim &amp; Draf)</option>
              <option value="dikirim">Dikirim</option>
              <option value="draf">Draf</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Rekap Standar Gizi (F12)
            <select
              value={f.rekap12}
              onChange={(e) => setF({ ...f, rekap12: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua Rekap F12</option>
              <option value="BAIK">BAIK</option>
              <option value="BELUM BAIK">BELUM BAIK</option>
              <option value="belum">Belum Ada Rekap F12</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Tanggal Dari
            <input
              type="date"
              value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Tanggal Sampai
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
            Kabupaten / Kota
            <select
              value={f.kabkota_id}
              onChange={(e) => setF({ ...f, kabkota_id: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua Kab/Kota</option>
              {kabOptions.map((k) => (
                <option key={k.id} value={String(k.id)}>{k.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Nama SPPG
            <select
              value={f.sppg}
              onChange={(e) => setF({ ...f, sppg: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="">Semua SPPG</option>
              {(data?.filter_options.sppg || []).map((s) => (
                <option key={s} value={s}>{s}</option>
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
          {/* 6 Executive KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              icon={ClipboardCheck}
              label="Total Kunjungan"
              value={nf(data.kpis.total_kunjungan)}
              sub={`${nf(data.kpis.dikirim)} dikirim · ${nf(data.kpis.draf)} draf`}
              tone="emerald"
            />
            <KpiCard
              icon={Building2}
              label="Cakupan SPPG & Wilayah"
              value={nf(data.kpis.sppg_unik)}
              sub={`${nf(data.kpis.puskesmas_unik)} PKM · ${nf(data.kpis.provinsi_unik)} prov · ${nf(data.kpis.kabkota_unik)} kab/kota`}
              tone="teal"
            />
            <KpiCard
              icon={Award}
              label="Standar Gizi (F12 BAIK)"
              value={nf(data.kpis.rekap12_baik)}
              sub={`${nf(data.kpis.rekap12_belum_baik)} BELUM BAIK`}
              tone={data.kpis.rekap12_belum_baik > 0 ? 'amber' : 'emerald'}
            />
            <KpiCard
              icon={CheckCircle2}
              label="Daya Terima (F13 BAIK)"
              value={nf(data.kpis.rekap13_baik)}
              sub={`${nf(data.kpis.rekap13_belum_baik)} BELUM BAIK`}
              tone="blue"
            />
            <KpiCard
              icon={ClipboardList}
              label="Rata-rata Skor SOP"
              value={pf(data.kpis.avg_skor_sop)}
              sub={`${nf(data.kpis.total_formulir_tersimpan)} form (${nf(data.kpis.total_formulir_dikirim)} dikirim)`}
              tone="slate"
            />
            <KpiCard
              icon={ShieldAlert}
              label="Wilayah 3T & Alergi"
              value={nf(data.kpis.wilayah_3t_ya)}
              sub={`Kunjungan lapor alergi (F11): ${nf(data.kpis.alergi_ya)}`}
              tone="amber"
            />
          </div>

          {/* Spatial Layer Map + Region Ranking */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <EbsIbsLayerMap
                mode="gizi"
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
                    Rekap {data.map.level === 'kab' ? 'Kab/Kota' : 'Provinsi'} Pengawasan
                  </h3>
                  <p className="text-xs text-slate-500">Klik baris provinsi untuk drill-down peta</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {nf(data.map.regions.length)} wilayah
                </span>
              </div>
              {!data.map.regions.length ? (
                <EmptyBox msg="Belum ada wilayah pada transaksi Pengawasan Gizi MBG." />
              ) : (
                <div className="max-h-[440px] flex-1 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2">Wilayah</th>
                        <th className="py-2 text-right">Kunj</th>
                        <th className="py-2 text-right">SPPG</th>
                        <th className="py-2 text-right">F12 Baik</th>
                        <th className="py-2 text-right">Blm</th>
                        <th className="py-2 text-right">Skor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map.regions.map((r) => (
                        <tr
                          key={r.key}
                          className={data.map.level === 'prov' ? 'cursor-pointer hover:bg-emerald-50/50' : 'hover:bg-slate-50'}
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
                          <td className="py-2 text-right font-bold tabular-nums text-emerald-800">{nf(r.kunjungan)}</td>
                          <td className="py-2 text-right tabular-nums text-slate-700">{nf(r.sppg_unik)}</td>
                          <td className="py-2 text-right tabular-nums text-emerald-700">{nf(r.rekap12_baik)}</td>
                          <td className="py-2 text-right tabular-nums text-amber-700">{nf(r.rekap12_belum_baik)}</td>
                          <td className="py-2 text-right tabular-nums text-slate-600">{pf(r.avg_skor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Matrix Heatmap (Provinsi / Form 1-13) */}
          <GiziMatrixHeatmap heatmap={data.heatmap} />

          {/* Weekly Trend + Formulir 1-13 Compliance Chart */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Tren Mingguan Kunjungan &amp; Hasil Rekap Gizi (F12)</h3>
                <p className="text-xs text-slate-500">Berdasarkan Minggu Epid tanggal kunjungan pengawasan</p>
              </div>
              {!data.weekly_trend.length ? (
                <EmptyBox msg="Belum ada data tren mingguan kunjungan pengawasan." />
              ) : (
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.weekly_trend} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="kunjungan" name="Total Kunjungan" fill="#a7f3d0" stroke="#059669" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="rekap12_baik" name="F12 BAIK" stroke="#047857" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="rekap12_belum_baik" name="F12 BELUM BAIK" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Profil Kepatuhan 13 Formulir Pengawasan</h3>
                <p className="text-xs text-slate-500">Perbandingan kesimpulan Sesuai/BAIK vs Tidak Sesuai/BELUM BAIK per Form F1–F13</p>
              </div>
              {!data.by_formulir.some((x) => x.tersimpan > 0) ? (
                <EmptyBox msg="Belum ada pengisian Formulir 1–13 pada kunjungan terfilter." />
              ) : (
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_formulir} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="short" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="sesuai" stackId="a" name="Sesuai / BAIK" fill="#10b981" />
                      <Bar dataKey="tidak_sesuai" stackId="a" name="Tidak Sesuai / BELUM BAIK" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Form 1 Ketenagaan + Form 2 8 SOP + Form 1-13 Table */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Form 1 + Form 2 */}
            <div className="space-y-4">
              <div className="skdr-card p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-800">Form 1 · Ketenagaan &amp; Sertifikasi</h3>
                  <p className="text-xs text-slate-500">Kualifikasi pengawas/TPG &amp; rasio tenaga penjamah terlatih</p>
                </div>
                {!data.f1_ketenagaan.total ? (
                  <EmptyBox msg="Belum ada pengisian Form 1 Ketenagaan." />
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Form F1 Terisi</div>
                        <div className="mt-0.5 text-lg font-black text-slate-900 tabular-nums">{nf(data.f1_ketenagaan.total)}</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-emerald-700">Avg Penjamah / SPPG</div>
                        <div className="mt-0.5 text-lg font-black text-emerald-900 tabular-nums">
                          {data.f1_ketenagaan.avg_penjamah != null ? data.f1_ketenagaan.avg_penjamah.toFixed(1) : '—'}
                        </div>
                      </div>
                    </div>
                    <RatioBar label="A. Pengawas/TPG Memenuhi Syarat" good={data.f1_ketenagaan.pengawas_sesuai} total={data.f1_ketenagaan.total} />
                    <RatioBar label="B.1 Rasio Penjamah Cukup" good={data.f1_ketenagaan.penjamah_b1_sesuai} total={data.f1_ketenagaan.total} barCls="bg-teal-600" />
                    <RatioBar label="B.2 Penjamah Terlatih/Sertifikat" good={data.f1_ketenagaan.pelatihan_b2_sesuai} total={data.f1_ketenagaan.total} barCls="bg-blue-600" />
                  </div>
                )}
              </div>

              <div className="skdr-card p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-800">Form 2 · Kepatuhan 8 SOP Operasional</h3>
                  <p className="text-xs text-slate-500">Ketersediaan dokumen SOP &amp; sosialisasi di SPPG</p>
                </div>
                {!data.f2_sop.some((x) => x.sosialisasi_total > 0 || (x.tersedia_total ?? 0) > 0) ? (
                  <EmptyBox msg="Belum ada pengisian Form 2 SOP." />
                ) : (
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-1.5 text-left">SOP</th>
                          <th className="py-1.5 text-right">Tersedia</th>
                          <th className="py-1.5 text-right">Sosialisasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.f2_sop.map((s, idx) => (
                          <tr key={s.nama} className="hover:bg-slate-50">
                            <td className="py-1.5 pr-2 font-medium text-slate-700">{idx + 1}. {s.nama}</td>
                            <td className="py-1.5 text-right tabular-nums text-slate-700">
                              {s.tersedia_total != null ? `${nf(s.tersedia_sesuai)}/${nf(s.tersedia_total)}` : '—'}
                            </td>
                            <td className="py-1.5 text-right font-semibold tabular-nums text-emerald-700">
                              {nf(s.sosialisasi_sesuai)}/{nf(s.sosialisasi_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Table 13 Forms Detail */}
            <div className="skdr-card flex flex-col p-4 xl:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Ringkasan Detail Formulir 1 s/d 13</h3>
                  <p className="text-xs text-slate-500">Jumlah tersimpan, status kirim, kesimpulan kelayakan, dan rata-rata skor SOP</p>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-2.5 py-2 text-left">Kode</th>
                      <th className="px-2.5 py-2 text-left">Formulir Pengawasan</th>
                      <th className="px-2.5 py-2 text-right">Tersimpan</th>
                      <th className="px-2.5 py-2 text-right">Dikirim</th>
                      <th className="px-2.5 py-2 text-right">Sesuai/BAIK</th>
                      <th className="px-2.5 py-2 text-right">Tdk Sesuai</th>
                      <th className="px-2.5 py-2 text-right">Skor Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.by_formulir.map((bf) => (
                      <tr key={bf.form_no} className="hover:bg-slate-50">
                        <td className="px-2.5 py-2 font-extrabold text-emerald-800">F{bf.form_no}</td>
                        <td className="px-2.5 py-2 font-medium text-slate-800">{bf.title}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">{nf(bf.tersimpan)}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">{nf(bf.dikirim)}</td>
                        <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-emerald-700">{nf(bf.sesuai)}</td>
                        <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-amber-700">{nf(bf.tidak_sesuai)}</td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700">{pf(bf.avg_skor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* SPPG Summary + Recent Visits (Zero PII) */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Rekap Kinerja per SPPG</h3>
                  <p className="text-xs text-slate-500">Status standar gizi (F12) &amp; daya terima (F13) terkini tiap SPPG</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {nf(data.sppg_summary.length)} SPPG
                </span>
              </div>
              {!data.sppg_summary.length ? (
                <EmptyBox msg="Belum ada data SPPG pada transaksi Pengawasan Gizi MBG." />
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2 text-left">SPPG &amp; Wilayah</th>
                        <th className="py-2 text-right">Kunj</th>
                        <th className="py-2 text-center">F12 Gizi</th>
                        <th className="py-2 text-center">F13 Terima</th>
                        <th className="py-2 text-right">Skor Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.sppg_summary.map((s, idx) => (
                        <tr key={`${s.nama_sppg}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 pr-2">
                            <div className="font-bold text-slate-800">{s.nama_sppg}</div>
                            <div className="text-[11px] text-slate-500">
                              {[s.puskesmas ? `PKM ${s.puskesmas}` : null, s.kabkota_name, s.province_name].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="py-2 text-right font-bold tabular-nums text-slate-800">{nf(s.kunjungan)}</td>
                          <td className="py-2 text-center"><RekapBadge value={s.last_rekap12} /></td>
                          <td className="py-2 text-center"><RekapBadge value={s.last_rekap13} /></td>
                          <td className="py-2 text-right font-mono tabular-nums text-slate-700">{pf(s.avg_skor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-700" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Transaksi Kunjungan Pengawasan Terbaru</h3>
                    <p className="text-xs text-slate-500">Maksimal 50 kunjungan terakhir sesuai filter (tanpa data PII petugas)</p>
                  </div>
                </div>
              </div>
              {!data.recent_kunjungan.length ? (
                <EmptyBox msg="Belum ada transaksi kunjungan pada filter ini." />
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2 text-left">No. Kunjungan &amp; SPPG</th>
                        <th className="py-2 text-center">Tanggal</th>
                        <th className="py-2 text-center">Form</th>
                        <th className="py-2 text-center">F12</th>
                        <th className="py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recent_kunjungan.map((k) => (
                        <tr key={k.id} className="hover:bg-slate-50">
                          <td className="py-2 pr-2">
                            <div className="font-mono text-[11px] font-bold text-slate-800">{k.no_kunjungan}</div>
                            <div className="text-[11px] text-slate-600">{k.nama_sppg || '—'}</div>
                            <div className="text-[10px] text-slate-400">
                              {[k.kabkota_name, k.province_name].filter(Boolean).join(', ')}
                            </div>
                          </td>
                          <td className="py-2 text-center font-mono text-[11px] text-slate-600">{k.tanggal}</td>
                          <td className="py-2 text-center tabular-nums text-slate-700">{k.forms_sent}/{k.forms_saved}</td>
                          <td className="py-2 text-center"><RekapBadge value={k.rekap12} /></td>
                          <td className="py-2 text-center"><RekapBadge value={k.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
