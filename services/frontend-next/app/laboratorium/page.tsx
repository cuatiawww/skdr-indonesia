'use client'
// PR 021: halaman Laboratorium (tidak di menu; isi sama dengan seksi Laboratorium di Dasbor Utama).
import PageHeader from '@/components/PageHeader'
import SkdrFilterBar, { filterParams } from '@/components/SkdrFilterBar'
import LabSection from '@/components/dashboard/LabSection'
import { useApiFilters } from '@/lib/use-api-filters'

export default function LaboratoriumPage() {
  const s = useApiFilters<unknown>('/api/v1/master/disease-categories')
  const a = s.applied
  const query = { ...filterParams(a), start_year: a.startYear, start_week: a.startWeek, end_year: a.endYear, end_week: a.endWeek }
  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Dasbor" title="Laboratorium" subtitle="Pemeriksaan spesimen dan hasil laboratorium yang dilaporkan unit pelapor dalam Alert SKDR mingguan, ditambah laporan EBS yang menyebut hasil laboratorium." />
      <SkdrFilterBar value={s.filters} onChange={s.setFilters} onApply={(f) => { s.setFilters(f); s.setApplied(f) }} showKategori />
      <LabSection query={query} showHeader={false} />
    </div>
  )
}
