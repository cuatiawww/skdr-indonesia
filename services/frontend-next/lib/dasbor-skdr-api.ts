// PR 057: API client and aggregation engine for Dasbor SKDR Terpadu
import { peFetch } from '@/lib/pe-api'
import type { SkdrFilter } from '@/lib/dasbor-skdr-filter'

export interface MasterDiseaseItem {
  code: string
  name: string
  kode_sms?: string
  category?: string
}

export interface SkdrKpiData {
  totalIbs: number
  totalEbs: number
  totalMeninggal: number
  cfr: number
  cfrCiLower: number
  cfrCiUpper: number
  kelengkapanPct: number
  ketepatanPct: number
  alertVerifikasiPct: number
  totalAlerts: number
  verifiedAlerts: number
  unverifiedAlerts: number
  discardedAlerts: number
}

export interface TrenWeekPoint {
  minggu: number
  label: string
  kasus: number
  kasusLalu: number
  threshold: number
  isAlert: boolean
  // Copernicus ERA5 climate context overlay
  suhu: number
  hujan: number
  kelembapan: number
  // Optional multi-region comparison values
  region1?: number
  region2?: number
  region3?: number
}

export interface AgeGenderGroup {
  group: string
  pria: number
  wanita: number
  total: number
}

export interface UnitPelaporStat {
  tipe: string
  label: string
  jumlah: number
  pct: number
  color: string
}

export interface WilayahRankingItem {
  id: number | string
  nama: string
  provinsi?: string
  kasus: number
  meninggal: number
  attackRate: number // per 100,000 penduduk
  trend: 'naik' | 'turun' | 'stabil'
}

export interface Who717Metrics {
  t1Target: number // Target <= 7 hari deteksi (%)
  t1Hari: number // Rata-rata hari
  t2Target: number // Target <= 1 hari notifikasi (%)
  t2Hari: number // Rata-rata hari
  t3Target: number // Target <= 7 hari respon (%)
  t3Hari: number // Rata-rata hari
  overall717: number // Capaian komposit (%)
}

export interface SignalFunnelItem {
  stage: string
  label: string
  count: number
  pct: number
}

export interface EarsAnomalyItem {
  id: string
  wilayah: string
  penyakit: string
  minggu: number
  kasus: number
  baseline: number
  cScore: number
  status: 'ALERT' | 'WASPADA' | 'NORMAL'
  tindakan: string
}

export interface HotspotIspaPoint {
  minggu: number
  label: string
  hotspotCount: number
  ispaCases: number
  pm25: number
  aqiLevel: 'Baik' | 'Sedang' | 'Tidak Sehat'
}

export interface IhrCapacityPoint {
  indikator: string
  skor: number // 1 - 5
  standarWho: number // 4
}

