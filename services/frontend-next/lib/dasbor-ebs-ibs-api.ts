import { peFetch } from '@/lib/pe-api'

export type EpiWeekPoint = {
  year: number
  week: number
  start: string
  label: string
}

export type MapRegion = {
  key: string
  name: string
  geo: string
  lat: number | null
  lng: number | null
  laporan?: number
  dikirim?: number
  draf?: number
  kasus?: number
  kematian?: number
  klb?: number
  spesimen?: number
  agregat_laporan?: number
  agregat_kasus?: number
  agregat_kematian?: number
  agregat_lab?: number
  agregat_kunjungan?: number
  individu_pasien?: number
  individu_meninggal?: number
  unit_unik: number
}

export type MapPoint = {
  unit_nama: string
  jenis_unit: string | null
  province_name: string | null
  kabkota_name: string | null
  lat: number
  lng: number
  coord_source: string | null
  laporan?: number
  kasus?: number
  kematian?: number
  klb?: number
  last_date?: string | null
  agregat_laporan?: number
  agregat_kasus?: number
  agregat_kematian?: number
  individu_pasien?: number
  last_periode?: string | null
}

export type EbsDashData = {
  kpis: {
    total_laporan: number
    dikirim: number
    draf: number
    total_kasus: number
    total_kematian: number
    cfr_pct: number | null
    klb_ya: number
    klb_berlangsung: number
    klb_berakhir: number
    spesimen_ya: number
    lab_diperiksa: number
    lab_positif: number
    tatalaksana_ya: number
    w1_ya: number
    sk_klb_ya: number
    tgc_ya: number
    pfr_ya: number
    komrisk_ya: number
    koordinasi_ya: number
    unit_unik: number
    provinsi_unik: number
    kabkota_unik: number
    date_min: string | null
    date_max: string | null
  }
  weekly_trend: {
    year: number
    week: number
    week_start: string
    label: string
    laporan: number
    dikirim: number
    draf: number
    kasus: number
    kematian: number
    klb: number
  }[]
  by_disease: { penyakit: string; laporan: number; kasus: number; kematian: number; klb: number; terverifikasi: number }[]
  by_status_kejadian: { status_kejadian: string; laporan: number; kasus: number; kematian: number }[]
  by_sumber_informasi: { sumber: string; laporan: number; kasus: number }[]
  by_jenis_unit: { jenis_unit: string; laporan: number; kasus: number; unit_unik: number }[]
  by_lab_hasil: { hasil: string; laporan: number; diperiksa: number; positif: number }[]
  by_tatalaksana: { jenis: string; count: number }[]
  intervensi: { key: string; label: string; ya: number; tidak: number; kosong: number }[]
  age_sex_pyramid: { band: string; label: string; pria: number; wanita: number; total: number }[]
  heatmap: {
    weeks: EpiWeekPoint[]
    by_province: {
      id: number | null
      name: string
      values_laporan: number[]
      values_kasus: number[]
      total_laporan: number
      total_kasus: number
      total_kematian: number
    }[]
    by_disease: {
      name: string
      values_laporan: number[]
      values_kasus: number[]
      total_laporan: number
      total_kasus: number
      total_kematian: number
    }[]
  }
  map: {
    level: 'prov' | 'kab'
    parent: number | null
    regions: MapRegion[]
    points: MapPoint[]
  }
  recent_reports: {
    id: number
    no_laporan: string
    status: string
    tgl_laporan: string | null
    tgl_rumor: string | null
    penyakit_rumor: string | null
    penyakit_terverifikasi: string | null
    status_kejadian: string | null
    province_name: string | null
    kabkota_name: string | null
    unit_nama: string | null
    jenis_unit: string | null
    jml_kasus: number | null
    jml_kematian: number | null
    klb: string | null
    klb_status: string | null
    spesimen: string | null
  }[]
  filter_options: {
    provinces: { id: number; name: string }[]
    kabkota: { id: number; province_id: number; name: string }[]
    penyakit: string[]
    jenis_unit: string[]
    status_kejadian: string[]
    date_min: string | null
    date_max: string | null
  }
}

export type VitalStat = { count: number; avg: number | null; min: number | null; max: number | null }

