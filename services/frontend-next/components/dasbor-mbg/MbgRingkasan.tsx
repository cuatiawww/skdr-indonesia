'use client'
// Halaman 1 Dasbor MBG: Ringkasan Eksekutif & Matriks Korelasi Risiko Pimpinan
// Dirancang untuk pengambilan keputusan eksekutif (Kemenkes, BGN, Dinkes Provinsi/Kab/Kota):
// 1. Sintesis Situasi & Rekomendasi Pengerahan Sumber Daya (TGC, Labkesda, Dinkes/BGN, TPG Puskesmas)
// 2. Executive Scorecard 3 Pilar (Keracunan Pangan, Sertifikasi SLHS & IKL, Pengawasan Gizi F1–F13)
// 3. Komparasi Geospasial 2 Kolom (Insiden Keracunan vs Cakupan/Skor Pengawasan Gizi)
// 4. Distribusi Wilayah & Struktur Kategori Risiko SPPG Terdampak
// 5. Matriks Tautan Risiko SPPG (Pengawasan × Kejadian) & Daftar Prioritas Intervensi Pencegahan Pra-KLB
import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  FlaskConical,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
} from 'lucide-react'
import { Empty, Kpi, Panel, Seg } from '@/components/analisa/ui'
import { EmptyBox, RatioBar, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { RegionChart } from '@/components/dasbor-mbg/MbgCharts'
import { autoRegionLevel } from '@/components/dasbor-mbg/KeracunanDashboardView'
import { SectionHead } from '@/components/dasbor-mbg/MbgSections'
import { FORM_TITLES } from '@/lib/pengawasan-gizi/naskah'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'
import { jenisLabel, wilson, type MbgFilter, type MbgTab } from '@/lib/dasbor-mbg-filter'

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
  return [...(ker?.sppg_incidents || [])]
    .filter((s) => s.nama_sppg)
    .map((s) => ({ ...s, risiko: risikoOf(s) }))
    .sort((a, b) => RISK_ORDER[a.risiko] - RISK_ORDER[b.risiko] || b.kasus - a.kasus)
}
export function pencegahanRows(gizi: GiziDashData | null, ker: KeracunanDashData | null) {
  const inc = new Set((ker?.sppg_incidents || []).map((s) => (s.nama_sppg || '').trim().toLowerCase()))
  return (gizi?.sppg_summary || [])
    .filter(
      (s) =>
        ((s.avg_skor != null && s.avg_skor < 80) || s.last_rekap12 === 'BELUM BAIK') &&
        !inc.has(s.nama_sppg.trim().toLowerCase()),
    )
    .sort((a, b) => (a.avg_skor ?? 100) - (b.avg_skor ?? 100))
}

