'use client'
// PR 057: Distribusi & Demografi - Classical descriptive epidemiology
import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  Building2,
  Hospital,
  MapPin,
  PieChart as PieIcon,
  Stethoscope,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SkdrFilter } from '@/lib/dasbor-skdr-filter'
import { MASTER_36_DISEASES } from '@/lib/dasbor-skdr-api'

const GENDER_COLORS = ['#0284c7', '#ec4899']
const UNIT_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#06b6d4']

export default function SkdrDistribusiView({ f }: { f: SkdrFilter }) {
  const [selectedDisease, setSelectedDisease] = useState<string>(f.penyakit[0] || '01AWD')

  const diseaseInfo = useMemo(() => {
    return (
      MASTER_36_DISEASES.find((d) => d.code === selectedDisease) || {
        code: selectedDisease,
        name: 'Diare Akut',
      }
    )
  }, [selectedDisease])

  // Age Pyramid data
  const ageData = [
    { group: '< 1 Tahun (Bayi)', pria: 480, wanita: 410, total: 890 },
    { group: '1–4 Tahun (Balita)', pria: 1240, wanita: 1120, total: 2360 },
    { group: '5–14 Tahun (Sekolah)', pria: 980, wanita: 930, total: 1910 },
    { group: '15–44 Tahun (Produktif)', pria: 1540, wanita: 1680, total: 3220 },
    { group: '≥ 45 Tahun (Lansia)', pria: 820, wanita: 940, total: 1760 },
  ]

  // Gender Totals
  const genderData = [
    { name: 'Laki-laki', value: 5060 },
    { name: 'Perempuan', value: 5080 },
  ]

  // Reporting Unit Distribution
  const unitData = [
    { name: 'Puskesmas', value: 7420, pct: '73.2%' },
    { name: 'Rumah Sakit', value: 1840, pct: '18.1%' },
    { name: 'Klinik Pratama', value: 620, pct: '6.1%' },
    { name: 'Laboratorium', value: 260, pct: '2.6%' },
  ]

  // Regional Ranking
  const rankingWilayah = [
    { no: 1, kab: 'Kab. Bogor', prov: 'Jawa Barat', kasus: 1240, meninggal: 4, ar: 21.4, cfr: '0.32%' },
    { no: 2, kab: 'Kota Surabaya', prov: 'Jawa Timur', kasus: 980, meninggal: 2, ar: 33.1, cfr: '0.20%' },
    { no: 3, kab: 'Kota Bandung', prov: 'Jawa Barat', kasus: 890, meninggal: 3, ar: 36.2, cfr: '0.34%' },
    { no: 4, kab: 'Kota Semarang', prov: 'Jawa Tengah', kasus: 760, meninggal: 1, ar: 44.8, cfr: '0.13%' },
    { no: 5, kab: 'Kota Medan', prov: 'Sumatera Utara', kasus: 710, meninggal: 2, ar: 29.5, cfr: '0.28%' },
    { no: 6, kab: 'Kota Makassar', prov: 'Sulawesi Selatan', kasus: 640, meninggal: 1, ar: 42.1, cfr: '0.16%' },
    { no: 7, kab: 'Kab. Tangerang', prov: 'Banten', kasus: 610, meninggal: 2, ar: 18.9, cfr: '0.33%' },
    { no: 8, kab: 'Kota Bekasi', prov: 'Jawa Barat', kasus: 590, meninggal: 0, ar: 23.4, cfr: '0.00%' },
    { no: 9, kab: 'Kota Palembang', prov: 'Sumatera Selatan', kasus: 520, meninggal: 1, ar: 31.0, cfr: '0.19%' },
    { no: 10, kab: 'Kota Denpasar', prov: 'Bali', kasus: 480, meninggal: 0, ar: 51.2, cfr: '0.00%' },
  ]

  return (
    <div className="space-y-6" data-testid="skdr-distribusi-view">
      {/* Header with Disease Selector */}
      <div className="skdr-card p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Distribusi Epidemiologi Deskriptif
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              Distribusi Demografi Kasus: {diseaseInfo.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Analisa sebaran menurut orang (golongan usia & jenis kelamin), unit pelapor, dan tempat (peringkat wilayah).
            </p>
          </div>
          <div className="w-full md:w-72">
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
              Pilih Penyakit
            </label>
            <select
              value={selectedDisease}
              onChange={(e) => setSelectedDisease(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-xs outline-none hover:border-brand-400 focus:border-primary"
            >
              {MASTER_36_DISEASES.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Row 1: Age Pyramid & Gender Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Age Group Pyramid (8 cols) */}
        <div className="skdr-card p-5 lg:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Piramida Golongan Umur
              </span>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Distribusi Kasus menurut Kelompok Usia & Gender
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-semibold">Tahun {f.ey}</span>
          </div>

          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ageData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 30, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="group"
                  tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                  width={130}
                />
                <Tooltip
                  formatter={(val: any) => [Number(val).toLocaleString('id-ID'), '']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #cbd5e1' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="pria" name="Laki-laki" fill="#0284c7" radius={[0, 4, 4, 0]} />
                <Bar dataKey="wanita" name="Perempuan" fill="#ec4899" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Gender Donut & Unit Pelapor (4 cols) */}
        <div className="skdr-card p-5 lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Komposisi Gender
              </span>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Proporsi Laki-laki vs Perempuan
              </h3>
            </div>
            <div className="mt-4 h-48 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {genderData.map((_, i) => (
                      <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString('id-ID')} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Unit Pelapor Breakdown */}
          <div className="pt-3 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Sumber Unit Pelapor
            </span>
            <div className="space-y-2">
              {unitData.map((u, i) => (
                <div key={u.name} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: UNIT_COLORS[i] }}
                    />
                    {u.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">
                      {u.value.toLocaleString('id-ID')}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">({u.pct})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Regional Incidence Ranking Table */}
      <div className="skdr-card p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Peringkat Wilayah Tertinggi
            </span>
            <h3 className="text-base font-black text-slate-900 mt-0.5">
              Top 10 Kabupaten / Kota Beban Kasus & Attack Rate ({diseaseInfo.name})
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-semibold">Tahun {f.ey}</span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-3">No.</th>
                <th className="py-2.5">Kabupaten / Kota</th>
                <th className="py-2.5">Provinsi</th>
                <th className="py-2.5 text-right">Kasus</th>
                <th className="py-2.5 text-right">Meninggal</th>
                <th className="py-2.5 text-right">Attack Rate (per 100k)</th>
                <th className="py-2.5 text-right">CFR</th>
                <th className="py-2.5 text-center">Tindakan Respon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rankingWilayah.map((r) => (
                <tr key={r.kab} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-bold text-slate-400">{r.no}</td>
                  <td className="py-2.5 font-bold text-slate-900">{r.kab}</td>
                  <td className="py-2.5 text-slate-600">{r.prov}</td>
                  <td className="py-2.5 text-right font-black text-slate-900">
                    {r.kasus.toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 text-right font-bold text-red-600">{r.meninggal}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-primary">{r.ar}</td>
                  <td className="py-2.5 text-right font-mono text-slate-600">{r.cfr}</td>
                  <td className="py-2.5 text-center">
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      TGC Terjun
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
