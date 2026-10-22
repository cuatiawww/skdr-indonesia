'use client'
// PR 021: halaman Klaster (tidak di menu; isi sama dengan seksi Klaster di Dasbor Utama).
import PageHeader from '@/components/PageHeader'
import SkdrFilterBar, { filterParams } from '@/components/SkdrFilterBar'
import KlasterSection from '@/components/dashboard/KlasterSection'
import { useApiFilters } from '@/lib/use-api-filters'

export default function KlasterPage() {
  const s = useApiFilters<unknown>('/api/v1/master/disease-categories')
  const a = s.applied
  const query = { ...filterParams(a), start_year: a.startYear, start_week: a.startWeek, end_year: a.endYear, end_week: a.endWeek }
  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Dasbor" title="Klaster" subtitle="Klaster kejadian luar biasa (KLB) dari Alert SKDR mingguan dan laporan EBS yang ditandai KLB atau klaster penyakit tidak lazim." />
      <SkdrFilterBar value={s.filters} onChange={s.setFilters} onApply={(f) => { s.setFilters(f); s.setApplied(f) }} showKategori />
      <KlasterSection query={query} showHeader={false} />
    </div>
  )
}
