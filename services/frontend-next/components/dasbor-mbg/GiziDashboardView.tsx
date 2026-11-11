'use client'
// PR 036: Halaman Pengawasan Gizi MBG (langsung dari transaksi `mbg_kunjungan` & `mbg_form` Form 1–13).
// PR 052: filter dipindah ke panel samping bersama; ditambah tren skor SOP per granularitas (ambang 80), distribusi
// kesimpulan per formulir (termasuk "belum dinilai"), temuan "Tidak Sesuai" teratas per butir F1–F11, dan SPPG skor terendah.
// Semua panel PR 036 dipertahankan.
import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import {
  Award, Building2, CheckCircle2, ClipboardCheck, ClipboardList,
  MapPin, ShieldAlert,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { GiziDashData } from '@/lib/dasbor-mbg-api'
import { GiziMatrixHeatmap } from '@/components/dasbor-mbg/MbgHeatmap'
import { EmptyBox, KpiCard, RatioBar, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { SkorTrend } from '@/components/dasbor-mbg/MbgCharts'
import { Interpretasi, Panel } from '@/components/analisa/ui'
import { ErrorState, SkeletonChart, SkeletonKpiRow, SkeletonMap } from '@/components/ui/Skeleton'
import { CEK_NASKAH, F9, FORM_TITLES } from '@/lib/pengawasan-gizi/naskah'
import { GRAN_OPTS, type MapState, type MbgFilter } from '@/lib/dasbor-mbg-filter'

const EbsIbsLayerMap = dynamic(() => import('@/components/dasbor-ebs-ibs/EbsIbsLayerMap'), {
  ssr: false,
  loading: () => <SkeletonMap />,
})

/** Label butir F3–F11 dari naskah formulir (kode "i{n}"); F1/F2 sudah berlabel dari backend. */
export function temuanLabel(formNo: number, kode: string, label: string | null): string {
  if (label) return label
  const k = Number(kode.replace(/^i/, ''))
  const komp = formNo === 9 ? F9.komponen : CEK_NASKAH.find((c) => c.no === formNo)?.komponen
  const it = komp?.flatMap((c) => c.items).find((x) => x.k === k)
  return it ? `${k}. ${it.label}` : `Butir ${k}`
}

export default function GiziDashboardView({ data, loading, error, reload, f, map, setMap }: {
  data: GiziDashData | null
  loading: boolean
  error: string | null
  reload: () => void
  f: MbgFilter
  map: MapState
  setMap: (m: MapState) => void
}) {
  const mapParent = map.parent
  const setMapParent = (p: { id: number; name: string } | null) => setMap(p ? { level: 'kab', parent: p } : { level: 'prov', parent: null })
  const granLabel = GRAN_OPTS.find((g) => g.value === f.gran)?.label
  const formDist = useMemo(() => (data?.by_formulir || []).map((x) => ({ ...x, belum: Math.max(0, x.tersimpan - x.sesuai - x.tidak_sesuai) })), [data])
  const lowest = useMemo(() => [...(data?.sppg_summary || [])].filter((s) => s.avg_skor != null).sort((a, b) => (a.avg_skor ?? 0) - (b.avg_skor ?? 0)).slice(0, 10), [data])
  const temuan = data?.temuan || []

  return (
    <div className="space-y-5" data-testid="gizi-dashboard-view">
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading && !data ? (
        <div className="space-y-4">
          <SkeletonKpiRow count={6} />
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

          <Interpretasi lines={[
            data.kpis.total_kunjungan ? `${nf(data.kpis.total_kunjungan)} kunjungan pengawasan ke ${nf(data.kpis.sppg_unik)} SPPG pada filter ini.` : null,
            data.kpis.avg_skor_sop != null ? `Rata-rata skor penerapan SOP ${pf(data.kpis.avg_skor_sop)}${data.kpis.avg_skor_sop < 80 ? ' — di bawah ambang 80 (belum sesuai standar).' : ' — memenuhi ambang 80.'}` : null,
            data.kpis.rekap12_belum_baik ? `${nf(data.kpis.rekap12_belum_baik)} kunjungan berkesimpulan standar gizi (F12) BELUM BAIK; SPPG ini prioritas pembinaan karena kelemahan higiene & proses dapur adalah faktor risiko keracunan pangan.` : null,
            temuan[0] ? `Temuan tersering: F${temuan[0].form_no} ${temuanLabel(temuan[0].form_no, temuan[0].kode, temuan[0].label)} (${nf(temuan[0].jumlah)} formulir).` : null,
          ]} />

          {/* PR 052: tren skor + distribusi kesimpulan */}
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <Panel title={`Tren Rata-rata Skor Penerapan SOP per ${granLabel}`} testId="panel-skor-trend"
              tip="Rata-rata skor Formulir 3–11 per kunjungan, dikelompokkan menurut tanggal kunjungan. Garis merah = ambang 80 (sesuai standar gizi apabila skor ≥ 80).">
              <SkorTrend series={data.daily_series} gran={f.gran} />
            </Panel>
            <Panel title="Distribusi Kesimpulan per Formulir" testId="panel-kesimpulan"
              tip="Jumlah formulir tersimpan menurut kesimpulan: Sesuai/BAIK, Tidak Sesuai/BELUM BAIK, atau belum dinilai (butir belum lengkap / formulir tanpa kesimpulan).">
              {!formDist.some((x) => x.tersimpan > 0) ? <EmptyBox msg="Belum ada pengisian Formulir 1–13 pada kunjungan terfilter." /> : (
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={formDist.map((x) => ({ ...x, kode: `F${x.form_no}` }))} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="kode" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(l: any) => { const n = Number(String(l).slice(1)); return `${l} · ${FORM_TITLES[n]?.short || ''}` }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="sesuai" stackId="a" name="Sesuai / BAIK" fill="#10b981" />
                      <Bar dataKey="tidak_sesuai" stackId="a" name="Tidak Sesuai / BELUM BAIK" fill="#f59e0b" />
                      <Bar dataKey="belum" stackId="a" name="Belum dinilai" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          {/* PR 052: temuan teratas + SPPG skor terendah */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Temuan “Tidak Sesuai” Terbanyak" testId="panel-temuan"
              desc="Butir penilaian F1–F11 yang paling sering Tidak Sesuai (formulir berstatus dikirim)"
              tip="Persentase = jumlah formulir dengan butir tersebut Tidak Sesuai ÷ jumlah formulir yang sama yang dikirim. Gunakan untuk menentukan materi pembinaan SPPG.">
              {!temuan.length ? <EmptyBox msg="Belum ada temuan Tidak Sesuai pada formulir yang dikirim." /> : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200"><th className="py-2 pr-2 text-left">Form</th><th className="py-2 pr-2 text-left">Butir</th><th className="py-2 text-right">Jumlah</th><th className="py-2 text-right">% form</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {temuan.slice(0, 25).map((t) => (
                        <tr key={`${t.form_no}-${t.kode}`} className="hover:bg-slate-50">
                          <td className="py-1.5 pr-2 align-top font-extrabold text-emerald-800" title={FORM_TITLES[t.form_no]?.title}>F{t.form_no}</td>
                          <td className="py-1.5 pr-2 text-slate-700"><div className="line-clamp-2">{temuanLabel(t.form_no, t.kode, t.label)}</div><div className="text-[10px] text-slate-400">{FORM_TITLES[t.form_no]?.short}</div></td>
                          <td className="py-1.5 text-right align-top font-bold tabular-nums text-amber-700">{nf(t.jumlah)}</td>
                          <td className="py-1.5 text-right align-top tabular-nums text-slate-600">{pf(t.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="SPPG dengan Skor Pengawasan Terendah" testId="panel-skor-terendah"
              desc="10 SPPG dengan rata-rata skor penerapan SOP (F3–F11) terendah"
              tip="Skor < 80 = belum sesuai standar. Bandingkan dengan tab Ringkasan (Tautan Risiko) untuk melihat apakah SPPG ini juga pernah mengalami kejadian keracunan.">
              {!lowest.length ? <EmptyBox msg="Belum ada SPPG dengan skor penerapan SOP." /> : (
                <div className="space-y-2.5">
                  {lowest.map((x) => (
                    <div key={x.nama_sppg}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-semibold text-slate-800">{x.nama_sppg} <span className="font-normal text-slate-500">· {[x.kabkota_name, x.province_name].filter(Boolean).join(', ')}</span></span>
                        <span className={`shrink-0 font-mono font-bold ${(x.avg_skor ?? 0) < 80 ? 'text-red-700' : 'text-emerald-700'}`}>{x.avg_skor?.toFixed(1)}</span>
                      </div>
                      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100"><div className={(x.avg_skor ?? 0) < 80 ? 'bg-red-500' : 'bg-emerald-500'} style={{ width: `${Math.min(100, x.avg_skor ?? 0)}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
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
                onDrillDown={(id, name) => setMapParent({ id, name })}
                onResetLevel={() => setMapParent(null)}
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
                              if (Number.isFinite(id) && id > 0) setMapParent({ id, name: r.name })
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
