// PR 027: context layers for Dasbor Zoonosis Lite, from the same keyless public APIs NLP-PENYAKIT/ABVC uses
// (GBIF occurrence search for birds, iNaturalist observations for mosquitoes), filtered to the dashboard period
// and to Indonesia. Both APIs send `Access-Control-Allow-Origin: *`, need no key and are listed in the CSP connect-src.
import type { VectorSighting, VectorSightingsResponse } from '@/types'

const GBIF = 'https://api.gbif.org/v1/occurrence/search'
const INAT = 'https://api.inaturalist.org/v1/observations'
/** Waterfowl (Anseriformes) and shorebirds/gulls/terns (Charadriiformes): the main avian-influenza reservoirs and
 *  the migratory waterbirds of the East Asian–Australasian Flyway. GBIF has no "migratory" flag, so we filter by order. */
export const GBIF_BIRD_ORDERS = [{ key: 1108, name: 'Anseriformes' }, { key: 7192402, name: 'Charadriiformes' }] as const
/** iNaturalist taxon 52134 = Culicidae (mosquitoes); place 6966 = Indonesia. */
export const INAT_MOSQUITO_TAXON = 52134
export const INAT_PLACE_INDONESIA = 6966

export type GbifBirds = { results: any[]; count: number; source: string }
export type InatMosquitoes = VectorSightingsResponse & { total: number }

const getJson = async (url: string, signal: AbortSignal) => {
  const r = await fetch(url, { signal, credentials: 'omit' })
  if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`)
  return r.json()
}

/** GBIF bird occurrences in Indonesia between start and end (YYYY-MM-DD); pages of 300, at most `max` records. */
export async function fetchGbifWaterbirds(start: string, end: string, signal: AbortSignal, max = 900): Promise<GbifBirds> {
  const qs = (offset: number) => {
    const p = new URLSearchParams({ country: 'ID', hasCoordinate: 'true', hasGeospatialIssue: 'false', occurrenceStatus: 'PRESENT', eventDate: `${start},${end}`, limit: '300', offset: String(offset) })
    GBIF_BIRD_ORDERS.forEach((o) => p.append('orderKey', String(o.key)))
    return `${GBIF}?${p}`
  }
  const first = await getJson(qs(0), signal)
  const count = Number(first?.count) || 0
  const offsets: number[] = []
  for (let o = 300; o < Math.min(count, max); o += 300) offsets.push(o)
  const rest = await Promise.all(offsets.map((o) => getJson(qs(o), signal)))
  const results = [first, ...rest].flatMap((p) => (Array.isArray(p?.results) ? p.results : []))
  return { results, count, source: 'gbif' }
}

/** iNaturalist mosquito (Culicidae) observations in Indonesia between start and end; sequential pages of 200 (iNat asks ≤1 req/s). */
export async function fetchInatMosquitoes(start: string, end: string, signal: AbortSignal, max = 400): Promise<InatMosquitoes> {
  const qs = (page: number) => `${INAT}?${new URLSearchParams({
    taxon_id: String(INAT_MOSQUITO_TAXON), place_id: String(INAT_PLACE_INDONESIA), d1: start, d2: end, geo: 'true', verifiable: 'true',
    per_page: '200', page: String(page), order: 'desc', order_by: 'observed_on',
  })}`
  const raw: any[] = []
  let total = 0
  for (let page = 1; page <= Math.ceil(max / 200); page++) {
    const d = await getJson(qs(page), signal)
    total = Number(d?.total_results) || 0
    raw.push(...(Array.isArray(d?.results) ? d.results : []))
    if (raw.length >= total) break
  }
  const sightings: VectorSighting[] = raw.flatMap((r) => {
    const c = r?.geojson?.coordinates
    const [lon, lat] = Array.isArray(c) ? c.map(Number) : String(r?.location || '').split(',').map(Number).reverse()
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
    const sci = r?.taxon?.name as string | undefined
    const common = (r?.taxon?.preferred_common_name || r?.species_guess) as string | undefined
    return [{
      latitude: lat, longitude: lon,
      species: sci && common && common !== sci ? `${sci} (${common})` : sci || common || 'Culicidae',
      observed_on: r?.observed_on || '',
      photo_url: r?.photos?.[0]?.url ? String(r.photos[0].url).replace('/square.', '/small.') : undefined,
      place: r?.place_guess || undefined,
      url: r?.uri || (r?.id ? `https://www.inaturalist.org/observations/${r.id}` : null),
    }]
  })
  return { status: 'ok', source: 'inaturalist', total, sightings }
}
