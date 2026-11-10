import { peFetch } from '@/lib/pe-api'
import { buildQs, type EpiWeekPoint } from '@/lib/dasbor-ebs-ibs-api'

export type MbgMapRegion = {
  key: string
  name: string
  geo: string
  lat?: number | null
  lng?: number | null
  sppg_unik: number
  // Gizi
  kunjungan?: number
  dikirim?: number
  rekap12_baik?: number
  rekap12_belum_baik?: number
  rekap13_baik?: number
  rekap13_belum_baik?: number
  avg_skor?: number | null
  // Keracunan
  kejadian?: number
  kasus?: number
  meninggal?: number
  terpapar?: number
  lab_hasil?: number
  ditutup?: number
}

export type MbgMapPoint = {
  unit_nama?: string
  label?: string
  nama_sppg: string | null
  province_name: string | null
  kabkota_name: string | null
  lat: number
  lng: number
  coord_source: string | null
  last_date: string | null
  // Gizi
  kunjungan?: number
  rekap12_baik?: number
  rekap12_belum_baik?: number
  // Keracunan
  kejadian?: number
  kasus?: number
  meninggal?: number
  lab_hasil?: number
}

export type MbgFilterOptions = {
  provinces: { id: number; name: string }[]
  kabkota: { id: number; province_id: number; name: string }[]
  sppg: string[]
}

export type GiziDashData = {
  kpis: {
    total_kunjungan: number
    dikirim: number
    draf: number
    sppg_unik: number
    puskesmas_unik: number
    provinsi_unik: number
    kabkota_unik: number
    total_formulir_tersimpan: number
    total_formulir_dikirim: number
    rekap12_baik: number
    rekap12_belum_baik: number
    rekap13_baik: number
    rekap13_belum_baik: number
    avg_skor_sop: number | null
    wilayah_3t_ya: number
    alergi_ya: number
    date_min: string | null
    date_max: string | null
  }
  by_formulir: {
    form_no: number
    short: string
    title: string
    tersimpan: number
    dikirim: number
    draf: number
    sesuai: number
    tidak_sesuai: number
    avg_skor: number | null
  }[]
  f1_ketenagaan: {
    total: number
    pengawas_sesuai: number
    penjamah_b1_sesuai: number
    pelatihan_b2_sesuai: number
    avg_penjamah: number | null
  }
  f2_sop: {
    nama: string
    tersedia_sesuai: number | null
    tersedia_total: number | null
    sosialisasi_sesuai: number
    sosialisasi_total: number
  }[]
  weekly_trend: {
    year: number
    week: number
    week_start: string
    label: string
    kunjungan: number
    dikirim: number
    draf: number
    rekap12_baik: number
    rekap12_belum_baik: number
  }[]
  heatmap: {
    weeks: EpiWeekPoint[]
    by_province: {
      id: number
      name: string
      values_kunjungan: number[]
      values_belum_baik: number[]
      total_kunjungan: number
      rekap12_baik: number
      rekap12_belum_baik: number
    }[]
    by_form: {
      form_no: number
      name: string
      values_tersimpan: number[]
      values_tidak_sesuai: number[]
      total_tersimpan: number
      total_tidak_sesuai: number
    }[]
  }
  sppg_summary: {
    nama_sppg: string
    province_name: string | null
    kabkota_name: string | null
    puskesmas: string | null
    kunjungan: number
    last_tanggal: string | null
    last_rekap12: string | null
    last_rekap13: string | null
    avg_skor: number | null
  }[]
  map: {
    level: 'prov' | 'kab'
    parent: number | null
    regions: MbgMapRegion[]
    points: MbgMapPoint[]
  }
  recent_kunjungan: {
    id: number
    no_kunjungan: string
    status: string
    tanggal: string
    nama_sppg: string | null
    puskesmas: string | null
    province_name: string | null
    kabkota_name: string | null
    forms_saved: number
    forms_sent: number
    rekap12: string | null
    rekap13: string | null
    avg_skor: number | null
  }[]
  filter_options: MbgFilterOptions
}

