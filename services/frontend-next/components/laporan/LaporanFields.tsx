'use client'
// PR 030: field renderers for the EBS/IBS wizards. Every choice field uses <SearchSelect>.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, Download, FileUp, Info, Loader2, Minus, Paperclip, Plus, Search, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { inputCls } from '@/components/master/MasterUi'
import SearchSelect, { type SelectOption } from '@/components/ui/SearchSelect'
import { addDays, epiLabel, isReq, toNum, weeksOf, type Data, type FieldDef, type Jenis, type Refs } from '@/lib/laporan/engine'
import { SEXES, USIA_BANDS, usiaTotals } from '@/lib/laporan/ebs'
import { IBS_COLS, ibsTotals } from '@/lib/laporan/ibs'
import { UMUR_PARTS } from '@/lib/laporan/individu'
import { lampiranUrl, uploadLampiran, type Geo, type Lampiran } from '@/lib/laporan/api'
import RichText from './RichText'

export interface FieldCtx {
  jenis: Jenis
  refs: Refs
  data: Data
  readOnly: boolean
  geo: Geo
  no: string | null
  recordId: number | null
  /** field key → error / warning messages (shown when the field was touched or the step was checked) */
  errs: Record<string, string[]>
  warns: Record<string, string[]>
  show: (key: string) => boolean
  touch: (key: string) => void
  set: (f: FieldDef, v: any, extra?: Data) => void
  patch: (p: Data) => void
  auto: Record<string, string>
  lampiran: Lampiran[]
  setLampiran: (l: Lampiran[]) => void
  ensureSaved: () => Promise<number | null>
  reported: { id: number; no: string; status: string; minggu: number }[]
}

const numCls = `${inputCls} tabular-nums`
const yaTidak: SelectOption[] = [{ value: 'Ya', label: 'Ya' }, { value: 'Tidak', label: 'Tidak' }]
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export function optionsFor(f: FieldDef, refs: Refs, current?: any): SelectOption[] {
  let list: SelectOption[] = []
  if (f.options === 'penyakit') list = refs.penyakit.map((p) => ({ value: p.value, label: p.label, hint: p.disease_name && p.disease_name !== p.label ? `Master: ${p.disease_name}` : undefined }))
  // PR 031: 24 IBS diseases as "A — Diare Akut" (Total Kunjungan excluded)
  else if (f.options === 'ibs_penyakit') list = refs.ibs_penyakit.filter((p) => !p.is_total).map((p) => ({ value: p.kode, label: `${p.kode_sms} — ${p.nama}`, hint: `Kode ${p.kode}${p.nama_asli !== p.nama ? ` · di form lama: ${p.nama_asli}` : ''}` }))
  else if (f.options) list = (refs.opsi[f.options] || []).map((o) => ({ value: o.value, label: o.label }))
  const cur = Array.isArray(current) ? current : current ? [String(current)] : []
  cur.forEach((v) => { if (!list.some((o) => o.value === v)) list = [...list, { value: v, label: v, hint: 'Nilai tersimpan (tidak ada di daftar)' }] })
  return list
}

/** numbers: keep digits only, '' → null */
const parseNum = (s: string) => { const t = s.replace(/[^\d]/g, ''); return t === '' ? null : Number(t) }
/** decimals: digits + one comma/dot kept as typed (e.g. "36,5"), '' → null */
const parseDec = (s: string) => { const t = s.replace(/[^\d.,]/g, '').replace(/([.,].*)[.,]/g, '$1'); return t === '' ? null : t }

