'use client'
// PR 033: wizard Pengawasan Gizi MBG — identitas kunjungan dan Formulir 1–13. Pola sama dengan Form EBS/IBS/Individu:
// stepper "n/m wajib" + lompat ke isian belum valid, autosave draf 1,5 dtk, cadangan lokal, konfirmasi tinggalkan halaman, Tinjau & Kirim.
// Kunjungan baru TIDAK dibuat otomatis sebelum identitas valid (atau pengguna menekan Simpan Draf) — mencegah draf kosong misterius.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, ClipboardList, History, Loader2, LockOpen, Pencil, RotateCcw, Save, Send, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/pe-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useAuth } from '@/lib/skdr-auth'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { isFilled, isVisible, overall, stepStats, visibleFields, type Data, type FieldDef, type Issue, type Refs, type StepDef } from '@/lib/laporan/engine'
import { lapFetch, useGeo } from '@/lib/laporan/api'
import { FieldView, type FieldCtx } from '@/components/laporan/LaporanFields'
import { Stepper } from '@/components/laporan/LaporanWizard'
import { defFor, type MbgDef } from '@/lib/pengawasan-gizi/forms'
import { FORM_TITLES } from '@/lib/pengawasan-gizi/naskah'
import { evaluateForm, f9Item, sasaranOf, sisaItem, validateIdentitas, type Eval } from '@/lib/pengawasan-gizi/rules'
import { MBG_API, MBG_HREF, mbgFetch, STATUS_CLS, STATUS_LABEL, type MbgForm, type MbgFormBundle, type MbgKunjungan, type MbgLampiran } from '@/lib/pengawasan-gizi/api'
import { KesBadge, MbgFieldView, type MbgCtx } from './MbgFields'

const card = 'rounded-2xl border border-slate-200 bg-white shadow-xs'
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
const localKey = (kid: number | null, key: string) => `skdr-mbg-local:${kid ?? 'baru'}:${key}`
export const EVENT_LABEL: Record<string, string> = {
  dibuat: 'Kunjungan dibuat', dikirim: 'Kunjungan dikirim', dihapus: 'Draf dihapus', form_dikirim: 'Formulir dikirim', form_dibuka: 'Formulir dibuka kembali',
}
const PREFILL_KEYS = ['provinsi_id', 'kabkota_id', 'kecamatan', 'kecamatan_nama', 'unit_pelapor', 'unit_kode']

/** drop values of hidden fields + computed keys before sending */
function prune(def: MbgDef, d: Data): Data {
  const out: Data = {}
  Object.entries(d).forEach(([k, v]) => { if (!k.startsWith('_')) out[k] = v })
  def.steps.forEach((st) => st.sections.forEach((se) => se.fields.forEach((f) => {
    if (f.type !== 'mbg' && (!isVisible(se, d) || !isVisible(f, d)) && f.key in out) delete out[f.key]
  })))
  return out
}

