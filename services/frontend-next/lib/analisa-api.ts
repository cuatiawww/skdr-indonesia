// PR 042: Matriks Analisa - filter state (in the URL), API client and hooks.
'use client'
import { useEffect, useRef, useState } from 'react'
import { peFetch } from '@/lib/pe-api'
import { getCurrentEpiWeek, getWeeksInYear } from '@/lib/epi-week'

export type SumberA = 'ebs' | 'ibs' | 'semua'
export type TabKey = 'ringkasan' | 'matriks' | 'morbiditas' | 'kinerja' | 'sinyal' | 'profil'
export type Periode = 'minggu' | 'bulan' | 'tahun'

export interface AFilter {
  sumber: SumberA
  sy: number; sw: number; ey: number; ew: number
  prov: string; kab: string; kec: string
  penyakit: string[]
  periode: Periode
  // filter lanjutan
  jenis_unit: string[]; kelompok: string[]
  status_rumor: string[]; klb: string[]; klb_status: string[]; w1: string[]; sumber_info: string[]; spesimen: string[]; respon: string[]; verif: string[]
  basis: 'verif' | 'rumor'
}

export const ADV_KEYS = ['jenis_unit', 'kelompok', 'status_rumor', 'klb', 'klb_status', 'w1', 'sumber_info', 'spesimen', 'respon', 'verif'] as const
export type AdvKey = (typeof ADV_KEYS)[number]

export function defaultFilter(): AFilter {
  const cur = getCurrentEpiWeek()
  return {
    sumber: 'ibs', sy: cur.year, sw: 1, ey: cur.year, ew: cur.week, prov: '', kab: '', kec: '', penyakit: [], periode: 'minggu',
    jenis_unit: [], kelompok: [], status_rumor: [], klb: [], klb_status: [], w1: [], sumber_info: [], spesimen: [], respon: [], verif: [], basis: 'verif',
  }
}

/** Preset: last 4 complete epi weeks / current year to date. */
export function preset(kind: '4minggu' | 'tahun' | '12minggu'): Pick<AFilter, 'sy' | 'sw' | 'ey' | 'ew'> {
  const cur = getCurrentEpiWeek()
  if (kind === 'tahun') return { sy: cur.year, sw: 1, ey: cur.year, ew: cur.week }
  const n = kind === '4minggu' ? 4 : 12
  let ey = cur.year, ew = cur.week - 1
  if (ew < 1) { ey -= 1; ew = getWeeksInYear(ey) }
  let sy = ey, sw = ew - (n - 1)
  while (sw < 1) { sy -= 1; sw += getWeeksInYear(sy) }
  return { sy, sw, ey, ew }
}

const LIST = (v: string | null, sep = '|') => (v || '').split(sep).map((x) => x.trim()).filter(Boolean)

export function readFilter(sp: URLSearchParams): AFilter {
  const d = defaultFilter()
  const num = (k: string, def: number) => { const n = Number(sp.get(k)); return Number.isFinite(n) && n > 0 ? n : def }
  const s = (sp.get('sumber') || '').toLowerCase()
  const per = sp.get('periode')
  const f: AFilter = {
    ...d,
    sumber: s === 'ebs' ? 'ebs' : s === 'semua' ? 'semua' : s === 'ibs' || s === 'pe' ? 'ibs' : d.sumber,
    sy: num('startYear', d.sy), sw: num('startWeek', d.sw), ey: num('endYear', d.ey), ew: num('endWeek', d.ew),
    prov: sp.get('prov') || '', kab: sp.get('kab') || '', kec: sp.get('kec') || '',
    penyakit: LIST(sp.get('penyakit'), ','), periode: per === 'bulan' || per === 'tahun' ? per : 'minggu',
    basis: sp.get('basis') === 'rumor' ? 'rumor' : 'verif',
  }
  for (const k of ADV_KEYS) f[k] = LIST(sp.get(k))
  return f
}

export function writeFilter(url: URL, f: AFilter) {
  const set = (k: string, v: string | number | null | undefined) => { if (v === null || v === undefined || v === '') url.searchParams.delete(k); else url.searchParams.set(k, String(v)) }
  set('sumber', f.sumber); set('startYear', f.sy); set('startWeek', f.sw); set('endYear', f.ey); set('endWeek', f.ew)
  set('prov', f.prov); set('kab', f.kab); set('kec', f.kec); set('penyakit', f.penyakit.join(','))
  set('periode', f.periode === 'minggu' ? '' : f.periode); set('basis', f.basis === 'rumor' ? 'rumor' : '')
  for (const k of ADV_KEYS) set(k, f[k].join('|'))
}

/** API query string for a filter (+ extra params). */
export function apiQuery(f: AFilter, extra: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams()
  p.set('sumber', f.sumber); p.set('sy', String(f.sy)); p.set('sw', String(f.sw)); p.set('ey', String(f.ey)); p.set('ew', String(f.ew))
  if (f.prov) p.set('prov', f.prov)
  if (f.kab) p.set('kab', f.kab)
  if (f.kec) p.set('kec', f.kec)
  if (f.penyakit.length) p.set('penyakit', f.penyakit.join(','))
  p.set('periode', f.periode)
  if (f.basis === 'rumor') p.set('basis', 'rumor')
  for (const k of ADV_KEYS) if (f[k].length) p.set(k, f[k].join('|'))
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') p.set(k, String(v))
  return p.toString()
}

export function useAnalisa<T = any>(endpoint: string, f: AFilter, extra: Record<string, string | number | undefined> = {}, enabled = true) {
  const qs = apiQuery(f, extra)
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const seq = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const my = ++seq.current
    setLoading(true); setError(null)
    peFetch<T>(`/api/v1/analisa/${endpoint}?${qs}`)
      .then((d) => { if (my === seq.current) { setData(d); setLoading(false) } })
      .catch((e) => { if (my === seq.current) { setError(e?.message || 'Gagal memuat'); setLoading(false) } })
  }, [endpoint, qs, nonce, enabled])
  return { data, loading, error, reload: () => setNonce((n) => n + 1) }
}

export async function fetchAnalisa<T = any>(endpoint: string, f: AFilter, extra: Record<string, string | number | undefined> = {}) {
  return peFetch<T>(`/api/v1/analisa/${endpoint}?${apiQuery(f, extra)}`)
}

export const nf = (n: number | null | undefined, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '0' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 }))
export const pf = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`)
export const SUMBER_LABEL: Record<SumberA, string> = { ebs: 'Laporan EBS', ibs: 'Laporan Agregat IBS', semua: 'Laporan EBS + IBS' }
