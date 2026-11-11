'use client'
// PR 036: Halaman Keracunan Pangan MBG (langsung dari transaksi `mbg_keracunan` & `mbg_keracunan_update`, plus korelasi ke Pengawasan Gizi SPPG).
// PR 052: filter di panel samping bersama; KPI epidemiologis (CFR + IK 95% Wilson, attack rate, rawat inap), kurva epidemi,
// grafik wilayah ala Kemkes, ketepatan lapor, ringkasan lab, pangan dicurigai, daftar kejadian.
// PR 052b: tata letak dekat dengan PR 036 tetapi berurutan & bernomor: 1 angka utama → 2 peta 2 kolom (Keracunan | Pengawasan)
// → 3 kurva epidemi → 4 peringkat wilayah → 5 respons (lapor, lab, pangan) → 6 korban → 7 faktor risiko dapur → 8 daftar.
// Setiap panel punya satu kalimat penjelas; panel lanjutan PR 036 (heatmap & tren mingguan) dipindah ke bagian lipat.
import {
  Activity, FlaskConical, Hospital,
  ShieldAlert, Skull, Timer, Users, Utensils,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'
import { KeracunanMatrixHeatmap } from '@/components/dasbor-mbg/MbgHeatmap'
import { EmptyBox, KpiCard, RatioBar, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { EpiCurve, RegionChart, type RegionLevel } from '@/components/dasbor-mbg/MbgCharts'
import IncidentList from '@/components/dasbor-mbg/IncidentList'
import MbgMapSection, { MoreDetails, SectionHead } from '@/components/dasbor-mbg/MbgSections'
import { Interpretasi, Panel } from '@/components/analisa/ui'
import { ErrorState, SkeletonChart, SkeletonKpiRow, SkeletonMap } from '@/components/ui/Skeleton'
import { fmtJam, GRAN_OPTS, jenisLabel, wilson, type MapState, type MbgFilter } from '@/lib/dasbor-mbg-filter'

export function autoRegionLevel(f: MbgFilter): RegionLevel {
  return f.kab.length ? 'kecamatan' : f.prov.length ? 'kabkota' : 'provinsi'
}

const LEVEL_TXT: Record<RegionLevel, string> = { provinsi: 'Provinsi', kabkota: 'Kab/Kota', kecamatan: 'Kecamatan' }

export default function KeracunanDashboardView({ data, loading, error, reload, f, map, setMap, gizi = null, gMap, setGMap }: {
  data: KeracunanDashData | null
  loading: boolean
  error: string | null
  reload: () => void
  f: MbgFilter
  map: MapState
  setMap: (m: MapState) => void
  /** PR 052b: data Pengawasan untuk peta kanan di bagian peta 2 kolom */
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

  return (
    <div className="space-y-4" data-testid="keracunan-dashboard-view">
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading && !data ? (
        <div className="space-y-4">
          <SkeletonKpiRow count={6} />
          <SkeletonMap />
          <SkeletonChart />
        </div>
      ) : data && k ? (
        <>
          <SectionHead no={1} id="angka" title="Angka utama" desc="Seberapa besar masalahnya: jumlah kejadian, korban, keparahan, dan kesiapan pemeriksaan lab." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-testid="keracunan-kpi">
            <KpiCard icon={ShieldAlert} label="Kejadian (KLB)" value={nf(k.total_kejadian)} tone="amber"
              sub={`${nf(k.dilaporkan)} dilaporkan · ${nf(k.ditutup)} ditutup · ${nf(k.draf)} draf · ${nf(k.sppg_unik)} SPPG`} />
            <KpiCard icon={Users} label="Kasus (orang sakit)" value={nf(k.total_kasus)} tone="red"
              sub={`dari ${nf(k.total_terpapar)} terpapar · ${nf(k.total_sekolah_terdampak)} sekolah · ${nf(k.provinsi_unik)} prov / ${nf(k.kabkota_unik)} kab/kota`} />
            <KpiCard icon={Hospital} label="Rawat Inap" value={nf(k.rawat_inap)} tone="teal"
              sub={`${pf(k.total_kasus ? (k.rawat_inap * 100) / k.total_kasus : null)} dari kasus · ${nf(k.rawat_jalan)} rawat jalan · ${nf(k.sembuh)} sembuh`} />
            <KpiCard icon={Skull} label="Kematian & CFR" value={nf(k.total_meninggal)} tone="slate"
              sub={cfr ? <>CFR <b className="text-slate-800">{pf(cfr.p)}</b> (IK 95% {pf(cfr.lo)}–{pf(cfr.hi)})</> : 'CFR: — (belum ada kasus)'} />
            <KpiCard icon={Activity} label="Attack Rate" value={pf(k.attack_rate_pct)} tone="blue"
              sub={`Persen penerima makanan yang sakit · inkubasi rata-rata ${k.avg_inkubasi_jam != null ? `${k.avg_inkubasi_jam.toFixed(1)} jam` : '—'}`} />
            <KpiCard icon={FlaskConical} label="Status Lab" value={`${nf(k.lab_hasil)} hasil`} tone="emerald"
              sub={`${nf(k.lab_dikirim)} dikirim · ${nf(k.lab_belum)} belum diambil${lr ? ` · ${nf(lr.kejadian_positif)} sampel positif` : ''}`} />
          </div>
          <Interpretasi lines={[
            k.total_kejadian ? `Tercatat ${nf(k.total_kejadian)} kejadian keracunan pangan MBG dengan ${nf(k.total_kasus)} kasus${k.attack_rate_pct != null ? ` (rata-rata ${pf(k.attack_rate_pct)} penerima makanan jatuh sakit)` : ''}.` : null,
            cfr && k.total_meninggal ? `CFR ${pf(cfr.p)} (IK 95% ${pf(cfr.lo)}–${pf(cfr.hi)}).` : null,
            kt && kt.dilaporkan ? `${pf(kt.pct_le24)} kejadian dilaporkan ≤ 24 jam (target laporan cepat KLB).` : null,
            lr && k.total_kejadian ? `Hasil lab tersedia untuk ${nf(lr.hasil)} dari ${nf(k.total_kejadian)} kejadian; tanpa hasil lab, penyebab belum dapat dipastikan.` : null,
          ]} />

          <SectionHead no={2} id="peta" title="Di mana terjadinya?" desc="Peta kiri: sebaran kejadian & kasus keracunan. Peta kanan: hasil pengawasan gizi SPPG di wilayah yang sama — bandingkan keduanya. Klik provinsi untuk melihat kab/kota." />
          <MbgMapSection ker={data} gizi={gizi} kMap={map} setKMap={setMap} gMap={gMap || { level: 'prov', parent: null }} setGMap={setGMap || (() => {})} />

          <SectionHead no={3} id="waktu" title="Kapan terjadinya?" desc="Kurva epidemi menunjukkan apakah kejadian menumpuk pada waktu tertentu (klaster) atau tersebar." />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title={`Kurva Epidemi · ${jenisLabel(f.jenis)} per ${granLabel}`} testId="panel-epi-curve"
              desc="Menurut tanggal kejadian; periode tanpa kejadian tetap tampil 0. Ubah Jenis Analisa & granularitas di panel filter.">
              <EpiCurve series={data.daily_series} jenis={f.jenis} gran={f.gran} />
            </Panel>
            <Panel title="Perkembangan Kasus Harian" desc="Pemantauan harian korban setelah kejadian: kasus baru, rawat inap, dan sembuh." testId="panel-perkembangan-harian">
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
          <MoreDetails label="heatmap & tren mingguan (Minggu Epid)" testId="detail-mingguan">
            <KeracunanMatrixHeatmap heatmap={data.heatmap} />
            <Panel title="Tren Mingguan Kejadian & Korban" desc="Jumlah kejadian (batang) serta kasus & kematian (garis) per Minggu Epid." testId="panel-tren-mingguan">
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
          </MoreDetails>

          <SectionHead no={4} id="wilayah" title="Wilayah mana paling terdampak?" desc={`Peringkat ${LEVEL_TXT[lvl].toLowerCase()} menurut ${jenisLabel(f.jenis).toLowerCase()}; tingkat wilayah mengikuti filter Provinsi → Kab/Kota → Kecamatan.`} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title={`${jenisLabel(f.jenis)} per Wilayah`} testId="panel-region-chart"
              desc="Opsi seperti dasbor Kemkes: Column/Line/Bar, urut Nama/Tertinggi/Terendah, label data.">
              <RegionChart ranking={data.ranking} jenis={f.jenis} autoLevel={lvl} />
            </Panel>
            <Panel title={`Tabel ${LEVEL_TXT[lvl]}`} desc="Kasus, kematian, dan attack rate (AR) per wilayah; diurutkan dari kasus terbanyak." testId="panel-rekap-wilayah">
              {!rank.length ? <EmptyBox msg="Belum ada wilayah pada filter ini." /> : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2">Wilayah</th><th className="py-2 text-right">Kej</th><th className="py-2 text-right">Kasus</th><th className="py-2 text-right">Mati</th><th className="py-2 text-right">AR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rank.map((r) => (
                        <tr key={`${r.id}-${r.name}`} className="hover:bg-slate-50">
                          <td className="py-1.5 pr-2"><div className="font-semibold text-slate-800">{r.name}</div>{r.parent ? <div className="text-[10px] text-slate-400">{r.parent}</div> : null}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-700">{nf(r.kejadian)}</td>
                          <td className="py-1.5 text-right font-bold tabular-nums text-red-700">{nf(r.kasus)}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-800">{nf(r.meninggal)}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-600">{pf(r.ar_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <SectionHead no={5} id="respons" title="Seberapa cepat respons & apa penyebabnya?" desc="Ketepatan laporan, kelengkapan pemeriksaan lab, dan makanan yang dicurigai." />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title={<span className="inline-flex items-center gap-1.5"><Timer className="h-4 w-4 text-blue-700" /> Ketepatan Waktu Lapor</span>} desc="Selang waktu dari kejadian sampai laporan dikirim; target ≤ 24 jam." testId="panel-ketepatan"
              tip="Selang tanggal-jam kejadian → laporan dikirim (status Dilaporkan). Laporan cepat KLB keracunan pangan semestinya ≤ 24 jam. Draf belum dihitung.">
              {!kt || !(kt.dilaporkan + kt.belum_dilaporkan) ? <EmptyBox msg="Belum ada laporan pada filter ini." /> : (
                <div className="space-y-2.5">
                  <RatioBar label="≤ 24 jam (tepat waktu)" good={kt.le24} total={Math.max(1, kt.dilaporkan)} barCls="bg-emerald-600" />
                  <RatioBar label="24–48 jam" good={kt.h24_48} total={Math.max(1, kt.dilaporkan)} barCls="bg-amber-500" />
                  <RatioBar label="48–72 jam" good={kt.h48_72} total={Math.max(1, kt.dilaporkan)} barCls="bg-orange-600" />
                  <RatioBar label="> 72 jam" good={kt.gt72} total={Math.max(1, kt.dilaporkan)} barCls="bg-red-600" />
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] font-bold text-slate-500">Median kejadian→lapor</div><div className="font-black text-slate-900">{fmtJam(kt.median_jam)}</div></div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] font-bold text-slate-500">Median gejala→lapor</div><div className="font-black text-slate-900">{fmtJam(kt.median_gejala_lapor_jam)}</div></div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] font-bold text-slate-500">Belum dilaporkan</div><div className="font-black text-slate-900">{nf(kt.belum_dilaporkan)}</div></div>
                  </div>
                </div>
              )}
            </Panel>
            <Panel title={<span className="inline-flex items-center gap-1.5"><FlaskConical className="h-4 w-4 text-emerald-700" /> Status Pemeriksaan Lab</span>} desc="Berapa kejadian yang sampelnya sudah diperiksa dan hasilnya keluar." testId="panel-lab"
              tip="Belum = sampel belum diambil; Dikirim = sampel diambil/dikirim; Hasil = hasil uji tersedia. Waktu tunggu = pengambilan sampel → hasil keluar.">
              {!k.total_kejadian ? <EmptyBox msg="Belum ada kejadian pada filter ini." /> : (
                <div className="space-y-2.5">
                  <RatioBar label="Ada hasil" good={k.lab_hasil} total={k.total_kejadian} barCls="bg-emerald-600" />
                  <RatioBar label="Sampel dikirim, menunggu hasil" good={k.lab_dikirim} total={k.total_kejadian} barCls="bg-blue-600" />
                  <RatioBar label="Sampel belum diambil" good={k.lab_belum} total={k.total_kejadian} barCls="bg-slate-400" />
                  <div className="grid grid-cols-2 gap-2 pt-1 text-center text-xs">
                    <div className="rounded-lg bg-red-50 px-2 py-1.5"><div className="text-[10px] font-bold text-red-700">Kejadian sampel positif</div><div className="font-black text-red-900">{nf(lr?.kejadian_positif)}</div></div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] font-bold text-slate-500">Median waktu tunggu hasil</div><div className="font-black text-slate-900">{fmtJam(lr?.median_tat_jam)}{lr?.n_tat ? <span className="font-medium text-slate-400"> (n={lr.n_tat})</span> : null}</div></div>
                  </div>
                </div>
              )}
            </Panel>
            <Panel title={<span className="inline-flex items-center gap-1.5"><Utensils className="h-4 w-4 text-orange-700" /> Pangan Dicurigai</span>} desc="Bahan dengan sampel lab positif (bukti kuat) dan menu yang disajikan saat kejadian (petunjuk awal)." testId="panel-pangan"
              tip="Sampel positif = sampel pangan/air/spesimen dengan hasil mikrobiologi atau kimia Positif (bukti terkuat). Menu tersaji = komponen menu pada hari kejadian (petunjuk awal, belum tentu penyebab).">
              {!(data.pangan?.sampel_positif.length || data.pangan?.menu.length) ? <EmptyBox msg="Belum ada isian menu atau hasil sampel pangan." /> : (
                <div className="space-y-3 text-xs">
                  {data.pangan?.sampel_positif.length ? (
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-red-700">Sampel positif lab</div>
                      <div className="space-y-1">{data.pangan.sampel_positif.slice(0, 6).map((x) => (
                        <div key={x.nama} className="flex items-center justify-between gap-2 rounded-lg bg-red-50/60 px-2.5 py-1.5"><span className="min-w-0 truncate font-semibold text-slate-800" title={`${x.nama} · ${x.kategori}`}>{x.nama} <span className="font-normal text-slate-500">· {x.kategori}</span></span><span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold text-red-700">{x.positif}/{x.diuji} positif</span></div>
                      ))}</div>
                    </div>
                  ) : null}
                  {data.pangan?.menu.length ? (
                    <div>
                      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">Menu tersaji saat kejadian</div>
                      <div className="space-y-1">{data.pangan.menu.slice(0, 8).map((x) => (
                        <div key={`${x.komponen}-${x.nama}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"><span className="min-w-0 truncate font-semibold text-slate-800" title={`${x.nama} · ${x.komponen}`}>{x.nama} <span className="font-normal text-slate-500">· {x.komponen}</span></span><span className="shrink-0 whitespace-nowrap text-right font-mono text-[10.5px] text-slate-600">{x.kejadian} kej<br />{nf(x.kasus)} kasus</span></div>
                      ))}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>

          <SectionHead no={6} id="korban" title="Siapa korbannya?" desc="Gejala yang paling sering muncul dan profil usia/jenis kelamin korban." />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Profil Gejala Klinis" desc={`Persen dari ${nf(data.kpis.total_kasus)} kasus yang mengalami tiap gejala.`} testId="panel-gejala">
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
            <Panel title="Demografi & Kelompok Rentan" desc="Jumlah korban menurut jenis kelamin, kelompok umur, dan kelompok rentan." testId="panel-demografi">
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

          <SectionHead no={7} id="faktor-risiko" title="Faktor risiko di dapur SPPG" desc="Hasil penyelidikan lingkungan, kepatuhan SOP dapur, hasil uji sampel, dan riwayat pengawasan SPPG yang terdampak." />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title="Lingkungan & Sumber Air" desc="SLHS, IKL, penjamah bersertifikat, dan rantai distribusi makanan." testId="panel-lingkungan">
            {!data.kpis.total_kejadian ? (
              <EmptyBox msg="Belum ada data investigasi lingkungan." />
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2" data-testid="slhs-ikl">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="font-bold text-slate-700">SLHS SPPG</div>
                    <div className="mt-1 font-mono text-[11px]"><b className="text-emerald-700">{nf(data.lingkungan_sop.slhs.ya)} Ada</b> · <span className="text-red-600">{nf(data.lingkungan_sop.slhs.tidak)} Tidak</span> · <span className="text-slate-400">{nf(data.lingkungan_sop.slhs.kosong)} kosong</span></div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="font-bold text-slate-700">Hasil IKL</div>
                    <div className="mt-1 font-mono text-[11px]"><b className="text-emerald-700">{nf(data.lingkungan_sop.ikl.memenuhi)} MS</b> · <span className="text-red-600">{nf(data.lingkungan_sop.ikl.tidak_memenuhi)} TMS</span> · <span className="text-slate-400">{nf(data.lingkungan_sop.ikl.kosong)} kosong</span></div>
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
            </Panel>
            <Panel title="Gap Kepatuhan 26 SOP Dapur" desc="SOP yang paling sering tidak ada atau tidak dijalankan." testId="panel-sop-gap">
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
            </Panel>
            <Panel title="Hasil Uji Sampel per Kategori" desc="Jumlah sampel pangan/air/spesimen dan yang positif mikrobiologi atau kimia." testId="panel-lab-sampel">
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
            </Panel>
          </div>
          <Panel title="SPPG Terdampak × Riwayat Pengawasan Gizi" desc="Apakah SPPG yang mengalami keracunan pernah diawasi, dan berapa skornya (skor < 80 = belum sesuai standar)." testId="panel-sppg-pengawasan">
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
                      <th className="py-2 text-right">Skor SOP</th>
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
                        <td className={`py-2 text-right font-mono tabular-nums ${s.pengawasan_avg_skor != null && s.pengawasan_avg_skor < 80 ? 'font-bold text-red-700' : 'text-slate-700'}`}>{s.pengawasan_avg_skor != null ? s.pengawasan_avg_skor.toFixed(1) : '—'}</td>
                        <td className="py-2 text-center"><RekapBadge value={s.pengawasan_rekap12} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <SectionHead no={8} id="daftar" title="Daftar kejadian" desc="Semua laporan sesuai filter; klik nomor laporan untuk membuka detail transaksi." />
          <IncidentList rows={data.recent_incidents} />
        </>
      ) : null}
    </div>
  )
}
