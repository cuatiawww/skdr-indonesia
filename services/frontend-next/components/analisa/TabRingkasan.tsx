'use client'
import { useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nf, pf, SUMBER_LABEL, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { Empty, ExportButton, InfoTip, Interpretasi, Kpi, Note, Panel, State } from './ui'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export default function TabRingkasan({ f, set }: { f: AFilter; set: (p: Partial<AFilter>) => void }) {
  const r = useAnalisa('ringkasan', f)
  const d: any = r.data
  const tren = useMemo(() => {
    const t: any[] = d?.tren || []
    if (f.periode === 'minggu') return t.map((x) => ({ ...x, __flag: x.di_atas_ambang ? x.kasus : null }))
    const m = new Map<string, any>()
    for (const x of t) {
      const k = f.periode === 'bulan' ? x.bulan : String(x.tahun)
      const o = m.get(k) || { label: f.periode === 'bulan' ? `${MONTH[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}` : k, kasus: 0, kematian: 0, laporan: 0, kasus_tahun_lalu: null as number | null }
      o.kasus += x.kasus; o.kematian += x.kematian; o.laporan += x.laporan
      if (x.kasus_tahun_lalu !== null) o.kasus_tahun_lalu = (o.kasus_tahun_lalu || 0) + x.kasus_tahun_lalu
      m.set(k, o)
    }
    return [...m.values()]
  }, [d, f.periode])
  const weekly = f.periode === 'minggu'
  const kpis: any[] = d?.kpi || []
  const total = kpis.find((k) => k.key === 'kasus')?.nilai || 0
  const build = () => [
    { name: 'KPI', rows: [['Indikator', 'Nilai', 'Periode sebelumnya', 'Ubah (%)', 'Tahun lalu', 'Ubah vs tahun lalu (%)', 'Definisi'], ...kpis.map((k) => [k.label, k.nilai, k.sebelumnya, k.ubah_pct, k.tahun_lalu, k.ubah_tahun_lalu_pct, k.definisi])], note: `${SUMBER_LABEL[f.sumber]} ${d?.meta?.periode_label || ''}` },
    { name: 'Tren', rows: [['Periode', 'Kasus', 'Kematian', 'Laporan', 'Kasus tahun lalu', ...(weekly ? ['Rerata baseline', 'Ambang', 'Di atas ambang'] : [])], ...tren.map((x: any) => [x.label, x.kasus, x.kematian, x.laporan, x.kasus_tahun_lalu, ...(weekly ? [x.rerata, x.ambang, x.di_atas_ambang ? 'Ya' : 'Tidak'] : [])])], note: d?.ambang_metode },
    { name: 'Penyakit', rows: [['Penyakit', 'Kasus', 'Porsi (%)', 'Periode sebelumnya', 'Ubah (%)', 'Minggu terakhir', 'Minggu sebelumnya', 'Ubah mingguan (%)', 'Ambang', 'Di atas ambang'], ...(d?.top_penyakit || []).map((x: any) => [x.label, x.kasus, x.porsi_pct, x.sebelumnya, x.ubah_pct, x.minggu_terakhir, x.minggu_sebelumnya, x.ubah_mingguan_pct, x.ambang, x.di_atas_ambang ? 'Ya' : 'Tidak'])] },
    { name: 'Wilayah', rows: [[d?.meta?.level_label || 'Wilayah', 'Kasus', 'Porsi (%)', 'Kematian', 'Laporan', 'Periode sebelumnya', 'Ubah (%)'], ...(d?.top_wilayah || []).map((x: any) => [x.label, x.kasus, x.porsi_pct, x.kematian, x.laporan, x.sebelumnya, x.ubah_pct])] },
    { name: 'Interpretasi', rows: [['Interpretasi'], ...(d?.interpretasi || []).map((s: string) => [s])] },
  ]
  return (
    <State {...r}>
      {d ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">Dibandingkan dengan <b>{d.pembanding?.sebelumnya?.label}</b> (periode sebelumnya) dan <b>{d.pembanding?.tahun_lalu?.label}</b> (periode sama tahun lalu){!d.pembanding?.tahun_lalu?.tersedia ? ' — data tahun lalu belum tersedia' : ''}.</div>
            <ExportButton filename={`matriks-analisa-ringkasan-${f.sumber}-${d.meta?.periode_label}`} build={build} />
          </div>
          <Interpretasi lines={d.interpretasi} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {kpis.map((k) => <Kpi key={k.key} label={k.label} value={k.nilai} delta={k.ubah_pct} deltaLabel="vs periode sebelumnya" tip={k.definisi} tone={k.key === 'kematian' || k.key === 'klb' ? 'red' : k.key === 'alert' ? 'amber' : 'teal'}
              sub={k.tahun_lalu !== null && k.tahun_lalu !== undefined ? <>Tahun lalu {nf(k.tahun_lalu)}{k.ubah_tahun_lalu_pct !== null ? ` (${k.ubah_tahun_lalu_pct > 0 ? '+' : ''}${nf(k.ubah_tahun_lalu_pct, 1)}%)` : ''}</> : 'Tahun lalu: belum ada data'} />)}
            <Kpi label="CFR" value={d.cfr_pct} pct tone="red" tip="CFR = kematian ÷ kasus × 100%. Selang 95% metode Wilson." sub={d.cfr_ci ? `95% CI ${pf(d.cfr_ci[0])}–${pf(d.cfr_ci[1])}` : 'Belum ada kasus'} />
          </div>
          <Panel title={`Tren kasus per ${weekly ? 'minggu epid' : f.periode === 'bulan' ? 'bulan' : 'tahun'}`} tip={d.ambang_metode} desc={weekly ? <>Batang = kasus; garis putus-putus = ambang ({d.ambang_metode}); titik merah = minggu di atas ambang; garis abu = periode sama tahun lalu.</> : 'Batang = kasus; garis abu = periode sama tahun lalu. Ambang hanya dihitung pada agregasi mingguan.'} testId="tren-chart">
            {tren.length === 0 || total === 0 ? <Empty>Tidak ada kasus pada periode & filter ini.</Empty> : (
              <div className="h-72"><ResponsiveContainer>
                <ComposedChart data={tren} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => nf(v)} />
                  <Tooltip formatter={(v: any, n: any) => [nf(v as number, 1), n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar isAnimationActive={false} dataKey="kasus" name="Kasus" fill="#0f766e" radius={[3, 3, 0, 0]} />
                  <Line isAnimationActive={false} dataKey="kasus_tahun_lalu" name="Tahun lalu" stroke="#94a3b8" dot={false} strokeWidth={2} />
                  {weekly ? <Line isAnimationActive={false} dataKey="ambang" name="Ambang (rerata + 2 SD)" stroke="#dc2626" strokeDasharray="5 4" dot={false} strokeWidth={1.5} /> : null}
                  {weekly ? <Line isAnimationActive={false} dataKey="rerata" name="Rerata baseline" stroke="#f59e0b" dot={false} strokeWidth={1} /> : null}
                  {weekly ? <Line isAnimationActive={false} dataKey="__flag" name="Di atas ambang" stroke="none" legendType="circle" dot={{ r: 5, fill: '#dc2626', stroke: '#fff' }} activeDot={false} /> : null}
                </ComposedChart>
              </ResponsiveContainer></div>
            )}
          </Panel>
          {d.flags?.length ? (
            <Note tone="red"><b>Sinyal ambang minggu terakhir:</b> {d.flags.map((x: any) => `${x.label} (${nf(x.kasus)} kasus; ambang ${nf(x.ambang, 1)})`).join(' · ')}</Note>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Penyakit teratas" desc="Diurutkan menurut jumlah kasus. Perubahan mingguan = minggu terakhir vs minggu sebelumnya." tip="Ambang per penyakit dihitung dengan metode yang sama dengan tren (rerata + 2 SD).">
              {!d.top_penyakit?.length ? <Empty /> : (
                <div className="skdr-table-card overflow-x-auto"><table className="skdr-table w-full text-xs">
                  <thead><tr><th className="text-left">Penyakit</th><th className="text-right">Kasus</th><th className="text-right">Porsi</th><th className="text-right">vs periode lalu</th><th className="text-right">Minggu terakhir</th><th className="text-right">WoW</th><th className="text-right">Ambang</th></tr></thead>
                  <tbody>{d.top_penyakit.map((x: any) => (
                    <tr key={x.penyakit} className={x.di_atas_ambang ? 'bg-red-50' : ''}>
                      <td><button type="button" className="text-left font-semibold text-primary hover:underline" onClick={() => set({ penyakit: [x.penyakit] })} title="Filter penyakit ini">{x.label}</button></td>
                      <td className="text-right font-bold tabular-nums">{nf(x.kasus)}</td><td className="text-right tabular-nums">{pf(x.porsi_pct)}</td>
                      <td className="text-right tabular-nums"><Delta v={x.ubah_pct} /></td>
                      <td className="text-right tabular-nums">{nf(x.minggu_terakhir)}</td><td className="text-right tabular-nums"><Delta v={x.ubah_mingguan_pct} /></td>
                      <td className="text-right tabular-nums">{x.ambang === null ? '–' : nf(x.ambang, 1)}{x.di_atas_ambang ? <span className="ml-1 rounded bg-red-600 px-1 text-[9px] font-bold text-white">DI ATAS</span> : null}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Panel>
            <Panel title={`${d.meta?.level_label || 'Wilayah'} teratas`} desc="Diurutkan menurut jumlah kasus. Klik untuk menelusuri ke level berikutnya.">
              {!d.top_wilayah?.length ? <Empty /> : (
                <div className="skdr-table-card overflow-x-auto"><table className="skdr-table w-full text-xs">
                  <thead><tr><th className="text-left">{d.meta?.level_label}</th><th className="text-right">Kasus</th><th className="text-right">Porsi</th><th className="text-right">Kematian</th><th className="text-right">Laporan</th><th className="text-right">vs periode lalu</th></tr></thead>
                  <tbody>{d.top_wilayah.map((x: any) => (
                    <tr key={x.key}>
                      <td>{d.meta?.level === 'unit' ? x.label : <button type="button" className="text-left font-semibold text-primary hover:underline" onClick={() => drill(d.meta?.level, x.key, set, f)}>{x.label}</button>}</td>
                      <td className="text-right font-bold tabular-nums">{nf(x.kasus)}</td><td className="text-right tabular-nums">{pf(x.porsi_pct)}</td>
                      <td className="text-right tabular-nums">{nf(x.kematian)}</td><td className="text-right tabular-nums">{nf(x.laporan)}</td><td className="text-right tabular-nums"><Delta v={x.ubah_pct} /></td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Panel>
          </div>
          <div className="text-[10.5px] text-slate-400">Waktu kueri: {d.ms} ms · <InfoTip text="Perubahan (%) = (nilai − pembanding) ÷ pembanding × 100%. '–' = pembanding nol/tidak tersedia." /> Definisi perubahan</div>
        </div>
      ) : null}
    </State>
  )
}

export function Delta({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="text-slate-400">–</span>
  const c = v > 0 ? 'text-red-600' : v < 0 ? 'text-emerald-700' : 'text-slate-500'
  return <span className={`font-semibold ${c}`}>{v > 0 ? '▲ +' : v < 0 ? '▼ ' : ''}{nf(v, 1)}%</span>
}

/** Drill one level down from the current wilayah level. */
export function drill(level: string | undefined, key: string, set: (p: Partial<AFilter>) => void, f: AFilter) {
  if (!key) return
  if (level === 'provinsi') set({ prov: key, kab: '', kec: '' })
  else if (level === 'kabkota') set({ kab: key, kec: '' })
  else if (level === 'kecamatan') set({ kec: key })
  void f
}
