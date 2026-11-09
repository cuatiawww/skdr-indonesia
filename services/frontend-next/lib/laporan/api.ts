// PR 030: API client + reference-data hooks for the EBS/IBS wizards (session cookie auth like the PE form).
import { useCallback, useRef, useState } from 'react'
import { peFetch } from '@/lib/pe-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { notifyUnauthorized } from '@/lib/skdr-auth'
import type { SelectOption } from '@/components/ui/SearchSelect'
import type { Data, Issue, Jenis } from './engine'

export { peFetch as lapFetch }

export interface Lampiran { id: number; judul: string | null; nama_file: string; tipe: string; ukuran: number; created_at?: string | null }
export interface LapRecord {
  id: number; no_laporan: string; status: 'draf' | 'dikirim'; data: Data; errors: Issue[]; warnings: Issue[]
  created_by_name: string | null; created_at: string | null; updated_at: string | null; submitted_at: string | null
  events: { event: string; note: string | null; actor: string | null; at: string | null }[]
  lampiran: Lampiran[]
}

export const STATUS_LABEL: Record<string, string> = { draf: 'Draf', dikirim: 'Terkirim' }
export const STATUS_CLS: Record<string, string> = {
  draf: 'border-slate-200 bg-slate-50 text-slate-600',
  dikirim: 'border-emerald-200/60 bg-emerald-50 text-emerald-700',
}

export const lampiranUrl = (jenis: Jenis, id: number, lid: number) => `${PUBLIC_BASE_PATH}/api/v1/laporan/${jenis}/${id}/lampiran/${lid}`

/** upload one file (raw body) with progress */
export function uploadLampiran(id: number, file: File, onProgress: (pct: number) => void): Promise<Lampiran> {
  return new Promise((resolve, reject) => {
    const judul = file.name.replace(/\.[^.]+$/, '')
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${PUBLIC_BASE_PATH}/api/v1/laporan/ebs/${id}/lampiran?nama=${encodeURIComponent(file.name)}&judul=${encodeURIComponent(judul)}`)
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

export interface KabOpt extends SelectOption { province_id: number }
export interface UnitOpt extends SelectOption { code: string | null }

/** provinces / kab-kota / kecamatan / unit options with per-key caches and loading flags */
export function useGeo() {
  const [provinces, setProvinces] = useState<SelectOption[] | null>(null)
  const [kab, setKab] = useState<Record<string, KabOpt[]>>({})
  const [kec, setKec] = useState<Record<string, SelectOption[]>>({})
  const [unit, setUnit] = useState<Record<string, UnitOpt[]>>({})
  const inflight = useRef(new Set<string>())
  const done = useRef(new Set<string>())
  const [, bump] = useState(0)
  const once = useCallback(async (key: string, fn: () => Promise<void>) => {
    if (inflight.current.has(key) || done.current.has(key)) return
    inflight.current.add(key); bump((x) => x + 1)
    try { await fn(); done.current.add(key) } catch { /* retried on next open */ } finally { inflight.current.delete(key); bump((x) => x + 1) }
  }, [])
  const loading = (key: string) => inflight.current.has(key)
  const loadProvinces = useCallback(() => once('prov', async () => {
    const j = await peFetch<{ data: { id: number; name: string }[] }>('/api/v1/master/provinces')
    setProvinces(j.data.map((p) => ({ value: String(p.id), label: p.name })))
  }), [once])
  const loadKab = useCallback((pid: string) => once(`kab:${pid}`, async () => {
    const j = await peFetch<{ data: { id: number; name: string; province_id: number; province_name: string }[] }>(`/api/v1/master/kabkota${pid !== 'all' ? `?province_id=${pid}` : ''}`)
    setKab((m) => ({ ...m, [pid]: j.data.map((k) => ({ value: String(k.id), label: k.name, hint: pid === 'all' ? k.province_name : undefined, province_id: k.province_id })) }))
  }), [once])
  const loadKec = useCallback((kid: string) => once(`kec:${kid}`, async () => {
    const j = await peFetch<{ data: { value: string; label: string }[] }>(`/api/v1/laporan-ref/kecamatan?kabkota_id=${kid}`)
    setKec((m) => ({ ...m, [kid]: j.data.map((k) => ({ value: k.value, label: k.label, hint: `Kode ${k.value}` })) }))
  }), [once])
  const unitKey = (jenis: string, kid: string, pid: string, kecCode: string) => `${jenis}|${kid}|${pid}|${kecCode}`
  const loadUnit = useCallback((jenis: string, kid: string, pid: string, kecCode: string) => {
    const k = unitKey(jenis, kid, pid, kecCode)
    return once(`unit:${k}`, async () => {
      const qs = new URLSearchParams({ jenis })
      if (kid) qs.set('kabkota_id', kid)
      if (pid) qs.set('province_id', pid)
      if (kecCode) qs.set('kecamatan', kecCode)
      const j = await peFetch<{ data: { value: string; label: string; hint?: string }[] }>(`/api/v1/laporan-ref/unit?${qs}`)
      const seen = new Set<string>()
      const list: UnitOpt[] = []
      j.data.forEach((u) => { if (!seen.has(u.label)) { seen.add(u.label); list.push({ value: u.label, label: u.label, hint: u.hint, code: u.value || null }) } })
      setUnit((m) => ({ ...m, [k]: list }))
    })
  }, [once])
  return { provinces, kab, kec, unit, loading, loadProvinces, loadKab, loadKec, loadUnit, unitKey }
}
export type Geo = ReturnType<typeof useGeo>
