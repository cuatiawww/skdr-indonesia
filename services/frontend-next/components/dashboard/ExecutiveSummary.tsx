'use client'
// PR 010: executive summary (sheet "Spesifikasi Dashboard Executive" bagian 1–2 + cakupan + status PE).
// All indicator definitions come from app_settings.dashboard_executive via /api/v1/dashboard/executive.
// EBS alerts and individual reports are always labelled by source and never summed.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, FileCheck2, Info, MapPinned, ShieldAlert } from 'lucide-react'
import { peFetch } from '@/lib/pe-api'

type Rate = { num: number; den: number; pct: number | null; as_fraction: boolean; ci_low: number | null; ci_high: number | null }
type EbsSub = { code: string; label: string; alerts: number; verified: number; discarded: number; verified_rate: Rate; cases: number; deaths: number | null; notification: Rate; notification_missing: number }
type Card = {
  code: string; label: string; color: string; pe_form: string; link?: string; ebs: EbsSub[]
  individual: { total: number; by_status: Record<string, number>; unclassified: number; deaths: number; split?: { label: string; codes: string[] }[]; status_defs?: { code: string; label: string }[] }
}
type CfrRow = { label: string; star: boolean; known: number; deaths: number; unknown: number; cfr?: Rate }
type Indicator = { no: string; name: string; status: string; note: string }
type Exec = {
  filters: { scope: string; disease: string | null; source: string | null; start_date: string | null; end_date: string | null }
  header: { individual_reports: number | null; ebs_alerts_zoonosis: number | null; ebs_alerts_all: number | null; form_reports: number | null }
  no_group_for_disease: boolean
  cards: Card[]
  cfr: { groups: { code: string; label: string; color: string; rows: CfrRow[] }[]; star_deaths: { label: string; deaths: number }[] }
  pe_status: { code: string; label: string; pe_form: string; by_status: Record<string, number> }[]
  nik: Rate
  coverage: { provinces: Rate; kabkota: Rate }
  config: { indicators: Indicator[]; status_labels: Record<string, string>; texts: Record<string, string>; pe_count_statuses: string[] }
}

const nf = new Intl.NumberFormat('id-ID')
const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : nf.format(v))
const pct1 = (v: number) => v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dmy = (s: string | null) => (s ? s.split('-').reverse().join('/') : '—')
/** Sheet rule 2: denominator < 10 -> fraction, not percent. */
export function rateText(r?: Rate | null) {
  if (!r || r.den === 0) return '—'
  return r.as_fraction ? `${r.num}/${r.den}` : `${pct1(r.pct ?? 0)}%`
}
const ciText = (r?: Rate | null) => (!r || r.den === 0 || r.ci_low === null || r.ci_high === null ? '—' : `${pct1(r.ci_low)}–${pct1(r.ci_high)}%`)

const PE_STATUSES = ['draf', 'dikirim', 'dikembalikan', 'terverifikasi', 'final']
const STATUS_TONE: Record<string, string> = {
  draf: 'bg-slate-100 text-slate-600', dikirim: 'bg-blue-50 text-[#0060A9]', dikembalikan: 'bg-amber-50 text-amber-700',
  terverifikasi: 'bg-emerald-50 text-emerald-700', final: 'bg-teal-50 text-teal-800',
}
const IND_TONE: Record<string, string> = { tersedia: 'bg-emerald-50 text-emerald-700', sebagian: 'bg-amber-50 text-amber-700', tertunda: 'bg-slate-100 text-slate-600' }

function Shell({ children, color, className = '' }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <article className={`relative overflow-hidden border border-slate-200 bg-white p-4 shadow-sm ${className}`} style={{ borderRadius: '17px 17px 22px 17px' }}>
      {color ? <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} /> : null}
      {children}
    </article>
  )
}

