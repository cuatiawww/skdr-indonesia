// PR 006: client mirror of the PE form engine (services/backend-rust/src/pe_engine.rs) for inline validation.
// The server result (errors/warnings/classification saved with the draft) is authoritative.
export type Data = Record<string, any>
export interface Cond { [k: string]: any }
export interface PeField {
  key: string; label: string; type: string; row?: number; required?: boolean; requiredIf?: Cond; visible?: Cond
  options?: string[]; optionsIf?: { when: Cond; options: string[] }[]; other?: { value: string; key: string; label: string }
  exclusive?: string; minSelect?: number; min?: number; max?: number; decimals?: number; format?: string; minLen?: number; maxLen?: number
  rules?: { op: '<=' | '>='; ref: string }[]; sumLe?: { fields: string[]; ref: string }; warn?: { when: Cond; msg: string }[]
  hint?: string; depends?: string; derive?: any; columns?: PeField[]; minRows?: number; col?: string
  maxRowsRef?: { ref: string; minus?: number }
}
export interface PeSection { id: string; title: string; fields: PeField[]; visible?: Cond }
export interface PeStep { id: string; title: string; sections: PeSection[] }
export interface PeSchema {
  form_key: string; disease_code: string; version: number; title: string; steps: PeStep[]; cluster_fields?: PeField[]
  classification?: { rules: { code: string; label: string; basis: string }[]; fallback?: { code: string; label: string } }
  finish_message?: string
}
export interface Issue { key: string; step: string; label: string; msg: string }

export const isFilled = (v: any) => !(v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0))
const txt = (v: any) => (v === undefined || v === null ? '' : String(v).trim())
const get = (root: Data, row: Data | null, k: string) => (row && k in row ? row[k] : root[k])
const arrHas = (v: any, x: string) => Array.isArray(v) && v.some((e) => txt(e) === x)

export function cond(c: Cond | undefined, root: Data, row: Data | null = null): boolean {
  if (!c) return true
  if (c.all) return c.all.every((x: Cond) => cond(x, root, row))
  if (c.rows) return Array.isArray(root[c.rows]) && root[c.rows].some((r: Data) => cond(c.any, root, r))
  if (c.any) return c.any.some((x: Cond) => cond(x, root, row))
  if (c.not) return !cond(c.not, root, row)
  if (c.count) return c.count.filter((x: Cond) => cond(x, root, row)).length >= (c.gte ?? 1)
  if (!c.f) return true
  const v = get(root, row, c.f)
  if ('eq' in c) return v !== undefined && v !== null && txt(v) === txt(c.eq)
  if ('ne' in c) return txt(v) !== txt(c.ne)
  if (c.in) return v !== undefined && v !== null && c.in.some((e: any) => txt(e) === txt(v))
  if ('has' in c) return arrHas(v, txt(c.has))
  if (c.hasAny) return c.hasAny.some((e: any) => arrHas(v, txt(e)))
  if (c.filled) return isFilled(v)
  if (c.daysBeforeGt) { const a = date(v), b = date(get(root, row, c.daysBeforeGt.ref)); return !!(a && b) && (Date.parse(b) - Date.parse(a)) / 86400000 > c.daysBeforeGt.days }
  return true
}

export const optionsFor = (f: PeField, root: Data, row: Data | null) => {
  for (const o of f.optionsIf || []) if (cond(o.when, root, row)) return o.options
  return f.options || []
}

const num = (v: any): number | null => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v.trim().replace(',', '.')); return Number.isFinite(n) ? n : null }
  return null
}
const date = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null)

export function labelsOf(schema: PeSchema) {
  const m: Record<string, string> = {}
  const walk = (fs: PeField[]) => fs.forEach((f) => { if (!(f.key in m)) m[f.key] = f.label; if (f.columns) walk(f.columns) })
  schema.steps.forEach((s) => s.sections.forEach((se) => walk(se.fields)))
  walk(schema.cluster_fields || [])
  return m
}

