'use client';

// PR 018: multi-select checkbox dropdown used by the global filter bar (Penyakit, Provinsi, Kab/Kota).
// Empty selection = "semua" (no narrowing). Search box, "Pilih semua" / "Hapus pilihan", optional groups, keyboard:
// Esc closes, the trigger is a button with aria-expanded, options are native checkboxes (Tab / Space).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export type MsOption = { value: string; label: string; group?: string };

type Props = {
  id: string;
  options: MsOption[];
  value: string[];
  onChange: (v: string[]) => void;
  /** label when nothing is narrowed, e.g. "Semua penyakit" */
  allLabel: string;
  /** count label, e.g. (n) => `${n} penyakit dipilih` */
  countLabel: (n: number) => string;
  searchPlaceholder: string;
  selectAllLabel: string;
  clearLabel: string;
  emptyLabel: string;
  disabled?: boolean;
  disabledLabel?: string;
};

export default function MultiSelect({ id, options, value, onChange, allLabel, countLabel, searchPlaceholder, selectAllLabel, clearLabel, emptyLabel, disabled, disabledLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const sel = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s) || (o.group || '').toLowerCase().includes(s)) : options;
  }, [options, q]);
  const groups = useMemo(() => {
    const m = new Map<string, MsOption[]>();
    for (const o of shown) { const g = o.group || ''; if (!m.has(g)) m.set(g, []); m.get(g)!.push(o); }
    return Array.from(m.entries());
  }, [shown]);

  const toggle = (v: string) => onChange(sel.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const all = options.length > 0 && value.length === options.length;
  // every option checked = no narrowing: stored as empty so new registry entries are included automatically
  const commit = (v: string[]) => onChange(v.length === options.length ? [] : v);
  const label = disabled ? (disabledLabel || allLabel)
    : value.length === 0 || all ? allLabel
    : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? countLabel(1))
    : countLabel(value.length);

  return (
    <div ref={root} className="relative h-10 min-w-0" data-testid={`ms-${id}`}>
      <button type="button" id={id} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} title={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full w-full items-center gap-2 rounded-lg border border-line bg-card px-3 text-left text-xs font-bold text-slate-800 outline-none transition hover:border-brand-300 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-400">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {value.length > 0 && !all && !disabled ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-[16rem] skdr-card p-2 shadow-xs" role="listbox" aria-multiselectable="true">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
              className="h-8 w-full rounded-lg border border-slate-200 pl-7 pr-7 text-xs outline-none focus:border-primary" />
            {q ? <button type="button" aria-label={clearLabel} onClick={() => setQ('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button> : null}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-[11px] font-bold">
            <button type="button" className="text-primary hover:underline" onClick={() => commit(Array.from(new Set([...value, ...shown.map((o) => o.value)])))}>{selectAllLabel}</button>
            <button type="button" className="text-slate-500 hover:text-slate-800 hover:underline" onClick={() => onChange(q ? value.filter((v) => !shown.some((o) => o.value === v)) : [])}>{clearLabel}</button>
          </div>
          <div className="mt-1 max-h-72 overflow-y-auto pr-1">
            {groups.length === 0 ? <div className="px-2 py-3 text-xs text-slate-500">{emptyLabel}</div> : groups.map(([g, opts]) => (
              <div key={g || '_'}>
                {g ? <div className="sticky top-0 bg-white px-2 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{g}</div> : null}
                {opts.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-800 hover:bg-brand-50">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[#00796B]" checked={sel.has(o.value)} onChange={() => toggle(o.value)} />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
