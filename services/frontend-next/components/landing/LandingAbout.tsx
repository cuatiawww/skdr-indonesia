import React from 'react'
import { Calendar, Phone } from 'lucide-react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

export default function LandingAbout() {
  return (
    <section id="tentang" className="relative scroll-mt-20 bg-white py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-14 max-w-3xl text-center md:mb-20">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
            Tentang SKDR
          </h2>
          <div className="mx-auto my-4 h-1 w-16 rounded-full bg-[#009896]" />
          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            Untuk mendukung sistem kewaspadaan <span className="font-semibold text-slate-800">dini dan respon cepat</span> terhadap penyakit di Indonesia, SKDR hadir sebagai platform terintegrasi untuk surveilans kesehatan masyarakat.
          </p>
        </div>

        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="space-y-6 lg:col-span-7">
            <h3 className="text-xl font-bold leading-snug text-slate-900 sm:text-2xl md:text-3xl">
              Surveilans Digital Terpadu <br className="hidden sm:inline" />
              <span className="text-[#009896]">Kesehatan Masyarakat</span>
            </h3>

            <p className="text-justify text-sm leading-relaxed text-slate-600 sm:text-base">
              SKDR merupakan sistem yang terintegrasi dengan berbagai sumber data kesehatan, mulai dari fasilitas pelayanan kesehatan, laboratorium, hingga laporan masyarakat, guna memantau potensi wabah secara lebih cepat dan akurat.
            </p>

            <p className="text-justify text-sm leading-relaxed text-slate-600 sm:text-base">
              Cek informasi dan peringatan dini KLB, serta akses data surveilans terkini untuk mendukung pengambilan keputusan yang lebih tepat dalam melindungi kesehatan masyarakat Indonesia.
            </p>

            <div className="flex w-fit items-center gap-4 rounded-2xl border border-slate-200/60 bg-slate-50/80 p-4 pt-4">
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-2 border-[#009896] shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${PUBLIC_BASE_PATH}/images/mockup_dr_edi.png`}
                  alt="dr. H. Edi Suharmen"
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">dr. H. Edi Suharmen</h4>
                <p className="text-xs font-medium text-slate-500">Dirjen Pencegahan dan Pengendalian Penyakit</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative overflow-hidden rounded-2xl border-2 border-[#64b1b7]/40 bg-[#f2fafb] p-6 shadow-sm transition-shadow hover:shadow-md sm:p-7">
              <div className="mb-5 border-b border-[#64b1b7]/30 pb-3">
                <div className="mb-1 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#009896]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#009896]">
                    Monitoring Rutin
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 sm:text-lg">
                  Jadwal Pemantauan &amp; Verifikasi Sinyal Hari/Mingguan
                </h4>
              </div>

              <div className="space-y-3.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between border-b border-dashed border-slate-200 py-1.5">
                  <span className="font-semibold text-slate-700">Senin - Minggu</span>
                  <span className="rounded border border-slate-200/80 bg-white px-2.5 py-0.5 font-mono font-medium text-slate-900">
                    00 - 24.00
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-dashed border-slate-200 py-1.5">
                  <span className="font-semibold text-slate-700">Puskesmas</span>
                  <span className="rounded border border-teal-200/60 bg-teal-50 px-2.5 py-0.5 font-mono font-medium text-[#009896]">
                    24 Jam
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-dashed border-slate-200 py-1.5">
                  <span className="font-semibold text-slate-700">Kabupaten / Kota</span>
                  <span className="rounded border border-slate-200/80 bg-white px-2.5 py-0.5 font-medium text-slate-800">
                    1x Sehari
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-dashed border-slate-200 py-1.5">
                  <span className="font-semibold text-slate-700">Provinsi</span>
                  <span className="rounded border border-slate-200/80 bg-white px-2.5 py-0.5 font-medium text-slate-800">
                    1x Sehari
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-semibold text-slate-700">Tingkat Verifikasi</span>
                  <span className="rounded border border-rose-200/60 bg-rose-50 px-2.5 py-0.5 font-medium text-rose-700">
                    7x24 - 5 Menit
                  </span>
                </div>
              </div>

              <div className="mt-6 border-t border-[#64b1b7]/30 pt-4">
                <a
                  href="tel:1500915"
                  className="group flex w-full items-center justify-center gap-3 rounded-xl border border-[#64b1b7]/40 bg-white px-4 py-3 text-sm font-bold text-[#009896] shadow-sm transition-colors hover:bg-teal-50/80 sm:text-base"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#009896] transition-transform group-hover:scale-110">
                    <Phone className="h-4 w-4 fill-current" />
                  </span>
                  <span>HELLO TITAN 1500 915</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
