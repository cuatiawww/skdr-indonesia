'use client'
// PR 006: field renderers for the PE form engine (config-driven; one renderer per field type).
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Plus, Trash2, Search, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { inputCls } from '@/components/master/MasterUi'
import { cond, isFilled, optionsFor, type Data, type Issue, type PeField } from '@/lib/pe-engine'
import { peFetch } from '@/lib/pe-api'

export interface Opt { id: number; name: string }
export interface Masters { provinces: Opt[]; kabkota: Record<string, Opt[]>; loadKab: (provinceId: string) => void }

export interface FieldCtx {
  root: Data; row: Data | null; disabled: boolean; masters: Masters; errors: Record<string, string[]>; show: (path: string) => boolean
  touch: (path: string) => void; formKey: string; clusters: Opt[]; onNewCluster: () => void; diseaseId: number | null
  renderMonitoring: () => ReactElement | null
}

const lbl = 'text-[11px] font-bold uppercase tracking-wider text-slate-500'

export function FieldView({ f, value, onChange, setOther, ctx, path }: {
  f: PeField; value: any; onChange: (v: any) => void; setOther: (k: string, v: any) => void; ctx: FieldCtx; path: string
}) {
  const { t } = useTranslation()
  if (f.visible && !cond(f.visible, ctx.root, ctx.row)) return null
  const req = !!f.required || (f.requiredIf ? cond(f.requiredIf, ctx.root, ctx.row) : false)
  const errs = ctx.show(path) ? ctx.errors[path] || [] : []
  const bad = errs.length > 0
  const cls = `${inputCls} ${bad ? '!border-red-400 !ring-red-100' : ''} disabled:bg-slate-50 disabled:text-slate-500`
  const blur = () => ctx.touch(path)
  const otherVal = f.other ? (ctx.row || ctx.root)[f.other.key] ?? '' : ''
  const showOther = f.other && (Array.isArray(value) ? value.includes(f.other.value) : value === f.other.value)
  const wide = ['table', 'multiselect', 'textarea', 'info', 'cluster_monitoring'].includes(f.type) || (f.label?.length ?? 0) > 70

  if (f.type === 'info') return <div className="col-span-full rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs font-medium text-primary">{f.label}</div>
  if (f.type === 'cluster_monitoring') return (
    <div className="col-span-full space-y-2">
      <div className={lbl}>{f.label}</div>
      {f.hint && <p className="text-[11px] text-slate-500">{f.hint}</p>}
      {ctx.renderMonitoring()}
      {errs.map((m) => <p key={m} className="text-[11px] font-medium text-red-600">{m}</p>)}
    </div>
  )

  let input: ReactElement
  switch (f.type) {
    case 'textarea':
      input = <textarea rows={3} className={cls} value={value ?? ''} disabled={ctx.disabled} onBlur={blur} onChange={(e) => onChange(e.target.value)} />; break
    case 'number':
      input = <input type="number" inputMode="decimal" className={cls} value={value ?? ''} disabled={ctx.disabled} onBlur={blur}
        min={f.min} max={f.max} step={f.decimals ? 1 / 10 ** f.decimals : 1}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />; break
    case 'date':
      input = <input type="date" className={cls} value={value ?? ''} disabled={ctx.disabled} onBlur={blur} onChange={(e) => onChange(e.target.value || null)} />; break
    case 'auto':
      input = <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600">{isFilled(value) ? String(value) : '—'}</div>; break
    case 'select': {
      const opts = optionsFor(f, ctx.root, ctx.row)
      input = (
        <select className={cls} value={value ?? ''} disabled={ctx.disabled} onBlur={blur} onChange={(e) => { onChange(e.target.value || null); ctx.touch(path) }}>
          <option value="">{t('skdr.pe.choose')}</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          {isFilled(value) && !opts.includes(value) && <option value={value}>{value}</option>}
        </select>
      ); break
    }
    case 'multiselect': {
      const opts = optionsFor(f, ctx.root, ctx.row); const cur: string[] = Array.isArray(value) ? value : []
      const toggle = (o: string) => {
        const ex = f.exclusive
        const next = o === ex ? (cur.includes(o) ? [] : [o]) : cur.includes(o) ? cur.filter((x) => x !== o) : [...cur.filter((x) => x !== ex), o]
        onChange(next); ctx.touch(path)
      }
      // PR 011: checkbox group (real checkbox + label) in a responsive 2–4 column grid
      input = (
        <div role="group" aria-label={f.label}
          className={`grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${bad ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200'}`}>
          {opts.map((o) => {
            const on = cur.includes(o)
            return (
              <label key={o} className={`flex cursor-pointer items-start gap-2 text-sm leading-snug ${ctx.disabled ? 'cursor-not-allowed opacity-60' : ''} ${on ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
                <input type="checkbox" checked={on} disabled={ctx.disabled} onChange={() => toggle(o)} onBlur={blur}
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-primary ${bad ? 'outline outline-1 outline-red-400' : ''}`} />
                <span>{o}{o === f.exclusive ? <span className="ml-1 text-[11px] text-slate-400">(tidak bisa digabung)</span> : null}</span>
              </label>
            )
          })}
        </div>
      ); break
    }
    case 'province':
      input = (
        <select className={cls} value={value ?? ''} disabled={ctx.disabled} onBlur={blur} onChange={(e) => { onChange(e.target.value ? Number(e.target.value) : null); ctx.touch(path) }}>
          <option value="">{t('skdr.pe.chooseProvince')}</option>
          {ctx.masters.provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ); break
    case 'kabkota': {
      const pid = f.depends ? String((ctx.row || ctx.root)[f.depends] ?? '') : ''
      const list = pid ? ctx.masters.kabkota[pid] : undefined
      input = (
        <select className={cls} value={value ?? ''} disabled={ctx.disabled || !pid} onBlur={blur} onFocus={() => pid && ctx.masters.loadKab(pid)}
          onChange={(e) => { onChange(e.target.value ? Number(e.target.value) : null); ctx.touch(path) }}>
          <option value="">{pid ? t('skdr.pe.chooseKab') : t('skdr.pe.chooseProvinceFirst')}</option>
          {(list || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      ); break
    }
    case 'cluster':
      input = (
        <div className="flex gap-2">
          <select className={cls} value={value ?? ''} disabled={ctx.disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('skdr.pe.noCluster')}</option>
            {ctx.clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!ctx.disabled && <button type="button" onClick={ctx.onNewCluster} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-primary hover:bg-blue-50">{t('skdr.pe.newCluster')}</button>}
        </div>
      ); break
    case 'ebs':
      input = <EbsPicker value={value} onChange={(v) => { onChange(v); ctx.touch(path) }} disabled={ctx.disabled} kabkotaId={ctx.root.lapor_kabkota} diseaseId={ctx.diseaseId} bad={bad} />; break
    case 'table':
      input = <TableField f={f} rows={Array.isArray(value) ? value : []} onChange={onChange} ctx={ctx} path={path} />; break
    default:
      input = <input type="text" className={cls} value={value ?? ''} disabled={ctx.disabled} onBlur={blur}
        inputMode={f.format === 'digits' ? 'numeric' : undefined} maxLength={f.maxLen}
        onChange={(e) => onChange(f.format === 'digits' ? e.target.value.replace(/\D/g, '') : e.target.value)} />
  }

  return (
    <div className={`${wide ? 'col-span-full' : ''} space-y-1`} data-field={path}>
      {f.type !== 'table' && <label className={`block ${lbl} normal-case tracking-normal text-slate-600`}>{f.label}{req && <span className="text-red-500"> *</span>}</label>}
      {f.type === 'table' && <div className={lbl}>{f.label}{req && <span className="text-red-500"> *</span>}</div>}
      {input}
      {showOther && f.other && (
        <div className="pt-1">
          <label className="mb-1 block text-[11px] font-semibold text-slate-500">{f.other.label} <span className="text-red-500">*</span></label>
          <input type="text" className={inputCls} value={otherVal} disabled={ctx.disabled} onBlur={blur} onChange={(e) => setOther(f.other!.key, e.target.value)} />
        </div>
      )}
      {f.hint && <p className="text-[11px] text-slate-400">{f.hint}</p>}
      {errs.map((m) => <p key={m} className="text-[11px] font-medium text-red-600">{m}</p>)}
    </div>
  )
}

function TableField({ f, rows, onChange, ctx, path }: { f: PeField; rows: Data[]; onChange: (v: any) => void; ctx: FieldCtx; path: string }) {
  const { t } = useTranslation()
  const setCell = (i: number, k: string, v: any) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">{t('skdr.pe.noRows')}</p>}
      {rows.map((r, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">{t('skdr.pe.rowN', { n: i + 1 })}</span>
            {!ctx.disabled && (
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" /> {t('skdr.pe.removeRow')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(f.columns || []).map((c) => (
              <FieldView key={c.key} f={c} value={r[c.key]} path={`${path}.${i}.${c.key}`} ctx={{ ...ctx, row: r }}
                onChange={(v) => setCell(i, c.key, v)} setOther={(k, v) => setCell(i, k, v)} />
            ))}
          </div>
        </div>
      ))}
      {!ctx.disabled && (
        <button type="button" onClick={() => onChange([...rows, {}])} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-white px-3 py-2 text-xs font-semibold text-primary hover:bg-blue-50">
          <Plus className="h-3.5 w-3.5" /> {t('skdr.pe.addRow')}
        </button>
      )}
    </div>
  )
}

interface EbsRow { id_ebs: number; no_ebs: string | null; tgl_laporan: string | null; diagnosa: string | null; kota: string | null; jml_kasus: number }

function EbsPicker({ value, onChange, disabled, kabkotaId, diseaseId, bad }: { value: any; onChange: (v: any) => void; disabled: boolean; kabkotaId: any; diseaseId: number | null; bad: boolean }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<EbsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const none = value === 'none'
  const qs = useMemo(() => {
    const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim()); if (kabkotaId) p.set('kabkota_id', String(kabkotaId)); if (diseaseId) p.set('disease_id', String(diseaseId)); return p.toString()
  }, [q, kabkotaId, diseaseId])
  useEffect(() => {
    if (!open) return
    setLoading(true)
    const id = setTimeout(() => { peFetch<{ data: EbsRow[] }>(`/api/v1/pe/ebs-search?${qs}`).then((j) => setRows(j.data)).catch(() => setRows([])).finally(() => setLoading(false)) }, 300)
    return () => clearTimeout(id)
  }, [qs, open])
  return (
    <div className="space-y-2">
      {!none && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" disabled={disabled} className={`${inputCls} pl-9 ${bad ? '!border-red-400' : ''}`} placeholder={t('skdr.pe.ebsSearch')}
            value={open ? q : value ? `ID EBS ${value}` : ''} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} onChange={(e) => setQ(e.target.value)} />
          {open && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {loading && <div className="flex items-center gap-2 p-3 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('skdr.master.loading')}</div>}
              {!loading && rows.length === 0 && <div className="p-3 text-xs text-slate-400">{t('skdr.pe.ebsNone')}</div>}
              {!loading && rows.map((r) => (
                <button type="button" key={r.id_ebs} onMouseDown={() => { onChange(String(r.id_ebs)); setOpen(false) }} className="block w-full px-3 py-2 text-left text-xs hover:bg-blue-50">
                  <span className="font-mono font-semibold text-slate-700">{r.id_ebs}</span>{r.no_ebs ? ` · ${r.no_ebs}` : ''} · {r.tgl_laporan || '—'} · {r.diagnosa || '—'} · {r.kota || '—'} · {t('skdr.pe.ebsCases', { n: r.jml_kasus })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" disabled={disabled} checked={none} onChange={(e) => onChange(e.target.checked ? 'none' : null)} /> {t('skdr.pe.ebsNotFrom')}
      </label>
    </div>
  )
}
