'use client'
// PR 034: renderer isian khusus Keracunan Pangan MBG — tanggal+jam, tombol pilihan, daftar sekolah, gejala (centang + jumlah),
// 26 SOP (Ada/Dilakukan), tabel baris, petugas, attack rate/CFR otomatis, saran SPPG & diagnosa banding, lampiran per kategori.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Activity, Check, Download, FileUp, FlaskConical, Info, Lightbulb, Loader2, Paperclip, Plus, Search, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { inputCls } from '@/components/master/MasterUi'
import SearchSelect from '@/components/ui/SearchSelect'
import { FieldView, type FieldCtx } from '@/components/laporan/LaporanFields'
import { isReq, type Data, type FieldDef } from '@/lib/laporan/engine'
import { GEJALA, HASIL_LAB, PETUGAS, SAMPEL_KATEGORI, SOP, SUMBER_AIR, cnt, hasil, rows, saranDiagnosa, totalPorsi, type Hasil } from '@/lib/keracunan-mbg/rules'
import { KP_API, kpFetch, lampiranUrl, uploadKpLampiran, type KpLampiran, type KpSppg } from '@/lib/keracunan-mbg/api'

export interface KpCtx {
  fctx: FieldCtx
  data: Data
  readOnly: boolean
  /** lampiran may still be changed after the report is sent (until ditutup) */
  lampiranReadOnly: boolean
  errs: Record<string, string[]>
  warns: Record<string, string[]>
  show: (key: string) => boolean
  touch: (key: string) => void
  set: (key: string, v: any, extra?: Data) => void
  patch: (p: Data) => void
  today: string
  rid: number | null
  ensureSaved: () => Promise<number | null>
  lampiran: KpLampiran[]
  setLampiran: (l: KpLampiran[]) => void
  limits: { max_bytes: number; tipe: string[] }
}

