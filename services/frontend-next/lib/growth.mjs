import { tr } from "@/lib/i18n/LanguageContext";
// PR 154: period-over-period growth with a near-zero-baseline guard.
// previous <= 0 and current > 0 -> "new"; a change beyond MAX_MEANINGFUL_GROWTH_PCT
// means the baseline is too small for a rate -> "n/a" (the raw counts are still shown).
export const MAX_MEANINGFUL_GROWTH_PCT = 1000

export function growthInfo(current, previous, maxPct = MAX_MEANINGFUL_GROWTH_PCT) {
  const c = Number(current) || 0
  const p = Number(previous) || 0
  if (p <= 0) return c > 0 ? { kind: 'new', pct: null, up: true } : { kind: 'flat', pct: 0, up: true }
  const pct = ((c - p) / p) * 100
  if (Math.abs(pct) > maxPct) return { kind: 'na', pct: null, up: pct >= 0 }
  return { kind: 'pct', pct, up: pct >= 0 }
}

/** "+12.3%", "−4.0%", "New" or "n/a". */
export function growthText(info, fmt = (n) => n.toFixed(1), signed = true) {
  if (info.kind === 'new') return tr('skdr.growth.new')
  if (info.kind === 'na') return tr('skdr.growth.na')
  const v = info.pct ?? 0
  const sign = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : ''
  return `${sign}${fmt(Math.abs(v))}%`
}

export const GROWTH_NA_TITLE = tr('skdr.growth.naTitle')

// PR 154 (cards): plain-English month-over-month caption for the KPI cards.
// opts: { current: 'October', previous: 'September', noun: 'cases', fmt, fmtPct }
// Returns { headline, detail, tone } where tone is 'up' | 'down' | 'neutral'.
export function growthCaption(current, previous, opts = {}) {
  const fmt = opts.fmt ?? ((n) => String(n))
  const fmtPct = opts.fmtPct ?? ((n) => n.toFixed(1))
  const cur = opts.current ?? tr('skdr.growth.thisMonth')
  const prev = opts.previous ?? tr('skdr.growth.lastMonth')
  const noun = opts.noun ?? tr('skdr.growth.items')
  const c = Number(current) || 0
  const p = Number(previous) || 0
  const info = growthInfo(c, p)
  const detail = tr('skdr.growth.detail', { cur, c: fmt(c), prev, p: fmt(p) })
  if (info.kind === 'flat') {
    return { headline: c === 0 ? tr('skdr.growth.none', { noun, cur, prev }) : tr('skdr.growth.same', { prev }), detail, tone: 'neutral' }
  }
  if (info.kind === 'new') {
    return { headline: tr('skdr.growth.first', { noun, prev }), detail, tone: 'up' }
  }
  const diff = c - p
  const word = diff >= 0 ? tr('skdr.growth.up') : tr('skdr.growth.down')
  if (info.kind === 'na') {
    return { headline: tr('skdr.growth.tooFew', { word, n: fmt(Math.abs(diff)), prev }), detail, tone: diff >= 0 ? 'up' : 'down' }
  }
  if (diff === 0) return { headline: tr('skdr.growth.same', { prev }), detail, tone: 'neutral' }
  return { headline: tr('skdr.growth.changed', { word, n: fmt(Math.abs(diff)), pct: `${diff >= 0 ? '+' : '−'}${fmtPct(Math.abs(info.pct))}%`, prev }), detail, tone: diff >= 0 ? 'up' : 'down' }
}

export const GROWTH_FOOTNOTE = tr('skdr.growth.footnote')