export function checkField(f: PeField, root: Data, row: Data | null, step: string, prefix: string, today: string, labels: Record<string, string>, out: Issue[]) {
  if (f.visible && !cond(f.visible, root, row)) return
  const path = `${prefix}${f.key}`
  const push = (msg: string) => out.push({ key: path, step, label: f.label, msg })
  const v = get(root, row, f.key)
  const required = !!f.required || (f.requiredIf ? cond(f.requiredIf, root, row) : false)
  if (f.type === 'info' || f.type === 'auto') return
  if (f.type === 'cluster_monitoring') { if (required && !isFilled(root.cluster_id)) push('Tautkan klaster KLB/wabah di bagian A agar pemantauan KLB/bencana (N1–N9) dapat diisi pada klaster'); return }
  if (!isFilled(v)) { if (required) push(`${f.label} wajib diisi`); return }
  const refLabel = (r: string) => (r === 'today' ? 'hari ini' : labels[r] || r)
  const other = (vals: string[]) => { if (f.other && vals.includes(f.other.value) && !isFilled(get(root, row, f.other.key))) push(`${f.label}: ${f.other.label} wajib diisi`) }
  switch (f.type) {
    case 'select': { const o = optionsFor(f, root, row); if (o.length && !o.includes(txt(v))) push(`Pilihan ${f.label} tidak valid`); other([txt(v)]); break }
    case 'multiselect': {
      const o = optionsFor(f, root, row); const vals: string[] = (v as any[]).map(txt)
      if (vals.some((x) => o.length && !o.includes(x))) push(`Pilihan ${f.label} tidak valid`)
      if (f.minSelect && vals.length < f.minSelect) push(`${f.label}: pilih minimal ${f.minSelect}`)
      if (f.exclusive && vals.includes(f.exclusive) && vals.length > 1) push(`"${f.exclusive}" tidak boleh dipilih bersama pilihan lain`)
      other(vals); break
    }
    case 'number': {
      const n = num(v); if (n === null) { push(`${f.label} harus berupa angka`); break }
      if (f.decimals === 0 && !Number.isInteger(n)) push(`${f.label} harus bilangan bulat`)
      else if (f.decimals && Math.abs(n * 10 ** f.decimals - Math.round(n * 10 ** f.decimals)) > 1e-6) push(`${f.label} maksimal ${f.decimals} desimal`)
      if (f.min !== undefined && n < f.min) push(`${f.label} minimal ${f.min}`)
      if (f.max !== undefined && n > f.max) push(`${f.label} maksimal ${f.max}`)
      for (const r of f.rules || []) { const o = num(get(root, row, r.ref)); if (o !== null && (r.op === '<=' ? n > o : n < o)) push(`${f.label} tidak boleh ${r.op === '<=' ? 'lebih dari' : 'kurang dari'} ${refLabel(r.ref)}`) }
      if (f.sumLe) { const tot = f.sumLe.fields.reduce((s, k) => s + (num(get(root, row, k)) ?? 0), 0); const o = num(get(root, row, f.sumLe.ref)); if (o !== null && tot > o) push(`${f.sumLe.fields.map((x) => x.toUpperCase()).join(' + ')} tidak boleh lebih dari ${f.sumLe.ref.toUpperCase()}`) }
      break
    }
    case 'date': {
      const d = date(v); if (!d) { push(`${f.label}: format tanggal tidak valid`); break }
      for (const r of f.rules || []) { const o = r.ref === 'today' ? today : date(get(root, row, r.ref)); if (o && (r.op === '<=' ? d > o : d < o)) push(`${f.label} tidak boleh ${r.op === '<=' ? 'setelah' : 'sebelum'} ${refLabel(r.ref)}`) }
      break
    }
    case 'table': {
      const rows: Data[] = Array.isArray(v) ? v : []
      if (required && f.minRows && rows.length < f.minRows) push(`${f.label}: isi minimal ${f.minRows} baris`)
      if (f.maxRowsRef) { const n = num(get(root, row, f.maxRowsRef.ref)); const m = n === null ? null : n - (f.maxRowsRef.minus ?? 0); if (m !== null && rows.length > m) push(`${f.label}: maksimal ${Math.max(m, 0)} baris (${refLabel(f.maxRowsRef.ref)} − ${f.maxRowsRef.minus ?? 0})`) }
      rows.forEach((r, i) => (f.columns || []).forEach((c) => checkField(c, root, r, step, `${path}.${i}.`, today, labels, out)))
      break
    }
    case 'province': case 'kabkota': case 'cluster': case 'ebs': break
    default: {
      const t = txt(v)
      if (f.format === 'digits') {
        const mn = f.minLen ?? 0, mx = f.maxLen ?? 99
        if (!/^\d+$/.test(t) || t.length < mn || t.length > mx) push(mn === mx ? `${f.label} harus ${mn} digit angka` : `${f.label} harus angka ${mn}–${mx} digit`)
      }
    }
  }
}

export function validateAll(schema: PeSchema, data: Data, today: string): Issue[] {
  const labels = labelsOf(schema); const out: Issue[] = []
  schema.steps.forEach((st) => st.sections.forEach((se) => { if (!se.visible || cond(se.visible, data)) se.fields.forEach((f) => checkField(f, data, null, st.id, '', today, labels, out)) }))
  return out
}

export function warningsAll(schema: PeSchema, data: Data): Issue[] {
  const out: Issue[] = []
  schema.steps.forEach((st) => st.sections.forEach((se) => se.fields.forEach((f) => {
    if (f.visible && !cond(f.visible, data)) return
    for (const w of f.warn || []) if (cond(w.when, data)) out.push({ key: f.key, step: st.id, label: f.label, msg: w.msg })
  })))
  return out
}

/** Clears values of fields that are hidden (so stale answers are not kept), recursively for table rows. */
export function pruneHidden(schema: PeSchema, data: Data): Data {
  const d: Data = { ...data }
  const prune = (fs: PeField[], obj: Data, row: Data | null) => fs.forEach((f) => {
    const target = row || obj
    if (f.visible && !cond(f.visible, d, row)) { delete target[f.key]; if (f.other) delete target[f.other.key]; return }
    if (f.other) { const v = target[f.key]; const has = Array.isArray(v) ? v.includes(f.other.value) : v === f.other.value; if (!has) delete target[f.other.key] }
    if (f.type === 'table' && Array.isArray(target[f.key])) target[f.key] = target[f.key].map((r: Data) => { const c = { ...r }; prune(f.columns || [], d, c); return c })
  })
  schema.steps.forEach((st) => st.sections.forEach((se) => prune(se.fields, d, null)))
  return d
}
