'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import Markdown from '@/components/docs/Markdown'
import {
  Activity,
  Utensils,
  Bug,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Server,
  Database,
  ExternalLink,
  Info,
  Clock,
  Sparkles,
  MapPin,
  GitBranch,
} from 'lucide-react'

export type DokumentasiBidang = 'skdr' | 'mbg' | 'zoonosis'

interface Props {
  initialBidang?: DokumentasiBidang
}

const TABS: { id: DokumentasiBidang; label: string; href: string; icon: any; summary: string }[] = [
  {
    id: 'skdr',
    label: 'Dokumentasi SKDR',
    href: '/dokumentasi/skdr',
    icon: Activity,
    summary: 'Sistem Lama vs Baru: Surveilans Berbasis Indikator (IBS) & Kejadian (EBS)',
  },
  {
    id: 'mbg',
    label: 'Dokumentasi MBG',
    href: '/dokumentasi/mbg',
    icon: Utensils,
    summary: 'Sistem Lama vs Baru: Pengawasan Gizi SPPG (F1–F13) & Keracunan Pangan MBG',
  },
  {
    id: 'zoonosis',
    label: 'Dokumentasi Zoonosis',
    href: '/dokumentasi/zoonosis',
    icon: Bug,
    summary: 'Sistem Baru: Form PE Zoonosis One Health (Rabies, Lepto, Antraks, AI) & Dasbor 2-Dock',
  },
]

