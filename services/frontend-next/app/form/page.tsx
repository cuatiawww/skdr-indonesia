'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardPlus, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import {
  createCaseReport, fetchFormDiseases, fetchKabkota, fetchProvinces,
  type MasterDisease, type MasterKabkota, type MasterProvince,
} from '@/lib/skdr-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/15 disabled:bg-slate-50 disabled:text-slate-400'
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500'
const card = 'border border-[#cfe0f1] bg-white p-5'
const radius = { borderRadius: '17px 17px 22px 17px' }
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const empty = () => ({
  disease_id: '', province_id: '', kabkota_id: '', location_name: '', latitude: '', longitude: '',
  report_date: today(), cases: '', deaths: '0', notes: '', is_reviewed: false,
})
const coord = (v: number | null | undefined) => (v == null ? '' : String(v))

export default function CaseReportFormPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [diseases, setDiseases] = useState<MasterDisease[]>([])
  const [provinces, setProvinces] = useState<MasterProvince[]>([])
  const [kabkota, setKabkota] = useState<MasterKabkota[]>([])
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchFormDiseases(), fetchProvinces()])
      .then(([d, p]) => { setDiseases(d); setProvinces(p) })
      .catch((e: Error) => setError(t('skdr.form.loadFailed', { error: e.message })))
  }, [t])

  useEffect(() => {
    if (!form.province_id) { setKabkota([]); return }
    fetchKabkota(Number(form.province_id)).then(setKabkota).catch(() => setKabkota([]))
  }, [form.province_id])

  const set = (k: keyof ReturnType<typeof empty>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  // Provinsi -> its centroid; Kab/Kota -> its centroid (master data, editable).
  const pickProvince = (value: string) => {
    const p = provinces.find((x) => String(x.id) === value)
    setForm((f) => ({ ...f, province_id: value, kabkota_id: '', latitude: coord(p?.latitude), longitude: coord(p?.longitude) }))
  }
  const pickKabkota = (value: string) => {
    const k = kabkota.find((x) => String(x.id) === value)
    const p = provinces.find((x) => String(x.id) === form.province_id)
    setForm((f) => ({
      ...f, kabkota_id: value,
      latitude: coord(k ? k.latitude : p?.latitude), longitude: coord(k ? k.longitude : p?.longitude),
    }))
  }

  const submit = async (goToDashboard: boolean) => {
    setError(null)
    const cases = Number(form.cases)
    const deaths = Number(form.deaths || 0)
    const lat = form.latitude.trim() === '' ? null : Number(form.latitude)
    const lng = form.longitude.trim() === '' ? null : Number(form.longitude)
    if (!form.disease_id) return setError(t('skdr.form.errDisease'))
    if (!form.province_id) return setError(t('skdr.form.errProvince'))
    if (form.cases.trim() === '' || !Number.isInteger(cases) || cases < 0) return setError(t('skdr.form.errCases'))
    if (!Number.isInteger(deaths) || deaths < 0) return setError(t('skdr.form.errDeaths'))
    if (deaths > cases) return setError(t('skdr.form.errDeathsGtCases'))
    if ((lat === null) !== (lng === null)) return setError(t('skdr.form.errLatLngPair'))
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return setError(t('skdr.form.errLat'))
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return setError(t('skdr.form.errLng'))
    if (form.report_date > today()) return setError(t('skdr.form.errFutureDate'))
    setSaving(true)
    try {
      await createCaseReport({
        disease_id: Number(form.disease_id), province_id: Number(form.province_id),
        kabkota_id: form.kabkota_id ? Number(form.kabkota_id) : null,
        location_name: form.location_name.trim() || undefined, latitude: lat, longitude: lng,
        report_date: form.report_date, cases, deaths, notes: form.notes.trim() || undefined, is_reviewed: form.is_reviewed,
      })
      toast.success(t('skdr.form.saved'))
      setForm(empty())
      if (goToDashboard) router.push('/main-dashboard')
    } catch (err) {
      setError(t('skdr.form.saveFailed', { error: (err as Error).message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">{t('skdr.form.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('skdr.form.subtitle')}</p>
        </div>
      </section>

      <form
        onSubmit={(e) => { e.preventDefault(); void submit(true) }}
        className={`${card} grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4`}
        style={radius}
        noValidate
      >
        <div>
          <label className={labelCls} htmlFor="disease">{t('skdr.form.disease')} *</label>
          <select id="disease" className={input} value={form.disease_id} onChange={set('disease_id')}>
            <option value="">{t('skdr.form.chooseDisease')}</option>
            {diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="province">{t('skdr.form.province')} *</label>
          <select id="province" className={input} value={form.province_id} onChange={(e) => pickProvince(e.target.value)}>
            <option value="">{t('skdr.form.chooseProvince')}</option>
            {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="kabkota">{t('skdr.form.kabkota')}</label>
          <select id="kabkota" className={input} value={form.kabkota_id} disabled={!form.province_id} onChange={(e) => pickKabkota(e.target.value)}>
            <option value="">{form.province_id ? t('skdr.form.chooseKabkota') : t('skdr.form.chooseProvinceFirst')}</option>
            {kabkota.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="locname">{t('skdr.form.locationDetail')}</label>
          <input id="locname" className={input} value={form.location_name} onChange={set('location_name')} placeholder={t('skdr.form.locationDetailPlaceholder')} />
        </div>
        <div>
          <label className={labelCls} htmlFor="lat">{t('skdr.form.latitude')}</label>
          <input id="lat" inputMode="decimal" className={input} value={form.latitude} onChange={set('latitude')} placeholder="-6.2088" />
        </div>
        <div>
          <label className={labelCls} htmlFor="lng">{t('skdr.form.longitude')}</label>
          <input id="lng" inputMode="decimal" className={input} value={form.longitude} onChange={set('longitude')} placeholder="106.8456" />
        </div>
        <div>
          <label className={labelCls} htmlFor="date">{t('skdr.form.reportDate')} *</label>
          <input id="date" type="date" max={today()} className={input} value={form.report_date} onChange={set('report_date')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="cases">{t('skdr.form.cases')} *</label>
            <input id="cases" type="number" min={0} step={1} className={input} value={form.cases} onChange={set('cases')} />
          </div>
          <div>
            <label className={labelCls} htmlFor="deaths">{t('skdr.form.deaths')}</label>
            <input id="deaths" type="number" min={0} step={1} className={input} value={form.deaths} onChange={set('deaths')} />
          </div>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <label className={labelCls} htmlFor="notes">{t('skdr.form.notes')}</label>
          <textarea id="notes" rows={3} className={input} value={form.notes} onChange={set('notes')} placeholder={t('skdr.form.notesPlaceholder')} />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
            <input type="checkbox" checked={form.is_reviewed} onChange={(e) => setForm((f) => ({ ...f, is_reviewed: e.target.checked }))} />
            {t('skdr.form.reviewed')}
          </label>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 md:col-span-2 xl:col-span-4">
          <MapPin className="h-3.5 w-3.5 text-[#0060A9]" />
          {t('skdr.form.coordHint')}
        </p>
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2 xl:col-span-4">{error}</div> : null}
        <div className="flex flex-wrap justify-end gap-2 md:col-span-2 xl:col-span-4">
          <button type="button" disabled={saving} onClick={() => void submit(false)}
            className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100 disabled:opacity-60">
            {t('skdr.form.saveAndAdd')}
          </button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#0060A9] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#004b85] disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPlus className="h-4 w-4" />}
            {t('skdr.form.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}
