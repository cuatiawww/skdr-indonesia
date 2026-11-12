'use client'
// PR 034: wizard Keracunan Pangan MBG — 6 langkah (Laporan Cepat → Kasus & Gejala → Menu & Penanganan → Kesehatan Lingkungan →
// Laboratorium → Lampiran & Kirim). Pola sama dengan Pengawasan Gizi: stepper "n/m wajib" + lompat ke isian belum valid, autosave 1,5 dtk,
// cadangan lokal, konfirmasi tinggalkan halaman. Laporan cepat: cukup 4 isian wajib lalu "Kirim Laporan Cepat" dari langkah 1.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, ClipboardList, Loader2, Pencil, RotateCcw, Save, Send, TriangleAlert, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/pe-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useAuth } from '@/lib/skdr-auth'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { isFilled, isVisible, overall, stepStats, visibleFields, type Data, type FieldDef, type Issue, type Refs } from '@/lib/laporan/engine'
import { lapFetch, useGeo } from '@/lib/laporan/api'
import type { FieldCtx } from '@/components/laporan/LaporanFields'
import { Stepper } from '@/components/laporan/LaporanWizard'
import { KP_STEPS } from '@/lib/keracunan-mbg/def'
import { hasil, quickErrors, validate } from '@/lib/keracunan-mbg/rules'
import { EVENT_LABEL, KP_API, KP_HREF, kpFetch, STATUS_CLS, STATUS_LABEL, viewStatus, type KpLampiran, type KpRecord } from '@/lib/keracunan-mbg/api'
import { HasilPanel, KpFieldView, type KpCtx } from './KpFields'

const card = 'rounded-2xl border border-slate-200 bg-white shadow-xs'
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'blocked'
const localKey = (id: number | null) => `skdr-kpm-local:${id ?? 'baru'}`
const PREFILL_KEYS = ['pelapor_hp', 'pelapor_email', 'provinsi_id', 'kabkota_id', 'kecamatan', 'kecamatan_nama']

/** drop computed / pseudo keys and values of hidden fields before sending */
function prune(d: Data): Data {
  const out: Data = {}
  Object.entries(d).forEach(([k, v]) => { if (!k.startsWith('_')) out[k] = v })
  KP_STEPS.forEach((st) => st.sections.forEach((se) => se.fields.forEach((f) => {
    if ((!isVisible(se, d) || !isVisible(f, d)) && f.key in out) delete out[f.key]
  })))
  return out
}

