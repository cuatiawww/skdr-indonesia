// Lapisan "Risiko Emerging (PIE)" berbasis API Peta Risiko PIE Kemenkes (petarisikopie.id).
// Warna Tingkat Risiko (selaras dengan skala baku Asistensi / IRBI):
// TINGGI = merah (#dc2626), SEDANG = jingga (#f59e0b), RENDAH = hijau (#16a34a).
import type { CatChoro } from '@/components/spasial/SpasialMap'

export type PieDiseaseOption =
  | 'all'
  | 'polio'
  | 'mers'
  | 'meningitis'
  | 'avian-influenza'
  | 'covid-19'

export const PIE_YEARS = [2026, 2025, 2024] as const

export const PIE_DISEASES: { id: PieDiseaseOption; label: string; short: string; keyInApi?: string }[] = [
  { id: 'all', label: 'Semua Penyakit Emerging', short: 'Semua PIE' },
  { id: 'polio', label: 'Polio', short: 'Polio', keyInApi: 'POLIO' },
  { id: 'mers', label: 'MERS', short: 'MERS', keyInApi: 'MERS' },
  { id: 'meningitis', label: 'Meningitis Meningokokus', short: 'Meningitis', keyInApi: 'MENINGITIS MENINGOKOKUS' },
  { id: 'avian-influenza', label: 'Avian Influenza (Flu Burung)', short: 'Flu Burung', keyInApi: 'AVIAN INFLUENZA' },
  { id: 'covid-19', label: 'COVID-19', short: 'COVID-19', keyInApi: 'COVID-19' },
]

export const PIE_SKALA: Record<string, string> = {
  Tinggi: '#dc2626',
  Sedang: '#f59e0b',
  Rendah: '#16a34a',
  'Belum Ada Data': '#cbd5e1',
}

export const PIE_URUTAN = ['Tinggi', 'Sedang', 'Rendah', 'Belum Ada Data']

// Pemetaan manual untuk daerah dengan kode lama / penulisan khusus agar 100% cocok dengan GeoJSON Kemendagri
const KAKO_OVERRIDES: Record<string, string> = {
  '0901': '3171', // Kota Administrasi Jakarta Pusat
  '0902': '3172', // Kota Administrasi Jakarta Utara
  '0903': '3173', // Kota Administrasi Jakarta Barat
  '0904': '3174', // Kota Administrasi Jakarta Selatan
  '0905': '3175', // Kota Administrasi Jakarta Timur
  '0906': '3101', // Administrasi Kepulauan Seribu
  '2505': '8103', // Maluku Tenggara Barat -> Kepulauan Tanimbar
  '1810': '7109', // Siau Tagulandang Biaro -> Kepulauan Siau Tagulandang Biaro
  '2604': '9105', // Yapen Waropen -> Kepulauan Yapen
  '1714': '6411', // Mahakam Hulu -> Mahakam Ulu
  '2014': '7310', // Pangkajene dan Kepulauan -> Pangkajene Kepulauan
  '0207': '1277', // Kota Padangsidimpuan -> Kota Padang Sidempuan
  '1607': '6302', // Kota Baru -> Kotabaru (Kalsel)
}

const cleanName = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/^(kota|kab\.|kabupaten|adm\.|administrasi)\s+/g, '')
    .replace(/[^a-z0-9]/g, '')

export function resolveKodeKab(kodeKako: string, namaKako: string, nameToCodeMap?: Map<string, string>): string {
  if (KAKO_OVERRIDES[kodeKako]) return KAKO_OVERRIDES[kodeKako]
  if (nameToCodeMap) {
    const clean = cleanName(namaKako)
    const found = nameToCodeMap.get(clean)
    if (found) return found
  }
  return kodeKako
}

export type PieRecord = {
  jns_penyakit: string
  penyakit_nama: string
  penyakit_id: string
  tahun: string
  timestamp_isi: string
  kode_kako: string
  kode_kemendagri: string
  kd_prop: string
  nama_kako: string
  status_raw: string
  status_label: 'Tinggi' | 'Sedang' | 'Rendah'
  status_score: number
  warna: string
}

export type PieApiPayload = {
  ok: boolean
  tahun: number
  fetched_at: string
  summary: {
    total_records: number
    tahun: number
    tinggi: number
    sedang: number
    rendah: number
  }
  records: PieRecord[]
}

export function parsePieStatus(statusStr: string): { label: 'Tinggi' | 'Sedang' | 'Rendah'; score: number; color: string } {
  const norm = String(statusStr || '').toUpperCase()
  if (norm.includes('3') || norm.includes('TINGGI')) {
    return { label: 'Tinggi', score: 3, color: PIE_SKALA.Tinggi }
  }
  if (norm.includes('2') || norm.includes('SEDANG')) {
    return { label: 'Sedang', score: 2, color: PIE_SKALA.Sedang }
  }
  return { label: 'Rendah', score: 1, color: PIE_SKALA.Rendah }
}

