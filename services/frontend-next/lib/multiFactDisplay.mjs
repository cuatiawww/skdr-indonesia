/** Collapse N structured facts into the one-row-per-URL `; ` display contract. */

import { foldAdminPlace, isAseanCountryName, resolveAseanCountry } from './aseanAdminPlaces.mjs'

export const DISPLAY_SEPARATOR = '; '

const SHORT_DISEASE = {
  'respiratory syncytial virus infection': 'RSV',
  'respiratory syncytial virus': 'RSV',
  rsv: 'RSV',
  'nipah virus disease': 'Nipah',
}

export function shortDiseaseLabel(name) {
  const raw = String(name || '').trim()
  if (!raw || raw.toUpperCase() === 'UNKNOWN') return ''
  return SHORT_DISEASE[raw.toLowerCase()] || raw
}

export function joinUniqueLabels(labels) {
  const seen = new Set()
  const ordered = []
  for (const raw of labels || []) {
    const label = String(raw || '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ordered.push(label)
  }
  return ordered.join(DISPLAY_SEPARATOR)
}

export function formatLabelCounts(pairs, omitZero = false) {
  const cleaned = []
  for (const [label, count] of pairs || []) {
    const name = String(label || '').trim()
    if (!name || count == null || count === '') continue
    const value = Number(count)
    if (!Number.isFinite(value)) continue
    if (omitZero && value === 0) continue
    cleaned.push([name, value])
  }
  cleaned.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return cleaned.map(([label, value]) => `${label}(${value})`).join(DISPLAY_SEPARATOR)
}

function factLocation(fact) {
  return String(
    fact?.location_label ||
      fact?.province ||
      fact?.city ||
      fact?.location_name ||
      fact?.country ||
      '',
  ).trim()
}

function toInt(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function collapseFacts(facts) {
  const rows = (facts || []).filter((item) => item && typeof item === 'object')
  const diseases = joinUniqueLabels(
    rows.map((item) => shortDiseaseLabel(item.disease || item.disease_classification)),
  )
  const locationLabels = rows.map(factLocation)
  const locations = joinUniqueLabels(locationLabels)
  const uniqueDiseases = diseases.split(DISPLAY_SEPARATOR).filter(Boolean)
  const uniqueLocations = locations.split(DISPLAY_SEPARATOR).filter(Boolean)
  const locationsVary = uniqueLocations.length > 1
  const diseasesVary = uniqueDiseases.length > 1

  const casesByLocation = new Map()
  const deathsByLocation = new Map()
  const casesByDisease = new Map()
  const deathsByDisease = new Map()
  rows.forEach((item, index) => {
    const loc = locationLabels[index]
    const disease = shortDiseaseLabel(item.disease || item.disease_classification)
    const cases = toInt(item.case_count ?? item.cases)
    const deaths = toInt(item.death_count ?? item.deaths)
    if (loc && cases != null) casesByLocation.set(loc, (casesByLocation.get(loc) || 0) + cases)
    if (loc && deaths != null) deathsByLocation.set(loc, (deathsByLocation.get(loc) || 0) + deaths)
    if (disease && cases != null) casesByDisease.set(disease, (casesByDisease.get(disease) || 0) + cases)
    if (disease && deaths != null) deathsByDisease.set(disease, (deathsByDisease.get(disease) || 0) + deaths)
  })

  let casesDisplay = ''
  let deathsDisplay = ''
  let dimension = 'single'
  if (locationsVary && diseasesVary) {
    const byLocCases = new Map()
    const byLocDeaths = new Map()
    rows.forEach((item, index) => {
      const loc = locationLabels[index] || 'Unknown'
      const dis = shortDiseaseLabel(item.disease || item.disease_classification)
      const c = toInt(item.case_count ?? item.cases)
      const d = toInt(item.death_count ?? item.deaths)
      if (dis && c != null) {
        if (!byLocCases.has(loc)) byLocCases.set(loc, [])
        byLocCases.get(loc).push([dis, c])
      }
      if (dis && d != null && d > 0) {
        if (!byLocDeaths.has(loc)) byLocDeaths.set(loc, [])
        byLocDeaths.get(loc).push([dis, d])
      }
    })
    const casesParts = []
    byLocCases.forEach((pairs, loc) => {
      pairs.sort((a, b) => b[1] - a[1])
      casesParts.push(`${loc}: ` + pairs.map(([d, cnt]) => `${d}(${cnt})`).join(', '))
    })
    casesDisplay = casesParts.join(DISPLAY_SEPARATOR)

    const deathsParts = []
    byLocDeaths.forEach((pairs, loc) => {
      pairs.sort((a, b) => b[1] - a[1])
      deathsParts.push(`${loc}: ` + pairs.map(([d, cnt]) => `${d}(${cnt})`).join(', '))
    })
    deathsDisplay = deathsParts.join(DISPLAY_SEPARATOR)
    dimension = 'multi'
  } else if (locationsVary) {
    casesDisplay = formatLabelCounts([...casesByLocation.entries()])
    deathsDisplay = formatLabelCounts([...deathsByLocation.entries()], true)
    dimension = 'location'
  } else if (diseasesVary) {
    casesDisplay = formatLabelCounts([...casesByDisease.entries()], true)
    deathsDisplay = formatLabelCounts([...deathsByDisease.entries()], true)
    dimension = 'disease'
  }

  return {
    diseaseDisplay: diseases,
    locationDisplay: locations,
    casesDisplay: casesDisplay || null,
    deathsDisplay: deathsDisplay || null,
    dimension,
  }
}

export function factsFromAnalyzeResult(result) {
  const subEvents = result?.sub_events || []
  if (Array.isArray(subEvents) && subEvents.length >= 2) {
    return subEvents.map((item) => ({
      disease: item.disease || result.disease_classification,
      location_name: item.location_name || result.location_name,
      country: item.country || result.country,
      province: item.province || result.province,
      city: item.city || result.city,
      case_count: item.case_count,
      death_count: item.death_count,
    }))
  }
  const diseases = [...(result?.disease_extracted || [])]
  if (result?.disease_classification && !diseases.includes(result.disease_classification)) {
    diseases.unshift(result.disease_classification)
  }
  const locations = (result?.locations || [])
    .map((item) => (item && item.name ? String(item.name).trim() : ''))
    .filter(Boolean)
  if (!locations.length && result?.location_name) locations.push(result.location_name)
  if (diseases.filter(Boolean).length >= 2) {
    return diseases.filter(Boolean).map((name, index) => ({
      disease: name,
      location_name: locations[0] || result?.country || '',
      country: result?.country,
      case_count: index === 0 ? result?.case_count : 0,
      death_count: index === 0 ? result?.death_count : 0,
    }))
  }
  return [{
    disease: result?.disease_classification,
    location_name: result?.location_name,
    country: result?.country,
    province: result?.province,
    city: result?.city,
    case_count: result?.case_count,
    death_count: result?.death_count,
  }]
}

const GEO_SENTINELS = new Set(['MULTI_COUNTRY', 'UNKNOWN'])
const GLOBAL_LABELS = new Set(['GLOBAL', 'WORLD', 'WORLDWIDE', 'INTERNATIONAL', 'INTERNASIONAL'])
const ASEAN_COUNTRIES = new Set([
  'brunei',
  'cambodia',
  'indonesia',
  'laos',
  'lao pdr',
  'malaysia',
  'myanmar',
  'philippines',
  'singapore',
  'thailand',
  'timor-leste',
  'vietnam',
  'viet nam',
])

export function isHiddenGeoLabel(value) {
  const raw = String(value || '').trim()
  return !raw || GEO_SENTINELS.has(raw.toUpperCase())
}

export function isJoinedPlaces(value) {
  const raw = String(value || '')
  return raw.includes(';') || /,\s*[A-Z]/.test(raw)
}

export function isMultiCountryValue(value) {
  const raw = String(value || '').trim()
  return raw.toUpperCase() === 'MULTI_COUNTRY' || isJoinedPlaces(raw)
}

function eventMetric(evt, keys) {
  for (const key of keys) {
    if (evt?.[key] != null && evt[key] !== '') {
      const n = Number(String(evt[key]).replace(/,/g, ''))
      if (Number.isFinite(n)) return n
    }
  }
  return 0
}

function isRealCountryName(name) {
  const raw = String(name || '').trim()
  if (!raw) return false
  const folded = foldAdminPlace(raw)
  const resolved = resolveAseanCountry(raw)
  if (resolved) return foldAdminPlace(resolved) === folded
  return isAseanCountryName(raw)
}

function nearEqualCount(left, right) {
  const a = Number(left) || 0
  const b = Number(right) || 0
  if (a === b) return true
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (hi <= 0) return false
  return hi - lo <= Math.max(2, Math.round(hi * 0.02))
}

function isCountryLevelEvent(evt) {
  const loc = String(evt?.location_name || '').trim().toLowerCase()
  const country = String(evt?.country || '').trim().toLowerCase()
  const province = String(evt?.province || evt?.admin1 || '').trim()
  if (!country) return false
  if (resolveAseanCountry(evt?.country) && !isRealCountryName(evt?.country)) return false
  if (loc && loc === country) return true
  if (!province && !loc) return true
  return false
}

function isSyntheticWindowEvent(evt) {
  const evidence = String(evt?.evidence || '').trim()
  const cases = eventMetric(evt, ['cases', 'case_count'])
  const deaths = eventMetric(evt, ['deaths', 'death_count'])
  return /^cumulative (?:reporting window|total reported)/i.test(evidence) && cases <= 0 && deaths <= 0
}

export function isHistoricalEvent(evt) {
  const ctx = String(evt?.temporal_context || evt?.count_period_type || evt?.metric_type || '').toLowerCase()
  return ctx === 'historical' || ctx.startsWith('historical')
}

export function isCurrentParentMirror(evt, parent) {
  if (!evt || !parent || isHistoricalEvent(evt)) return false
  const loc = String(evt.location_name || evt.locationName || '').trim().toLowerCase()
  const country = String(evt.country || parent.country || '').trim().toLowerCase()
  const parentCountry = String(parent.country || '').trim().toLowerCase()
  const disease = String(evt.disease || evt.disease_classification || '').trim().toLowerCase()
  const parentDisease = String(parent.disease || parent.disease_classification || '').trim().toLowerCase()
  const cases = Number(evt.cases ?? evt.case_count ?? 0)
  const deaths = Number(evt.deaths ?? evt.death_count ?? 0)
  const parentCases = Number(parent.cases ?? parent.case_count ?? 0)
  const parentDeaths = Number(parent.deaths ?? parent.death_count ?? 0)
  return Boolean(
    loc &&
    country &&
    loc === country &&
    country === parentCountry &&
    disease === parentDisease &&
    nearEqualCount(cases, parentCases) &&
    (deaths === parentDeaths || (deaths === 0 && parentDeaths > 0) || (parentDeaths === 0 && deaths > 0)),
  )
}

export function aggregateReviewTotals(events) {
  const groups = new Map()
  for (const evt of events || []) {
    if (!evt || isSyntheticWindowEvent(evt) || isHistoricalEvent(evt)) continue
    const cases = eventMetric(evt, ['cases', 'case_count'])
    const deaths = eventMetric(evt, ['deaths', 'death_count'])
    if (cases <= 0 && deaths <= 0) continue
    const disease = String(evt.disease || evt.disease_classification || 'Unknown')
    const country = String(evt.country || '').trim() || '_'
    const key = `${disease.toLowerCase()}|${country.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, {disease, items: []})
    groups.get(key).items.push({cases, deaths, countryLevel: isCountryLevelEvent(evt)})
  }

  const diseasesWithRealNational = new Set()
  for (const [key, group] of groups) {
    const country = key.split('|')[1] || ''
    if (isRealCountryName(country) && group.items.some((item) => item.countryLevel)) {
      diseasesWithRealNational.add(key.split('|')[0])
    }
  }

  let totalCases = 0
  let totalDeaths = 0
  const casesByDisease = {}
  const deathsByDisease = {}
  for (const [key, group] of groups) {
    const country = key.split('|')[1] || ''
    const diseaseKey = key.split('|')[0]
    if (diseasesWithRealNational.has(diseaseKey) && !isRealCountryName(country)) continue
    const nationals = group.items.filter((item) => item.countryLevel)
    const chosen = nationals.length ? nationals : group.items
    const cases = nationals.length
      ? Math.max(...nationals.map((item) => item.cases))
      : chosen.reduce((sum, item) => sum + item.cases, 0)
    const deaths = nationals.length
      ? Math.max(...nationals.map((item) => item.deaths))
      : chosen.reduce((sum, item) => sum + item.deaths, 0)
    totalCases += cases
    totalDeaths += deaths
    casesByDisease[group.disease] = (casesByDisease[group.disease] || 0) + cases
    if (deaths > 0) {
      deathsByDisease[group.disease] = (deathsByDisease[group.disease] || 0) + deaths
    }
  }

  return {
    cases: totalCases,
    deaths: totalDeaths,
    casesDisplay: Object.entries(casesByDisease)
      .map(([name, count]) => `${name}(${count.toLocaleString()})`)
      .join('; '),
    deathsDisplay: Object.entries(deathsByDisease)
      .map(([name, count]) => `${name}(${count.toLocaleString()})`)
      .join('; '),
  }
}

export function displayCountry(value, fallbacks = []) {
  const raw = String(value || '').trim()
  const asCountry = resolveAseanCountry(raw)
  if (asCountry) return asCountry
  if (raw && !isHiddenGeoLabel(raw)) return raw
  return joinUniqueLabels(
    (fallbacks || [])
      .flatMap((item) => String(item || '').split(';'))
      .map((part) => part.trim())
      .filter((part) => part && !isHiddenGeoLabel(part) && !GLOBAL_LABELS.has(part.toUpperCase())),
  )
}

const ASEAN_REGIONAL_LABELS = new Set([
  'asean',
  'southeast asia',
  'south east asia',
  'south-east asia',
  'asia tenggara',
  'searo',
  'who searo',
  'who south-east asia region',
  'who south east asia region',
  'south-east asia region',
  'south east asia region',
  'southeast asia region',
])

export function displayRegion(region, country) {
  const fromMaster = String(region || '').trim()
  const named = String(country || '').trim()
  const resolvedCountry = resolveAseanCountry(named) || named
  if (ASEAN_REGIONAL_LABELS.has(fromMaster.toLowerCase()) || ASEAN_REGIONAL_LABELS.has(named.toLowerCase())) {
    return 'ASEAN'
  }
  if (isAseanCountryName(resolvedCountry) && (fromMaster === 'Outside ASEAN' || !fromMaster)) {
    return 'ASEAN'
  }
  if (fromMaster && !isHiddenGeoLabel(fromMaster)) {
    return fromMaster.toUpperCase() === 'GLOBAL' ? 'Global' : fromMaster
  }
  if (!named) return ''
  if (isHiddenGeoLabel(named) || isJoinedPlaces(named) || GLOBAL_LABELS.has(named.toUpperCase())) {
    return 'Global'
  }
  return ASEAN_COUNTRIES.has(resolvedCountry.toLowerCase()) ? 'ASEAN' : 'Outside ASEAN'
}

export function flagCountryName(country) {
  const named = String(country || '').trim()
  if (!named || isMultiCountryValue(named) || GLOBAL_LABELS.has(named.toUpperCase())) return ''
  return named
}

function uniqueLabels(values) {
  const seen = new Set()
  const out = []
  for (const raw of values || []) {
    const label = String(raw || '').trim()
    if (!label || label === '—' || label === '-') continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

function countHint(n, one, many) {
  if (!n) return ''
  return `${n} ${n === 1 ? one : many}`
}

export function isCountHint(value) {
  return /^\d+\s+(location|disease|country|date|event|region)s?$/i.test(String(value || '').trim())
}

export function parentRowMultiSummary(events) {
  const rows = (events || []).filter((item) => item && typeof item === 'object')
  if (rows.length < 2) return null

  const countries = uniqueLabels(rows.map((item) => item.country || item.case_country))
  const regions = uniqueLabels(rows.map((item) => item.region || item.surveillance_scope))
  const diseases = uniqueLabels(rows.map((item) => (
    shortDiseaseLabel(item.disease || item.disease_name || item.disease_classification)
  )))
  const places = uniqueLabels(rows.map((item) => (
    item.city
    || item.province
    || item.province_city_case
    || item.location_name
    || item.location_label
    || factLocation(item)
  )))
  const dates = uniqueLabels(rows.map((item) => {
    const raw = item.date_case || item.event_date_start || item.event_date || ''
    const text = String(raw).trim()
    return text.length >= 10 ? text.slice(0, 10) : text
  }))

  return {
    eventCount: rows.length,
    country: countries.length > 1 ? countHint(countries.length, 'country', 'countries') : (countries[0] || ''),
    region: regions.length > 1 ? countHint(regions.length, 'region', 'regions') : (regions[0] || ''),
    disease: diseases.length > 1 ? countHint(diseases.length, 'disease', 'diseases') : (diseases[0] || ''),
    location: places.length > 1 ? countHint(places.length, 'location', 'locations') : (places[0] || ''),
    dateCase: dates.length > 1 ? countHint(dates.length, 'date', 'dates') : (dates[0] || ''),
    cases: '',
    deaths: '',
    geoSummary: places.length > 1 ? countHint(places.length, 'location', 'locations') : '',
    locationMulti: places.length > 1,
    countryMulti: countries.length > 1,
    diseaseMulti: diseases.length > 1,
    dateMulti: dates.length > 1,
  }
}

export function parentHintsFromRow(row) {
  if (!row) return null
  const events = Number(row.event_count || 0)
  const locations = Number(row.location_count || 0)
  const diseaseParts = String(row.disease || row.disease_name || '').split(';').map((part) => part.trim()).filter(Boolean)
  const countryParts = String(row.country || '').split(';').map((part) => part.trim()).filter(Boolean)
  if (events < 2 && locations < 2 && diseaseParts.length < 2 && countryParts.length < 2) return null
  return {
    eventCount: events || locations || 0,
    country: countryParts.length > 1 ? countHint(countryParts.length, 'country', 'countries') : (countryParts[0] || ''),
    region: row.region || row.surveillance_scope || '',
    disease: diseaseParts.length > 1 ? countHint(diseaseParts.length, 'disease', 'diseases') : (diseaseParts[0] || ''),
    location: locations > 1 ? countHint(locations, 'location', 'locations') : (row.province_city_case || row.location_name || ''),
    dateCase: row.date_case || '',
    cases: '',
    deaths: '',
    geoSummary: locations > 1 ? countHint(locations, 'location', 'locations') : (row.geo_summary || ''),
    locationMulti: locations > 1,
    countryMulti: countryParts.length > 1,
    diseaseMulti: diseaseParts.length > 1,
    dateMulti: false,
  }
}

export function applyParentRowHints(parent, summary) {
  if (!parent || !summary) return parent
  return {
    ...parent,
    country: summary.country || parent.country,
    region: summary.region || parent.region,
    surveillance_scope: summary.region || parent.surveillance_scope,
    disease: summary.disease || parent.disease,
    disease_name: summary.disease || parent.disease_name,
    province_city_case: summary.location || parent.province_city_case,
    province: summary.locationMulti ? null : parent.province,
    city: summary.locationMulti ? null : parent.city,
    location_name: summary.location || parent.location_name,
    geo_summary: summary.geoSummary || parent.geo_summary,
    cases_display: summary.cases || parent.cases_display,
    deaths_display: summary.deaths || parent.deaths_display,
    cases: summary.cases ? null : parent.cases,
    deaths: summary.deaths ? null : parent.deaths,
    number_of_cases: summary.cases ? null : parent.number_of_cases,
    number_of_deaths: summary.deaths ? null : parent.number_of_deaths,
    date_case: summary.dateCase || null,
    latitude: summary.locationMulti ? null : parent.latitude,
    longitude: summary.locationMulti ? null : parent.longitude,
  }
}

function reviewPlace(evt) {
  return String(evt?.city || evt?.location_name || evt?.province_city_case || '').trim()
}

function isJunkEvidence(text) {
  const raw = String(text || '').trim()
  return /^[[{]/.test(raw) || /"(?:relations|metric_type|regional_support)"/.test(raw)
}

function isCalendarDayCount(evt, cases) {
  if (cases < 1 || cases > 31) return false
  if (eventMetric(evt, ['deaths', 'death_count']) > 0) return false
  return new RegExp(
    String.raw`\b${cases}\s+(?:jan(?:uari)?|feb(?:ruari)?|mac|mar(?:ch)?|apr(?:il)?|mei|may|jun(?:e|i)?|jul(?:y|i)?|ogos|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dis(?:ember)?|dec(?:ember)?)\b`,
    'i',
  ).test(String(evt?.evidence || ''))
}

function isNamedReviewPlace(place, country) {
  const loc = String(place || '').trim()
  if (!loc || isCountHint(loc)) return false
  return loc.toLowerCase() !== String(country || '').trim().toLowerCase()
}

function reviewLocKey(evt) {
  const loc = reviewPlace(evt).toLowerCase()
  const country = String(evt?.country || '').trim().toLowerCase()
  if (!loc || loc === country || isCountHint(loc)) return ''
  return loc
}

function pickRicherReviewEvent(current, incoming) {
  const currentPlace = reviewPlace(current)
  const incomingPlace = reviewPlace(incoming)
  const currentNamed = isNamedReviewPlace(currentPlace, current.country)
  const incomingNamed = isNamedReviewPlace(incomingPlace, incoming.country)
  const currentCases = eventMetric(current, ['cases', 'case_count'])
  const incomingCases = eventMetric(incoming, ['cases', 'case_count'])
  const currentDeaths = eventMetric(current, ['deaths', 'death_count'])
  const incomingDeaths = eventMetric(incoming, ['deaths', 'death_count'])
  const winner = { ...current }
  if (incomingNamed && !currentNamed) {
    winner.city = incoming.city
    winner.location_name = incoming.location_name
    winner.province = incoming.province || winner.province
    winner.province_city_case = incoming.province_city_case
  }
  if (incomingCases > currentCases) {
    winner.cases = incomingCases
    winner.case_count = incomingCases
  }
  if (incomingDeaths > currentDeaths) {
    winner.deaths = incomingDeaths
    winner.death_count = incomingDeaths
  }
  if (incoming.date_case && !winner.date_case) winner.date_case = incoming.date_case
  if (incoming.evidence && (!winner.evidence || isJunkEvidence(winner.evidence))) {
    winner.evidence = incoming.evidence
  }
  return winner
}

function isKnownReviewDisease(evt) {
  const disease = String(evt?.disease || evt?.disease_classification || '').trim()
  if (!disease) return false
  const upper = disease.toUpperCase()
  if (upper === 'UNKNOWN' || upper === 'UNKNOWN DISEASE') return false
  if (upper.startsWith('NEGATIVE')) return false
  return true
}

function exactEventKey(evt) {
  const text = (value) => String(value ?? '').trim().toLowerCase()
  return [
    text(evt.disease || evt.disease_classification),
    text(evt.country || evt.case_country),
    text(evt.province),
    text(evt.city || evt.location_name || evt.province_city_case),
    eventMetric(evt, ['cases', 'case_count']),
    eventMetric(evt, ['deaths', 'death_count']),
    text(evt.date_case || evt.event_date_start || evt.event_date).slice(0, 10),
  ].join('|')
}

/**
 * Review modal rows: one row per stored event, same rule as the server list.
 * When an article has child events with a real disease, parent rows are hidden
 * (never a synthetic totals row). An UNKNOWN child does not hide that parent.
 * Only byte-identical facts are dropped; nothing is merged by
 * approximate counts, so reopening shows the same rows every time.
 */
export function reviewEventRows(rows) {
  const events = (rows || []).filter((row) => row && typeof row === 'object')
  const children = events.filter((row) => row.parent_event_id)
  const knownChildren = children.filter(isKnownReviewDisease)
  // A child with no disease must not hide the parent the dashboard already
  // showed. Real children still replace the parent rollup.
  const kept = knownChildren.length
    ? knownChildren
    : children.length
      ? events.filter((row) => !row.parent_event_id && isKnownReviewDisease(row))
      : events
  const source = kept.length ? kept : (children.length ? children : events)
  const seen = new Set()
  return source.filter((row) => {
    const key = exactEventKey(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((row) => ({ ...row }))
}

export function foldReviewEvents(events) {
  const merged = []
  for (const evt of events || []) {
    if (!evt || typeof evt !== 'object') continue
    if (isSyntheticWindowEvent(evt)) continue
    if (isCountHint(reviewPlace(evt))) continue
    if (isJunkEvidence(evt.evidence)) continue
    const cases = eventMetric(evt, ['cases', 'case_count'])
    const deaths = eventMetric(evt, ['deaths', 'death_count'])
    if (isCalendarDayCount(evt, cases)) continue
    const disease = String(evt.disease || evt.disease_classification || '').trim().toLowerCase()
    const country = String(evt.country || '').trim().toLowerCase()
    const loc = reviewLocKey(evt)
    const match = merged.findIndex((other) => {
      if (String(other.disease || other.disease_classification || '').trim().toLowerCase() !== disease) return false
      if (String(other.country || '').trim().toLowerCase() !== country) return false
      const otherLoc = reviewLocKey(other)
      const locMatch = !loc || !otherLoc || loc === otherLoc
      const otherCases = eventMetric(other, ['cases', 'case_count'])
      const otherDeaths = eventMetric(other, ['deaths', 'death_count'])
      return locMatch && (
        nearEqualCount(cases, otherCases)
        || (cases <= 0 && otherCases > 0 && deaths > 0)
        || (otherCases <= 0 && cases > 0 && otherDeaths > 0)
      )
    })
    if (match < 0) {
      merged.push({ ...evt })
      continue
    }
    merged[match] = pickRicherReviewEvent(merged[match], evt)
  }
  return merged
}

export function collapseAnalyzeResult(result) {
  if (!result) {
    return {
      diseaseDisplay: '',
      locationDisplay: '',
      casesDisplay: null,
      deathsDisplay: null,
      dimension: 'single',
    }
  }
  if (result.disease_display || result.location_display || result.cases_display || result.deaths_display) {
    return {
      diseaseDisplay: result.disease_display || '',
      locationDisplay: result.location_display || result.location_name || result.province || result.country || '',
      casesDisplay: result.cases_display || null,
      deathsDisplay: result.deaths_display || null,
      dimension: result.display_dimension || 'single',
    }
  }
  return collapseFacts(factsFromAnalyzeResult(result))
}
