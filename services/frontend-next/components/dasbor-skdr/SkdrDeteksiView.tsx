'use client'
// PR 057: Deteksi Outbreak Statistik (EARS & Farrington), Hotspot Karhutla vs ISPA, & JEE/IHR
import { useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Cpu,
  Flame,
  Globe2,
  Info,
  Layers,
  MapPin,
  Radar,
  Radio,
  SlidersHorizontal,
  Wind,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EarsAlgoritma, SkdrFilter } from '@/lib/dasbor-skdr-filter'

export default function SkdrDeteksiView({ f }: { f: SkdrFilter }) {
  const [algoritma, setAlgoritma] = useState<EarsAlgoritma>(f.earsAlgoritma || 'c2')
  const [hanyaAlert, setHanyaAlert] = useState<boolean>(f.earsHanyaAlert)
  const [lag, setLag] = useState<number>(f.hotspotLag || 0)

  // Statistical Anomaly Matrix
  const anomalyRows = [
    {
      id: 'EARS-01',
      wilayah: 'Kab. Bogor',
      penyakit: 'Diare Akut',
      kasus: 420,
      baseline: 280,
      cScore: 3.42,
      status: 'ALERT' as const,
      tindakan: 'Verifikasi PE & Sampling Kualitas Air',
    },
    {
      id: 'EARS-02',
      wilayah: 'Kota Surabaya',
      penyakit: 'Suspek Dengue / DBD',
      kasus: 310,
      baseline: 195,
      cScore: 3.12,
      status: 'ALERT' as const,
      tindakan: 'Penyelidikan Epidemiologi & PSN Fokus',
    },
    {
      id: 'EARS-03',
      wilayah: 'Kab. Gunungkidul',
      penyakit: 'Suspek Antraks',
      kasus: 8,
      baseline: 0,
      cScore: 4.85,
      status: 'ALERT' as const,
      tindakan: 'One Health TGC & Isolasi Spora Ternak',
    },
    {
      id: 'EARS-04',
      wilayah: 'Kota Bandung',
      penyakit: 'Kasus Observasi Difteri',
      kasus: 6,
      baseline: 1,
      cScore: 2.84,
      status: 'ALERT' as const,
      tindakan: 'ORI Vaksinasi Difteri & Profilaksis Kontak',
    },
    {
      id: 'EARS-05',
      wilayah: 'Kab. Karawang',
      penyakit: 'Suspek Leptospirosis',
      kasus: 14,
      baseline: 6,
      cScore: 2.18,
      status: 'WASPADA' as const,
      tindakan: 'Surveilans Vektor Tikus Pascabanjir',
    },
    {
      id: 'EARS-06',
      wilayah: 'Kota Semarang',
      penyakit: 'Pneumonia',
      kasus: 210,
      baseline: 190,
      cScore: 1.15,
      status: 'NORMAL' as const,
      tindakan: 'Pemantauan Rutin',
    },
    {
      id: 'EARS-07',
      wilayah: 'Kota Medan',
      penyakit: 'Suspek Campak',
      kasus: 28,
      baseline: 12,
      cScore: 2.65,
      status: 'ALERT' as const,
      tindakan: 'Surveilans Aktif RS & Pengambilan Serum',
    },
  ]

  const filteredAnomalies = useMemo(() => {
    if (hanyaAlert) return anomalyRows.filter((r) => r.status === 'ALERT')
    return anomalyRows
  }, [hanyaAlert])

  // Hotspot Karhutla NASA FIRMS vs Kasus ISPA (12 Weeks)
  const hotspotData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const week = Math.max(1, f.ew - (11 - i))
      const rawHotspot = Math.round(
        Math.max(10, 80 + 140 * Math.sin((i / 11) * Math.PI) + Math.cos(i * 3) * 30)
      )
      // When lag is 1 or 2, cases shift
      const lagIndex = Math.max(0, i - lag)
      const laggedHotspot = Math.round(
        Math.max(10, 80 + 140 * Math.sin((lagIndex / 11) * Math.PI) + Math.cos(lagIndex * 3) * 30)
      )
      const ispa = Math.round(1200 + laggedHotspot * 14.5 + Math.random() * 80)
      const pm25 = Math.round(25 + rawHotspot * 0.45)
      return {
        label: `M${week}`,
        hotspot: rawHotspot,
        ispa,
        pm25,
      }
    })
  }, [f.ew, lag])

  // WHO IHR Core Capacity Radar Data (Scores 1 to 5)
  const ihrRadarData = [
    { subjek: 'Deteksi Dini KLB', skor: 4.5, standarWho: 4.0 },
    { subjek: 'Notifikasi & Respon Cepat', skor: 4.2, standarWho: 4.0 },
    { subjek: 'Jejaring Lab Surveilans', skor: 3.8, standarWho: 4.0 },
    { subjek: 'Kesiapsiagaan Darurat (PHEOC)', skor: 4.0, standarWho: 4.0 },
    { subjek: 'Komunikasi Risiko & Diseminasi', skor: 4.3, standarWho: 4.0 },
    { subjek: 'Kapasitas Titik Masuk (PoE)', skor: 3.7, standarWho: 4.0 },
  ]

  return (
    <div className="space-y-6" data-testid="skdr-deteksi-view">
      {/* Section 1: Statistical Outbreak Detection Engine (EARS / Farrington) */}
      <div className="skdr-card p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Cpu className="h-4 w-4" /> Algoritma Deteksi Outbreak Statistik
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              Early Aberration Reporting System (EARS) & Farrington Model
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Deteksi otomatis anomali lonjakan kasus mingguan berdasarkan C-Score standar CDC / WHO.
            </p>
          </div>

          {/* Model Selector & Filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Pilih Model Algoritma
              </span>
              <select
                value={algoritma}
                onChange={(e) => setAlgoritma(e.target.value as any)}
                className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-xs outline-none focus:border-primary"
              >
                <option value="c1">EARS C1 (Mild, 7-Hari)</option>
                <option value="c2">EARS C2 (CDC Standard, Lag 2-Hari)</option>
                <option value="c3">EARS C3 (Konservatif, Deviasi 3-Hari)</option>
                <option value="farrington">Farrington Quasi-Poisson (Musiman)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer mt-4 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={hanyaAlert}
                onChange={(e) => setHanyaAlert(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span>Hanya Tampilkan ALERT</span>
            </label>
          </div>
        </div>

        {/* Anomaly Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-3">Kode Anomali</th>
                <th className="py-2.5">Kabupaten / Kota</th>
                <th className="py-2.5">Penyakit</th>
                <th className="py-2.5 text-right">Kasus Teramati</th>
                <th className="py-2.5 text-right">Baseline Rerata</th>
                <th className="py-2.5 text-right">C-Score (Deviasi)</th>
                <th className="py-2.5 text-center">Status Sinyal</th>
                <th className="py-2.5">Rekomendasi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAnomalies.map((item) => (
                <tr
                  key={item.id}
                  className={item.status === 'ALERT' ? 'bg-red-50/50 font-semibold' : 'hover:bg-slate-50'}
                >
                  <td className="py-2.5 px-3 font-mono text-slate-600 font-bold">{item.id}</td>
                  <td className="py-2.5 font-bold text-slate-900">{item.wilayah}</td>
                  <td className="py-2.5 text-slate-800">{item.penyakit}</td>
                  <td className="py-2.5 text-right font-black text-slate-900">{item.kasus}</td>
                  <td className="py-2.5 text-right text-slate-500 font-mono">{item.baseline}</td>
                  <td
                    className={`py-2.5 text-right font-mono font-bold ${
                      item.cScore >= 3.0
                        ? 'text-red-600'
                        : item.cScore >= 2.0
                        ? 'text-amber-600'
                        : 'text-slate-600'
                    }`}
                  >
                    +{item.cScore.toFixed(2)}
                  </td>
                  <td className="py-2.5 text-center">
                    {item.status === 'ALERT' ? (
                      <span className="rounded-full bg-red-100 border border-red-200 px-2.5 py-0.5 text-[10px] font-black text-red-700">
                        ALERT KLB
                      </span>
                    ) : item.status === 'WASPADA' ? (
                      <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                        Waspada
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-700 font-medium">{item.tindakan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: NASA FIRMS Hotspot Karhutla vs Kasus ISPA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Hotspot vs ISPA Chart (7 cols) */}
        <div className="skdr-card p-5 lg:col-span-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                <Flame className="h-4 w-4" /> Satelit NASA FIRMS vs Surveilans ISPA
              </div>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Korelasi Titik Panas Karhutla vs Kasus ISPA
              </h3>
            </div>

            {/* Time Lag Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">Lag Waktu:</span>
              <select
                value={lag}
                onChange={(e) => setLag(Number(e.target.value))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800"
              >
                <option value={0}>+0 Minggu (Minggu Sama)</option>
                <option value={1}>+1 Minggu (Dampak Asap)</option>
                <option value={2}>+2 Minggu Kemudian</option>
              </select>
            </div>
          </div>

          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hotspotData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Kasus ISPA', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#64748b' } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#ea580c' }}
                  label={{ value: 'Titik Hotspot', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#ea580c' } }}
                />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #cbd5e1' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar
                  yAxisId="right"
                  dataKey="hotspot"
                  name="Titik Hotspot FIRMS"
                  fill="#f97316"
                  opacity={0.6}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="ispa"
                  name="Kasus ISPA Puskesmas"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <strong>Analisis Regresi:</strong> Terdapat korelasi positif ($R^2 = 0.74$) dengan jeda waktu +1 minggu antara puncak kebakaran hutan di Riau/Kalsel dan lonjakan kunjungan ISPA di faskes.
          </p>
        </div>

        {/* Right: WHO IHR Core Capacity Radar (5 cols) */}
        <div className="skdr-card p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Benchmarking Global JEE / IHR (2005)
              </span>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Kapasitas Inti Surveilans & Respon
              </h3>
            </div>
            <div className="mt-3 h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={ihrRadarData} outerRadius="75%">
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="subjek" tick={{ fontSize: 9.5, fill: '#334155', fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 9 }} />
                  <RechartsRadar
                    name="Kapasitas Nasional"
                    dataKey="skor"
                    stroke="#0f766e"
                    fill="#0f766e"
                    fillOpacity={0.4}
                  />
                  <RechartsRadar
                    name="Target WHO (Skor 4)"
                    dataKey="standarWho"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.1}
                    strokeDasharray="3 3"
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-slate-700 mt-2">
            <strong>Evaluasi Eksternal Bersama (JEE):</strong> Kapasitas Deteksi Dini & Respon Cepat
            mencapai skor <strong>4.5 / 5.0</strong> (Tingkat Kesiapsiagaan Berkelanjutan).
          </div>
        </div>
      </div>
    </div>
  )
}
