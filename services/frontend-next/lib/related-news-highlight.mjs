/**
 * PR 134: Disease Detail 'Related news' highlight for the clicked map point.
 * Generic matching, strongest key first:
 *   1. event id (detail.event_id), raw report id (detail.raw_report_id) or article URL;
 *   2. only when no id/URL matches: location name + date (same day as the spread-flow date).
 */

const norm = (v) => String(v || '').trim().toLowerCase()
const day = (v) => (v ? String(v).slice(0, 10) : '')

/** Same date the spread flow orders by (DiseaseDetailPanel.flowDate). */
export function pointDate(loc) {
  return day(loc?.sort_date || loc?.case_date || loc?.latest_date || loc?.published_date || '')
}

export function normalizeNewsUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return `${url.hostname.replace(/^www\./i, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return value.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
  }
}

/** Keys a map row contributes to the related-news articles built from it. */
export function rowMatchKeys(loc) {
  const name = norm(loc?.location_name)
  const dates = [pointDate(loc), day(loc?.published_date), day(loc?.detail?.published_at)].filter(Boolean)
  return {
    eventIds: [loc?.detail?.event_id].map(norm).filter(Boolean),
    reportIds: [loc?.detail?.raw_report_id].map(norm).filter(Boolean),
    placeDates: name ? [...new Set(dates)].map((d) => `${name}|${d}`) : [],
  }
}

function pointUrls(loc) {
  return [loc?.detail?.url, ...(loc?.sources || []).map((s) => s?.url)].map(normalizeNewsUrl).filter(Boolean)
}

/**
 * Indexes of the articles that belong to the clicked point. Each article carries
 * { url, eventIds, reportIds, placeDates } (see buildDiseaseDetail). Empty when nothing matches.
 */
export function matchRelatedNews(articles, loc) {
  if (!loc || !Array.isArray(articles) || articles.length === 0) return []
  const eventId = norm(loc?.detail?.event_id)
  const reportId = norm(loc?.detail?.raw_report_id)
  const urls = new Set(pointUrls(loc))
  const byId = []
  articles.forEach((a, i) => {
    if ((eventId && (a.eventIds || []).includes(eventId))
      || (reportId && (a.reportIds || []).includes(reportId))
      || (urls.size && urls.has(normalizeNewsUrl(a.url)))) byId.push(i)
  })
  if (byId.length) return byId
  const name = norm(loc?.location_name)
  const date = pointDate(loc)
  if (!name || !date) return []
  const key = `${name}|${date}`
  const byPlace = []
  articles.forEach((a, i) => { if ((a.placeDates || []).includes(key)) byPlace.push(i) })
  return byPlace
}
