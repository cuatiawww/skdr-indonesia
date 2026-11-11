'use client'
// PR 057: WHO 7-1-7 Framework & EBS Quality Analytics (Respon Standar Global)
import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck,
  Filter,
  Flame,
  Radio,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SkdrFilter } from '@/lib/dasbor-skdr-filter'

const SOURCE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

export default function Skdr717View({ f }: { f: SkdrFilter }) {
  const [selectedKategori, setSelectedKategori] = useState<string>('semua')

  // WHO 7-1-7 Metrics
  const metrics717 = {
    t1Pct: 88.4, // Deteksi <= 7 hari
    t1Hari: 3.2,
    t2Pct: 94.1, // Notifikasi <= 1 hari
    t2Hari: 0.6,
    t3Pct: 84.7, // Respon <= 7 hari
    t3Hari: 2.8,
    overall: 89.1,
  }

  // Signal Quality Funnel
  const funnelData = [
    { label: 'Sinyal & Rumor Masuk', count: 3412, pct: '100%' },
    { label: 'Selesai Diverifikasi', count: 2840, pct: '83.2%' },
    { label: 'Investigasi TGC Lapangan', count: 680, pct: '19.9%' },
    { label: 'Dikonfirmasi KLB', count: 142, pct: '4.2%' },
    { label: 'False Alarm / Discarded', count: 520, pct: '15.2%' },
  ]

  // Signal Sources
  const sourceData = [
    { name: 'Fasyankes (Puskesmas/RS)', value: 1820 },
    { name: 'Hotline PHEOC 119', value: 710 },
    { name: 'Media Massa / Berita Online', value: 430 },
    { name: 'Masyarakat / Kader', value: 320 },
    { name: 'Media Sosial / Portal Berita', value: 132 },
  ]

  // AAR (After Action Review) Outbreak Response Logs
  const aarLogs = [
    {
      id: 'AAR-2026-001',
      kejadian: 'KLB Diare Akut Desa Sukamaju',
      wilayah: 'Kab. Bogor, Jawa Barat',
      t1: '2 Hari (Sesuai)',
      t2: '<1 Hari (Sesuai)',
      t3: '2 Hari (Sesuai)',
      status717: 'Tercapai 100%',
      hambatan: 'Keterlambatan reagen tes cepat coliform air di puskesmas',
      rekomendasi: 'Penambahan stok water test kit mobile untuk tim TGC',
    },
    {
      id: 'AAR-2026-002',
      kejadian: 'Klaster Demam Berdarah (DBD) Kel. Rangkah',
      wilayah: 'Kota Surabaya, Jawa Timur',
      t1: '3 Hari (Sesuai)',
      t2: '<1 Hari (Sesuai)',
      t3: '3 Hari (Sesuai)',
      status717: 'Tercapai 100%',
      hambatan: 'Penolakan fogging fokus oleh sebagian warga perumahan',
      rekomendasi: 'Edukasi PSN 3M Plus berbasis kader dasawisma RT/RW',
    },
    {
      id: 'AAR-2026-003',
      kejadian: 'Suspek Antraks Ternak & Warga Dusun B',
      wilayah: 'Kab. Gunungkidul, DIY',
      t1: '4 Hari (Sesuai)',
      t2: '<1 Hari (Sesuai)',
      t3: '1 Hari (Sesuai)',
      status717: 'Tercapai 100%',
      hambatan: 'Tradisi brandu/purak daging ternak sakit masih terjadi',
      rekomendasi: 'One Health TGC terpadu Dinkes, Disnak, dan Kepolisian',
    },
  ]

  return (
    <div className="space-y-6" data-testid="skdr-717-view">
      {/* Target WHO 7-1-7 Framework Top Ribbon */}
      <div className="skdr-card p-6 border-l-4 border-l-primary">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Award className="h-4 w-4" /> Standar Keamanan Kesehatan Global WHO
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              WHO 7-1-7 Framework Timeliness Target
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Evaluasi kecepatan deteksi, notifikasi, dan respon awal pengendalian KLB (Benchmark Nasional ≥ 80.0%).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2 text-xs font-black text-primary">
              Capaian Komposit 7-1-7: {metrics717.overall}%
            </span>
          </div>
        </div>

        {/* 3 Pillars of 7-1-7 */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* T1: Deteksi <= 7 Hari */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 relative">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider">
                1. Deteksi (T1 ≤ 7 Hari)
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                Target ≤ 7 Hari
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{metrics717.t1Pct}%</span>
              <span className="text-xs font-bold text-emerald-600">Memenuhi Target</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Rerata Waktu Deteksi: <strong>{metrics717.t1Hari} hari</strong> sejak kasus pertama
              muncul hingga rumor diketahui.
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${metrics717.t1Pct}%` }}
              />
            </div>
          </div>

          {/* T2: Notifikasi <= 1 Hari */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 relative">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider">
                2. Notifikasi (T2 ≤ 1 Hari)
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                Target ≤ 1 Hari
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{metrics717.t2Pct}%</span>
              <span className="text-xs font-bold text-emerald-600">Sangat Cepat</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Rerata Waktu Notifikasi: <strong>{metrics717.t2Hari} hari (14 jam)</strong> sejak rumor
              diketahui hingga diinput ke SKDR.
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${metrics717.t2Pct}%` }}
              />
            </div>
          </div>

          {/* T3: Respon <= 7 Hari */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 relative">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider">
                3. Respon Awal (T3 ≤ 7 Hari)
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                Target ≤ 7 Hari
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{metrics717.t3Pct}%</span>
              <span className="text-xs font-bold text-emerald-600">Memenuhi Target</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Rerata Waktu Respon TGC: <strong>{metrics717.t3Hari} hari</strong> sejak notifikasi
              hingga investigasi awal di lapangan.
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${metrics717.t3Pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Signal Quality Funnel & Source Analysis */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Signal Quality Funnel (7 cols) */}
        <div className="skdr-card p-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Corong Kualitas Sinyal (Signal Quality)
              </span>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Konversi Rumor EBS Menjadi KLB Terkonfirmasi
              </h3>
            </div>
            <span className="text-xs font-bold text-primary">KLB Rate: 4.2%</span>
          </div>

          <div className="mt-4 space-y-3">
            {funnelData.map((fItem, i) => (
              <div key={fItem.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-700 grid place-items-center text-[10px] font-black">
                      {i + 1}
                    </span>
                    {fItem.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900">
                      {fItem.count.toLocaleString('id-ID')}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">({fItem.pct})</span>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: fItem.pct.replace('%', '') + '%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Sources Breakdown (5 cols) */}
        <div className="skdr-card p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Kontribusi Sumber Sinyal
              </span>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Sebaran Kanal Informasi EBS
              </h3>
            </div>
            <div className="mt-3 h-52 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString('id-ID')} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-700 mt-2">
            <strong>Kanal Teraktif:</strong> Jejaring Puskesmas dan Rumah Sakit berkontribusi
            53.3% dari total rumor EBS terverifikasi di lapangan.
          </div>
        </div>
      </div>

      {/* Row 3: After Action Review (AAR) Log */}
      <div className="skdr-card p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Evaluasi Pasca-KLB (After Action Review)
            </span>
            <h3 className="text-base font-black text-slate-900 mt-0.5">
              Dokumentasi Pembelajaran & Hambatan Respon Lapangan (WHO AAR)
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-semibold">Tahun {f.ey}</span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-3">Kode AAR</th>
                <th className="py-2.5">Kejadian KLB</th>
                <th className="py-2.5">Wilayah</th>
                <th className="py-2.5 text-center">T1 Deteksi</th>
                <th className="py-2.5 text-center">T2 Notifikasi</th>
                <th className="py-2.5 text-center">T3 Respon</th>
                <th className="py-2.5">Hambatan Utama</th>
                <th className="py-2.5">Tindak Lanjut / Rekomendasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aarLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono font-bold text-primary">{log.id}</td>
                  <td className="py-2.5 font-bold text-slate-900">{log.kejadian}</td>
                  <td className="py-2.5 text-slate-600">{log.wilayah}</td>
                  <td className="py-2.5 text-center font-semibold text-emerald-600">{log.t1}</td>
                  <td className="py-2.5 text-center font-semibold text-emerald-600">{log.t2}</td>
                  <td className="py-2.5 text-center font-semibold text-emerald-600">{log.t3}</td>
                  <td className="py-2.5 text-slate-700 max-w-xs">{log.hambatan}</td>
                  <td className="py-2.5 font-medium text-slate-900 max-w-xs">{log.rekomendasi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

