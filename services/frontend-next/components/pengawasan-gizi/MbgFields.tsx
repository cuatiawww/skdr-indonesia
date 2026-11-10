'use client'
// PR 033: renderer isian Formulir 1–13 Pengawasan Gizi MBG (butir Sesuai/Tidak Sesuai + keterangan, sampel sisa makanan,
// pemorsian per kelompok sasaran, tabel ketenagaan, sosialisasi SOP, rekap F12/F13, unggah bukti per butir).
import { useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Download, FileUp, Info, Loader2, Paperclip, Plus, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { inputCls } from '@/components/master/MasterUi'
import SearchSelect from '@/components/ui/SearchSelect'
import { isReq, type Data, type FieldDef, type Issue } from '@/lib/laporan/engine'
import { F1, F2, REKAP, SKOR_RULE, SISA_JENIS, SP_KELOMPOK, SP_TABEL } from '@/lib/pengawasan-gizi/naskah'
import { f2Saran, f9Item, sasaranOf, sisaItem, SAMPEL, SESUAI, TIDAK, BATAS_SISA, type Eval } from '@/lib/pengawasan-gizi/rules'
import { KES_CLS, MBG_HREF, lampiranUrl, uploadMbgLampiran, type MbgKunjungan, type MbgLampiran } from '@/lib/pengawasan-gizi/api'

export interface MbgCtx {
  no: number
  kid: number
  data: Data
  readOnly: boolean
  errors: Issue[]
  warnings: Issue[]
  show: (key: string) => boolean
  touch: (key: string) => void
  set: (key: string, v: any, extra?: Data) => void
  ev: Eval
  kunjungan: MbgKunjungan
  lampiran: MbgLampiran[]
  setLampiran: (l: MbgLampiran[]) => void
  limits: { max_bytes: number; tipe: string[] }
}

const pill = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const parseInt0 = (s: string) => { const t = s.replace(/[^\d]/g, ''); return t === '' ? null : Number(t) }
const parseDec = (s: string) => { const t = s.replace(/[^\d.,]/g, '').replace(/([.,].*)[.,]/g, '$1'); return t === '' ? null : t }

export function KesBadge({ v, empty = 'Belum dapat disimpulkan' }: { v: string | null | undefined; empty?: string }) {
  return <span className={pill(KES_CLS(v))}>{v || empty}</span>
}

/** segmented choice (radio group) */
export function Seg({ value, options, onChange, disabled, invalid, id, label }: {
  value: any; options: { value: string; label: string; tone?: 'ok' | 'bad' }[]; onChange: (v: string | null) => void; disabled?: boolean; invalid?: boolean; id?: string; label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} id={id} className={`inline-flex flex-wrap gap-1 rounded-xl ${invalid ? 'ring-2 ring-red-200' : ''}`}>
      {options.map((o) => {
        const on = value === o.value
        const tone = on ? (o.tone === 'ok' ? 'border-emerald-500 bg-emerald-500 text-white' : o.tone === 'bad' ? 'border-red-500 bg-red-500 text-white' : 'border-primary bg-primary text-white') : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40'
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(on ? null : o.value)}
            className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${tone}`}>
            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}{o.label}
          </button>
        )
      })}
    </div>
  )
}
const SESUAI_OPTS = [{ value: SESUAI, label: 'Sesuai', tone: 'ok' as const }, { value: TIDAK, label: 'Tidak Sesuai', tone: 'bad' as const }]

/** error/warning messages for keys owned by a field */
function msgs(list: Issue[], keys: (k: string) => boolean) { return Array.from(new Set(list.filter((i) => keys(i.key)).map((i) => i.msg))) }
const ownBy = (prefixes: string[]) => (k: string) => prefixes.some((p) => k === p || k.startsWith(`${p}_`))

export function MbgFieldView({ f, ctx }: { f: FieldDef; ctx: MbgCtx }) {
  const kind = f.type === 'mbg' ? f.mbg!.kind : f.type
  const p = f.mbg || { kind }
  const prefixes = kind === 'rekap' ? (REKAP[p.no as 12 | 13].aspek.map(([n]) => `f${n}`)) : [p.pre || f.key]
  const own = ownBy(prefixes)
  const shown = ctx.show(f.key) || prefixes.some((x) => ctx.show(x))
  const errs = shown ? msgs(ctx.errors, own) : []
  const warns = msgs(ctx.warnings, own)
  const req = isReq(f, ctx.data)
  const wide = f.wide !== false
  const bare = ['dokumen', 'note', 'hasil', 'rekap', 'sptabel', 'lampiran', 'b1total'].includes(kind)
  const itemRow = ['cek', 'sisa', 'f9item', 'f2b', 'a2row', 'b2row', 'b2lain'].includes(kind)
  return (
    <div data-field={f.key} className={`${wide ? 'sm:col-span-2' : ''} min-w-0 rounded-lg ${itemRow ? `rounded-xl border p-3 sm:p-4 ${errs.length ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'}` : ''}`}>
      {!bare && (
        <div className="mb-1.5 flex flex-wrap items-start gap-1.5 text-xs font-semibold text-slate-700">
          <span className="leading-snug">{f.label}{req && <span className="ml-0.5 text-red-500">*</span>}</span>
        </div>
      )}
      <Control f={f} kind={kind} p={p} ctx={ctx} invalid={errs.length > 0} />
      {f.hint && !errs.length && <p className="mt-1 text-[11px] leading-snug text-slate-400">{f.hint}</p>}
      {errs.map((m) => <p key={m} className="mt-1 text-[11px] font-medium text-red-600" role="alert">{m}</p>)}
      {warns.map((m) => <p key={m} className="mt-1 text-[11px] font-medium text-amber-700">⚠ {m}</p>)}
    </div>
  )
}

function Ket({ ctx, k, required, placeholder = 'Keterangan' }: { ctx: MbgCtx; k: string; required?: boolean; placeholder?: string }) {
  const v = ctx.data[k]
  if (ctx.readOnly && !v) return null
  return (
    <div data-field={k} className="mt-2">
      <textarea rows={required || v ? 2 : 1} maxLength={500} disabled={ctx.readOnly} value={v ?? ''} aria-label={placeholder}
        placeholder={required ? `${placeholder} (wajib bila Tidak Sesuai)` : `${placeholder} (opsional)`}
        className={`${inputCls} min-h-[38px] text-xs ${required && !v ? 'border-amber-300' : ''}`} onChange={(e) => ctx.set(k, e.target.value)} onBlur={() => ctx.touch(k)} />
    </div>
  )
}

function Num({ ctx, k, label, suffix, dec, className = '' }: { ctx: MbgCtx; k: string; label: string; suffix?: string; dec?: boolean; className?: string }) {
  const bad = ctx.show(k) && ctx.errors.some((e) => e.key === k)
  return (
    <div data-field={k} className={`flex items-stretch ${className}`}>
      <input type="text" inputMode={dec ? 'decimal' : 'numeric'} aria-label={label} disabled={ctx.readOnly} value={ctx.data[k] ?? ''} placeholder="—"
        onFocus={(e) => e.target.select()} onBlur={() => ctx.touch(k)} onChange={(e) => ctx.set(k, dec ? parseDec(e.target.value) : parseInt0(e.target.value))}
        className={`${inputCls} min-w-0 tabular-nums text-center ${suffix ? 'rounded-r-none' : ''} ${bad ? 'border-red-300 ring-1 ring-red-200' : ''}`} />
      {suffix && <span className="inline-flex items-center rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-500">{suffix}</span>}
    </div>
  )
}

function Control({ f, kind, p, ctx, invalid }: { f: FieldDef; kind: string; p: Record<string, any>; ctx: MbgCtx; invalid: boolean }) {
  const { data, readOnly: ro } = ctx
  const v = data[f.key]
  const set = (x: any, extra?: Data) => ctx.set(f.key, x, extra)
  switch (kind) {
    case 'text':
      return <input id={`mf-${f.key}`} className={`${inputCls} ${invalid ? 'border-red-300 ring-1 ring-red-200' : ''}`} value={v ?? ''} disabled={ro} maxLength={f.maxLen}
        onChange={(e) => set(e.target.value)} onBlur={() => ctx.touch(f.key)} />
    case 'textarea':
      return <textarea id={`mf-${f.key}`} rows={3} className={`${inputCls} min-h-[84px] ${invalid ? 'border-red-300' : ''}`} value={v ?? ''} disabled={ro} maxLength={f.maxLen}
        onChange={(e) => set(e.target.value)} onBlur={() => ctx.touch(f.key)} />
    case 'dokumen':
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600">
          <p className="mb-1 font-semibold text-slate-500">{f.label} :</p>
          <ol className="list-decimal space-y-0.5 pl-5">{(p.list as string[]).map((d) => <li key={d}>{d}</li>)}</ol>
        </div>
      )
    case 'note':
      return <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p.text}</p>
    case 'rek':
      return <input id={`mf-${f.key}`} className={`${inputCls} ${invalid ? 'border-red-300 ring-1 ring-red-200' : ''}`} value={v ?? ''} disabled={ro} maxLength={500} placeholder="…...................................................................."
        onChange={(e) => set(e.target.value)} onBlur={() => ctx.touch(f.key)} />
    case 'choice':
      return (
        <div>
          <Seg label={f.label} value={v} options={(p.opts as string[]).map((o) => ({ value: o, label: o }))} onChange={(x) => set(x)} disabled={ro} invalid={invalid} />
          {p.hint && <p className="mt-1 text-[11px] text-slate-400">{p.hint}</p>}
        </div>
      )
    case 'count':
      return (
        <div>
          <Num ctx={ctx} k={f.key} label={f.label} suffix={p.suffix} className="max-w-[200px]" />
          {p.catatan && <ul className="mt-1 text-[11px] text-slate-400">{(p.catatan as string[]).map((c) => <li key={c}>• {c}</li>)}</ul>}
        </div>
      )
    case 'cek': return <CekRow f={f} p={p} ctx={ctx} invalid={invalid} />
    case 'sisa': return <SisaRow p={p} ctx={ctx} />
    case 'f9item': return <F9Row f={f} p={p} ctx={ctx} />
    case 'sasaran': return <SasaranEditor ctx={ctx} invalid={invalid} />
    case 'sptabel': return <SpTabel />
    case 'a2row':
      return (
        <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
          <Seg label={f.label} value={v} options={[{ value: 'Belum', label: 'Belum mengikuti', tone: 'bad' }, { value: 'Sudah', label: 'Sudah mengikuti', tone: 'ok' }]} onChange={(x) => set(x)} disabled={ro} invalid={invalid} />
          <input data-field={`${f.key}_sertifikat`} className={inputCls} disabled={ro} maxLength={200} value={data[`${f.key}_sertifikat`] ?? ''} placeholder="Sertifikat atau Surat Tugas (nomor)"
            onChange={(e) => ctx.set(`${f.key}_sertifikat`, e.target.value)} />
        </div>
      )
    case 'b2row': case 'b2lain': {
      const pre = p.pre as string
      return (
        <div className="space-y-2">
          {kind === 'b2lain' && <input data-field={`${pre}_nama`} className={inputCls} disabled={ro} maxLength={200} value={data[`${pre}_nama`] ?? ''} placeholder="Nama pelatihan (kosongkan bila tidak ada)"
            onChange={(e) => ctx.set(`${pre}_nama`, e.target.value)} />}
          {(kind === 'b2row' || data[`${pre}_nama`]) && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-[11px] text-slate-500">Jumlah Yang Belum mengikuti<Num ctx={ctx} k={`${pre}_belum`} label="Jumlah yang belum mengikuti" suffix="orang" /></label>
              <label className="text-[11px] text-slate-500">Jumlah Yang Sudah mengikuti<Num ctx={ctx} k={`${pre}_sudah`} label="Jumlah yang sudah mengikuti" suffix="orang" /></label>
              <label className="col-span-2 inline-flex min-h-[38px] items-center gap-2 text-xs text-slate-600 sm:col-span-1" title={F1.b2Bukti}>
                <input type="checkbox" className="h-4 w-4 accent-[#0060A9]" disabled={ro} checked={data[`${pre}_bukti`] === true} onChange={(e) => ctx.set(`${pre}_bukti`, e.target.checked)} />
                Sertifikat/bukti dokumen ada
              </label>
            </div>
          )}
        </div>
      )
    }
    case 'b1total': {
      const h = ctx.ev.hasil
      return (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span>Total penjamah makanan: <b className="tabular-nums">{h.total_penjamah ?? '—'}</b> orang</span>
          <span className="text-slate-500">Minimal: <b>{h.ambang}</b> orang{data.wilayah_3t === 'Ya' ? ' (wilayah 3T)' : ''}</span>
        </div>
      )
    }
    case 'f2b': return <F2Row f={f} p={p} ctx={ctx} invalid={invalid} />
    case 'hasil': return <Hasil f={f} p={p} ctx={ctx} />
    case 'rekap': return <Rekap no={p.no} ctx={ctx} />
    case 'lampiran': return <Lampiran ctx={ctx} item={p.item ?? ''} label={f.label} />
    default: return <p className="text-xs text-red-600">Jenis isian tidak dikenal: {kind}</p>
  }
}

function CekRow({ f, p, ctx, invalid }: { f: FieldDef; p: Record<string, any>; ctx: MbgCtx; invalid: boolean }) {
  const [open, setOpen] = useState(false)
  const v = ctx.data[f.key]
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Seg label={f.label} value={v} options={SESUAI_OPTS} onChange={(x) => ctx.set(f.key, x)} disabled={ctx.readOnly} invalid={invalid} id={`mf-${f.key}`} />
        {p.note && <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"><Info className="h-3 w-3" /> Contoh tindakan koreksi <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} /></button>}
      </div>
      {open && p.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">{p.note}</p>}
      <Ket ctx={ctx} k={`${f.key}_ket`} required={v === TIDAK} />
      {p.foto && <div className="mt-2"><Lampiran ctx={ctx} item={f.key} label="Foto" compact /></div>}
    </div>
  )
}

function SisaRow({ p, ctx }: { p: Record<string, any>; ctx: MbgCtx }) {
  const k = p.k as number
  const r = sisaItem(ctx.data, k)
  return (
    <div>
      <p className="mb-1 text-[11px] text-slate-500">% sisa {SISA_JENIS[k - 3]?.toLowerCase()} per ompreng (0–100)</p>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: SAMPEL }, (_, x) => {
          const key = `sisa_i${k}_${x + 1}`
          const val = Number(String(ctx.data[key] ?? '').replace(',', '.'))
          const lt = ctx.data[key] != null && ctx.data[key] !== '' && val < BATAS_SISA
          return (
            <label key={key} className="text-center text-[10px] text-slate-400">ompreng {x + 1}
              <Num ctx={ctx} k={key} label={`Item ${k} ompreng ${x + 1}`} suffix="%" dec className={lt ? '[&_input]:border-emerald-300' : ''} />
            </label>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span>{r.lt}/{SAMPEL} sampel sisa &lt; {BATAS_SISA}%</span>
        {r.rata !== null && <span className="text-slate-400">· rata-rata {String(r.rata).replace('.', ',')}%</span>}
        <span>→</span><KesBadge v={r.val} empty={`${r.filled}/${SAMPEL} terisi`} />
      </div>
      <Ket ctx={ctx} k={`i${k}_ket`} />
    </div>
  )
}

function F9Row({ f, p, ctx }: { f: FieldDef; p: Record<string, any>; ctx: MbgCtx }) {
  const k = p.k as number
  const sas = sasaranOf(ctx.data)
  const val = f9Item(ctx.data, k)
  if (!sas.length) return <p className="text-xs text-amber-700">Tambahkan kelompok sasaran dulu (langkah Kelompok Sasaran).</p>
  return (
    <div>
      <div className="space-y-1.5">
        {sas.map((s, x) => (
          <div key={s.id} data-field={`i${k}_${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
            <span className="text-xs text-slate-600"><b>Sasaran {x + 1}</b> · {s.nama || '—'}</span>
            <Seg label={`${f.label} — ${s.nama}`} value={ctx.data[`i${k}_${s.id}`]} options={SESUAI_OPTS} onChange={(v) => ctx.set(`i${k}_${s.id}`, v)} disabled={ctx.readOnly} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">Nilai butir: <KesBadge v={val} empty="lengkapi semua sasaran" /></div>
      <Ket ctx={ctx} k={`i${k}_ket`} required={val === TIDAK} />
    </div>
  )
}

function SasaranEditor({ ctx, invalid }: { ctx: MbgCtx; invalid: boolean }) {
  const sas = sasaranOf(ctx.data)
  const opts = SP_KELOMPOK.map((x) => ({ value: x, label: x }))
  const write = (next: { id: string; nama: string }[], extra: Data = {}) => ctx.set('sasaran', next, extra)
  const add = () => write([...sas, { id: `s${Date.now().toString(36)}`, nama: '' }])
  const remove = (id: string) => {
    if (!window.confirm('Hapus kelompok sasaran ini beserta penilaiannya?')) return
    const extra: Data = {}
    for (let k = 1; k <= 6; k++) extra[`i${k}_${id}`] = null
    write(sas.filter((s) => s.id !== id), extra)
  }
  return (
    <div className="space-y-2">
      {sas.map((s, x) => (
        <div key={s.id} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">Sasaran {x + 1}</span>
          <div className="min-w-0 flex-1">
            <SearchSelect options={opts} value={s.nama || null} disabled={ctx.readOnly} invalid={invalid && !s.nama} ariaLabel={`Kelompok sasaran ${x + 1}`} placeholder="Pilih kelompok sasaran…"
              onChange={(v) => write(sas.map((y) => (y.id === s.id ? { ...y, nama: v || '' } : y)))} />
          </div>
          {!ctx.readOnly && <button type="button" onClick={() => remove(s.id)} aria-label={`Hapus sasaran ${x + 1}`} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {!ctx.readOnly && <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" /> Tambah kelompok sasaran</button>}
    </div>
  )
}

function SpTabel() {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[720px] text-[11px]">
        <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 text-left">Kelompok pangan</th>{SP_KELOMPOK.map((k) => <th key={k} className="p-2 text-center font-semibold">{k}</th>)}</tr></thead>
        <tbody>{SP_TABEL.map((r) => <tr key={r.pangan} className="border-t border-slate-100"><td className="p-2 font-semibold text-slate-700">{r.pangan}</td>{r.nilai.map((n, i) => <td key={i} className="p-2 text-center tabular-nums">{n}</td>)}</tr>)}</tbody>
      </table>
      <p className="px-2 py-1 text-[10px] text-slate-400">* SP --&gt; Mengacu pada Daftar Bahan Makanan Penukar</p>
    </div>
  )
}

function F2Row({ f, p, ctx, invalid }: { f: FieldDef; p: Record<string, any>; ctx: MbgCtx; invalid: boolean }) {
  const r = p.r as number
  const d = ctx.data
  const saran = f2Saran(d, r)
  const sosKey = `b${r}_sos`
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" data-field={sosKey}>
        <span className="w-24 text-[11px] text-slate-500">Sosialisasi</span>
        <Seg label={`${f.label} — sosialisasi`} value={d[sosKey]} options={[{ value: 'Sudah', label: 'Sudah Sosialisasi' }, { value: 'Belum', label: 'Belum' }]} onChange={(x) => ctx.set(sosKey, x)} disabled={ctx.readOnly} invalid={invalid && !d[sosKey]} />
      </div>
      {d[sosKey] === 'Sudah' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-0 sm:pl-[104px]">
          {F2.bukti.map((b) => (
            <label key={b.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-[#0060A9]" disabled={ctx.readOnly} checked={d[`b${r}_${b.key}`] === true} onChange={(e) => ctx.set(`b${r}_${b.key}`, e.target.checked)} />
              {r >= 4 && r <= 7 && b.key === 'undangan' ? 'Undangan' : b.label}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-[11px] text-slate-500">Kesesuaian</span>
        <Seg label={`${f.label} — kesesuaian`} value={d[`b${r}`]} options={SESUAI_OPTS} onChange={(x) => ctx.set(`b${r}`, x)} disabled={ctx.readOnly} invalid={invalid && !d[`b${r}`]} id={`mf-b${r}`} />
        {saran && d[`b${r}`] !== saran && !ctx.readOnly && (
          <button type="button" onClick={() => ctx.set(`b${r}`, saran)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Wand2 className="h-3 w-3" /> Saran: {saran}</button>
        )}
      </div>
      <Ket ctx={ctx} k={`b${r}_ket`} />
    </div>
  )
}

function Hasil({ f, p, ctx }: { f: FieldDef; p: Record<string, any>; ctx: MbgCtx }) {
  const h = ctx.ev.hasil
  if (p.f1) {
    const v = p.f1 === 'all' ? ctx.ev.kesimpulan : h[p.f1]
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-700">{f.label}</span><KesBadge v={v} /></div>
        {p.rule && <p className="mt-1 text-[11px] text-slate-500">{p.rule}</p>}
        {p.f1 === 'all' && (
          <ul className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
            {[['A.1', h.a1], ['A.2', h.a2], ['Pengawas Gizi (A)', h.a], ['B.1', h.b1], ['B.2', h.b2]].map(([l, x]) => <li key={l} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1"><span>{l}</span><KesBadge v={x} empty="—" /></li>)}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-slate-400">Dihitung otomatis dari isian.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 text-xs">
      {ctx.ev.skor !== null || p.skor ? (
        <div className="mb-2 grid gap-2 sm:grid-cols-3">
          <div><p className="text-[11px] text-slate-500">Total Jawaban &quot;sesuai&quot;</p><p className="text-lg font-bold tabular-nums text-slate-800">{h.sesuai ?? 0}<span className="text-xs font-normal text-slate-400"> / {h.total ?? '—'}</span></p></div>
          <div><p className="text-[11px] text-slate-500">Skor</p><p className="text-lg font-bold tabular-nums text-slate-800">{ctx.ev.skor !== null ? String(ctx.ev.skor).replace('.', ',') : '—'}</p></div>
          <div><p className="text-[11px] text-slate-500">Butir dinilai</p><p className="text-lg font-bold tabular-nums text-slate-800">{h.dinilai ?? 0}<span className="text-xs font-normal text-slate-400"> / {h.total ?? '—'}</span></p></div>
        </div>
      ) : null}
      {p.skor && <p className="mb-2 text-[11px] text-slate-500">{p.skor}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-700">{f.label}</span><KesBadge v={ctx.ev.kesimpulan} empty="Lengkapi semua butir" /></div>
      <p className="mt-1 text-[11px] text-slate-500">{p.rule || SKOR_RULE}</p>
      {ctx.no === 9 && h.sel_total > 0 && <p className="mt-1 text-[11px] text-slate-400">Sel sasaran sesuai: {h.sel_sesuai}/{h.sel_total}</p>}
    </div>
  )
}

function Rekap({ no, ctx }: { no: 12 | 13; ctx: MbgCtx }) {
  const meta = REKAP[no]
  const forms = ctx.kunjungan.forms
  const sesuai = meta.aspek.filter(([n]) => forms.find((x) => x.form_no === n && x.status === 'dikirim')?.kesimpulan === SESUAI).length
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-500"><tr><th className="w-10 p-2 text-left">No</th><th className="p-2 text-left">Aspek</th><th className="p-2 text-center">Sesuai / Tidak Sesuai</th><th className="p-2 text-left">Keterangan</th></tr></thead>
          <tbody>
            {meta.aspek.map(([n, label], i) => {
              const src = forms.find((x) => x.form_no === n)
              const ok = src?.status === 'dikirim'
              return (
                <tr key={n} data-field={`f${n}`} className="border-t border-slate-100 align-top">
                  <td className="p-2 font-semibold">{i + 1}</td>
                  <td className="p-2"><Link href={`${MBG_HREF}/${ctx.kid}/f${n}`} className="font-semibold text-primary hover:underline">{label}</Link><p className="text-[10px] text-slate-400">Formulir {n}{src?.skor != null ? ` · skor ${String(src.skor).replace('.', ',')}` : ''}</p></td>
                  <td className="p-2 text-center">{ok ? <KesBadge v={src?.kesimpulan} /> : <span className={pill('border-amber-200 bg-amber-50 text-amber-700')}>{src ? 'Masih draf' : 'Belum diisi'}</span>}</td>
                  <td className="p-2"><input data-field={`ket${n}`} className={`${inputCls} text-xs`} disabled={ctx.readOnly} maxLength={500} value={ctx.data[`ket${n}`] ?? ''} placeholder="(opsional)" onChange={(e) => ctx.set(`ket${n}`, e.target.value)} /></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr className="border-t border-slate-200 bg-slate-50 font-semibold"><td className="p-2" colSpan={2}>Total Jawaban &quot;sesuai&quot;</td><td className="p-2 text-center tabular-nums">{sesuai} / {meta.aspek.length}</td><td /></tr></tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-3 text-xs">
        <div><p className="font-semibold text-slate-700">{meta.kesLabel} (BAIK/BELUM BAIK)</p><p className="text-[11px] text-slate-500">{meta.rule}</p></div>
        <KesBadge v={ctx.ev.kesimpulan} empty="Menunggu formulir sumber dikirim" />
      </div>
    </div>
  )
}

export function Lampiran({ ctx, item, label, compact }: { ctx: MbgCtx; item: string; label: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<{ name: string; pct: number }[]>([])
  const list = ctx.lampiran.filter((l) => (l.item_key || '') === item)
  const accept = ctx.limits.tipe.join(',')
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    let cur = [...ctx.lampiran]
    for (const file of Array.from(files)) {
      if (file.size > ctx.limits.max_bytes) { toast.error(`${file.name}: ukuran maksimal ${fmtSize(ctx.limits.max_bytes)}`); continue }
      if (file.type && !ctx.limits.tipe.includes(file.type)) { toast.error(`${file.name}: tipe file tidak didukung`); continue }
      setBusy((b) => [...b, { name: file.name, pct: 0 }])
      try {
        const l = await uploadMbgLampiran(ctx.kid, ctx.no, item, file, (pct) => setBusy((b) => b.map((x) => (x.name === file.name ? { ...x, pct } : x))))
        cur = [...cur, l]; ctx.setLampiran(cur)
      } catch (e) { toast.error(`${file.name}: ${e instanceof Error ? e.message : String(e)}`) }
      finally { setBusy((b) => b.filter((x) => x.name !== file.name)) }
    }
    if (ref.current) ref.current.value = ''
  }
  const remove = async (l: MbgLampiran) => {
    if (!window.confirm(`Hapus lampiran "${l.nama_file}"?`)) return
    const res = await fetch(lampiranUrl(ctx.kid, l.id), { method: 'DELETE' })
    if (res.ok) ctx.setLampiran(ctx.lampiran.filter((x) => x.id !== l.id)); else toast.error('Lampiran gagal dihapus')
  }
  const wrap: ReactNode = (
    <ul className="space-y-1">
      {list.map((l) => (
        <li key={l.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <a href={lampiranUrl(ctx.kid, l.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline" title={l.nama_file}>{l.nama_file}</a>
          <span className="text-[10px] text-slate-400">{fmtSize(l.ukuran)}</span>
          <a href={lampiranUrl(ctx.kid, l.id)} target="_blank" rel="noreferrer" aria-label="Unduh" className="text-slate-400 hover:text-primary"><Download className="h-3.5 w-3.5" /></a>
          {!ctx.readOnly && <button type="button" onClick={() => remove(l)} aria-label={`Hapus ${l.nama_file}`} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>}
        </li>
      ))}
      {busy.map((b) => <li key={b.name} className="flex items-center gap-2 px-2 text-[11px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> {b.name} · {b.pct}%</li>)}
    </ul>
  )
  return (
    <div className={compact ? '' : 'rounded-xl border border-dashed border-slate-300 p-3'}>
      {!compact && <p className="mb-1.5 text-xs font-semibold text-slate-600">{label}</p>}
      {wrap}
      {!ctx.readOnly && (
        <>
          <input ref={ref} type="file" multiple accept={accept} className="hidden" onChange={(e) => pick(e.target.files)} />
          <button type="button" onClick={() => ref.current?.click()} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-primary/40 hover:text-primary">
            <FileUp className="h-3.5 w-3.5" /> {compact ? `Unggah ${label.toLowerCase()}` : 'Unggah file'}
          </button>
          {!compact && <span className="ml-2 text-[10px] text-slate-400">PDF/JPG/PNG/WEBP/Word/Excel, maks. {fmtSize(ctx.limits.max_bytes)}</span>}
        </>
      )}
      {ctx.readOnly && !list.length && <p className="text-[11px] text-slate-400">Tidak ada lampiran.</p>}
    </div>
  )
}
