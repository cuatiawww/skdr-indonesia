'use client'
// PR 030: wizard for Laporan EBS / IBS — mirrors the Form PE stepper (progress "n/m wajib", badge isian belum valid,
// lompat ke isian berikutnya yang belum valid), autosave draf 1,5 dtk, konfirmasi tinggalkan halaman, langkah Tinjau & Kirim.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronsRight, CircleAlert, ClipboardList, Copy, History, Info, Loader2, Pencil, RotateCcw, Save, Send, Stethoscope, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/pe-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useAuth } from '@/lib/skdr-auth'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { epiLabel, isFilled, isVisible, overall, reportingWeek, stepStats, UNIT_KEY, visibleFields, weeksOf, type Data, type FieldDef, type FormDef, type Issue, type Refs, type StepDef } from '@/lib/laporan/engine'
import { SEXES, usiaTotals } from '@/lib/laporan/ebs'
import { IBS_COLS, ibsTotals } from '@/lib/laporan/ibs'
import { imtKategori, umurText, UMUR_PARTS } from '@/lib/laporan/individu'
import { lapFetch, STATUS_CLS, STATUS_LABEL, useGeo, type Lampiran, type LapRecord } from '@/lib/laporan/api'
import { FieldView, optionsFor, type FieldCtx } from './LaporanFields'

const card = 'rounded-2xl border border-slate-200 bg-white shadow-xs'
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
const SERVER_KEYS = ['tgl_laporan', 'tgl_entri', 'tgl_formulir']
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
interface DupEbs { lokal: { id: number; no: string; status: string; tgl: string | null; unit: string | null; kasus: number | null }[]; ebs: { no: string | null; tgl: string | null; unit: string | null; kasus: number; status: string | null }[] }
type Reported = FieldCtx['reported']
interface DupIndividu { sama: { id: number; no: string; status: string; tgl: string | null }[]; periode: number }

const localKey = (jenis: string, id: number | null) => `skdr-lap-local:${jenis}:${id ?? 'baru'}`
const EVENT_LABEL: Record<string, string> = { dibuat: 'Draf dibuat', dikirim: 'Laporan dikirim', dihapus: 'Draf dihapus' }

/** body sent to the server: values of fields hidden by their Ya/Tidak parent are dropped (kept locally while editing) */
function prune(def: FormDef, d: Data): Data {
  const out = { ...d }
  def.steps.forEach((st) => st.sections.forEach((se) => se.fields.forEach((f) => {
    if ((!isVisible(se, d) || !isVisible(f, d)) && f.key in out) delete out[f.key]
  })))
  return out
}

