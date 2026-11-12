'use client'
// PR 054: Dasbor Audit Kepatuhan Standar & Pembinaan Pengawasan Gizi SPPG (Formulir 1–13) dengan
// kajian eksekutif pembinaan terarah, peta tunggal khusus capaian skor SOP & standar gizi, serta
// matriks scorecard dan daftar prioritas tindak lanjut berbasis risiko.
import { useMemo, useState } from 'react'
import { AlertTriangle, Award, Building2, CheckCircle2, ClipboardCheck, ClipboardList } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { GiziDashData, KeracunanDashData } from '@/lib/dasbor-mbg-api'
import { GiziMatrixHeatmap } from '@/components/dasbor-mbg/MbgHeatmap'
import { EmptyBox, KpiCard, RatioBar, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import { SkorTrend } from '@/components/dasbor-mbg/MbgCharts'
import { MbgGiziMap, MoreDetails, SectionHead } from '@/components/dasbor-mbg/MbgSections'
import { Panel } from '@/components/analisa/ui'
import { ErrorState, SkeletonChart, SkeletonKpiRow, SkeletonMap } from '@/components/ui/Skeleton'
import { CEK_NASKAH, F9, FORM_GROUPS, FORM_TITLES } from '@/lib/pengawasan-gizi/naskah'
import { GRAN_OPTS, type MapState, type MbgFilter } from '@/lib/dasbor-mbg-filter'

/** Label butir F3–F11 dari naskah formulir (kode "i{n}"); F1/F2 sudah berlabel dari backend. */
export function temuanLabel(formNo: number, kode: string, label: string | null): string {
  if (label) return label
  const k = Number(kode.replace(/^i/, ''))
  const komp = formNo === 9 ? F9.komponen : CEK_NASKAH.find((c) => c.no === formNo)?.komponen
  const it = komp?.flatMap((c) => c.items).find((x) => x.k === k)
  return it ? `${k}. ${it.label}` : `Butir ${k}`
}

const FORMS = Array.from({ length: 13 }, (_, i) => i + 1)
const cellCls = (p: number | null | undefined) =>
  p == null ? 'bg-slate-50 text-slate-300' : p >= 80 ? 'bg-emerald-100 text-emerald-900' : p >= 60 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-900'

export type TindakLanjut = {
  nama_sppg: string
  wilayah: string
  last_tanggal: string | null
  avg_skor: number | null
  rekap12: string | null
  rekap13: string | null
  alasan: string[]
  bobot: number
}

/** SPPG yang perlu tindak lanjut + alasannya (aturan eksplisit, bisa diaudit). */
export function tindakLanjutRows(gizi: GiziDashData | null, ker: KeracunanDashData | null | undefined): TindakLanjut[] {
  if (!gizi) return []
  const inc = new Map<string, number>()
  for (const s of ker?.sppg_incidents || []) if (s.nama_sppg) inc.set(s.nama_sppg.trim().toLowerCase(), (inc.get(s.nama_sppg.trim().toLowerCase()) || 0) + s.kejadian)
  const ref = gizi.kpis.date_max ? new Date(gizi.kpis.date_max) : new Date()
  const out: TindakLanjut[] = []
  for (const s of gizi.sppg_summary) {
    const alasan: string[] = []
    let bobot = 0
    const nk = inc.get(s.nama_sppg.trim().toLowerCase())
    if (nk) { alasan.push(`Ada ${nk} kejadian keracunan`); bobot += 3 }
    if (s.avg_skor != null && s.avg_skor < 80) { alasan.push(`Skor SOP ${s.avg_skor.toFixed(1)} (< 80)`); bobot += s.avg_skor < 60 ? 2 : 1 }
    if (s.last_rekap12 === 'BELUM BAIK') { alasan.push('Standar gizi F12 BELUM BAIK'); bobot += 2 }
    if (s.last_rekap13 === 'BELUM BAIK') { alasan.push('Daya terima F13 BELUM BAIK'); bobot += 1 }
    if (s.last_tanggal && (ref.getTime() - new Date(s.last_tanggal).getTime()) / 864e5 > 90) { alasan.push('Belum dikunjungi ulang > 90 hari'); bobot += 1 }
    if (alasan.length) out.push({ nama_sppg: s.nama_sppg, wilayah: [s.kabkota_name, s.province_name].filter(Boolean).join(', '), last_tanggal: s.last_tanggal, avg_skor: s.avg_skor, rekap12: s.last_rekap12, rekap13: s.last_rekap13, alasan, bobot })
  }
  return out.sort((a, b) => b.bobot - a.bobot || (a.avg_skor ?? 101) - (b.avg_skor ?? 101) || a.nama_sppg.localeCompare(b.nama_sppg, 'id'))
}

export default function GiziDashboardView({ data, loading, error, reload, f, map, setMap, ker = null, kMap, setKMap }: {
  data: GiziDashData | null
  loading: boolean
  error: string | null
  reload: () => void
  f: MbgFilter
  map: MapState
  setMap: (m: MapState) => void
  /** PR 052b: data Keracunan untuk peta kiri & alasan tindak lanjut "ada kejadian" */
  ker?: KeracunanDashData | null
  kMap?: MapState
  setKMap?: (m: MapState) => void
}) {
  const setMapParent = (p: { id: number; name: string } | null) => setMap(p ? { level: 'kab', parent: p } : { level: 'prov', parent: null })
  const granLabel = GRAN_OPTS.find((g) => g.value === f.gran)?.label
  const formDist = useMemo(() => (data?.by_formulir || []).map((x) => ({ ...x, kode: `F${x.form_no}`, belum: Math.max(0, x.tersimpan - x.sesuai - x.tidak_sesuai) })), [data])
  const temuan = data?.temuan || []
  const dist = data?.skor_distribusi || []
  const distScored = dist.filter((x) => x.bin !== 'Belum ada skor')
  const nScored = distScored.reduce((s, x) => s + x.kunjungan, 0)
  const nLow = distScored.slice(0, 3).reduce((s, x) => s + x.kunjungan, 0)
  const tl = useMemo(() => tindakLanjutRows(data, ker), [data, ker])
  const [allTl, setAllTl] = useState(false)
  const [allHm, setAllHm] = useState(false)
  const matrix = data?.sppg_form || []
  const byNo = new Map((data?.by_formulir || []).map((x) => [x.form_no, x]))
  const k = data?.kpis
  const p12 = k ? (k.rekap12_baik + k.rekap12_belum_baik ? (k.rekap12_baik * 100) / (k.rekap12_baik + k.rekap12_belum_baik) : null) : null
  const p13 = k ? (k.rekap13_baik + k.rekap13_belum_baik ? (k.rekap13_baik * 100) / (k.rekap13_baik + k.rekap13_belum_baik) : null) : null
  const weakest = [...(data?.by_formulir || [])].filter((x) => x.sesuai + x.tidak_sesuai > 0).sort((a, b) => a.sesuai / (a.sesuai + a.tidak_sesuai) - b.sesuai / (b.sesuai + b.tidak_sesuai))[0]

  return (
    <div className="space-y-4" data-testid="gizi-dashboard-view">
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading && !data ? (
        <div className="space-y-4">
          <SkeletonKpiRow count={6} />
          <SkeletonMap />
          <SkeletonChart />
        </div>
      ) : data && k ? (
        <>
          <SectionHead
            no={1}
            id="cakupan"
            badge="AUDIT KEPATUHAN & PEMBINAAN SPPG"
            title="Indikator Cakupan Audit, Kepatuhan Standar Gizi & Arahan Pembinaan SPPG"
            desc="Rekapitulasi cakupan kunjungan pengawasan Formulir 1–13, capaian skor penerapan SOP (ambang ≥ 80), kesimpulan standar gizi (F12) & daya terima (F13), serta arahan pengerahan Tim Pembina Gizi (TPG)."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-testid="gizi-kpi">
            <KpiCard icon={ClipboardCheck} label="Kunjungan Pengawasan" value={nf(k.total_kunjungan)} tone="emerald"
              sub={`${nf(k.dikirim)} dikirim · ${nf(k.draf)} draf · ${nf(k.total_formulir_dikirim)} formulir dikirim`} />
            <KpiCard icon={Building2} label="SPPG Diawasi" value={nf(k.sppg_unik)} tone="teal"
              sub={`${nf(k.puskesmas_unik)} puskesmas · ${nf(k.provinsi_unik)} prov · ${nf(k.kabkota_unik)} kab/kota`} />
            <KpiCard icon={ClipboardList} label="Skor SOP Rata-rata" value={pf(k.avg_skor_sop)} tone={(k.avg_skor_sop ?? 100) < 80 ? 'amber' : 'emerald'}
              sub={nScored ? `${nf(nLow)} dari ${nf(nScored)} kunjungan skor < 80 (${pf((nLow * 100) / nScored)})` : 'Skor F3–F11; ambang sesuai standar = 80'} />
            <KpiCard icon={Award} label="Standar Gizi (F12) BAIK" value={pf(p12)} tone={(p12 ?? 100) < 80 ? 'amber' : 'emerald'}
              sub={`${nf(k.rekap12_baik)} BAIK · ${nf(k.rekap12_belum_baik)} BELUM BAIK`} />
            <KpiCard icon={CheckCircle2} label="Daya Terima (F13) BAIK" value={pf(p13)} tone="blue"
              sub={`${nf(k.rekap13_baik)} BAIK · ${nf(k.rekap13_belum_baik)} BELUM BAIK · alergi dilaporkan ${nf(k.alergi_ya)}`} />
            <KpiCard icon={AlertTriangle} label="SPPG Perlu Tindak Lanjut" value={nf(tl.length)} tone={tl.length ? 'red' : 'emerald'}
              sub={`${nf(tl.filter((x) => x.alasan.some((a) => a.startsWith('Ada '))).length)} di antaranya pernah keracunan · wilayah 3T ${nf(k.wilayah_3t_ya)}`} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="gizi-executive-brief">
            <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                Kajian Audit Standar &amp; Arahan Pengerahan Tim Pembina Gizi (TPG Puskesmas / Dinkes)
              </div>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                Instrumen Formulir 1–13
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed text-slate-700 md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                  1. Evaluasi Cakupan &amp; Mutu Kepatuhan SOP
                </div>
                <p>
                  Tercatat <b>{nf(k.total_kunjungan)} kunjungan</b> pada <b>{nf(k.sppg_unik)} SPPG</b> dengan rata-rata skor SOP <b>{pf(k.avg_skor_sop)}</b>{' '}
                  {(k.avg_skor_sop ?? 100) < 80 ? '(di bawah ambang standar 80)' : '(memenuhi ambang standar ≥ 80)'}.{' '}
                  {nScored > 0 ? <>Sebanyak <b>{nf(nLow)} kunjungan ({pf((nLow * 100) / nScored)})</b> masih memperoleh skor &lt; 80 dan </> : null}
                  <b>{nf(k.rekap12_belum_baik)} kunjungan</b> berkesimpulan Standar Gizi (F12) <b>BELUM BAIK</b>.
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                  2. Titik Kritis Rantai Pasok &amp; Ketenagaan (F1–F11)
                </div>
                <p>
                  {weakest ? (
                    <>Aspek dengan tingkat kepatuhan terendah adalah <b>F{weakest.form_no} ({FORM_TITLES[weakest.form_no]?.short || weakest.short})</b> sebesar <b>{pf((weakest.sesuai * 100) / (weakest.sesuai + weakest.tidak_sesuai))} Sesuai</b>. </>
                  ) : (
                    <>Belum ada formulir yang dinilai pada periode terfilter. </>
                  )}
                  {temuan[0] ? (
                    <>Butir ketidakpatuhan tertinggi: <b>{temuanLabel(temuan[0].form_no, temuan[0].kode, temuan[0].label)}</b> (F{temuan[0].form_no}, {nf(temuan[0].jumlah)} temuan).</>
                  ) : null}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50/70 p-3 text-emerald-950">
                <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-800">
                  3. Prioritas Pengerahan Pembinaan Terarah
                </div>
                <p>
                  Fokuskan supervisi ulang dan pendampingan teknis TPG Puskesmas pada <b>{nf(tl.length)} SPPG prioritas tindak lanjut</b>{' '}
                  ({nf(tl.filter((x) => x.alasan.some((a) => a.startsWith('Ada '))).length)} SPPG riwayat KLB keracunan, sisanya skor SOP &lt; 80 / F12 BELUM BAIK / &gt;90 hari belum diaudit ulang).
                </p>
              </div>
            </div>
          </div>

          <SectionHead
            no={2}
            id="peta"
            badge="ANALISIS GEOSPASIAL AUDIT"
            title="Distribusi Geospasial Kepatuhan Pengawasan & Rekapitulasi Wilayah"
            desc="Peta spasial capaian skor SOP & cakupan pengawasan gizi per provinsi/kabupaten-kota beserta titik lokasi SPPG dengan panel analisa wilayah dan pengaturan lapisan terpadu."
          />
          <div className="w-full space-y-3">
            <MbgGiziMap gizi={data} gMap={map} setGMap={setMap} />
            <MoreDetails label={`Tabel Rekapitulasi Pengawasan per ${data.map.level === 'kab' ? 'Kabupaten/Kota' : 'Provinsi'}`}>
              {!data.map.regions.length ? (
                <EmptyBox msg="Belum ada wilayah pada transaksi Pengawasan Gizi MBG." />
              ) : (
                <div className="max-h-[440px] flex-1 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-2">Wilayah</th>
                        <th className="py-2 text-right">Kunj</th>
                        <th className="py-2 text-right">SPPG</th>
                        <th className="py-2 text-right">F12 Baik</th>
                        <th className="py-2 text-right">Blm</th>
                        <th className="py-2 text-right">Skor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map.regions.map((r) => (
                        <tr
                          key={r.key}
                          className={data.map.level === 'prov' ? 'cursor-pointer hover:bg-emerald-50/50' : 'hover:bg-slate-50'}
                          onClick={() => {
                            if (data.map.level === 'prov') {
                              const id = Number(r.key)
                              if (Number.isFinite(id) && id > 0) setMapParent({ id, name: r.name })
                            }
                          }}
                        >
                          <td className="py-2 pr-2 font-semibold text-slate-800">{r.name}</td>
                          <td className="py-2 text-right font-bold tabular-nums text-emerald-800">{nf(r.kunjungan)}</td>
                          <td className="py-2 text-right tabular-nums text-slate-700">{nf(r.sppg_unik)}</td>
                          <td className="py-2 text-right tabular-nums text-emerald-700">{nf(r.rekap12_baik)}</td>
                          <td className="py-2 text-right tabular-nums text-amber-700">{nf(r.rekap12_belum_baik)}</td>
                          <td className="py-2 text-right tabular-nums text-slate-600">{pf(r.avg_skor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </MoreDetails>
          </div>

          <SectionHead
            no={3}
            id="hasil"
            badge="EVALUASI SKOR & KESIMPULAN"
            title="Distribusi Mutu Skor Kunjungan & Proporsi Kesimpulan per Formulir (F1–F13)"
            desc="Sebaran rata-rata skor penerapan SOP (F3–F11) per kunjungan terhadap ambang batas 80, serta komposisi kesimpulan Sesuai/BAIK vs Tidak Sesuai/BELUM BAIK pada tiap instrumen formulir."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Sebaran Skor SOP per Kunjungan" desc="Rata-rata skor F3–F11 tiap kunjungan; merah/oranye = di bawah ambang standar 80." testId="panel-sebaran-skor"
              tip="Skor kunjungan = rata-rata skor Formulir 3–11 yang terisi pada kunjungan itu. 'Belum ada skor' = kunjungan tanpa formulir F3–F11 berskor.">
              {!dist.some((x) => x.kunjungan > 0) ? <EmptyBox msg="Belum ada kunjungan dengan skor." /> : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dist} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="bin" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip formatter={(v: any) => [nf(v), 'Kunjungan']} />
                      <Bar dataKey="kunjungan" name="Kunjungan" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10 }}>
                        {dist.map((x, i) => <Cell key={x.bin} fill={['#dc2626', '#f97316', '#f59e0b', '#10b981', '#047857', '#cbd5e1'][i] || '#cbd5e1'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel title="Proporsi Kesimpulan per Formulir (F1–F13)" desc="Jumlah formulir menurut status kesimpulan audit; abu-abu = tersimpan namun belum dinilai." testId="panel-kesimpulan">
              {!formDist.some((x) => x.tersimpan > 0) ? <EmptyBox msg="Belum ada pengisian Formulir 1–13 pada kunjungan terfilter." /> : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={formDist} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="kode" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(l: any) => { const n = Number(String(l).slice(1)); return `${l} · ${FORM_TITLES[n]?.short || ''}` }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="sesuai" stackId="a" name="Sesuai / BAIK" fill="#10b981" />
                      <Bar dataKey="tidak_sesuai" stackId="a" name="Tidak Sesuai / BELUM BAIK" fill="#f59e0b" />
                      <Bar dataKey="belum" stackId="a" name="Belum dinilai" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <SectionHead
            no={4}
            id="aspek"
            badge="DIAGNOSTIK ASPEK & MATRIKS SPPG"
            title="Evaluasi Indeks Kepatuhan per Aspek Rantai Pasok & Matriks Scorecard SPPG × Formulir"
            desc="Pemetaan kelemahan struktural dari tahap persiapan, pengolahan, distribusi hingga evaluasi (target kepatuhan ≥ 80%), disandingkan dengan matriks diagnostik per unit SPPG."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title="Indeks Kepatuhan per Aspek Pengawasan" desc="% formulir Sesuai/BAIK per tahapan; garis putus = target 80%." testId="panel-kepatuhan-aspek">
              {!(data.by_formulir || []).some((x) => x.sesuai + x.tidak_sesuai > 0) ? <EmptyBox msg="Belum ada formulir yang dinilai." /> : (
                <div className="space-y-3">
                  {FORM_GROUPS.map((g) => {
                    const rows = g.forms.map((n) => byNo.get(n)).filter((x): x is NonNullable<typeof x> => !!x && x.sesuai + x.tidak_sesuai > 0)
                    if (!rows.length) return null
                    const ok = rows.reduce((s, x) => s + x.sesuai, 0)
                    const tot = rows.reduce((s, x) => s + x.sesuai + x.tidak_sesuai, 0)
                    return (
                      <div key={g.title}>
                        <div className="mb-1 flex items-baseline justify-between text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500"><span>{g.title}</span><span className={(ok * 100) / tot < 80 ? 'text-amber-700' : 'text-emerald-700'}>{pf((ok * 100) / tot)}</span></div>
                        <div className="space-y-1.5">
                          {rows.map((x) => {
                            const p = (x.sesuai * 100) / (x.sesuai + x.tidak_sesuai)
                            return (
                              <div key={x.form_no} title={FORM_TITLES[x.form_no]?.title}>
                                <div className="flex justify-between gap-2 text-[11px]"><span className="min-w-0 truncate text-slate-700"><b>F{x.form_no}</b> {FORM_TITLES[x.form_no]?.short || x.short}</span><span className="shrink-0 font-mono font-bold text-slate-700">{p.toFixed(0)}%</span></div>
                                <div className="relative mt-0.5 h-2 overflow-hidden rounded-full bg-slate-100">
                                  <div className={p >= 80 ? 'h-full bg-emerald-500' : p >= 60 ? 'h-full bg-amber-500' : 'h-full bg-red-500'} style={{ width: `${p}%` }} />
                                  <div className="absolute inset-y-0 border-l border-dashed border-slate-500" style={{ left: '80%' }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
            <Panel className="xl:col-span-2" title="Matriks Scorecard Kepatuhan SPPG × Formulir (F1–F13)" testId="panel-heatmap-sppg"
              desc="Setiap sel = % formulir Sesuai/BAIK untuk SPPG tersebut; hijau ≥ 80%, kuning 60–79%, merah < 60%, abu = belum diisi. Diurutkan dari SPPG dengan skor terendah."
              actions={matrix.length > 20 ? <button type="button" onClick={() => setAllHm((x) => !x)} className="text-[11px] font-bold text-primary hover:underline">{allHm ? 'Tampilkan 20 terlemah' : `Tampilkan semua (${nf(matrix.length)})`}</button> : null}>
              {!matrix.length ? <EmptyBox msg="Belum ada formulir dikirim per SPPG." /> : (
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[720px] border-separate border-spacing-0.5 text-[11px]">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr>
                        <th className="px-1 py-1 text-left text-[10px] font-extrabold uppercase text-slate-500">SPPG</th>
                        {FORMS.map((n) => <th key={n} className="w-9 px-0.5 py-1 text-center text-[10px] font-extrabold text-slate-500" title={FORM_TITLES[n]?.title}>F{n}</th>)}
                        <th className="px-1 py-1 text-right text-[10px] font-extrabold uppercase text-slate-500">Skor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allHm ? matrix : matrix.slice(0, 20)).map((r) => {
                        const fm = new Map(r.forms.map((c) => [c.form_no, c]))
                        return (
                          <tr key={r.nama_sppg}>
                            <td className="max-w-[200px] px-1 py-0.5"><div className="truncate font-semibold text-slate-800" title={r.nama_sppg}>{r.nama_sppg}</div><div className="truncate text-[10px] text-slate-400">{[r.kabkota_name, r.province_name].filter(Boolean).join(', ')}</div></td>
                            {FORMS.map((n) => {
                              const c = fm.get(n)
                              return <td key={n} className={`rounded px-0.5 py-1 text-center font-mono font-bold ${cellCls(c?.pct)}`} title={c ? `F${n} ${FORM_TITLES[n]?.short || ''}: ${c.ok} sesuai / ${c.fail} tidak sesuai dari ${c.n} formulir${c.skor != null ? ` · skor ${c.skor}` : ''}` : `F${n}: belum diisi`}>{c?.pct != null ? Math.round(c.pct) : '–'}</td>
                            })}
                            <td className={`px-1 py-0.5 text-right font-mono font-bold ${(r.avg_skor ?? 100) < 80 ? 'text-red-700' : 'text-emerald-700'}`}>{r.avg_skor != null ? r.avg_skor.toFixed(1) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <SectionHead
            no={5}
            id="temuan"
            badge="ANALISIS AKAR MASALAH (ROOT-CAUSE)"
            title="Analisis Akar Masalah: Butir Ketidakpatuhan Tertinggi (F1–F11), Ketenagaan (F1) & Ketersediaan SOP (F2)"
            desc="Daftar temuan butir pemeriksaan yang paling sering tidak terpenuhi sebagai dasar penyusunan kurikulum bimbingan teknis penjamah makanan dan pengelola SPPG."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title="Peringkat Temuan Butir “Tidak Sesuai” Tertinggi (F1–F11)" desc="Butir pemeriksaan pada Formulir 1–11 dengan frekuensi ketidakpatuhan tertinggi dari seluruh formulir terkirim." testId="panel-temuan">
              {!temuan.length ? <EmptyBox msg="Belum ada temuan Tidak Sesuai pada formulir yang dikirim." /> : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr className="border-b border-slate-200"><th className="py-2 pr-2 text-left">Form</th><th className="py-2 pr-2 text-left">Butir Pemeriksaan</th><th className="py-2 text-right">Frekuensi</th><th className="py-2 text-right">% Form</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {temuan.slice(0, 25).map((t) => (
                        <tr key={`${t.form_no}-${t.kode}`} className="hover:bg-slate-50">
                          <td className="py-1.5 pr-2 align-top font-extrabold text-emerald-800" title={FORM_TITLES[t.form_no]?.title}>F{t.form_no}</td>
                          <td className="py-1.5 pr-2 text-slate-700"><div className="line-clamp-2">{temuanLabel(t.form_no, t.kode, t.label)}</div><div className="text-[10px] text-slate-400">{FORM_TITLES[t.form_no]?.short}</div></td>
                          <td className="py-1.5 text-right align-top font-bold tabular-nums text-amber-700">{nf(t.jumlah)}</td>
                          <td className="py-1.5 text-right align-top tabular-nums text-slate-600">{pf(t.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <div className="space-y-4">
              <Panel title="F1 · Kualifikasi Ketenagaan & Penjamah" desc="Kualifikasi pengawas/TPG serta kecukupan rasio & sertifikasi penjamah makanan." testId="panel-f1">
                {!data.f1_ketenagaan.total ? (
                  <EmptyBox msg="Belum ada pengisian Form 1 Ketenagaan." />
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Form F1 Terisi</div>
                        <div className="mt-0.5 text-lg font-black text-slate-900 tabular-nums">{nf(data.f1_ketenagaan.total)}</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-emerald-700">Avg Penjamah / SPPG</div>
                        <div className="mt-0.5 text-lg font-black text-emerald-900 tabular-nums">
                          {data.f1_ketenagaan.avg_penjamah != null ? data.f1_ketenagaan.avg_penjamah.toFixed(1) : '—'}
                        </div>
                      </div>
                    </div>
                    <RatioBar label="A. Pengawas/TPG Memenuhi Syarat" good={data.f1_ketenagaan.pengawas_sesuai} total={data.f1_ketenagaan.total} />
                    <RatioBar label="B.1 Rasio Penjamah Cukup" good={data.f1_ketenagaan.penjamah_b1_sesuai} total={data.f1_ketenagaan.total} barCls="bg-teal-600" />
                    <RatioBar label="B.2 Penjamah Terlatih/Sertifikat" good={data.f1_ketenagaan.pelatihan_b2_sesuai} total={data.f1_ketenagaan.total} barCls="bg-blue-600" />
                  </div>
                )}
              </Panel>
              <Panel title="F2 · Ketersediaan & Sosialisasi 8 SOP" desc="Ketersediaan dokumen SOP di dapur SPPG dan pelaksanaan sosialisasi ke petugas." testId="panel-f2">
                {!data.f2_sop.some((x) => x.sosialisasi_total > 0 || (x.tersedia_total ?? 0) > 0) ? (
                  <EmptyBox msg="Belum ada pengisian Form 2 SOP." />
                ) : (
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-1.5 text-left">Dokumen SOP</th>
                          <th className="py-1.5 text-right">Tersedia</th>
                          <th className="py-1.5 text-right">Sosialisasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.f2_sop.map((s, idx) => (
                          <tr key={s.nama} className="hover:bg-slate-50">
                            <td className="py-1.5 pr-2 font-medium text-slate-700">{idx + 1}. {s.nama}</td>
                            <td className="py-1.5 text-right tabular-nums text-slate-700">
                              {s.tersedia_total != null ? `${nf(s.tersedia_sesuai)}/${nf(s.tersedia_total)}` : '—'}
                            </td>
                            <td className="py-1.5 text-right font-semibold tabular-nums text-emerald-700">
                              {nf(s.sosialisasi_sesuai)}/{nf(s.sosialisasi_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
          </div>

          <SectionHead
            no={6}
            id="tindak-lanjut"
            badge="DAFTAR TARGET OPERASIONAL"
            title="Daftar Prioritas Pembinaan & Tindak Lanjut SPPG Berbasis Risiko"
            desc="Urutan prioritas pengerahan supervisi ulang SPPG berdasarkan bobot risiko: riwayat KLB keracunan pangan, kesimpulan F12/F13 BELUM BAIK, skor penerapan SOP < 80, atau jeda kunjungan > 90 hari."
          />
          <Panel title="Register SPPG Prioritas Pembinaan & Tindak Lanjut" testId="panel-tindak-lanjut" desc={`${nf(tl.length)} SPPG memenuhi minimal satu kriteria ketidakpatuhan/risiko; diurutkan dari bobot risiko tertinggi.`}
            tip="Bobot prioritas: kejadian keracunan 3, F12 BELUM BAIK 2, skor < 60 = 2 / skor 60–79 = 1, F13 BELUM BAIK 1, tidak dikunjungi ulang > 90 hari (dihitung dari tanggal kunjungan terakhir pada data) 1. Pencocokan kejadian berdasarkan nama SPPG."
            actions={tl.length > 12 ? <button type="button" onClick={() => setAllTl((x) => !x)} className="text-[11px] font-bold text-primary hover:underline">{allTl ? 'Tampilkan 12 teratas' : `Tampilkan semua (${nf(tl.length)})`}</button> : null}>
            {!tl.length ? <EmptyBox msg="Tidak ada SPPG yang memenuhi kriteria tindak lanjut pada filter ini." /> : (
              <div className="overflow-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">SPPG &amp; Wilayah</th><th className="px-2 py-2 text-left">Indikator Risiko / Alasan Tindak Lanjut</th>
                      <th className="px-2 py-2 text-right">Skor SOP</th><th className="px-2 py-2 text-center">F12</th><th className="px-2 py-2 text-center">F13</th><th className="px-2 py-2 text-right">Kunjungan Terakhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(allTl ? tl : tl.slice(0, 12)).map((s, i) => (
                      <tr key={s.nama_sppg} className="align-top hover:bg-slate-50">
                        <td className="px-2 py-2 font-bold text-slate-400">{i + 1}</td>
                        <td className="px-2 py-2"><div className="font-bold text-slate-800">{s.nama_sppg}</div><div className="text-[10.5px] text-slate-500">{s.wilayah || '—'}</div></td>
                        <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{s.alasan.map((a) => <span key={a} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${a.startsWith('Ada ') ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{a}</span>)}</div></td>
                        <td className={`px-2 py-2 text-right font-mono font-bold ${(s.avg_skor ?? 100) < 80 ? 'text-red-700' : 'text-slate-700'}`}>{s.avg_skor != null ? s.avg_skor.toFixed(1) : '—'}</td>
                        <td className="px-2 py-2 text-center"><RekapBadge value={s.rekap12} /></td>
                        <td className="px-2 py-2 text-center"><RekapBadge value={s.rekap13} /></td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">{s.last_tanggal || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <SectionHead
            no={7}
            id="tren"
            badge="EVALUASI LONGITUDINAL"
            title="Dinamika Tren Skor Kepatuhan SOP & Volume Kunjungan Pengawasan"
            desc="Pemantauan perkembangan rata-rata skor SOP terhadap target ≥ 80 serta tren volume kunjungan dan proporsi kesimpulan Standar Gizi (F12) per minggu epidemiologi."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title={`Tren Skor SOP Rata-rata per ${granLabel}`} desc="Garis putus merah = ambang batas standar 80; granularitas waktu mengikuti pengaturan filter." testId="panel-skor-trend">
              <SkorTrend series={data.daily_series} gran={f.gran} />
            </Panel>
            <Panel title="Tren Volume Kunjungan & Kesimpulan Standar Gizi (F12) Mingguan" desc="Jumlah kunjungan pengawasan (batang) dan capaian kesimpulan F12 BAIK vs BELUM BAIK (garis)." testId="panel-tren-kunjungan">
              {!data.weekly_trend.length ? (
                <EmptyBox msg="Belum ada data tren mingguan kunjungan pengawasan." />
              ) : (
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.weekly_trend} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="kunjungan" name="Total Kunjungan" fill="#a7f3d0" stroke="#059669" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="rekap12_baik" name="F12 BAIK" stroke="#047857" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="rekap12_belum_baik" name="F12 BELUM BAIK" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <MoreDetails label="tabel register & matriks lanjutan (heatmap mingguan wilayah, ringkasan F1–F13, rekap seluruh SPPG, log kunjungan terbaru)" testId="detail-gizi">
            <GiziMatrixHeatmap heatmap={data.heatmap} />
            <Panel title="Tabel Rekapitulasi Instrumen Formulir 1–13" desc="Jumlah formulir tersimpan, dikirim, distribusi kesimpulan, dan skor rata-rata tiap formulir." testId="panel-ringkasan-form">
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-2.5 py-2 text-left">Kode</th>
                      <th className="px-2.5 py-2 text-left">Formulir Pengawasan</th>
                      <th className="px-2.5 py-2 text-right">Tersimpan</th>
                      <th className="px-2.5 py-2 text-right">Dikirim</th>
                      <th className="px-2.5 py-2 text-right">Sesuai/BAIK</th>
                      <th className="px-2.5 py-2 text-right">Tdk Sesuai</th>
                      <th className="px-2.5 py-2 text-right">Skor Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.by_formulir.map((bf) => (
                      <tr key={bf.form_no} className="hover:bg-slate-50">
                        <td className="px-2.5 py-2 font-extrabold text-emerald-800">F{bf.form_no}</td>
                        <td className="px-2.5 py-2 font-medium text-slate-800">{bf.title}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">{nf(bf.tersimpan)}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">{nf(bf.dikirim)}</td>
                        <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-emerald-700">{nf(bf.sesuai)}</td>
                        <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-amber-700">{nf(bf.tidak_sesuai)}</td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700">{pf(bf.avg_skor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Panel title="Rekapitulasi Seluruh SPPG Terdaftar" desc="Status kesimpulan F12 & F13 terakhir serta skor rata-rata tiap SPPG." testId="panel-rekap-sppg">
                {!data.sppg_summary.length ? (
                  <EmptyBox msg="Belum ada data SPPG pada transaksi Pengawasan Gizi MBG." />
                ) : (
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-2 pr-2 text-left">SPPG &amp; Wilayah</th>
                          <th className="py-2 text-right">Kunj</th>
                          <th className="py-2 text-center">F12 Gizi</th>
                          <th className="py-2 text-center">F13 Terima</th>
                          <th className="py-2 text-right">Skor Avg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.sppg_summary.map((s, idx) => (
                          <tr key={`${s.nama_sppg}-${idx}`} className="hover:bg-slate-50">
                            <td className="py-2 pr-2">
                              <div className="font-bold text-slate-800">{s.nama_sppg}</div>
                              <div className="text-[11px] text-slate-500">
                                {[s.puskesmas ? `PKM ${s.puskesmas}` : null, s.kabkota_name, s.province_name].filter(Boolean).join(' · ')}
                              </div>
                            </td>
                            <td className="py-2 text-right font-bold tabular-nums text-slate-800">{nf(s.kunjungan)}</td>
                            <td className="py-2 text-center"><RekapBadge value={s.last_rekap12} /></td>
                            <td className="py-2 text-center"><RekapBadge value={s.last_rekap13} /></td>
                            <td className="py-2 text-right font-mono tabular-nums text-slate-700">{pf(s.avg_skor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
              <Panel title="Log Transaksi Kunjungan Terbaru" desc="Maksimal 50 kunjungan terakhir sesuai filter (tanpa data pribadi petugas)." testId="panel-kunjungan-terbaru">
                {!data.recent_kunjungan.length ? (
                  <EmptyBox msg="Belum ada transaksi kunjungan pada filter ini." />
                ) : (
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-2 pr-2 text-left">No. Kunjungan &amp; SPPG</th>
                          <th className="py-2 text-center">Tanggal</th>
                          <th className="py-2 text-center">Form</th>
                          <th className="py-2 text-center">F12</th>
                          <th className="py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.recent_kunjungan.map((k) => (
                          <tr key={k.id} className="hover:bg-slate-50">
                            <td className="py-2 pr-2">
                              <div className="font-mono text-[11px] font-bold text-slate-800">{k.no_kunjungan}</div>
                              <div className="text-[11px] text-slate-600">{k.nama_sppg || '—'}</div>
                              <div className="text-[10px] text-slate-400">
                                {[k.kabkota_name, k.province_name].filter(Boolean).join(', ')}
                              </div>
                            </td>
                            <td className="py-2 text-center font-mono text-[11px] text-slate-600">{k.tanggal}</td>
                            <td className="py-2 text-center tabular-nums text-slate-700">{k.forms_sent}/{k.forms_saved}</td>
                            <td className="py-2 text-center"><RekapBadge value={k.rekap12} /></td>
                            <td className="py-2 text-center"><RekapBadge value={k.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
          </MoreDetails>
        </>
      ) : null}
    </div>
  )
}