export function buildRisikoPie(
  pieData: PieApiPayload | null | undefined,
  diseaseOption: PieDiseaseOption = 'all',
  level: 'provinsi' | 'kabkota' = 'provinsi',
  provKode: string | null = null,
): CatChoro | null {
  if (!pieData || !Array.isArray(pieData.records) || !pieData.records.length) return null

  const records = pieData.records
  const selectedDisease = PIE_DISEASES.find((d) => d.id === diseaseOption)
  const diseaseFilterKey = selectedDisease?.keyInApi

  const filtered = diseaseFilterKey
    ? records.filter((r) => r.penyakit_nama.toUpperCase() === diseaseFilterKey)
    : records

  if (!filtered.length) return null

  const items: CatChoro['items'] = {}
  const hit: Record<string, { color: string; n: number }> = {
    Tinggi: { color: PIE_SKALA.Tinggi, n: 0 },
    Sedang: { color: PIE_SKALA.Sedang, n: 0 },
    Rendah: { color: PIE_SKALA.Rendah, n: 0 },
  }

  if (level === 'kabkota') {
    const byKab: Record<string, PieRecord[]> = {}
    for (const r of filtered) {
      if (provKode && r.kd_prop !== provKode) continue
      const code = String(r.kode_kemendagri || r.kode_kako).padStart(4, '0')
      byKab[code] ||= []
      byKab[code].push(r)
    }

    for (const [code, list] of Object.entries(byKab)) {
      const highest = list.reduce((prev, curr) => (curr.status_score > prev.status_score ? curr : prev), list[0])
      const label = highest.status_label
      const color = highest.warna

      hit[label] ||= { color, n: 0 }
      hit[label].n++

      const details: Array<{ label: string; value: string }> = [
        { label: 'Status Risiko', value: label.toUpperCase() },
        { label: 'Kabupaten/Kota', value: highest.nama_kako },
        { label: 'Tahun Penilaian', value: highest.tahun || String(pieData.tahun) },
      ]

      if (diseaseOption === 'all') {
        const ringkasanPenyakit = list.map((x) => `${x.penyakit_nama}: ${x.status_label}`).join(' · ')
        details.push({ label: 'Rincian Penyakit', value: ringkasanPenyakit })
      } else {
        details.push({ label: 'Penyakit', value: highest.penyakit_nama })
        if (highest.timestamp_isi) {
          details.push({ label: 'Waktu Input', value: highest.timestamp_isi })
        }
      }

      items[code] = {
        color,
        title: `${highest.nama_kako} · Risiko ${label.toUpperCase()} (${diseaseOption === 'all' ? 'Emerging PIE' : highest.penyakit_nama})`,
        details,
      }
    }
  } else {
    const byProv: Record<string, PieRecord[]> = {}
    for (const r of filtered) {
      const pCode = String(r.kd_prop).padStart(2, '0')
      byProv[pCode] ||= []
      byProv[pCode].push(r)
    }

    for (const [pCode, list] of Object.entries(byProv)) {
      const kabMap: Record<string, PieRecord> = {}
      for (const r of list) {
        const kCode = r.kode_kemendagri
        if (!kabMap[kCode] || r.status_score > kabMap[kCode].status_score) {
          kabMap[kCode] = r
        }
      }

      const kabList = Object.values(kabMap)
      const countTinggi = kabList.filter((k) => k.status_label === 'Tinggi').length
      const countSedang = kabList.filter((k) => k.status_label === 'Sedang').length
      const countRendah = kabList.filter((k) => k.status_label === 'Rendah').length

      let provLabel: 'Tinggi' | 'Sedang' | 'Rendah' = 'Rendah'
      if (countTinggi > 0) provLabel = 'Tinggi'
      else if (countSedang > 0) provLabel = 'Sedang'

      const color = PIE_SKALA[provLabel]
      hit[provLabel] ||= { color, n: 0 }
      hit[provLabel].n++

      items[pCode] = {
        color,
        title: `Risiko ${provLabel.toUpperCase()} (${diseaseOption === 'all' ? 'Emerging PIE' : selectedDisease?.short || ''})`,
        details: [
          { label: 'Status Risiko Tertinggi', value: provLabel.toUpperCase() },
          { label: 'Kab/Kota Risiko Tinggi', value: `${countTinggi} kab/kota` },
          { label: 'Kab/Kota Risiko Sedang', value: `${countSedang} kab/kota` },
          { label: 'Kab/Kota Risiko Rendah', value: `${countRendah} kab/kota` },
          { label: 'Total Kab/Kota Terdata', value: `${kabList.length} kab/kota` },
        ],
      }
    }
  }

  const legend = PIE_URUTAN
    .filter((label) => (hit[label]?.n || 0) > 0)
    .map((label) => ({
      label: label.toUpperCase(),
      color: hit[label].color,
      n: hit[label].n,
    }))

  const diseaseTitle = selectedDisease ? selectedDisease.label : 'Penyakit Infeksi Emerging'
  return {
    id: `pie-${pieData.tahun}-${diseaseOption}-${level}`,
    level,
    prov: provKode,
    judul: `Peta Risiko PIE (${pieData.tahun}): ${diseaseTitle}`,
    sumber: `API Peta Risiko PIE Kemenkes (${pieData.tahun})`,
    items,
    legend,
    catatan: 'Skala risiko: TINGGI (merah), SEDANG (jingga), RENDAH (hijau). Berdasarkan data Peta Risiko PIE Kemenkes.',
  }
}