// Master Diseases 36 Indicators
export const MASTER_36_DISEASES: MasterDiseaseItem[] = [
  { code: '01AWD', kode_sms: 'A', name: 'Diare Akut', category: 'Pencernaan' },
  { code: '12MAL', kode_sms: 'B', name: 'Malaria Konfirmasi', category: 'Vektor' },
  { code: '16SDF', kode_sms: 'C', name: 'Suspek Dengue / DBD', category: 'Vektor' },
  { code: '04ARI', kode_sms: 'D', name: 'Pneumonia', category: 'Saluran Napas' },
  { code: '05BDR', kode_sms: 'E', name: 'Diare Berdarah / Disentri', category: 'Pencernaan' },
  { code: '21STF', kode_sms: 'F', name: 'Suspek Demam Tifoid', category: 'Pencernaan' },
  { code: '02JAD', kode_sms: 'G', name: 'Sindrom Jaundice Akut', category: 'Hepatitis' },
  { code: '25CHK', kode_sms: 'H', name: 'Suspek Chikungunya', category: 'Vektor' },
  { code: '11HAF', kode_sms: 'J', name: 'Suspek Flu Burung pada Manusia', category: 'Zoonosis' },
  { code: '18MEA', kode_sms: 'K', name: 'Suspek Campak', category: 'PD3I' },
  { code: '07DPR', kode_sms: 'L', name: 'Kasus Observasi Difteri', category: 'PD3I' },
  { code: '13PTS', kode_sms: 'M', name: 'Suspek Pertusis', category: 'PD3I' },
  { code: '03AFP', kode_sms: 'N', name: 'Acute Flaccid Paralysis (AFP)', category: 'PD3I' },
  { code: '08DBT', kode_sms: 'P', name: 'Gigitan Hewan Penular Rabies (GHPR)', category: 'Zoonosis' },
  { code: '14ATX', kode_sms: 'Q', name: 'Suspek Antraks', category: 'Zoonosis' },
  { code: '26LPT', kode_sms: 'R', name: 'Suspek Leptospirosis', category: 'Zoonosis' },
  { code: '15SCR', kode_sms: 'S', name: 'Suspek Kolera', category: 'Pencernaan' },
  { code: '19MEN', kode_sms: 'U', name: 'Suspek Meningitis / Ensefalitis', category: 'Saraf' },
  { code: '23STN', kode_sms: 'V', name: 'Suspek Tetanus Neonatorum', category: 'PD3I' },
  { code: '20STT', kode_sms: 'W', name: 'Suspek Tetanus', category: 'PD3I' },
  { code: '24ILI', kode_sms: 'Y', name: 'ILI (Penyakit Serupa Influenza)', category: 'Saluran Napas' },
  { code: '27HFMD', kode_sms: 'Z', name: 'Suspek HFMD (Flu Singapura)', category: 'Anak' },
  { code: 'ISPA', kode_sms: 'AA', name: 'Infeksi Saluran Pernapasan Akut (ISPA)', category: 'Saluran Napas' },
  { code: '19COV', kode_sms: 'AC', name: 'COVID-19 Konfirmasi', category: 'Saluran Napas' },
  { code: 'POLIO', kode_sms: 'PL', name: 'Polio', category: 'PD3I' },
  { code: 'HEPATITIS_A', kode_sms: 'HA', name: 'Hepatitis A', category: 'Pencernaan' },
  { code: 'MPOX', kode_sms: 'MP', name: 'Cacar Monyet (Mpox)', category: 'Zoonosis' },
  { code: 'KONJUNGTIVITIS', kode_sms: 'KJ', name: 'Konjungtivitis', category: 'Mata' },
  { code: 'KERACUNAN_PANGAN', kode_sms: 'KP', name: 'Keracunan Pangan', category: 'Lingkungan' },
  { code: 'ZIKA', kode_sms: 'ZK', name: 'Virus Zika', category: 'Vektor' },
  { code: 'JE', kode_sms: 'JE', name: 'Japanese Encephalitis', category: 'Vektor' },
  { code: 'FILARIASIS', kode_sms: 'FL', name: 'Filariasis (Kaki Gajah)', category: 'Vektor' },
  { code: 'KUSTA', kode_sms: 'KS', name: 'Kusta', category: 'Kulit' },
  { code: 'FRAMBUSIA', kode_sms: 'FR', name: 'Frambusia', category: 'Kulit' },
  { code: 'RABIES_KLINIS', kode_sms: 'RB', name: 'Rabies Klinis (Ensefalomielitis)', category: 'Zoonosis' },
  { code: 'TBC', kode_sms: 'TB', name: 'Tuberkulosis (TBC)', category: 'Saluran Napas' },
]

export async function fetchMasterDiseases(): Promise<MasterDiseaseItem[]> {
  try {
    const res = await peFetch<{ data: any[] }>('/api/v1/master/diseases').catch(() => null)
    if (res?.data?.length) {
      return res.data.map((d) => ({
        code: d.code,
        name: d.name,
        category: d.category || 'Lainnya',
      }))
    }
  } catch {}
  return MASTER_36_DISEASES
}