const OPT: Record<string, string[]> = { sumber_air: SUMBER_AIR, sampel_kategori: SAMPEL_KATEGORI, hasil_lab: HASIL_LAB, yt: ['Ya', 'Tidak'] }
const opts = (l: string[]) => l.map((x) => ({ value: x, label: x }))
const cell = 'w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-slate-50'
const fmt = (x: number | null | undefined, suf = '') => (x === null || x === undefined ? '—' : `${String(x).replace('.', ',')}${suf}`)
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const parseNum = (s: string) => { const t = s.replace(/[^\d]/g, ''); return t === '' ? null : Number(t) }
let seq = 0
const rid = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`

/** FieldView for standard types, custom renderers for type 'mbg' (kind = f.mbg.kind) */
export function KpFieldView({ f, ctx }: { f: FieldDef; ctx: KpCtx }) {
  if (f.type !== 'mbg') return <FieldView f={f} ctx={ctx.fctx} />
  const kind = f.mbg!.kind
  const shown = ctx.show(f.key)
  const errs = shown ? ctx.errs[f.key] || [] : []
  const warns = ctx.warns[f.key] || []
  const wide = f.wide || ['sekolah', 'gejala', 'sop', 'rows', 'petugas', 'lampiran', 'hasil', 'saran'].includes(kind)
  const bare = ['hasil', 'sum', 'inkubasi', 'pct', 'saran'].includes(kind)
  return (
    <div data-field={f.key} className={`${wide ? 'sm:col-span-2' : ''} ${f.child ? 'border-l-2 border-primary/15 pl-3' : ''} min-w-0 rounded-lg`}>
      {!bare && (
        <label htmlFor={`kp-${f.key}`} className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
          <span>{f.label}{isReq(f, ctx.data) && <span className="ml-0.5 text-red-500">*</span>}</span>
          {ctx.fctx.auto[f.key] && <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-semibold text-sky-700" title={ctx.fctx.auto[f.key]}><Sparkles size={9} /> Otomatis</span>}
        </label>
      )}
      <Control f={f} ctx={ctx} invalid={errs.length > 0} />
      {f.hint && !errs.length && <p className="mt-1 text-[11px] leading-snug text-slate-400">{f.hint}</p>}
      {errs.map((m, i) => <p key={`e${i}`} className="mt-1 text-[11px] font-medium text-red-600" role="alert">{m}</p>)}
      {warns.map((m, i) => <p key={`w${i}`} className="mt-1 text-[11px] font-medium text-amber-700">⚠ {m}</p>)}
    </div>
  )
}

function Control({ f, ctx, invalid }: { f: FieldDef; ctx: KpCtx; invalid: boolean }) {
  const p = f.mbg!
  switch (p.kind) {
    case 'datetime': return <DateTime f={f} ctx={ctx} invalid={invalid} />
    case 'chips': return <Chips value={ctx.data[f.key]} options={p.options} disabled={ctx.readOnly} onChange={(v) => { ctx.set(f.key, v); ctx.touch(f.key) }} id={`kp-${f.key}`} />
    case 'hasil': return <HasilPanel h={hasil(ctx.data)} compact={!!p.compact} />
    case 'sum': return <SumCheck ctx={ctx} keys={p.keys} label={p.label} />
    case 'inkubasi': return <Inkubasi ctx={ctx} apply={!!p.apply} />
    case 'pct': { const h = hasil(ctx.data); return <Chip tone={h.pct_penjamah === null ? 'muted' : h.pct_penjamah >= 80 ? 'ok' : 'warn'}>Penjamah terlatih: <b>{fmt(h.pct_penjamah, '%')}</b>{h.pct_penjamah !== null && h.pct_penjamah < 80 ? ' — di bawah 80%' : ''}</Chip> }
    case 'labstatus': { const s = hasil(ctx.data).lab_status; return <Chip tone={s === 'hasil' ? 'ok' : s === 'dikirim' ? 'info' : 'muted'}><FlaskConical className="h-3.5 w-3.5" /> {s === 'hasil' ? 'Hasil Lab' : s === 'dikirim' ? 'Menunggu hasil lab' : 'Belum ada sampel'}</Chip> }
    case 'sppg': return <Sppg f={f} ctx={ctx} invalid={invalid} />
    case 'sekolah': return <Sekolah ctx={ctx} />
    case 'gejala': return <Gejala ctx={ctx} />
    case 'sop': return <Sop ctx={ctx} />
    case 'rows': return <Rows f={f} ctx={ctx} />
    case 'petugas': return <Petugas ctx={ctx} />
    case 'saran': return <Saran ctx={ctx} />
    case 'lampiran': return <LampiranBox ctx={ctx} kategori={p.kategori} label={f.label} />
  }
  return null
}

export function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'info' | 'muted' | 'bad'; children: ReactNode }) {
  const cls = { ok: 'border-emerald-200 bg-emerald-50 text-emerald-700', warn: 'border-amber-200 bg-amber-50 text-amber-800', info: 'border-sky-200 bg-sky-50 text-sky-700', muted: 'border-slate-200 bg-slate-50 text-slate-500', bad: 'border-red-200 bg-red-50 text-red-700' }[tone]
  return <div className={`inline-flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${cls}`}>{children}</div>
}

/** segmented buttons; click the active one again to clear */
export function Chips({ value, options, disabled, onChange, id, size = 'md' }: { value: any; options: string[]; disabled?: boolean; onChange: (v: string | null) => void; id?: string; size?: 'sm' | 'md' }) {
  return (
    <div id={id} role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o
        const neg = /^Tidak/.test(o)
        return (
          <button key={o} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(on ? null : o)}
            className={`rounded-lg border font-semibold transition ${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} ${on ? (neg ? 'border-rose-500 bg-rose-500 text-white' : 'border-primary bg-primary text-white') : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40'} disabled:cursor-not-allowed disabled:opacity-60`}>
            {on && <Check className="mr-1 inline h-3 w-3" strokeWidth={3} />}{o}
          </button>
        )
      })}
    </div>
  )
}

