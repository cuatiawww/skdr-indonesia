'use client'
// PR 042: Morbiditas - porsi kasus, CFR, and proporsi kasus terhadap kunjungan only where Total Kunjungan exists.
// No fixed 100.000 denominator: insiden is shown only when population data exists (not yet in the system).
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nf, pf, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { Empty, ExportButton, InfoTip, Interpretasi, Kpi, Note, Panel, State } from './ui'
import { drill } from './TabRingkasan'

export default function TabMorbiditas({ f, set }: { f: AFilter; set: (p: Partial<AFilter>) => void }) {
  const r = useAnalisa('morbiditas', f)
  const d: any = r.data
  const pen: any[] = d?.penyakit || []
  const wil: any[] = d?.wilayah || []
  const py = d?.penyebut || {}
  const adaKunjungan = (py.kunjungan || 0) > 0
  const build = () => [
    { name: 'Penyakit', rows: [['Penyakit', 'Kasus', 'Kematian', 'CFR (%)', 'Porsi dari total kasus (%)', 'Kasus pada laporan berkunjungan', 'Proporsi thd kunjungan (%)'], ...pen.map((x) => [x.label, x.kasus, x.kematian, x.cfr_pct, x.porsi_pct, x.kasus_berpenyebut, x.proporsi_kunjungan_pct])], note: `Penyebut kunjungan: ${py.kunjungan || 0} dari ${py.laporan_berpenyebut || 0} laporan berisi Total Kunjungan` },
    { name: 'Wilayah', rows: [[d?.meta?.level_label || 'Wilayah', 'Kasus', 'Kematian', 'CFR (%)', 'Porsi (%)', 'Kunjungan', 'Proporsi thd kunjungan (%)'], ...wil.map((x) => [x.label, x.kasus, x.kematian, x.cfr_pct, x.porsi_pct, x.kunjungan, x.proporsi_kunjungan_pct])] },
    { name: 'Catatan', rows: [['Catatan'], [d?.insiden?.catatan || ''], ...(d?.interpretasi || []).map((s: string) => [s])] },
  ]
  return (
    <State {...r}>
      {d ? (
        <div className="space-y-4">
          <div className="flex justify-end"><ExportButton filename={`matriks-analisa-morbiditas-${f.sumber}-${d.meta?.periode_label}`} build={build} /></div>
          <Interpretasi lines={d.interpretasi} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total kasus" value={py.total_kasus} tip="Jumlah kasus semua penyakit pada filter terpilih (penyebut porsi)." />
            <Kpi label="Total kunjungan" value={f.sumber === 'ebs' ? null : py.kunjungan} pct={f.sumber === 'ebs'} tone="blue" tip="Jumlah Total Kunjungan pada Laporan Agregat IBS yang mengisinya. Hanya IBS." sub={f.sumber === 'ebs' ? 'Tidak berlaku untuk Laporan EBS' : `${nf(py.laporan_berpenyebut)} dari ${nf(py.laporan_total)} laporan (${pf(py.cakupan_pct)})`} />
            <Kpi label="Laporan dengan kunjungan" value={f.sumber === 'ebs' ? null : py.cakupan_pct} pct tone="slate" tip="Persentase Laporan Agregat IBS yang mengisi Total Kunjungan. Proporsi terhadap kunjungan hanya dihitung dari laporan ini." sub={f.sumber === 'ebs' ? 'Tidak berlaku untuk Laporan EBS' : undefined} />
            <Kpi label="Insiden per 100.000" value={null} pct tone="slate" tip={d.insiden?.catatan} sub="Belum tersedia: data penduduk belum ada" />
          </div>
          {!adaKunjungan && f.sumber !== 'ebs' ? <Note>Proporsi kasus terhadap kunjungan belum dapat dihitung karena belum ada Laporan Agregat IBS dengan Total Kunjungan terisi pada periode ini (data impor API SKDR lama tidak memuat kunjungan). Kolom proporsi ditampilkan "–" — bukan 0 dan bukan memakai penyebut tetap.</Note> : null}
          <Note tone="blue">{d.insiden?.catatan}</Note>
          <Panel title="Morbiditas menurut penyakit" desc="Diurutkan menurut jumlah kasus. Porsi = kasus penyakit ÷ total kasus. Proporsi kunjungan = kasus ÷ total kunjungan pada laporan yang mengisi kunjungan." tip="CFR = kematian ÷ kasus × 100%.">
            {!pen.length ? <Empty /> : (
              <>
                <div style={{ height: Math.max(220, Math.min(20, pen.length) * 22 + 50) }}><ResponsiveContainer>
                  <BarChart data={pen.slice(0, 20)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => nf(v)} /><YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => nf(v as number)} /><Bar isAnimationActive={false} dataKey="kasus" name="Kasus" fill="#0f766e" />
                  </BarChart>
                </ResponsiveContainer></div>
                <div className="skdr-table-card mt-3 max-h-[520px] overflow-auto"><table className="skdr-table w-full text-[11px]">
                  <thead className="sticky top-0"><tr><th className="text-left">Penyakit</th><th className="text-right">Kasus</th><th className="text-right">Porsi <InfoTip text="Kasus ÷ total kasus semua penyakit." /></th><th className="text-right">Kematian</th><th className="text-right">CFR</th><th className="text-right">Kasus (laporan berkunjungan)</th><th className="text-right">Proporsi thd kunjungan <InfoTip text="Kasus ÷ Total Kunjungan × 100%, hanya dari Laporan Agregat IBS yang mengisi Total Kunjungan." /></th></tr></thead>
                  <tbody>{pen.map((x) => <tr key={x.penyakit}><td className="font-semibold">{x.label}</td><td className="text-right font-bold tabular-nums">{nf(x.kasus)}</td><td className="text-right tabular-nums">{pf(x.porsi_pct)}</td><td className="text-right tabular-nums">{nf(x.kematian)}</td><td className="text-right tabular-nums">{pf(x.cfr_pct)}</td><td className="text-right tabular-nums">{nf(x.kasus_berpenyebut)}</td><td className="text-right tabular-nums">{x.proporsi_kunjungan_pct === null ? '–' : `${nf(x.proporsi_kunjungan_pct, 2)}%`}</td></tr>)}</tbody>
                  <tfoot><tr className="bg-slate-100 font-bold"><td>TOTAL</td><td className="text-right">{nf(py.total_kasus)}</td><td className="text-right">100%</td><td className="text-right">{nf(pen.reduce((a, x) => a + x.kematian, 0))}</td><td className="text-right">{pf(py.total_kasus ? Math.round((pen.reduce((a, x) => a + x.kematian, 0) / py.total_kasus) * 1000) / 10 : null)}</td><td /><td /></tr></tfoot>
                </table></div>
              </>
            )}
          </Panel>
          <Panel title={`Morbiditas menurut ${(d.meta?.level_label || 'wilayah').toLowerCase()}`} desc="Diurutkan menurut kasus. Klik nama untuk menelusuri.">
            {!wil.length ? <Empty /> : (
              <div className="skdr-table-card max-h-[520px] overflow-auto"><table className="skdr-table w-full text-[11px]">
                <thead className="sticky top-0"><tr><th className="text-left">{d.meta?.level_label}</th><th className="text-right">Kasus</th><th className="text-right">Porsi</th><th className="text-right">Kematian</th><th className="text-right">CFR</th><th className="text-right">Kunjungan</th><th className="text-right">Proporsi thd kunjungan</th></tr></thead>
                <tbody>{wil.map((x) => <tr key={x.key}><td>{d.meta?.level !== 'unit' && x.key ? <button type="button" className="font-semibold text-primary hover:underline" onClick={() => drill(d.meta?.level, x.key, set, f)}>{x.label}</button> : x.label}</td><td className="text-right font-bold tabular-nums">{nf(x.kasus)}</td><td className="text-right tabular-nums">{pf(x.porsi_pct)}</td><td className="text-right tabular-nums">{nf(x.kematian)}</td><td className="text-right tabular-nums">{pf(x.cfr_pct)}</td><td className="text-right tabular-nums">{nf(x.kunjungan)}</td><td className="text-right tabular-nums">{x.proporsi_kunjungan_pct === null ? '–' : `${nf(x.proporsi_kunjungan_pct, 2)}%`}</td></tr>)}</tbody>
              </table></div>
            )}
          </Panel>
          <div className="text-[10.5px] text-slate-400">Waktu kueri: {d.ms} ms</div>
        </div>
      ) : null}
    </State>
  )
}
