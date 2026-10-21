'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import SectionCard from '@/components/SectionCard'
import { createReport, fetchDiseases, fetchLocations, type MasterItem } from '@/lib/api'

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-xs focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/15'
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500'
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const empty = () => ({ disease_id: '', location_id: '', report_date: today(), cases: '', deaths: '0', notes: '' })

export default function CaseReportForm() {
  const router = useRouter()
  const [diseases, setDiseases] = useState<MasterItem[]>([])
  const [locations, setLocations] = useState<MasterItem[]>([])
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchDiseases(), fetchLocations()])
      .then(([d, l]) => { setDiseases(d); setLocations(l) })
      .catch((e: Error) => setError(`Failed to load master data: ${e.message}`))
  }, [])

  const set = (k: keyof ReturnType<typeof empty>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent, goToDashboard: boolean) => {
    e.preventDefault()
    setError(null)
    const cases = Number(form.cases)
    const deaths = Number(form.deaths || 0)
    if (!form.disease_id || !form.location_id) return setError('Please choose a disease and a province.')
    if (!Number.isInteger(cases) || cases < 0) return setError('Cases must be a whole number, 0 or more.')
    if (!Number.isInteger(deaths) || deaths < 0) return setError('Deaths must be a whole number, 0 or more.')
    if (deaths > cases) return setError('Deaths cannot exceed cases.')
    if (form.report_date > today()) return setError('Report date cannot be in the future.')
    setSaving(true)
    try {
      await createReport({
        disease_id: Number(form.disease_id), location_id: Number(form.location_id),
        report_date: form.report_date, cases, deaths, notes: form.notes.trim() || undefined,
      })
      toast.success('Case report saved')
      setForm(empty())
      if (goToDashboard) router.push('/')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 md:px-6">
      <SectionCard title="Case Report Form" subtitle="Submit a weekly/daily case report. It appears on the Main Dashboard right away.">
        <form onSubmit={(e) => submit(e, true)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="disease">Disease *</label>
            <select id="disease" className={input} value={form.disease_id} onChange={set('disease_id')} required>
              <option value="">Select disease</option>
              {diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="location">Province *</label>
            <select id="location" className={input} value={form.location_id} onChange={set('location_id')} required>
              <option value="">Select province</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="date">Report date *</label>
            <input id="date" type="date" max={today()} className={input} value={form.report_date} onChange={set('report_date')} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="cases">Cases *</label>
              <input id="cases" type="number" min={0} step={1} className={input} value={form.cases} onChange={set('cases')} required />
            </div>
            <div>
              <label className={labelCls} htmlFor="deaths">Deaths</label>
              <input id="deaths" type="number" min={0} step={1} className={input} value={form.deaths} onChange={set('deaths')} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} htmlFor="notes">Notes</label>
            <textarea id="notes" rows={4} className={input} value={form.notes} onChange={set('notes')} placeholder="Optional: source, health facility, remarks" />
          </div>
          {error ? <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
            <button type="button" disabled={saving} onClick={(e) => submit(e as unknown as React.FormEvent, false)}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Save &amp; add another
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#004b85] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPlus className="h-4 w-4" />}
              Submit report
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  )
}