export default function LaporanWizard({ def, id, viewOnly = false }: { def: FormDef; id: number | null; viewOnly?: boolean }) {
  const router = useRouter()
  const { can, user } = useAuth()
  const jenis = def.jenis
  const geo = useGeo()
  const [refs, setRefs] = useState<Refs | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [rec, setRec] = useState<LapRecord | null>(null)
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
  const [lampiran, setLampiran] = useState<Lampiran[]>([])
  const [dup, setDup] = useState<DupEbs | null>(null)
  const [reported, setReported] = useState<Reported>([])
  const [localDraft, setLocalDraft] = useState<{ data: Data; at: string } | null>(null)
  const [serverErrs, setServerErrs] = useState<Issue[]>([])
  const [submitting, setSubmitting] = useState(false)
  const recId = useRef<number | null>(id)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<number | null> | null>(null)
  const dirty = useRef(false)
  const pendingFocus = useRef<string | null>(null)
  const lastJump = useRef<string | null>(null)

  const editable = !viewOnly && can('pe_input') && (!rec || rec.status === 'draf')

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
        try { local = JSON.parse(localStorage.getItem(localKey(jenis, id)) || 'null') } catch {}
        if (id) {
          const j = await lapFetch<{ data: LapRecord }>(`/api/v1/laporan/${jenis}/${id}`)
          if (off) return
          setRec(j.data); setLampiran(j.data.lampiran || []); d = j.data.data || {}
          if (local && j.data.status === 'draf' && (!j.data.updated_at || local.at > j.data.updated_at)) setLocalDraft(local)
        } else {
          const p = await lapFetch<{ data: { nama: string; last: Data; last_no: string | null } }>(`/api/v1/laporan-ref/prefill?jenis=${jenis}`).catch(() => null)
          const last = p?.data.last || {}
          const src = p?.data.last_no ? `Dari laporan terakhir Anda (${p.data.last_no})` : ''
          const a: Record<string, string> = {}
          def.prefillKeys.forEach((k) => { if (isFilled(last[k])) { d[k] = last[k]; a[k] = src } })
          const nameKey = def.nameKey
          if (!isFilled(d[nameKey]) && p?.data.nama) { d[nameKey] = p.data.nama; a[nameKey] = 'Dari akun yang sedang login' }
          if (jenis === 'ebs') d.dom_sama = true
          if (def.defaultWeek) {
            const w = reportingWeek(r.data.today)
            d.tahun = w.year; d.minggu = w.week
            a.minggu = 'Minggu laporan berjalan (minggu epid terakhir yang sudah selesai)'
          }
          setAuto(a)
          if (local && isFilled(local.data)) setLocalDraft(local)
        }
        if (d.dom_sama) { d.dom_provinsi_id = d.provinsi_id ?? null; d.dom_kabkota_id = d.kabkota_id ?? null }
        dataRef.current = d; setData(d); setReady(true)
      } catch (e) {
        if (!off) setLoadErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { off = true }
  }, [jenis, id]) // eslint-disable-line react-hooks/exhaustive-deps

  // labels for the current wilayah values (SearchSelect needs the options to show the picked label)
  useEffect(() => {
    ;['provinsi_id', 'dom_provinsi_id'].forEach((k) => { if (data[k]) geo.loadKab(String(data[k])) })
    if (data.kabkota_id) geo.loadKec(String(data.kabkota_id))
  }, [data.provinsi_id, data.dom_provinsi_id, data.kabkota_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── save ──────────────────────────────────────────────────────────────────
  const writeLocal = () => { try { localStorage.setItem(localKey(jenis, recId.current), JSON.stringify({ data: dataRef.current, at: new Date().toISOString().slice(0, 19).replace('T', ' ') })) } catch {} }
  const clearLocal = () => { try { localStorage.removeItem(localKey(jenis, recId.current)); localStorage.removeItem(localKey(jenis, null)) } catch {} }

  const save = useCallback(async (): Promise<number | null> => {
    if (inflight.current) { await inflight.current; if (!dirty.current) return recId.current }
    const run = (async () => {
      dirty.current = false
      setSaveState('saving')
      const body = { data: prune(def, dataRef.current) }
      try {
        const j = recId.current
          ? await lapFetch<{ data: LapRecord }>(`/api/v1/laporan/${jenis}/${recId.current}`, { method: 'PUT', body })
          : await lapFetch<{ data: LapRecord }>(`/api/v1/laporan/${jenis}`, { method: 'POST', body })
        const created = !recId.current
        recId.current = j.data.id
        setRec(j.data)
        const srv: Data = {}
        SERVER_KEYS.forEach((k) => { if (j.data.data?.[k] !== undefined) srv[k] = j.data.data[k] })
        dataRef.current = { ...dataRef.current, ...srv }; setData(dataRef.current)
        if (created) window.history.replaceState(null, '', `${PUBLIC_BASE_PATH}${def.listHref}/${j.data.id}`)
        clearLocal()
        setSaveState(dirty.current ? 'dirty' : 'saved')
        return j.data.id
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
  }, [def, jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: Data) => {
    dataRef.current = next; setData(next); dirty.current = true; setSaveState('dirty'); setServerErrs([])
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { save() }, 1500)
  }
  const set = (f: FieldDef, v: any, extra: Data = {}) => {
    if (!editable) return
    const cur = dataRef.current
    const next: Data = { ...cur, [f.key]: v, ...extra }
    if (cur[f.key] !== v) (f.resets || []).forEach((k) => { if (!(k in extra)) next[k] = null })
    if (next.dom_sama) { next.dom_provinsi_id = next.provinsi_id ?? null; next.dom_kabkota_id = next.kabkota_id ?? null }
    if (def.derive) Object.assign(next, def.derive(next))
    if (auto[f.key]) setAuto((a) => { const b = { ...a }; delete b[f.key]; return b })
    commit(next)
  }
  const patch = (p: Data) => { if (editable) commit({ ...dataRef.current, ...p }) }
  const flush = async () => { if (timer.current) clearTimeout(timer.current); return dirty.current || !recId.current ? save() : recId.current }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  // leave-page guard: tab close/reload + in-app links
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

  // ── duplicate checks ──────────────────────────────────────────────────────
  const dupKab = data.dom_kabkota_id || data.kabkota_id
  useEffect(() => {
    if (jenis !== 'ebs') return
    if (!data.penyakit_rumor || !data.tgl_rumor || !dupKab) { setDup(null); return }
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ penyakit: data.penyakit_rumor, kabkota_id: String(dupKab), tgl: data.tgl_rumor, exclude: String(recId.current || 0) })
      lapFetch<{ data: DupEbs }>(`/api/v1/laporan-ref/duplikat/ebs?${qs}`).then((j) => setDup(j.data)).catch(() => {})
    }, 700)
    return () => clearTimeout(t)
  }, [jenis, data.penyakit_rumor, data.tgl_rumor, dupKab])
  const ukey = UNIT_KEY(data)
  useEffect(() => {
    if (jenis !== 'ibs') return
    if (!ukey || !data.tahun) { setReported([]); return }
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ unit_key: ukey, tahun: String(data.tahun), exclude: String(recId.current || 0) })
      lapFetch<{ data: Reported }>(`/api/v1/laporan-ref/duplikat/ibs?${qs}`).then((j) => setReported(j.data)).catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [jenis, ukey, data.tahun])

  // PR 031: Form Individu — same unit + nama pasien + tanggal periksa (soft warning); IBS agregat — count of individu records
  // for the same unit + minggu (info only, no auto-fill: the official sync rules are unknown)
  const [dupInd, setDupInd] = useState<DupIndividu | null>(null)
  useEffect(() => {
    if (jenis !== 'individu' && jenis !== 'ibs') return
    const nama = jenis === 'individu' ? String(data.nama_pasien || '').trim() : ''
    if (!ukey || (jenis === 'individu' ? !nama || !data.tgl_periksa : !data.tahun || !data.minggu)) { setDupInd(null); return }
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ unit_key: ukey, exclude: String(jenis === 'individu' ? recId.current || 0 : 0) })
      if (jenis === 'individu') { qs.set('nama', nama); qs.set('tgl', data.tgl_periksa) } else { qs.set('tahun', String(data.tahun)); qs.set('minggu', String(data.minggu)) }
      lapFetch<{ data: DupIndividu }>(`/api/v1/laporan-ref/duplikat/individu?${qs}`).then((j) => setDupInd(j.data)).catch(() => {})
    }, 700)
    return () => clearTimeout(t)
  }, [jenis, ukey, data.nama_pasien, data.tgl_periksa, data.tahun, data.minggu])

  // ── validation / progress ────────────────────────────────────────────────
  const result = useMemo(() => (refs ? def.validate(data, refs) : { errors: [], warnings: [] }), [def, data, refs])
  const errors = useMemo(() => {
    const extra = serverErrs.filter((s) => !result.errors.some((e) => e.key === s.key && e.msg === s.msg))
    return [...result.errors, ...extra]
  }, [result, serverErrs])
  const warnings = result.warnings
  const stats = useMemo(() => stepStats(def, data, errors), [def, data, errors])
  const tot = overall(stats)
  const toMap = (list: Issue[]) => {
    const m: Record<string, string[]> = {}
    list.forEach((i) => { [i.key, i.key.split('.')[0]].forEach((k) => { (m[k] ||= []).includes(i.msg) || m[k].push(i.msg) }) })
    return m
  }
  const errMap = useMemo(() => toMap(errors), [errors])
  const warnMap = useMemo(() => toMap(warnings), [warnings])

  const step = def.steps[stepIdx]
  const show = (k: string) => touched.has(k) || shownSteps.has(step.id) || shownSteps.has('*')
  const touch = (k: string) => setTouched((s) => (s.has(k) ? s : new Set(s).add(k)))

  // focus + flash the field picked by "lompat ke isian belum valid"
  useEffect(() => {
    const k = pendingFocus.current
    if (!k) return
    pendingFocus.current = null
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(k)}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('pe-flash'); void el.offsetWidth; el.classList.add('pe-flash')
      el.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), textarea, button[role=combobox], [contenteditable=true]')?.focus({ preventScroll: true })
    })
  })

  const goto = async (i: number) => {
    setShownSteps((s) => new Set(s).add(step.id))
    if (dirty.current) flush()
    setStepIdx(i); lastJump.current = null
    window.requestAnimationFrame(() => document.getElementById('lap-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const focusIssue = (iss: Issue) => {
    const si = def.steps.findIndex((s) => s.id === iss.step)
    setShownSteps((s) => new Set(s).add(iss.step))
    pendingFocus.current = iss.key.split('.')[0]
    lastJump.current = iss.key
    if (si >= 0 && si !== stepIdx) setStepIdx(si); else setTouched((s) => new Set(s))
  }
  const jumpNext = () => {
    if (!errors.length) { toast.success('Semua isian sudah valid'); return }
    const order = errors.map((i) => ({ ...i, si: def.steps.findIndex((s) => s.id === i.step) })).sort((a, b) => a.si - b.si)
    const last = order.findIndex((i) => i.key === lastJump.current)
    const after = order.filter((i, n) => (last >= 0 ? n > last : i.si >= stepIdx))
    focusIssue(after.find((i) => i.key !== lastJump.current) || order[0])
  }

  const kirim = async () => {
    setShownSteps(new Set(['*']))
    if (errors.length) { toast.error(`Masih ada ${errors.length} isian yang belum valid`); jumpNext(); return }
    const dupWeek = reported.find((r) => r.minggu === Number(data.minggu) && r.status === 'dikirim')
    if (dupWeek) { toast.error(`Minggu ${data.minggu} untuk unit ini sudah dilaporkan (${dupWeek.no})`); return }
    if (!window.confirm(`Kirim ${def.listTitle}? Setelah dikirim laporan tidak dapat diubah lagi.`)) return
    setSubmitting(true)
    try {
      const rid = await flush()
      if (!rid) return
      const j = await lapFetch<{ data: LapRecord }>(`/api/v1/laporan/${jenis}/${rid}/kirim`, { method: 'POST' })
      setRec(j.data); dirty.current = false; setSaveState('saved')
      toast.success(`Laporan ${j.data.no_laporan} berhasil dikirim`)
      router.push(def.listHref)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.body?.data) { setRec(e.body.data); setServerErrs(e.body.data.errors || []) }
      toast.error(e instanceof Error ? e.message : String(e))
    } finally { setSubmitting(false) }
  }

  if (loadErr) return <div className="w-full p-8 text-sm text-red-600">Gagal memuat formulir: {loadErr}</div>
  if (!refs || !ready) return <SkeletonDetail />

  const ctx: FieldCtx = {
    jenis, refs, data, readOnly: !editable, geo, no: rec?.no_laporan || null, recordId: rec?.id || recId.current, errs: errMap, warns: warnMap,
    show, touch, set, patch, auto, lampiran, setLampiran, ensureSaved: flush, reported,
  }
  const sections = step.sections.filter((se) => isVisible(se, data))
  const penyakit = jenis === 'ebs' && data.penyakit_rumor ? refs.penyakit.find((p) => p.value === data.penyakit_rumor) : null
  const weekDup = jenis === 'ibs' && data.minggu ? reported.find((r) => r.minggu === Number(data.minggu)) : null
  const dupCount = (dup?.lokal.length || 0) + (dup?.ebs.length || 0)

  const dupPanel = dup && dupCount > 0 && (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800" data-testid="lap-duplikat">
      <div className="mb-1.5 flex items-center gap-2 font-bold uppercase tracking-wider text-amber-700"><Copy className="h-4 w-4" /> Kemungkinan laporan ganda ({dupCount})</div>
      <p className="mb-2">Sudah ada laporan <b>{data.penyakit_rumor}</b> di kab/kota yang sama dalam ±7 hari dari tanggal rumor. Periksa dulu sebelum mengirim.</p>
      <ul className="space-y-1">
        {dup.lokal.map((x) => <li key={`l${x.id}`}>• <Link className="font-semibold underline" href={`${def.listHref}/${x.id}?mode=lihat`} target="_blank">{x.no}</Link> · {STATUS_LABEL[x.status] || x.status} · {x.tgl || '-'} · {x.unit || '-'} · {x.kasus ?? '-'} kasus</li>)}
        {dup.ebs.map((x, i) => <li key={`e${i}`}>• {x.no || 'EBS Kemkes'} (data tersinkron) · {x.tgl || '-'} · {x.unit || '-'} · {x.kasus} kasus{x.status ? ` · ${x.status}` : ''}</li>)}
      </ul>
    </div>
  )
  const indPanel = jenis === 'individu' && dupInd && dupInd.sama.length > 0 && (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800" data-testid="lap-duplikat">
      <div className="mb-1.5 flex items-center gap-2 font-bold uppercase tracking-wider text-amber-700"><Copy className="h-4 w-4" /> Kemungkinan data ganda ({dupInd.sama.length})</div>
      <p className="mb-2">Sudah ada data pasien <b>{data.nama_pasien}</b> di unit yang sama dengan Tanggal Pemeriksaan {data.tgl_periksa}. Periksa dulu sebelum mengirim (tetap boleh dikirim).</p>
      <ul className="space-y-1">{dupInd.sama.map((x) => <li key={x.id}>• <Link className="font-semibold underline" href={`${def.listHref}/${x.id}?mode=lihat`} target="_blank">{x.no}</Link> · {STATUS_LABEL[x.status] || x.status}</li>)}</ul>
    </div>
  )
  const indInfo = jenis === 'ibs' && dupInd && dupInd.periode > 0 && (
    <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800" data-testid="lap-info-individu">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Terdapat <b>{dupInd.periode}</b> data Laporan Individu IBS untuk unit ini pada Minggu {data.minggu}/{data.tahun}. Angka agregat tetap diisi manual (aturan sinkronisasi Individu → Agregat belum dipastikan). <Link href="/ibs/individu" className="font-semibold underline">Lihat Laporan Individu IBS</Link></span>
    </div>
  )
  const weekPanel = weekDup && (
    <div className={`rounded-2xl border p-4 text-xs ${weekDup.status === 'dikirim' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`} data-testid="lap-duplikat">
      <div className="flex items-center gap-2 font-bold"><Copy className="h-4 w-4" />
        {weekDup.status === 'dikirim' ? `Unit ini sudah melaporkan Minggu ${weekDup.minggu}/${data.tahun}` : `Ada draf lain untuk Minggu ${weekDup.minggu}/${data.tahun}`}
      </div>
      <p className="mt-1">Laporan <Link className="font-semibold underline" href={`${def.listHref}/${weekDup.id}`}>{weekDup.no}</Link> ({STATUS_LABEL[weekDup.status]}). {weekDup.status === 'dikirim' ? 'Pilih minggu lain atau buka laporan tersebut.' : 'Lanjutkan draf itu agar tidak ganda.'}</p>
    </div>
  )

  return (
    <div className="w-full space-y-5 bg-page px-3 py-5 pb-24 sm:px-6 sm:py-6 md:pb-6 lg:px-8">
      <header className="skdr-section-head flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" data-testid="page-header">
        <div className="flex items-center gap-3">
          <Link href={def.listHref} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Kembali ke daftar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="skdr-eyebrow">{def.eyebrow}</div>
            <h1 className="skdr-section-title">{def.title}</h1>
            <p className="skdr-section-desc max-w-3xl" data-testid="lap-desc">{def.description}</p>
            <p className="skdr-section-desc">
              {rec ? <span className="font-mono font-semibold text-slate-700">{rec.no_laporan}</span> : 'Draf baru (nomor dibuat saat pertama tersimpan)'}
              {rec && <> · <span className={badge(STATUS_CLS[rec.status] || '')}>{STATUS_LABEL[rec.status] || rec.status}</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500" aria-live="polite">
            {saveState === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Menyimpan…</span>}
            {saveState === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Draf tersimpan {rec?.updated_at?.slice(11, 16) || ''}</span>}
            {saveState === 'dirty' && 'Belum tersimpan…'}
            {saveState === 'error' && <span className="text-red-600">Gagal menyimpan (tersimpan sementara di perangkat)</span>}
            {saveState === 'idle' && !editable && 'Hanya baca'}
          </span>
          {editable && (
            <button onClick={() => flush()} disabled={saveState === 'saving'} data-testid="lap-save"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Simpan Draf
            </button>
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
      {rec && rec.status !== 'draf' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">Laporan ini sudah dikirim{rec.submitted_at ? ` pada ${rec.submitted_at} WIB` : ''} dan tidak dapat diubah.</div>
      )}
      {editable === false && !rec?.submitted_at && !can('pe_input') && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-primary">Akun Anda hanya dapat melihat. Input laporan butuh hak akses <b>Input</b> (pe_input).</div>
      )}

      <style>{`
        @keyframes peShine { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
        .pe-bar { background: linear-gradient(90deg, #16B3AC 0%, #128F8A 35%, #3899FE 70%, #16B3AC 100%); background-size: 200% 100%; animation: peShine 6s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .pe-bar { animation: none } }
        .pe-flash { animation: peFlash 1.4s ease-out } @keyframes peFlash { 0%,40% { box-shadow: 0 0 0 4px rgba(245,158,11,.35); border-radius: 12px } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0) } }
        [data-field] { scroll-margin-top: 100px }
      `}</style>
      <div id="lap-form-top" className="scroll-mt-4" />
      <Stepper def={def} stats={stats} tot={tot} stepIdx={stepIdx} goto={goto} errorsCount={errors.length} jumpNext={jumpNext} editable={editable} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-9">
          {step.desc && <p className="text-xs text-slate-500">{step.desc}</p>}
          {jenis === 'ibs' && (step.id === 's2' || step.id === 's1') && weekPanel}
          {jenis === 'ibs' && step.id === 's3' && indInfo}
          {step.review ? (
            <Review def={def} data={data} ctx={ctx} stats={stats} errors={errors} warnings={warnings} goto={goto} focusIssue={focusIssue} extra={<>{dupPanel}{weekPanel}{indPanel}{indInfo}</>} />
          ) : sections.map((se) => (
            <section key={se.id} className={`${se.tone === 'accent' ? 'rounded-2xl border border-primary/30 bg-primary/[0.03] shadow-xs' : card} p-4 sm:p-5`} data-section={se.id}>
              <div className="skdr-section-head"><h2 className="skdr-section-title">{se.title}</h2>{se.desc && <p className="skdr-section-desc">{se.desc}</p>}</div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                {se.fields.filter((f) => isVisible(f, data)).map((f) => <FieldView key={f.key} f={f} ctx={ctx} />)}
              </div>
            </section>
          ))}
          {!step.review && (step.id === 's2' || step.id === 's3') && dupPanel}
          {!step.review && (step.id === 's2' || step.id === 's3') && indPanel}

          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <button disabled={stepIdx === 0} onClick={() => goto(stepIdx - 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" /> Sebelumnya
            </button>
            <span className="text-[11px] font-semibold text-slate-500 md:hidden">{stepIdx + 1}/{def.steps.length} · {tot.pct}%</span>
            {stepIdx < def.steps.length - 1 ? (
              <button onClick={() => goto(stepIdx + 1)} data-testid="lap-next" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark">
                {stepIdx === def.steps.length - 2 ? 'Tinjau' : 'Berikutnya'} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={kirim} disabled={!editable || submitting} data-testid="lap-kirim" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark disabled:opacity-40">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim Laporan
              </button>
            )}
          </div>
        </div>

        <aside className="space-y-5 xl:col-span-3">
          <div className={`${card} p-4`}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ClipboardList className="h-4 w-4" /> Status laporan</div>
            <dl className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between gap-2"><dt>Nomor</dt><dd className="font-mono font-semibold text-slate-800">{rec?.no_laporan || '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Status</dt><dd>{rec ? <span className={badge(STATUS_CLS[rec.status] || '')}>{STATUS_LABEL[rec.status]}</span> : 'Belum tersimpan'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Dibuat oleh</dt><dd className="text-right">{rec?.created_by_name || user?.full_name || user?.username || '—'}</dd></div>
              {def.defaultWeek && data.tahun && data.minggu && <div className="flex justify-between gap-2"><dt>Periode</dt><dd className="text-right">Minggu {data.minggu}/{data.tahun}<br /><span className="text-slate-400">{weeksOf(Number(data.tahun))[Number(data.minggu) - 1]?.label}</span></dd></div>}
              <div className="flex justify-between gap-2"><dt>Kelengkapan</dt><dd className="font-semibold">{tot.done}/{tot.total} wajib</dd></div>
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
          {penyakit && (penyakit.symptoms || penyakit.transmission || penyakit.disease_name) && (
            <div className={`${card} p-4 text-xs text-slate-600`} data-testid="lap-info-penyakit">
              <div className="mb-2 flex items-center gap-2 font-bold uppercase tracking-wider text-slate-500"><Stethoscope className="h-4 w-4" /> Info penyakit</div>
              <p className="font-semibold text-slate-800">{penyakit.disease_name || penyakit.label}</p>
              {penyakit.symptoms && <p className="mt-1"><b>Gejala umum:</b> {penyakit.symptoms}</p>}
              {penyakit.transmission && <p className="mt-1"><b>Penularan:</b> {penyakit.transmission}</p>}
              <p className="mt-2 text-[10px] text-slate-400">Dari Master Penyakit — sebagai pengingat, bukan diagnosis.</p>
            </div>
          )}
          {rec && rec.events.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><History className="h-4 w-4" /> Riwayat</div>
              <ul className="space-y-2 text-[11px] text-slate-600">
                {rec.events.map((e, i) => <li key={i} className="border-l-2 border-slate-200 pl-2"><span className="font-mono text-slate-400">{e.at} WIB</span><br />{EVENT_LABEL[e.event] || e.event}{e.actor ? ` · ${e.actor}` : ''}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

/** PR 033: exported — also used by the Pengawasan Gizi MBG wizard & Keracunan Pangan MBG
 *  PR 066: Redesign compact, non-sticky (tetap di atas kanvas tanpa mengambang saat scroll),
 *  serta bar progres menggunakan palet resmi SATUSEHAT Design System (#16B3AC / #3899FE)
 */
export function Stepper({ def, stats, tot, stepIdx, goto, errorsCount, jumpNext, editable }: {
  def: Pick<FormDef, 'steps'>; stats: ReturnType<typeof stepStats>; tot: ReturnType<typeof overall>; stepIdx: number; goto: (i: number) => void
  errorsCount: number; jumpNext: () => void; editable: boolean
}) {
  const steps = def.steps
  return (
    <div className={`${card} relative p-3 sm:px-4 sm:py-3 shadow-2xs`} data-testid="lap-stepper">
      {/* Baris 1: Status kemajuan ringkas & tombol pintas validasi */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Kemajuan</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700" data-testid="lap-progress-text">
            {tot.done}/{tot.total} wajib terisi <span className="font-sans font-normal text-slate-400">·</span> {tot.pct}%
          </span>
        </div>
        {editable && (
          <button type="button" onClick={jumpNext} data-testid="lap-jump-invalid" disabled={!errorsCount}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700 shadow-2xs">
            {errorsCount ? (
              <>
                <ChevronsRight className="h-3.5 w-3.5 text-amber-600" />
                <span className="hidden sm:inline">Lompat ke isian belum valid</span>
                <span className="sm:hidden">Belum valid</span>
                <span className="ml-0.5 rounded-full bg-amber-200/90 px-1 text-[10px] font-bold text-amber-900">{errorsCount}</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" /> Semua isian valid
              </>
            )}
          </button>
        )}
      </div>

      {/* Baris 2: Slim progress bar bernuansa SATUSEHAT Design System */}
      <div className="my-2 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={tot.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan pengisian">
          <div className="pe-bar h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${tot.pct}%` }} />
        </div>
        <span className="font-mono text-[11px] font-bold text-slate-600 tabular-nums">{tot.pct}%</span>
      </div>

      {/* Mobile: compact dots + current title */}
      <div className="flex items-center gap-2 sm:hidden pt-0.5">
        <div className="flex gap-1">
          {steps.map((s, i) => {
            const done = (s.review ? errorsCount : stats[i].errs.length) === 0
            return (
              <button key={s.id} type="button" onClick={() => goto(i)} aria-label={`Langkah ${i + 1}: ${s.title}`}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  i === stepIdx
                    ? 'bg-primary text-white ring-2 ring-primary/30'
                    : done
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-amber-300'
                }`}>
                {done && i !== stepIdx ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </button>
            )
          })}
        </div>
        <div className="min-w-0 text-[11px] leading-tight">
          <p className="truncate font-semibold text-primary">{steps[stepIdx].title}</p>
          <p className={stats[stepIdx].errs.length ? 'text-amber-600' : 'text-emerald-600'}>
            {stats[stepIdx].total ? `${stats[stepIdx].done}/${stats[stepIdx].total} wajib` : 'tanpa isian wajib'}
          </p>
        </div>
      </div>

      {/* Tablet & Desktop: connected compact steps */}
      <ol className="-mx-1 hidden snap-x gap-0 overflow-x-auto px-1 sm:flex xl:overflow-visible">
        {steps.map((s, i) => {
          const st = stats[i]
          const n = s.review ? errorsCount : st.errs.length
          const done = n === 0
          const active = i === stepIdx
          const R = 8, C = 2 * Math.PI * R
          return (
            <li key={s.id} className="group relative flex min-w-[110px] flex-1 snap-start items-start">
              {i > 0 && (
                <span aria-hidden className="absolute right-1/2 top-[15px] h-0.5 w-full overflow-hidden bg-slate-200">
                  <span className="block h-full bg-[#16B3AC] transition-[width] duration-500" style={{ width: `${Math.round(stats[i - 1].pct * 100)}%` }} />
                </span>
              )}
              <button type="button" onClick={() => goto(i)} aria-current={active ? 'step' : undefined} data-testid={`lap-step-${i + 1}`}
                aria-label={`Langkah ${i + 1}: ${s.title}. ${done ? 'Lengkap' : `${n} isian belum valid`}`}
                className={`relative z-10 mx-auto flex w-full flex-col items-center gap-1 rounded-xl px-1.5 py-1 text-center transition duration-200 ${
                  active
                    ? 'bg-brand-50/80 border border-brand-300/80 shadow-2xs'
                    : 'border border-transparent hover:bg-slate-50/80'
                }`}>
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <svg viewBox="0 0 24 24" className="absolute inset-0 h-7 w-7 -rotate-90" aria-hidden>
                    <circle cx="12" cy="12" r={R} fill="none" strokeWidth="2" className="stroke-slate-200" />
                    <circle cx="12" cy="12" r={R} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - st.pct)}
                      className={`transition-[stroke-dashoffset] duration-500 ${done ? 'stroke-emerald-500' : 'stroke-brand-500'}`} />
                  </svg>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-500 text-white shadow-2xs' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}>
                    {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                  </span>
                  {!done && n > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500 px-1 text-[8px] font-bold leading-3.5 text-white shadow" title={`${n} isian belum valid`}>
                      <TriangleAlert className="h-2 w-2" />{n}
                    </span>
                  )}
                </span>
                <span className={`line-clamp-1 truncate text-[11px] font-semibold leading-tight ${active ? 'text-brand-700 font-bold' : 'text-slate-700'}`}>{s.title}</span>
                <span className={`text-[9.5px] leading-tight ${done ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {s.review ? (done ? 'siap dikirim' : 'periksa') : st.total ? `${st.done}/${st.total} wajib` : 'tanpa wajib'}
                </span>
              </button>
              <div role="tooltip" className="pointer-events-none invisible absolute left-1/2 top-full z-40 mt-1 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left text-[11px] opacity-0 shadow-lg transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <p className="mb-1 font-bold text-slate-800">{s.title}</p>
                {done ? <p className="text-emerald-600">{s.review ? 'Laporan siap dikirim.' : 'Semua isian di bagian ini sudah valid.'}</p> : s.review ? <p className="text-amber-700">{n} isian di langkah lain belum valid.</p> : (
                  <ul className="space-y-0.5 text-slate-600">
                    {st.errs.slice(0, 6).map((e) => <li key={e.key + e.msg} className="flex gap-1"><span className="text-amber-500">•</span><span>{e.msg}</span></li>)}
                    {n > 6 && <li className="text-slate-400">+{n - 6} isian lainnya</li>}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── Tinjau & Kirim ───────────────────────────────────────────────────────────
const stripHtml = (h: string) => h.replace(/<\/(p|li|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

function display(f: FieldDef, ctx: FieldCtx): string | null {
  const v = ctx.data[f.key]
  const g = ctx.geo
  if (f.type === 'info') return f.info ? f.info(ctx.data, { no: ctx.no }) : null
  if (f.type === 'umur') return umurText(ctx.data)
  if (!isFilled(v) && f.type !== 'agegrid') return null
  switch (f.type) {
    case 'province': return g.provinces?.find((o) => o.value === String(v))?.label || `ID ${v}`
    case 'kabkota': {
      const pid = f.depends ? ctx.data[f.depends] : null
      const list = [...(pid ? g.kab[String(pid)] || [] : []), ...(g.kab.all || [])]
      return list.find((o) => o.value === String(v))?.label || `ID ${v}`
    }
    case 'kecamatan': return ctx.data.kecamatan_nama || String(v)
    case 'select': case 'multiselect': {
      const opts = optionsFor(f, ctx.refs, v)
      return (Array.isArray(v) ? v : [v]).map((x) => opts.find((o) => o.value === String(x))?.label || String(x)).join(', ')
    }
    case 'date': return `${v}${f.epi ? ` · ${epiLabel(v)}` : ''}`
    case 'decimal': {
      const extra = f.key === 'imt' && Number(String(v).replace(',', '.')) > 0 ? ` · ${imtKategori(Number(String(v).replace(',', '.')))}` : ''
      return `${v}${f.unit ? ` ${f.unit}` : ''}${extra}`
    }
    case 'richtext': return stripHtml(String(v))
    case 'check': case 'domsama': return v ? 'Ya' : null
    case 'epiweek': { const w = weeksOf(Number(ctx.data.tahun))[Number(v) - 1]; return `Minggu ${v}${w ? ` · ${w.label}` : ''}` }
    case 'agegrid': {
      const t = usiaTotals(ctx.data)
      return t.total ? SEXES.map((s) => `${s.label} ${s.key === 'pria' ? t.pria : t.wanita}`).join(' · ') + ` (total ${t.total})` : null
    }
    case 'lampiran': return ctx.lampiran.length ? ctx.lampiran.map((l) => l.nama_file).join(', ') : null
    default: return String(v)
  }
}

function Review({ def, data, ctx, stats, errors, warnings, goto, focusIssue, extra }: {
  def: FormDef; data: Data; ctx: FieldCtx; stats: ReturnType<typeof stepStats>; errors: Issue[]; warnings: Issue[]
  goto: (i: number) => void; focusIssue: (i: Issue) => void; extra: React.ReactNode
}) {
  const rows = ctx.refs.ibs_penyakit.filter((p) => !p.is_total)
  const r = data.rows || {}
  return (
    <div className="space-y-4" data-testid="lap-review">
      {errors.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <div className="mb-2 flex items-center gap-2 font-bold"><CircleAlert className="h-4 w-4" /> {errors.length} isian perlu diperbaiki sebelum dikirim</div>
          <ul className="space-y-1">
            {errors.map((e) => (
              <li key={e.key + e.msg}><button type="button" onClick={() => focusIssue(e)} className="text-left hover:underline">• <b>{def.steps.find((s) => s.id === e.step)?.title}:</b> {e.msg}</button></li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" /> Semua isian wajib lengkap & valid — laporan siap dikirim.</div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-white p-4 text-xs text-amber-800">
          <div className="mb-1 flex items-center gap-2 font-bold"><TriangleAlert className="h-4 w-4" /> Peringatan (boleh tetap dikirim)</div>
          <ul className="space-y-0.5">{Array.from(new Set(warnings.map((w) => w.msg))).map((m) => <li key={m}>• {m}</li>)}</ul>
        </div>
      )}
      {extra}
      {def.steps.map((st: StepDef, i) => {
        if (st.review) return null
        const fields = visibleFields(st, data).filter((f) => f.type !== 'ibsgrid')
        const n = stats[i].errs.length
        return (
          <section key={st.id} className={`${card} p-4 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${n ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>{n ? n : <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                {i + 1}. {st.title}
              </h2>
              {!ctx.readOnly && <button type="button" onClick={() => goto(i)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Pencil className="h-3 w-3" /> Ubah</button>}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              {fields.map((f) => {
                const val = display(f, ctx)
                const own = f.type === 'umur' ? [f.key, ...UMUR_PARTS.map((p) => p.key)] : [f.key]
                const missing = !val && stats[i].errs.some((e) => own.includes(e.key.split('.')[0]))
                if (!val && !missing) return null
                return (
                  <div key={f.key} className={f.type === 'richtext' || f.type === 'textarea' || f.type === 'agegrid' ? 'sm:col-span-2' : ''}>
                    <dt className="text-[11px] font-semibold text-slate-400">{f.label}</dt>
                    <dd className={`whitespace-pre-line ${missing ? 'font-semibold text-red-600' : 'text-slate-800'}`}>{val || 'Belum diisi'}</dd>
                  </div>
                )
              })}
            </dl>
            {st.sections.some((se) => se.fields.some((f) => f.type === 'ibsgrid')) && (() => {
              const filled = rows.filter((x) => IBS_COLS.some((c) => Number(r[x.kode]?.[c.key]) > 0))
              const t = ibsTotals(data, rows)
              return (
                <div className="mt-3 overflow-x-auto">
                  {filled.length ? (
                    <table className="w-full text-xs">
                      <thead className="text-slate-400"><tr><th className="py-1 text-left font-semibold">Penyakit</th>{IBS_COLS.map((c) => <th key={c.key} className="w-20 text-center font-semibold">{c.short}</th>)}</tr></thead>
                      <tbody>{filled.map((x) => <tr key={x.kode} className="border-t border-slate-100"><td className="py-1"><span className="mr-1.5 font-mono text-[10px] font-bold text-primary">{x.kode_sms}</span>{x.nama}</td>{IBS_COLS.map((c) => <td key={c.key} className="text-center tabular-nums">{r[x.kode]?.[c.key] ?? 0}</td>)}</tr>)}</tbody>
                      <tfoot><tr className="border-t border-slate-200 font-semibold"><td className="py-1">Total</td>{IBS_COLS.map((c) => <td key={c.key} className="text-center tabular-nums">{t[c.key]}</td>)}</tr></tfoot>
                    </table>
                  ) : <p className="flex items-center gap-1 text-xs text-slate-500"><Info className="h-3.5 w-3.5" /> Semua penyakit 0 kasus (laporan nihil).</p>}
                </div>
              )
            })()}
          </section>
        )
      })}
    </div>
  )
}