export default function KpWizard({ rid, stepId = 's1', viewOnly = false }: { rid: number | null; stepId?: string; viewOnly?: boolean }) {
  const router = useRouter()
  const { can, user } = useAuth()
  const geo = useGeo()
  const steps = KP_STEPS
  const [refs, setRefs] = useState<Refs | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [rec, setRec] = useState<KpRecord | null>(null)
  const [lampiran, setLampiran] = useState<KpLampiran[]>([])
  const [data, setData] = useState<Data>({})
  const dataRef = useRef<Data>({})
  const [ready, setReady] = useState(false)
  const [saveState, setSaveStateRaw] = useState<SaveState>('idle')
  const saveStateRef = useRef<SaveState>('idle')
  const setSaveState = (s: SaveState) => { saveStateRef.current = s; setSaveStateRaw(s) }
  const [stepIdx, setStepIdx] = useState(Math.max(0, steps.findIndex((s) => s.id === stepId)))
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [shownSteps, setShownSteps] = useState<Set<string>>(new Set())
  const [auto, setAuto] = useState<Record<string, string>>({})
  const [localDraft, setLocalDraft] = useState<{ data: Data; at: string } | null>(null)
  const [serverErrs, setServerErrs] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({})
  const ridRef = useRef<number | null>(rid)
  const stepIdxRef = useRef(stepIdx)
  stepIdxRef.current = stepIdx
  const statusRef = useRef<string>('draf')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<number | null> | null>(null)
  const dirty = useRef(false)
  const pendingFocus = useRef<string | null>(null)
  const lastJump = useRef<string | null>(null)

  const status = rec?.status || 'draf'
  statusRef.current = status
  const editable = !viewOnly && can('pe_input') && status !== 'ditutup'
  const today = refs?.today || '9999-12-31'

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const r = await lapFetch<{ data: Refs }>('/api/v1/laporan-ref/opsi')
        if (off) return
        setRefs(r.data)
        geo.loadProvinces()
        let d: Data = {}
        let local: { data: Data; at: string } | null = null
        try { local = JSON.parse(localStorage.getItem(localKey(rid)) || 'null') } catch {}
        if (!rid) {
          const p = await kpFetch<{ data: { nama: string | null; email: string | null; last: Data; last_no: string | null } }>(`${KP_API}-ref/prefill`).catch(() => null)
          const a: Record<string, string> = {}
          const last = p?.data.last || {}
          PREFILL_KEYS.forEach((k) => { if (isFilled(last[k])) { d[k] = last[k]; a[k] = `Dari laporan terakhir Anda (${p?.data.last_no})` } })
          if (p?.data.nama) { d.pelapor_nama = p.data.nama; a.pelapor_nama = 'Dari akun yang sedang login' }
          if (p?.data.email && !d.pelapor_email) { d.pelapor_email = p.data.email; a.pelapor_email = 'Dari akun yang sedang login' }
          setAuto(a)
          if (local && isFilled(local.data)) setLocalDraft(local)
        } else {
          const j = await kpFetch<{ data: KpRecord }>(`${KP_API}/${rid}`)
          if (off) return
          setRec(j.data); setLampiran(j.data.lampiran)
          d = { ...j.data.data }
          if (local && j.data.status !== 'ditutup' && (!j.data.updated_at || local.at > j.data.updated_at)) setLocalDraft(local)
        }
        delete d._hasil
        dataRef.current = d; setData(d); setReady(true)
      } catch (e) {
        if (!off) setLoadErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { off = true }
  }, [rid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data.provinsi_id) geo.loadKab(String(data.provinsi_id))
    if (data.kabkota_id) geo.loadKec(String(data.kabkota_id))
  }, [data.provinsi_id, data.kabkota_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── validation ────────────────────────────────────────────────────────────
  const ev = useMemo(() => validate(data, today), [data, today])

  // ── save ──────────────────────────────────────────────────────────────────
  const writeLocal = () => { try { localStorage.setItem(localKey(ridRef.current), JSON.stringify({ data: dataRef.current, at: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') })) } catch {} }
  const clearLocal = () => { try { localStorage.removeItem(localKey(ridRef.current)); localStorage.removeItem(localKey(null)) } catch {} }

  const save = useCallback(async (force = false): Promise<number | null> => {
    if (inflight.current) { await inflight.current; if (!dirty.current) return ridRef.current }
    // new report: create the draft once the 4 required fields are valid (or the user explicitly saves)
    if (!ridRef.current && !force && quickErrors(dataRef.current, today).length) { writeLocal(); setSaveState('dirty'); return null }
    // already reported: the server only accepts valid data — keep it local until the errors are fixed
    if (statusRef.current === 'dilaporkan' && validate(dataRef.current, today).errors.length) { writeLocal(); setSaveState('blocked'); return null }
    const run = (async () => {
      dirty.current = false
      setSaveState('saving')
      const body = { data: prune(dataRef.current) }
      try {
        const j = ridRef.current
          ? await kpFetch<{ data: KpRecord }>(`${KP_API}/${ridRef.current}`, { method: 'PUT', body })
          : await kpFetch<{ data: KpRecord }>(KP_API, { method: 'POST', body })
        const created = !ridRef.current
        ridRef.current = j.data.id
        setRec(j.data)
        if (created) { try { localStorage.removeItem(localKey(null)) } catch {} ; window.history.replaceState(null, '', `${PUBLIC_BASE_PATH}${KP_HREF}/${j.data.id}/${steps[stepIdxRef.current]?.id || 's1'}`) }
        clearLocal()
        setSaveState(dirty.current ? 'dirty' : 'saved')
        return ridRef.current
      } catch (e) {
        dirty.current = true
        writeLocal()
        setSaveState('error')
        if (e instanceof ApiError && e.status === 422 && e.body?.errors) setServerErrs(e.body.errors)
        toast.error(`Gagal disimpan: ${e instanceof Error ? e.message : String(e)}. Isian disimpan sementara di perangkat ini.`)
        return null
      }
    })()
    inflight.current = run
    try { return await run } finally { inflight.current = null }
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const flush = async (force = false) => { if (timer.current) clearTimeout(timer.current); return dirty.current || !ridRef.current || force ? save(force) : ridRef.current }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => {
    const risky = () => ['dirty', 'saving', 'error', 'blocked'].includes(saveStateRef.current)
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
  const stats = useMemo(() => stepStats({ steps }, data, errors), [steps, data, errors])
  const tot = overall(stats)
  const step = steps[stepIdx]
  const show = (k: string) => touched.has(k) || (!!step && shownSteps.has(step.id)) || shownSteps.has('*')
  const touch = (k: string) => setTouched((s) => (s.has(k) ? s : new Set(s).add(k)))
  const quick = useMemo(() => quickErrors(data, today), [data, today])

  useEffect(() => {
    const k = pendingFocus.current
    if (!k) return
    pendingFocus.current = null
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(k)}"]`)
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
    if (ridRef.current) window.history.replaceState(null, '', `${PUBLIC_BASE_PATH}${KP_HREF}/${ridRef.current}/${steps[i].id}${viewOnly ? '?mode=lihat' : ''}`)
    window.requestAnimationFrame(() => document.getElementById('kp-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const focusIssue = (iss: Issue) => {
    const si = steps.findIndex((s) => s.id === iss.step)
    setShownSteps((s) => new Set(s).add(iss.step))
    pendingFocus.current = iss.key
    lastJump.current = iss.key
    const sec = steps[si]?.sections.find((se) => se.fields.some((f) => f.key === iss.key))
    if (sec) setOpenSec((o) => ({ ...o, [sec.id]: true }))
    if (si >= 0 && si !== stepIdx) setStepIdx(si); else setTouched((s) => new Set(s))
  }
  const jumpNext = () => {
    if (!errors.length) { toast.success('Semua isian sudah valid'); return }
    const order = errors.map((i) => ({ ...i, si: steps.findIndex((s) => s.id === i.step) })).sort((a, b) => a.si - b.si)
    const last = order.findIndex((i) => i.key === lastJump.current)
    const after = order.filter((i, n) => (last >= 0 ? n > last : i.si >= stepIdx))
    focusIssue(after.find((i) => i.key !== lastJump.current) || order[0])
  }

  const kirim = async (cepat: boolean) => {
    setShownSteps(new Set(['*']))
    if (errors.length) { toast.error(`Masih ada ${errors.length} isian yang belum valid`); jumpNext(); return }
    const h = hasil(dataRef.current)
    const msg = cepat
      ? `Kirim LAPORAN CEPAT sekarang?\n\n${h.kasus} kasus, ${h.meninggal} meninggal${h.ar !== null ? `, attack rate ${String(h.ar).replace('.', ',')}%` : ''}.\nLangkah 2–6 tetap dapat dilengkapi setelah laporan terkirim.`
      : 'Kirim laporan kejadian keracunan pangan ini? Setelah dikirim, laporan tetap dapat dilengkapi (update harian, hasil lab) sampai kejadian ditutup.'
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      const id = await flush(true)
      if (!id) return
      const j = await kpFetch<{ data: KpRecord }>(`${KP_API}/${id}/kirim`, { method: 'POST' })
      setRec(j.data); dirty.current = false; setSaveState('saved'); clearLocal()
      toast.success(`${j.data.no_laporan} dilaporkan`)
      router.push(`${KP_HREF}/${id}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.body?.data?.errors) setServerErrs(e.body.data.errors)
      toast.error(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  const selesai = async () => {
    if (errors.length) { setShownSteps(new Set(['*'])); toast.error(`Perbaiki ${errors.length} isian dulu — laporan yang sudah dikirim hanya menyimpan isian valid`); jumpNext(); return }
    setBusy(true)
    try { const id = await flush(); if (id) { toast.success('Perubahan tersimpan'); router.push(`${KP_HREF}/${id}`) } } finally { setBusy(false) }
  }

  if (loadErr) return <div className="w-full p-8 text-sm text-red-600">Gagal memuat laporan: {loadErr}</div>
  if (!refs || !ready) return <SkeletonDetail />

  const errMap: Record<string, string[]> = {}
  errors.forEach((i) => { (errMap[i.key] ||= []).push(i.msg) })
  const warnMap: Record<string, string[]> = {}
  warnings.forEach((i) => { (warnMap[i.key] ||= []).push(i.msg) })
  const fctx: FieldCtx = {
    jenis: 'ebs', refs, data, readOnly: !editable, geo, no: rec?.no_laporan || null, recordId: ridRef.current, errs: errMap, warns: warnMap, show, touch,
    set: (f: FieldDef, v: any, extra: Data = {}) => setKey(f.key, v, extra, f.resets || []),
    patch: (p: Data) => { if (editable) commit({ ...dataRef.current, ...p }) },
    auto, lampiran: [], setLampiran: () => {}, ensureSaved: () => flush(), reported: [],
  }
  const kctx: KpCtx = {
    fctx, data, readOnly: !editable, lampiranReadOnly: viewOnly || !can('pe_input') || status === 'ditutup', errs: errMap, warns: warnMap, show, touch,
    set: (k, v, extra) => setKey(k, v, extra), patch: (p) => { if (editable) commit({ ...dataRef.current, ...p }) }, today,
    rid: ridRef.current, ensureSaved: () => flush(true), lampiran, setLampiran, limits: refs.lampiran,
  }
  const vs = rec ? viewStatus(rec.status, hasil(data).lab_status) : 'baru'
  const last = stepIdx === steps.length - 1
  const isDraf = status === 'draf'

  return (
    <div className="w-full space-y-5 bg-page px-3 py-5 pb-24 sm:px-6 sm:py-6 md:pb-6 lg:px-8">
      <header className="skdr-section-head grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center lg:gap-6" data-testid="page-header">
        <div className="min-w-0 lg:col-span-8">
          <h1 className="skdr-section-title text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{rec ? (data.nama_sppg || 'Laporan Kejadian') : 'Laporan Kejadian Baru'}</h1>
          <p className="skdr-section-desc mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-600">
            {rec ? <>{[rec.kabkota, rec.provinsi].filter(Boolean).join(', ') || 'Wilayah belum diisi'}{data.tgl_kejadian ? ` · ${String(data.tgl_kejadian).replace('T', ' ')}` : ''}</> : 'Draf dibuat otomatis setelah 4 isian wajib terisi'}
            {' · '}<span className={badge(STATUS_CLS[vs] || '')}>{STATUS_LABEL[vs] || vs}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-3 text-xs lg:col-span-4 lg:justify-end shrink-0">
          <span className="text-slate-500" aria-live="polite">
            {saveState === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Menyimpan…</span>}
            {saveState === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{isDraf ? 'Draf tersimpan' : 'Tersimpan'}</span>}
            {saveState === 'dirty' && (!ridRef.current ? 'Lengkapi 4 isian wajib — draf belum dibuat' : 'Belum tersimpan…')}
            {saveState === 'blocked' && <span className="text-amber-700">Belum tersimpan — perbaiki isian yang belum valid</span>}
            {saveState === 'error' && <span className="text-red-600">Gagal menyimpan (tersimpan sementara di perangkat)</span>}
            {saveState === 'idle' && !editable && 'Hanya baca'}
          </span>
          {editable && (
            <button onClick={() => flush(true)} disabled={saveState === 'saving'} data-testid="kp-save"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {isDraf ? 'Simpan Draf' : 'Simpan'}
            </button>
          )}
          {viewOnly && rec && rec.status !== 'ditutup' && can('pe_input') && (
            <Link href={`${KP_HREF}/${rec.id}/${step.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-white px-3 py-2 font-semibold text-primary hover:bg-primary/5"><Pencil className="h-3.5 w-3.5" /> Ubah</Link>
          )}
        </div>
      </header>

      {localDraft && editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
          <span className="inline-flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Ada isian yang belum sempat tersimpan ke server ({localDraft.at}).</span>
          <span className="flex gap-2">
            <button className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white" onClick={() => { commit({ ...localDraft.data }); setLocalDraft(null) }}>Pulihkan</button>
            <button className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 font-semibold" onClick={() => { clearLocal(); setLocalDraft(null) }}>Abaikan</button>
          </span>
        </div>
      )}
      {status === 'dilaporkan' && editable && <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">Laporan sudah dikirim{rec?.reported_at ? ` pada ${rec.reported_at} WIB` : ''}. Perubahan tetap tersimpan otomatis selama semua isian valid. Untuk perkembangan kasus per hari gunakan <b>Update Harian</b> di halaman ringkasan.</div>}
      {status === 'ditutup' && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">Kejadian sudah ditutup{rec?.closed_at ? ` pada ${rec.closed_at} WIB` : ''}. Buka kembali dari halaman ringkasan untuk mengubah.</div>}
      {!can('pe_input') && <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-primary">Akun Anda hanya dapat melihat. Input laporan butuh hak akses <b>Input</b> (pe_input).</div>}

      <style>{`
        .pe-flash { animation: peFlash 1.4s ease-out } @keyframes peFlash { 0%,40% { box-shadow: 0 0 0 4px rgba(245,158,11,.35); border-radius: 12px } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0) } }
        [data-field] { scroll-margin-top: 100px }
      `}</style>
      <div id="kp-form-top" className="scroll-mt-4" />
      <Stepper def={{ steps }} stats={stats} tot={tot} stepIdx={stepIdx} goto={goto} errorsCount={errors.length} jumpNext={jumpNext} editable={editable} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-9">
          {step.desc && <p className="text-xs text-slate-500">{step.desc}</p>}
          {step.id === 's4' && <p className="text-[11px] text-slate-400">Bagian yang belum diisi diciutkan — klik judul bagian untuk membuka. {editable && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setOpenSec(Object.fromEntries(step.sections.map((se) => [se.id, true])))}>Buka semua</button>}</p>}
          {step.sections.filter((se) => isVisible(se, data)).map((se) => {
            const fields = se.fields.filter((f) => isVisible(f, data))
            const real = fields.filter((f) => !f.key.startsWith('_'))
            const isi = real.filter((f) => f.mbg?.kind === 'petugas' ? false : isFilled(data[f.key])).length
            const nErr = errors.filter((e) => real.some((f) => f.key === e.key) || (se.id === 'sppg' && e.key.startsWith('pt_'))).length
            const collapsible = step.id === 's4'
            const open = !collapsible || (openSec[se.id] ?? (isi > 0 || nErr > 0))
            return (
              <section key={se.id} className={`${card} p-4 sm:p-5 ${se.tone === 'accent' ? 'border-primary/30 ring-1 ring-primary/10' : ''}`} data-section={se.id}>
                {collapsible ? (
                  <button type="button" onClick={() => setOpenSec((o) => ({ ...o, [se.id]: !open }))} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="skdr-section-head !mb-0"><span className="skdr-section-title block">{se.title}</span>{se.desc && <span className="skdr-section-desc block">{se.desc}</span>}</span>
                    <span className="flex shrink-0 items-center gap-2 text-[11px]">
                      {nErr > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{nErr} perlu diperbaiki</span>}
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${isi ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{isi ? `${isi} terisi` : 'belum diisi'}</span>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                ) : <div className="skdr-section-head"><h2 className="skdr-section-title">{se.title}</h2>{se.desc && <p className="skdr-section-desc">{se.desc}</p>}</div>}
                {open && (
                  <div className={`grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 ${collapsible ? 'mt-4' : ''}`}>
                    {fields.map((f) => <KpFieldView key={f.key} f={f} ctx={kctx} />)}
                  </div>
                )}
              </section>
            )
          })}
          {stepIdx === 0 && isDraf && editable && (
            <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${quick.length ? 'border-slate-200 bg-white' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="text-xs">
                <p className="flex items-center gap-1.5 font-bold text-slate-800"><Zap className="h-4 w-4 text-amber-500" /> Laporan cepat</p>
                <p className="mt-0.5 text-slate-600">{quick.length ? `Lengkapi ${quick.length} isian di atas untuk dapat mengirim laporan cepat.` : errors.length ? `Isian wajib lengkap, tetapi ada ${errors.length} isian lain yang belum valid.` : 'Isian wajib lengkap — laporan dapat dikirim sekarang dan dilengkapi kemudian.'}</p>
              </div>
              <button onClick={() => kirim(true)} disabled={busy || quick.length > 0} data-testid="kp-kirim-cepat" className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-amber-600 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Kirim Laporan Cepat
              </button>
            </div>
          )}
          {last && <Review data={data} stats={stats} errors={errors} warnings={warnings} editable={editable} goto={goto} focusIssue={focusIssue} />}

          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <button disabled={stepIdx === 0} onClick={() => goto(stepIdx - 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" /> Sebelumnya
            </button>
            <span className="text-[11px] font-semibold text-slate-500 md:hidden">{stepIdx + 1}/{steps.length} · {tot.pct}%</span>
            {!last ? (
              <button onClick={() => goto(stepIdx + 1)} data-testid="kp-next" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark">
                Berikutnya <ArrowRight className="h-4 w-4" />
              </button>
            ) : isDraf ? (
              <button onClick={() => kirim(false)} disabled={!editable || busy} data-testid="kp-kirim" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim Laporan
              </button>
            ) : (
              <button onClick={selesai} disabled={!editable || busy} data-testid="kp-selesai" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan & ke ringkasan
              </button>
            )}
          </div>
        </div>

        <aside className="space-y-5 xl:col-span-3">
          <div className={`${card} p-4`}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ClipboardList className="h-4 w-4" /> Kejadian</div>
            <dl className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between gap-2"><dt>Nomor</dt><dd className="font-mono font-semibold text-slate-800">{rec?.no_laporan || '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Status</dt><dd><span className={badge(STATUS_CLS[vs] || '')}>{STATUS_LABEL[vs] || vs}</span></dd></div>
              <div className="flex justify-between gap-2"><dt>Dibuat oleh</dt><dd className="text-right">{rec?.created_by_name || user?.full_name || user?.username || '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Kelengkapan wajib</dt><dd className="font-semibold">{tot.done}/{tot.total}</dd></div>
            </dl>
            <div className="mt-3"><HasilPanel h={hasil(data)} compact /></div>
            {errors.length > 0 && editable && (
              <button onClick={jumpNext} className="mt-3 flex w-full items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-semibold text-amber-700">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" /> {errors.length} isian belum valid — lompat
              </button>
            )}
          </div>
          {warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700"><TriangleAlert className="h-4 w-4" /> Cek silang</div>
              <ul className="space-y-1 text-xs text-amber-800">{Array.from(new Set(warnings.map((w) => w.msg))).map((m) => <li key={m}>• {m}</li>)}</ul>
              <p className="mt-2 text-[10px] text-amber-600">Peringatan tidak menghalangi pengiriman.</p>
            </div>
          )}
          {rec && rec.events.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Riwayat</div>
              <ul className="space-y-2 text-[11px] text-slate-600">
                {rec.events.slice(0, 6).map((e, i) => <li key={i} className="border-l-2 border-slate-200 pl-2"><span className="font-mono text-slate-400">{e.at} WIB</span><br />{EVENT_LABEL[e.event] || e.event}{e.note ? ` · ${e.note}` : ''}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ─── Tinjau (di langkah terakhir) ────────────────────────────────────────────
function Review({ data, stats, errors, warnings, editable, goto, focusIssue }: {
  data: Data; stats: ReturnType<typeof stepStats>; errors: Issue[]; warnings: Issue[]; editable: boolean; goto: (i: number) => void; focusIssue: (i: Issue) => void
}) {
  return (
    <div className="space-y-4" data-testid="kp-review">
      <h2 className="text-sm font-bold text-slate-800">Tinjau sebelum mengirim</h2>
      {errors.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <div className="mb-2 flex items-center gap-2 font-bold"><CircleAlert className="h-4 w-4" /> {errors.length} isian perlu diperbaiki</div>
          <ul className="space-y-1">{errors.map((e) => <li key={e.key + e.msg}><button type="button" onClick={() => focusIssue(e)} className="text-left hover:underline">• <b>{KP_STEPS.find((s) => s.id === e.step)?.title}:</b> {e.msg}</button></li>)}</ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" /> Semua isian valid — laporan siap dikirim.</div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-white p-4 text-xs text-amber-800">
          <div className="mb-1 flex items-center gap-2 font-bold"><TriangleAlert className="h-4 w-4" /> Cek silang (boleh tetap dikirim)</div>
          <ul className="space-y-0.5">{Array.from(new Set(warnings.map((w) => w.msg))).map((m) => <li key={m}>• {m}</li>)}</ul>
        </div>
      )}
      <HasilPanel h={hasil(data)} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {KP_STEPS.map((st, i) => {
          const n = stats[i].errs.length
          const fields = visibleFields(st, data).filter((f) => !f.key.startsWith('_'))
          const isi = fields.filter((f) => isFilled(data[f.key])).length
          return (
            <div key={st.id} className={`${card} flex items-center justify-between gap-2 px-4 py-3 text-xs`}>
              <span className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${n ? 'bg-amber-500' : isi ? 'bg-emerald-500' : 'bg-slate-300'}`}>{n || i + 1}</span>
                <span><b className="text-slate-800">{st.title}</b><span className="block text-[10px] text-slate-400">{isi}/{fields.length} isian terisi{n ? ` · ${n} perlu diperbaiki` : ''}</span></span>
              </span>
              {editable && <button type="button" onClick={() => goto(i)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><Pencil className="h-3 w-3" /> Ubah</button>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
