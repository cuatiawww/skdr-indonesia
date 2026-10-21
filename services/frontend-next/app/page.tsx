'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ClipboardPlus, FileText, MapPin, Percent, RefreshCw, Skull, Stethoscope } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import MetricCard from '@/components/MetricCard'
import SectionCard from '@/components/SectionCard'
import FilterBar from '@/components/FilterBar'
import ReportsTable from '@/components/ReportsTable'
import {
  fetchDiseases, fetchLocations, fetchReports, fetchSummary,
  type CaseReport, type DashboardSummary, type Filters, type MasterItem,
} from '@/lib/api'

const fmt = (n: number) => n.toLocaleString('en-US')

export default function MainDashboard() {
  const [filters, setFilters] = useState<Filters>({})
  const [diseases, setDiseases] = useState<MasterItem[]>([])
  const [locations, setLocations] = useState<MasterItem[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [latest, setLatest] = useState<CaseReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDiseases().then(setDiseases).catch(() => {})
    fetchLocations().then(setLocations).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([fetchSummary(filters), fetchReports({ ...filters })])
      .then(([s, r]) => { setSummary(s); setLatest(r.slice(0, 10)) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [filters])

  const t = summary?.totals
  const metrics = [
    { label: 'Total Cases', value: t ? fmt(t.cases) : '-', icon: Stethoscope, tone: 'border-blue-100 bg-blue-50 text-[#0060A9]', description: 'Sum of reported cases' },
    { label: 'Total Deaths', value: t ? fmt(t.deaths) : '-', icon: Skull, tone: 'border-red-100 bg-red-50 text-red-600', description: 'Sum of reported deaths' },
    { label: 'CFR', value: t ? `${t.cfr.toFixed(2)}%` : '-', icon: Percent, tone: 'border-amber-100 bg-amber-50 text-amber-600', description: 'Deaths / cases' },
    { label: 'Reports', value: t ? fmt(t.reports) : '-', icon: FileText, tone: 'border-emerald-100 bg-emerald-50 text-emerald-600', description: 'Submitted form entries' },
    { label: 'Provinces', value: t ? fmt(t.locations) : '-', icon: MapPin, tone: 'border-violet-100 bg-violet-50 text-violet-600', description: 'Provinces with reports' },
  ]

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 md:px-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0060A9] via-[#004b85] to-[#102f78] p-6 text-white shadow-sm">
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-black leading-tight tracking-tight sm:text-3xl">Main Dashboard</h1>
            <p className="mt-2 max-w-2xl text-xs font-medium leading-relaxed text-blue-100/90 sm:text-sm">
              Case reports submitted through the SKDR form, summarised by disease, province and date.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md hover:bg-white hover:text-[#0060A9]">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <Link href="/form" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0060A9] shadow-sm hover:bg-blue-50">
              <ClipboardPlus className="h-4 w-4" /> New Report
            </Link>
          </div>
        </div>
      </section>

      <FilterBar value={filters} onChange={setFilters} diseases={diseases} locations={locations} />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Failed to load dashboard: {error}</div>
      ) : null}

      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => <MetricCard key={m.label} {...m} />)}
      </section>

      <SectionCard title="Daily trend" subtitle="Cases and deaths by report date">
        {summary && summary.trend.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="cases" name="Cases" stroke="#0060A9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="deaths" name="Deaths" stroke="#ED2939" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty />
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Cases by disease" subtitle="Top 15 diseases">
          <GroupChart rows={summary?.by_disease || []} />
        </SectionCard>
        <SectionCard title="Cases by province" subtitle="Top 15 provinces">
          <GroupChart rows={summary?.by_location || []} />
        </SectionCard>
      </div>

      <SectionCard
        title="Latest reports"
        subtitle="Last 10 form submissions"
        action={<Link href="/reports" className="text-xs font-extrabold text-[#0060A9] hover:underline">View all reports</Link>}
      >
        {latest.length === 0 ? <Empty /> : <ReportsTable rows={latest} />}
      </SectionCard>
    </div>
  )
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      <Activity className="mx-auto mb-2 h-5 w-5 text-slate-300" />
      No case reports yet. <Link href="/form" className="font-bold text-[#0060A9] hover:underline">Submit the first report</Link>.
    </div>
  )
}

function GroupChart({ rows }: { rows: { name: string; cases: number; deaths: number }[] }) {
  if (rows.length === 0) return <Empty />
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="cases" name="Cases" fill="#0060A9" radius={[0, 4, 4, 0]} />
          <Bar dataKey="deaths" name="Deaths" fill="#ED2939" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