export default function MbgRingkasan({
  ker,
  gizi,
  f,
  go,
  mapSection,
}: {
  ker: KeracunanDashData | null
  gizi: GiziDashData | null
  f: MbgFilter
  go: (t: MbgTab) => void
  mapSection?: ReactNode
}) {
  const [riskFilter, setRiskFilter] = useState<'utama' | 'semua'>('utama')
  const k = ker?.kpis
  const g = gizi?.kpis
  const cfr = k ? wilson(k.total_meninggal, k.total_kasus) : null
  const risks = useMemo(() => riskRows(ker), [ker])
  const shownRisks = riskFilter === 'utama' ? risks.filter((r) => r.risiko !== 'memadai') : risks
  const cegah = useMemo(() => pencegahanRows(gizi, ker), [gizi, ker])
  const nSkor = risks.filter((r) => r.risiko === 'skor_rendah').length
  const nBelum = risks.filter((r) => r.risiko === 'belum_diawasi').length
  const nMemadai = risks.filter((r) => r.risiko === 'memadai').length
  const ls = ker?.lingkungan_sop
  const iklDiperiksa = ls ? ls.ikl.memenuhi + ls.ikl.tidak_memenuhi : 0

  // Identifikasi wilayah terdampak tertinggi & aspek SOP terlemah untuk briefing pimpinan
  const topProv = useMemo(() => {
    const arr = [...(ker?.ranking?.provinsi || [])].sort((a, b) => b.kasus - a.kasus || b.kejadian - a.kejadian)
    return arr[0] || null
  }, [ker])

  const weakestForm = useMemo(() => {
    const arr = [...(gizi?.by_formulir || [])]
      .filter((x) => x.sesuai + x.tidak_sesuai > 0)
      .sort((a, b) => a.sesuai / (a.sesuai + a.tidak_sesuai) - b.sesuai / (b.sesuai + b.tidak_sesuai))
    return arr[0] || null
  }, [gizi])

  const labPending = k ? k.lab_dikirim + k.lab_belum : 0
  const lateReport = ker?.ketepatan_lapor
    ? ker.ketepatan_lapor.h24_48 + ker.ketepatan_lapor.h48_72 + ker.ketepatan_lapor.gt72
    : 0

  // Penentuan status kewaspadaan eksekutif
  const statusLevel: 'siaga' | 'waspada' | 'terkendali' =
    (k?.total_meninggal || 0) > 0 || (k?.total_kejadian || 0) >= 5
      ? 'siaga'
      : (k?.total_kejadian || 0) > 0 || (g?.avg_skor_sop != null && g.avg_skor_sop < 80) || cegah.length > 0
        ? 'waspada'
        : 'terkendali'

  const isEmptyAll = Boolean(k && g && !k.total_kejadian && !g.total_kunjungan)

  return (
    <div className="space-y-5" data-testid="mbg-ringkasan">
      {isEmptyAll ? (
        <Empty title="Belum ada data transaksi Program MBG pada filter aktif">
          Dasbor membaca langsung transaksi <b>Keracunan Pangan MBG</b> dan <b>Pengawasan Gizi MBG</b>. Ubah rentang periode atau wilayah
          di panel filter kiri, atau mulai input laporan melalui menu <b>Program MBG</b>.
        </Empty>
      ) : null}

      {/* BAGIAN 1: SINTESIS SITUASI EKSEKUTIF & REKOMENDASI PENGERAHAN SUMBER DAYA */}
      <SectionHead
        no={1}
        id="komando-eksekutif"
        title="Sintesis Situasi Eksekutif & Rekomendasi Pengerahan Sumber Daya"
        desc="Evaluasi otomatis berbasis data transaksi untuk mendukung keputusan pimpinan: identifikasi titik kritis permasalahan dan alokasi tim di lapangan."
        badge={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold tracking-wide ${
              statusLevel === 'siaga'
                ? 'border-red-300 bg-red-50 text-red-800'
                : statusLevel === 'waspada'
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                statusLevel === 'siaga' ? 'bg-red-600' : statusLevel === 'waspada' ? 'bg-amber-500' : 'bg-emerald-600'
              }`}
            />
            {statusLevel === 'siaga'
              ? 'STATUS: SIAGA KLB PANGAN'
              : statusLevel === 'waspada'
                ? 'STATUS: WASPADA RISIKO SPPG'
                : 'STATUS: TERKENDALI'}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="executive-mobilization-grid">
        {/* Kartu Komando 1: Respons KLB & Lab */}
        <div className="flex flex-col justify-between rounded-2xl border border-red-200/90 bg-gradient-to-br from-red-50/70 via-white to-white p-4 shadow-2xs">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-extrabold text-red-900">
                <Siren className="h-3.5 w-3.5 text-red-700" /> 1. Respons Cepat KLB &amp; Diagnostik Lab
              </span>
              <span className="text-[11px] font-bold text-red-700">{nf(k?.total_kejadian)} Kejadian</span>
            </div>
            <div className="text-xs leading-relaxed text-slate-700">
              <p className="font-bold text-slate-900">Permasalahan Utama:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11.5px] text-slate-600">
                <li>
                  Tercatat <b className="text-slate-900">{nf(k?.total_kasus)} kasus sakit</b> ({nf(k?.rawat_inap)} rawat inap,{' '}
                  <b className="text-red-700">{nf(k?.total_meninggal)} meninggal</b>) di {nf(k?.kabkota_unik)} kab/kota.
                </li>
                {topProv ? (
                  <li>
                    Konsentrasi beban tertinggi di <b>{topProv.name}</b> ({nf(topProv.kasus)} kasus dari {nf(topProv.kejadian)} kejadian).
                  </li>
                ) : null}
                <li>
                  <b>{nf(labPending)} kejadian</b> belum memiliki hasil laboratorium tuntas dan <b>{nf(lateReport)} laporan</b> dikirim
                  melebihi target 24 jam.
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-red-200/80 bg-white/90 p-2.5 text-[11px]">
            <div className="font-extrabold uppercase tracking-wider text-red-800">Apa yang Perlu Dikerahkan:</div>
            <p className="mt-0.5 text-slate-700">
              Kerahkan <b>Tim Gerak Cepat (TGC) Dinkes</b> &amp; <b>Labkesda</b> ke wilayah fokus untuk pengambilan sampel pangan/air/spesimen
              serta percepatan <i>Turnaround Time</i> (TAT) uji mikrobiologi &amp; kimia.
            </p>
          </div>
        </div>

        {/* Kartu Komando 2: Audit Lingkungan & Sertifikasi SPPG */}
        <div className="flex flex-col justify-between rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/70 via-white to-white p-4 shadow-2xs">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-900">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-700" /> 2. Audit Lingkungan &amp; Celah Cakupan SPPG
              </span>
              <span className="text-[11px] font-bold text-amber-800">{nf(risks.length)} SPPG Terdampak</span>
            </div>
            <div className="text-xs leading-relaxed text-slate-700">
              <p className="font-bold text-slate-900">Permasalahan Utama:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11.5px] text-slate-600">
                <li>
                  Dari {nf(risks.length)} SPPG yang mengalami KLB keracunan, <b className="text-orange-700">{nf(nBelum)} SPPG belum pernah diawasi</b>{' '}
                  sama sekali dan <b className="text-red-700">{nf(nSkor)} SPPG memiliki skor SOP rendah (&lt;80)</b>.
                </li>
                <li>
                  Pada lokasi kejadian, <b>{nf(ls?.slhs.tidak)} SPPG belum memiliki SLHS</b> dan{' '}
                  <b>{nf(ls?.ikl.tidak_memenuhi)} SPPG tidak memenuhi syarat IKL</b>.
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/90 p-2.5 text-[11px]">
            <div className="font-extrabold uppercase tracking-wider text-amber-900">Apa yang Perlu Dikerahkan:</div>
            <p className="mt-0.5 text-slate-700">
              Instruksikan <b>Dinkes Kab/Kota &amp; Satgas BGN</b> melakukan <b>Inspeksi Kesehatan Lingkungan (IKL) wajib</b>, verifikasi
              kepemilikan SLHS, dan evaluasi kelayakan operasional pada SPPG terdampak.
            </p>
          </div>
        </div>

        {/* Kartu Komando 3: Pembinaan & Pencegahan Dini Pra-KLB */}
        <div className="flex flex-col justify-between rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/70 via-white to-white p-4 shadow-2xs">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-100 px-2.5 py-1 text-[11px] font-extrabold text-teal-900">
                <ClipboardCheck className="h-3.5 w-3.5 text-teal-700" /> 3. Mitigasi &amp; Pembinaan Pra-KLB
              </span>
              <span className="text-[11px] font-bold text-teal-800">{nf(cegah.length)} SPPG Rawan</span>
            </div>
            <div className="text-xs leading-relaxed text-slate-700">
              <p className="font-bold text-slate-900">Permasalahan Utama:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11.5px] text-slate-600">
                <li>
                  Terdapat <b className="text-teal-900">{nf(cegah.length)} SPPG berskor rendah (&lt;80 / F12 BELUM BAIK)</b> yang belum
                  mengalami keracunan namun berisiko tinggi memicu KLB baru.
                </li>
                <li>
                  Rata-rata skor kepatuhan SOP nasional saat ini <b>{pf(g?.avg_skor_sop)}</b> (target standar $\ge 80\%$).
                </li>
                {weakestForm ? (
                  <li>
                    Titik terlemah rantai pasok berada pada{' '}
                    <b>
                      F{weakestForm.form_no} ({FORM_TITLES[weakestForm.form_no]?.short || weakestForm.short})
                    </b>{' '}
                    dengan kepatuhan hanya <b>{pf((weakestForm.sesuai * 100) / (weakestForm.sesuai + weakestForm.tidak_sesuai))}</b>.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-teal-200/80 bg-white/90 p-2.5 text-[11px]">
            <div className="font-extrabold uppercase tracking-wider text-teal-900">Apa yang Perlu Dikerahkan:</div>
            <p className="mt-0.5 text-slate-700">
              Tugaskan <b>Tenaga Pelaksana Gizi (TPG) Puskesmas</b> melaksanakan supervisi korektif terarah pada {nf(cegah.length)} SPPG
              prioritas sebelum terjadi insiden keamanan pangan.
            </p>
          </div>
        </div>
      </div>

      {/* BAGIAN 2: MATRIKS INDIKATOR KINERJA UTAMA (3 PILAR PROGRAM MBG) */}
      <SectionHead
        no={2}
        id="scorecard-pilar"
        title="Matriks Indikator Kinerja Utama (3 Pilar Surveilans & Pengawasan MBG)"
        desc="Ringkasan metrik kunci lintas modul: Beban Epidemiologi KLB Keracunan, Kepatuhan Sertifikasi Lingkungan (SLHS/IKL), dan Cakupan Pengawasan Gizi Rutin."
      />
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
        <Panel
          title="Pilar I · Beban Insiden Keracunan Pangan"
          className="2xl:col-span-1"
          testId="ringkas-kerpang"
          actions={
            <button
              type="button"
              onClick={() => go('keracunan')}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
            >
              Analisa Keracunan <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="Provinsi Terdampak" value={k?.provinsi_unik} tone="slate" />
            <Kpi label="Kab/Kota Terdampak" value={k?.kabkota_unik} tone="slate" />
            <Kpi label="Kejadian KLB" value={k?.total_kejadian} tone="amber" />
            <Kpi label="Total Kasus Sakit" value={k?.total_kasus} tone="red" sub={k?.rawat_inap ? `${nf(k.rawat_inap)} rawat inap` : undefined} />
            <Kpi
              label="Meninggal & CFR"
              value={k?.total_meninggal}
              tone="slate"
              sub={cfr ? `CFR ${pf(cfr.p)} (IK95% ${pf(cfr.lo)}–${pf(cfr.hi)})` : 'CFR —'}
            />
            <Kpi
              label="Attack Rate"
              value={k?.attack_rate_pct ?? null}
              pct
              tone="blue"
              tip="Proporsi populasi terpapar yang mengalami gejala klinis keracunan pangan."
            />
          </div>
        </Panel>

        <Panel
          title="Pilar II · Kepatuhan SLHS & Inspeksi Lingkungan (IKL)"
          testId="ringkas-slhs"
          tip="Data hasil pemeriksaan lingkungan dapur SPPG pada investigasi kejadian: kepemilikan Sertifikat Laik Higiene Sanitasi (SLHS) dan status Inspeksi Kesehatan Lingkungan (IKL)."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="Dapur Diperiksa IKL" value={iklDiperiksa} tone="slate" />
            <Kpi label="IKL Memenuhi Syarat" value={ls?.ikl.memenuhi} tone="teal" />
            <Kpi label="IKL Tidak Memenuhi" value={ls?.ikl.tidak_memenuhi} tone="red" />
            <Kpi label="Memiliki SLHS" value={ls?.slhs.ya} tone="teal" />
            <Kpi label="Belum Memiliki SLHS" value={ls?.slhs.tidak} tone="red" />
            <Kpi label="SLHS Belum Terdata" value={ls?.slhs.kosong} tone="slate" />
          </div>
        </Panel>

        <Panel
          title="Pilar III · Cakupan & Mutu Pengawasan Gizi (F1–F13)"
          testId="ringkas-gizi"
          actions={
            <button
              type="button"
              onClick={() => go('gizi')}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
            >
              Analisa Pengawasan <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="Kunjungan Audit" value={g?.total_kunjungan} tone="teal" sub={g ? `${nf(g.dikirim)} terkirim` : undefined} />
            <Kpi label="SPPG Diawasi" value={g?.sppg_unik} tone="teal" />
            <Kpi
              label="Rata-rata Skor SOP"
              value={g?.avg_skor_sop ?? null}
              pct
              tone={g?.avg_skor_sop != null && g.avg_skor_sop < 80 ? 'red' : 'teal'}
              tip="Rata-rata skor kepatuhan Formulir 3–11 (ambang batas kelulusan standar = 80%)."
            />
            <Kpi label="Standar Gizi F12 BAIK" value={g?.rekap12_baik} tone="teal" />
            <Kpi label="F12 BELUM BAIK" value={g?.rekap12_belum_baik} tone="amber" />
            <Kpi label="Daya Terima F13 BELUM BAIK" value={g?.rekap13_belum_baik} tone="amber" />
          </div>
        </Panel>
      </div>

      {/* BAGIAN 3: KOMPARASI GEOSPASIAL 2 KOLOM */}
      <SectionHead
        no={3}
        id="komparasi-spasial"
        title="Komparasi Geospasial: Distribusi Insiden Keracunan vs Cakupan Pengawasan Gizi"
        desc="Perbandingan langsung antara peta sebaran kejadian keracunan pangan (kiri) dan peta capaian skor pengawasan gizi SPPG (kanan) untuk mengidentifikasi celah pengawasan wilayah."
      />
      {mapSection}

      {/* BAGIAN 4: DISTRIBUSI BEBAN WILAYAH & PROPORSI RISIKO SPPG */}
      <SectionHead
        no={4}
        id="distribusi-dan-profil-risiko"
        title="Distribusi Beban Wilayah & Profil Kategori Risiko SPPG Terdampak"
        desc="Perbandingan beban insiden antar-wilayah serta dekomposisi status pengawasan pada SPPG yang mengalami kejadian luar biasa."
      />
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
        <Panel
          className="2xl:col-span-2"
          title={`Distribusi ${jenisLabel(f.jenis)} Keracunan Pangan MBG menurut Wilayah`}
          testId="ringkas-wilayah"
          desc="Peringkat beban wilayah berdasarkan metrik terpilih; mendukung tampilan Column, Bar, atau Line."
        >
          <RegionChart ranking={ker?.ranking} jenis={f.jenis} autoLevel={autoRegionLevel(f)} testId="ringkas-region-chart" />
        </Panel>

        <Panel
          title="Dekomposisi Risiko SPPG Terdampak"
          testId="ringkas-dekomposisi-risiko"
          desc={`Klasifikasi ${nf(risks.length)} SPPG yang mengalami kejadian keracunan berdasarkan riwayat pengawasan gizinya.`}
        >
          {!risks.length ? (
            <EmptyBox msg="Belum ada SPPG dengan kejadian keracunan pada filter aktif." />
          ) : (
            <div className="space-y-3.5 text-xs">
              <RatioBar
                label="Belum Pernah Diawasi + Mengalami Kejadian (Blind Spot)"
                good={nBelum}
                total={Math.max(1, risks.length)}
                subRight={`${nf(nBelum)} SPPG`}
                barCls="bg-orange-600"
              />
              <RatioBar
                label="Skor Pengawasan Rendah (<80 / F12 Belum Baik) + Kejadian"
                good={nSkor}
                total={Math.max(1, risks.length)}
                subRight={`${nf(nSkor)} SPPG`}
                barCls="bg-red-600"
              />
              <RatioBar
                label="Sudah Diawasi Memadai (≥80) + Mengalami Kejadian"
                good={nMemadai}
                total={Math.max(1, risks.length)}
                subRight={`${nf(nMemadai)} SPPG`}
                barCls="bg-amber-500"
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11.5px] leading-relaxed text-slate-700">
                <div className="font-bold text-slate-900">Implikasi Kebijakan &amp; Operasional:</div>
                <p className="mt-1">
                  Sebanyak <b>{pf(((nBelum + nSkor) * 100) / Math.max(1, risks.length))}</b> dari SPPG yang mengalami KLB keracunan
                  merupakan unit yang <b>belum terjangkau pengawasan</b> atau <b>memiliki kepatuhan SOP di bawah standar</b>. Perluasan
                  cakupan audit F1–F13 dan penegakan rekomendasi perbaikan wajib diprioritaskan.
                </p>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* BAGIAN 5: MATRIKS TAUTAN RISIKO SPPG & PRIORITAS PENCEGAHAN PRA-KLB */}
      <SectionHead
        no={5}
        id="matriks-tautan-risiko"
        title="Matriks Tautan Risiko SPPG (Pengawasan × Kejadian) & Daftar Prioritas Mitigasi Pra-KLB"
        desc="Penelusuran unit SPPG yang mengalami insiden keracunan terhadap riwayat skor pengawasan gizinya, diikuti daftar SPPG berskor rendah yang wajib segera dibina sebelum terjadi KLB."
      />
      <Panel
        title="Matriks Korelasi: Riwayat Pengawasan Gizi × Kejadian Keracunan per SPPG"
        testId="panel-tautan-risiko"
        desc="Daftar SPPG yang mengalami insiden keracunan pangan disandingkan dengan frekuensi kunjungan, rata-rata skor SOP (F3–F11), dan kesimpulan F12."
        actions={
          <Seg<'utama' | 'semua'>
            value={riskFilter}
            onChange={setRiskFilter}
            options={[
              { value: 'utama', label: 'Prioritas (Skor Rendah / Belum Diawasi)' },
              { value: 'semua', label: 'Seluruh SPPG Terdampak' },
            ]}
            testId="risk-filter"
          />
        }
      >
        {!shownRisks.length ? (
          <EmptyBox
            msg={
              risks.length
                ? 'Seluruh SPPG terdampak pada filter ini telah memiliki skor pengawasan memadai.'
                : 'Belum ada SPPG dengan kejadian keracunan pada filter ini.'
            }
          />
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="px-2.5 py-2 text-left">Nama SPPG &amp; Wilayah</th>
                  <th className="px-2.5 py-2 text-left">Klasifikasi Risiko</th>
                  <th className="px-2.5 py-2 text-right">Kejadian</th>
                  <th className="px-2.5 py-2 text-right">Total Kasus</th>
                  <th className="px-2.5 py-2 text-right">Tgl Kejadian Terakhir</th>
                  <th className="px-2.5 py-2 text-right">Kunjungan Audit</th>
                  <th className="px-2.5 py-2 text-right">Skor SOP</th>
                  <th className="px-2.5 py-2 text-center">Status F12</th>
                  <th className="px-2.5 py-2 text-right">Audit Terakhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownRisks.map((s) => (
                  <tr key={s.nama_sppg} className="hover:bg-slate-50">
                    <td className="px-2.5 py-2">
                      <div className="font-bold text-slate-800">{s.nama_sppg}</div>
                      <div className="text-[11px] text-slate-500">{[s.kabkota_name, s.province_name].filter(Boolean).join(', ')}</div>
                    </td>
                    <td className="px-2.5 py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${RISK_CLS[s.risiko]}`}>
                        {RISIKO_LABEL[s.risiko]}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{nf(s.kejadian)}</td>
                    <td className="px-2.5 py-2 text-right font-bold tabular-nums text-red-700">{nf(s.kasus)}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-[11px] text-slate-600">{s.last_kejadian?.slice(0, 10) || '—'}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-emerald-700">{nf(s.pengawasan_kunjungan)}</td>
                    <td
                      className={`px-2.5 py-2 text-right font-mono tabular-nums ${
                        s.pengawasan_avg_skor != null && s.pengawasan_avg_skor < 80 ? 'font-bold text-red-700' : 'text-slate-700'
                      }`}
                    >
                      {s.pengawasan_avg_skor != null ? s.pengawasan_avg_skor.toFixed(1) : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-center">
                      <RekapBadge value={s.pengawasan_rekap12} />
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-[11px] text-slate-600">
                      {s.pengawasan_terakhir || '—'}
                      {s.pengawasan_terakhir && s.last_kejadian ? (
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({s.pengawasan_terakhir <= s.last_kejadian.slice(0, 10) ? 'pra-insiden' : 'pasca-insiden'})
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Target Intervensi Pencegahan Dini: SPPG Skor Rendah Tanpa Riwayat Kejadian (Pra-KLB)"
        testId="panel-pencegahan"
        desc="Daftar unit SPPG dengan skor kepatuhan SOP < 80 atau kesimpulan F12 BELUM BAIK yang belum mengalami keracunan namun berisiko tinggi apabila tidak segera dibina."
      >
        {!cegah.length ? (
          <EmptyBox msg="Tidak terdapat SPPG berskor rendah tanpa kejadian pada filter aktif." />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {cegah.slice(0, 12).map((s) => (
              <div
                key={s.nama_sppg}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-800">{s.nama_sppg}</div>
                  <div className="truncate text-[11px] text-slate-500">
                    {[s.kabkota_name, s.province_name].filter(Boolean).join(', ')} · {nf(s.kunjungan)} kunjungan audit
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-black text-red-700">
                    {s.avg_skor != null ? `${s.avg_skor.toFixed(1)}%` : '—'}
                  </div>
                  <RekapBadge value={s.last_rekap12} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
