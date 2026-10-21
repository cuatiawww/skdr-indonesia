/** Newest surveillance signals, one card per article and case count. */

function articleUrl(alert) {
  const raw = alert?.detail?.url || alert?.sources?.[0]?.url || ''
  return normalizeArticleUrl(raw)
}

export function normalizeArticleUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
    const url = new URL(withScheme)
    const host = url.hostname.replace(/^www\./i, '').toLowerCase()
    const path = url.pathname.replace(/\/+$/, '')
    return `${host}${path}`
  } catch {
    return value.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
  }
}

function storyKey(alert) {
  const disease = String(alert?.disease || '').trim().toLowerCase()
  const cases = Number(alert?.cases) || 0
  const country = String(alert?.country || '').trim().toLowerCase()
  const location = String(alert?.location_name || '').trim().toLowerCase()
  const date = String(alert?.case_date || alert?.latest_date || '').slice(0, 10)
  return `${disease}|${cases}|${country}|${location}|${date}`
}

export function takeUniqueSignals(alerts, limit = 20) {
  const seenUrl = new Set()
  const seenStory = new Set()
  const kept = []
  for (const alert of alerts || []) {
    const url = articleUrl(alert)
    const cases = Number(alert?.cases) || 0
    const story = storyKey(alert)
    if (url && seenUrl.has(url)) continue
    if (cases > 0 && seenStory.has(story)) continue
    if (url) seenUrl.add(url)
    if (cases > 0) seenStory.add(story)
    kept.push(alert)
    if (kept.length >= limit) break
  }
  return kept
}

/**
 * PR 133: true when the signal has a reported, valid case date. A missing case date or a
 * published-date fallback (case_tab_undated = 'fallback_labeled') would show 'Not reported'.
 */
export function hasReportedCaseDate(alert) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(alert?.case_date || ''))) return false
  return alert?.case_date_precision !== 'published_fallback'
}

/**
 * Date a signal is ordered by. The Case date (Detected time) tab never falls back to the publication
 * or crawl date (PR 87); PR 133 reverts the PR 132 fallback, so an undated signal is not in that tab.
 */
export function signalDate(alert, order) {
  if (order === 'published') return alert?.published_date || alert?.detail?.published_at || null
  if (order === 'crawled') return alert?.crawled_at || alert?.detail?.crawled_at || null
  if (!hasReportedCaseDate(alert)) return null
  return alert?.sort_date || alert?.case_date || null
}

/** A case or death count, or "-" when the source did not report it (stored NULL). */
export function countText(alert, field, format) {
  if (alert?.[`${field}_reported`] === false) return '-'
  const value = alert?.[field]
  if (value === null || value === undefined) return '-'
  return format ? format(value) : String(value)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isoDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  return m ? { y: +m[1], m: +m[2], d: +m[3], iso: `${m[1]}-${m[2]}-${m[3]}` } : null
}

/** MMWR epi week (Sunday start; week 1 holds Jan 4), same rule as lib/epi-week.ts. */
export function mmwrWeek(iso) {
  const p = isoDay(iso)
  if (!p) return null
  const day = Date.UTC(p.y, p.m - 1, p.d)
  const weekOneStart = (y) => {
    const jan4 = Date.UTC(y, 0, 4)
    return jan4 - new Date(jan4).getUTCDay() * 86400000
  }
  let year = p.y
  if (day < weekOneStart(year)) year -= 1
  else if (day >= weekOneStart(year + 1)) year += 1
  return { week: Math.floor((day - weekOneStart(year)) / (7 * 86400000)) + 1, year }
}

/**
 * PR 118: the normalized case date, never the raw source phrase.
 * Day / relative / range → YYYY-MM-DD; month → "Oct 2026"; epi week → "Wk 41 2026"; year → "2026".
 * (Before, `case_date_label` = raw `event_date_text` was shown, e.g. "tuần qua" or "2026-10".)
 */
export function caseDateText(alert) {
  const day = isoDay(alert?.case_date)
  if (!day) return 'Not reported'
  if (alert.case_date_precision === 'published_fallback') return `Not reported (published ${day.iso})`
  const precision = alert.case_date_precision
  if (precision === 'month') return `${MONTHS[day.m - 1]} ${day.y}`
  if (precision === 'year') return String(day.y)
  if (precision === 'epi_week') {
    const wk = mmwrWeek(alert.sort_date || alert.case_date)
    if (wk) return `Wk ${wk.week} ${wk.year}`
  }
  return day.iso
}

/** Raw source wording of the case date, for a tooltip only. */
export function caseDateTitle(alert) {
  const raw = String(alert?.case_date_label || '').trim()
  return raw ? `Source text: ${raw}` : undefined
}
