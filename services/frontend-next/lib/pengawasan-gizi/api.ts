// PR 033: API client Pengawasan Gizi MBG (cookie sesi seperti Form PE / Laporan EBS-IBS).
import { peFetch } from '@/lib/pe-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { notifyUnauthorized } from '@/lib/skdr-auth'
import type { Data, Issue } from '@/lib/laporan/engine'

export { peFetch as mbgFetch }
export const MBG_API = '/api/v1/pengawasan-gizi'
export const MBG_HREF = '/pengawasan-gizi'

export interface MbgEvent { event: string; note: string | null; actor: string | null; at: string | null }
export interface MbgFormSummary {
  form_no: number; status: 'draf' | 'dikirim'; error_count: number; skor: number | null; kesimpulan: string | null
  hasil: Record<string, any> | null; updated_at: string | null; submitted_at: string | null
}
export interface MbgKunjungan {
  id: number; no_kunjungan: string; status: 'draf' | 'dikirim'; data: Data; errors: Issue[]
  created_by_name: string | null; created_at: string | null; updated_at: string | null; submitted_at: string | null
  provinsi: string | null; kabkota: string | null; events: MbgEvent[]; forms: MbgFormSummary[]
}
export interface MbgForm {
  id: number | null; form_no: number; status: 'baru' | 'draf' | 'dikirim'; data: Data; errors: Issue[]; warnings: Issue[]
  skor: number | null; kesimpulan: string | null; schema_version: number; created_by_name: string | null; updated_at: string | null; submitted_at: string | null
}
export interface MbgLampiran { id: number; form_no: number; item_key: string; judul: string | null; nama_file: string; tipe: string; ukuran: number; created_at?: string | null }
export interface MbgFormBundle { kunjungan: MbgKunjungan; form: MbgForm; lampiran: MbgLampiran[] }
export interface MbgListRow {
  id: number; no_kunjungan: string; status: 'draf' | 'dikirim'; nama_sppg: string | null; nama_pengawas: string | null; nama_tpg: string | null
  puskesmas: string | null; kabkota: string | null; tanggal: string | null; error_count: number; created_by_name: string | null; updated_at: string | null
  form_terkirim: number; form_draf: number; rekap_ketaatan: string | null; rekap_daya_terima: string | null; aspek_sesuai: number; aspek_dinilai: number
}

export const STATUS_LABEL: Record<string, string> = { baru: 'Belum diisi', draf: 'Draf', dikirim: 'Terkirim' }
export const STATUS_CLS: Record<string, string> = {
  baru: 'border-slate-200 bg-white text-slate-500',
  draf: 'border-amber-200 bg-amber-50 text-amber-700',
  dikirim: 'border-emerald-200/60 bg-emerald-50 text-emerald-700',
}
export const KES_CLS = (k: string | null | undefined) =>
  k === 'Sesuai' || k === 'BAIK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : k ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-500'

export const lampiranUrl = (id: number, lid: number) => `${PUBLIC_BASE_PATH}${MBG_API}/${id}/lampiran/${lid}`

export function uploadMbgLampiran(id: number, form: number, item: string, file: File, onProgress: (pct: number) => void): Promise<MbgLampiran> {
  return new Promise((resolve, reject) => {
    const judul = file.name.replace(/\.[^.]+$/, '')
    const qs = new URLSearchParams({ form: String(form), item, nama: file.name, judul })
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${PUBLIC_BASE_PATH}${MBG_API}/${id}/lampiran?${qs}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      if (xhr.status === 401) notifyUnauthorized()
      let j: any = {}
      try { j = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && j.success !== false) resolve({ ...j.data, form_no: form })
      else reject(new Error(j.error || `HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Gagal mengunggah (koneksi terputus)'))
    xhr.send(file)
  })
}
