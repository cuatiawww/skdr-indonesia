import React from 'react'
import { CheckCircle2, Gauge, Globe2 } from 'lucide-react'

export default function LandingStats() {
  const stats = [
    {
      value: '100%',
      label: 'Verifikasi <24 Jam',
      sublabel: 'Target respon sinyal peringatan dini',
      icon: CheckCircle2,
      accentColor: 'text-[#009896]',
      bgAccent: 'bg-teal-50',
    },
    {
      value: '38',
      label: 'Provinsi Terkoneksi',
      sublabel: '514 Kabupaten/Kota di seluruh Indonesia',
      icon: Globe2,
      accentColor: 'text-[#009896]',
      bgAccent: 'bg-teal-50',
    },
    {
      value: 'Kinerja 7-1-7',
      label: 'Respons Cepat',
      sublabel: '7 hari deteksi, 1 hari notifikasi, 7 hari respon tuntas',
      icon: Gauge,
      accentColor: 'text-[#009896]',
      bgAccent: 'bg-teal-50',
    },
  ]

  return (
    <section className="border-t border-slate-100 bg-slate-50/50 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {stats.map((stat, idx) => {
            const Icon = stat.icon
            return (
              <div
                key={idx}
                className="group flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white p-7 text-center shadow-sm transition-all duration-300 hover:shadow-md"
              >
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${stat.bgAccent} transition-transform group-hover:scale-110`}>
                  <Icon className={`h-6 w-6 ${stat.accentColor}`} />
                </div>
                <div className="mb-1 text-3xl font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-[#009896] sm:text-4xl">
                  {stat.value}
                </div>
                <div className="text-sm font-bold text-slate-800 sm:text-base">{stat.label}</div>
                <div className="mt-1 text-xs text-slate-500">{stat.sublabel}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
