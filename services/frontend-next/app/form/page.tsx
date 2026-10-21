'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardPlus, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import {
  createCaseReport, fetchFormCountries, fetchFormDiseases, fetchFormLocations,
  type MasterCountry, type MasterDisease, type MasterLocation,
} from '@/lib/skdr-api'

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/15'
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500'
const card = 'border border-[#cfe0f1] bg-white p-5'
const radius = { borderRadius: '17px 17px 22px 17px' }
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const OTHER = 'other'
const empty = (countryId = '') => ({
  disease_id: '', country_id: countryId, location_id: '', location_name: '', latitude: '', longitude: '',
  report_date: today(), cases: '', deaths: '0', notes: '', is_reviewed: false,
})

export default function CaseReportFormPage() {
  const router = useRouter()
  const [diseases, setDiseases] = useState<MasterDisease[]>([])
  const [countries, setCountries] = useState<MasterCountry[]>([])
  const [locations, setLocations] = useState<MasterLocation[]>([])
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchFormDiseases(), fetchFormCountries()])
      .then(([d, c]) => {
        setDiseases(d)
        setCountries(c)
        const id = c.find((x) => x.iso2 === 'ID')?.id || c[0]?.id || ''
        setForm((f) => ({ ...f, country_id: f.country_id || id }))
      })
      .catch((e: Error) => setError(`Failed to load master data: ${e.message}`))
  }, [])

  const country = useMemo(() => countries.find((c) => c.id === form.country_id), [countries, form.country_id])
  useEffect(() => {
    if (!country) return
    fetchFormLocations(country.iso2).then(setLocations).catch(() => setLocations([]))
  }, [country])

  const set = (k: keyof ReturnType<typeof empty>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const pickLocation = (value: string) => {
    const loc = locations.find((l) => String(l.id) === value)
    setForm((f) => ({
      ...f,
      location_id: value,
      location_name: loc ? loc.name : '',
      latitude: loc?.latitude != null ? String(loc.latitude) : '',
      longitude: loc?.longitude != null ? String(loc.longitude) : '',
    }))
  }

  const submit = async (goToDashboard: boolean) => {
    setError(null)
    const cases = Number(form.cases)
    const deaths = Number(form.deaths || 0)
    const lat = form.latitude.trim() === '' ? null : Number(form.latitude)
    const lng = form.longitude.trim() === '' ? null : Number(form.longitude)
    if (!form.disease_id || !form.country_id) return setError('Please choose a disease and a country.')
    if (!form.location_id && !form.location_name.trim()) return setError('Choose a location or type a location name.')
    if (!Number.isInteger(cases) || cases < 0) return setError('Cases must be a whole number, 0 or more.')
    if (!Number.isInteger(deaths) || deaths < 0) return setError('Deaths must be a whole number, 0 or more.')
    if (deaths > cases) return setError('Deaths cannot exceed cases.')
    if ((lat === null) !== (lng === null)) return setError('Fill both latitude and longitude, or neither.')
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return setError('Latitude must be between -90 and 90.')
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return setError('Longitude must be between -180 and 180.')
    if (form.report_date > today()) return setError('Report date cannot be in the future.')
    setSaving(true)
    try {
      await createCaseReport({
        disease_id: Number(form.disease_id), country_id: form.country_id,
        location_id: form.location_id && form.location_id !== OTHER ? Number(form.location_id) : null,
        location_name: form.location_name.trim() || undefined, latitude: lat, longitude: lng,
        report_date: form.report_date, cases, deaths, notes: form.notes.trim() || undefined, is_reviewed: form.is_reviewed,
      })
      toast.success('Case report saved')
      setForm(empty(form.country_id))
      if (goToDashboard) router.push('/main-dashboard')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">Case Report Form</h1>
          <p className="mt-1 text-sm text-slate-600">Submit a case report. It appears on the Main Dashboard (cards, signals and map) right away.</p>
        </div>
      </section>

      <form
        onSubmit={(e) => { e.preventDefault(); void submit(true) }}
        className={`${card} grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4`}
        style={radius}
      >
        <div>
          <label className={labelCls} htmlFor="disease">Disease *</label>
          <select id="disease" className={input} value={form.disease_id} onChange={set('disease_id')} required>
            <option value="">Select disease</option>
            {diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="country">Country *</label>
          <select id="country" className={input} value={form.country_id}
            onChange={(e) => setForm((f) => ({ ...f, country_id: e.target.value, location_id: '', location_name: '', latitude: '', longitude: '' }))} required>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="location">Location (province) *</label>
          <select id="location" className={input} value={form.location_id} onChange={(e) => pickLocation(e.target.value)}>
            <option value="">Select location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value={OTHER}>Other (type below)</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="locname">Location name</label>
          <input id="locname" className={input} value={form.location_name} onChange={set('location_name')} placeholder="City, district or health facility" />
        </div>
        <div>
          <label className={labelCls} htmlFor="lat">Latitude</label>
          <input id="lat" inputMode="decimal" className={input} value={form.latitude} onChange={set('latitude')} placeholder="-6.2088" />
        </div>
        <div>
          <label className={labelCls} htmlFor="lng">Longitude</label>
          <input id="lng" inputMode="decimal" className={input} value={form.longitude} onChange={set('longitude')} placeholder="106.8456" />
        </div>
        <div>
          <label className={labelCls} htmlFor="date">Report date *</label>
          <input id="date" type="date" max={today()} className={input} value={form.report_date} onChange={set('report_date')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="cases">Cases *</label>
            <input id="cases" type="number" min={0} step={1} className={input} value={form.cases} onChange={set('cases')} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="deaths">Deaths</label>
            <input id="deaths" type="number" min={0} step={1} className={input} value={form.deaths} onChange={set('deaths')} />
          </div>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <label className={labelCls} htmlFor="notes">Notes</label>
          <textarea id="notes" rows={3} className={input} value={form.notes} onChange={set('notes')} placeholder="Optional: source, remarks" />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
            <input type="checkbox" checked={form.is_reviewed} onChange={(e) => setForm((f) => ({ ...f, is_reviewed: e.target.checked }))} />
            Reviewed (confirmed by an analyst)
          </label>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 md:col-span-2 xl:col-span-4">
          <MapPin className="h-3.5 w-3.5 text-[#0060A9]" />
          Choosing a province fills its capital coordinates; edit them for a more exact point. Reports without coordinates are counted as Unmapped.
        </p>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2 xl:col-span-4">{error}</div> : null}
        <div className="flex flex-wrap justify-end gap-2 md:col-span-2 xl:col-span-4">
          <button type="button" disabled={saving} onClick={() => void submit(false)}
            className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100 disabled:opacity-60">
            Save &amp; add another
          </button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#0060A9] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#004b85] disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPlus className="h-4 w-4" />}
            Submit report
          </button>
        </div>
      </form>
    </div>
  )
}
