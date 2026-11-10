'use client'

import React from 'react'
import { BarChart3, ChevronRight, ShieldAlert, Users, Zap } from 'lucide-react'
import { triggerModal } from '@/components/landing/LandingModals'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

export default function LandingRapidResponse() {
  return (
    <section id="respons" className="relative scroll-mt-20 overflow-hidden bg-white py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="relative flex items-center justify-center lg:col-span-6">
            <div className="relative flex w-full max-w-[460px] items-center justify-center sm:max-w-[500px] lg:max-w-[540px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${PUBLIC_BASE_PATH}/images/bawah.webp`}
                alt="Respons Cepat untuk Kesehatan Masyarakat SKDR"
                width={688}
                height={592}
                className="h-auto w-full object-contain drop-shadow-md transition-transform duration-300 hover:scale-[1.02]"
              />

              <div className="absolute -bottom-3 -right-2 z-20 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-2.5 shadow-lg sm:bottom-2 sm:right-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-[#009896]">
                  <Zap className="h-5 w-5 fill-current" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold leading-tight text-slate-900">Koordinasi Lintas Sektor</p>
                  <p className="text-[10px] font-medium text-slate-500">One Health: Hewan, Manusia, Lingkungan</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 text-center lg:col-span-6 lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-teal-50 px-3 py-1 text-xs font-semibold text-[#009896]">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Kesiapsiagaan Kesehatan Nasional</span>
            </div>

            <h2 className="text-2xl font-extrabold leading-snug tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
              Respons Cepat untuk <br className="hidden sm:inline" />
              <span className="text-[#009896]">Kesehatan Masyarakat</span>
            </h2>

            <p className="text-justify text-sm leading-relaxed text-slate-600 sm:text-base">
              Dengan sistem SKDR, respons terhadap potensi KLB dapat dilakukan lebih cepat melalui pemantauan real-time, analisis data yang akurat, dan koordinasi lintas sektor. Kami berkomitmen menjaga kesehatan masyarakat Indonesia dengan pendekatan surveilans yang modern, responsif, dan berbasis data.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-2 text-left">
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <BarChart3 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#009896]" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Analisis Algoritma Cerdas</h4>
                  <p className="text-[11px] text-slate-500">Mendeteksi lonjakan sinyal otomatis.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <Users className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Tim Gerak Cepat (TGC)</h4>
                  <p className="text-[11px] text-slate-500">Kesiapan diterjunkan ke titik sinyal.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-3 lg:justify-start">
              <button
                type="button"
                onClick={() => triggerModal('respons')}
                className="group inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#009896] px-7 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#008381] hover:shadow-lg active:scale-95 sm:text-base"
              >
                <span>Ikuti Selengkapnya</span>
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