function DateTime({ f, ctx, invalid }: { f: FieldDef; ctx: KpCtx; invalid: boolean }) {
  const v: string = ctx.data[f.key] || ''
  const now = () => {
    const d = new Date(Date.now() + 7 * 3600 * 1000) // WIB
    return d.toISOString().slice(0, 16)
  }
  const date = v.slice(0, 10)
  const time = v.length > 10 ? v.slice(11, 16) : ''
  const setParts = (d: string, t: string) => ctx.set(f.key, d ? `${d}T${t || '00:00'}` : null)
  return (
    <div>
      <div className="flex gap-2">
        <input id={`kp-${f.key}`} type="date" max={ctx.today} disabled={ctx.readOnly} value={date} onChange={(e) => setParts(e.target.value, time)} onBlur={() => ctx.touch(f.key)}
          className={`${inputCls} ${invalid ? 'border-red-300 ring-1 ring-red-200' : ''}`} />
        <input type="time" aria-label={`Jam ${f.label}`} disabled={ctx.readOnly || !date} value={time} onChange={(e) => setParts(date, e.target.value)} onBlur={() => ctx.touch(f.key)}
          className={`${inputCls} max-w-[120px] tabular-nums`} />
      </div>
      {!ctx.readOnly && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {f.mbg?.now && <button type="button" onClick={() => ctx.set(f.key, now())} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-primary/40 hover:text-primary">Sekarang</button>}
          {[['Hari ini', 0], ['Kemarin', -1]].map(([l, dd]) => (
            <button key={l as string} type="button" onClick={() => { const x = new Date(`${ctx.today}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + (dd as number)); setParts(x.toISOString().slice(0, 10), time) }}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-primary/40 hover:text-primary">{l}</button>
          ))}
          {f.key === 'jam_gejala' && ctx.data.jam_makan && !v && <button type="button" onClick={() => setParts(String(ctx.data.jam_makan).slice(0, 10), '')} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-primary/40 hover:text-primary">Hari yang sama dgn makan</button>}
        </div>
      )}
    </div>
  )
}

export function HasilPanel({ h, compact }: { h: Hasil; compact?: boolean }) {
  const box = (label: string, val: string, sub: string, tone: string) => (
    <div className={`rounded-xl border px-3 py-2 ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-lg font-bold tabular-nums">{val}</div>
      <div className="text-[10px] opacity-70">{sub}</div>
    </div>
  )
  const arTone = h.ar === null ? 'border-slate-200 bg-slate-50 text-slate-500' : h.ar >= 20 ? 'border-red-200 bg-red-50 text-red-700' : 'border-primary/20 bg-primary/[0.04] text-primary'
  const cfrTone = h.cfr ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {box('Attack rate', fmt(h.ar, '%'), h.terpapar !== null ? `${h.kasus ?? '–'} dari ${h.terpapar} terpapar${h.terpapar_sumber === 'porsi' ? ' (total porsi)' : ''}` : 'isi porsi sekolah / jumlah terpapar', arTone)}
      {box('CFR', fmt(h.cfr, '%'), `${h.meninggal ?? '–'} meninggal dari ${h.kasus ?? '–'} kasus`, cfrTone)}
      {box('Sekolah', String(h.sekolah), h.sekolah ? 'tercatat' : 'belum ada daftar', 'border-slate-200 bg-white text-slate-700')}
      {!compact && box('Inkubasi (saran)', fmt(h.inkubasi_saran, ' jam'), 'jam makan → gejala pertama', 'border-slate-200 bg-white text-slate-700')}
    </div>
  )
}

function SumCheck({ ctx, keys, label }: { ctx: KpCtx; keys: string[]; label: string }) {
  const vals = keys.map((k) => cnt(ctx.data, k))
  if (vals.every((x, i) => x === null || keys[i] === 'jumlah_meninggal')) return null
  const total = vals.reduce<number>((a, x) => a + (x ?? 0), 0)
  const kasus = cnt(ctx.data, 'jumlah_kasus')
  if (kasus === null) return null
  return <Chip tone={total === kasus ? 'ok' : 'warn'}><Activity className="h-3.5 w-3.5" /> {label}: <b className="tabular-nums">{total}</b> {total === kasus ? '= jumlah kasus ✓' : `≠ jumlah kasus (${kasus})`}</Chip>
}

function Inkubasi({ ctx, apply }: { ctx: KpCtx; apply: boolean }) {
  const h = hasil(ctx.data)
  if (h.inkubasi_saran === null) return <p className="text-[11px] text-slate-400"><Info className="mr-1 inline h-3 w-3" />Isi tanggal & jam makan serta gejala pertama (langkah 1) untuk menghitung perkiraan masa inkubasi.</p>
  const val = String(h.inkubasi_saran).replace('.', ',')
  const empty = ['inkubasi_min', 'inkubasi_max', 'inkubasi_rata', 'inkubasi_median'].every((k) => !ctx.data[k])
  return (
    <Chip tone="info">
      <Wand2 className="h-3.5 w-3.5" /> Makan → gejala pertama: <b>{val} jam</b>
      {apply && !ctx.readOnly && (
        <button type="button" onClick={() => ctx.patch(empty ? { inkubasi_min: val } : { inkubasi_min: ctx.data.inkubasi_min || val })} className="ml-1 rounded-md bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-sky-700">
          Pakai sebagai inkubasi terpendek
        </button>
      )}
    </Chip>
  )
}

// ─── SPPG: ketik nama → saran dari laporan keracunan & kunjungan pengawasan sebelumnya ─────────
function Sppg({ f, ctx, invalid }: { f: FieldDef; ctx: KpCtx; invalid: boolean }) {
  const v: string = ctx.data[f.key] || ''
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<KpSppg[]>([])
  const [loading, setLoading] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!open || ctx.readOnly) return
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      setLoading(true)
      const qs = new URLSearchParams()
      if (v.trim()) qs.set('q', v.trim())
      if (ctx.data.kabkota_id) qs.set('kabkota_id', String(ctx.data.kabkota_id))
      try { const j = await kpFetch<{ data: KpSppg[] }>(`${KP_API}-ref/sppg?${qs}`); setList(j.data) } catch { setList([]) } finally { setLoading(false) }
    }, 250)
    return () => { if (t.current) clearTimeout(t.current) }
  }, [open, v, ctx.data.kabkota_id, ctx.readOnly])
  const pick = (s: KpSppg) => {
    const extra: Data = {}
    if (s.yayasan && !ctx.data.yayasan_sppg) extra.yayasan_sppg = s.yayasan
    if (s.kode && !ctx.data.kode_sppg) extra.kode_sppg = s.kode
    if (s.provinsi_id && !ctx.data.provinsi_id) extra.provinsi_id = s.provinsi_id
    if (s.kabkota_id && !ctx.data.kabkota_id) { extra.kabkota_id = s.kabkota_id; if (!ctx.data.provinsi_id && s.provinsi_id) extra.provinsi_id = s.provinsi_id }
    ctx.set(f.key, s.nama, extra)
    setOpen(false)
  }
  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input id={`kp-${f.key}`} className={`${inputCls} pl-8 ${invalid ? 'border-red-300' : ''}`} value={v} maxLength={200} disabled={ctx.readOnly} placeholder="Cari / ketik nama SPPG" autoComplete="off"
          onFocus={() => setOpen(true)} onBlur={() => { setTimeout(() => setOpen(false), 150); ctx.touch(f.key) }} onChange={(e) => { ctx.set(f.key, e.target.value); setOpen(true) }} />
      </div>
      {open && !ctx.readOnly && (loading || list.length > 0) && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-xs shadow-lg" role="listbox">
          {loading && <li className="flex items-center gap-1.5 px-3 py-2 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Mencari…</li>}
          {list.map((s) => (
            <li key={s.nama}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} className="block w-full px-3 py-2 text-left hover:bg-primary/5">
                <span className="font-semibold text-slate-800">{s.nama}</span>
                <span className="block text-[10px] text-slate-400">{[s.yayasan, s.kode, s.sumber.map((x) => (x === 'keracunan' ? `${s.jumlah}× laporan keracunan` : 'pengawasan gizi')).join(' · ')].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── daftar sekolah ──────────────────────────────────────────────────────────
function Sekolah({ ctx }: { ctx: KpCtx }) {
  const list = rows(ctx.data, 'sekolah')
  const ro = ctx.readOnly
  const put = (next: Data[]) => ctx.set('sekolah', next)
  const upd = (i: number, k: string, val: any) => put(list.map((r, n) => (n === i ? { ...r, [k]: val } : r)))
  const porsi = totalPorsi(ctx.data)
  const siswa = list.reduce((a, r) => a + (cnt(r, 'siswa') ?? 0), 0)
  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>
              <th className="px-2 py-2 text-left font-semibold">Nama sekolah</th><th className="w-24 px-1 py-2 font-semibold">Siswa</th><th className="w-24 px-1 py-2 font-semibold">Porsi MBG</th>
              <th className="px-1 py-2 font-semibold">UKS</th><th className="px-1 py-2 font-semibold">Uji organoleptik</th><th className="px-1 py-2 font-semibold">CTPS</th><th className="w-8" />
            </tr></thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id || i} className="border-t border-slate-100 align-middle">
                  <td className="px-1.5 py-1"><input aria-label={`Nama sekolah ${i + 1}`} className={cell} value={r.nama ?? ''} disabled={ro} maxLength={200} placeholder="mis. SDN 1 Sukamaju" onChange={(e) => upd(i, 'nama', e.target.value)} onBlur={() => ctx.touch('sekolah')} /></td>
                  {(['siswa', 'porsi'] as const).map((k) => <td key={k} className="px-1 py-1"><input aria-label={`${k} ${i + 1}`} inputMode="numeric" className={`${cell} text-center tabular-nums`} value={r[k] ?? ''} disabled={ro} placeholder="0" onChange={(e) => upd(i, k, parseNum(e.target.value))} /></td>)}
                  {(['uks', 'organoleptik', 'ctps'] as const).map((k) => <td key={k} className="px-1 py-1"><Chips size="sm" value={r[k]} options={['Ya', 'Tidak']} disabled={ro} onChange={(v) => upd(i, k, v)} /></td>)}
                  <td className="px-1">{!ro && <button type="button" aria-label={`Hapus sekolah ${i + 1}`} onClick={() => put(list.filter((_, n) => n !== i))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold text-slate-700"><td className="px-2 py-1.5">Total ({list.length} sekolah)</td><td className="text-center tabular-nums">{siswa || '—'}</td><td className="text-center tabular-nums text-primary">{porsi ?? '—'}</td><td colSpan={4} /></tr>
            </tbody>
          </table>
        </div>
      )}
      {!ro && <button type="button" onClick={() => put([...list, { id: rid() }])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" /> Tambah sekolah</button>}
      {ro && !list.length && <p className="text-[11px] text-slate-400">Belum ada sekolah.</p>}
    </div>
  )
}

// ─── gejala: centang + jumlah kasus ──────────────────────────────────────────
function Gejala({ ctx }: { ctx: KpCtx }) {
  const list = rows(ctx.data, 'gejala')
  const ro = ctx.readOnly
  const kasus = cnt(ctx.data, 'jumlah_kasus')
  const [lain, setLain] = useState('')
  const idx = (nm: string) => list.findIndex((r) => String(r.nama || '').toLowerCase() === nm.toLowerCase())
  const toggle = (nm: string) => { const i = idx(nm); ctx.set('gejala', i >= 0 ? list.filter((_, n) => n !== i) : [...list, { nama: nm, jumlah: null }]); ctx.touch('gejala') }
  const setJ = (nm: string, v: number | null) => ctx.set('gejala', list.map((r) => (r.nama === nm ? { ...r, jumlah: v } : r)))
  const extra = list.filter((r) => !GEJALA.includes(r.nama))
  const item = (nm: string, custom = false) => {
    const i = idx(nm)
    const on = i >= 0
    const j = on ? cnt(list[i], 'jumlah') : null
    const over = on && j !== null && kasus !== null && j > kasus
    return (
      <div key={nm} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? (over ? 'border-red-300 bg-red-50/50' : 'border-primary/40 bg-primary/[0.04]') : 'border-slate-200 bg-white'}`}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} disabled={ro} onChange={() => toggle(nm)} />
          <span className="truncate">{nm}{custom && <span className="ml-1 text-[10px] text-slate-400">(lain)</span>}</span>
        </label>
        {on && (
          <span className="flex items-center gap-1">
            <input aria-label={`Jumlah kasus ${nm}`} inputMode="numeric" disabled={ro} value={list[i].jumlah ?? ''} placeholder="jml" onFocus={(e) => e.target.select()} onChange={(e) => setJ(nm, parseNum(e.target.value))} onBlur={() => ctx.touch('gejala')}
              className={`w-14 rounded-md border px-1.5 py-1 text-center text-xs tabular-nums ${list[i].jumlah === null || list[i].jumlah === undefined ? 'border-amber-300' : 'border-slate-200'}`} />
            <span className="w-10 text-right text-[10px] tabular-nums text-slate-400">{j !== null && kasus ? `${Math.round((j / kasus) * 100)}%` : ''}</span>
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{GEJALA.map((g) => item(g))}{extra.map((r) => item(r.nama, true))}</div>
      {!ro && (
        <div className="flex max-w-sm gap-1.5">
          <input className={cell} value={lain} maxLength={100} placeholder="Gejala lain…" onChange={(e) => setLain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && lain.trim()) { e.preventDefault(); if (idx(lain.trim()) < 0) toggle(lain.trim()); setLain('') } }} />
          <button type="button" disabled={!lain.trim()} onClick={() => { if (idx(lain.trim()) < 0) toggle(lain.trim()); setLain('') }} className="rounded-md border border-slate-200 px-2 text-xs font-semibold text-primary disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {list.length > 0 && <p className="text-[11px] text-slate-500">{list.length} gejala dipilih{kasus ? ` · persentase dari ${kasus} kasus` : ''}</p>}
    </div>
  )
}

// ─── 26 SOP: Ada / Dilakukan ─────────────────────────────────────────────────
function Sop({ ctx }: { ctx: KpCtx }) {
  const list = rows(ctx.data, 'sop')
  const ro = ctx.readOnly
  const get = (nm: string) => list.find((r) => r.nama === nm) || { nama: nm }
  const put = (nm: string, k: 'ada' | 'dilakukan', v: string | null) => {
    const cur = { ...get(nm), [k]: v }
    if (k === 'ada' && v === 'Tidak Ada' && cur.dilakukan === 'Dilakukan') cur.dilakukan = null
    const others = list.filter((r) => r.nama !== nm)
    const keep = cur.ada || cur.dilakukan ? [...others, cur] : others
    ctx.set('sop', SOP.map((s) => keep.find((r) => r.nama === s)).filter(Boolean))
  }
  const all = () => ctx.set('sop', SOP.map((s) => ({ nama: s, ada: 'Ada', dilakukan: 'Dilakukan' })))
  const ada = list.filter((r) => r.ada === 'Ada').length
  const lak = list.filter((r) => r.dilakukan === 'Dilakukan').length
  const isi = list.filter((r) => r.ada).length
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{isi}/26 dinilai</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{ada} ada</span>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">{lak} dilakukan</span>
        {!ro && <button type="button" onClick={all} className="ml-auto rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:border-primary/40 hover:text-primary">Tandai semua Ada & Dilakukan</button>}
        {!ro && list.length > 0 && <button type="button" onClick={() => ctx.set('sop', [])} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-500 hover:text-red-600">Kosongkan</button>}
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {SOP.map((s, i) => {
          const r = get(s)
          const odd = r.ada === 'Tidak Ada' && r.dilakukan === 'Dilakukan'
          return (
            <div key={s} className={`flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center ${odd ? 'bg-amber-50/60' : ''}`}>
              <span className="min-w-0 flex-1 text-xs text-slate-700"><span className="mr-1.5 inline-block w-5 text-right font-mono text-[10px] text-slate-400">{i + 1}.</span>{s}</span>
              <Chips size="sm" value={r.ada} options={['Ada', 'Tidak Ada']} disabled={ro} onChange={(v) => put(s, 'ada', v)} />
              <Chips size="sm" value={r.dilakukan} options={['Dilakukan', 'Tidak Dilakukan']} disabled={ro} onChange={(v) => put(s, 'dilakukan', v)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── tabel baris generik (sumber air, jadwal, sampel) ─────────────────────────
type Col = { k: string; l: string; opt?: string; yt?: boolean; num?: boolean; time?: boolean }
function Rows({ f, ctx }: { f: FieldDef; ctx: KpCtx }) {
  const cols: Col[] = f.mbg!.cols
  const list = rows(ctx.data, f.key)
  const ro = ctx.readOnly
  const put = (next: Data[]) => ctx.set(f.key, next)
  const upd = (i: number, k: string, v: any) => put(list.map((r, n) => (n === i ? { ...r, [k]: v } : r)))
  const quick: string[] | null = f.mbg!.quick ? OPT[f.mbg!.quick] : null
  const input = (c: Col, r: Data, i: number) => {
    const label = `${c.l} baris ${i + 1}`
    if (c.opt) return <SearchSelect options={opts(OPT[c.opt])} value={r[c.k] ?? null} disabled={ro} ariaLabel={label} placeholder="- Pilih -" onChange={(x) => upd(i, c.k, x)} onBlur={() => ctx.touch(f.key)} />
    if (c.yt) return <Chips size="sm" value={r[c.k]} options={['Ya', 'Tidak']} disabled={ro} onChange={(v) => upd(i, c.k, v)} />
    if (c.num) return <input aria-label={label} inputMode="numeric" className={`${cell} text-center tabular-nums`} value={r[c.k] ?? ''} disabled={ro} placeholder="0" onChange={(e) => upd(i, c.k, parseNum(e.target.value))} />
    return <input aria-label={label} className={cell} value={r[c.k] ?? ''} disabled={ro} maxLength={200} placeholder={c.time ? 'mis. 05.00–07.00' : ''} onChange={(e) => upd(i, c.k, e.target.value)} onBlur={() => ctx.touch(f.key)} />
  }
  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs" style={{ minWidth: cols.length * 140 }}>
            <thead className="bg-slate-50 text-slate-500"><tr><th className="w-8 px-2 py-2">#</th>{cols.map((c) => <th key={c.k} className={`px-1.5 py-2 text-left font-semibold ${c.num ? 'w-24' : ''}`}>{c.l}</th>)}<th className="w-8" /></tr></thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id || i} className="border-t border-slate-100">
                  <td className="px-2 text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                  {cols.map((c) => <td key={c.k} className="px-1 py-1">{input(c, r, i)}</td>)}
                  <td className="px-1">{!ro && <button type="button" aria-label={`Hapus baris ${i + 1}`} onClick={() => put(list.filter((_, n) => n !== i))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!ro && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => put([...list, { id: rid() }])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" /> {f.mbg!.add || 'Tambah baris'}</button>
          {quick && quick.map((q) => <button key={q} type="button" onClick={() => put([...list, { id: rid(), [cols[0].k]: q }])} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-primary/40 hover:text-primary">+ {q}</button>)}
        </div>
      )}
      {ro && !list.length && <p className="text-[11px] text-slate-400">Belum ada data.</p>}
    </div>
  )
}

function Petugas({ ctx }: { ctx: KpCtx }) {
  const h = hasil(ctx.data)
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PETUGAS.map(([k, l]) => (
          <label key={k} data-field={k} className="text-[11px] font-semibold text-slate-500">{l}
            <input inputMode="numeric" className={`${cell} mt-0.5 text-center tabular-nums`} value={ctx.data[k] ?? ''} disabled={ctx.readOnly} placeholder="0"
              onFocus={(e) => e.target.select()} onChange={(e) => ctx.set(k, parseNum(e.target.value))} />
          </label>
        ))}
        <div className="flex flex-col justify-end rounded-lg bg-primary/[0.05] px-2 py-1.5 text-[11px] font-semibold text-primary">Total petugas<span className="text-lg font-bold tabular-nums">{h.total_petugas ?? '—'}</span></div>
      </div>
    </div>
  )
}

function Saran({ ctx }: { ctx: KpCtx }) {
  const list = saranDiagnosa(ctx.data)
  if (!list.length) return <p className="text-[11px] text-slate-400"><Lightbulb className="mr-1 inline h-3 w-3" />Saran diagnosa banding muncul setelah gejala & masa inkubasi diisi.</p>
  const cur = String(ctx.data.diagnosa_banding || '')
  const add = (nm: string) => ctx.set('diagnosa_banding', cur.includes(nm) ? cur : cur.trim() ? `${cur.trim()}; ${nm}` : nm)
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700"><Lightbulb className="h-3.5 w-3.5" /> Saran — bukan diagnosis, keputusan tetap pada petugas</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((s) => (
          <button key={s.nama} type="button" disabled={ctx.readOnly || cur.includes(s.nama)} onClick={() => add(s.nama)} title={`Dasar: ${s.alasan}`}
            className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-left text-[11px] text-amber-900 hover:border-amber-400 disabled:opacity-50">
            {cur.includes(s.nama) ? <Check className="mr-1 inline h-3 w-3" /> : <Plus className="mr-1 inline h-3 w-3" />}{s.nama}<span className="block text-[10px] text-amber-600">{s.alasan}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function LampiranBox({ ctx, kategori, label }: { ctx: KpCtx; kategori: KpLampiran['kategori']; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<{ name: string; pct: number }[]>([])
  const list = ctx.lampiran.filter((l) => l.kategori === kategori)
  const ro = ctx.lampiranReadOnly
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    const id = ctx.rid || (await ctx.ensureSaved())
    if (!id) { toast.error('Simpan laporan dulu (isi 4 isian wajib) sebelum mengunggah lampiran'); return }
    let cur = [...ctx.lampiran]
    for (const file of Array.from(files)) {
      if (file.size > ctx.limits.max_bytes) { toast.error(`${file.name}: ukuran maksimal ${fmtSize(ctx.limits.max_bytes)}`); continue }
      if (file.type && !ctx.limits.tipe.includes(file.type)) { toast.error(`${file.name}: tipe file tidak didukung`); continue }
      setBusy((b) => [...b, { name: file.name, pct: 0 }])
      try {
        const l = await uploadKpLampiran(id, kategori, file, (pct) => setBusy((b) => b.map((x) => (x.name === file.name ? { ...x, pct } : x))))
        cur = [...cur, l]; ctx.setLampiran(cur)
      } catch (e) { toast.error(`${file.name}: ${e instanceof Error ? e.message : String(e)}`) }
      finally { setBusy((b) => b.filter((x) => x.name !== file.name)) }
    }
    if (ref.current) ref.current.value = ''
  }
  const remove = async (l: KpLampiran) => {
    if (!ctx.rid || !window.confirm(`Hapus lampiran "${l.nama_file}"?`)) return
    try { await kpFetch(`${KP_API}/${ctx.rid}/lampiran/${l.id}`, { method: 'DELETE' }); ctx.setLampiran(ctx.lampiran.filter((x) => x.id !== l.id)) } catch (e) { toast.error(e instanceof Error ? e.message : 'Lampiran gagal dihapus') }
  }
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-3">
      <ul className="space-y-1">
        {list.map((l) => (
          <li key={l.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <a href={lampiranUrl(ctx.rid!, l.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline" title={l.nama_file}>{l.nama_file}</a>
            <span className="text-[10px] text-slate-400">{fmtSize(l.ukuran)}</span>
            <a href={lampiranUrl(ctx.rid!, l.id)} target="_blank" rel="noreferrer" aria-label="Unduh" className="text-slate-400 hover:text-primary"><Download className="h-3.5 w-3.5" /></a>
            {!ro && <button type="button" onClick={() => remove(l)} aria-label={`Hapus ${l.nama_file}`} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>}
          </li>
        ))}
        {busy.map((b) => <li key={b.name} className="flex items-center gap-2 px-2 text-[11px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> {b.name} · {b.pct}%</li>)}
      </ul>
      {!ro && (
        <>
          <input ref={ref} type="file" multiple accept={ctx.limits.tipe.join(',')} className="hidden" aria-label={label} onChange={(e) => pick(e.target.files)} />
          <button type="button" onClick={() => ref.current?.click()} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-primary/40 hover:text-primary">
            <FileUp className="h-3.5 w-3.5" /> Unggah file
          </button>
          <span className="ml-2 text-[10px] text-slate-400">PDF/JPG/PNG/WEBP/Word/Excel, maks. {fmtSize(ctx.limits.max_bytes)}</span>
        </>
      )}
      {ro && !list.length && <p className="text-[11px] text-slate-400">Tidak ada lampiran.</p>}
    </div>
  )
}