export function FieldView({ f, ctx }: { f: FieldDef; ctx: FieldCtx }) {
  const { data } = ctx
  const req = isReq(f, data)
  const shown = ctx.show(f.key)
  // umur: issues are keyed per part (umur_tahun / umur_bulan / umur_hari)
  const keys = f.type === 'umur' ? [f.key, ...UMUR_PARTS.map((p) => p.key)] : [f.key]
  const errs = shown ? keys.flatMap((k) => ctx.errs[k] || []) : []
  const warns = keys.flatMap((k) => ctx.warns[k] || [])
  const invalid = errs.length > 0
  const id = `lf-${f.key}`
  const wide = f.wide || ['agegrid', 'ibsgrid', 'lampiran', 'richtext', 'textarea', 'domsama', 'check'].includes(f.type)
  return (
    <div data-field={f.key} className={`${wide ? 'sm:col-span-2' : ''} ${f.child ? 'border-l-2 border-primary/15 pl-3' : ''} min-w-0 rounded-lg transition-colors`}>
      {f.type !== 'check' && f.type !== 'domsama' && (
        <label htmlFor={id} className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
          <span>{f.label}{req && <span className="ml-0.5 text-red-500">*</span>}</span>
          {ctx.auto[f.key] && <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-semibold text-sky-700" title={ctx.auto[f.key]}><Sparkles size={9} /> Otomatis</span>}
        </label>
      )}
      <Control f={f} ctx={ctx} id={id} invalid={invalid} />
      {f.hint && !invalid && <p className="mt-1 text-[11px] leading-snug text-slate-400">{f.hint}</p>}
      {errs.map((m, i) => <p key={`e${i}`} className="mt-1 text-[11px] font-medium text-red-600" role="alert">{m}</p>)}
      {warns.map((m, i) => <p key={`w${i}`} className="mt-1 text-[11px] font-medium text-amber-700">⚠ {m}</p>)}
    </div>
  )
}

function Control({ f, ctx, id, invalid }: { f: FieldDef; ctx: FieldCtx; id: string; invalid: boolean }) {
  const { data, readOnly: ro } = ctx
  const v = data[f.key]
  const blur = () => ctx.touch(f.key)
  const bad = invalid ? 'border-red-300 ring-1 ring-red-200' : ''
  switch (f.type) {
    case 'info': {
      const t = f.info ? f.info(data, { no: ctx.no }) : String(v ?? '')
      return <div id={id} className="flex min-h-[38px] items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{t}</div>
    }
    case 'text': case 'tel':
      return <input id={id} type={f.type === 'tel' ? 'tel' : 'text'} inputMode={f.type === 'tel' ? 'tel' : undefined} className={`${inputCls} ${bad}`} value={v ?? ''} disabled={ro}
        placeholder={f.placeholder} maxLength={f.maxLen} onChange={(e) => ctx.set(f, e.target.value)} onBlur={blur} />
    case 'textarea':
      return (
        <div>
          <textarea id={id} rows={3} className={`${inputCls} ${bad} min-h-[84px]`} value={v ?? ''} disabled={ro} placeholder={f.placeholder} maxLength={f.maxLen}
            onChange={(e) => ctx.set(f, e.target.value)} onBlur={blur} />
          {f.maxLen && <p className="mt-0.5 text-right text-[10px] text-slate-400">{String(v ?? '').length}/{f.maxLen}</p>}
        </div>
      )
    case 'richtext':
      return <RichText id={id} value={v ?? ''} disabled={ro} placeholder={f.placeholder} invalid={invalid} onChange={(html) => ctx.set(f, html)} onBlur={blur} />
    case 'decimal': {
      const lock = f.locked?.(data) || null
      return (
        <div className="flex items-stretch">
          <input id={id} type="text" inputMode="decimal" className={`${numCls} ${bad} ${f.unit ? 'rounded-r-none' : ''} ${lock ? 'bg-slate-50 font-semibold text-primary' : ''}`} value={v ?? ''}
            disabled={ro || !!lock} title={lock || undefined} placeholder={f.placeholder || '—'} onChange={(e) => ctx.set(f, parseDec(e.target.value))} onBlur={blur} />
          {f.unit && <span className="inline-flex items-center rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-500">{f.unit}</span>}
        </div>
      )
    }
    case 'umur':
      return (
        <div className="grid grid-cols-3 gap-2">
          {UMUR_PARTS.map((p) => {
            const pv = data[p.key]
            const pe = ctx.show(f.key) && (ctx.errs[p.key] || []).length > 0
            return (
              <div key={p.key} data-field={p.key} className="flex items-stretch">
                <input id={p.key === 'umur_tahun' ? id : `lf-${p.key}`} type="text" inputMode="numeric" aria-label={p.label} disabled={ro} value={pv ?? ''} placeholder="—"
                  onChange={(e) => ctx.set({ ...f, key: p.key, type: 'number' }, parseNum(e.target.value))} onBlur={blur} onFocus={(e) => e.target.select()}
                  className={`${numCls} min-w-0 rounded-r-none text-center ${pe ? 'border-red-300 ring-1 ring-red-200' : ''}`} />
                <span className="inline-flex items-center rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 px-2 text-xs text-slate-500">{p.key === 'umur_tahun' ? 'tahun' : p.key === 'umur_bulan' ? 'bulan' : 'hari'}</span>
              </div>
            )
          })}
        </div>
      )
    case 'number': {
      const n = toNum(v)
      const step = (d: number) => ctx.set(f, Math.max(0, (n && !Number.isNaN(n) ? n : 0) + d))
      return (
        <div className="flex items-stretch gap-1">
          {f.stepper && !ro && <button type="button" aria-label={`Kurangi ${f.label}`} onClick={() => step(-1)} className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50"><Minus size={14} /></button>}
          <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" className={`${numCls} ${bad} ${f.stepper ? 'max-w-[140px] text-center' : ''}`} value={v ?? ''} disabled={ro}
            placeholder={f.placeholder || '0'} onChange={(e) => ctx.set(f, parseNum(e.target.value))} onBlur={blur} onFocus={(e) => e.target.select()} />
          {f.stepper && !ro && <button type="button" aria-label={`Tambah ${f.label}`} onClick={() => step(1)} className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50"><Plus size={14} /></button>}
        </div>
      )
    }
    case 'date': {
      const today = ctx.refs.today
      const max = data.tgl_laporan && data.tgl_laporan < today ? data.tgl_laporan : today
      const epi = f.epi && v ? epiLabel(v) : null
      return (
        <div>
          <input id={id} type="date" className={`${inputCls} ${bad}`} value={v ?? ''} max={max} disabled={ro} onChange={(e) => ctx.set(f, e.target.value || null)} onBlur={blur} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {f.shortcuts && !ro && [['Hari ini', 0], ['Kemarin', -1], ['2 hari lalu', -2]].map(([l, d]) => (
              <button key={l as string} type="button" onClick={() => ctx.set(f, addDays(max, d as number))} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-primary/40 hover:text-primary">{l}</button>
            ))}
            {epi && <span className="inline-flex items-center gap-1 rounded-full bg-primary/[0.06] px-2 py-0.5 text-[10px] font-semibold text-primary"><CalendarDays size={10} /> {epi}</span>}
          </div>
        </div>
      )
    }
    case 'select': case 'multiselect': {
      const opts = optionsFor(f, ctx.refs, v)
      const extra = f.key === 'penyakit_terverifikasi' && data.penyakit_rumor && v !== data.penyakit_rumor && !ro
        ? <button type="button" onClick={() => ctx.set(f, data.penyakit_rumor)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Wand2 size={11} /> Sama dengan Penyakit Rumor ({data.penyakit_rumor})</button>
        : null
      return (
        <div>
          {f.type === 'multiselect'
            ? <SearchSelect multiple id={id} options={opts} value={Array.isArray(v) ? v : []} disabled={ro} invalid={invalid} ariaLabel={f.label} onChange={(x) => ctx.set(f, x)} onBlur={blur} testId={`ss-${f.key}`} />
            : <SearchSelect id={id} options={opts} value={v ?? null} disabled={ro} invalid={invalid} ariaLabel={f.label} recentKey={f.options === 'penyakit' || f.options === 'ibs_penyakit' ? f.options : undefined}
                placeholder={f.placeholder || (f.options === 'penyakit' || f.options === 'ibs_penyakit' ? `Cari dari ${opts.length} penyakit (nama atau kode)…` : '- Pilih -')} onChange={(x) => ctx.set(f, x)} onBlur={blur} testId={`ss-${f.key}`} />}
          {extra}
        </div>
      )
    }
    case 'yatidak':
      return <SearchSelect id={id} options={yaTidak} value={v ?? null} disabled={ro} invalid={invalid} ariaLabel={f.label} placeholder="- Belum dijawab -" onChange={(x) => ctx.set(f, x)} onBlur={blur} testId={`ss-${f.key}`} />
    case 'province': {
      const g = ctx.geo
      const mirrored = f.key.startsWith('dom_') && data.dom_sama
      return <SearchSelect id={id} options={g.provinces || []} loading={!g.provinces && g.loading('prov')} value={v != null ? String(v) : null} disabled={ro || mirrored}
        disabledHint={mirrored ? 'Sama dengan wilayah pelapor' : undefined} invalid={invalid} ariaLabel={f.label} placeholder="Cari provinsi…" recentKey="provinsi"
        onOpen={g.loadProvinces} onChange={(x) => ctx.set(f, x ? Number(x) : null)} onBlur={blur} testId={`ss-${f.key}`} />
    }
    case 'kabkota': {
      const g = ctx.geo
      const pid = f.depends ? data[f.depends] : null
      const mirrored = f.key.startsWith('dom_') && data.dom_sama
      const key = pid ? String(pid) : f.direct ? 'all' : ''
      const opts = key ? g.kab[key] || [] : []
      return <SearchSelect id={id} options={opts} loading={!!key && !g.kab[key] && g.loading(`kab:${key}`)} value={v != null ? String(v) : null}
        disabled={ro || mirrored || !key} disabledHint={mirrored ? 'Sama dengan wilayah pelapor' : !key ? 'Pilih Provinsi dulu' : undefined} invalid={invalid} ariaLabel={f.label}
        placeholder={key === 'all' ? 'Cari kab/kota (semua provinsi)…' : 'Cari kab/kota…'} recentKey="kabkota"
        onOpen={() => key && g.loadKab(key)} onBlur={blur} testId={`ss-${f.key}`}
        onChange={(x, o) => {
          const extra: Data = {}
          if (f.direct && !pid && o && 'province_id' in o) extra[f.direct] = (o as any).province_id
          ctx.set(f, x ? Number(x) : null, extra)
        }} />
    }
    case 'kecamatan': {
      const g = ctx.geo
      const kid = f.depends ? data[f.depends] : null
      const key = kid ? String(kid) : ''
      const opts = key ? g.kec[key] || [] : []
      const loaded = !!key && !!g.kec[key]
      return <SearchSelect id={id} options={opts} loading={!!key && !loaded && g.loading(`kec:${key}`)} value={v ?? null} disabled={ro || !key}
        disabledHint={!key ? 'Pilih Kab/Kota dulu' : undefined} invalid={invalid} ariaLabel={f.label} placeholder="Cari kecamatan…"
        emptyText={loaded && !opts.length ? 'Belum ada daftar kecamatan untuk kab/kota ini' : undefined}
        onOpen={() => key && g.loadKec(key)} onBlur={blur} testId={`ss-${f.key}`}
        onChange={(x, o) => ctx.set(f, x, { kecamatan_nama: o?.label ?? null })} />
    }
    case 'unit': return <UnitControl f={f} ctx={ctx} id={id} invalid={invalid} />
    case 'agegrid': return <AgeGrid ctx={ctx} />
    case 'ibsgrid': return <IbsGrid ctx={ctx} />
    case 'lampiran': return <LampiranBox ctx={ctx} />
    case 'tahun': {
      const y = Number(ctx.refs.today.slice(0, 4))
      const opts = Array.from({ length: y - 2011 }, (_, i) => ({ value: String(y - i), label: String(y - i) }))
      return <SearchSelect id={id} options={opts} value={v != null ? String(v) : null} disabled={ro} invalid={invalid} ariaLabel={f.label} clearable={false}
        onChange={(x) => ctx.set(f, x ? Number(x) : null)} onBlur={blur} testId={`ss-${f.key}`} />
    }
    case 'epiweek': {
      const year = Number(data.tahun)
      if (!year) return <SearchSelect id={id} options={[]} value={null} disabled disabledHint="Pilih Tahun dulu" onChange={() => {}} />
      const rep = new Map(ctx.reported.map((r) => [r.minggu, r]))
      const opts: SelectOption[] = weeksOf(year).filter((w) => w.start <= ctx.refs.today).reverse().map((w) => {
        const r = rep.get(w.week)
        return { value: String(w.week), label: `Minggu ${w.week}`, hint: w.label, badge: r ? (r.status === 'dikirim' ? 'Sudah dilaporkan' : 'Ada draf') : undefined }
      })
      return <SearchSelect id={id} options={opts} value={v != null ? String(v) : null} disabled={ro} invalid={invalid} ariaLabel={f.label} placeholder="Cari minggu (angka/tanggal)…"
        onChange={(x) => ctx.set(f, x ? Number(x) : null)} onBlur={blur} testId={`ss-${f.key}`} />
    }
    case 'check':
      return (
        <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${invalid ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
          <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={v === true} disabled={ro} onChange={(e) => { ctx.set(f, e.target.checked); ctx.touch(f.key) }} />
          <span className="text-slate-700">{f.label}{isReq(f, data) && <span className="ml-0.5 text-red-500">*</span>}</span>
        </label>
      )
    case 'domsama':
      return (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
          <input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={v === true} disabled={ro}
            onChange={(e) => ctx.set(f, e.target.checked, e.target.checked ? { dom_provinsi_id: data.provinsi_id ?? null, dom_kabkota_id: data.kabkota_id ?? null } : {})} />
          {f.label}
        </label>
      )
  }
  return null
}

function UnitControl({ f, ctx, id, invalid }: { f: FieldDef; ctx: FieldCtx; id: string; invalid: boolean }) {
  const { data, geo: g } = ctx
  const jenis = data.jenis_unit || ''
  const kid = data.kabkota_id ? String(data.kabkota_id) : ''
  const pid = data.provinsi_id ? String(data.provinsi_id) : ''
  const kec = jenis === 'Puskesmas' ? data.kecamatan || '' : ''
  const [manual, setManual] = useState(false)
  const key = g.unitKey(jenis, kid, pid, kec)
  const ready = !!jenis && !!kid
  const opts = ready ? g.unit[key] || [] : []
  const loaded = ready && !!g.unit[key]
  const v = data.unit_pelapor
  const showManual = manual || (loaded && !opts.length) || (!!v && loaded && !opts.some((o) => o.value === v) && !data.unit_kode)
  useEffect(() => { if (ready) g.loadUnit(jenis, kid, pid, kec) }, [ready, jenis, kid, pid, kec]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return <SearchSelect id={id} options={[]} value={null} disabled disabledHint={!jenis ? 'Pilih Jenis Unit dulu' : 'Pilih Kab/Kota dulu'} onChange={() => {}} />
  if (showManual && !ctx.readOnly) {
    return (
      <div>
        <input id={id} className={`${inputCls} ${invalid ? 'border-red-300' : ''}`} value={v ?? ''} placeholder="Ketik nama unit pelapor" maxLength={200}
          onChange={(e) => ctx.set(f, e.target.value, { unit_kode: null })} onBlur={() => ctx.touch(f.key)} />
        <p className="mt-1 text-[11px] text-slate-400">
          {loaded && !opts.length ? 'Belum ada daftar unit untuk wilayah ini — ketik nama unit.' : 'Isian manual.'}
          {opts.length > 0 && <button type="button" className="ml-1 font-semibold text-primary hover:underline" onClick={() => { setManual(false); ctx.set(f, null, { unit_kode: null }) }}>Pilih dari daftar</button>}
        </p>
      </div>
    )
  }
  return <SearchSelect id={id} options={opts} loading={!loaded && g.loading(`unit:${key}`)} value={v ?? null} disabled={ctx.readOnly} invalid={invalid} ariaLabel={f.label}
    placeholder={`Cari ${jenis === 'Puskesmas' ? 'puskesmas' : 'unit'}… (${opts.length} pilihan)`} recentKey={`unit:${jenis}`} onBlur={() => ctx.touch(f.key)} testId={`ss-${f.key}`}
    onChange={(x, o) => ctx.set(f, x, { unit_kode: (o as any)?.code ?? null })}
    footer={<button type="button" className="w-full px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-primary/5" onMouseDown={(e) => e.preventDefault()} onClick={() => setManual(true)}>Unit tidak ada di daftar? Ketik manual</button>} />
}

// ─── age × sex grid (EBS) ─────────────────────────────────────────────────────
function AgeGrid({ ctx }: { ctx: FieldCtx }) {
  const { data, readOnly: ro } = ctx
  const u = data.usia || {}
  const t = usiaTotals(data)
  const kasus = toNum(data.jml_kasus)
  const f: FieldDef = { key: 'usia', label: 'Usia', type: 'agegrid' }
  const setCell = (s: string, b: string, val: number | null) => {
    const next = { ...u, [s]: { ...(u[s] || {}), [b]: val } }
    if (val === null) delete next[s][b]
    ctx.set(f, next)
  }
  const cell = (s: string, b: string, label: string) => (
    <input aria-label={label} type="text" inputMode="numeric" disabled={ro} value={u[s]?.[b] ?? ''} placeholder="0" onFocus={(e) => e.target.select()}
      onChange={(e) => setCell(s, b, parseNum(e.target.value))} onBlur={() => ctx.touch('usia')}
      className="w-full min-w-[3rem] rounded-md border border-slate-200 bg-white px-1.5 py-1.5 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-slate-50" />
  )
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>
            <th className="px-2 py-2 text-left font-semibold">Jenis Kelamin</th>
            {USIA_BANDS.map((b) => <th key={b.key} className="px-1 py-2 text-center font-semibold">{b.label}</th>)}
            <th className="px-2 py-2 text-center font-semibold">Total</th>
          </tr></thead>
          <tbody>
            {SEXES.map((s) => (
              <tr key={s.key} className="border-t border-slate-100">
                <td className="px-2 py-1.5 font-medium text-slate-700">{s.label}</td>
                {USIA_BANDS.map((b) => <td key={b.key} className="px-0.5 py-1">{cell(s.key, b.key, `${s.label} ${b.label}`)}</td>)}
                <td className="px-2 text-center font-semibold tabular-nums text-slate-700">{s.key === 'pria' ? t.pria : t.wanita}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold text-slate-700">
              <td className="px-2 py-1.5">Total</td>
              {USIA_BANDS.map((b) => <td key={b.key} className="text-center tabular-nums">{t.col(b.key)}</td>)}
              <td className="text-center tabular-nums text-primary">{t.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500"><span>Usia</span><span className="text-center">Laki-laki</span><span className="text-center">Perempuan</span></div>
        {USIA_BANDS.map((b) => (
          <div key={b.key} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 px-3 py-1.5 text-sm">
            <span className="text-slate-600">{b.label}</span>{cell('pria', b.key, `Laki-laki ${b.label}`)}{cell('wanita', b.key, `Perempuan ${b.label}`)}
          </div>
        ))}
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 px-3 py-2 text-sm font-semibold"><span>Total ({t.total})</span><span className="text-center">{t.pria}</span><span className="text-center">{t.wanita}</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        <span>Total tabel: <b className="tabular-nums text-slate-700">{t.total}</b> · Jumlah Kasus: <b className="tabular-nums text-slate-700">{kasus ?? '–'}</b></span>
        {t.total > 0 && t.total !== kasus && !ro && (
          <button type="button" onClick={() => ctx.patch({ jml_kasus: t.total })} className="rounded-full border border-primary/30 px-2 py-0.5 font-semibold text-primary hover:bg-primary/5">Isi Jumlah Kasus = {t.total}</button>
        )}
        <span className="ml-auto text-slate-400">Opsional, tetapi sebaiknya total = Jumlah Kasus.</span>
      </div>
    </div>
  )
}

// ─── IBS weekly table ─────────────────────────────────────────────────────────
function IbsGrid({ ctx }: { ctx: FieldCtx }) {
  const { data, readOnly: ro } = ctx
  const rows = useMemo(() => ctx.refs.ibs_penyakit.filter((p) => !p.is_total), [ctx.refs.ibs_penyakit])
  const [q, setQ] = useState('')
  const [onlyFilled, setOnlyFilled] = useState(false)
  const r = data.rows || {}
  const f: FieldDef = { key: 'rows', label: 'Data kasus', type: 'ibsgrid' }
  const tot = ibsTotals(data, rows)
  const filledCount = rows.filter((x) => IBS_COLS.some((c) => Number(r[x.kode]?.[c.key]) > 0)).length
  const nq = q.trim().toLowerCase()
  // exact Kode SMS ("a", "aa") wins over substring search
  const exactSms = !!nq && rows.some((x) => x.kode_sms.toLowerCase() === nq)
  const visible = rows.filter((x) => (!nq || (exactSms ? x.kode_sms.toLowerCase() === nq : `${x.kode} ${x.nama} ${x.nama_asli} ${x.kode_sms}`.toLowerCase().includes(nq))) && (!onlyFilled || IBS_COLS.some((c) => Number(r[x.kode]?.[c.key]) > 0)))
  const tableRef = useRef<HTMLDivElement>(null)
  const setCell = (kode: string, col: string, val: number | null) => {
    const row = { ...(r[kode] || {}), [col]: val }
    if (val === null) delete row[col]
    const next = { ...r, [kode]: row }
    if (!Object.keys(row).length) delete next[kode]
    ctx.set(f, next)
  }
  const move = (e: KeyboardEvent<HTMLInputElement>, kode: string, col: string) => {
    const dir = e.key === 'ArrowDown' || e.key === 'Enter' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const i = visible.findIndex((x) => x.kode === kode) + dir
    if (i < 0 || i >= visible.length) return
    const el = tableRef.current?.querySelector<HTMLInputElement>(`input[data-cell="${visible[i].kode}:${col}"]`)
    el?.focus()
  }
  const errOf = (kode: string, col: string) => (ctx.errs[`rows.${kode}.${col}`] || []).concat(ctx.warns[`rows.${kode}.${col}`] || [])
  const cell = (kode: string, col: string, nama: string, label: string, mobile = false) => {
    const issues = errOf(kode, col)
    const isErr = (ctx.errs[`rows.${kode}.${col}`] || []).length > 0
    return (
      <input data-cell={mobile ? undefined : `${kode}:${col}`} aria-label={`${label} ${nama}`} title={issues.join('\n') || undefined} type="text" inputMode="numeric" disabled={ro}
        value={r[kode]?.[col] ?? ''} placeholder="0" onFocus={(e) => e.target.select()} onChange={(e) => setCell(kode, col, parseNum(e.target.value))}
        onKeyDown={mobile ? undefined : (e) => move(e, kode, col)} onBlur={() => ctx.touch('rows')}
        className={`w-full min-w-[3.5rem] rounded-md border px-1.5 py-1.5 text-center text-sm tabular-nums focus:outline-none focus:ring-1 disabled:bg-slate-50 ${isErr ? 'border-red-300 bg-red-50 focus:ring-red-200' : issues.length ? 'border-amber-300 bg-amber-50 focus:ring-amber-200' : 'border-slate-200 bg-white focus:border-primary focus:ring-primary/30'}`} />
    )
  }
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari penyakit / kode…" className={`${inputCls} py-1.5 pl-8 text-xs`} aria-label="Cari penyakit" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" className="accent-primary" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} /> Hanya yang terisi ({filledCount})</label>
        <span className="text-[11px] text-slate-400">Enter / ↑ ↓ pindah baris · Tab pindah kolom · kosong = 0 · cari juga dengan Kode SMS (mis. "A")</span>
      </div>
      {/* PR 031: kolom mengikuti tabel resmi (No · Kode SMS · Kode Penyakit · Nama Penyakit · Jumlah Kasus/Kematian/Lab);
          kolom identitas menempel di kiri saat tabel digulir ke samping, header & total menempel atas/bawah. */}
      <div ref={tableRef} className="hidden max-h-[60vh] overflow-auto md:block">
        <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20 text-slate-500"><tr className="[&>th]:border-b [&>th]:border-slate-200 [&>th]:bg-slate-50">
            <th className="sticky left-0 z-10 w-10 px-2 py-2 text-left font-semibold">No</th>
            <th className="sticky left-10 z-10 w-16 px-1 py-2 text-center font-semibold" title="Kode SMS (huruf pelaporan SMS)">Kode SMS</th>
            <th className="sticky left-[6.5rem] z-10 w-20 px-2 py-2 text-left font-semibold">Kode Penyakit</th>
            <th className="sticky left-[11.5rem] z-10 px-2 py-2 text-left font-semibold shadow-[1px_0_0_#e2e8f0]">Nama Penyakit</th>
            {IBS_COLS.map((c) => <th key={c.key} className="w-28 px-1 py-2 text-center font-semibold" title={c.hint}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {visible.map((x) => {
              const filled = IBS_COLS.some((c) => Number(r[x.kode]?.[c.key]) > 0)
              const bg = filled ? 'bg-sky-50' : 'bg-white'
              return (
                <tr key={x.kode} className={`[&>td]:border-t [&>td]:border-slate-100 ${filled ? '[&>td]:bg-sky-50' : ''}`} data-filled={filled || undefined}>
                  <td className={`sticky left-0 z-[1] px-2 py-1 tabular-nums text-slate-400 ${bg}`}>{x.urutan}</td>
                  <td className={`sticky left-10 z-[1] px-1 py-1 text-center ${bg}`}>
                    <span className={`inline-flex min-w-[1.75rem] justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${filled ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>{x.kode_sms}</span>
                  </td>
                  <td className={`sticky left-[6.5rem] z-[1] px-2 py-1 font-mono text-[11px] text-slate-500 ${bg}`}>{x.kode}</td>
                  <td className={`sticky left-[11.5rem] z-[1] px-2 py-1 shadow-[1px_0_0_#f1f5f9] ${bg}`}>
                    <div className={`font-medium ${filled ? 'text-slate-900' : 'text-slate-700'}`}>{x.nama}</div>
                    {x.nama_asli && x.nama_asli !== x.nama && <div className="text-[10px] text-slate-400">di form lama: {x.nama_asli}</div>}
                  </td>
                  {IBS_COLS.map((c) => <td key={c.key} className="px-1 py-1">{cell(x.kode, c.key, x.nama, c.label)}</td>)}
                </tr>
              )
            })}
            {!visible.length && <tr><td colSpan={4 + IBS_COLS.length} className="px-3 py-6 text-center text-slate-400">Tidak ada penyakit yang cocok.</td></tr>}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 font-semibold text-slate-700"><tr className="[&>td]:border-t [&>td]:border-slate-200 [&>td]:bg-slate-100">
            <td className="sticky left-0 z-10 px-2 py-2" colSpan={4}>Total {rows.length} penyakit (otomatis · tidak termasuk Total Kunjungan)</td>
            {IBS_COLS.map((c) => <td key={c.key} className="px-1 py-2 text-center tabular-nums">{tot[c.key]}</td>)}
          </tr></tfoot>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {visible.map((x) => (
          <div key={x.kode} className="px-3 py-2">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="inline-flex min-w-[1.75rem] justify-center rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary">{x.kode_sms}</span>
              <span className="min-w-0 flex-1">{x.nama}</span><span className="font-mono text-[10px] font-normal text-slate-400">{x.kode}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {IBS_COLS.map((c) => <label key={c.key} className="text-[10px] font-semibold text-slate-500">{c.short}{cell(x.kode, c.key, x.nama, c.label, true)}</label>)}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
          {IBS_COLS.map((c) => <span key={c.key}>Total {c.short}: {tot[c.key]}</span>)}
        </div>
      </div>
    </div>
  )
}

// ─── attachments (EBS) ────────────────────────────────────────────────────────
function LampiranBox({ ctx }: { ctx: FieldCtx }) {
  const { refs, readOnly: ro } = ctx
  const [queue, setQueue] = useState<{ name: string; pct: number; err?: string }[]>([])
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const max = refs.lampiran.max_bytes
  const allowed = refs.lampiran.tipe
  const extOk = (n: string) => /\.(pdf|jpe?g|png|webp|csv|docx?|xlsx?)$/i.test(n)
  const add = async (fileList: FileList | null) => {
    // copy first: the input is reset right after onChange, which empties the live FileList
    const files = fileList ? Array.from(fileList) : []
    if (!files.length) return
    const id = await ctx.ensureSaved()
    if (!id) { toast.error('Draf belum bisa disimpan — lampiran belum diunggah'); return }
    let list = [...ctx.lampiran]
    for (const file of files) {
      if (file.size > max) { setQueue((q) => [...q, { name: file.name, pct: 0, err: `Melebihi ${fmtSize(max)}` }]); continue }
      if (!(allowed.includes(file.type) || extOk(file.name))) { setQueue((q) => [...q, { name: file.name, pct: 0, err: 'Tipe file tidak didukung' }]); continue }
      setQueue((q) => [...q, { name: file.name, pct: 0 }])
      try {
        const l = await uploadLampiran(id, file, (pct) => setQueue((q) => q.map((x) => (x.name === file.name ? { ...x, pct } : x))))
        list = [...list, l]; ctx.setLampiran(list)
        setQueue((q) => q.filter((x) => x.name !== file.name))
      } catch (e) {
        setQueue((q) => q.map((x) => (x.name === file.name ? { ...x, err: e instanceof Error ? e.message : String(e) } : x)))
      }
    }
  }
  const del = async (l: Lampiran) => {
    if (!ctx.recordId || !window.confirm(`Hapus lampiran "${l.nama_file}"?`)) return
    try {
      const res = await fetch(lampiranUrl(ctx.jenis, ctx.recordId, l.id), { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      ctx.setLampiran(ctx.lampiran.filter((x) => x.id !== l.id))
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div>
      {!ro && (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${drag ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50/50'}`}>
          <FileUp size={22} className="text-primary" />
          <p className="text-sm text-slate-600">Tarik file ke sini atau <button type="button" className="font-semibold text-primary hover:underline" onClick={() => input.current?.click()}>pilih file</button></p>
          <p className="text-[11px] text-slate-400">PDF, gambar (JPG/PNG/WEBP), CSV, Word, Excel · maks {fmtSize(max)} per file · draf disimpan otomatis sebelum unggah</p>
          <input ref={input} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.doc,.docx,.xls,.xlsx" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </div>
      )}
      <ul className="mt-2 space-y-1.5">
        {queue.map((x) => (
          <li key={`q-${x.name}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${x.err ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200'}`}>
            {x.err ? <Info size={13} /> : <Loader2 size={13} className="animate-spin text-primary" />}
            <span className="min-w-0 flex-1 truncate">{x.name}</span>
            {x.err ? <><span>{x.err}</span><button type="button" className="font-semibold underline" onClick={() => setQueue((q) => q.filter((y) => y !== x))}>Tutup</button></>
              : <span className="w-24"><span className="block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-primary transition-all" style={{ width: `${x.pct}%` }} /></span></span>}
          </li>
        ))}
        {ctx.lampiran.map((l) => (
          <li key={l.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
            <Paperclip size={13} className="text-slate-400" />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{l.nama_file}</span>
            <span className="text-slate-400">{fmtSize(l.ukuran)}</span>
            {ctx.recordId && <a href={lampiranUrl(ctx.jenis, ctx.recordId, l.id)} target="_blank" rel="noreferrer" className="text-primary hover:underline" title="Unduh"><Download size={13} /></a>}
            {!ro && <button type="button" onClick={() => del(l)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={13} /></button>}
          </li>
        ))}
        {!ctx.lampiran.length && !queue.length && ro && <li className="text-xs text-slate-400">Tidak ada lampiran.</li>}
      </ul>
    </div>
  )
}
