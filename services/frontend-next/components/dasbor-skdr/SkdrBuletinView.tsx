'use client'
// PR 057: Buletin & Infografis - Weekly surveillance bulletin generator & digital infographic
import { useState } from 'react'
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Download,
  FileCheck,
  FileDown,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  MapPin,
  Printer,
  Share2,
  Sparkles,
} from 'lucide-react'
import type { SkdrFilter } from '@/lib/dasbor-skdr-filter'

export default function SkdrBuletinView({ f }: { f: SkdrFilter }) {
  const [subTab, setSubTab] = useState<'buletin' | 'infografis'>('buletin')

  const topDiseases = [
    { name: 'Diare Akut', kasus: 16840, alert: 420 },
    { name: 'Suspek Dengue / DBD', kasus: 12450, alert: 380 },
    { name: 'Pneumonia', kasus: 8920, alert: 290 },
    { name: 'Suspek Demam Tifoid', kasus: 5410, alert: 160 },
    { name: 'Suspek Campak', kasus: 1840, alert: 145 },
  ]

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="space-y-6" data-testid="skdr-buletin-view">
      {/* Top Header & Switcher */}
      <div className="skdr-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Diseminasi Laporan & Komunikasi Risiko
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              Buletin Epidemiologi & Infografis Digital Mingguan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Otomatisasi publikasi laporan surveilans mingguan untuk pimpinan, dinas kesehatan, dan pemangku kepentingan.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('buletin')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                subTab === 'buletin'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              📄 Dokumen Buletin
            </button>
            <button
              type="button"
              onClick={() => setSubTab('infografis')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                subTab === 'infografis'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🎨 Infografis Digital
            </button>
          </div>
        </div>
      </div>

      {/* View 1: Buletin Dokumen */}
      {subTab === 'buletin' && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              Buletin Minggu Epidemiologi ke-{f.ew} Tahun {f.ey} (Siap Ekspor)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                <Printer className="h-4 w-4 text-slate-500" />
                Cetak / Ekspor PDF
              </button>
              <button
                type="button"
                onClick={() => alert('Fitur Ekspor Word (.docx) sedang mengemas grafik dan tabel.')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary-dark"
              >
                <FileDown className="h-4 w-4" />
                Unduh Dokumen Word (.docx)
              </button>
            </div>
          </div>

          {/* Bulletin Paper Preview */}
          <div className="rounded-2xl border border-slate-300 bg-white p-8 shadow-sm space-y-6 max-w-4xl mx-auto print:border-0 print:shadow-none print:p-0">
            {/* Header Letterhead */}
            <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
              <span className="text-xs font-black uppercase tracking-widest text-primary block">
                KEMENTERIAN KESEHATAN REPUBLIK INDONESIA
              </span>
              <h1 className="text-xl font-black text-slate-900 uppercase">
                BULETIN SURVEILANS EPIDEMIOLOGI & KEWASPADAAN DINI (SKDR)
              </h1>
              <p className="text-xs text-slate-600 font-semibold">
                Periode: Minggu Epidemiologi ke-{f.ew} · Tahun {f.ey} (Skala Nasional)
              </p>
            </div>

            {/* Section 1: Ringkasan Situasi */}
            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-900 border-b border-slate-200 pb-1">
                I. RINGKASAN SITUASI EPIDEMIOLOGI NASIONAL
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed text-justify">
                Pada Minggu Epidemiologi ke-<strong>{f.ew}</strong> Tahun <strong>{f.ey}</strong>,
                sistem SKDR telah menerima laporan dari <strong>10.240 Puskesmas</strong> di 514
                kabupaten/kota. Rata-rata angka kelengkapan pelaporan nasional mencapai{' '}
                <strong>86.4%</strong> dan ketepatan pelaporan mencapai <strong>82.1%</strong>{' '}
                (melampaui target indikator kinerja minimal 80.0%).
              </p>
              <p className="text-xs text-slate-700 leading-relaxed text-justify">
                Total kasus penyakit potensi KLB yang dilaporkan berjumlah{' '}
                <strong>48.920 kasus</strong> dengan <strong>412 sinyal alert</strong>. Sebanyak{' '}
                <strong>91.5% sinyal alert</strong> telah berhasil diverifikasi oleh Tim Gerak Cepat
                (TGC) dalam tempo waktu kurang dari 24 jam.
              </p>
            </div>

            {/* Section 2: Top Penyakit Table */}
            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-900 border-b border-slate-200 pb-1">
                II. REKAPITULASI PENYAKIT POTENSI KLB TERBANYAK
              </h3>
              <table className="w-full text-left text-xs border border-slate-200 mt-2">
                <thead className="bg-slate-100">
                  <tr className="border-b border-slate-200 font-bold text-slate-800">
                    <th className="py-2 px-3">No.</th>
                    <th className="py-2 px-3">Nama Penyakit Potensi KLB</th>
                    <th className="py-2 px-3 text-right">Jumlah Kasus</th>
                    <th className="py-2 px-3 text-right">Frekuensi Alert</th>
                    <th className="py-2 px-3 text-center">Status Kewaspadaan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {topDiseases.map((d, i) => (
                    <tr key={d.name}>
                      <td className="py-2 px-3 font-semibold">{i + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{d.name}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        {d.kasus.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-amber-600">{d.alert}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          WASPADA
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 3: Rekomendasi Teknis */}
            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-900 border-b border-slate-200 pb-1">
                III. REKOMENDASI DAN TINDAK LANJUT TEKNIS
              </h3>
              <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1.5 leading-relaxed">
                <li>
                  Dinas Kesehatan Provinsi dan Kabupaten/Kota diminta meningkatkan surveilans aktif
                  terhadap penyakit <strong>Diare Akut</strong> dan <strong>Suspek Dengue</strong>.
                </li>
                <li>
                  Puskesmas dengan status kelengkapan di bawah 80% wajib melakukan pengiriman ulang
                  data keterlambatan (backlog) maksimal hari Selasa pukul 12.00 WIB.
                </li>
                <li>
                  Setiap sinyal alert berstatus merah (melebihi Mean + 2SD) wajib diverifikasi dan
                  diinvestigasi lapangan oleh TGC dalam waktu 1x24 jam.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* View 2: Infografis Digital 1-Page Poster */}
      {subTab === 'infografis' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              Poster Infografis Digital Mingguan (Resolusi Tinggi)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => alert('Mengunduh poster infografis dalam format PNG...')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary-dark"
              >
                <Download className="h-4 w-4" />
                Unduh Gambar Infografis (PNG)
              </button>
            </div>
          </div>

          {/* Infographic Poster Card */}
          <div className="rounded-3xl border-2 border-primary/40 bg-gradient-to-b from-primary/10 via-white to-slate-50 p-8 shadow-xl max-w-3xl mx-auto space-y-6">
            {/* Poster Header */}
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white">
                <Sparkles className="h-3.5 w-3.5" /> INFOGRAFIS SKDR NASIONAL
              </div>
              <h2 className="text-2xl font-black text-slate-900 uppercase mt-2">
                SITUASI MINGGU EPIDEMIOLOGI {f.ew}
              </h2>
              <p className="text-xs font-bold text-slate-600">
                Kementerian Kesehatan Republik Indonesia · Tahun {f.ey}
              </p>
            </div>

            {/* 4 Big KPI Badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Kasus Terlaporkan</span>
                <span className="block text-2xl font-black text-slate-900 mt-1">48.920</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Kelengkapan</span>
                <span className="block text-2xl font-black text-blue-600 mt-1">86.4%</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Ketepatan</span>
                <span className="block text-2xl font-black text-emerald-600 mt-1">82.1%</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Respon Verifikasi</span>
                <span className="block text-2xl font-black text-primary mt-1">91.5%</span>
              </div>
            </div>

            {/* Top 5 Highlight Bars */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3">
                Top 5 Penyakit Potensi KLB Terbanyak
              </h4>
              <div className="space-y-2.5">
                {topDiseases.map((d) => {
                  const max = 16840
                  const pct = Math.round((d.kasus / max) * 100)
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between text-xs font-bold mb-1">
                        <span className="text-slate-800">{d.name}</span>
                        <span className="font-mono text-slate-900">
                          {d.kasus.toLocaleString('id-ID')} kasus
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick Action Pillars */}
            <div className="rounded-2xl bg-primary text-white p-5 shadow-xs">
              <h4 className="text-xs font-black uppercase tracking-wider mb-2">
                Aksi Cepat Tim Gerak Cepat (TGC)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-white/10 rounded-xl p-3">
                  <span className="font-bold block mb-1">1. Penyelidikan (PE)</span>
                  Segera lakukan pelacakan epidemiologi 1x24 jam untuk alert terdeteksi.
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <span className="font-bold block mb-1">2. Pengambilan Sampel</span>
                  Pastikan spesimen klinis dikirim ke Labkesmas terakreditasi.
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <span className="font-bold block mb-1">3. Intervensi Terpadu</span>
                  Karantina wilayah fokus dan penyuluhan perilaku hidup bersih (PHBS).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
