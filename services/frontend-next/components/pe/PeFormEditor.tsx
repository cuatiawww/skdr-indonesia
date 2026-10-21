'use client'
// PR 006: PE form editor — multi-step sections with progress, inline validation, autosave draft,
// computed classification (+ override with reason), workflow actions and history. Schema-driven (pe_form_definitions).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, ClipboardList, Loader2, Save, ShieldCheck, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { inputCls } from '@/components/master/MasterUi'
import { cond, isFilled, labelsOf, pruneHidden, validateAll, warningsAll, checkField, type Data, type Issue, type PeField, type PeSchema } from '@/lib/pe-engine'
import { ApiError, CLASS_STYLE, peFetch, STATUS_STYLE } from '@/lib/pe-api'
import { FieldView, type FieldCtx, type Masters, type Opt } from './PeFields'

interface Transition { from: string; to: string; label: string; roles?: string[]; validate?: boolean; note_required?: boolean }
interface Workflow { editable_status: string[]; status_labels: Record<string, string>; transitions: Transition[] }
interface FormDef { definition_id: number; version: number; disease_id: number | null; schema: PeSchema; workflow: Workflow; today: string }
interface CaseRec {
  id: number; no_pe: string; status: string; form_version: number; data: Data; errors: Issue[]; warnings: Issue[]
  classification: string | null; classification_label: string | null; classification_basis: string | null
  classification_override: string | null; classification_override_label: string | null; override_reason: string | null
  updated_at: string | null; events: { event: string; from: string | null; to: string | null; note: string | null; role: string | null; at: string | null }[]
}
interface Cluster { id: number; code: string; name: string; province_id: number | null; kabkota_id: number | null; kecamatan: string | null; tgl_rumor: string | null; lokasi: string | null; status: string; monitoring: Data; cases: number }