export type IbsDashData = {
  kpis: {
    agregat: {
      total_laporan: number
      dikirim: number
      draf: number
      total_kasus: number
      total_kematian: number
      total_lab: number
      total_kunjungan: number
      cfr_pct: number | null
      proporsi_kunjungan_pct: number | null
      nihil_count: number
      unit_unik: number
      provinsi_unik: number
      kabkota_unik: number
    }
    individu: {
      total_laporan: number
      dikirim: number
      draf: number
      pria: number
      wanita: number
      meninggal: number
      dalam_perawatan: number
      sakit: number
      sehat: number
      dengan_vital: number
      dengan_soap: number
      unit_unik: number
      provinsi_unik: number
      kabkota_unik: number
    }
  }
  weekly_trend: {
    tahun: number
    minggu: number
    week_start: string
    label: string
    agregat_laporan: number
    agregat_kasus: number
    agregat_kematian: number
    agregat_lab: number
    agregat_kunjungan: number
    individu_pasien: number
    individu_meninggal: number
  }[]
  by_disease: {
    kode: string
    kode_sms: string
    nama: string
    agregat_kasus: number
    agregat_kematian: number
    agregat_lab: number
    agregat_laporan_terisi: number
    individu_pasien: number
    individu_meninggal: number
  }[]
  individu_demographics: {
    by_kelamin: { label: string; count: number }[]
    by_status_akhir: { label: string; count: number }[]
    by_age_group: { group: string; pria: number; wanita: number; total: number }[]
    by_pekerjaan: { label: string; count: number }[]
    by_status_imunisasi: { label: string; count: number }[]
    by_imt_kategori: { kategori: string; count: number }[]
    vital_summary: {
      tinggi: VitalStat
      berat: VitalStat
      imt: VitalStat
      suhu: VitalStat
      sistole: VitalStat
      diastole: VitalStat
    }
  }
  by_jenis_unit: { jenis_unit: string; agregat_laporan: number; agregat_kasus: number; individu_pasien: number }[]
  by_kelompok: { kelompok: string; laporan: number; kasus: number }[]
  top_units: {
    unit_nama: string
    jenis_unit: string | null
    province_name: string | null
    kabkota_name: string | null
    agregat_laporan: number
    agregat_kasus: number
    agregat_kunjungan: number
    individu_pasien: number
  }[]
  heatmap: {
    weeks: EpiWeekPoint[]
    by_province: {
      id: number | null
      name: string
      values_agregat_kasus: number[]
      values_agregat_laporan: number[]
      values_individu_pasien: number[]
      total_agregat_laporan: number
      total_agregat_kasus: number
      total_individu_pasien: number
    }[]
    by_disease: {
      kode: string
      kode_sms: string
      name: string
      values_agregat_kasus: number[]
      values_individu_pasien: number[]
      total_agregat_kasus: number
      total_individu_pasien: number
    }[]
  }
  map: {
    level: 'prov' | 'kab'
    parent: number | null
    regions: MapRegion[]
    points: MapPoint[]
  }
  recent_agregat: {
    id: number
    no_laporan: string
    status: string
    tahun: number | null
    minggu: number | null
    province_name: string | null
    kabkota_name: string | null
    unit_nama: string | null
    jenis_unit: string | null
    kelompok: string | null
    total_kasus: number
    total_kematian: number
    total_lab: number
    total_kunjungan: number
  }[]
  recent_individu: {
    id: number
    no_laporan: string
    status: string
    tahun: number | null
    minggu: number | null
    tgl_periksa: string | null
    penyakit_kode: string | null
    penyakit_label: string | null
    kelamin: string | null
    umur: string | null
    status_akhir: string | null
    diagnosa: string | null
    province_name: string | null
    kabkota_name: string | null
    unit_nama: string | null
  }[]
  filter_options: {
    years: number[]
    provinces: { id: number; name: string }[]
    kabkota: { id: number; province_id: number; name: string }[]
    diseases: { kode: string; kode_sms: string; nama: string }[]
    jenis_unit: string[]
  }
}

export function buildQs(params: Record<string, string | number | number[] | string[] | undefined | null>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','))
    } else {
      const s = String(v).trim()
      if (s && s !== 'all') sp.set(k, s)
    }
  }
  return sp.toString()
}

export async function fetchEbsDash(params: Record<string, string | number | number[] | string[] | undefined | null>) {
  const qs = buildQs(params)
  const j = await peFetch<{ data: EbsDashData }>(`/api/v1/dasbor/ebs-ibs/ebs${qs ? `?${qs}` : ''}`)
  return j.data
}

export async function fetchIbsDash(params: Record<string, string | number | number[] | string[] | undefined | null>) {
  const qs = buildQs(params)
  const j = await peFetch<{ data: IbsDashData }>(`/api/v1/dasbor/ebs-ibs/ibs${qs ? `?${qs}` : ''}`)
  return j.data
}

