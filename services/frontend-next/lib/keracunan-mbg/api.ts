// PR 034: API client Keracunan Pangan MBG (cookie sesi seperti Pengawasan Gizi / Form PE).
import { peFetch } from '@/lib/pe-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { notifyUnauthorized } from '@/lib/skdr-auth'
import type { Data, Issue } from '@/lib/laporan/engine'

export { peFetch as kpFetch }
export const KP_API = '/api/v1/keracunan-mbg'
export const KP_HREF = '/keracunan-mbg'

export type KpStatus = 'draf' | 'dilaporkan' | 'ditutup'
export type LabStatus = 'belum' | 'dikirim' | 'hasil'
export interface KpEvent { event: string; note: string | null; actor: string | null; at: string | null }
export interface KpUpdate {
  id: number; tanggal: string; kasus: number; meninggal: number; rawat_inap: number | null; rawat_jalan: number | null; sembuh: number | null
  catatan: string | null; created_by_name: string | null; updated_at: string | null
}
export interface KpLampiran { id: number; kategori: 'umum' | 'lab' | 'gejala'; judul: string | null; nama_file: string; tipe: string; ukuran: number; created_at?: string | null }
export interface KpPengawasan { id: number; no_kunjungan: string; tanggal: string | null; status: string; rekap_ketaatan: string | null; rekap_daya_terima: string | null; form_terkirim: number }
export interface KpRecord {
  id: number; no_laporan: string; status: KpStatus; lab_status: LabStatus; data: Data; errors: Issue[]; warnings: Issue[]
  created_by_name: string | null; created_at: string | null; updated_at: string | null; reported_at: string | null; closed_at: string | null
  provinsi: string | null; kabkota: string | null; events: KpEvent[]; updates: KpUpdate[]; lampiran: KpLampiran[]; pengawasan: KpPengawasan | null
}
export interface KpListRow {
  id: number; no_laporan: string; status: KpStatus; lab_status: LabStatus; tgl_kejadian: string | null; tgl_lapor: string | null; pelapor_nama: string | null
  provinsi: string | null; kabkota: string | null; kecamatan: string | null; desa: string | null; sekolah: string | null; nama_sppg: string | null
  yayasan_sppg: string | null; kasus: number | null; meninggal: number | null; terpapar: number | null; ar: number | null; error_count: number
  created_by_name: string | null; update_terakhir: string | null
}
export interface KpSummary { kejadian: number; kasus: number; meninggal: number; menunggu_lab: number; hasil_lab: number; draf: number; aktif: number; dilaporkan: number; ditutup: number }
export interface KpSppg { nama: string; yayasan: string | null; kode: string | null; provinsi_id: number | null; kabkota_id: number | null; jumlah: number; sumber: string[] }

/** status tampilan: Draf → Dilaporkan → Menunggu Lab → Hasil Lab → Ditutup (lab berasal dari isian Laboratorium) */
export function viewStatus(status: KpStatus, lab: LabStatus): string {
  if (status === 'dilaporkan' && lab === 'dikirim') return 'menunggu_lab'
  if (status === 'dilaporkan' && lab === 'hasil') return 'hasil_lab'
  return status
}
export const STATUS_LABEL: Record<string, string> = {
  baru: 'Belum dibuat', draf: 'Draf', dilaporkan: 'Dilaporkan', menunggu_lab: 'Menunggu Lab', hasil_lab: 'Hasil Lab', ditutup: 'Ditutup',
}
export const STATUS_CLS: Record<string, string> = {
  baru: 'border-slate-200 bg-white text-slate-500',
  draf: 'border-amber-200 bg-amber-50 text-amber-700',
  dilaporkan: 'border-sky-200 bg-sky-50 text-sky-700',
  menunggu_lab: 'border-violet-200 bg-violet-50 text-violet-700',
  hasil_lab: 'border-teal-200 bg-teal-50 text-teal-700',
  ditutup: 'border-slate-300 bg-slate-100 text-slate-600',
}
export const STATUS_FLOW = ['draf', 'dilaporkan', 'menunggu_lab', 'hasil_lab', 'ditutup'] as const
export const EVENT_LABEL: Record<string, string> = {
  dibuat: 'Laporan dibuat', dilaporkan: 'Laporan dikirim (Dilaporkan)', update_harian: 'Update kasus harian', update_dihapus: 'Update harian dihapus',
  lab_dikirim: 'Sampel dikirim ke laboratorium', lab_hasil: 'Hasil laboratorium dicatat', ditutup: 'Kejadian ditutup', dibuka: 'Kejadian dibuka kembali', dihapus: 'Draf dihapus',
}

export const lampiranUrl = (id: number, lid: number) => `${PUBLIC_BASE_PATH}${KP_API}/${id}/lampiran/${lid}`
export const exportUrl = (qs: URLSearchParams) => `${PUBLIC_BASE_PATH}${KP_API}/export${qs.toString() ? `?${qs}` : ''}`

export function uploadKpLampiran(id: number, kategori: KpLampiran['kategori'], file: File, onProgress: (pct: number) => void): Promise<KpLampiran> {
  return new Promise((resolve, reject) => {
    const judul = file.name.replace(/\.[^.]+$/, '')
    const qs = new URLSearchParams({ kategori, nama: file.name, judul })
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${PUBLIC_BASE_PATH}${KP_API}/${id}/lampiran?${qs}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      if (xhr.status === 401) notifyUnauthorized()
      let j: any = {}
      try { j = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && j.success !== false) resolve(j.data)
      else reject(new Error(j.error || `HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Gagal mengunggah (koneksi terputus)'))
    xhr.send(file)
  })
}
