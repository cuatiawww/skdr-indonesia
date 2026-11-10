'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, MapPin, Phone, Shield } from 'lucide-react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useAuth } from '@/lib/skdr-auth'

// Split local/domain across elements so upstream email obfuscators (e.g. Cloudflare)
// do not rewrite SSR HTML and cause a React hydration mismatch.
function SafeEmail({ local, domain }: { local: string; domain: string }) {
  return (
    <span className="inline-flex">
      <span>{local}</span>
      <span>@</span>
      <span>{domain}</span>
    </span>
  )
}

export default function LandingFooter() {
  const { user } = useAuth()
  const [mailHref, setMailHref] = useState('#kontak')
  useEffect(() => {
    setMailHref(`mailto:${['info', 'kemkes.go.id'].join('@')}`)
  }, [])
  const authOrLogin = (dest: string) => (user ? dest : `/login?redirect=${encodeURIComponent(dest)}`)

  return (
    <footer id="kontak" className="w-full scroll-mt-20 bg-[#028486] text-white">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          <div className="space-y-4 lg:col-span-4">
            <div className="py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${PUBLIC_BASE_PATH}/images/Logo-Kemenkes.png`}
                alt="Kementerian Kesehatan Republik Indonesia"
                width={180}
                height={42}
                className="h-9 w-auto object-contain brightness-0 invert md:h-11"
              />
            </div>

            <div className="space-y-1 pt-2 text-white/90">
              <p className="text-sm font-semibold tracking-wide">Sehat Negeriku, Tangguh Bangsaku</p>
              <p className="text-xs text-white/80">Untuk Indonesia yang lebih sehat.</p>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <a
                href="https://facebook.com/kemenkesRI"
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook Kementerian Kesehatan"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a
                href="https://instagram.com/kemenkes_ri"
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram Kementerian Kesehatan"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a
                href="https://youtube.com/@KemenkesRI"
                target="_blank"
                rel="noreferrer"
                aria-label="YouTube Kementerian Kesehatan"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
              <a
                href={mailHref}
                aria-label="Email Kementerian Kesehatan"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <h4 className="border-b border-white/20 pb-2 text-sm font-bold uppercase tracking-wider text-white">
              Tautan Cepat
            </h4>
            <ul className="space-y-2 text-xs text-white/85">
              <li>
                <a href="#" className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Beranda
                </a>
              </li>
              <li>
                <a href="#tentang" className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Profil SKDR
                </a>
              </li>
              <li>
                <a href="#respons" className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Dokumentasi &amp; SOP
                </a>
              </li>
              <li>
                <a href="#penyakit" className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Daftar Penyakit KLB
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <h4 className="border-b border-white/20 pb-2 text-sm font-bold uppercase tracking-wider text-white">
              Dasbor &amp; Data
            </h4>
            <ul className="space-y-2 text-xs text-white/85">
              <li>
                <Link href={authOrLogin('/dashboard')} className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Dasbor Nasional
                </Link>
              </li>
              <li>
                <Link href={authOrLogin('/dasbor/ebs-ibs')} className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Dasbor EBS &amp; IBS
                </Link>
              </li>
              <li>
                <Link href={authOrLogin('/dasbor/mbg')} className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Dasbor Program MBG
                </Link>
              </li>
              <li>
                <Link href={authOrLogin('/beranda')} className="flex items-center gap-1.5 transition-colors hover:text-white">
                  <span className="text-[#b6d31e]">▸</span> Portal Rilis Data
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 lg:col-span-4">
            <h4 className="border-b border-white/20 pb-2 text-sm font-bold uppercase tracking-wider text-white">
              Kontak Layanan
            </h4>
            <div className="space-y-2.5 text-xs text-white/85">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#b6d31e]" />
                <span>
                  <strong className="text-white">Alamat:</strong> Jl. H.R. Rasuna Said Blok X-5 Kav. 4-9, Jakarta Selatan 12950
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 flex-shrink-0 text-[#b6d31e]" />
                <span>
                  <strong className="text-white">Telepon:</strong> 021-52906111 / Halo Kemenkes 1500-567
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 flex-shrink-0 text-[#b6d31e]" />
                <span>
                  <strong className="text-white">Email:</strong>{' '}
                  <SafeEmail local="info" domain="kemkes.go.id" />{' / '}
                  <SafeEmail local="skdr" domain="kemkes.go.id" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full border-t border-teal-800/60 bg-[#006f70] py-4">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs text-white/80 sm:flex-row sm:px-6 lg:px-8">
          <div>
            Hak Cipta © 2024 Kementerian Kesehatan Republik Indonesia. All Rights Reserved.
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/70">Surveilans Terakreditasi Nasional</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/90">
              <Shield className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
