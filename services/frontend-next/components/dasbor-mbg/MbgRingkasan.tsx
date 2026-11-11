'use client'
// PR 052: Ringkasan Dasbor MBG — gabungan Keracunan Pangan (kejadian) & Pengawasan Gizi (pencegahan).
// * Kartu ringkas ala dasbor Kemkes: "Kerpang MBG" (provinsi, kab/kota, kejadian, kasus, kematian) & "Rekap SLHS/IKL"
// * Grafik wilayah ala panel "KERACUNAN MAKAN MBG" + kurva epidemi
// * Tautan risiko: SPPG yang mengalami kejadian keracunan dibandingkan dengan hasil pengawasannya
import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowRight, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { Empty, Interpretasi, Kpi, Panel, Seg } from '@/components/analisa/ui'
import { EmptyBox, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { EpiCurve, RegionChart } from '@/components/dasbor-mbg/MbgCharts'
import { autoRegionLevel } from '@/components/dasbor-mbg/KeracunanDashboardView'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'
import { GRAN_OPTS, jenisLabel, wilson, type MbgFilter, type MbgTab } from '@/lib/dasbor-mbg-filter'

export type Risiko = 'skor_rendah' | 'belum_diawasi' | 'memadai'
export const RISIKO_LABEL: Record<Risiko, string> = {
  skor_rendah: 'Skor pengawasan rendah + kejadian',
  belum_diawasi: 'Belum pernah diawasi + kejadian',
  memadai: 'Diawasi memadai + kejadian',
}
type Inc = KeracunanDashData['sppg_incidents'][number]
export function risikoOf(s: Inc): Risiko {
  if (!s.pengawasan_kunjungan) return 'belum_diawasi'
  if ((s.pengawasan_avg_skor != null && s.pengawasan_avg_skor < 80) || s.pengawasan_rekap12 === 'BELUM BAIK') return 'skor_rendah'
  return 'memadai'
}
const RISK_ORDER: Record<Risiko, number> = { skor_rendah: 0, belum_diawasi: 1, memadai: 2 }
const RISK_CLS: Record<Risiko, string> = {
  skor_rendah: 'border-red-200 bg-red-50 text-red-800',
  belum_diawasi: 'border-orange-200 bg-orange-50 text-orange-800',
  memadai: 'border-amber-200 bg-amber-50 text-amber-800',
}

export function riskRows(ker: KeracunanDashData | null) {
  return [...(ker?.sppg_incidents || [])].filter((s) => s.nama_sppg).map((s) => ({ ...s, risiko: risikoOf(s) }))
    .sort((a, b) => RISK_ORDER[a.risiko] - RISK_ORDER[b.risiko] || b.kasus - a.kasus)
}
export function pencegahanRows(gizi: GiziDashData | null, ker: KeracunanDashData | null) {
  const inc = new Set((ker?.sppg_incidents || []).map((s) => (s.nama_sppg || '').trim().toLowerCase()))
  return (gizi?.sppg_summary || []).filter((s) => ((s.avg_skor != null && s.avg_skor < 80) || s.last_rekap12 === 'BELUM BAIK') && !inc.has(s.nama_sppg.trim().toLowerCase()))
    .sort((a, b) => (a.avg_skor ?? 100) - (b.avg_skor ?? 100))
}

export default function MbgRingkasan({ ker, gizi, f, go, mapSection }: { ker: KeracunanDashData | null; gizi: GiziDashData | null; f: MbgFilter; go: (t: MbgTab) => void; /** PR 052b: bagian peta 2 kolom (Keracunan | Pengawasan) */ mapSection?: ReactNode }) {
  const [riskFilter, setRiskFilter] = useState<'utama' | 'semua'>('utama')
  const k = ker?.kpis
  const g = gizi?.kpis
  const cfr = k ? wilson(k.total_meninggal, k.total_kasus) : null
  const risks = useMemo(() => riskRows(ker), [ker])
  const shownRisks = riskFilter === 'utama' ? risks.filter((r) => r.risiko !== 'memadai') : risks
  const cegah = useMemo(() => pencegahanRows(gizi, ker), [gizi, ker])
  const nSkor = risks.filter((r) => r.risiko === 'skor_rendah').length
  const nBelum = risks.filter((r) => r.risiko === 'belum_diawasi').length
  const ls = ker?.lingkungan_sop
  const iklDiperiksa = ls ? ls.ikl.memenuhi + ls.ikl.tidak_memenuhi : 0
  const granLabel = GRAN_OPTS.find((x) => x.value === f.gran)?.label

  const isEmptyAll = Boolean(k && g && !k.total_kejadian && !g.total_kunjungan)
  return (
    <div className="space-y-4" data-testid="mbg-ringkasan">
      {isEmptyAll ? (
        <Empty title="Belum ada data Program MBG untuk filter ini">
          Dasbor membaca langsung transaksi <b>Keracunan Pangan MBG</b> dan <b>Pengawasan Gizi MBG</b>. Ubah periode/wilayah di panel filter,
          atau mulai input laporan melalui menu Program MBG → Keracunan Pangan MBG / Pengawasan Gizi MBG.
        </Empty>
      ) : null}
      {/* Alur: pencegahan → kejadian */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-2xs" data-testid="alur-mbg">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-800"><ClipboardCheck className="h-3.5 w-3.5" /> Pengawasan Gizi = pencegahan (skor SOP, F12/F13)</span>
        <ArrowRight className="h-4 w-4 text-slate-400" />
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 font-bold text-amber-800"><ShieldCheck className="h-3.5 w-3.5" /> Temuan & skor rendah = faktor risiko</span>
        <ArrowRight className="h-4 w-4 text-slate-400" />
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 font-bold text-red-800"><AlertTriangle className="h-3.5 w-3.5" /> Keracunan Pangan = kejadian (outcome)</span>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
        <Panel title="Keracunan Pangan MBG" className="2xl:col-span-1" testId="ringkas-kerpang" actions={<button type="button" onClick={() => go('keracunan')} className="text-[11px] font-bold text-primary hover:underline">Detail →</button>}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="Provinsi" value={k?.provinsi_unik} tone="slate" />
            <Kpi label="Kab/Kota" value={k?.kabkota_unik} tone="slate" />
            <Kpi label="Kejadian" value={k?.total_kejadian} tone="amber" />
            <Kpi label="Kasus" value={k?.total_kasus} tone="red" sub={k?.rawat_inap ? `${nf(k.rawat_inap)} rawat inap` : undefined} />
            <Kpi label="Kematian" value={k?.total_meninggal} tone="slate" sub={cfr ? `CFR ${pf(cfr.p)} (IK95% ${pf(cfr.lo)}–${pf(cfr.hi)})` : 'CFR —'} />
            <Kpi label="Attack rate" value={k?.attack_rate_pct ?? null} pct tone="blue" tip="Kasus ÷ terpapar pada kejadian yang mengisi jumlah terpapar/porsi." />
          </div>
        </Panel>
        <Panel title="Rekap SLHS & IKL SPPG" testId="ringkas-slhs" tip="Dari isian penyelidikan Keracunan Pangan MBG: kepemilikan Sertifikat Laik Higiene Sanitasi (SLHS) dapur SPPG dan hasil Inspeksi Kesehatan Lingkungan (IKL). Setara kartu 'Rekap SLHS' Kemkes (Pemeriksaan / Direkomendasikan / Tidak Direkomendasikan).">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="IKL diperiksa" value={iklDiperiksa} tone="slate" />
            <Kpi label="Memenuhi syarat" value={ls?.ikl.memenuhi} tone="teal" />
            <Kpi label="Tidak memenuhi" value={ls?.ikl.tidak_memenuhi} tone="red" />
            <Kpi label="SLHS ada" value={ls?.slhs.ya} tone="teal" />
            <Kpi label="SLHS tidak ada" value={ls?.slhs.tidak} tone="red" />
            <Kpi label="SLHS belum diisi" value={ls?.slhs.kosong} tone="slate" />
          </div>
        </Panel>
        <Panel title="Pengawasan Gizi MBG" testId="ringkas-gizi" actions={<button type="button" onClick={() => go('gizi')} className="text-[11px] font-bold text-primary hover:underline">Detail →</button>}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="Kunjungan" value={g?.total_kunjungan} tone="teal" sub={g ? `${nf(g.dikirim)} dikirim` : undefined} />
            <Kpi label="SPPG diawasi" value={g?.sppg_unik} tone="teal" />
            <Kpi label="Skor SOP rata-rata" value={g?.avg_skor_sop ?? null} pct tone={g?.avg_skor_sop != null && g.avg_skor_sop < 80 ? 'red' : 'teal'} tip="Rata-rata skor Formulir 3–11. Ambang sesuai standar = 80." />
            <Kpi label="F12 BAIK" value={g?.rekap12_baik} tone="teal" />
            <Kpi label="F12 BELUM BAIK" value={g?.rekap12_belum_baik} tone="amber" />
            <Kpi label="F13 BELUM BAIK" value={g?.rekap13_belum_baik} tone="amber" />
          </div>
        </Panel>
      </div>

      <Interpretasi lines={[
        risks.length ? `${nf(risks.length)} SPPG mengalami kejadian keracunan: ${nf(nSkor)} di antaranya skor pengawasannya rendah dan ${nf(nBelum)} belum pernah diawasi.` : null,
        nBelum ? 'SPPG terdampak yang belum pernah diawasi menunjukkan celah cakupan pengawasan — prioritaskan kunjungan pengawasan ke SPPG tersebut dan SPPG lain di wilayah yang sama.' : null,
        cegah.length ? `${nf(cegah.length)} SPPG berskor rendah belum mengalami kejadian — target pembinaan pencegahan sebelum terjadi KLB.` : null,
        'Catatan: pencocokan SPPG antar-modul berdasarkan nama SPPG (belum ada kode SPPG bersama), sehingga perbedaan penulisan nama dapat membuat SPPG tidak terhubung.',
      ]} />

      {mapSection}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <Panel title={`${jenisLabel(f.jenis)} Keracunan Pangan MBG per Wilayah`} testId="ringkas-wilayah"
          tip="Panel utama dasbor Kemkes (KERACUNAN MAKAN MBG) dengan opsi yang sama. Tingkat wilayah otomatis mengikuti filter.">
          <RegionChart ranking={ker?.ranking} jenis={f.jenis} autoLevel={autoRegionLevel(f)} testId="ringkas-region-chart" />
        </Panel>
        <Panel title={`Kurva Epidemi · ${jenisLabel(f.jenis)} per ${granLabel}`} testId="ringkas-epi" tip="Menurut tanggal kejadian; periode tanpa kejadian bernilai 0.">
          <EpiCurve series={ker?.daily_series} jenis={f.jenis} gran={f.gran} testId="ringkas-epi-curve" />
        </Panel>
      </div>

      <Panel title="Tautan Risiko: Pengawasan × Kejadian per SPPG" testId="panel-tautan-risiko"
        desc="SPPG yang mengalami keracunan pangan, dikaitkan dengan riwayat Pengawasan Gizi-nya (kunjungan, skor SOP F3–F11, rekap F12)"
        tip="Skor rendah = rata-rata skor < 80 atau F12 terakhir BELUM BAIK. Kolom 'Pengawasan terakhir' menunjukkan apakah kunjungan terjadi sebelum atau sesudah kejadian."
        actions={<Seg<'utama' | 'semua'> value={riskFilter} onChange={setRiskFilter} options={[{ value: 'utama', label: 'Skor rendah / belum diawasi' }, { value: 'semua', label: 'Semua SPPG terdampak' }]} testId="risk-filter" />}>
        {!shownRisks.length ? <EmptyBox msg={risks.length ? 'Semua SPPG terdampak sudah diawasi dengan skor memadai.' : 'Belum ada SPPG dengan kejadian keracunan pada filter ini.'} /> : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-2 text-left">SPPG & wilayah</th>
                  <th className="py-2 pr-2 text-left">Kategori risiko</th>
                  <th className="py-2 pl-3 text-right">Kejadian</th>
                  <th className="py-2 pl-3 text-right">Kasus</th>
                  <th className="py-2 pl-3 text-right">Kejadian terakhir</th>
                  <th className="py-2 pl-3 text-right">Kunjungan</th>
                  <th className="py-2 pl-3 text-right">Skor SOP</th>
                  <th className="py-2 pl-3 text-center">F12</th>
                  <th className="py-2 pl-3 text-right">Pengawasan terakhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownRisks.map((s) => (
                  <tr key={s.nama_sppg} className="hover:bg-slate-50">
                    <td className="py-2 pr-2"><div className="font-bold text-slate-800">{s.nama_sppg}</div><div className="text-[11px] text-slate-500">{[s.kabkota_name, s.province_name].filter(Boolean).join(', ')}</div></td>
                    <td className="py-2 pr-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${RISK_CLS[s.risiko]}`}>{RISIKO_LABEL[s.risiko]}</span></td>
                    <td className="py-2 pl-3 text-right tabular-nums">{nf(s.kejadian)}</td>
                    <td className="py-2 pl-3 text-right font-bold tabular-nums text-red-700">{nf(s.kasus)}</td>
                    <td className="py-2 pl-3 text-right font-mono text-[11px] text-slate-600">{s.last_kejadian?.slice(0, 10) || '—'}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-emerald-700">{nf(s.pengawasan_kunjungan)}</td>
                    <td className={`py-2 pl-3 text-right font-mono tabular-nums ${s.pengawasan_avg_skor != null && s.pengawasan_avg_skor < 80 ? 'font-bold text-red-700' : 'text-slate-700'}`}>{s.pengawasan_avg_skor != null ? s.pengawasan_avg_skor.toFixed(1) : '—'}</td>
                    <td className="py-2 pl-3 text-center"><RekapBadge value={s.pengawasan_rekap12} /></td>
                    <td className="py-2 pl-3 text-right font-mono text-[11px] text-slate-600">{s.pengawasan_terakhir || '—'}{s.pengawasan_terakhir && s.last_kejadian ? <span className="ml-1 text-[10px] text-slate-400">({s.pengawasan_terakhir <= s.last_kejadian.slice(0, 10) ? 'sebelum' : 'sesudah'})</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Prioritas Pencegahan: SPPG Skor Rendah Tanpa Kejadian" testId="panel-pencegahan"
        desc="SPPG dengan skor SOP < 80 atau F12 BELUM BAIK yang belum tercatat mengalami keracunan pada filter ini">
        {!cegah.length ? <EmptyBox msg="Tidak ada SPPG berskor rendah tanpa kejadian pada filter ini." /> : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {cegah.slice(0, 12).map((s) => (
              <div key={s.nama_sppg} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
                <div className="min-w-0"><div className="truncate font-bold text-slate-800">{s.nama_sppg}</div><div className="truncate text-[11px] text-slate-500">{[s.kabkota_name, s.province_name].filter(Boolean).join(', ')} · {nf(s.kunjungan)} kunjungan</div></div>
                <div className="shrink-0 text-right"><div className="font-mono font-bold text-red-700">{s.avg_skor != null ? s.avg_skor.toFixed(1) : '—'}</div><RekapBadge value={s.last_rekap12} /></div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
