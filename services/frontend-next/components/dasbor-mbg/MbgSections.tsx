'use client'
// Komponen bersama halaman Dasbor MBG:
// - SectionHead: kepala seksi analitik bernomor dengan subjudul teknis/epidemiologis formal
// - MoreDetails: akordeon detail lanjutan
// - MbgMapSection: komparasi spasial 2 kolom (khusus halaman Ringkasan Eksekutif)
// - MbgKeracunanMap & MbgGiziMap: peta spasial fokus tunggal untuk halaman Keracunan Pangan & Pengawasan Gizi
import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'
import type { MapState } from '@/lib/dasbor-mbg-filter'
import { SkeletonMap } from '@/components/ui/Skeleton'
import { nf } from '@/components/dasbor-mbg/MbgUi'

const EbsIbsLayerMap = dynamic(() => import('@/components/dasbor-ebs-ibs/EbsIbsLayerMap'), {
  ssr: false,
  loading: () => <SkeletonMap />,
})

/** Kepala seksi analitik formal bernomor dengan deskripsi metodologis/eksekutif. */
export function SectionHead({
  no,
  title,
  desc,
  id,
  badge,
}: {
  no?: number | string
  title: string
  desc?: ReactNode
  id?: string
  badge?: ReactNode
}) {
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-2 pt-3"
      id={id}
      data-testid={id ? `section-${id}` : undefined}
    >
      <div className="flex items-start gap-3">
        {no !== undefined ? (
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-[11px] font-black text-white shadow-2xs">
            {no}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">{title}</h2>
          {desc ? <p className="mt-0.5 text-xs text-slate-500">{desc}</p> : null}
        </div>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
  )
}

/** Detail lanjutan yang dapat dibuka untuk melihat matriks granular dan rincian tabel tambahan. */
export function MoreDetails({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs" data-testid={testId}>
      <summary className="cursor-pointer list-none select-none text-xs font-bold text-slate-700 hover:text-teal-800 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">▸ Buka Lampiran Analitik:</span>
        <span className="hidden group-open:inline">▾ Tutup Lampiran Analitik:</span> {label}
      </summary>
      <div className="mt-3.5 space-y-4 border-t border-slate-100 pt-3.5">{children}</div>
    </details>
  )
}

function MapCol({
  tone,
  title,
  desc,
  children,
  testId,
}: {
  tone: 'red' | 'emerald'
  title: string
  desc: string
  children: ReactNode
  testId: string
}) {
  return (
    <div className="min-w-0 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs" data-testid={testId}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone === 'red' ? 'bg-red-600' : 'bg-emerald-600'}`} />
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900">{title}</div>
          <p className="text-[11.5px] text-slate-500">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/** Peta tunggal khusus halaman Analisa Keracunan Pangan MBG */
export function MbgKeracunanMap({
  ker,
  kMap,
  setKMap,
}: {
  ker: KeracunanDashData | null
  kMap: MapState
  setKMap: (m: MapState) => void
}) {
  if (ker == null) return <SkeletonMap />
  return (
    <EbsIbsLayerMap
      mode="keracunan"
      title="Peta Distribusi Insiden & Kasus Keracunan Pangan MBG"
      level={ker.map.level}
      parentName={kMap.parent?.name}
      regions={ker.map.regions}
      points={ker.map.points}
      onDrillDown={(id, name) => setKMap({ level: 'kab', parent: { id, name } })}
      onResetLevel={() => setKMap({ level: 'prov', parent: null })}
    />
  )
}

/** Peta tunggal khusus halaman Analisa Pengawasan Gizi MBG */
export function MbgGiziMap({
  gizi,
  gMap,
  setGMap,
}: {
  gizi: GiziDashData | null
  gMap: MapState
  setGMap: (m: MapState) => void
}) {
  if (gizi == null) return <SkeletonMap />
  return (
    <EbsIbsLayerMap
      mode="gizi"
      initialMetric="avg_skor"
      title="Peta Capaian Skor SOP & Cakupan Pengawasan Gizi SPPG"
      level={gizi.map.level}
      parentName={gMap.parent?.name}
      regions={gizi.map.regions}
      points={gizi.map.points}
      onDrillDown={(id, name) => setGMap({ level: 'kab', parent: { id, name } })}
      onResetLevel={() => setGMap({ level: 'prov', parent: null })}
    />
  )
}

/** Komparasi spasial 2 kolom khusus halaman Ringkasan Eksekutif:
 *  Kiri = Distribusi Kejadian Keracunan Pangan | Kanan = Cakupan & Skor Pengawasan Gizi SPPG */
export default function MbgMapSection({
  ker,
  gizi,
  kMap,
  setKMap,
  gMap,
  setGMap,
}: {
  ker: KeracunanDashData | null
  gizi: GiziDashData | null
  kMap: MapState
  setKMap: (m: MapState) => void
  gMap: MapState
  setGMap: (m: MapState) => void
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="mbg-map-section">
      <MapCol
        tone="red"
        testId="map-keracunan"
        title="Peta Distribusi Insiden Keracunan Pangan MBG"
        desc={`Choropleth intensitas kasus & titik lokasi SPPG terdampak (merah tua = terdapat korban meninggal).${
          ker ? ` Tercatat ${nf(ker.kpis.total_kejadian)} kejadian di ${nf(ker.map.regions.length)} wilayah.` : ''
        }`}
      >
        {ker == null ? (
          <SkeletonMap />
        ) : (
          <EbsIbsLayerMap
            compact
            mode="keracunan"
            title="Distribusi Kejadian & Kasus"
            level={ker.map.level}
            parentName={kMap.parent?.name}
            regions={ker.map.regions}
            points={ker.map.points}
            onDrillDown={(id, name) => setKMap({ level: 'kab', parent: { id, name } })}
            onResetLevel={() => setKMap({ level: 'prov', parent: null })}
          />
        )}
      </MapCol>
      <MapCol
        tone="emerald"
        testId="map-pengawasan"
        title="Peta Cakupan & Skor Kepatuhan Pengawasan Gizi SPPG"
        desc={`Choropleth rata-rata skor SOP (F3–F11) & titik SPPG diawasi (oranye = skor < 80 atau F12 BELUM BAIK).${
          gizi ? ` Tercakup ${nf(gizi.kpis.sppg_unik)} SPPG.` : ''
        }`}
      >
        {gizi == null ? (
          <SkeletonMap />
        ) : (
          <EbsIbsLayerMap
            compact
            mode="gizi"
            initialMetric="avg_skor"
            title="Skor Kepatuhan & Cakupan SPPG"
            level={gizi.map.level}
            parentName={gMap.parent?.name}
            regions={gizi.map.regions}
            points={gizi.map.points}
            onDrillDown={(id, name) => setGMap({ level: 'kab', parent: { id, name } })}
            onResetLevel={() => setGMap({ level: 'prov', parent: null })}
          />
        )}
      </MapCol>
    </section>
  )
}
