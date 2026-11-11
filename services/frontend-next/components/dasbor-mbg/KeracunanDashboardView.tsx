'use client'
// Halaman 2 Dasbor MBG: Analisa Epidemiologi & Respons KLB Keracunan Pangan MBG
// Fokus murni pada investigasi epidemiologi kejadian luar biasa (KLB) keracunan pangan:
// 1. Indikator Utama Epidemiologi, Keparahan Klinis & Arahan Mobilisasi Respons KLB
// 2. Distribusi Geospasial KLB (Peta Tunggal Fokus Keracunan) & Peringkat Wilayah Terdampak
// 3. Dinamika Temporal: Kurva Epidemi & Log Pemantauan Harian Korban
// 4. Evaluasi Kinerja Pelaporan Cepat (≤ 24 Jam), Diagnostik Lab & Komponen Pangan Dicurigai
// 5. Profil Gejala Klinis, Struktur Demografi & Kelompok Rentan
// 6. Investigasi Faktor Risiko Lingkungan Dapur (SLHS, IKL, Gap 26 SOP & Uji Sampel per Kategori)
// 7. Register Investigasi Kejadian KLB & Lampiran Analitik Mingguan
import {
  Activity,
  AlertTriangle,
  FlaskConical,
  Hospital,
  ShieldAlert,
  Siren,
  Skull,
  Timer,
  Users,
  Utensils,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'
import { KeracunanMatrixHeatmap } from '@/components/dasbor-mbg/MbgHeatmap'
import { EmptyBox, KpiCard, RatioBar, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { EpiCurve, RegionChart, type RegionLevel } from '@/components/dasbor-mbg/MbgCharts'
import IncidentList from '@/components/dasbor-mbg/IncidentList'
import { MbgKeracunanMap, MoreDetails, SectionHead } from '@/components/dasbor-mbg/MbgSections'
import { Panel } from '@/components/analisa/ui'
import { ErrorState, SkeletonChart, SkeletonKpiRow, SkeletonMap } from '@/components/ui/Skeleton'
import { fmtJam, GRAN_OPTS, jenisLabel, wilson, type MapState, type MbgFilter } from '@/lib/dasbor-mbg-filter'

export function autoRegionLevel(f: MbgFilter): RegionLevel {
  return f.kab.length ? 'kecamatan' : f.prov.length ? 'kabkota' : 'provinsi'
}

const LEVEL_TXT: Record<RegionLevel, string> = { provinsi: 'Provinsi', kabkota: 'Kab/Kota', kecamatan: 'Kecamatan' }

export default function KeracunanDashboardView({
  data,
  loading,
  error,
  reload,
  f,
  map,
  setMap,
}: {
  data: KeracunanDashData | null
  loading: boolean
  error: string | null
  reload: () => void
  f: MbgFilter
  map: MapState
  setMap: (m: MapState) => void
  gizi?: GiziDashData | null
  gMap?: MapState
  setGMap?: (m: MapState) => void
}) {
  const k = data?.kpis
  const cfr = k ? wilson(k.total_meninggal, k.total_kasus) : null
  const kt = data?.ketepatan_lapor
  const lr = data?.lab_ringkas
  const granLabel = GRAN_OPTS.find((g) => g.value === f.gran)?.label
  const lvl = autoRegionLevel(f)
  const rank = [...(data?.ranking?.[lvl] || [])].sort((a, b) => b.kasus - a.kasus || b.kejadian - a.kejadian)
  const topSopGap = data?.lingkungan_sop?.sop_gap?.[0] || null
  const topSamplePos = data?.pangan?.sampel_positif?.[0] || null

  return (
    <div className="space-y-5" data-testid="keracunan-dashboard-view">
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading && !data ? (
        <div className="space-y-4">
          <SkeletonKpiRow count={6} />
          <SkeletonMap />
          <SkeletonChart />
        </div>
      ) : data && k ? (
        <>
          {/* BAGIAN 1: INDIKATOR UTAMA EPIDEMIOLOGI & ARAHAN RESPONS KLB */}
          <SectionHead
            no={1}
            id="angka"
            title="Indikator Utama Epidemiologi, Keparahan Klinis & Arahan Respons KLB"
            desc="Parameter kuantitatif beban kejadian luar biasa (KLB) keracunan pangan MBG, tingkat keparahan korban, dan kesiapan konfirmasi laboratorium."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-testid="keracunan-kpi">
            <KpiCard
              icon={ShieldAlert}
              label="Total Kejadian (KLB)"
              value={nf(k.total_kejadian)}
              tone="amber"
              sub={`${nf(k.dilaporkan)} dilaporkan · ${nf(k.ditutup)} ditutup · ${nf(k.draf)} draf · ${nf(k.sppg_unik)} SPPG`}
            />
            <KpiCard
              icon={Users}
              label="Total Kasus Sakit"
              value={nf(k.total_kasus)}
              tone="red"
              sub={`dari ${nf(k.total_terpapar)} terpapar · ${nf(k.total_sekolah_terdampak)} sekolah · ${nf(k.provinsi_unik)} prov / ${nf(k.kabkota_unik)} kab/kota`}
            />
            <KpiCard
              icon={Hospital}
              label="Kasus Rawat Inap"
              value={nf(k.rawat_inap)}
              tone="teal"
              sub={`${pf(k.total_kasus ? (k.rawat_inap * 100) / k.total_kasus : null)} dari kasus · ${nf(k.rawat_jalan)} rawat jalan · ${nf(k.sembuh)} sembuh`}
            />
            <KpiCard
              icon={Skull}
              label="Kematian & CFR"
              value={nf(k.total_meninggal)}
              tone="slate"
              sub={
                cfr ? (
                  <>
                    CFR <b className="text-slate-800">{pf(cfr.p)}</b> (IK 95% {pf(cfr.lo)}–{pf(cfr.hi)})
                  </>
                ) : (
                  'CFR: — (belum ada kasus)'
                )
              }
            />
            <KpiCard
              icon={Activity}
              label="Attack Rate & Inkubasi"
              value={pf(k.attack_rate_pct)}
              tone="blue"
              sub={`Proporsi terpapar jatuh sakit · median inkubasi ${
                k.avg_inkubasi_jam != null ? `${k.avg_inkubasi_jam.toFixed(1)} jam` : '—'
              }`}
            />
            <KpiCard
              icon={FlaskConical}
              label="Konfirmasi Laboratorium"
              value={`${nf(k.lab_hasil)} hasil`}
              tone="emerald"
              sub={`${nf(k.lab_dikirim)} dikirim · ${nf(k.lab_belum)} belum diambil${
                lr ? ` · ${nf(lr.kejadian_positif)} sampel positif` : ''
              }`}
            />
          </div>

          {/* Ringkasan Eksekutif Analisa Masalah & Pengerahan Respons KLB */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs lg:grid-cols-3">
            <div className="rounded-xl border border-red-100 bg-red-50/50 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-extrabold text-red-900">
                <Siren className="h-3.5 w-3.5 text-red-700" /> Evaluasi Beban &amp; Keparahan KLB
              </div>
              <p className="mt-1.5 leading-relaxed text-slate-700">
                Tercatat <b>{nf(k.total_kejadian)} kejadian KLB</b> dengan <b>{nf(k.total_kasus)} korban sakit</b> (Attack Rate rata-rata{' '}
                <b>{pf(k.attack_rate_pct)}</b>) dan tingkat rawat inap{' '}
                <b>{pf(k.total_kasus ? (k.rawat_inap * 100) / k.total_kasus : null)}</b>.
                {rank[0] ? (
                  <>
                    {' '}
                    Wilayah dengan beban tertinggi adalah <b>{rank[0].name}</b> ({nf(rank[0].kasus)} kasus, {nf(rank[0].kejadian)} kejadian).
                  </>
                ) : null}
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-extrabold text-amber-900">
                <Timer className="h-3.5 w-3.5 text-amber-700" /> Hambatan Respons Cepat &amp; Lab
              </div>
              <p className="mt-1.5 leading-relaxed text-slate-700">
                Ketepatan pelaporan ≤24 jam mencapai <b>{pf(kt?.pct_le24)}</b> (median selang lapor{' '}
                <b>{fmtJam(kt?.median_jam)}</b>). Sebanyak <b>{nf(k.lab_dikirim + k.lab_belum)} dari {nf(k.total_kejadian)} kejadian</b>{' '}
                belum memperoleh hasil laboratorium final sehingga konfirmasi patogen perlu dipercepat.
              </p>
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-extrabold text-teal-900">
                <AlertTriangle className="h-3.5 w-3.5 text-teal-700" /> Sumber Risiko &amp; Tindakan Lapangan
              </div>
              <p className="mt-1.5 leading-relaxed text-slate-700">
                {topSamplePos ? (
                  <>
                    Sampel positif terbanyak ditemukan pada <b>{topSamplePos.nama}</b> ({topSamplePos.positif}/{topSamplePos.diuji} positif).{' '}
                  </>
                ) : null}
                {topSopGap ? (
                  <>
                    Pelanggaran SOP dapur tertinggi adalah <b>{topSopGap.nama}</b> ({nf(topSopGap.gap_total)} temuan gap).{' '}
                  </>
                ) : null}
                Prioritaskan pengamanan sampel sisa makanan dan audit sanitasi air/peralatan dapur SPPG.
              </p>
            </div>
          </div>

          {/* BAGIAN 2: DISTRIBUSI GEOSPASIAL KLB & PERINGKAT WILAYAH TERDAMPAK */}
          <SectionHead
            no={2}
            id="peta"
            title="Distribusi Geospasial Insiden KLB & Peringkat Beban Wilayah Terdampak"
            desc="Pemetaan choropleth intensitas kasus dan kluster titik lokasi SPPG terdampak, disandingkan dengan tabel peringkat epidemiologi per wilayah."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <MbgKeracunanMap ker={data} kMap={map} setKMap={setMap} />
            </div>
            <Panel
              title={`Peringkat Wilayah Terdampak (${LEVEL_TXT[lvl]})`}
              desc="Urutan wilayah berdasarkan jumlah kasus sakit, kematian, CFR (%), dan Attack Rate (AR %)."
              testId="panel-rekap-wilayah"
            >
              {!rank.length ? (
                <EmptyBox msg="Belum ada data wilayah terdampak pada filter aktif." />
              ) : (
                <div className="max-h-[450px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="px-2 py-2">Wilayah</th>
                        <th className="px-1.5 py-2 text-right">Kej</th>
                        <th className="px-1.5 py-2 text-right">Kasus</th>
                        <th className="px-1.5 py-2 text-right">Mati</th>
                        <th className="px-1.5 py-2 text-right">CFR</th>
                        <th className="px-1.5 py-2 text-right">AR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rank.map((r) => (
                        <tr
                          key={`${r.id}-${r.name}`}
                          className={lvl === 'provinsi' && r.id ? 'cursor-pointer hover:bg-red-50/40' : 'hover:bg-slate-50'}
                          onClick={() => {
                            if (lvl === 'provinsi' && r.id) {
                              setMap({ level: 'kab', parent: { id: r.id, name: r.name } })
                            }
                          }}
                        >
                          <td className="px-2 py-2">
                            <div className="font-semibold text-slate-800">{r.name}</div>
                            {r.parent ? <div className="text-[10px] text-slate-400">{r.parent}</div> : null}
                          </td>
                          <td className="px-1.5 py-2 text-right tabular-nums text-slate-700">{nf(r.kejadian)}</td>
                          <td className="px-1.5 py-2 text-right font-bold tabular-nums text-red-700">{nf(r.kasus)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums text-slate-800">{nf(r.meninggal)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums text-slate-600">{pf(r.cfr_pct)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums text-slate-600">{pf(r.ar_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {/* BAGIAN 3: DINAMIKA TEMPORAL (KURVA EPIDEMI, PEMANTAUAN HARIAN & KOMPARASI WILAYAH) */}
          <SectionHead
            no={3}
            id="waktu"
            title="Dinamika Temporal: Kurva Epidemi & Pemantauan Perkembangan Kasus Harian"
            desc="Analisis pola penularan/paparan menurut waktu kejadian (point-source vs intermittent) serta pemantauan klinis harian pasien pasca-insiden."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title={`Kurva Epidemi Insiden Keracunan Pangan · ${jenisLabel(f.jenis)} per ${granLabel}`}
              testId="panel-epi-curve"
              desc="Distribusi kronologis berdasarkan tanggal kejadian; mendukung identifikasi puncak ledakan kasus."
            >
              <EpiCurve series={data.daily_series} jenis={f.jenis} gran={f.gran} />
            </Panel>
            <Panel
              title="Log Pemantauan Klinis Harian Pasca-Insiden"
              desc="Perkembangan kumulatif harian korban: kasus baru dilaporkan, pasien rawat inap, dan pasien sembuh."
              testId="panel-perkembangan-harian"
            >
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
            </Panel>
          </div>

          <Panel
            title={`Grafik Komparasi Beban ${jenisLabel(f.jenis)} antar-${LEVEL_TXT[lvl]}`}
            testId="panel-region-chart"
            desc="Visualisasi perbandingan beban wilayah dengan opsi tampilan Column, Bar, atau Line serta pengurutan nilai."
          >
            <RegionChart ranking={data.ranking} jenis={f.jenis} autoLevel={lvl} />
          </Panel>

          {/* BAGIAN 4: EVALUASI KINERJA RESPONS CEPAT, LABORATORIUM & PANGAN DICURIGAI */}
          <SectionHead
            no={4}
            id="respons"
            title="Evaluasi Kecepatan Pelaporan (Target ≤ 24 Jam), Diagnostik Lab & Agen Pangan"
            desc="Pengukuran kepatuhan pelaporan dini KLB, cakupan serta waktu tunggu (Turnaround Time) uji spesimen laboratorium, dan identifikasi pangan pemicu."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-blue-700" /> Ketepatan Waktu Pelaporan KLB (≤ 24 Jam)
                </span>
              }
              desc="Distribusi selang waktu sejak kejadian hingga laporan resmi dikirim (standar kewaspadaan dini ≤ 24 jam)."
              testId="panel-ketepatan"
            >
              {!kt || !(kt.dilaporkan + kt.belum_dilaporkan) ? (
                <EmptyBox msg="Belum ada laporan pada filter ini." />
              ) : (
                <div className="space-y-2.5">
                  <RatioBar label="≤ 24 jam (Sesuai Target)" good={kt.le24} total={Math.max(1, kt.dilaporkan)} barCls="bg-emerald-600" />
                  <RatioBar label="24–48 jam" good={kt.h24_48} total={Math.max(1, kt.dilaporkan)} barCls="bg-amber-500" />
                  <RatioBar label="48–72 jam" good={kt.h48_72} total={Math.max(1, kt.dilaporkan)} barCls="bg-orange-600" />
                  <RatioBar label="> 72 jam (Terlambat)" good={kt.gt72} total={Math.max(1, kt.dilaporkan)} barCls="bg-red-600" />
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <div className="text-[10px] font-bold text-slate-500">Median Kejadian→Lapor</div>
                      <div className="font-black text-slate-900">{fmtJam(kt.median_jam)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <div className="text-[10px] font-bold text-slate-500">Median Gejala→Lapor</div>
                      <div className="font-black text-slate-900">{fmtJam(kt.median_gejala_lapor_jam)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <div className="text-[10px] font-bold text-slate-500">Masih Draf</div>
                      <div className="font-black text-slate-900">{nf(kt.belum_dilaporkan)}</div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            <Panel
              title={
                <span className="inline-flex items-center gap-1.5">
                  <FlaskConical className="h-4 w-4 text-emerald-700" /> Cakupan &amp; Turnaround Time (TAT) Lab
                </span>
              }
              desc="Proporsi kejadian yang telah diambil spesimennya dan memperoleh konfirmasi hasil laboratorium."
              testId="panel-lab"
            >
              {!k.total_kejadian ? (
                <EmptyBox msg="Belum ada kejadian pada filter ini." />
              ) : (
                <div className="space-y-2.5">
                  <RatioBar label="Hasil Uji Tersedia" good={k.lab_hasil} total={k.total_kejadian} barCls="bg-emerald-600" />
                  <RatioBar label="Sampel Dikirim (Menunggu Hasil)" good={k.lab_dikirim} total={k.total_kejadian} barCls="bg-blue-600" />
                  <RatioBar label="Sampel Belum Diambil" good={k.lab_belum} total={k.total_kejadian} barCls="bg-slate-400" />
                  <div className="grid grid-cols-2 gap-2 pt-1 text-center text-xs">
                    <div className="rounded-lg bg-red-50 px-2 py-1.5">
                      <div className="text-[10px] font-bold text-red-700">Kejadian Sampel Positif</div>
                      <div className="font-black text-red-900">{nf(lr?.kejadian_positif)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <div className="text-[10px] font-bold text-slate-500">Median TAT Lab</div>
                      <div className="font-black text-slate-900">
                        {fmtJam(lr?.median_tat_jam)}
                        {lr?.n_tat ? <span className="font-medium text-slate-400"> (n={lr.n_tat})</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            <Panel
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Utensils className="h-4 w-4 text-orange-700" /> Konfirmasi Agen &amp; Pangan Dicurigai
                </span>
              }
              desc="Sampel dengan hasil positif laboratorium (konfirmasi etiologi) dan menu tersaji saat kejadian."
              testId="panel-pangan"
            >
              {!(data.pangan?.sampel_positif.length || data.pangan?.menu.length) ? (
                <EmptyBox msg="Belum ada isian menu atau hasil sampel pangan." />
              ) : (
                <div className="space-y-3 text-xs">
                  {data.pangan?.sampel_positif.length ? (
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-red-700">
                        Sampel Terkonfirmasi Positif Lab
                      </div>
                      <div className="space-y-1">
                        {data.pangan.sampel_positif.slice(0, 6).map((x) => (
                          <div key={x.nama} className="flex items-center justify-between gap-2 rounded-lg bg-red-50/60 px-2.5 py-1.5">
                            <span className="min-w-0 truncate font-semibold text-slate-800" title={`${x.nama} · ${x.kategori}`}>
                              {x.nama} <span className="font-normal text-slate-500">· {x.kategori}</span>
                            </span>
                            <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold text-red-700">
                              {x.positif}/{x.diuji} positif
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {data.pangan?.menu.length ? (
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                        Komponen Menu Tersaji Saat Insiden
                      </div>
                      <div className="space-y-1">
                        {data.pangan.menu.slice(0, 8).map((x) => (
                          <div
                            key={`${x.komponen}-${x.nama}`}
                            className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                          >
                            <span className="min-w-0 truncate font-semibold text-slate-800" title={`${x.nama} · ${x.komponen}`}>
                              {x.nama} <span className="font-normal text-slate-500">· {x.komponen}</span>
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-right font-mono text-[10.5px] text-slate-600">
                              {x.kejadian} kej · {nf(x.kasus)} kasus
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>

          {/* BAGIAN 5: KARAKTERISTIK KLINIS & DISTRIBUSI DEMOGRAFI KORBAN */}
          <SectionHead
            no={5}
            id="korban"
            title="Karakteristik Sindrom Klinis & Distribusi Demografi Korban"
            desc="Prevalensi gejala klinis utama untuk membantu penegakan diagnosis banding patogen/toksin serta profil kelompok umur dan kerentanan korban."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel
              title="Distribusi Gejala Klinis Dominan"
              desc={`Proporsi dari ${nf(data.kpis.total_kasus)} kasus yang mengalami masing-masing manifestasi klinis.`}
              testId="panel-gejala"
            >
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
            </Panel>

            <Panel
              title="Struktur Demografi, Kelompok Usia & Kelompok Rentan"
              desc="Distribusi korban berdasarkan jenis kelamin, jenjang usia pendidikan, dan kelompok sasaran rentan (Balita/Bumil/Busui)."
              testId="panel-demografi"
            >
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
            </Panel>
          </div>

          {/* BAGIAN 6: INVESTIGASI FAKTOR RISIKO LINGKUNGAN DAPUR, 26 SOP & SAMPEL LAB */}
          <SectionHead
            no={6}
            id="faktor-risiko"
            title="Investigasi Faktor Risiko Kesehatan Lingkungan Dapur, Kepatuhan 26 SOP & Uji Sampel"
            desc="Temuan pemeriksaan sanitasi dapur SPPG pada lokasi KLB: kepemilikan SLHS, hasil IKL, ketidakpatuhan 26 SOP pengolahan pangan, dan rincian sampel lab."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title="Status SLHS, Hasil IKL & Sanitasi Lingkungan Dapur"
              desc="Kepemilikan SLHS, kelayakan IKL, sertifikasi penjamah pangan, dan faktor risiko operasional distribusi."
              testId="panel-lingkungan"
            >
              {!data.kpis.total_kejadian ? (
                <EmptyBox msg="Belum ada data investigasi lingkungan." />
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2" data-testid="slhs-ikl">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                      <div className="font-bold text-slate-700">Kepemilikan SLHS</div>
                      <div className="mt-1 font-mono text-[11px]">
                        <b className="text-emerald-700">{nf(data.lingkungan_sop.slhs.ya)} Ada</b> ·{' '}
                        <span className="text-red-600">{nf(data.lingkungan_sop.slhs.tidak)} Tidak</span> ·{' '}
                        <span className="text-slate-400">{nf(data.lingkungan_sop.slhs.kosong)} kosong</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                      <div className="font-bold text-slate-700">Hasil Inspeksi IKL</div>
                      <div className="mt-1 font-mono text-[11px]">
                        <b className="text-emerald-700">{nf(data.lingkungan_sop.ikl.memenuhi)} MS</b> ·{' '}
                        <span className="text-red-600">{nf(data.lingkungan_sop.ikl.tidak_memenuhi)} TMS</span> ·{' '}
                        <span className="text-slate-400">{nf(data.lingkungan_sop.ikl.kosong)} kosong</span>
                      </div>
                    </div>
                  </div>
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
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      Checklist Operasional &amp; Distribusi
                    </div>
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
                      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        Sumber Air Dapur SPPG
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.lingkungan_sop.sumber_air.map((sa) => (
                          <span
                            key={sa.sumber}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-semibold text-slate-700"
                          >
                            {sa.sumber}: <b>{nf(sa.count)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>

            <Panel
              title="Analisis Gap Kepatuhan 26 SOP Dapur SPPG"
              desc="Peringkat butir SOP higiene sanitasi yang tidak tersedia atau tidak dijalankan pada lokasi kejadian."
              testId="panel-sop-gap"
            >
              {!data.lingkungan_sop.sop_gap.length ? (
                <EmptyBox msg="Belum ada data checklist 26 SOP penyelidikan." />
              ) : (
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-1.5 pr-2 text-left">Butir SOP</th>
                        <th className="py-1.5 text-right">Tdk Ada</th>
                        <th className="py-1.5 text-right">Tdk Jln</th>
                        <th className="py-1.5 text-right">Total Gap</th>
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
            </Panel>

            <Panel
              title="Rekapitulasi Uji Sampel Laboratorium per Kategori"
              desc="Distribusi sampel pangan, air bersih, usap alat/tangan, dan spesimen klinis beserta temuan positif."
              testId="panel-lab-sampel"
            >
              {!data.lab_sampel.length ? (
                <EmptyBox msg="Belum ada catatan sampel laboratorium pada transaksi." />
              ) : (
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-1.5 pr-2 text-left">Kategori Sampel</th>
                        <th className="py-1.5 text-right">Total</th>
                        <th className="py-1.5 text-right">Mikro (+)</th>
                        <th className="py-1.5 text-right">Kimia (+)</th>
                        <th className="py-1.5 text-right">Menunggu</th>
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
            </Panel>
          </div>

          {/* BAGIAN 7: REGISTER INVESTIGASI KEJADIAN KLB & LAMPIRAN ANALITIK MINGGUAN */}
          <SectionHead
            no={7}
            id="daftar"
            title="Register Investigasi Kejadian KLB Keracunan Pangan MBG"
            desc="Daftar lengkap laporan kejadian sesuai filter aktif; klik baris laporan untuk meninjau rincian kronologi, lingkungan, dan sampel lab."
          />
          <IncidentList rows={data.recent_incidents} />

          <MoreDetails
            label="Matriks Heatmap Mingguan, Tren Minggu Epidemiologi & Riwayat Pengawasan SPPG Terdampak"
            testId="detail-mingguan"
          >
            <KeracunanMatrixHeatmap heatmap={data.heatmap} />
            <Panel
              title="Tren Mingguan Kejadian & Korban (Minggu Epidemiologi)"
              desc="Jumlah kejadian (batang) serta total kasus sakit & kematian (garis) per Minggu Epidemiologi."
              testId="panel-tren-mingguan"
            >
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
            </Panel>
            <Panel
              title="Korelasi SPPG Terdampak terhadap Riwayat Pengawasan Gizi"
              desc="Sandingan data kejadian keracunan per SPPG dengan frekuensi kunjungan dan rata-rata skor SOP pengawasan gizi."
              testId="panel-sppg-pengawasan"
            >
              {!data.sppg_incidents.length ? (
                <EmptyBox msg="Belum ada data SPPG pada kejadian keracunan pangan." />
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2 text-left">SPPG &amp; Wilayah</th>
                        <th className="py-2 text-right">Kejadian</th>
                        <th className="py-2 text-right">Kasus</th>
                        <th className="py-2 text-right">Kunjungan Audit</th>
                        <th className="py-2 text-right">Skor SOP</th>
                        <th className="py-2 text-center">Status F12 Terakhir</th>
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
                          <td
                            className={`py-2 text-right font-mono tabular-nums ${
                              s.pengawasan_avg_skor != null && s.pengawasan_avg_skor < 80 ? 'font-bold text-red-700' : 'text-slate-700'
                            }`}
                          >
                            {s.pengawasan_avg_skor != null ? s.pengawasan_avg_skor.toFixed(1) : '—'}
                          </td>
                          <td className="py-2 text-center">
                            <RekapBadge value={s.pengawasan_rekap12} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </MoreDetails>
        </>
      ) : null}
    </div>
  )
}
