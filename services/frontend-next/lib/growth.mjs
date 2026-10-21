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
  if (info.kind === 'new') return 'New'
  if (info.kind === 'na') return 'n/a'
  const v = info.pct ?? 0
  const sign = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : ''
  return `${sign}${fmt(Math.abs(v))}%`
}

export const GROWTH_NA_TITLE = 'Previous period baseline is too small for a meaningful growth rate'

// PR 154 (cards): plain-English month-over-month caption for the KPI cards.
// opts: { current: 'October', previous: 'September', noun: 'cases', fmt, fmtPct }
// Returns { headline, detail, tone } where tone is 'up' | 'down' | 'neutral'.
export function growthCaption(current, previous, opts = {}) {
  const fmt = opts.fmt ?? ((n) => String(n))
  const fmtPct = opts.fmtPct ?? ((n) => n.toFixed(1))
  const cur = opts.current ?? 'this month'
  const prev = opts.previous ?? 'last month'
  const noun = opts.noun ?? 'items'
  const c = Number(current) || 0
  const p = Number(previous) || 0
  const info = growthInfo(c, p)
  const detail = `${cur} to date: ${fmt(c)} · ${prev}: ${fmt(p)}`
  if (info.kind === 'flat') {
    return { headline: c === 0 ? `No ${noun} in ${cur} or ${prev}` : `Same as ${prev}`, detail, tone: 'neutral' }
  }
  if (info.kind === 'new') {
    return { headline: `First ${noun} this month (none in ${prev})`, detail, tone: 'up' }
  }
  const diff = c - p
  const word = diff >= 0 ? 'Up' : 'Down'
  if (info.kind === 'na') {
    return { headline: `${word} ${fmt(Math.abs(diff))} vs ${prev} (too few in ${prev} for a %)`, detail, tone: diff >= 0 ? 'up' : 'down' }
  }
  if (diff === 0) return { headline: `Same as ${prev}`, detail, tone: 'neutral' }
  return { headline: `${word} ${fmt(Math.abs(diff))} (${diff >= 0 ? '+' : '−'}${fmtPct(Math.abs(info.pct))}%) vs ${prev}`, detail, tone: diff >= 0 ? 'up' : 'down' }
}

export const GROWTH_FOOTNOTE = 'Month comparison: this month so far vs the whole previous month, by detection date. % change = (this month − last month) ÷ last month; no % is shown when last month is empty or very small.'