export type KeracunanDashData = {
  kpis: {
    total_kejadian: number
    draf: number
    dilaporkan: number
    ditutup: number
    total_kasus: number
    total_meninggal: number
    total_terpapar: number
    attack_rate_pct: number | null
    cfr_pct: number | null
    avg_inkubasi_jam: number | null
    rawat_inap: number
    rawat_jalan: number
    sembuh: number
    total_sekolah_terdampak: number
    sppg_unik: number
    provinsi_unik: number
    kabkota_unik: number
    lab_belum: number
    lab_dikirim: number
    lab_hasil: number
    slhs_ya: number
    slhs_tidak: number
    ikl_memenuhi: number
    ikl_tidak_memenuhi: number
    date_min: string | null
    date_max: string | null
  }
  weekly_trend: {
    year: number
    week: number
    week_start: string
    label: string
    kejadian: number
    kasus: number
    meninggal: number
    terpapar: number
  }[]
  daily_updates: {
    tanggal: string
    kejadian: number
    kasus: number
    meninggal: number
    rawat_inap: number
    rawat_jalan: number
    sembuh: number
  }[]
  by_gejala: {
    nama: string
    kejadian: number
    jumlah_kasus: number
    pct_kasus: number | null
  }[]
  demografi: {
    pria: number
    wanita: number
    usia: { key: string; label: string; count: number }[]
    balita: number
    ibu_hamil: number
    ibu_menyusui: number
  }
  lingkungan_sop: {
    slhs: { ya: number; tidak: number; kosong: number }
    ikl: { memenuhi: number; tidak_memenuhi: number; kosong: number }
    sumber_air: { sumber: string; count: number }[]
    sop_gap: {
      nama: string
      ada: number
      tidak_ada: number
      dilakukan: number
      tidak_dilakukan: number
      gap_total: number
    }[]
    faktor_risiko: {
      key: string
      label: string
      ya: number
      tidak: number
      kosong: number
    }[]
    penjamah: {
      total: number
      tersertifikasi: number
      pct_tersertifikasi: number | null
    }
  }
  lab_sampel: {
    kategori: string
    total: number
    mikro_positif: number
    mikro_negatif: number
    kimia_positif: number
    kimia_negatif: number
    belum: number
  }[]
  sppg_incidents: {
    nama_sppg: string | null
    yayasan_sppg: string | null
    province_name: string | null
    kabkota_name: string | null
    kejadian: number
    kasus: number
    meninggal: number
    terpapar: number
    last_kejadian: string | null
    pengawasan_kunjungan: number
    pengawasan_rekap12: string | null
    pengawasan_rekap13: string | null
  }[]
  heatmap: {
    weeks: EpiWeekPoint[]
    by_province: {
      id: number
      name: string
      values_kejadian: number[]
      values_kasus: number[]
      total_kejadian: number
      total_kasus: number
      total_meninggal: number
    }[]
  }
  map: {
    level: 'prov' | 'kab'
    parent: number | null
    regions: MbgMapRegion[]
    points: MbgMapPoint[]
  }
  recent_incidents: {
    id: number
    no_laporan: string | null
    status: string
    lab_status: string
    tgl_kejadian: string | null
    nama_sppg: string | null
    yayasan_sppg: string | null
    province_name: string | null
    kabkota_name: string | null
    jumlah_kasus: number
    jumlah_meninggal: number
    jumlah_terpapar: number | null
    ar_pct: number | null
    cfr_pct: number | null
    sekolah_count: number
    ikl: string | null
    slhs: string | null
  }[]
  filter_options: MbgFilterOptions
}

export type MbgDashFilterParams = Record<string, string | number | number[] | string[] | undefined | null>

export async function fetchGiziDash(params: MbgDashFilterParams) {
  const qs = buildQs(params)
  const j = await peFetch<{ data: GiziDashData }>(`/api/v1/dasbor/mbg/pengawasan-gizi${qs ? `?${qs}` : ''}`)
  return j.data
}

export async function fetchKeracunanDash(params: MbgDashFilterParams) {
  const qs = buildQs(params)
  const j = await peFetch<{ data: KeracunanDashData }>(`/api/v1/dasbor/mbg/keracunan${qs ? `?${qs}` : ''}`)
  return j.data
}
