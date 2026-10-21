'use client'

import { useEffect, useState } from 'react'
import SectionCard from '@/components/SectionCard'
import FilterBar from '@/components/FilterBar'
import ReportsTable from '@/components/ReportsTable'
import { fetchDiseases, fetchLocations, fetchReports, type CaseReport, type Filters, type MasterItem } from '@/lib/api'

export default function CaseReportsPage() {
  const [filters, setFilters] = useState<Filters>({})
  const [diseases, setDiseases] = useState<MasterItem[]>([])
  const [locations, setLocations] = useState<MasterItem[]>([])
  const [rows, setRows] = useState<CaseReport[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDiseases().then(setDiseases).catch(() => {})
    fetchLocations().then(setLocations).catch(() => {})
  }, [])
  useEffect(() => {
    fetchReports({ ...filters }).then(setRows).catch((e: Error) => setError(e.message))
  }, [filters])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 md:px-6">
      <FilterBar value={filters} onChange={setFilters} diseases={diseases} locations={locations} />
      <SectionCard title="Case Reports" subtitle={`${rows.length} report(s), newest first (max 100)`}>
        {error ? <p className="text-sm text-red-600">{error}</p> : rows.length === 0 ? <p className="text-sm text-slate-500">No reports found.</p> : <ReportsTable rows={rows} />}
      </SectionCard>
    </div>
  )
}
