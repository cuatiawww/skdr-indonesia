'use client'
// PR 030: reusable searchable select (combobox) — dipakai untuk SEMUA pilihan di Form EBS/IBS.
// * ketik untuk mencari (tanpa beda huruf besar/kecil & aksen, semua kata harus cocok; label atau hint)
// * keyboard: ↑/↓, Home/End, PageUp/PageDown, Enter memilih, Esc menutup, Tab keluar; huruf apa pun membuka + mencari
// * daftar besar (514 kab/kota, ribuan unit): hanya 150 opsi dirender, sisanya "ketik untuk mempersempit"
// * "Terakhir dipakai" (localStorage, per recentKey), state kosong/memuat, tombol hapus pilihan, mode multi (chip)
// * mobile (< sm): panel tampil sebagai bottom sheet
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
  badge?: string
}

type Single = { multiple?: false; value: string | null | undefined; onChange: (value: string | null, opt: SelectOption | null) => void }
type Multi = { multiple: true; value: string[] | null | undefined; onChange: (value: string[], opt: SelectOption | null) => void }

export type SearchSelectProps = (Single | Multi) & {
  options: SelectOption[]
  id?: string
  placeholder?: string
  disabled?: boolean
  /** shown instead of the placeholder while disabled (e.g. "Pilih Provinsi dulu") */
  disabledHint?: string
  loading?: boolean
  invalid?: boolean
  ariaLabel?: string
  ariaDescribedBy?: string
  /** remember the last picked values under this key */
  recentKey?: string
  emptyText?: string
  clearable?: boolean
  onOpen?: () => void
  onBlur?: () => void
  footer?: ReactNode
  testId?: string
}

const MAX_RENDER = 150
export const normText = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export function filterOptions(options: SelectOption[], q: string): SelectOption[] {
  const tokens = normText(q).split(' ').filter(Boolean)
  if (!tokens.length) return options
  const scored: { o: SelectOption; s: number; i: number }[] = []
  options.forEach((o, i) => {
    const l = normText(o.label)
    const h = o.hint ? normText(o.hint) : ''
    if (!tokens.every((t) => l.includes(t) || h.includes(t))) return
    const s = l.startsWith(tokens[0]) ? 0 : l.split(' ').some((w) => w.startsWith(tokens[0])) ? 1 : 2
    scored.push({ o, s, i })
  })
  return scored.sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.o)
}

function readRecent(key?: string): string[] {
  if (!key || typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(`skdr-ss-recent:${key}`) || '[]') } catch { return [] }
}
function pushRecent(key: string | undefined, v: string) {
  if (!key || !v) return
  try { localStorage.setItem(`skdr-ss-recent:${key}`, JSON.stringify([v, ...readRecent(key).filter((x) => x !== v)].slice(0, 5))) } catch {}
}

