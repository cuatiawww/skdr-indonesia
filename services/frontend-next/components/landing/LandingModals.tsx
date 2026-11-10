'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity, ArrowRight, BarChart2, CheckCircle, CheckCircle2, Clock,
  FileText, Key, Lock, ShieldCheck, User, X,
} from 'lucide-react'
import { useAuth } from '@/lib/skdr-auth'
import { peFetch } from '@/lib/pe-api'

export type ModalType = 'portal' | 'dashboard' | 'ebs' | 'klb' | 'pe' | 'respons'

export function triggerModal(name: ModalType) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('skdr:open-modal', { detail: name }))
  }
}

function FeatureDetailModal({ type, onClose }: { type: string | null; onClose: () => void }) {
  if (!type) return null

  const contentMap: Record<string, {
    title: string
    subtitle: string
    icon: any
    iconBg: string
    iconColor: string
    description: string
    points: string[]
  }> = {
    ebs: {
      title: 'Event-Based Surveillance (EBS) Terintegrasi',
      subtitle: 'Surveilans Berbasis Kejadian untuk Deteksi Dini Ancaman Kesehatan',
      icon: Activity,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      description: 'EBS mengumpulkan, memantau, dan menganalisis laporan kejadian tidak biasa dari berbagai sumber formal maupun komunitas, laboratorium, faskes, dan laporan petugas untuk mengidentifikasi sinyal ancaman kesehatan masyarakat sedini mungkin.',
      points: [
        'Pencatatan dan pelacakan sinyal rumor kesehatan dan potensi wabah',
        'Triase dan validasi sinyal oleh epidemiolog dalam hitungan jam',
        'Integrasi langsung ke dasbor analitik EBS & IBS SKDR',
        'Koordinasi lintas kementerian dan sektor terkait (One Health)',
      ],
    },
    klb: {
      title: 'Standar 24 Jam Respons Kejadian Luar Biasa (KLB)',
      subtitle: 'Protokol Siaga Penyelidikan Epidemiologi Cepat di Seluruh Wilayah',
      icon: Clock,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      description: 'Setiap sinyal yang melampaui batas ambang kewaspadaan wajib diverifikasi dalam kurun waktu kurang dari 24 jam. Jika terkonfirmasi sebagai potensi KLB, Tim Gerak Cepat (TGC) segera dimobilisasi untuk penanggulangan sumber penularan.',
      points: [
        'Verifikasi sinyal oleh petugas surveilans Puskesmas & Dinkes',
        'Penerbitan laporan penyelidikan epidemiologi lapangan < 24 jam',
        'Pengambilan dan pengiriman spesimen laboratorium rujukan nasional',
        'Pemutusan rantai penularan dan pelaporan berkala hingga status KLB dicabut',
      ],
    },
    pe: {
      title: 'Laporan Kasus Penyelidikan Epidemiologi (PE)',
      subtitle: 'Instrumen Digital Terstandar Penelusuran Kontak dan Riwayat Paparan',
      icon: FileText,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      description: 'Form PE digital mempermudah petugas surveilans di garda terdepan mengisi formulir investigasi kasus potensial wabah dengan standarisasi variabel Kementerian Kesehatan RI.',
      points: [
        'Pengisian formulir investigasi kasus secara digital & terstruktur',
        'Validasi data otomatis untuk mencegah inkonsistensi dan duplikasi entri',
        'Pelacakan riwayat paparan dan pemetaan geografis kluster kasus',
        'Rekap laporan komprehensif untuk evaluasi dan tindak lanjut pimpinan',
      ],
    },
    respons: {
      title: 'Kerangka Respons Cepat Surveilans Nasional',
      subtitle: 'Strategi Transformasi Digital Ketahanan Kesehatan Masyarakat Indonesia',
      icon: Activity,
      iconBg: 'bg-teal-50',
      iconColor: 'text-[#009896]',
      description: 'Kementerian Kesehatan RI menerapkan kerangka kerja surveilans komprehensif berstandar global dengan target kinerja 7-1-7: mendeteksi ancaman kesehatan dalam 7 hari, melaporkan dan memverifikasi dalam 1 hari, serta menuntaskan respons awal dalam 7 hari.',
      points: [
        'Jaringan pelaporan fasyankes dan laboratorium surveilans nasional',
        'Penguatan surveilans aktif Puskesmas, Dinkes Kab/Kota, dan Provinsi di 38 Provinsi',
        'Pendekatan One Health terpadu (Kemenkes, Kementan, KLHK) dan Program MBG',
        'Dasbor pemantauan tren mingguan, peta choropleth, dan heatmap sinyal KLB',
      ],
    },
  }

  const current = contentMap[type] || contentMap.ebs
  const Icon = current.icon

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4">
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[#009896] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${current.iconBg} ${current.iconColor}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">{current.title}</h3>
              <p className="text-xs text-white/80">{current.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">{current.description}</p>
          <div className="pt-2">
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-800">
              Fitur &amp; Standar Operasional:
            </h4>
            <div className="space-y-2">
              {current.points.map((pt, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#009896]" />
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl bg-[#009896] px-5 py-2.5 text-xs font-semibold text-white shadow transition-all hover:bg-[#008381]"
            >
              Mengerti
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type LiveHomeSummary = {
  counts: {
    provinces_total: number
    diseases_total: number
    provinces_with_data: number
    diseases_with_data: number
    ebs_records: number
    pe_records: number
  }
  top_provinces: { id: number; name: string; diseases: number; ebs: { alerts: number; cases: number }; pe: { cases: number } }[]
}

function DashboardModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const [live, setLive] = useState<LiveHomeSummary | null>(null)
  const [loadingLive, setLoadingLive] = useState(false)

  useEffect(() => {
    if (!isOpen || !user) return
    let active = true
    setLoadingLive(true)
    peFetch<{ data: LiveHomeSummary }>('/api/v1/analytics/home')
      .then((res) => { if (active) setLive(res.data) })
      .catch(() => { if (active) setLive(null) })
      .finally(() => { if (active) setLoadingLive(false) })
    return () => { active = false }
  }, [isOpen, user])

  if (!isOpen) return null

  const nf = (v: number) => new Intl.NumberFormat('id-ID').format(v)
  const modules = [
    { name: 'Dasbor Utama & Peta Nasional', desc: 'Agregasi sinyal EBS, kasus PE, peta choropleth provinsi/kabupaten, dan tren mingguan (W1–W52).' },
    { name: 'Dasbor SKDR EBS & IBS', desc: 'Analitik langsung dari transaksi Form Laporan EBS, Entri Data Agregat (24 penyakit), dan Form Individu.' },
    { name: 'Dasbor Program MBG', desc: 'Pemantauan Pengawasan Gizi SPPG (Form 1–13) serta investigasi kejadian Keracunan Pangan MBG.' },
    { name: 'Form Penyelidikan Epidemiologi (PE)', desc: 'Pencatatan kasus Antraks, Rabies, Leptospirosis, Flu Burung, hingga pelaporan rutin puskesmas.' },
  ]

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4">
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between bg-[#009896] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#b6d31e]">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight sm:text-lg">
                Dasbor Pemantauan Nasional SKDR
              </h3>
              <p className="text-xs text-white/80">
                Pusat Data Surveilans Penyakit &amp; Respon KLB Terkini
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        {user && live ? (
          <div className="flex-shrink-0 border-b border-slate-200/80 bg-slate-50 px-6 py-3">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              <div>
                <div className="text-xs text-slate-500">Provinsi Aktif</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {nf(live.counts.provinces_with_data)} / {nf(live.counts.provinces_total)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Penyakit Terpantau</div>
                <div className="text-lg font-bold text-emerald-600 tabular-nums">
                  {nf(live.counts.diseases_with_data)} / {nf(live.counts.diseases_total)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Rekaman EBS</div>
                <div className="text-lg font-bold text-amber-600 tabular-nums">{nf(live.counts.ebs_records)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Rekaman PE</div>
                <div className="text-lg font-bold text-[#009896] tabular-nums">{nf(live.counts.pe_records)}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-6 overflow-y-auto p-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Activity className="h-4 w-4 text-[#009896]" />
                <span>{user ? 'Ringkasan Modul & Situasi Terkini' : 'Modul Analitik & Pelaporan SKDR'}</span>
              </h4>
              {loadingLive ? <span className="text-[11px] text-slate-400">Memuat data live...</span> : null}
            </div>

            {user && live?.top_provinces?.length ? (
              <div className="mb-4 space-y-2">
                {live.top_provinces.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200/80 bg-white p-3 text-xs sm:flex-row sm:items-center"
                  >
                    <div>
                      <span className="text-sm font-bold text-slate-900">{p.name}</span>
                      <p className="mt-0.5 text-slate-500">{nf(p.diseases)} penyakit tercatat</p>
                    </div>
                    <div className="flex items-center gap-3 font-semibold text-slate-700 tabular-nums">
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">EBS: {nf(p.ebs.cases)} kasus</span>
                      <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[#007e80]">PE: {nf(p.pe.cases)} kasus</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modules.map((m) => (
                <div key={m.name} className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs">
                  <div className="font-bold text-slate-900">{m.name}</div>
                  <p className="mt-1 leading-relaxed text-slate-600">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-teal-200/80 bg-teal-50/70 p-4 text-xs text-teal-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#009896]" />
            <div>
              <p className="font-bold">Akses Data Surveilans Terproteksi</p>
              <p className="mt-0.5 leading-relaxed text-slate-600">
                Data surveilans aktual, peta sebaran kabupaten/kota, serta pelaporan transaksi faskes dilindungi hak akses sesuai regulasi UU PDP. Silakan masuk melalui <strong>Akses SKDR</strong> untuk membuka dasbor lengkap.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-200/80 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200/70"
          >
            Tutup
          </button>
          <Link
            href={user ? '/dashboard' : '/login?redirect=%2Fdashboard'}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#009896] px-4 py-2 text-xs font-semibold text-white shadow transition-colors hover:bg-[#008381]"
          >
            <span>{user ? 'Buka Dasbor SKDR' : 'Masuk untuk Lihat Data Live'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function PortalLoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter()
  const { user, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      await login(username.trim(), password)
      setIsSuccess(true)
      onClose()
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk. Periksa nama pengguna dan kata sandi.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4">
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[#009896] px-6 py-5 text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-[#b6d31e]" />
            <div>
              <h3 className="text-base font-bold leading-tight">Portal Akses SKDR</h3>
              <p className="text-xs text-white/80">Sistem Kewaspadaan Dini &amp; Respon</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="p-6">
          {user ? (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">Anda Sudah Masuk</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Masuk sebagai <b>{user.full_name || user.username}</b> ({user.role_name}).
                </p>
              </div>
              <Link
                href="/dashboard"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#009896] py-3 text-xs font-semibold text-white shadow-md hover:bg-[#008381]"
              >
                <span>Buka Dasbor SKDR</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : isSuccess ? (
            <div className="space-y-3 py-8 text-center">
              <div className="mx-auto flex h-14 w-14 animate-bounce items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-800">Autentikasi Berhasil</h4>
              <p className="text-xs text-slate-500">Mengarahkan ke dashboard surveilans Anda...</p>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nama Pengguna / Email
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nama pengguna atau email terdaftar"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009896] sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Kata Sandi
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009896] sm:text-sm"
                  />
                </div>
              </div>

              {error ? (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#009896] py-3 text-xs font-semibold text-white shadow-md transition-all hover:bg-[#008381] active:scale-[0.99] disabled:opacity-50 sm:text-sm"
                >
                  {isLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Key className="h-4 w-4" />
                      <span>Masuk ke Sistem SKDR</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-1 text-center">
                <a href="tel:1500915" className="text-[11px] text-[#009896] hover:underline">
                  Lupa kata sandi? Hubungi Helpdesk Hello Titan (1500 915)
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LandingModals() {
  const [activeModal, setActiveModal] = useState<ModalType | null>(null)

  useEffect(() => {
    const onOpen = (e: Event) => {
      const customEvent = e as CustomEvent<ModalType>
      setActiveModal(customEvent.detail)
    }
    window.addEventListener('skdr:open-modal', onOpen)
    return () => window.removeEventListener('skdr:open-modal', onOpen)
  }, [])

  if (!activeModal) return null

  return (
    <>
      <PortalLoginModal isOpen={activeModal === 'portal'} onClose={() => setActiveModal(null)} />
      <DashboardModal isOpen={activeModal === 'dashboard'} onClose={() => setActiveModal(null)} />
      <FeatureDetailModal
        type={['ebs', 'klb', 'pe', 'respons'].includes(activeModal) ? activeModal : null}
        onClose={() => setActiveModal(null)}
      />
    </>
  )
}