const card = 'rounded-2xl border border-slate-200 bg-white shadow-xs'
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`

function useMasters(): Masters {
  const [provinces, setProv] = useState<Opt[]>([])
  const [kabkota, setKab] = useState<Record<string, Opt[]>>({})
  const loading = useRef(new Set<string>())
  useEffect(() => { peFetch<{ data: Opt[] }>('/api/v1/master/provinces').then((j) => setProv(j.data)).catch(() => {}) }, [])
  const loadKab = useCallback((pid: string) => {
    if (!pid || loading.current.has(pid)) return
    loading.current.add(pid)
    peFetch<{ data: Opt[] }>(`/api/v1/master/kabkota?province_id=${pid}`).then((j) => setKab((m) => ({ ...m, [pid]: j.data }))).catch(() => loading.current.delete(pid))
  }, [])
  return { provinces, kabkota, loadKab }
}

export default function PeFormEditor({ formKey, caseId }: { formKey: string; caseId: number | null }) {
  const { t } = useTranslation()
  const router = useRouter()
  const masters = useMasters()
  const [def, setDef] = useState<FormDef | null>(null)
  const [rec, setRec] = useState<CaseRec | null>(null)
  const [data, setData] = useState<Data>({})
  const [stepIdx, setStepIdx] = useState(0)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [shownSteps, setShownSteps] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [clusterModal, setClusterModal] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [transition, setTransition] = useState<Transition | null>(null)
  const idRef = useRef<number | null>(caseId)
  const dataRef = useRef<Data>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef<Promise<void> | null>(null)

  // load schema + case
  useEffect(() => {
    (async () => {
      try {
        const f = await peFetch<{ data: FormDef }>(`/api/v1/pe/forms/${formKey}`)
        setDef(f.data)
        if (caseId) {
          const c = await peFetch<{ data: CaseRec }>(`/api/v1/pe/cases/${caseId}`)
          setRec(c.data); setData(c.data.data); dataRef.current = c.data.data
        }
      } catch (e) { setLoadErr(e instanceof Error ? e.message : String(e)) }
    })()
  }, [formKey, caseId])
  const loadClusters = useCallback(() => peFetch<{ data: Cluster[] }>(`/api/v1/pe/clusters?form=${formKey}`).then((j) => setClusters(j.data)).catch(() => {}), [formKey])
  useEffect(() => { loadClusters() }, [loadClusters])
  // preload kab/kota lists for chosen provinces
  useEffect(() => { ['lapor_provinsi', 'dom_provinsi'].forEach((k) => data[k] && masters.loadKab(String(data[k]))) }, [data.lapor_provinsi, data.dom_provinsi]) // eslint-disable-line react-hooks/exhaustive-deps

  const schema = def?.schema
  const editable = !rec || (def?.workflow.editable_status || ['draf']).includes(rec.status)
  const today = def?.today || new Date().toISOString().slice(0, 10)
  const issues = useMemo(() => (schema ? validateAll(schema, data, today) : []), [schema, data, today])
  const warnings = useMemo(() => (schema ? warningsAll(schema, data) : []), [schema, data])
  const errMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    const add = (i: Issue) => { (m[i.key] ||= []).includes(i.msg) || m[i.key].push(i.msg) }
    issues.forEach(add)
    ;(rec?.errors || []).filter((e) => /tidak sesuai|tidak ditemukan/.test(e.msg)).forEach(add) // DB-backed checks (server only)
    return m
  }, [issues, rec?.errors])

  const save = useCallback(async () => {
    if (!schema) return
    if (saving.current) await saving.current
    const body = pruneHidden(schema, dataRef.current)
    setSaveState('saving')
    const p = (async () => {
      try {
        const j = idRef.current
          ? await peFetch<{ data: CaseRec }>(`/api/v1/pe/cases/${idRef.current}`, { method: 'PUT', body: { data: body } })
          : await peFetch<{ data: CaseRec }>('/api/v1/pe/cases', { method: 'POST', body: { form_key: formKey, data: body } })
        if (!idRef.current) { idRef.current = j.data.id; window.history.replaceState(null, '', `${window.location.pathname.replace(/\/baru$/, '')}/${j.data.id}`) }
        setRec(j.data)
        // derived fields (No. PE, umur, tanggal pertama berobat) come back from the server
        const derived: Data = {}
        const walk = (fs: PeField[]) => fs.forEach((f) => { if (f.type === 'auto') derived[f.key] = j.data.data[f.key] ?? null })
        schema.steps.forEach((s) => s.sections.forEach((se) => walk(se.fields)))
        dataRef.current = { ...dataRef.current, ...derived }
        setData((d) => ({ ...d, ...derived }))
        setSaveState('saved')
      } catch (e) {
        setSaveState('error'); toast.error(e instanceof Error ? e.message : String(e))
      }
    })()
    saving.current = p
    await p
    saving.current = null
  }, [schema, formKey])

  const update = (k: string, v: any) => {
    if (!editable) return
    const next = { ...dataRef.current, [k]: v }
    dataRef.current = next; setData(next); setSaveState('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { save() }, 1500)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (saveState === 'dirty' || saveState === 'saving') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [saveState])

  if (loadErr) return <div className="w-full p-8 text-sm text-red-600">{t('skdr.master.loadFailed')}: {loadErr}</div>
  if (!schema || !def) return <div className="flex w-full items-center justify-center p-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin text-[#0060A9]" /></div>

  const steps = schema.steps
  const step = steps[stepIdx]
  const stepErrors = (sid: string) => issues.filter((i) => i.step === sid)
  // progress: visible required fields filled (root level) over all visible required fields
  const reqStats = (() => {
    let total = 0, done = 0
    steps.forEach((st) => st.sections.forEach((se) => se.fields.forEach((f) => {
      if (!f.required || ['auto', 'info'].includes(f.type) || (f.visible && !cond(f.visible, data))) return
      total++; if (f.type === 'cluster_monitoring' ? isFilled(data.cluster_id) : isFilled(data[f.key])) done++
    })))
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
  })()
  const show = (path: string) => touched.has(path) || shownSteps.has(step.id) || shownSteps.has('*')
  const touch = (path: string) => setTouched((s) => (s.has(path) ? s : new Set(s).add(path)))
  const goto = async (i: number) => {
    setShownSteps((s) => new Set(s).add(step.id))
    if (saveState === 'dirty') { if (timer.current) clearTimeout(timer.current); await save() }
    setStepIdx(i); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cluster = clusters.find((c) => c.id === Number(data.cluster_id)) || null
  const ctx: FieldCtx = {
    root: data, row: null, disabled: !editable, masters, errors: errMap, show, touch, formKey, diseaseId: def.disease_id,
    clusters: clusters.map((c) => ({ id: c.id, name: `${c.code} · ${c.name}${c.status === 'selesai' ? ` (${t('skdr.pe.clusterDone')})` : ''}` })),
    onNewCluster: () => setClusterModal(true),
    renderMonitoring: () => <ClusterMonitoring schema={schema} cluster={cluster} today={today} onSaved={loadClusters} disabled={!editable} />,
  }

  const transitions = rec ? def.workflow.transitions.filter((x) => x.from === rec.status) : []
  const effective = rec?.classification_override || rec?.classification
  const effectiveLabel = rec?.classification_override_label || rec?.classification_label
  const statusLabel = (s: string) => def.workflow.status_labels?.[s] || s
  const classLabel = (c: string) => [...(schema.classification?.rules || []), ...(schema.classification?.fallback ? [schema.classification.fallback] : [])].find((x) => x.code === c)?.label || c
  const finish = async () => {
    setShownSteps(new Set(['*']))
    if (timer.current) clearTimeout(timer.current)
    await save()
    toast.success(schema.finish_message || t('skdr.pe.saved'))
    router.push(`/pe/${formKey}`)
  }

  return (
    <div className="w-full space-y-5 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Link href={`/pe/${formKey}`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title={t('skdr.pe.backToList')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold uppercase tracking-[0.04em] text-slate-900">{schema.title}</h1>
            <p className="text-xs text-slate-500">
              {rec ? <span className="font-mono font-semibold text-slate-700">{rec.no_pe}</span> : t('skdr.pe.newDraft')} · {t('skdr.pe.formVersion', { v: rec?.form_version ?? def.version })}
              {rec && <> · <span className={badge(STATUS_STYLE[rec.status] || '')}>{statusLabel(rec.status)}</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">
            {saveState === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('skdr.pe.saving')}</span>}
            {saveState === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{t('skdr.pe.autosaved', { at: rec?.updated_at?.slice(11) || '' })}</span>}
            {saveState === 'dirty' && t('skdr.pe.unsaved')}
            {saveState === 'error' && <span className="text-red-600">{t('skdr.pe.saveFailed')}</span>}
            {saveState === 'idle' && !editable && t('skdr.pe.readOnly')}
          </span>
          {editable && (
            <button onClick={() => { if (timer.current) clearTimeout(timer.current); save() }} disabled={saveState === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {t('skdr.pe.saveDraft')}
            </button>
          )}
        </div>
      </div>

      {/* stepper + progress */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-slate-500">{t('skdr.pe.progress')}</span>
          <span className="font-semibold text-slate-600">{t('skdr.pe.progressText', { done: reqStats.done, total: reqStats.total, pct: reqStats.pct })}</span>
        </div>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0060A9] transition-all" style={{ width: `${reqStats.pct}%` }} /></div>
        <ol className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          {steps.map((s, i) => {
            const n = stepErrors(s.id).length
            const active = i === stepIdx
            return (
              <li key={s.id}>
                <button onClick={() => goto(i)} className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left transition ${active ? 'border-[#0060A9] bg-[#0060A9]/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${n === 0 ? 'bg-emerald-500 text-white' : active ? 'bg-[#0060A9] text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {n === 0 ? '✓' : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[11px] font-semibold leading-tight ${active ? 'text-[#0060A9]' : 'text-slate-700'}`}>{s.title}</span>
                    <span className={`text-[10px] ${n ? 'text-amber-600' : 'text-emerald-600'}`}>{n ? t('skdr.pe.stepIssues', { n }) : t('skdr.pe.stepComplete')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* main form */}
        <div className="space-y-5 xl:col-span-9">
          {step.sections.filter((se) => !se.visible || cond(se.visible, data)).map((se) => (
            <section key={se.id} className={`${card} p-5`}>
              <h2 className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">{se.title}</h2>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
                {se.fields.map((f) => (
                  <FieldView key={f.key} f={f} value={data[f.key]} path={f.key} ctx={ctx} onChange={(v) => update(f.key, v)} setOther={update} />
                ))}
              </div>
            </section>
          ))}
          <div className="flex items-center justify-between">
            <button disabled={stepIdx === 0} onClick={() => goto(stepIdx - 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" /> {t('skdr.pe.prev')}
            </button>
            {stepIdx < steps.length - 1 ? (
              <button onClick={() => goto(stepIdx + 1)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#004b85]">
                {t('skdr.pe.next')} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={finish} disabled={!editable} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#004b85] disabled:opacity-40">
                <Save className="h-4 w-4" /> {t('skdr.pe.saveExit')}
              </button>
            )}
          </div>
        </div>

        {/* side panel */}
        <aside className="space-y-5 xl:col-span-3">
          <div className={`${card} p-4`}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ShieldCheck className="h-4 w-4" />{t('skdr.pe.classification')}</div>
            {!rec ? <p className="text-xs text-slate-400">{t('skdr.pe.classAfterSave')}</p> : (
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {effective ? <span className={badge(CLASS_STYLE[effective] || 'border-slate-200 bg-slate-50 text-slate-600')}>{effectiveLabel}</span> : <span className="text-slate-400">{t('skdr.pe.classPending')}</span>}
                  {rec.classification_override && <span className="text-[10px] font-semibold text-amber-600">{t('skdr.pe.overridden')}</span>}
                </div>
                {rec.classification_override && <p className="text-slate-500">{t('skdr.pe.systemClass')}: <b>{rec.classification_label || t('skdr.pe.classPending')}</b> · {t('skdr.pe.reason')}: {rec.override_reason}</p>}
                {rec.classification_basis && <p className="text-slate-500">{rec.classification_basis}</p>}
                {rec.status !== 'final' && <button onClick={() => setOverrideOpen(true)} className="text-[11px] font-semibold text-[#0060A9] hover:underline">{t('skdr.pe.overrideBtn')}</button>}
              </div>
            )}
          </div>

          {(warnings.length > 0 || (rec?.warnings || []).length > 0) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700"><TriangleAlert className="h-4 w-4" />{t('skdr.pe.warnings')}</div>
              <ul className="space-y-1 text-xs text-amber-800">
                {Array.from(new Set([...warnings, ...(rec?.warnings || [])].map((w) => w.msg))).map((m) => <li key={m}>• {m}</li>)}
              </ul>
            </div>
          )}

          <div className={`${card} p-4`}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ClipboardList className="h-4 w-4" />{t('skdr.pe.workflow')}</div>
            {!rec ? <p className="text-xs text-slate-400">{t('skdr.pe.workflowAfterSave')}</p> : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{t('skdr.pe.currentStatus')}: <span className={badge(STATUS_STYLE[rec.status] || '')}>{statusLabel(rec.status)}</span></p>
                {issues.length > 0 && editable && (
                  <button onClick={() => { setShownSteps(new Set(['*'])); const first = steps.findIndex((s) => stepErrors(s.id).length); if (first >= 0) setStepIdx(first) }}
                    className="flex w-full items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-semibold text-amber-700">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" /> {t('skdr.pe.issuesLeft', { n: issues.length })}
                  </button>
                )}
                {transitions.map((x) => (
                  <button key={x.to} onClick={() => setTransition(x)} disabled={saveState === 'saving'}
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider ${x.to === 'dikembalikan' ? 'border border-amber-300 bg-white text-amber-700 hover:bg-amber-50' : 'bg-[#0060A9] text-white hover:bg-[#004b85]'} disabled:opacity-50`}>
                    {x.label}
                  </button>
                ))}
                <p className="text-[10px] text-slate-400">{t('skdr.pe.roleHook')}</p>
              </div>
            )}
          </div>

          {rec && rec.events.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t('skdr.pe.history')}</div>
              <ul className="max-h-72 space-y-2 overflow-auto text-[11px] text-slate-600">
                {rec.events.map((e, i) => (
                  <li key={i} className="border-l-2 border-slate-200 pl-2">
                    <span className="font-mono text-slate-400">{e.at} WIB</span><br />
                    {t(`skdr.pe.event.${e.event}`)}: {e.from ? `${eventVal(e.event, e.from, statusLabel, classLabel)} → ` : ''}{eventVal(e.event, e.to, statusLabel, classLabel) || '—'}
                    {e.role && <span className="text-slate-400"> ({e.role})</span>}
                    {e.note && <><br /><i>“{e.note}”</i></>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <ClusterModal open={clusterModal} onClose={() => setClusterModal(false)} formKey={formKey} masters={masters} today={today}
        defaults={{ province_id: data.lapor_provinsi, kabkota_id: data.lapor_kabkota, kecamatan: data.lapor_kecamatan, tgl_rumor: data.tgl_rumor, lokasi: data.lokasi_rumor }}
        onCreated={(c) => { loadClusters(); update('cluster_id', c.id) }} />
      {rec && schema.classification && (
        <OverrideModal open={overrideOpen} onClose={() => setOverrideOpen(false)} rec={rec}
          options={[...schema.classification.rules, ...(schema.classification.fallback ? [schema.classification.fallback] : [])]}
          onDone={(r) => setRec(r)} />
      )}
      {rec && transition && (
        <TransitionModal tr={transition} rec={rec} onClose={() => setTransition(null)} beforeSubmit={async () => { if (timer.current) clearTimeout(timer.current); await save() }}
          onDone={(r) => { setRec(r); setTransition(null) }} onInvalid={(r) => { setRec(r); setShownSteps(new Set(['*'])); setTransition(null) }} />
      )}
    </div>
  )
}

const eventVal = (ev: string, v: string | null, statusLabel: (s: string) => string, classLabel: (c: string) => string) =>
  v == null ? '' : ev === 'status' || ev === 'dibuat' ? statusLabel(v) : classLabel(v)

function ClusterMonitoring({ schema, cluster, today, onSaved, disabled }: { schema: PeSchema; cluster: Cluster | null; today: string; onSaved: () => void; disabled: boolean }) {
  const { t } = useTranslation()
  const [m, setM] = useState<Data>({})
  const [busy, setBusy] = useState(false)
  const [showErr, setShowErr] = useState(false)
  useEffect(() => { setM(cluster?.monitoring || {}) }, [cluster])
  if (!cluster) return <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">{t('skdr.pe.linkClusterFirst')}</p>
  const fields = schema.cluster_fields || []
  const labels = labelsOf(schema)
  const errs: Issue[] = []
  fields.forEach((f) => checkField(f, m, null, '', '', today, labels, errs))
  const errMap: Record<string, string[]> = {}
  errs.forEach((e) => (errMap[e.key] ||= []).push(e.msg))
  const saveMon = async () => {
    setShowErr(true)
    if (errs.length) return
    setBusy(true)
    try {
      await peFetch(`/api/v1/pe/clusters/${cluster.id}`, { method: 'PUT', body: { ...cluster, monitoring: m } })
      toast.success(t('skdr.pe.monitoringSaved', { code: cluster.code })); onSaved()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <p className="text-xs text-slate-600">{t('skdr.pe.monitoringFor', { code: cluster.code, name: cluster.name, n: cluster.cases })}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
            <input type={f.type === 'date' ? 'date' : 'number'} className={inputCls} disabled={disabled} value={m[f.key] ?? ''}
              onChange={(e) => setM({ ...m, [f.key]: e.target.value === '' ? null : f.type === 'date' ? e.target.value : Number(e.target.value) })} />
            {showErr && (errMap[f.key] || []).map((x) => <p key={x} className="text-[11px] font-medium text-red-600">{x}</p>)}
          </div>
        ))}
      </div>
      {!disabled && <button onClick={saveMon} disabled={busy} className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#004b85] disabled:opacity-50">{t('skdr.pe.saveMonitoring')}</button>}
    </div>
  )
}

function ClusterModal({ open, onClose, formKey, masters, defaults, onCreated, today }: {
  open: boolean; onClose: () => void; formKey: string; masters: Masters; today: string
  defaults: { province_id?: any; kabkota_id?: any; kecamatan?: any; tgl_rumor?: any; lokasi?: any }; onCreated: (c: Cluster) => void
}) {
  const { t } = useTranslation()
  const [f, setF] = useState<Data>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ name: '', ...defaults }) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (f.province_id) masters.loadKab(String(f.province_id)) }, [f.province_id, masters])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      const j = await peFetch<{ data: Cluster }>('/api/v1/pe/clusters', { method: 'POST', body: { form_key: formKey, ...f } })
      toast.success(t('skdr.pe.clusterCreated', { code: j.data.code })); onCreated(j.data); onClose()
    } catch (er) { toast.error(er instanceof Error ? er.message : String(er)) } finally { setBusy(false) }
  }
  const lab = 'mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500'
  return (
    <Modal open={open} onClose={onClose} title={t('skdr.pe.newClusterTitle')}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className={lab}>{t('skdr.pe.clusterName')} *</label><input className={inputCls} value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lab}>{t('skdr.filter.province')}</label>
            <select className={inputCls} value={f.province_id ?? ''} onChange={(e) => setF({ ...f, province_id: e.target.value ? Number(e.target.value) : null, kabkota_id: null })}>
              <option value="">{t('skdr.pe.chooseProvince')}</option>{masters.provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><label className={lab}>{t('skdr.pe.kabkota')}</label>
            <select className={inputCls} value={f.kabkota_id ?? ''} disabled={!f.province_id} onChange={(e) => setF({ ...f, kabkota_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t('skdr.pe.chooseKab')}</option>{(masters.kabkota[String(f.province_id)] || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select></div>
          <div><label className={lab}>{t('skdr.pe.kecamatan')}</label><input className={inputCls} value={f.kecamatan || ''} onChange={(e) => setF({ ...f, kecamatan: e.target.value })} /></div>
          <div><label className={lab}>{t('skdr.pe.tglRumor')}</label><input type="date" max={today} className={inputCls} value={f.tgl_rumor || ''} onChange={(e) => setF({ ...f, tgl_rumor: e.target.value })} /></div>
        </div>
        <div><label className={lab}>{t('skdr.pe.lokasi')}</label><input className={inputCls} value={f.lokasi || ''} onChange={(e) => setF({ ...f, lokasi: e.target.value })} /></div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">{t('common.cancel')}</button>
          <button disabled={busy} className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

function OverrideModal({ open, onClose, rec, options, onDone }: { open: boolean; onClose: () => void; rec: CaseRec; options: { code: string; label: string }[]; onDone: (r: CaseRec) => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) { setCode(rec.classification_override || ''); setReason(rec.override_reason || '') } }, [open, rec])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { const j = await peFetch<{ data: CaseRec }>(`/api/v1/pe/cases/${rec.id}/classification`, { method: 'PUT', body: { code: code || null, reason } }); onDone(j.data); toast.success(t('skdr.pe.overrideSaved')); onClose() }
    catch (er) { toast.error(er instanceof Error ? er.message : String(er)) }
  }
  return (
    <Modal open={open} onClose={onClose} title={t('skdr.pe.overrideTitle')}>
      <form onSubmit={submit} className="space-y-3 text-xs">
        <p className="text-slate-500">{t('skdr.pe.systemClass')}: <b>{rec.classification_label || t('skdr.pe.classPending')}</b></p>
        <select className={inputCls} value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">{t('skdr.pe.useSystem')}</option>
          {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
        </select>
        {code && <textarea className={inputCls} rows={3} placeholder={t('skdr.pe.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} required />}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600">{t('common.cancel')}</button>
          <button className="rounded-xl bg-[#0060A9] px-4 py-2 font-bold uppercase tracking-wider text-white">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

function TransitionModal({ tr, rec, onClose, onDone, onInvalid, beforeSubmit }: {
  tr: Transition; rec: CaseRec; onClose: () => void; onDone: (r: CaseRec) => void; onInvalid: (r: CaseRec) => void; beforeSubmit: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      await beforeSubmit()
      const j = await peFetch<{ data: CaseRec }>(`/api/v1/pe/cases/${rec.id}/status`, { method: 'POST', body: { to: tr.to, note } })
      toast.success(t('skdr.pe.statusChanged', { label: tr.label })); onDone(j.data)
    } catch (er) {
      toast.error(er instanceof Error ? er.message : String(er))
      if (er instanceof ApiError && er.status === 422 && er.body?.data) onInvalid(er.body.data)
    } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={tr.label}>
      <form onSubmit={submit} className="space-y-3 text-xs">
        <p className="text-slate-600">{t('skdr.pe.confirmTransition', { no: rec.no_pe, label: tr.label })}</p>
        <textarea className={inputCls} rows={3} placeholder={tr.note_required ? t('skdr.pe.noteRequired') : t('skdr.pe.noteOptional')} value={note} onChange={(e) => setNote(e.target.value)} required={!!tr.note_required} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600">{t('common.cancel')}</button>
          <button disabled={busy} className="rounded-xl bg-[#0060A9] px-4 py-2 font-bold uppercase tracking-wider text-white disabled:opacity-50">{tr.label}</button>
        </div>
      </form>
    </Modal>
  )
}