export default function SearchSelect(props: SearchSelectProps) {
  const { options, placeholder = '- Pilih -', disabled, disabledHint, loading, invalid, ariaLabel, recentKey, emptyText = 'Tidak ada pilihan yang cocok', clearable = true } = props
  const uid = useId()
  const id = props.id || `ss-${uid}`
  const listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [mobile, setMobile] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected: string[] = props.multiple ? (props.value || []) : props.value != null && props.value !== '' ? [String(props.value)] : []
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
  const recent = useMemo(() => (open && !q ? readRecent(recentKey).map((v) => byValue.get(v)).filter((o): o is SelectOption => !!o && !o.disabled) : []), [open, q, recentKey, byValue])
  const filtered = useMemo(() => filterOptions(options, q), [options, q])
  const list = useMemo(() => {
    const recentSet = new Set(recent.map((r) => r.value))
    return [...recent, ...filtered.filter((o) => !recentSet.has(o.value))].slice(0, MAX_RENDER)
  }, [recent, filtered])
  const hidden = filtered.length + recent.length - list.length

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setMobile(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (wrap.current?.contains(t) || panel.current?.contains(t)) return
      close(false)
    }
    document.addEventListener('mousedown', h); document.addEventListener('touchstart', h)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h) }
  }) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const openPanel = (initial = '') => {
    if (disabled) return
    setQ(initial); setOpen(true); props.onOpen?.()
    const cur = selected[0] ? list.findIndex((o) => o.value === selected[0]) : -1
    setActive(cur >= 0 && !initial ? cur : 0)
    window.setTimeout(() => input.current?.focus(), 10)
  }
  function close(refocus = true) {
    setOpen(false); setQ('')
    if (refocus) trigger.current?.focus()
    props.onBlur?.()
  }
  const pick = (o: SelectOption) => {
    if (o.disabled) return
    pushRecent(recentKey, o.value)
    if (props.multiple) {
      const cur = props.value || []
      props.onChange(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value], o)
      setQ(''); input.current?.focus()
    } else {
      ;(props as Single).onChange(o.value, o)
      close()
    }
  }
  const clear = () => {
    if (props.multiple) props.onChange([], null)
    else (props as Single).onChange(null, null)
    props.onBlur?.()
  }
  const move = (delta: number) => {
    if (!list.length) return
    let i = active
    for (let n = 0; n < list.length; n++) {
      i = Math.max(0, Math.min(list.length - 1, i + delta))
      if (!list[i].disabled) break
      if (i === 0 || i === list.length - 1) break
    }
    setActive(i)
  }
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break
      case 'ArrowUp': e.preventDefault(); move(-1); break
      case 'PageDown': e.preventDefault(); move(8); break
      case 'PageUp': e.preventDefault(); move(-8); break
      case 'Home': if (!q) { e.preventDefault(); setActive(0) } break
      case 'End': if (!q) { e.preventDefault(); setActive(list.length - 1) } break
      case 'Enter': e.preventDefault(); if (list[active]) pick(list[active]); break
      case 'Escape': e.preventDefault(); close(); break
      case 'Tab': close(false); break
      case 'Backspace': if (!q && props.multiple && selected.length) props.onChange(selected.slice(0, -1), null); break
    }
  }
  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'F4'].includes(e.key) || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); openPanel(); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && clearable && selected.length) { e.preventDefault(); clear(); return }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); openPanel(e.key) }
  }

  const label = (v: string) => byValue.get(v)?.label ?? v
  const shown = selected.length
    ? props.multiple
      ? <span className="flex flex-wrap gap-1">{selected.map((v) => (
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            <span className="truncate">{label(v)}</span>
            {!disabled && <span role="button" tabIndex={-1} aria-label={`Hapus ${label(v)}`} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); props.onChange(selected.filter((x) => x !== v), null) }}
              className="rounded hover:bg-primary/20"><X className="h-3 w-3" /></span>}
          </span>
        ))}</span>
      : <span className="truncate text-slate-800">{label(selected[0])}</span>
    : <span className="truncate text-slate-400">{disabled && disabledHint ? disabledHint : placeholder}</span>

  const panelBody = (
    <div ref={panel} id={`${id}-panel`} data-testid={props.testId ? `${props.testId}-panel` : undefined}
      className={mobile
        ? 'fixed inset-x-0 bottom-0 z-[90] flex max-h-[75vh] flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl'
        : 'absolute left-0 top-full z-[60] mt-1 flex max-h-80 w-full min-w-[16rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10'}>
      {mobile && <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><span className="text-sm font-bold text-slate-800">{ariaLabel || 'Pilih'}</span>
        <button type="button" onClick={() => close()} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>}
      <div className="relative border-b border-slate-100 p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} placeholder="Ketik untuk mencari…"
          role="combobox" aria-expanded aria-controls={listId} aria-autocomplete="list" aria-activedescendant={list[active] ? `${id}-opt-${active}` : undefined}
          aria-label={`Cari ${ariaLabel || ''}`.trim()} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-2 text-sm text-slate-800 focus:border-primary focus:bg-white focus:outline-none" />
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-multiselectable={props.multiple || undefined} aria-label={ariaLabel} className="flex-1 overflow-y-auto overscroll-contain py-1">
        {loading && <li className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat pilihan…</li>}
        {!loading && list.length === 0 && <li className="px-3 py-3 text-xs text-slate-400">{options.length ? emptyText : 'Belum ada pilihan'}</li>}
        {list.map((o, i) => {
          const sel = selected.includes(o.value)
          const isRecent = i < recent.length
          return (
            <li key={`${isRecent ? 'r' : 'o'}-${o.value}`} id={`${id}-opt-${i}`} data-idx={i} role="option" aria-selected={sel} aria-disabled={o.disabled || undefined}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(o) }}
              className={`mx-1 flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm ${o.disabled ? 'cursor-not-allowed opacity-50' : ''} ${i === active ? 'bg-primary/10' : ''} ${i === recent.length && recent.length ? 'mt-1 border-t border-slate-100 pt-2' : ''}`}>
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ${sel ? 'text-primary' : 'text-transparent'}`}><Check className="h-4 w-4" strokeWidth={3} /></span>
              <span className="min-w-0 flex-1">
                <span className={`block ${sel ? 'font-semibold text-primary' : 'text-slate-800'}`}>{o.label}</span>
                {(o.hint || isRecent) && <span className="block text-[11px] leading-tight text-slate-400">{isRecent ? 'Terakhir dipakai' : ''}{isRecent && o.hint ? ' · ' : ''}{o.hint}</span>}
              </span>
              {o.badge && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{o.badge}</span>}
            </li>
          )
        })}
        {hidden > 0 && <li className="px-3 py-2 text-[11px] text-slate-400">Menampilkan {list.length} dari {(filtered.length).toLocaleString('id-ID')} pilihan — ketik untuk mempersempit.</li>}
      </ul>
      {props.footer && <div className="border-t border-slate-100 p-2">{props.footer}</div>}
    </div>
  )

  return (
    <div ref={wrap} className="relative" data-testid={props.testId}>
      <button ref={trigger} id={id} type="button" disabled={disabled} onClick={() => (open ? close() : openPanel())} onKeyDown={onTriggerKey}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        aria-invalid={invalid || undefined} aria-describedby={props.ariaDescribedBy}
        className={`flex min-h-[40px] w-full items-center gap-2 rounded-xl border bg-white px-3 py-2 text-left text-sm shadow-2xs transition focus:outline-none focus:ring-2 ${invalid ? 'border-red-400 ring-red-100 focus:ring-red-100' : 'border-slate-200 focus:border-primary focus:ring-blue-100'} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}>
        <span className="min-w-0 flex-1">{shown}</span>
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
        {clearable && !disabled && selected.length > 0 && (
          <span role="button" tabIndex={-1} aria-label="Hapus pilihan" title="Hapus pilihan" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); clear() }}
            className="shrink-0 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-3.5 w-3.5" /></span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (mobile
        ? createPortal(<><div className="fixed inset-0 z-[85] bg-slate-900/30" aria-hidden onMouseDown={() => close(false)} />{panelBody}</>, document.body)
        : panelBody)}
    </div>
  )
}
