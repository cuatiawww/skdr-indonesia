'use client'
// PR 033: halaman kunjungan — identitas, 13 formulir (status, skor, kesimpulan), rekap F12/F13, Kirim kunjungan, Hapus draf.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, CircleAlert, Eye, History, Loader2, Pencil, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import { ApiError } from '@/lib/pe-api'
import { useAuth } from '@/lib/skdr-auth'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { FORM_GROUPS, FORM_TITLES } from '@/lib/pengawasan-gizi/naskah'
import { MBG_API, MBG_HREF, mbgFetch, STATUS_CLS, STATUS_LABEL, type MbgKunjungan } from '@/lib/pengawasan-gizi/api'
import { KesBadge } from './MbgFields'
import { DeleteBody } from './MbgList'
import { EVENT_LABEL } from './MbgWizard'

const card = 'rounded-2xl border border-slate-200 bg-white shadow-xs'
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`

export default function MbgHub({ id, viewOnly }: { id: number; viewOnly: boolean }) {
  const router = useRouter()
  const { can } = useAuth()
  const [k, setK] = useState<MbgKunjungan | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(false)
  const load = useCallback(async () => {
    try { const j = await mbgFetch<{ data: MbgKunjungan }>(`${MBG_API}/${id}`); setK(j.data) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { load() }, [load])
  if (err) return <div className="w-full p-8 text-sm text-red-600">Gagal memuat kunjungan: {err}</div>
  if (!k) return <SkeletonDetail />

  const editable = !viewOnly && can('pe_input') && k.status === 'draf'
  const q = viewOnly || !editable ? '?mode=lihat' : ''
  const byNo = (n: number) => k.forms.find((f) => f.form_no === n)
  const terkirim = k.forms.filter((f) => f.status === 'dikirim').length
  const identOk = k.errors.length === 0
  const siap = identOk && terkirim === 13
  const d = k.data

  const kirim = async () => {
    if (!siap) { toast.error(!identOk ? 'Lengkapi identitas kunjungan dulu' : `Masih ada ${13 - terkirim} formulir yang belum dikirim`); return }
    if (!window.confirm(`Kirim kunjungan ${k.no_kunjungan}? Setelah dikirim seluruh formulir terkunci.`)) return
    setBusy(true)
    try {
      const j = await mbgFetch<{ data: MbgKunjungan }>(`${MBG_API}/${k.id}/kirim`, { method: 'POST' })
      setK(j.data); toast.success(`Kunjungan ${j.data.no_kunjungan} terkirim`)
    } catch (e) {
      if (e instanceof ApiError && e.body?.data) setK(e.body.data)
      toast.error(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  const hapus = async () => {
    setBusy(true)
    try { await mbgFetch(`${MBG_API}/${k.id}`, { method: 'DELETE' }); toast.success(`Draf ${k.no_kunjungan} dihapus`); router.push(MBG_HREF) }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setBusy(false); setDel(false) }
  }

  return (
    <div className="w-full space-y-5 bg-page px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
      {/* header: PR 067 - 2-grid (~70% judul & deskripsi, ~30% tombol aksi), tanpa eyebrow, tombol back di breadcrumb */}
      <header className="skdr-section-head grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center lg:gap-6" data-testid="page-header">
        <div className="min-w-0 lg:col-span-8">
          <h1 className="skdr-section-title">{d.nama_sppg || 'SPPG belum diisi'}</h1>
          <p className="skdr-section-desc"><span className="font-mono font-semibold text-slate-700">{k.no_kunjungan}</span>{d.tanggal ? ` · ${d.tanggal}` : ''} · <span className={badge(STATUS_CLS[k.status] || '')}>{STATUS_LABEL[k.status]}</span></p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2 text-xs lg:col-span-4 lg:justify-end">
            <button onClick={() => setDel(true)} disabled={busy} data-testid="mbg-hapus" className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Hapus draf</button>
            <button onClick={kirim} disabled={busy || !siap} data-testid="mbg-kirim-kunjungan" title={siap ? 'Kirim kunjungan' : 'Semua formulir harus dikirim dulu'}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-bold uppercase tracking-wider text-white hover:bg-primary-dark disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim Kunjungan
            </button>
          </div>
        )}
      </header>

      {k.status === 'dikirim' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">Kunjungan sudah dikirim{k.submitted_at ? ` pada ${k.submitted_at} WIB` : ''}. Semua formulir hanya dapat dilihat.</div>}
      {editable && !siap && <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />Isi dan kirim setiap formulir (urutan bebas). Formulir 12 dan 13 terisi otomatis dari kesimpulan formulir sumber. Kunjungan dapat dikirim setelah 13 formulir terkirim ({terkirim}/13).</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-9">
          <section className={`${card} p-4 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="skdr-section-title">Identitas kunjungan</h2>
              <Link href={`${MBG_HREF}/${k.id}/identitas${q}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{editable ? <><Pencil className="h-3 w-3" /> Ubah</> : <><Eye className="h-3 w-3" /> Lihat</>}</Link>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              {[['Nama TPG', d.nama_tpg], ['Puskesmas', d.unit_pelapor], ['Kab/Kota', k.kabkota], ['Provinsi', k.provinsi], ['Nama SPPG', d.nama_sppg], ['Nama Pengawas Gizi', d.nama_pengawas], ['Hari/Tanggal', d.tanggal]].map(([l, v]) => (
                <div key={l as string}><dt className="text-[11px] font-semibold text-slate-400">{l}</dt><dd className={v ? 'text-slate-800' : 'font-semibold text-red-600'}>{v || 'Belum diisi'}</dd></div>
              ))}
            </dl>
            {!identOk && <p className="mt-2 text-[11px] text-amber-700">{k.errors.length} isian identitas belum valid.</p>}
          </section>

          {FORM_GROUPS.map((g) => (
            <section key={g.title} className={`${card} p-4 sm:p-5`}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{g.title}</h2>
              <ul className="divide-y divide-slate-100">
                {g.forms.map((n) => {
                  const f = byNo(n)
                  const st = f?.status || 'baru'
                  const isRekap = n >= 12
                  return (
                    <li key={n}>
                      <Link href={`${MBG_HREF}/${k.id}/f${n}${q}`} data-testid={`mbg-form-${n}`} className="group flex flex-wrap items-center gap-3 py-2.5 hover:bg-slate-50/60 sm:flex-nowrap">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${st === 'dikirim' ? 'bg-emerald-500 text-white' : st === 'draf' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{st === 'dikirim' ? <CheckCircle2 className="h-4 w-4" /> : n}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800 group-hover:text-primary">Formulir {n}. {FORM_TITLES[n]?.short}</span>
                          <span className="block text-[11px] text-slate-400">{st === 'baru' ? (isRekap ? 'Terisi otomatis dari formulir sumber' : 'Belum diisi') : `${STATUS_LABEL[st]}${f?.updated_at ? ` · ${f.updated_at} WIB` : ''}${st === 'draf' && f?.error_count ? ` · ${f.error_count} isian belum valid` : ''}`}</span>
                        </span>
                        {f?.skor != null && <span className="text-xs tabular-nums text-slate-500">Skor {String(f.skor).replace('.', ',')}</span>}
                        <KesBadge v={f?.status === 'dikirim' ? f.kesimpulan : null} empty={f?.kesimpulan ? `${f.kesimpulan} (draf)` : '—'} />
                        <span className={badge(STATUS_CLS[st] || '')}>{STATUS_LABEL[st]}</span>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-5 xl:col-span-3">
          <div className={`${card} p-4 text-xs`}>
            <div className="mb-2 font-bold uppercase tracking-wider text-slate-500">Ringkasan</div>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2"><dt>Formulir terkirim</dt><dd className="font-semibold tabular-nums">{terkirim}/13</dd></div>
              <div className="flex items-center justify-between gap-2"><dt>Ketaatan Standar Gizi (F12)</dt><dd><KesBadge v={byNo(12)?.status === 'dikirim' ? byNo(12)?.kesimpulan : null} empty="—" /></dd></div>
              <div className="flex items-center justify-between gap-2"><dt>Daya Terima (F13)</dt><dd><KesBadge v={byNo(13)?.status === 'dikirim' ? byNo(13)?.kesimpulan : null} empty="—" /></dd></div>
              <div className="flex justify-between gap-2"><dt>Dibuat oleh</dt><dd className="text-right">{k.created_by_name || '—'}</dd></div>
            </dl>
          </div>
          {k.events.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><History className="h-4 w-4" /> Riwayat</div>
              <ul className="space-y-2 text-[11px] text-slate-600">
                {k.events.slice(0, 12).map((e, i) => <li key={i} className="border-l-2 border-slate-200 pl-2"><span className="font-mono text-slate-400">{e.at} WIB</span><br />{EVENT_LABEL[e.event] || e.event}{e.note ? ` · ${e.note}` : ''}{e.actor ? ` · ${e.actor}` : ''}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <Modal open={del} title="Hapus draf kunjungan" onClose={() => !busy && setDel(false)}>
        <DeleteBody no={k.no_kunjungan} deleting={busy} onCancel={() => setDel(false)} onConfirm={hapus} />
      </Modal>
    </div>
  )
}