export default function ExecutiveSummary({ query }: { query: Record<string, string | number | undefined | null> }) {
  const [d, setD] = useState<Exec | null>(null)
  const [err, setErr] = useState('')
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)])).toString()
  useEffect(() => {
    let alive = true
    setErr('')
    peFetch<{ data: Exec }>(`/api/v1/dashboard/executive?${qs}`).then((j) => alive && setD(j.data)).catch((e) => alive && setErr(e.message || 'Gagal memuat ringkasan'))
    return () => { alive = false }
  }, [qs])

  if (err) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">Ringkasan eksekutif gagal dimuat: {err}</div>
  if (!d) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-[#0060A9]">Memuat ringkasan eksekutif…</div>

  const h = d.header
  const parts = [
    h.individual_reports !== null ? `${n(h.individual_reports)} laporan individu (Form PE)` : null,
    h.ebs_alerts_zoonosis !== null ? `${n(h.ebs_alerts_zoonosis)} alert EBS zoonosis` : null,
    h.form_reports !== null ? `${n(h.form_reports)} laporan kasus (formulir)` : null,
  ].filter(Boolean)
  const t = d.config.texts || {}
  const star = d.cfr.star_deaths.reduce((s, x) => s + x.deaths, 0)
  const cardsWithNotif = d.cards.flatMap((c) => c.ebs.map((s) => ({ ...s, group: c.label, color: c.color })))

  return (
    <section className="w-full space-y-4" aria-label="Ringkasan eksekutif zoonosis">
      {/* No. 9 — keterangan cakupan */}
      <p className="rounded-xl border border-[#cfe0f1] bg-white px-4 py-2.5 text-sm text-slate-700">
        Menampilkan {parts.join(' dan ')} · {dmy(d.filters.start_date)} – {dmy(d.filters.end_date)} · {d.filters.scope} · {d.filters.disease || 'Semua penyakit'}
        {h.ebs_alerts_all !== null ? <span className="text-slate-500"> (seluruh alert EBS semua penyakit: {n(h.ebs_alerts_all)})</span> : null}
      </p>

      {d.no_group_for_disease ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Penyakit terpilih bukan bagian dashboard eksekutif zoonosis (GHPR/Rabies, Avian Influenza, Antraks, Leptospirosis).</div>
      ) : null}

      {/* No. 12–20 — ringkasan per penyakit */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {d.cards.map((c) => {
          const ind = c.individual
          const split = ind.split
          return (
            <Shell key={c.code} color={c.color}>
              <div className="flex items-center justify-between">
                <span className="rounded px-2 py-0.5 text-xs font-black uppercase tracking-wide text-white" style={{ background: c.color }}>{c.label}</span>
              </div>
              <div className="mt-3 border-l-2 pl-3" style={{ borderColor: c.color }}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Alert EBS*</div>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                  {c.ebs.map((s) => (
                    <div key={s.code}>
                      <div className="text-2xl font-black text-slate-900">{n(s.alerts)}</div>
                      {c.ebs.length > 1 ? <div className="text-[11px] font-semibold text-slate-600">alert {s.label}</div> : null}
                      <div className="text-[11px] text-slate-600">{n(s.verified)} terverifikasi ({rateText(s.verified_rate)}) · {n(s.cases)} kasus</div>
                      {s.deaths !== null ? <div className="text-[11px] font-semibold text-red-600">{n(s.deaths)} kematian</div> : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Laporan individu*</div>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="flex gap-4">
                    {split ? split.map((sp) => (
                      <div key={sp.label}>
                        <div className="text-2xl font-black text-slate-900">{n(sp.codes.reduce((s, k) => s + (ind.by_status[k] ?? 0), 0))}</div>
                        <div className="text-[11px] font-semibold text-slate-600">{sp.label}</div>
                      </div>
                    )) : <div className="text-2xl font-black text-slate-900">{n(ind.total)}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-red-600">{n(ind.deaths)}</div>
                    <div className="text-[11px] text-red-600">kematian</div>
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-slate-600">
                  {(ind.status_defs || []).map((s) => `${n(ind.by_status[s.code] ?? 0)} ${s.label}`).join(' · ')}
                  {ind.unclassified ? ` · ${n(ind.unclassified)} lainnya` : ''}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Dashboard penyakit belum tersedia</span>
                <Link href={c.link || `/pe/${c.pe_form}`} className="font-bold text-[#0060A9] hover:underline">Daftar Form PE →</Link>
              </div>
            </Shell>
          )
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{t.footnote} {t.individual_def} {t.alert_def}</p>

      {/* No. 21–35 — CFR */}
      {d.cfr.groups.length ? (
        <Shell>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900"><ShieldAlert className="h-4 w-4 text-red-600" />Case Fatality Rate (CFR)</h3>
          {star > 0 ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <b>Cek data:</b> ada {n(star)} kematian pada laporan yang belum konfirmasi: {d.cfr.star_deaths.map((x) => `${x.label.replace('*', '')} ${n(x.deaths)}`).join(' · ')}. Lihat baris bertanda *.
            </div>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="py-2">Status laporan</th><th>Akhir diketahui</th><th>Meninggal</th><th>CFR</th><th>95% CI (Wilson)</th><th>Akhir belum diketahui</th></tr>
              </thead>
              <tbody>
                {d.cfr.groups.map((g) => [
                  <tr key={g.code} className="bg-slate-100"><td colSpan={6} className="px-2 py-1.5 text-[11px] font-black uppercase" style={{ color: g.color }}>{g.label}</td></tr>,
                  ...g.rows.map((r) => (
                    <tr key={g.code + r.label} className={`border-b border-slate-100 ${r.star && r.deaths > 0 ? 'bg-amber-50' : ''}`}>
                      <td className={`px-2 py-1.5 ${r.star ? '' : 'font-bold'}`}>{r.label}</td>
                      <td>{n(r.known)}</td>
                      <td className={r.star ? (r.deaths > 0 ? 'font-bold text-amber-700' : '') : 'font-bold text-red-600'}>{n(r.deaths)}</td>
                      <td>{r.star ? 'tidak dihitung*' : rateText(r.cfr)}</td>
                      <td>{r.star ? '-' : ciText(r.cfr)}</td>
                      <td>{n(r.unknown)}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{t.cfr_note} Jika denominator &lt; 10, CFR ditulis sebagai pecahan.</p>
        </Shell>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* No. 41–45 — 7-1-7 */}
        <Shell>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900"><Clock className="h-4 w-4 text-[#0060A9]" />Ketepatan respons 7-1-7</h3>
          <table className="mt-2 w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left">Alert</th><th>Deteksi ≤7 hari</th><th>Notifikasi ≤1 hari</th><th>Respons ≤7 hari</th></tr></thead>
            <tbody>
              {cardsWithNotif.map((s) => (
                <tr key={s.group + s.code} className="border-b border-slate-100 text-center">
                  <td className="py-1 text-left font-semibold">{s.label}</td>
                  <td className="text-slate-400">data belum tersedia</td>
                  <td title={`${s.notification.num} dari ${s.notification.den} tepat waktu; ${s.notification_missing} tanggal belum ada`}>
                    <b>{rateText(s.notification)}</b>{s.notification.den ? <span className="text-slate-500"> ({n(s.notification.num)} dari {n(s.notification.den)})</span> : null}
                  </td>
                  <td className="text-slate-400">data belum tersedia</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">Notifikasi = Tanggal dibuat − Tanggal laporan EBS (discarded tidak dihitung). Deteksi dan respons: API EBS belum mengirim Tanggal Rumor Diketahui (A.11) dan tanggal tindakan respons (B.20–B.39), jadi tidak ditampilkan angkanya.</p>
        </Shell>

        {/* Status alur PE */}
        <Shell>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900"><FileCheck2 className="h-4 w-4 text-[#0060A9]" />Status Form PE</h3>
          <table className="mt-2 w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left">Form</th>{PE_STATUSES.map((s) => <th key={s}>{d.config.status_labels?.[s] ?? s}</th>)}</tr></thead>
            <tbody>
              {d.pe_status.map((p) => (
                <tr key={p.code} className="border-b border-slate-100 text-center">
                  <td className="py-1 text-left"><Link href={`/pe/${p.pe_form}`} className="font-semibold text-[#0060A9] hover:underline">{p.label}</Link></td>
                  {PE_STATUSES.map((s) => <td key={s}><span className={`rounded px-1.5 py-0.5 ${STATUS_TONE[s]}`}>{n(p.by_status[s] ?? 0)}</span></td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">Kasus dengan NIK terisi (tanpa GHPR): <b>{rateText(d.nik)}</b>{d.nik.den ? ` (${n(d.nik.num)}/${n(d.nik.den)})` : ''}.</p>
        </Shell>

        {/* Cakupan wilayah */}
        <Shell>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900"><MapPinned className="h-4 w-4 text-[#0060A9]" />Cakupan wilayah pelapor</h3>
          {[['Provinsi', d.coverage.provinces], ['Kab/Kota', d.coverage.kabkota]].map(([label, r]: any) => (
            <div key={label} className="mt-3">
              <div className="flex justify-between text-xs"><span className="font-semibold">{label}</span><span><b>{rateText(r)}</b> ({n(r.num)} dari {n(r.den)})</span></div>
              <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-[#00A3AD]" style={{ width: `${Math.min(100, r.pct ?? 0)}%` }} /></div>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-slate-500">Wilayah dengan minimal satu laporan (EBS, Form PE, atau laporan kasus) pada periode dan filter terpilih.</p>
        </Shell>
      </div>

      {/* Daftar indikator sheet: tersedia / sebagian / tertunda */}
      <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <summary className="flex cursor-pointer items-center gap-2 font-bold text-slate-700"><Info className="h-4 w-4" />Status indikator sheet "Spesifikasi Dashboard Executive"</summary>
        <table className="mt-2 w-full">
          <tbody>
            {(d.config.indicators || []).map((i, k) => (
              <tr key={k} className="border-b border-slate-100 align-top">
                <td className="w-24 py-1 font-mono text-slate-500">{i.no}</td><td className="pr-2">{i.name}</td>
                <td className="w-24"><span className={`rounded px-1.5 py-0.5 font-semibold ${IND_TONE[i.status] || ''}`}>{i.status}</span></td>
                <td className="text-slate-500">{i.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {d.cards.length === 0 && !d.no_group_for_disease ? <div className="flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />Konfigurasi dashboard eksekutif belum ada.</div> : null}
    </section>
  )
}
