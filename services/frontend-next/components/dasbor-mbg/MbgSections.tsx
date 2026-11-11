'use client'
// PR 052b: komponen bersama halaman Dasbor MBG — judul bagian bernomor (dengan satu kalimat penjelas) dan
// bagian peta 2 kolom (kiri Keracunan Pangan, kanan Pengawasan Gizi; bertumpuk di layar sempit).
import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'
import type { MapState } from '@/lib/dasbor-mbg-filter'
import { SkeletonMap } from '@/components/ui/Skeleton'
import { EmptyBox, nf } from '@/components/dasbor-mbg/MbgUi'

const EbsIbsLayerMap = dynamic(() => import('@/components/dasbor-ebs-ibs/EbsIbsLayerMap'), { ssr: false, loading: () => <SkeletonMap /> })

/** Judul bagian: nomor, judul pendek, dan satu kalimat bahasa sederhana. */
export function SectionHead({ no, title, desc, id }: { no?: number | string; title: string; desc?: ReactNode; id?: string }) {
  return (
    <div className="flex items-start gap-3 pt-2" id={id} data-testid={id ? `section-${id}` : undefined}>
      {no !== undefined ? <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[11px] font-black text-white">{no}</span> : null}
      <div className="min-w-0">
        <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">{title}</h2>
        {desc ? <p className="mt-0.5 text-xs text-slate-500">{desc}</p> : null}
      </div>
    </div>
  )
}

/** Detail lanjutan yang disembunyikan secara bawaan (mengurangi kepadatan tanpa menghapus panel lama). */
export function MoreDetails({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <details className="group rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3" data-testid={testId}>
      <summary className="cursor-pointer list-none select-none text-xs font-bold [&::-webkit-details-marker]:hidden text-slate-600 hover:text-slate-900">
        <span className="group-open:hidden">▸ Tampilkan</span><span className="hidden group-open:inline">▾ Sembunyikan</span> {label}
      </summary>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  )
}

function MapCol({ tone, title, desc, children, testId }: { tone: 'red' | 'emerald'; title: string; desc: string; children: ReactNode; testId: string }) {
  return (
    <div className="min-w-0 space-y-2" data-testid={testId}>
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

/** Bagian peta lebar penuh, grid 2 kolom: kiri Keracunan Pangan (kejadian/kasus + titik SPPG kejadian), kanan
 * Pengawasan Gizi (skor SOP rata-rata + titik SPPG; oranye = skor < 80 atau F12 BELUM BAIK). */
export default function MbgMapSection({ ker, gizi, kMap, setKMap, gMap, setGMap }: {
  ker: KeracunanDashData | null
  gizi: GiziDashData | null
  kMap: MapState
  setKMap: (m: MapState) => void
  gMap: MapState
  setGMap: (m: MapState) => void
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="mbg-map-section">
      <MapCol tone="red" testId="map-keracunan" title="Peta Keracunan Pangan MBG"
        desc={`Warna wilayah = jumlah kasus; titik = SPPG dengan kejadian (merah tua = ada kematian).${ker ? ` ${nf(ker.kpis.total_kejadian)} kejadian di ${nf(ker.map.regions.length)} wilayah.` : ''}`}>
        {ker == null ? <SkeletonMap /> : (
          <EbsIbsLayerMap compact mode="keracunan" title="Kejadian & kasus per wilayah" level={ker.map.level} parentName={kMap.parent?.name}
            regions={ker.map.regions} points={ker.map.points}
            onDrillDown={(id, name) => setKMap({ level: 'kab', parent: { id, name } })} onResetLevel={() => setKMap({ level: 'prov', parent: null })} />
        )}
      </MapCol>
      <MapCol tone="emerald" testId="map-pengawasan" title="Peta Pengawasan Gizi MBG"
        desc={`Warna wilayah = rata-rata skor SOP (F3–F11); titik = SPPG diawasi (oranye = skor < 80 atau F12 BELUM BAIK).${gizi ? ` ${nf(gizi.kpis.sppg_unik)} SPPG diawasi.` : ''}`}>
        {gizi == null ? <SkeletonMap /> : (
          <EbsIbsLayerMap compact mode="gizi" initialMetric="avg_skor" title="Skor & kesimpulan pengawasan" level={gizi.map.level} parentName={gMap.parent?.name}
            regions={gizi.map.regions} points={gizi.map.points}
            onDrillDown={(id, name) => setGMap({ level: 'kab', parent: { id, name } })} onResetLevel={() => setGMap({ level: 'prov', parent: null })} />
        )}
      </MapCol>
    </section>
  )
}