export default function MbgWizard({ kid, target, viewOnly = false }: { kid: number | null; target: string; viewOnly?: boolean }) {
  const def = defFor(target)
  const router = useRouter()
  const { can, user } = useAuth()
  const geo = useGeo()
  const isId = target === 'identitas'
  const no = def?.no ?? 0
  const [refs, setRefs] = useState<Refs | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [kun, setKun] = useState<MbgKunjungan | null>(null)
  const [form, setForm] = useState<MbgForm | null>(null)
  const [lampiran, setLampiran] = useState<MbgLampiran[]>([])
  const [data, setData] = useState<Data>({})
  const dataRef = useRef<Data>({})
  const [ready, setReady] = useState(false)
  const [saveState, setSaveStateRaw] = useState<SaveState>('idle')
  const saveStateRef = useRef<SaveState>('idle')
  const setSaveState = (s: SaveState) => { saveStateRef.current = s; setSaveStateRaw(s) }
  const [stepIdx, setStepIdx] = useState(0)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [shownSteps, setShownSteps] = useState<Set<string>>(new Set())
  const [auto, setAuto] = useState<Record<string, string>>({})
  const [localDraft, setLocalDraft] = useState<{ data: Data; at: string } | null>(null)
  const [serverErrs, setServerErrs] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)
  const kidRef = useRef<number | null>(kid)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<number | null> | null>(null)
  const dirty = useRef(false)
  const pendingFocus = useRef<string | null>(null)
  const lastJump = useRef<string | null>(null)

  const kunEditable = !kun || kun.status === 'draf'
  const editable = !viewOnly && can('pe_input') && kunEditable && (isId || (!!form && form.status !== 'dikirim'))

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!def) return
    let off = false
    ;(async () => {
      try {
        const r = await lapFetch<{ data: Refs }>('/api/v1/laporan-ref/opsi')
        if (off) return
        setRefs(r.data)
        let d: Data = {}
        let local: { data: Data; at: string } | null = null
        try { local = JSON.parse(localStorage.getItem(localKey(kid, target)) || 'null') } catch {}
        if (isId && !kid) {
          geo.loadProvinces()
          const p = await mbgFetch<{ data: { nama: string; last: Data; last_no: string | null } }>(`${MBG_API}-ref/prefill`).catch(() => null)
          const a: Record<string, string> = {}
          const last = p?.data.last || {}
          PREFILL_KEYS.forEach((k) => { if (isFilled(last[k])) { d[k] = last[k]; a[k] = `Dari kunjungan terakhir Anda (${p?.data.last_no})` } })
          if (p?.data.nama) { d.nama_tpg = p.data.nama; a.nama_tpg = 'Dari akun yang sedang login' }
          setAuto(a)
          if (local && isFilled(local.data)) setLocalDraft(local)
        } else if (isId) {
          geo.loadProvinces()
          const j = await mbgFetch<{ data: MbgKunjungan }>(`${MBG_API}/${kid}`)
          if (off) return
          setKun(j.data); d = { ...j.data.data }
          if (local && j.data.status === 'draf' && (!j.data.updated_at || local.at > j.data.updated_at)) setLocalDraft(local)
        } else {
          const j = await mbgFetch<{ data: MbgFormBundle }>(`${MBG_API}/${kid}/form/${no}`)
          if (off) return
          setKun(j.data.kunjungan); setForm(j.data.form); setLampiran(j.data.lampiran.map((l) => ({ ...l, form_no: no })))
          d = { ...j.data.form.data }
          delete d._hasil
          if (local && j.data.form.status !== 'dikirim' && (!j.data.form.updated_at || local.at > j.data.form.updated_at)) setLocalDraft(local)
        }
        if (isId) d.jenis_unit = 'Puskesmas'
        dataRef.current = d; setData(d); setReady(true)
      } catch (e) {
        if (!off) setLoadErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { off = true }
  }, [kid, target]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isId) return
    if (data.provinsi_id) geo.loadKab(String(data.provinsi_id))
    if (data.kabkota_id) geo.loadKec(String(data.kabkota_id))
  }, [isId, data.provinsi_id, data.kabkota_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── validation ────────────────────────────────────────────────────────────
  const sources = useMemo(() => (kun?.forms || []).map((f) => ({ form_no: f.form_no, status: f.status, kesimpulan: f.kesimpulan })), [kun])
  const ev: Eval = useMemo(() => {
    if (isId) { const r = validateIdentitas(data, refs?.today || '9999-12-31'); return { ...r, skor: null, kesimpulan: null, hasil: {} } }
    return evaluateForm(no, data, sources)
  }, [isId, no, data, refs, sources])

  // ── save ──────────────────────────────────────────────────────────────────
  const writeLocal = () => { try { localStorage.setItem(localKey(kidRef.current, target), JSON.stringify({ data: dataRef.current, at: new Date().toISOString().slice(0, 19).replace('T', ' ') })) } catch {} }
  const clearLocal = () => { try { localStorage.removeItem(localKey(kidRef.current, target)); localStorage.removeItem(localKey(null, target)) } catch {} }

  const save = useCallback(async (force = false): Promise<number | null> => {
    if (!def) return null
    if (inflight.current) { await inflight.current; if (!dirty.current) return kidRef.current }
    // new visit: wait until the identitas is valid (or the user explicitly saves)
    if (isId && !kidRef.current && !force && validateIdentitas(dataRef.current, refs?.today || '9999-12-31').errors.length) {
      writeLocal(); setSaveState('dirty'); return null
    }
    const run = (async () => {
      dirty.current = false
      setSaveState('saving')
      const body = { data: prune(def, dataRef.current) }
      try {
        if (isId) {
          const j = kidRef.current
            ? await mbgFetch<{ data: MbgKunjungan }>(`${MBG_API}/${kidRef.current}`, { method: 'PUT', body })
            : await mbgFetch<{ data: MbgKunjungan }>(MBG_API, { method: 'POST', body })
          const created = !kidRef.current
          kidRef.current = j.data.id
          setKun(j.data)
          if (created) { try { localStorage.removeItem(localKey(null, target)) } catch {} ; window.history.replaceState(null, '', `${PUBLIC_BASE_PATH}${MBG_HREF}/${j.data.id}/identitas`) }
        } else {
          const j = await mbgFetch<{ data: MbgFormBundle }>(`${MBG_API}/${kidRef.current}/form/${no}`, { method: 'PUT', body })
          setKun(j.data.kunjungan); setForm(j.data.form)
        }
        clearLocal()
        setSaveState(dirty.current ? 'dirty' : 'saved')
        return kidRef.current
      } catch (e) {
        dirty.current = true
        writeLocal()
        setSaveState('error')
        toast.error(`Draf gagal disimpan: ${e instanceof Error ? e.message : String(e)}. Isian disimpan sementara di perangkat ini.`)
        return null
      }
    })()
    inflight.current = run
    try { return await run } finally { inflight.current = null }
  }, [def, isId, no, target, refs]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: Data) => {
    dataRef.current = next; setData(next); dirty.current = true; setSaveState('dirty'); setServerErrs([])
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { save() }, 1500)
  }
  const setKey = (key: string, v: any, extra: Data = {}, resets: string[] = []) => {
    if (!editable) return
    const cur = dataRef.current
    const next: Data = { ...cur, [key]: v, ...extra }
    if (cur[key] !== v) resets.forEach((k) => { if (!(k in extra)) next[k] = null })
    if (auto[key]) setAuto((a) => { const b = { ...a }; delete b[key]; return b })
    commit(next)
  }
  const flush = async (force = false) => { if (timer.current) clearTimeout(timer.current); return dirty.current || !kidRef.current || force ? save(force) : kidRef.current }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => {
    const risky = () => ['dirty', 'saving', 'error'].includes(saveStateRef.current)
    const before = (e: BeforeUnloadEvent) => { if (risky()) { e.preventDefault(); e.returnValue = '' } }
    const click = (e: MouseEvent) => {
      if (!risky() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.origin !== window.location.origin) return
      if (!window.confirm('Ada perubahan yang belum tersimpan. Tetap tinggalkan halaman ini?')) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', before)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', before); document.removeEventListener('click', click, true) }
  }, [])

  // ── progress ──────────────────────────────────────────────────────────────
  const errors = useMemo(() => [...ev.errors, ...serverErrs.filter((s) => !ev.errors.some((e) => e.key === s.key && e.msg === s.msg))], [ev, serverErrs])
  const warnings = ev.warnings
  const steps = def?.steps || []
  const stats = useMemo(() => stepStats({ steps }, data, errors), [steps, data, errors])
  const tot = overall(stats)
  const step = steps[stepIdx]
  const show = (k: string) => touched.has(k) || (!!step && shownSteps.has(step.id)) || shownSteps.has('*')
  const touch = (k: string) => setTouched((s) => (s.has(k) ? s : new Set(s).add(k)))

  useEffect(() => {
    const k = pendingFocus.current
    if (!k) return
    pendingFocus.current = null
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(k)}"]`) || document.querySelector<HTMLElement>(`[data-field="${CSS.escape(k.replace(/_.*$/, ''))}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('pe-flash'); void el.offsetWidth; el.classList.add('pe-flash')
      el.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), textarea, button[role=combobox], button[role=radio]')?.focus({ preventScroll: true })
    })
  })

  const goto = (i: number) => {
    if (step) setShownSteps((s) => new Set(s).add(step.id))
    if (dirty.current) flush()
    setStepIdx(i); lastJump.current = null
    window.requestAnimationFrame(() => document.getElementById('mbg-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const focusIssue = (iss: Issue) => {
    const si = steps.findIndex((s) => s.id === iss.step)
    setShownSteps((s) => new Set(s).add(iss.step))
    pendingFocus.current = iss.key
    lastJump.current = iss.key
    if (si >= 0 && si !== stepIdx) setStepIdx(si); else setTouched((s) => new Set(s))
  }
  const jumpNext = () => {
    if (!errors.length) { toast.success('Semua isian sudah valid'); return }
    const order = errors.map((i) => ({ ...i, si: steps.findIndex((s) => s.id === i.step) })).sort((a, b) => a.si - b.si)
    const last = order.findIndex((i) => i.key === lastJump.current)
    const after = order.filter((i, n) => (last >= 0 ? n > last : i.si >= stepIdx))
    focusIssue(after.find((i) => i.key !== lastJump.current) || order[0])
  }

  const finishIdentitas = async () => {
    setShownSteps(new Set(['*']))
    if (errors.length) { toast.error(`Masih ada ${errors.length} isian identitas yang belum valid`); jumpNext(); return }
    setBusy(true)
    try {
      const id = await flush(true)
      if (id) { toast.success('Identitas kunjungan tersimpan'); router.push(`${MBG_HREF}/${id}`) }
    } finally { setBusy(false) }
  }
  const kirimForm = async () => {
    setShownSteps(new Set(['*']))
    if (errors.length) { toast.error(`Masih ada ${errors.length} isian yang belum valid`); jumpNext(); return }
    if (!window.confirm(`Kirim ${def?.title}? Setelah dikirim formulir terkunci (dapat dibuka kembali selama kunjungan masih draf).`)) return
    setBusy(true)
    try {
      await flush(true)
      const j = await mbgFetch<{ data: MbgFormBundle }>(`${MBG_API}/${kidRef.current}/form/${no}/kirim`, { method: 'POST' })
      setKun(j.data.kunjungan); setForm(j.data.form); dirty.current = false; setSaveState('saved')
      toast.success(`Formulir ${no} terkirim — ${j.data.form.kesimpulan}`)
      router.push(`${MBG_HREF}/${kidRef.current}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.body?.data?.form) { setForm(e.body.data.form); setServerErrs(e.body.data.form.errors || []) }
      toast.error(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  const bukaKembali = async () => {
    if (!window.confirm(`Buka kembali Formulir ${no} untuk diperbaiki?${no >= 3 && no <= 11 ? ` Rekap Formulir ${no <= 9 ? 12 : 13} yang sudah dikirim ikut dibuka kembali.` : ''}`)) return
    setBusy(true)
    try {
      const j = await mbgFetch<{ data: MbgFormBundle }>(`${MBG_API}/${kidRef.current}/form/${no}/buka`, { method: 'POST' })
      setKun(j.data.kunjungan); setForm(j.data.form)
      toast.success(`Formulir ${no} dibuka kembali (draf)`)
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (!def) return <div className="w-full p-8 text-sm text-red-600">Formulir tidak dikenal.</div>
  if (loadErr) return <div className="w-full p-8 text-sm text-red-600">Gagal memuat formulir: {loadErr}</div>
  if (!refs || !ready) return <SkeletonDetail />

  const errMap: Record<string, string[]> = {}
  errors.forEach((i) => { (errMap[i.key] ||= []).push(i.msg) })
  const warnMap: Record<string, string[]> = {}
  warnings.forEach((i) => { (warnMap[i.key] ||= []).push(i.msg) })
  const fctx: FieldCtx = {
    jenis: 'ebs', refs, data, readOnly: !editable, geo, no: kun?.no_kunjungan || null, recordId: kidRef.current, errs: errMap, warns: warnMap, show, touch,
    set: (f: FieldDef, v: any, extra: Data = {}) => setKey(f.key, v, extra, f.resets || []),
    patch: (p: Data) => { if (editable) commit({ ...dataRef.current, ...p }) },
    auto, lampiran: [], setLampiran: () => {}, ensureSaved: () => flush(), reported: [],
  }
  const mctx: MbgCtx | null = kun ? {
    no, kid: kun.id, data, readOnly: !editable, errors, warnings, show, touch, set: (k, v, extra) => setKey(k, v, extra), ev, kunjungan: kun, lampiran,
    setLampiran, limits: refs.lampiran,
  } : null
  const status = isId ? (kun ? kun.status : 'baru') : form?.status || 'baru'
  const last = stepIdx === steps.length - 1
  const prevNo = no > 1 ? no - 1 : null
  const nextNo = no && no < 13 ? no + 1 : null

  return (
    <div className="w-full space-y-5 bg-page px-3 py-5 pb-24 sm:px-6 sm:py-6 md:pb-6 lg:px-8">
      <header className="skdr-section-head flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" data-testid="page-header">
        <div className="flex items-center gap-3">
          <Link href={kun ? `${MBG_HREF}/${kun.id}` : MBG_HREF} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title={kun ? 'Kembali ke kunjungan' : 'Kembali ke daftar'}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="skdr-eyebrow">Pengawasan Gizi MBG{kun ? ` · ${kun.no_kunjungan}` : ''}</div>
            <h1 className="skdr-section-title">{isId && !kun ? 'Kunjungan Baru' : def.title}</h1>
            <p className="skdr-section-desc">
              {kun ? <>{kun.data.nama_sppg || 'SPPG belum diisi'}{kun.data.tanggal ? ` · ${kun.data.tanggal}` : ''}</> : 'Draf dibuat setelah identitas lengkap atau saat Simpan Draf ditekan'}
              {' · '}<span className={badge(STATUS_CLS[status] || '')}>{STATUS_LABEL[status] || status}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-500" aria-live="polite">
            {saveState === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Menyimpan…</span>}
            {saveState === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Draf tersimpan</span>}
            {saveState === 'dirty' && (isId && !kidRef.current ? 'Lengkapi identitas — draf belum dibuat' : 'Belum tersimpan…')}
            {saveState === 'error' && <span className="text-red-600">Gagal menyimpan (tersimpan sementara di perangkat)</span>}
            {saveState === 'idle' && !editable && 'Hanya baca'}
          </span>
          {editable && (
            <button onClick={() => flush(true)} disabled={saveState === 'saving'} data-testid="mbg-save"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Simpan Draf
            </button>
          )}
          {!isId && form?.status === 'dikirim' && kunEditable && can('pe_input') && !viewOnly && (
            <button onClick={bukaKembali} disabled={busy} data-testid="mbg-buka" className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
              <LockOpen className="h-3.5 w-3.5" /> Buka kembali
            </button>
          )}
        </div>
      </header>

      {localDraft && editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
          <span className="inline-flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Ada isian yang belum sempat tersimpan ke server ({localDraft.at}).</span>
          <span className="flex gap-2">
            <button className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white" onClick={() => { commit(isId ? { ...localDraft.data, jenis_unit: 'Puskesmas' } : { ...localDraft.data }); setLocalDraft(null) }}>Pulihkan</button>
            <button className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 font-semibold" onClick={() => { clearLocal(); setLocalDraft(null) }}>Abaikan</button>
          </span>
        </div>
      )}
      {kun && kun.status !== 'draf' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">Kunjungan ini sudah dikirim{kun.submitted_at ? ` pada ${kun.submitted_at} WIB` : ''} dan tidak dapat diubah.</div>}
      {!isId && form?.status === 'dikirim' && kunEditable && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">Formulir ini sudah dikirim{form.submitted_at ? ` pada ${form.submitted_at} WIB` : ''}. Tekan <b>Buka kembali</b> untuk memperbaiki.</div>}
      {!can('pe_input') && <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-primary">Akun Anda hanya dapat melihat. Input pengawasan butuh hak akses <b>Input</b> (pe_input).</div>}

      <style>{`
        @keyframes peShine { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
        .pe-bar { background: linear-gradient(90deg, #0060A9, #00A3AD, #10b981, #00A3AD, #0060A9); background-size: 200% 100%; animation: peShine 6s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .pe-bar { animation: none } }
        .pe-flash { animation: peFlash 1.4s ease-out } @keyframes peFlash { 0%,40% { box-shadow: 0 0 0 4px rgba(245,158,11,.35); border-radius: 12px } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0) } }
        [data-field] { scroll-margin-top: 240px }
      `}</style>
      <div id="mbg-form-top" className="scroll-mt-4" />
      <Stepper def={{ steps }} stats={stats} tot={tot} stepIdx={stepIdx} goto={goto} errorsCount={errors.length} jumpNext={jumpNext} editable={editable} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-9">
          {step.desc && <p className="text-xs text-slate-500">{step.desc}</p>}
          {step.review ? (
            <Review def={def} data={data} stats={stats} errors={errors} warnings={warnings} ev={ev} isId={isId} geo={geo} editable={editable} goto={goto} focusIssue={focusIssue} />
          ) : step.sections.filter((se) => isVisible(se, data)).map((se) => (
            <section key={se.id} className={`${card} p-4 sm:p-5`} data-section={se.id}>
              <div className="skdr-section-head"><h2 className="skdr-section-title">{se.title}</h2>{se.desc && <p className="skdr-section-desc">{se.desc}</p>}</div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                {se.fields.filter((f) => isVisible(f, data)).map((f, fIdx) => (isId ? <FieldView key={`${f.key}_${fIdx}`} f={f} ctx={fctx} /> : mctx ? <MbgFieldView key={`${f.key}_${fIdx}`} f={f} ctx={mctx} /> : null))}
              </div>
            </section>
          ))}

          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <button disabled={stepIdx === 0} onClick={() => goto(stepIdx - 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" /> Sebelumnya
            </button>
            <span className="text-[11px] font-semibold text-slate-500 md:hidden">{stepIdx + 1}/{steps.length} · {tot.pct}%</span>
            {!last ? (
              <button onClick={() => goto(stepIdx + 1)} data-testid="mbg-next" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark">
                {stepIdx === steps.length - 2 ? 'Tinjau' : 'Berikutnya'} <ArrowRight className="h-4 w-4" />
              </button>
            ) : isId ? (
              <button onClick={finishIdentitas} disabled={!editable || busy} data-testid="mbg-identitas-lanjut" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Simpan & lanjut ke formulir
              </button>
            ) : (
              <button onClick={kirimForm} disabled={!editable || busy} data-testid="mbg-kirim" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim Formulir {no}
              </button>
            )}
          </div>
        </div>

        <aside className="space-y-5 xl:col-span-3">
          <div className={`${card} p-4`}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ClipboardList className="h-4 w-4" /> {isId ? 'Kunjungan' : `Formulir ${no}`}</div>
            <dl className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between gap-2"><dt>Nomor</dt><dd className="font-mono font-semibold text-slate-800">{kun?.no_kunjungan || '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Status</dt><dd><span className={badge(STATUS_CLS[status] || '')}>{STATUS_LABEL[status] || status}</span></dd></div>
              {kun && <div className="flex justify-between gap-2"><dt>Puskesmas</dt><dd className="text-right">{kun.data.unit_pelapor || '—'}</dd></div>}
              <div className="flex justify-between gap-2"><dt>Dibuat oleh</dt><dd className="text-right">{kun?.created_by_name || user?.full_name || user?.username || '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Kelengkapan</dt><dd className="font-semibold">{tot.done}/{tot.total} wajib</dd></div>
              {!isId && ev.skor !== null && <div className="flex justify-between gap-2"><dt>Skor</dt><dd className="font-semibold tabular-nums">{String(ev.skor).replace('.', ',')}</dd></div>}
              {!isId && <div className="flex items-center justify-between gap-2"><dt>Kesimpulan</dt><dd><KesBadge v={ev.kesimpulan} empty="—" /></dd></div>}
            </dl>
            {errors.length > 0 && editable && (
              <button onClick={jumpNext} className="mt-3 flex w-full items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-semibold text-amber-700">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" /> {errors.length} isian belum valid — lompat
              </button>
            )}
          </div>
          {warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700"><TriangleAlert className="h-4 w-4" /> Peringatan</div>
              <ul className="space-y-1 text-xs text-amber-800">{Array.from(new Set(warnings.map((w) => w.msg))).map((m) => <li key={m}>• {m}</li>)}</ul>
              <p className="mt-2 text-[10px] text-amber-600">Peringatan tidak menghalangi pengiriman.</p>
            </div>
          )}
          {kun && !isId && (
            <div className={`${card} p-4 text-xs`}>
              <div className="mb-2 font-bold uppercase tracking-wider text-slate-500">Formulir lain</div>
              <div className="flex justify-between gap-2">
                {prevNo ? <Link href={`${MBG_HREF}/${kun.id}/f${prevNo}`} className="font-semibold text-primary hover:underline">← F{prevNo} {FORM_TITLES[prevNo]?.short}</Link> : <span />}
                {nextNo ? <Link href={`${MBG_HREF}/${kun.id}/f${nextNo}`} className="text-right font-semibold text-primary hover:underline">F{nextNo} {FORM_TITLES[nextNo]?.short} →</Link> : null}
              </div>
              <Link href={`${MBG_HREF}/${kun.id}`} className="mt-2 block text-slate-500 hover:text-primary">Semua formulir kunjungan</Link>
            </div>
          )}
          {kun && kun.events.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><History className="h-4 w-4" /> Riwayat</div>
              <ul className="space-y-2 text-[11px] text-slate-600">
                {kun.events.slice(0, 8).map((e, i) => <li key={i} className="border-l-2 border-slate-200 pl-2"><span className="font-mono text-slate-400">{e.at} WIB</span><br />{EVENT_LABEL[e.event] || e.event}{e.note ? ` · ${e.note}` : ''}{e.actor ? ` · ${e.actor}` : ''}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ─── Tinjau ───────────────────────────────────────────────────────────────────
function display(f: FieldDef, d: Data, geo: ReturnType<typeof useGeo>): string | null {
  const v = d[f.key]
  const kind = f.type === 'mbg' ? f.mbg!.kind : f.type
  switch (kind) {
    case 'province': return v ? geo.provinces?.find((o) => o.value === String(v))?.label || `ID ${v}` : null
    case 'kabkota': return v ? [...(geo.kab[String(d.provinsi_id)] || [])].find((o) => o.value === String(v))?.label || `ID ${v}` : null
    case 'kecamatan': return d.kecamatan_nama || v || null
    case 'cek': return v ? `${v}${d[`${f.key}_ket`] ? ` — ${d[`${f.key}_ket`]}` : ''}` : null
    case 'sisa': {
      const k = f.mbg!.k as number
      const r = sisaItem(d, k)
      if (!r.filled) return null
      const samples = [1, 2, 3, 4, 5].map((x) => d[`sisa_i${k}_${x}`] ?? '–').join(' · ')
      return `${r.val || 'belum lengkap'} (sisa %: ${samples})`
    }
    case 'f9item': {
      const val = f9Item(d, f.mbg!.k)
      return val ? `${val}${d[`${f.key}_ket`] ? ` — ${d[`${f.key}_ket`]}` : ''}` : null
    }
    case 'sasaran': { const s = sasaranOf(d); return s.length ? s.map((x) => x.nama || '—').join(', ') : null }
    case 'a2row': return v ? `${v} mengikuti${d[`${f.key}_sertifikat`] ? ` · ${d[`${f.key}_sertifikat`]}` : ''}` : null
    case 'b2row': case 'b2lain': {
      const pre = f.mbg!.pre
      if (kind === 'b2lain' && !d[`${pre}_nama`]) return null
      return `${kind === 'b2lain' ? `${d[`${pre}_nama`]}: ` : ''}belum ${d[`${pre}_belum`] ?? '–'} · sudah ${d[`${pre}_sudah`] ?? '–'}${d[`${pre}_bukti`] ? ' · bukti ada' : ''}`
    }
    case 'f2b': {
      const r = f.mbg!.r
      if (!d[`b${r}_sos`] && !d[`b${r}`]) return null
      return `${d[`b${r}_sos`] === 'Sudah' ? 'Sudah sosialisasi' : d[`b${r}_sos`] === 'Belum' ? 'Belum sosialisasi' : '–'} · ${d[`b${r}`] || 'belum dinilai'}`
    }
    case 'count': return v !== null && v !== undefined && v !== '' ? `${v}${f.mbg?.suffix ? ` ${f.mbg.suffix}` : ''}` : null
    case 'dokumen': case 'note': case 'hasil': case 'rekap': case 'sptabel': case 'lampiran': case 'b1total': return null
    case 'unit': return v || null
    default: return isFilled(v) ? String(v) : null
  }
}

function Review({ def, data, stats, errors, warnings, ev, isId, geo, editable, goto, focusIssue }: {
  def: MbgDef; data: Data; stats: ReturnType<typeof stepStats>; errors: Issue[]; warnings: Issue[]; ev: Eval; isId: boolean
  geo: ReturnType<typeof useGeo>; editable: boolean; goto: (i: number) => void; focusIssue: (i: Issue) => void
}) {
  return (
    <div className="space-y-4" data-testid="mbg-review">
      {errors.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <div className="mb-2 flex items-center gap-2 font-bold"><CircleAlert className="h-4 w-4" /> {errors.length} isian perlu diperbaiki</div>
          <ul className="space-y-1">{errors.map((e) => <li key={e.key + e.msg}><button type="button" onClick={() => focusIssue(e)} className="text-left hover:underline">• <b>{def.steps.find((s) => s.id === e.step)?.title}:</b> {e.msg}</button></li>)}</ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" /> Semua isian wajib lengkap & valid{isId ? '.' : ' — formulir siap dikirim.'}</div>
      )}
      {!isId && (
        <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4 text-sm`}>
          <span className="font-semibold text-slate-700">Hasil penilaian</span>
          <span className="flex items-center gap-3">{ev.skor !== null && <span className="tabular-nums text-slate-600">Skor <b>{String(ev.skor).replace('.', ',')}</b></span>}<KesBadge v={ev.kesimpulan} /></span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-white p-4 text-xs text-amber-800">
          <div className="mb-1 flex items-center gap-2 font-bold"><TriangleAlert className="h-4 w-4" /> Peringatan (boleh tetap dikirim)</div>
          <ul className="space-y-0.5">{Array.from(new Set(warnings.map((w) => w.msg))).map((m) => <li key={m}>• {m}</li>)}</ul>
        </div>
      )}
      {def.steps.map((st: StepDef, i) => {
        if (st.review) return null
        const n = stats[i].errs.length
        const rows = visibleFields(st, data).map((f) => ({ f, val: display(f, data, geo) })).filter((r) => r.val)
        return (
          <section key={st.id} className={`${card} p-4 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${n ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>{n ? n : <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                {i + 1}. {st.title}
              </h2>
              {editable && <button type="button" onClick={() => goto(i)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Pencil className="h-3 w-3" /> Ubah</button>}
            </div>
            {rows.length ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs">
                {rows.map(({ f, val }, rIdx) => <div key={`${f.key}_${rIdx}`}><dt className="text-[11px] font-semibold text-slate-400">{f.label}</dt><dd className="whitespace-pre-line text-slate-800">{val}</dd></div>)}
              </dl>
            ) : <p className="text-xs text-slate-400">{n ? 'Belum diisi.' : 'Tidak ada isian untuk ditinjau (dihitung otomatis).'}</p>}
          </section>
        )
      })}
    </div>
  )
}
