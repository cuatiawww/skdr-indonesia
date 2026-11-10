'use client'
// PR 036: Halaman 2 — Keracunan Pangan MBG (langsung dari transaksi `mbg_keracunan` & `mbg_keracunan_update`, plus korelasi ke Pengawasan Gizi SPPG).
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, FlaskConical, Hospital, RotateCcw,
  School, ShieldAlert, Skull, Stethoscope, Users,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fetchKeracunanDash, type KeracunanDashData } from '@/lib/dasbor-mbg-api'
import { KeracunanMatrixHeatmap } from '@/components/dasbor-mbg/MbgHeatmap'
import { EmptyBox, KpiCard, RatioBar, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { ErrorState, SkeletonChart, SkeletonMap } from '@/components/ui/Skeleton'

const EbsIbsLayerMap = dynamic(() => import('@/components/dasbor-ebs-ibs/EbsIbsLayerMap'), {
  ssr: false,
  loading: () => <SkeletonMap />,
})

type Filters = {
  status: string
  lab_status: string
  ikl: string
  slhs: string
  from: string
  to: string
  province_id: string
  kabkota_id: string
  sppg: string
}

const EMPTY_FILTERS: Filters = {
  status: 'all',
  lab_status: 'all',
  ikl: 'all',
  slhs: 'all',
  from: '',
  to: '',
  province_id: '',
  kabkota_id: '',
  sppg: '',
}

export default function KeracunanDashboardView({ onCount }: { onCount?: (n: number) => void }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS)
  const [mapLevel, setMapLevel] = useState<'prov' | 'kab'>('prov')
  const [mapParent, setMapParent] = useState<{ id: number; name: string } | null>(null)
  const [data, setData] = useState<KeracunanDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [retry, setRetry] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(false)
    try {
      const res = await fetchKeracunanDash({
        ...f,
        level: mapLevel,
        parent: mapParent?.id ?? '',
      })
      setData(res)
      onCount?.(res.kpis.total_kejadian)
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
    f.status !== 'all' || f.lab_status !== 'all' || f.ikl !== 'all' || f.slhs !== 'all'
    || f.from || f.to || f.province_id || f.kabkota_id || f.sppg,
  )

  return (
    <div className="space-y-5" data-testid="keracunan-dashboard-view">
      {/* Filter Bar */}
      <div className="skdr-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Filter Keracunan Pangan MBG</h3>
              <p className="text-xs text-slate-500">
                Sumber langsung: transaksi <code className="text-[11px]">mbg_keracunan</code> &amp; <code className="text-[11px]">mbg_keracunan_update</code>
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

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-9">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Status Laporan
            <select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua Status</option>
              <option value="dilaporkan">Dilaporkan</option>
              <option value="ditutup">Ditutup</option>
              <option value="draf">Draf</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Status Lab
            <select
              value={f.lab_status}
              onChange={(e) => setF({ ...f, lab_status: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua Lab</option>
              <option value="belum">Belum Diambil</option>
              <option value="dikirim">Dikirim</option>
              <option value="hasil">Ada Hasil</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Hasil IKL
            <select
              value={f.ikl}
              onChange={(e) => setF({ ...f, ikl: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua IKL</option>
              <option value="Memenuhi Syarat">Memenuhi Syarat</option>
              <option value="Tidak Memenuhi Syarat">Tidak Memenuhi</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Kepemilikan SLHS
            <select
              value={f.slhs}
              onChange={(e) => setF({ ...f, slhs: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            >
              <option value="all">Semua SLHS</option>
              <option value="Ya">Ya (Ada SLHS)</option>
              <option value="Tidak">Tidak Ada</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Kejadian Dari
            <input
              type="date"
              value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
            Kejadian Sampai
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
          {/* 6 KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              icon={ShieldAlert}
              label="Total Kejadian"
              value={nf(data.kpis.total_kejadian)}
              sub={`${nf(data.kpis.dilaporkan)} dilaporkan · ${nf(data.kpis.ditutup)} ditutup · ${nf(data.kpis.draf)} draf`}
              tone="amber"
            />
            <KpiCard
              icon={Skull}
              label="Total Kasus & CFR"
              value={nf(data.kpis.total_kasus)}
              sub={`${nf(data.kpis.total_meninggal)} meninggal · CFR: ${pf(data.kpis.cfr_pct)}`}
              tone="red"
            />
            <KpiCard
              icon={Activity}
              label="Attack Rate & Inkubasi"
              value={pf(data.kpis.attack_rate_pct)}
              sub={`${nf(data.kpis.total_terpapar)} terpapar · Avg inkubasi: ${data.kpis.avg_inkubasi_jam != null ? `${data.kpis.avg_inkubasi_jam.toFixed(1)} jam` : '—'}`}
              tone="blue"
            />
            <KpiCard
              icon={Hospital}
              label="Perawatan & Sekolah"
              value={`${nf(data.kpis.rawat_inap)} / ${nf(data.kpis.rawat_jalan)}`}
              sub={`Inap / Jalan · ${nf(data.kpis.sembuh)} sembuh · ${nf(data.kpis.total_sekolah_terdampak)} sekolah`}
              tone="teal"
            />
            <KpiCard
              icon={FlaskConical}
              label="Kesiapan Lab Sampel"
              value={nf(data.kpis.lab_hasil)}
              sub={`Hasil keluar · ${nf(data.kpis.lab_dikirim)} dikirim · ${nf(data.kpis.lab_belum)} belum`}
              tone="emerald"
            />
            <KpiCard
              icon={School}
              label="SLHS & IKL SPPG"
              value={`${nf(data.kpis.slhs_ya)} SLHS`}
              sub={`IKL Memenuhi: ${nf(data.kpis.ikl_memenuhi)} · Tidak: ${nf(data.kpis.ikl_tidak_memenuhi)}`}
              tone="slate"
            />
          </div>

          {/* Spatial Layer Map + Region Ranking */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <EbsIbsLayerMap
                mode="keracunan"
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
                    Rekap {data.map.level === 'kab' ? 'Kab/Kota' : 'Provinsi'} Kejadian
                  </h3>
                  <p className="text-xs text-slate-500">Klik provinsi untuk drill-down ke kab/kota</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {nf(data.map.regions.length)} wilayah
                </span>
              </div>
              {!data.map.regions.length ? (
                <EmptyBox msg="Belum ada wilayah pada transaksi Keracunan Pangan MBG." />
              ) : (
                <div className="max-h-[440px] flex-1 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2">Wilayah</th>
                        <th className="py-2 text-right">Kej</th>
                        <th className="py-2 text-right">Kasus</th>
                        <th className="py-2 text-right">Mati</th>
                        <th className="py-2 text-right">Terpapar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map.regions.map((r) => (
                        <tr
                          key={r.key}
                          className={data.map.level === 'prov' ? 'cursor-pointer hover:bg-red-50/50' : 'hover:bg-slate-50'}
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
                          <td className="py-2 text-right tabular-nums text-slate-700">{nf(r.kejadian)}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-red-700">{nf(r.kasus)}</td>
                          <td className="py-2 text-right tabular-nums text-slate-800">{nf(r.meninggal)}</td>
                          <td className="py-2 text-right tabular-nums text-slate-600">{nf(r.terpapar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Matrix Heatmap */}
          <KeracunanMatrixHeatmap heatmap={data.heatmap} />

          {/* Weekly Trend & Daily Updates */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Tren Mingguan Kejadian &amp; Korban MBG</h3>
                <p className="text-xs text-slate-500">Berdasarkan Minggu Epid tanggal kejadian keracunan pangan</p>
              </div>
              {!data.weekly_trend.length ? (
                <EmptyBox msg="Belum ada data tren mingguan kejadian keracunan." />
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
                      <Bar yAxisId="right" dataKey="kejadian" name="Jumlah Kejadian" fill="#fed7aa" stroke="#ea580c" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="left" type="monotone" dataKey="kasus" name="Total Kasus" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line yAxisId="left" type="monotone" dataKey="meninggal" name="Meninggal" stroke="#1e293b" strokeWidth={2} dot={{ r: 2.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Perkembangan Kasus Harian (<code className="text-xs">mbg_keracunan_update</code>)</h3>
                <p className="text-xs text-slate-500">Evolusi harian kasus baru, rawat inap/jalan, dan kesembuhan pasien</p>
              </div>
              {!data.daily_updates.length ? (
                <EmptyBox msg="Belum ada log pemantauan kasus harian yang tersimpan." />
              ) : (
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.daily_updates} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="kasus" name="Kasus Dilaporkan" fill="#fca5a5" stroke="#dc2626" radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="rawat_inap" name="Rawat Inap" stroke="#d97706" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="sembuh" name="Sembuh" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Symptoms + Demographics */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3 flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-red-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Profil Gejala Klinis Korban</h3>
                  <p className="text-xs text-slate-500">Proporsi gejala dari {nf(data.kpis.total_kasus)} total kasus terlaporkan</p>
                </div>
              </div>
              {!data.by_gejala.length ? (
                <EmptyBox msg="Belum ada data gejala klinis pada transaksi." />
              ) : (
                <div className="space-y-2.5">
                  {data.by_gejala.map((g) => (
                    <RatioBar
                      key={g.nama}
                      label={g.nama}
                      good={g.jumlah_kasus}
                      total={Math.max(1, data.kpis.total_kasus)}
                      subRight={`${nf(g.kejadian)} kej`}
                      barCls="bg-red-600"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Demografi Usia, Jenis Kelamin &amp; Kelompok Rentan</h3>
                  <p className="text-xs text-slate-500">Distribusi korban berdasarkan isian demografi Keracunan MBG</p>
                </div>
              </div>
              {!(data.demografi.pria + data.demografi.wanita + data.demografi.usia.reduce((s, u) => s + u.count, 0)) ? (
                <EmptyBox msg="Belum ada rincian demografi kasus pada transaksi." />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    <div className="rounded-lg bg-blue-50 px-2.5 py-2 text-center">
                      <div className="text-[10px] font-bold text-blue-700">Laki-laki</div>
                      <div className="text-base font-black text-blue-900 tabular-nums">{nf(data.demografi.pria)}</div>
                    </div>
                    <div className="rounded-lg bg-pink-50 px-2.5 py-2 text-center">
                      <div className="text-[10px] font-bold text-pink-700">Perempuan</div>
                      <div className="text-base font-black text-pink-900 tabular-nums">{nf(data.demografi.wanita)}</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-center">
                      <div className="text-[10px] font-bold text-amber-700">Balita</div>
                      <div className="text-base font-black text-amber-900 tabular-nums">{nf(data.demografi.balita)}</div>
                    </div>
                    <div className="rounded-lg bg-rose-50 px-2.5 py-2 text-center">
                      <div className="text-[10px] font-bold text-rose-700">Ibu Hamil</div>
                      <div className="text-base font-black text-rose-900 tabular-nums">{nf(data.demografi.ibu_hamil)}</div>
                    </div>
                    <div className="rounded-lg bg-purple-50 px-2.5 py-2 text-center">
                      <div className="text-[10px] font-bold text-purple-700">Menyusui</div>
                      <div className="text-base font-black text-purple-900 tabular-nums">{nf(data.demografi.ibu_menyusui)}</div>
                    </div>
                  </div>
                  <div className="h-[190px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.demografi.usia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" name="Jumlah Korban" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hygiene, 26 SOP Gaps, Faktor Risiko, Lab Sampel */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Lingkungan, Sumber Air &amp; Faktor Risiko</h3>
                <p className="text-xs text-slate-500">SLHS, IKL, sertifikasi penjamah &amp; rantai distribusi pangan</p>
              </div>
              {!data.kpis.total_kejadian ? (
                <EmptyBox msg="Belum ada data investigasi lingkungan." />
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="font-bold text-slate-700">Penjamah Pangan Tersertifikasi</div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-base font-black text-slate-900 tabular-nums">
                        {nf(data.lingkungan_sop.penjamah.tersertifikasi)} / {nf(data.lingkungan_sop.penjamah.total)}
                      </span>
                      <span className="font-bold text-emerald-700">{pf(data.lingkungan_sop.penjamah.pct_tersertifikasi)}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Checklist Operasional &amp; Angkutan</div>
                    {data.lingkungan_sop.faktor_risiko.map((fr) => (
                      <div key={fr.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                        <span className="font-medium text-slate-700">{fr.label}</span>
                        <span className="font-mono text-[11px]">
                          <b className="text-emerald-700">{fr.ya} Ya</b> · <span className="text-red-600">{fr.tidak} Tdk</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  {data.lingkungan_sop.sumber_air.length ? (
                    <div>
                      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Sumber Air Dapur SPPG</div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.lingkungan_sop.sumber_air.map((sa) => (
                          <span key={sa.sumber} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-semibold text-slate-700">
                            {sa.sumber}: <b>{nf(sa.count)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Gap Kepatuhan 26 SOP SPPG</h3>
                <p className="text-xs text-slate-500">Diurutkan berdasarkan ketidaksesuaian terbanyak (Tidak Ada / Tidak Dilakukan)</p>
              </div>
              {!data.lingkungan_sop.sop_gap.length ? (
                <EmptyBox msg="Belum ada data checklist 26 SOP penyelidikan." />
              ) : (
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-1.5 pr-2 text-left">Item SOP</th>
                        <th className="py-1.5 text-right">Tdk Ada</th>
                        <th className="py-1.5 text-right">Tdk Jln</th>
                        <th className="py-1.5 text-right">Gap</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.lingkungan_sop.sop_gap.map((sg) => (
                        <tr key={sg.nama} className="hover:bg-slate-50">
                          <td className="py-1.5 pr-2 font-medium text-slate-700">{sg.nama}</td>
                          <td className="py-1.5 text-right tabular-nums text-amber-700">{nf(sg.tidak_ada)}</td>
                          <td className="py-1.5 text-right tabular-nums text-red-700">{nf(sg.tidak_dilakukan)}</td>
                          <td className="py-1.5 text-right font-extrabold tabular-nums text-slate-900">{nf(sg.gap_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-emerald-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Pemeriksaan Sampel Lab per Kategori</h3>
                  <p className="text-xs text-slate-500">Ringkasan hasil uji mikrobiologi &amp; kimiawi (air, pangan, MPN, spesimen)</p>
                </div>
              </div>
              {!data.lab_sampel.length ? (
                <EmptyBox msg="Belum ada catatan sampel laboratorium pada transaksi." />
              ) : (
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-1.5 pr-2 text-left">Kategori</th>
                        <th className="py-1.5 text-right">Total</th>
                        <th className="py-1.5 text-right">Mikro (+)</th>
                        <th className="py-1.5 text-right">Kimia (+)</th>
                        <th className="py-1.5 text-right">Blm Hasil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.lab_sampel.map((ls) => (
                        <tr key={ls.kategori} className="hover:bg-slate-50">
                          <td className="py-1.5 pr-2 font-semibold text-slate-800">{ls.kategori}</td>
                          <td className="py-1.5 text-right font-bold tabular-nums text-slate-800">{nf(ls.total)}</td>
                          <td className="py-1.5 text-right tabular-nums text-red-700">{nf(ls.mikro_positif)}</td>
                          <td className="py-1.5 text-right tabular-nums text-orange-700">{nf(ls.kimia_positif)}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-500">{nf(ls.belum)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* SPPG Cross-Reference Matrix (Keracunan x Pengawasan Gizi) + Recent Incidents */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Matriks SPPG Terdampak × Status Pengawasan Gizi</h3>
                <p className="text-xs text-slate-500">Korelasi langsung kejadian keracunan SPPG dengan riwayat skor Pengawasan Gizi (F12/F13)</p>
              </div>
              {!data.sppg_incidents.length ? (
                <EmptyBox msg="Belum ada data SPPG pada kejadian keracunan pangan." />
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2 text-left">SPPG &amp; Wilayah</th>
                        <th className="py-2 text-right">Kej</th>
                        <th className="py-2 text-right">Kasus</th>
                        <th className="py-2 text-right">Kunj Gizi</th>
                        <th className="py-2 text-center">F12 Terakhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.sppg_incidents.map((s, idx) => (
                        <tr key={`${s.nama_sppg || 'none'}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 pr-2">
                            <div className="font-bold text-slate-800">{s.nama_sppg || 'SPPG Belum Diisi'}</div>
                            <div className="text-[11px] text-slate-500">
                              {[s.yayasan_sppg, s.kabkota_name, s.province_name].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums text-slate-700">{nf(s.kejadian)}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-red-700">{nf(s.kasus)}</td>
                          <td className="py-2 text-right tabular-nums text-emerald-700">{nf(s.pengawasan_kunjungan)}</td>
                          <td className="py-2 text-center"><RekapBadge value={s.pengawasan_rekap12} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="skdr-card flex flex-col p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-800">Daftar Kejadian Keracunan Pangan Terbaru</h3>
                <p className="text-xs text-slate-500">Maksimal 50 laporan terkini sesuai filter (tanpa data PII pelapor)</p>
              </div>
              {!data.recent_incidents.length ? (
                <EmptyBox msg="Belum ada transaksi keracunan pangan pada filter ini." />
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2 text-left">Laporan &amp; SPPG</th>
                        <th className="py-2 text-center">Tanggal</th>
                        <th className="py-2 text-right">Kasus (AR)</th>
                        <th className="py-2 text-center">Lab</th>
                        <th className="py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recent_incidents.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2 pr-2">
                            <div className="font-mono text-[11px] font-bold text-slate-800">{r.no_laporan || `#${r.id}`}</div>
                            <div className="text-[11px] text-slate-600">{r.nama_sppg || '—'}</div>
                            <div className="text-[10px] text-slate-400">
                              {[r.kabkota_name, r.province_name].filter(Boolean).join(', ')}
                            </div>
                          </td>
                          <td className="py-2 text-center font-mono text-[11px] text-slate-600">{r.tgl_kejadian || '—'}</td>
                          <td className="py-2 text-right tabular-nums">
                            <div className="font-bold text-red-700">{nf(r.jumlah_kasus)}</div>
                            <div className="text-[10px] text-slate-400">AR: {pf(r.ar_pct)}</div>
                          </td>
                          <td className="py-2 text-center"><RekapBadge value={r.lab_status} /></td>
                          <td className="py-2 text-center"><RekapBadge value={r.status} /></td>
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
