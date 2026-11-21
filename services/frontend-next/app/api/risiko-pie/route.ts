import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { parsePieStatus, resolveKodeKab, type PieApiPayload, type PieRecord } from '@/lib/risiko-pie'

export const dynamic = 'force-dynamic'

const PIE_BASE = (process.env.SKDR_PIE_BASE || 'https://petarisikopie.id/api').replace(/\/$/, '')
const PIE_KEY =
  process.env.SKDR_PIE_KEY || '6385340732e6b3c1197272f0b5a6d7dcc3132ee34e9cd6d53fd22c2cfb201ad6'

const TTL_MS = 15 * 60_000
const cache: Record<number, { data: PieApiPayload; expiresAt: number }> = {}

let nameToCodeMapCache: Map<string, string> | null = null
function getNameToCodeMap(): Map<string, string> | undefined {
  if (nameToCodeMapCache) return nameToCodeMapCache
  try {
    const file = path.join(process.cwd(), 'public', 'data', 'indonesia-kabupaten.geojson')
    if (!fs.existsSync(file)) return undefined
    const fc = JSON.parse(fs.readFileSync(file, 'utf8'))
    const map = new Map<string, string>()
    const clean = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/^(kota|kab\.|kabupaten|adm\.|administrasi)\s+/g, '')
        .replace(/[^a-z0-9]/g, '')
    for (const f of fc.features || []) {
      const nama = f.properties?.nama_kab
      const kode = f.properties?.kode_kab
      if (nama && kode) map.set(clean(nama), String(kode).padStart(4, '0'))
    }
    nameToCodeMapCache = map
    return map
  } catch {
    return undefined
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const yearParam = Number(sp.get('year') || 2026)
  const tahun = Number.isFinite(yearParam) && yearParam >= 2020 && yearParam <= 2030 ? yearParam : 2026

  const now = Date.now()
  const hit = cache[tahun]
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(hit.data, { headers: { 'Cache-Control': 'private, max-age=300' } })
  }

  try {
    const res = await fetch(`${PIE_BASE}/record-data?year=${tahun}`, {
      headers: {
        'X-API-KEY': PIE_KEY,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `PIE API HTTP ${res.status}` }, { status: 502 })
    }
    const json = await res.json()
    const rawList: any[] = json.data || []
    const nameMap = getNameToCodeMap()

    const records: PieRecord[] = rawList.map((r: any) => {
      const rawP = String(r.jns_penyakit || '')
      const pParts = rawP.split(',')
      const pId = pParts[0]?.trim() || ''
      const pName = pParts.slice(1).join(',').trim() || rawP
      const rawSt = String(r.status || '')
      const stParsed = parsePieStatus(rawSt)
      const rawCode = String(r.kode_kako || '').padStart(4, '0')
      const kemenCode = resolveKodeKab(rawCode, r.nama_kako, nameMap)
      const kdProp = kemenCode.slice(0, 2)
      return {
        jns_penyakit: rawP,
        penyakit_nama: pName,
        penyakit_id: pId,
        tahun: String(r.tahun || tahun),
        timestamp_isi: r.timestamp_isi || '',
        kode_kako: rawCode,
        kode_kemendagri: kemenCode,
        kd_prop: kdProp,
        nama_kako: r.nama_kako || '',
        status_raw: rawSt,
        status_label: stParsed.label,
        status_score: stParsed.score,
        warna: stParsed.color,
      }
    })

    const payload: PieApiPayload = {
      ok: true,
      tahun,
      fetched_at: new Date().toISOString(),
      summary: {
        total_records: records.length,
        tahun,
        tinggi: records.filter((r) => r.status_score === 3).length,
        sedang: records.filter((r) => r.status_score === 2).length,
        rendah: records.filter((r) => r.status_score === 1).length,
      },
      records,
    }
    cache[tahun] = { data: payload, expiresAt: now + TTL_MS }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Gagal mengambil data Peta Risiko PIE' },
      { status: 502 },
    )
  }
}