export default function DokumentasiPortal({ initialBidang = 'skdr' }: Props) {
  const router = useRouter()
  const [activeBidang, setActiveBidang] = useState<DokumentasiBidang>(initialBidang)
  const [activeSection, setActiveSection] = useState<'all' | 'lama' | 'baru' | 'flow' | 'matriks'>('all')

  const handleTabChange = (bidang: DokumentasiBidang, href: string) => {
    setActiveBidang(bidang)
    router.push(href)
  }

  return (
    <div className="w-full min-h-screen bg-white pb-20">
      <div className="px-4 py-5 sm:px-6 lg:px-8 max-w-[1720px] mx-auto space-y-6">
        {/* Page Header 2-Grid */}
        <PageHeader
          title="Dokumentasi Sistem SKDR Indonesia"
          subtitle="Dokumentasi komparatif komprehensif alur kerja, form transaksi, variabel data, dan arsitektur analitik sistem eksisting (lama) vs sistem baru SKDR Indonesia."
          actions={
            <div className="flex items-center gap-2">
              <a
                href="https://skdr.kemkes.go.id"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                <span>Portal Kemenkes Lama</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </a>
            </div>
          }
        />

        {/* 3 Domain Sub-Menus (Navigation Pills) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-1.5 bg-slate-50/90 rounded-2xl border border-slate-200/80">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeBidang === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id, tab.href)}
                className={`flex items-start gap-3 p-3.5 rounded-xl text-left transition-all ${
                  isActive
                    ? 'bg-white shadow-sm border border-primary/30 ring-2 ring-primary/20'
                    : 'hover:bg-white/60 text-slate-600'
                }`}
              >
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
                    isActive ? 'bg-primary text-white shadow-2xs' : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold tracking-tight ${isActive ? 'text-primary' : 'text-slate-800'}`}>
                    {tab.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{tab.summary}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Section Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
          <span className="text-xs font-semibold text-slate-500 mr-1">Tampilan Seksi:</span>
          {[
            { id: 'all', label: 'Semua Bagian' },
            ...(activeBidang !== 'zoonosis'
              ? [
                  { id: 'lama', label: '1. Sistem Eksisting (Lama)' },
                  { id: 'baru', label: '2. Sistem Baru (SKDR Indonesia)' },
                ]
              : [{ id: 'baru', label: 'Arsitektur Sistem Baru' }]),
            { id: 'flow', label: 'Diagram Alur (Mermaid)' },
            { id: 'matriks', label: 'Matriks Komparasi Variabel' },
          ].map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id as any)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeSection === sec.id
                  ? 'bg-primary text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* TAB 1: DOKUMENTASI SKDR (IBS & EBS) */}
        {activeBidang === 'skdr' && (
          <div className="space-y-6">
            {/* Intro Banner */}
            <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/70 to-emerald-50/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
                      Surveilans Rutin & Sinyal KLB
                    </span>
                    <span className="text-xs font-medium text-slate-500">IBS (36 Penyakit) & EBS (Rumor)</span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">
                    Dokumentasi Sistem SKDR: Surveilans Berbasis Indikator & Kejadian
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-4xl">
                    Dokumentasi perbandingan alur sistem antara platform lama Kemenkes RI (<code className="text-slate-800 bg-teal-100/60 px-1 py-0.5 rounded">skdr.kemkes.go.id</code>)
                    dengan platform baru SKDR Indonesia yang mengusung kinerja tinggi berbasis Rust, validasi silang data, pelacakan respon WHO 7-1-7, serta visualisasi spasial 2-dock.
                  </p>
                </div>
              </div>
            </div>

            {/* Seksi 1: Sistem Eksisting Lama */}
            {(activeSection === 'all' || activeSection === 'lama') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">1</span>
                  <h4 className="text-base font-bold text-slate-900">Sistem Eksisting (Lama) — skdr.kemkes.go.id</h4>
                  <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    PHP CodeIgniter 3 + AdminLTE v2
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-amber-600" />
                      Alur Form IBS Mingguan (/agregate-puskesmas)
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                      <li>Petugas Puskesmas menginput agregat mingguan (Senin–Minggu) untuk 36 penyakit potensi wabah.</li>
                      <li>Menggunakan format SMS kode penyakit: <code className="bg-slate-200 px-1 rounded">A</code> (Diare Akut), <code className="bg-slate-200 px-1 rounded">B</code> (Kolera), ..., <code className="bg-slate-200 px-1 rounded">Z</code>, <code className="bg-slate-200 px-1 rounded">AA-AC</code>, dan <code className="bg-slate-200 px-1 rounded">TOTA</code> (Total Kunjungan).</li>
                      <li>Tenggat waktu (*cut-off*) pelaporan setiap Selasa pukul 12.00 WIB.</li>
                      <li>3 kolom input numerik per penyakit: Jumlah Kasus, Jumlah Kematian, dan Jumlah Lab Positif.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-amber-600" />
                      Form EBS Rumor (/form-ebs-new) & Dasbor Utama
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                      <li>Formulir 4 tab untuk rumor KLB: Informasi, Penyakit/Respon, Upload Dokumen, dan Integrasi SIZE.</li>
                      <li>Dasbor Utama memuat Top Ribbon KPI (38 Prov, 514 Kab, 13.000+ Faskes) dan grafik batang verifikasi.</li>
                      <li>Peta sebaran menggunakan Google Maps JS API v3 berbayar dengan plugin MarkerClusterer.</li>
                      <li>12 sub-dasbor terpisah di bawah "Dashboard 2" (Tren, Distribusi, Buletin, EARS, WHO 717, Hotspot, dll.).</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="font-bold text-amber-900 text-xs flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    Keterbatasan & Catatan Sistem Lama:
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Formulir IBS tanpa fitur penyimpanan otomatis (*autosave*) sehingga isian mudah hilang jika sesi timeout.
                    Pencatatan rekam medis pasien di rawat jalan terpisah dari agregat mingguan sehingga petugas harus merekap manual di buku register.
                    Peta bergantung pada Google Maps komersial yang tidak dapat diakses di jaringan tertutup/intranet.
                  </p>
                </div>
              </div>
            )}

            {/* Seksi 2: Sistem Baru */}
            {(activeSection === 'all' || activeSection === 'baru') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-100 text-teal-800 text-xs font-bold">2</span>
                  <h4 className="text-base font-bold text-slate-900">Sistem Baru (SKDR Indonesia)</h4>
                  <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                    Rust (Axum) + Next.js 15 + OpenLayers 10
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-teal-600" />
                      Laporan Agregat IBS (/ibs/laporan)
                    </p>
                    <p className="text-slate-600">
                      Wizard 4 langkah modern dengan autosave draf lokal ke browser. Validasi ambang batas Mean+2SD otomatis dan peringatan duplikasi minggu epid.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-teal-600" />
                      Form Individu IBS (/ibs/individu)
                    </p>
                    <p className="text-slate-600">
                      Pencatatan klinis per pasien (SOAP, IMT otomatis, Lab) yang terhubung langsung ke diagnosis 24 penyakit agregat dan dapat mengagregasi otomatis ke laporan mingguan.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-teal-600" />
                      Dasbor SKDR 6 Sub-Menu & Peta 2-Dock
                    </p>
                    <p className="text-slate-600">
                      Menyatukan 12 sub-dasbor lama menjadi 6 sub-menu terpadu. Peta OpenLayers 10 dengan 2-dock (Left Dock Analisa Wilayah & Right Dock Pengaturan Lapisan).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Seksi 3: Diagram Alur Mermaid */}
            {(activeSection === 'all' || activeSection === 'flow') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-primary" />
                  <h4 className="text-base font-bold text-slate-900">Diagram Alur Sistem SKDR Terpadu (IBS & EBS)</h4>
                </div>
                <p className="text-xs text-slate-500">
                  Diagram alur data end-to-end dari entri transaksi Puskesmas hingga visualisasi spasial 2-dock:
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                  <Markdown
                    text={`\`\`\`mermaid
flowchart TD
    subgraph InputUnit["1. Fasyankes Pelapor"]
        IBS["Form Agregat IBS (/ibs/laporan)\\n- Mingguan (Senin-Minggu)\\n- 36 Penyakit SMS Code A-Z\\n- Kasus, Mati, Lab, Kunjungan"]
        EBS["Form Laporan EBS (/ebs/laporan)\\n- Rumor / Kejadian Tak Lazim\\n- Geocoding Faskes Otomatis\\n- Waktu Deteksi & Notifikasi"]
        Individu["Form Individu IBS (/ibs/individu)\\n- Rekam Medis Per Pasien\\n- Gejala, SOAP, IMT Otomatis"]
    end

    subgraph MesinAnalisa["2. Mesin Analisis Backend Rust"]
        Ambang["Deteksi Ambang Batas (Mean+2SD / CUSUM)"]
        Respon717["Pelacak Respons WHO 7-1-7 (7h-1h-7h)"]
        AlertSinkron["Pemicu Alert & Triase Sinyal"]
    end

    subgraph DasborVisual["3. Dasbor SKDR 2-Dock (/dashboard/skdr/ringkasan)"]
        LeftDock["Left Dock (340px): Ranking Kasus, Hotspot Wilayah, Detail Faskes"]
        CenterMap["Center Canvas (640px): OpenLayers Tile Proxy + Drilldown Wilayah"]
        RightDock["Right Dock (320px): Lapisan Choropleth, Titik Faskes, Heatmap"]
    end

    IBS --> Ambang
    EBS --> Respon717
    Individu -.->|Agregasi Otomatis| IBS
    Ambang --> AlertSinkron
    AlertSinkron --> LeftDock
    AlertSinkron --> CenterMap
    Respon717 --> DasborVisual
\`\`\``}
                  />
                </div>
              </div>
            )}

            {/* Seksi 4: Matriks Variabel */}
            {(activeSection === 'all' || activeSection === 'matriks') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-3">
                <h4 className="text-base font-bold text-slate-900">Matriks Komparasi Variabel SKDR (Lama vs Baru)</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-xs divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-3.5 py-3">Variabel Sistem Lama</th>
                        <th className="px-3.5 py-3">Variabel Sistem Baru</th>
                        <th className="px-3.5 py-3">Tipe Data</th>
                        <th className="px-3.5 py-3">Peningkatan / Inovasi Sistem Baru</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">kd_puskesmas</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-teal-700 font-semibold">unit_id / unit_name</td>
                        <td className="px-3.5 py-2.5">UUID / String</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Terhubung ke master fasyankes SATUSEHAT dengan kode sarana nasional.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">tahun & minggu</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-teal-700 font-semibold">tahun, minggu_epidemi</td>
                        <td className="px-3.5 py-2.5">Integer (1–53)</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Rentang tanggal Senin–Minggu dihitung otomatis oleh kalender epidemiologi.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">Kode SMS A–Z, AA–AC</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-teal-700 font-semibold">penyakit_code</td>
                        <td className="px-3.5 py-2.5">String</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Pencarian SearchSelect instan berdasarkan kode SMS atau nama penyakit.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">jml_kasus & jml_mati</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-teal-700 font-semibold">jumlah_kasus, jumlah_kematian</td>
                        <td className="px-3.5 py-2.5">Integer</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Validasi silang otomatis: angka kematian tidak boleh melebihi jumlah kasus.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">tota (kunjungan)</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-teal-700 font-semibold">total_kunjungan</td>
                        <td className="px-3.5 py-2.5">Integer</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Kartu KPI terpisah; perhitungan otomatis proporsi morbiditas fasyankes.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DOKUMENTASI PROGRAM MBG */}
        {activeBidang === 'mbg' && (
          <div className="space-y-6">
            {/* Intro Banner */}
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50/70 to-blue-50/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                      Program Nasional MBG
                    </span>
                    <span className="text-xs font-medium text-slate-500">Pengawasan Gizi SPPG & Investigasi Keracunan</span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">
                    Dokumentasi Sistem Program MBG: Makan Bergizi Gratis
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-4xl">
                    Dokumentasi perbandingan alur form investigasi keracunan pangan lama (<code className="text-slate-800 bg-sky-100/60 px-1 py-0.5 rounded">skdr.kemkes.go.id/form-mbg</code>)
                    dengan sistem baru terintegrasi: instrumen pengawasan sanitasi rutin dapur SPPG (Formulir 1–13) dan investigasi dua-tahap (Laporan Cepat & Update Harian).
                  </p>
                </div>
              </div>
            </div>

            {/* Seksi 1: Sistem Eksisting Lama */}
            {(activeSection === 'all' || activeSection === 'lama') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">1</span>
                  <h4 className="text-base font-bold text-slate-900">Sistem Eksisting (Lama) — skdr.kemkes.go.id/form-mbg</h4>
                  <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    Form MBG 6 Tab (113 Field)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-amber-600" />
                      Karakteristik Form MBG Lama
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                      <li>Formulir monolitik 6 tab memuat 113 field isian yang harus diisi sekaligus oleh petugas.</li>
                      <li>Tab 1: Kejadian & Waktu Makan; Tab 2: Sanitasi Lingkungan Sekolah; Tab 3: Dapur Pengolahan.</li>
                      <li>Tab 4: Menu Makanan & Gejala; Tab 5: Sampel Lab Toksikologi; Tab 6: Dokumen Laporan.</li>
                      <li>Sistem hanya bersifat reaktif (mencatat setelah ada insiden siswa keracunan).</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-amber-600" />
                      Dasbor MBG Lama (/dashboard-mbg)
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                      <li>Peta sebaran titik insiden menggunakan Google Maps sederhana.</li>
                      <li>Tabel daftar insiden per kab/kota tanpa kemampuan korelasi dapur penyuplai makanan.</li>
                      <li>Tidak ada fitur pelacakan harian perkembangan pasien pasca laporan pertama.</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="font-bold text-amber-900 text-xs flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    Keterbatasan Sistem MBG Lama:
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Pengisian 113 field sekaligus memberatkan petugas di tengah situasi darurat KLB keracunan. Belum ada instrumen pengawasan berkala kelaikan higiene sanitasi dapur SPPG sebelum insiden terjadi, serta tidak ada log kumulatif pasien rawat inap dan sembuh.
                  </p>
                </div>
              </div>
            )}

            {/* Seksi 2: Sistem Baru */}
            {(activeSection === 'all' || activeSection === 'baru') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-100 text-sky-800 text-xs font-bold">2</span>
                  <h4 className="text-base font-bold text-slate-900">Sistem Baru (SKDR Indonesia - Program MBG)</h4>
                  <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                    Pengawasan Preventif + Respon Cepat Two-Tier
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-sky-600" />
                      Pengawasan Gizi SPPG (/pengawasan-gizi)
                    </p>
                    <p className="text-slate-600">
                      Instrumen pengawasan rutin dapur SPPG mengadopsi Formulir 1–13 standar SOP Kemenkes. Penilaian kepatuhan otomatis (skor 0–100) dengan ambang BAIK (&ge; 80%) vs PERLU TINDAK LANJUT (&lt; 80%).
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-sky-600" />
                      Keracunan Pangan MBG (/keracunan-mbg)
                    </p>
                    <p className="text-slate-600">
                      Alur dua-tingkat: <strong>Laporan Cepat (&lt;24 jam)</strong> cukup isi 4 field wajib agar respon aktif, dilanjutkan Investigasi Lengkap. Dilengkapi fitur <strong>Pembaruan Harian</strong> kumulatif.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-sky-600" />
                      Dasbor MBG 3 Sub-Menu & Peta 2-Dock
                    </p>
                    <p className="text-slate-600">
                      3 sub-menu terdedikasi: Ringkasan Eksekutif, Keracunan Pangan, dan Pengawasan Gizi. Peta sebaran 2-dock memvisualisasikan titik dapur SPPG dan titik sekolah terdampak.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Seksi 3: Diagram Alur Mermaid */}
            {(activeSection === 'all' || activeSection === 'flow') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-sky-600" />
                  <h4 className="text-base font-bold text-slate-900">Diagram Alur Program MBG (Pengawasan & Respon KLB)</h4>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                  <Markdown
                    text={`\`\`\`mermaid
flowchart TD
    subgraph DapurSPPG["1. Satuan Pelayanan Pangan Bergizi (SPPG)"]
        Dapur["Dapur Pengolahan Mandiri / Yayasan"]
        Distribusi["Pemberian Paket Makanan Siswa"]
    end

    subgraph Pengawasan["2. Pengawasan Preventif Rutin (/pengawasan-gizi)"]
        Sanitarian["Kunjungan Sanitarian / Ahli Gizi Puskesmas"]
        Form113["Formulir F1 s.d. F13 (SOP Higiene & Sanitasi)"]
        SkorOtomatis["Skor Kepatuhan Otomatis (0-100%):\\n>=80% BAIK | <80% PERLU PERBAIKAN"]
    end

    subgraph ResponKLB["3. Investigasi Keracunan Pangan (/keracunan-mbg)"]
        KasusSakit["Keluhan Gejala Siswa Sakit (Mual, Muntah, Diare)"]
        LaporCepat["Tahap 1: Laporan Cepat (< 24 Jam)\\nWaktu kejadian, jam makan, jumlah terpapar & sakit"]
        InvestigasiLanjut["Tahap 2-6: Investigasi Lengkap\\nMasa inkubasi otomatis, menu makanan, uji lab"]
        UpdateHarian["Pembaruan Harian: Kasus aktif, rawat, sembuh, mati"]
    end

    subgraph DasborMBG2Dock["4. Dasbor MBG Spasial 2-Dock (/dashboard/mbg/*)"]
        PetaMBG["Peta Spasial MBG 2-Dock:\\n- Titik Dapur SPPG (Hijau = Skor >= 80, Kuning/Merah = Skor < 80)\\n- Titik Sekolah Terdampak Keracunan Pangan\\n- Analisa Korelasi Silang Dapur Berisiko x Kejadian"]
    end

    Dapur --> Distribusi
    Dapur --> Sanitarian
    Sanitarian --> Form113
    Form113 --> SkorOtomatis
    Distribusi -.->|Jika Terjadi Insiden| KasusSakit
    KasusSakit --> LaporCepat
    LaporCepat --> InvestigasiLanjut
    InvestigasiLanjut --> UpdateHarian
    SkorOtomatis --> PetaMBG
    UpdateHarian --> PetaMBG
\`\`\``}
                  />
                </div>
              </div>
            )}

            {/* Seksi 4: Matriks Variabel */}
            {(activeSection === 'all' || activeSection === 'matriks') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-3">
                <h4 className="text-base font-bold text-slate-900">Matriks Komparasi Variabel MBG (Lama vs Baru)</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-xs divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-3.5 py-3">Variabel Sistem Lama</th>
                        <th className="px-3.5 py-3">Variabel Sistem Baru</th>
                        <th className="px-3.5 py-3">Tipe Data</th>
                        <th className="px-3.5 py-3">Peningkatan / Inovasi Sistem Baru</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">tgl_kejadian & jam_makan</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-sky-700 font-semibold">tanggal_kejadian, jam_makan</td>
                        <td className="px-3.5 py-2.5">Date / Time</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Masa inkubasi dihitung otomatis dari selisih jam konsumsi ke gejala pertama.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">jml_terpapar, jml_kasus</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-sky-700 font-semibold">terpapar, kasus, meninggal</td>
                        <td className="px-3.5 py-2.5">Integer</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Kalkulasi Attack Rate (AR %) dan Case Fatality Rate (CFR %) otomatis.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">Gejala klinis (teks/checkbox)</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-sky-700 font-semibold">gejala (JSON key-value)</td>
                        <td className="px-3.5 py-2.5">Checkbox + Counter</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Peringkat gejala dominan otomatis untuk penentuan agen penyebab kontaminasi.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">Kuesioner dapur manual</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-sky-700 font-semibold">mbg_form (F1 s.d. F13)</td>
                        <td className="px-3.5 py-2.5">Skor 0–100 per form</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Skoring kepatuhan otomatis, wajib isi keterangan bila tidak sesuai, dan rekomendasi.</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-900">Tidak ada tracking harian</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-sky-700 font-semibold">mbg_keracunan_update</td>
                        <td className="px-3.5 py-2.5">Tabel Relasional Harian</td>
                        <td className="px-3.5 py-2.5 text-slate-600">Riwayat perkembangan kumulatif pasien rawat jalan, rawat inap, dan sembuh.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DOKUMENTASI ZOONOSIS (SISTEM BARU) */}
        {activeBidang === 'zoonosis' && (
          <div className="space-y-6">
            {/* Intro Banner */}
            <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50/70 to-indigo-50/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                      Inovasi Sistem Baru One Health
                    </span>
                    <span className="text-xs font-medium text-slate-500">Penyelidikan Epidemiologi Digital 4 Penyakit</span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">
                    Dokumentasi Sistem Zoonosis & One Health (Sistem Baru)
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-4xl">
                    Sistem eksisting Kemenkes belum memiliki modul digital terintegrasi untuk Penyelidikan Epidemiologi (Form PE) Zoonosis. SKDR Indonesia menghadirkan formulir PE digital komprehensif untuk Rabies/GHPR, Leptospirosis, Antraks, dan Flu Burung yang tersambung ke klasifikasi otomatis, perhitungan CFR Wilson, serta dasbor spasial 2-dock.
                  </p>
                </div>
              </div>
            </div>

            {/* Seksi 1: 4 Form PE Digital */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-purple-100 text-purple-800 text-xs font-bold">1</span>
                <h4 className="text-base font-bold text-slate-900">Digitalisasi 4 Formulir PE Zoonosis (/pe/*)</h4>
                <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                  Standar Medis Kemenkes RI
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-700">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                  <p className="font-bold text-slate-900 text-sm flex items-center gap-1 text-purple-900">
                    Rabies / GHPR (/pe/rabies)
                  </p>
                  <p className="text-slate-600">
                    95 baris spesifikasi (6 langkah wizard). Penentuan luka gigitan risiko tinggi/sedang, status hewan penular, riwayat VAR & SAR, dan tabel kontak berulang.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                  <p className="font-bold text-slate-900 text-sm flex items-center gap-1 text-purple-900">
                    Leptospirosis (/pe/lepto)
                  </p>
                  <p className="text-slate-600">
                    127 baris spesifikasi (7 langkah wizard). Faktor risiko banjir, kontak selokan/tikus, pemeriksaan serologi RDT & titer MAT $\ge 1:400$.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                  <p className="font-bold text-slate-900 text-sm flex items-center gap-1 text-purple-900">
                    Antraks (/pe/antraks)
                  </p>
                  <p className="text-slate-600">
                    86 baris spesifikasi (5 langkah wizard). Tipe klinis (kulit eschar, cerna, paru), paparan menyembelih ternak sakit, dan apusan luka Gram(+).
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                  <p className="font-bold text-slate-900 text-sm flex items-center gap-1 text-purple-900">
                    Flu Burung / AI (/pe/ai)
                  </p>
                  <p className="text-slate-600">
                    107 baris spesifikasi (7 langkah wizard). Masa inkubasi (1–7 hari), kontak unggas sakit/mati mendadak, dan swab nasofaring RT-PCR H5N1.
                  </p>
                </div>
              </div>
            </div>

            {/* Seksi 2: Mesin Klasifikasi & Dasbor */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-purple-100 text-purple-800 text-xs font-bold">2</span>
                <h4 className="text-base font-bold text-slate-900">Klasifikasi Kasus Otomatis & Dasbor Zoonosis</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                  <p className="font-bold text-slate-900 text-sm">Klasifikasi Kasus Otomatis</p>
                  <p className="text-slate-600">
                    Sistem mengklasifikasi kasus secara otomatis berbasis kriteria medis: <strong>Suspek</strong> $\to$ <strong>Probabel</strong> $\to$ <strong>Konfirmasi Laboratorium</strong>.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                  <p className="font-bold text-slate-900 text-sm">CFR Wilson 95% Confidence Interval</p>
                  <p className="text-slate-600">
                    Kalkulasi Case Fatality Rate (CFR %) dilengkapi rentang batas bawah dan atas Wilson 95% CI untuk ketepatan analisis statistik wabah.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                  <p className="font-bold text-slate-900 text-sm">Dasbor Zoonosis General & Lite</p>
                  <p className="text-slate-600">
                    Dasbor General 2-dock memvisualisasikan seluruh zoonosis, dan Dasbor Lite memberikan ringkasan 4 zoonosis murni tanpa polusi data agregat IBS.
                  </p>
                </div>
              </div>
            </div>

            {/* Seksi 3: Diagram Alur Mermaid */}
            {(activeSection === 'all' || activeSection === 'flow') && (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-purple-600" />
                  <h4 className="text-base font-bold text-slate-900">Diagram Alur One Health Zoonosis (Sistem Baru)</h4>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                  <Markdown
                    text={`\`\`\`mermaid
flowchart TD
    subgraph TemuanFaskes["1. Penemuan Kasus di Fasilitas Pelayanan"]
        Gigitan["Kasus Gigitan Hewan di Rabies Center"]
        Demam["Demam Pasca Banjir / Kontak Tikus"]
        Lesi["Lesi Kulit Eschar Pasca Sembelih Ternak"]
        ISPA["ISPA Berat Pasca Kontak Unggas Sakit"]
    end

    subgraph FormPEDigital["2. Formulir PE Zoonosis Digital (/pe/*)"]
        PE_Rabies["Form PE Rabies: Kategori luka, status hewan, VAR/SAR"]
        PE_Lepto["Form PE Leptospirosis: Gejala, riwayat kontak, uji MAT"]
        PE_Antraks["Form PE Antraks: Tipe klinis, riwayat hewan sakit, lab"]
        PE_AI["Form PE Flu Burung: Masa inkubasi, kontak unggas, RT-PCR"]
    end

    subgraph KlasifikasiEngine["3. Mesin Klasifikasi Kasus & CFR"]
        Klasifikasi["Klasifikasi Kasus Otomatis:\\n- Kasus Suspek\\n- Kasus Probabel\\n- Kasus Konfirmasi Lab"]
        HitungCFR["Hitung CFR dengan 95% Wilson Confidence Interval"]
    end

    subgraph DasborZoonosis2Dock["4. Dasbor Zoonosis Spasial 2-Dock (/dasbor/zoonosis-general)"]
        PetaZoo["Peta Spasial Zoonosis 2-Dock:\\n- Left Dock: Ranking Kasus, Kematian, CFR %, Alert SKDR\\n- Center Canvas: Titik Kasus PE, Titik Rabies Center, Kluster\\n- Right Dock: Layer Poligon Kasus, Titik Kasus, Lapisan Satwa Liar GBIF"]
    end

    Gigitan --> PE_Rabies
    Demam --> PE_Lepto
    Lesi --> PE_Antraks
    ISPA --> PE_AI

    PE_Rabies --> Klasifikasi
    PE_Lepto --> Klasifikasi
    PE_Antraks --> Klasifikasi
    PE_AI --> Klasifikasi

    Klasifikasi --> HitungCFR
    HitungCFR --> PetaZoo
\`\`\``}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
