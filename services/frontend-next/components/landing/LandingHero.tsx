'use client'

import React from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, ChevronRight, Clock, FileText } from 'lucide-react'
import { triggerModal } from '@/components/landing/LandingModals'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useAuth } from '@/lib/skdr-auth'

export default function LandingHero() {
  const { user } = useAuth()
  const portalHref = user ? '/dashboard' : '/login?redirect=%2Fdashboard'

  return (
    <div id="beranda" className="relative w-full scroll-mt-20 overflow-hidden bg-white">
      <div className="relative flex min-h-[500px] w-full flex-col justify-between overflow-hidden sm:min-h-[540px] lg:min-h-[580px]">
        {/* Layer 1: Background Teal & Lime Wave */}
        <div className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${PUBLIC_BASE_PATH}/images/header-bawah.webp`}
            alt="SKDR Teal Background"
            width={1440}
            height={500}
            className="h-full w-full object-cover object-top sm:object-center"
          />
        </div>

        {/* Layer 2a: White Wave Cut Divider (Mobile & Tablet < lg) */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 w-full select-none overflow-hidden leading-none lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${PUBLIC_BASE_PATH}/images/header-atas.webp`}
            alt="SKDR Wave Cut"
            width={1440}
            height={318}
            className="block h-auto w-full object-cover object-bottom"
          />
        </div>

        {/* Layer 2b: Precision Organic White Wave Divider (Desktop >= lg) */}
        <div className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full select-none overflow-hidden lg:block">
          <svg viewBox="0 0 1440 600" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
            <path
              d="M0,126 C250,70 535,68 725,178 C870,264 910,435 1050,445 C1185,455 1300,370 1440,325 L1440,600 L0,600 Z"
              fill="#ffffff"
            />
          </svg>
        </div>

        {/* Konten Hero */}
        <div className="relative z-20 mx-auto w-full max-w-7xl px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:pb-20 lg:pt-16">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            {/* Kolom Teks Sebelah Kiri */}
            <div className="space-y-6 text-center lg:col-span-7 lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/95 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#007e80] shadow-sm lg:border-teal-200/80 lg:bg-teal-50/95">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#b6d31e]" />
                Kementerian Kesehatan Republik Indonesia
              </div>

              <h1 className="text-3xl font-extrabold leading-[1.16] tracking-tight sm:text-4xl md:text-5xl lg:text-[42px] xl:text-[52px]">
                <span className="text-white lg:text-[#0c2d2e]">Kenali Sinyal Lebih Awal,</span>{' '}
                <br className="hidden sm:inline" />
                <span className="text-[#e2f56b] lg:text-[#007e80]">Respons Lebih Cepat.</span>
              </h1>

              <p className="mx-auto max-w-xl text-sm font-normal leading-relaxed text-white/95 sm:text-base md:text-lg lg:mx-0 lg:text-slate-600">
                <span className="font-semibold text-white lg:text-[#0c2d2e]">Sistem Kewaspadaan Dini dan Respon (SKDR)</span>{' '}
                untuk surveilans penyakit, deteksi dini, dan respons kesehatan lebih cepat di Indonesia.
              </p>

              <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row lg:justify-start">
                <Link
                  href={portalHref}
                  data-testid="landing-cta-dashboard"
                  className="group inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f59e0b] to-[#f97316] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:from-[#d97706] hover:to-[#ea580c] active:scale-95 sm:w-auto sm:text-base"
                >
                  <span>Pantau Dasbor SKDR</span>
                  <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Kolom Dokter Sebelah Kanan */}
            <div className="relative flex items-end justify-center self-end pt-4 lg:col-span-5 lg:justify-end lg:pt-0">
              <div className="relative flex items-end justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${PUBLIC_BASE_PATH}/images/dr.webp`}
                  alt="Dokter Surveilans SKDR Kementerian Kesehatan RI"
                  width={985}
                  height={1446}
                  className="pointer-events-none h-auto w-[280px] select-none object-contain object-bottom drop-shadow-lg sm:w-[320px] md:w-[360px] lg:w-[400px] xl:w-[440px]"
                />

                <div className="absolute -left-2 bottom-4 z-30 flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3.5 py-2 text-slate-800 shadow-lg sm:left-2">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">
                    ✓
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-bold leading-tight text-slate-900">Verifikasi Epidemiologi</p>
                    <p className="text-[10px] text-slate-500">Respon Terstandar 24 Jam</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Kartu Fitur Mengambang */}
      <div className="relative z-30 mx-auto -mt-6 max-w-6xl px-4 sm:-mt-10 sm:px-6 md:-mt-12 lg:px-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
          <div
            onClick={() => triggerModal('ebs')}
            className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
          >
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 transition-all duration-200 group-hover:scale-110 group-hover:bg-purple-100">
                <Activity className="h-6 w-6 stroke-[2.2]" />
              </div>
              <h3 className="mb-2 text-base font-bold text-slate-800 transition-colors group-hover:text-[#009896]">
                EBS Terintegrasi
              </h3>
              <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                Akses data epidemiologi dan surveilans secara terintegrasi dalam satu sistem.
              </p>
            </div>
            <div className="mt-2 flex items-center pt-4 text-xs font-semibold text-purple-600 transition-transform group-hover:translate-x-1">
              <span>Pelajari EBS</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </div>

          <div
            onClick={() => triggerModal('klb')}
            className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
          >
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-all duration-200 group-hover:scale-110 group-hover:bg-emerald-100">
                <Clock className="h-6 w-6 stroke-[2.2]" />
              </div>
              <h3 className="mb-2 text-base font-bold text-slate-800 transition-colors group-hover:text-[#009896]">
                24 Jam Respons KLB
              </h3>
              <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                Respon cepat terhadap kejadian luar biasa (KLB) di seluruh Indonesia.
              </p>
            </div>
            <div className="mt-2 flex items-center pt-4 text-xs font-semibold text-emerald-600 transition-transform group-hover:translate-x-1">
              <span>SOP Respons KLB</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </div>

          <div
            onClick={() => triggerModal('pe')}
            className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
          >
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition-all duration-200 group-hover:scale-110 group-hover:bg-amber-100">
                <FileText className="h-6 w-6 stroke-[2.2]" />
              </div>
              <h3 className="mb-2 text-base font-bold text-slate-800 transition-colors group-hover:text-[#009896]">
                Laporan Kasus PE
              </h3>
              <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                Pelaporan kasus penyakit potensial wabah secara real-time dan akurat.
              </p>
            </div>
            <div className="mt-2 flex items-center pt-4 text-xs font-semibold text-amber-600 transition-transform group-hover:translate-x-1">
              <span>Alur Form PE</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
