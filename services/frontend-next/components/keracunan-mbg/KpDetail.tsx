'use client'
// PR 034: ringkasan kejadian Keracunan Pangan MBG — alur status, attack rate/CFR, update kasus harian + riwayat, laboratorium,
// tautan Pengawasan Gizi SPPG yang sama, kelengkapan per langkah, tutup / buka kembali kejadian.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarPlus, Check, ClipboardCheck, Eye, FlaskConical, History, Loader2, Lock, LockOpen, Paperclip, Pencil, Send, Trash2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import { inputCls } from '@/components/master/MasterUi'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { useAuth } from '@/lib/skdr-auth'
import { isFilled, visibleFields } from '@/lib/laporan/engine'
import { KP_STEPS } from '@/lib/keracunan-mbg/def'
import { hasil, rows } from '@/lib/keracunan-mbg/rules'
import { EVENT_LABEL, KP_API, KP_HREF, kpFetch, lampiranUrl, STATUS_CLS, STATUS_FLOW, STATUS_LABEL, viewStatus, type KpRecord } from '@/lib/keracunan-mbg/api'
import { HasilPanel } from './KpFields'

const card = 'rounded-2xl border border-slate-200 bg-white shadow-xs'
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
const btn = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50'
const todayWib = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
const numIn = (s: string) => { const t = s.replace(/[^\d]/g, ''); return t === '' ? null : Number(t) }

export default function KpDetail({ id }: { id: number }) {
  const { can } = useAuth()
  const [rec, setRec] = useState<KpRecord | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tutup, setTutup] = useState(false)
  const load = useCallback(async () => {
    try { const j = await kpFetch<{ data: KpRecord }>(`${KP_API}/${id}`); setRec(j.data) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { load() }, [load])
  if (err) return <div className="w-full p-8 text-sm text-red-600">Gagal memuat laporan: {err}</div>
  if (!rec) return <SkeletonDetail />

  const d = rec.data
  const h = hasil(d)
  const vs = viewStatus(rec.status, rec.lab_status)
  const input = can('pe_input')
  const flowIdx = STATUS_FLOW.indexOf(vs as any)
  const act = async (path: string, body?: unknown, ok?: string) => {
    setBusy(true)
    try { const j = await kpFetch<{ data: KpRecord }>(`${KP_API}/${id}/${path}`, { method: 'POST', body }); setRec(j.data); if (ok) toast.success(ok); return true }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); return false } finally { setBusy(false) }
  }
  const pos = rows(d, 'sampel').filter((s) => s.mikro === 'Positif' || s.kimia === 'Positif')

  return (
    <div className="w-full space-y-5 bg-page px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
      <header className="skdr-section-head flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" data-testid="page-header">
        <div className="flex items-center gap-3">
          <Link href={KP_HREF} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Kembali ke daftar"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0">
            <div className="skdr-eyebrow">Program MBG · Keracunan Pangan · {rec.no_laporan}</div>
            <h1 className="skdr-section-title">{d.nama_sppg || 'Kejadian keracunan pangan'}</h1>
            <p className="skdr-section-desc">{[d.kecamatan_nama, rec.kabkota, rec.provinsi].filter(Boolean).join(', ') || 'Wilayah belum diisi'}{d.tgl_kejadian ? ` · kejadian ${String(d.tgl_kejadian).replace('T', ' ')} WIB` : ''} · <span className={badge(STATUS_CLS[vs] || '')}>{STATUS_LABEL[vs]}</span></p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${KP_HREF}/${id}/s1?mode=lihat`} className={`${btn} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><Eye className="h-3.5 w-3.5" /> Lihat isian</Link>
          {input && rec.status !== 'ditutup' && <Link href={`${KP_HREF}/${id}/s1`} className={`${btn} border border-primary/30 bg-white text-primary hover:bg-primary/5`} data-testid="kp-lengkapi"><Pencil className="h-3.5 w-3.5" /> {rec.status === 'draf' ? 'Lanjutkan pengisian' : 'Lengkapi laporan'}</Link>}
          {input && rec.status === 'draf' && <Link href={`${KP_HREF}/${id}/s6`} className={`${btn} bg-primary font-bold text-white hover:bg-primary-dark`}><Send className="h-3.5 w-3.5" /> Tinjau & kirim</Link>}
          {input && rec.status === 'dilaporkan' && <button onClick={() => setTutup(true)} disabled={busy} className={`${btn} bg-slate-800 font-bold text-white hover:bg-slate-900`} data-testid="kp-tutup"><Lock className="h-3.5 w-3.5" /> Tutup kejadian</button>}
          {input && rec.status === 'ditutup' && <button onClick={() => window.confirm('Buka kembali kejadian ini?') && act('buka', undefined, 'Kejadian dibuka kembali')} disabled={busy} className={`${btn} border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`} data-testid="kp-buka"><LockOpen className="h-3.5 w-3.5" /> Buka kembali</button>}
        </div>
      </header>

      {/* alur status */}
      <ol className={`${card} grid grid-cols-5 gap-1 p-3 text-center text-[10px] font-semibold sm:text-xs`} aria-label="Alur status">
        {STATUS_FLOW.map((s, i) => {
          const done = flowIdx >= 0 && (i < flowIdx || (s === 'ditutup' && vs === 'ditutup'))
          const cur = s === vs
          const skipped = vs === 'ditutup' && (s === 'menunggu_lab' || s === 'hasil_lab') && rec.lab_status === 'belum'
          return (
            <li key={s} className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 ${cur ? 'bg-primary/[0.06] text-primary' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${cur ? 'border-primary bg-primary text-white' : done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white'}`}>{done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}</span>
              <span className={skipped ? 'line-through opacity-60' : ''}>{STATUS_LABEL[s]}</span>
            </li>
          )
        })}
      </ol>
      {rec.status === 'ditutup' && d.tutup && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
          <b>Ditutup {d.tutup.tanggal}{d.tutup.oleh ? ` oleh ${d.tutup.oleh}` : ''}.</b> Kesimpulan: {d.tutup.kesimpulan}{d.tutup.penyebab ? ` · Penyebab: ${d.tutup.penyebab}` : ''}
        </div>
      )}
      {rec.status === 'draf' && rec.errors.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{rec.errors.length} isian belum valid — lengkapi sebelum dikirim.</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <section className={`${card} p-4 sm:p-5`}>
            <h2 className="mb-3 text-sm font-bold text-slate-800">Ringkasan epidemiologi</h2>
            <HasilPanel h={h} />
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
              {[['Rawat inap', d.rawat_inap], ['Rawat jalan', d.rawat_jalan], ['Sembuh', d.sembuh], ['Terpapar', h.terpapar]].map(([l, v]) => (
                <div key={l as string}><dt className="text-[11px] font-semibold text-slate-400">{l}</dt><dd className="text-base font-bold tabular-nums text-slate-800">{v ?? '—'}</dd></div>
              ))}
            </dl>
            {rows(d, 'gejala').length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-400">Gejala</p>
                <div className="space-y-1">
                  {[...rows(d, 'gejala')].sort((a, b) => (b.jumlah ?? 0) - (a.jumlah ?? 0)).map((g) => {
                    const pct = h.kasus ? Math.round(((g.jumlah ?? 0) / h.kasus) * 100) : 0
                    return (
                      <div key={g.nama} className="flex items-center gap-2 text-xs">
                        <span className="w-36 shrink-0 truncate text-slate-700">{g.nama}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, pct)}%` }} /></span>
                        <span className="w-16 text-right tabular-nums text-slate-500">{g.jumlah ?? '–'} · {pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          <Harian rec={rec} setRec={setRec} canEdit={input && rec.status === 'dilaporkan'} />

          <section className={`${card} p-4 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><FlaskConical className="h-4 w-4 text-violet-600" /> Laboratorium</h2>
              {input && rec.status !== 'ditutup' && <Link href={`${KP_HREF}/${id}/s5`} className="text-xs font-semibold text-primary hover:underline">{rec.lab_status === 'belum' ? 'Catat pengiriman sampel' : 'Perbarui hasil lab'}</Link>}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
              {[['Laboratorium', d.lab_nama], ['Diambil', d.lab_tgl_ambil], ['Dikirim', d.lab_tgl_kirim], ['Hasil keluar', d.lab_tgl_hasil]].map(([l, v]) => (
                <div key={l as string}><dt className="text-[11px] font-semibold text-slate-400">{l}</dt><dd className="text-slate-800">{v ? String(v).replace('T', ' ') : '—'}</dd></div>
              ))}
            </dl>
            {rows(d, 'sampel').length > 0 ? (
              <table className="mt-3 w-full text-xs">
                <thead className="text-left text-[11px] text-slate-400"><tr><th className="py-1">Sampel</th><th>Kategori</th><th>Mikrobiologi</th><th>Kimia</th></tr></thead>
                <tbody>{rows(d, 'sampel').map((s, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="py-1.5 text-slate-800">{s.sampel || '—'}{s.sumber && <span className="text-slate-400"> · {s.sumber}</span>}</td><td>{s.kategori || '—'}</td>
                    {['mikro', 'kimia'].map((k) => <td key={k}><span className={badge(s[k] === 'Positif' ? 'border-red-200 bg-red-50 text-red-700' : s[k] === 'Negatif' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500')}>{s[k] || 'Belum'}</span></td>)}</tr>
                ))}</tbody>
              </table>
            ) : <p className="mt-3 text-[11px] text-slate-400">Belum ada sampel dicatat.</p>}
            {pos.length > 0 && <p className="mt-2 text-xs font-semibold text-red-700">{pos.length} sampel positif: {pos.map((s) => s.sampel || s.kategori).join(', ')}</p>}
          </section>
        </div>

        <aside className="space-y-5 xl:col-span-4">
          <section className={`${card} p-4`}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Kelengkapan laporan</h2>
            <ul className="space-y-1">
              {KP_STEPS.map((st, i) => {
                const fields = visibleFields(st, d).filter((f) => !f.key.startsWith('_'))
                const isi = fields.filter((f) => isFilled(d[f.key])).length
                const n = rec.errors.filter((e) => e.step === st.id).length
                return (
                  <li key={st.id}>
                    <Link href={`${KP_HREF}/${id}/${st.id}${input && rec.status !== 'ditutup' ? '' : '?mode=lihat'}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${n ? 'bg-amber-500' : isi ? 'bg-emerald-500' : 'bg-slate-300'}`}>{n || i + 1}</span>
                      <span className="flex-1 text-slate-700">{st.title}</span>
                      <span className="tabular-nums text-[10px] text-slate-400">{isi}/{fields.length}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
          <section className={`${card} p-4 text-xs`}>
            <h2 className="mb-2 flex items-center gap-2 font-bold uppercase tracking-wider text-slate-500"><ClipboardCheck className="h-4 w-4" /> Pengawasan Gizi SPPG</h2>
            {rec.pengawasan ? (
              <div className="space-y-1">
                <Link href={`/pengawasan-gizi/${rec.pengawasan.id}?mode=lihat`} className="font-mono font-semibold text-primary hover:underline">{rec.pengawasan.no_kunjungan}</Link>
                <p className="text-slate-600">Kunjungan {rec.pengawasan.tanggal || '—'} · {rec.pengawasan.form_terkirim}/13 formulir</p>
                <p className="text-slate-600">Ketaatan: <b>{rec.pengawasan.rekap_ketaatan || '—'}</b> · Daya terima: <b>{rec.pengawasan.rekap_daya_terima || '—'}</b></p>
              </div>
            ) : <p className="text-slate-400">{d.nama_sppg ? 'Belum ada kunjungan pengawasan gizi untuk SPPG ini.' : 'Isi nama SPPG untuk menautkan hasil pengawasan gizi.'}</p>}
          </section>
          {rec.lampiran.length > 0 && (
            <section className={`${card} p-4 text-xs`}>
              <h2 className="mb-2 flex items-center gap-2 font-bold uppercase tracking-wider text-slate-500"><Paperclip className="h-4 w-4" /> Lampiran</h2>
              <ul className="space-y-1">{rec.lampiran.map((l) => <li key={l.id}><a href={lampiranUrl(id, l.id)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{l.nama_file}</a> <span className="text-[10px] text-slate-400">· {l.kategori === 'lab' ? 'hasil lab' : l.kategori === 'gejala' ? 'dokumentasi gejala' : 'umum'}</span></li>)}</ul>
            </section>
          )}
          <section className={`${card} p-4`}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><History className="h-4 w-4" /> Riwayat</h2>
            <ul className="space-y-2 text-[11px] text-slate-600">
              {rec.events.map((e, i) => <li key={i} className="border-l-2 border-slate-200 pl-2"><span className="font-mono text-slate-400">{e.at} WIB</span><br />{EVENT_LABEL[e.event] || e.event}{e.note ? ` · ${e.note}` : ''}{e.actor ? ` · ${e.actor}` : ''}</li>)}
            </ul>
          </section>
        </aside>
      </div>

      <Modal open={tutup} title="Tutup kejadian" onClose={() => !busy && setTutup(false)}>
        <TutupForm busy={busy} onCancel={() => setTutup(false)} labBelum={rec.lab_status !== 'hasil'} onSubmit={async (b) => { if (await act('tutup', b, 'Kejadian ditutup')) setTutup(false) }} />
      </Modal>
    </div>
  )
}

// ─── update kasus harian ─────────────────────────────────────────────────────
function Harian({ rec, setRec, canEdit }: { rec: KpRecord; setRec: (r: KpRecord) => void; canEdit: boolean }) {
  const last = rec.updates[0]
  const blank = () => ({ tanggal: todayWib(), kasus: last?.kasus ?? rec.data.jumlah_kasus ?? null, meninggal: last?.meninggal ?? rec.data.jumlah_meninggal ?? 0, rawat_inap: null as number | null, rawat_jalan: null as number | null, sembuh: null as number | null, catatan: '' })
  const [f, setF] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }))
  const submit = async () => {
    if (f.kasus === null || f.meninggal === null) { toast.error('Isi jumlah kasus dan meninggal (kumulatif)'); return }
    setSaving(true)
    try {
      const j = await kpFetch<{ data: KpRecord; warnings: string[] }>(`${KP_API}/${rec.id}/harian`, { method: 'POST', body: { ...f, catatan: f.catatan.trim() || null } })
      setRec(j.data); setOpen(false)
      toast.success(`Update ${f.tanggal} tersimpan`)
      j.warnings?.forEach((w) => toast.warning(w))
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setSaving(false) }
  }
  const remove = async (uid: number, tgl: string) => {
    if (!window.confirm(`Hapus update tanggal ${tgl}?`)) return
    try { const j = await kpFetch<{ data: KpRecord }>(`${KP_API}/${rec.id}/harian/${uid}`, { method: 'DELETE' }); setRec(j.data); toast.success('Update dihapus') } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }
  const series = [...rec.updates].reverse()
  const max = Math.max(1, ...series.map((u) => u.kasus))
  const num = (k: 'kasus' | 'meninggal' | 'rawat_inap' | 'rawat_jalan' | 'sembuh', l: string) => (
    <label className="text-[11px] font-semibold text-slate-500">{l}
      <input inputMode="numeric" className={`${inputCls} mt-0.5 text-center tabular-nums`} value={f[k] ?? ''} placeholder="—" onFocus={(e) => e.target.select()} onChange={(e) => set(k, numIn(e.target.value))} />
    </label>
  )
  return (
    <section className={`${card} p-4 sm:p-5`} data-testid="kp-harian">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><TrendingUp className="h-4 w-4 text-primary" /> Update kasus harian</h2>
        {canEdit && !open && <button onClick={() => { setF(blank()); setOpen(true) }} className={`${btn} bg-primary font-bold text-white hover:bg-primary-dark`} data-testid="kp-harian-add"><CalendarPlus className="h-3.5 w-3.5" /> Tambah update</button>}
      </div>
      {rec.status === 'draf' && <p className="text-[11px] text-slate-400">Update harian tersedia setelah laporan dikirim.</p>}
      {open && (
        <div className="mb-4 space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
          <p className="text-[11px] text-slate-500">Isi angka <b>kumulatif</b> sampai tanggal ini. Update terbaru otomatis menjadi total kejadian.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <label className="col-span-2 text-[11px] font-semibold text-slate-500">Tanggal
              <input type="date" max={todayWib()} min={String(rec.data.tgl_kejadian || '').slice(0, 10) || undefined} className={`${inputCls} mt-0.5`} value={f.tanggal} onChange={(e) => set('tanggal', e.target.value)} />
            </label>
            {num('kasus', 'Kasus *')}{num('meninggal', 'Meninggal *')}{num('rawat_inap', 'Rawat inap')}{num('rawat_jalan', 'Rawat jalan')}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {num('sembuh', 'Sembuh')}
            <label className="col-span-2 text-[11px] font-semibold text-slate-500 sm:col-span-5">Catatan
              <input className={`${inputCls} mt-0.5`} maxLength={500} value={f.catatan} placeholder="mis. 7 kasus baru dari SDN 2" onChange={(e) => set('catatan', e.target.value)} />
            </label>
          </div>
          {last && f.kasus !== null && f.kasus < last.kasus && <p className="text-[11px] font-medium text-amber-700">⚠ Kasus lebih kecil dari update sebelumnya ({last.kasus}) — angka harus kumulatif.</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} disabled={saving} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Batal</button>
            <button onClick={submit} disabled={saving} className={`${btn} bg-primary font-bold text-white hover:bg-primary-dark`} data-testid="kp-harian-simpan">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Simpan update</button>
          </div>
        </div>
      )}
      {series.length > 0 ? (
        <>
          <div className="mb-3 flex h-24 items-end gap-1 rounded-xl bg-slate-50 px-2 pt-2" aria-label="Grafik kasus kumulatif">
            {series.map((u) => (
              <div key={u.id} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={`${u.tanggal}: ${u.kasus} kasus, ${u.meninggal} meninggal`}>
                <span className="text-[9px] font-bold tabular-nums text-slate-600">{u.kasus}</span>
                <span className="w-full max-w-[28px] rounded-t bg-primary/70" style={{ height: `${Math.max(4, (u.kasus / max) * 64)}px` }} />
                <span className="truncate text-[9px] text-slate-400">{u.tanggal.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[11px] text-slate-400"><tr><th className="py-1">Tanggal</th><th className="text-right">Kasus</th><th className="text-right">Baru</th><th className="text-right">Meninggal</th><th className="text-right">Inap</th><th className="text-right">Jalan</th><th className="text-right">Sembuh</th><th className="pl-3">Catatan</th><th /></tr></thead>
              <tbody>
                {rec.updates.map((u, i) => {
                  const prev = rec.updates[i + 1]
                  const base = prev ? prev.kasus : rec.data._awal?.jumlah_kasus
                  const baru = typeof base === 'number' ? u.kasus - base : null
                  return (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="py-1.5 font-mono text-slate-700">{u.tanggal}</td>
                      <td className="text-right font-semibold tabular-nums">{u.kasus}</td>
                      <td className={`text-right tabular-nums ${baru && baru > 0 ? 'text-red-600' : 'text-slate-400'}`}>{baru === null ? '—' : baru > 0 ? `+${baru}` : baru}</td>
                      <td className={`text-right tabular-nums ${u.meninggal ? 'font-bold text-red-600' : ''}`}>{u.meninggal}</td>
                      <td className="text-right tabular-nums">{u.rawat_inap ?? '—'}</td><td className="text-right tabular-nums">{u.rawat_jalan ?? '—'}</td><td className="text-right tabular-nums">{u.sembuh ?? '—'}</td>
                      <td className="max-w-[220px] truncate pl-3 text-slate-500" title={u.catatan || ''}>{u.catatan || ''}<span className="block text-[10px] text-slate-400">{u.created_by_name}</span></td>
                      <td>{canEdit && <button onClick={() => remove(u.id, u.tanggal)} aria-label={`Hapus update ${u.tanggal}`} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : rec.status !== 'draf' && <p className="text-[11px] text-slate-400">Belum ada update. Angka laporan awal: {rec.data.jumlah_kasus ?? '—'} kasus, {rec.data.jumlah_meninggal ?? '—'} meninggal.</p>}
    </section>
  )
}

function TutupForm({ busy, labBelum, onCancel, onSubmit }: { busy: boolean; labBelum: boolean; onCancel: () => void; onSubmit: (b: { kesimpulan: string; penyebab: string | null }) => void }) {
  const [kes, setKes] = useState('')
  const [peny, setPeny] = useState('')
  const PRESET = ['KLB keracunan pangan — sumber pangan MBG terkonfirmasi lab', 'KLB keracunan pangan — sumber diduga pangan MBG (tanpa konfirmasi lab)', 'Bukan keracunan pangan MBG']
  return (
    <div className="space-y-3 text-xs">
      {labBelum && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">Hasil laboratorium belum dicatat. Kejadian tetap dapat ditutup.</p>}
      <div>
        <label htmlFor="kp-kes" className="mb-1 block font-semibold text-slate-600">Kesimpulan <span className="text-red-500">*</span></label>
        <div className="mb-1.5 flex flex-wrap gap-1">{PRESET.map((p) => <button key={p} type="button" onClick={() => setKes(p)} className={`rounded-full border px-2 py-0.5 text-[10px] ${kes === p ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-600 hover:border-primary/40'}`}>{p}</button>)}</div>
        <textarea id="kp-kes" rows={3} maxLength={500} className={inputCls} value={kes} onChange={(e) => setKes(e.target.value)} />
      </div>
      <div>
        <label htmlFor="kp-peny" className="mb-1 block font-semibold text-slate-600">Penyebab / faktor risiko</label>
        <textarea id="kp-peny" rows={2} maxLength={500} className={inputCls} value={peny} placeholder="mis. nasi disimpan suhu ruang > 4 jam" onChange={(e) => setPeny(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Batal</button>
        <button type="button" disabled={busy || !kes.trim()} onClick={() => onSubmit({ kesimpulan: kes.trim(), penyebab: peny.trim() || null })} className={`${btn} bg-slate-800 font-bold text-white hover:bg-slate-900`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Tutup kejadian</button>
      </div>
    </div>
  )
}
