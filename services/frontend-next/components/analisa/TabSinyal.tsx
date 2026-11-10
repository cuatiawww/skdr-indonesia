'use client'
// PR 042: Alert & Sinyal - alert IBS (verifikasi, respons ≤ 24 jam, KLB) and Laporan EBS signal quality
// (terverifikasi/discarded/investigasi), konversi KLB, sumber informasi, top-20 kecamatan hotspot, tren, line lists.
import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nf, pf, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { Empty, ExportButton, InfoTip, Interpretasi, Kpi, Note, Panel, Seg, State } from './ui'
import Daftar, { type DaftarJenis } from './Daftar'
import { drill } from './TabRingkasan'

function SignalTable({ rows, first, ebs, ibs, onRow }: { rows: any[]; first: string; ebs: boolean; ibs: boolean; onRow?: (x: any) => void }) {
  if (!rows.length) return <Empty />
  return (
    <div className="skdr-table-card max-h-[520px] overflow-auto"><table className="skdr-table w-full text-[11px]">
      <thead className="sticky top-0"><tr>
        <th className="text-left">{first}</th><th className="text-right">Alert/sinyal</th><th className="text-right">Kasus</th>
        <th className="text-right">Terverifikasi <InfoTip text="Proporsi = terverifikasi ÷ alert/sinyal." /></th>
        {ebs ? <><th className="text-right">Discarded</th><th className="text-right">Investigasi</th></> : null}
        <th className="text-right">KLB</th><th className="text-right">Konversi KLB <InfoTip text="KLB ÷ terverifikasi." /></th>
        {ibs || !ebs ? <th className="text-right">Respons ≤ 24 jam <InfoTip text="Respons ≤ 24 jam ÷ alert/sinyal dengan respons tercatat." /></th> : <th className="text-right">Respons ≤ 24 jam</th>}
        <th className="text-right">Kematian</th>
      </tr></thead>
      <tbody>{rows.map((x) => (
        <tr key={x.key}>
          <td>{onRow && x.key ? <button type="button" className="text-left font-semibold text-primary hover:underline" onClick={() => onRow(x)}>{x.label}</button> : <span className="font-semibold">{x.label}</span>}</td>
          <td className="text-right font-bold tabular-nums">{nf(x.alert)}</td><td className="text-right tabular-nums">{nf(x.kasus)}</td>
          <td className="text-right tabular-nums">{nf(x.terverifikasi)} <span className="text-slate-400">({pf(x.verif_pct)})</span></td>
          {ebs ? <><td className="text-right tabular-nums">{nf(x.discarded)}</td><td className="text-right tabular-nums">{nf(x.investigasi)}</td></> : null}
          <td className="text-right tabular-nums">{nf(x.klb)}</td><td className="text-right tabular-nums">{pf(x.konversi_klb_pct)}</td>
          <td className="text-right tabular-nums">{x.respon_tercatat ? `${pf(x.respon24_pct)} (${nf(x.respon24)}/${nf(x.respon_tercatat)})` : '–'}</td>
          <td className="text-right tabular-nums">{nf(x.kematian)}</td>
        </tr>))}</tbody>
    </table></div>
  )
}

const HEAD = ['Kategori', 'Alert/sinyal', 'Kasus', 'Kematian', 'Terverifikasi', 'Terverifikasi (%)', 'Discarded', 'Dalam investigasi', 'Status belum diisi', 'KLB', 'Konversi KLB (%)', 'Respons ≤ 24 jam', 'Respons tercatat', 'Respons ≤ 24 jam (%)']
const toRow = (x: any) => [x.label, x.alert, x.kasus, x.kematian, x.terverifikasi, x.verif_pct, x.discarded, x.investigasi, x.belum_diisi, x.klb, x.konversi_klb_pct, x.respon24, x.respon_tercatat, x.respon24_pct]

export default function TabSinyal({ f, set }: { f: AFilter; set: (p: Partial<AFilter>) => void }) {
  const r = useAnalisa('sinyal', f)
  const d: any = r.data
  const ebs = f.sumber !== 'ibs', ibs = f.sumber !== 'ebs'
  const [ll, setLl] = useState<DaftarJenis>(f.sumber === 'ebs' ? 'ebs' : 'alert')
  const llOpts: { value: DaftarJenis; label: string }[] = [
    ...(ibs ? [{ value: 'alert' as const, label: 'Alert IBS' }] : []),
    ...(ebs ? [{ value: 'ebs' as const, label: 'Laporan EBS' }, { value: 'klb' as const, label: 'KLB terpadu' }] : []),
  ]
  const llv = llOpts.some((o) => o.value === ll) ? ll : llOpts[0].value
  const lvl = d?.meta?.level_label || 'Wilayah'
  const build = () => [
    { name: 'Per sumber', rows: [HEAD, ...(d?.per_sumber || []).map(toRow)] },
    { name: 'Per penyakit', rows: [HEAD, ...(d?.penyakit || []).map(toRow)] },
    { name: `Per ${lvl}`.slice(0, 31), rows: [HEAD, ...(d?.wilayah || []).map(toRow)] },
    { name: 'Sumber informasi', rows: [HEAD, ...(d?.sumber_informasi || []).map(toRow)] },
    { name: 'Hotspot kecamatan', rows: [HEAD, ...(d?.hotspot || []).map(toRow)] },
    { name: 'Tren', rows: [HEAD, ...(d?.tren || []).map(toRow)] },
    { name: 'Definisi', rows: [['Indikator', 'Definisi'], ...Object.entries(d?.definisi || {}).map(([k, v]) => [k, v])] },
    { name: 'Interpretasi', rows: [['Interpretasi'], ...(d?.interpretasi || []).map((s: string) => [s])] },
  ]
  const e = d?.per_sumber?.find((x: any) => x.key === 'ebs')
  const i = d?.per_sumber?.find((x: any) => x.key === 'ibs')
  const siAllEmpty = (d?.sumber_informasi || []).length === 1 && d.sumber_informasi[0].key === '(Belum diisi)'
  return (
    <div className="space-y-4">
      <State {...r}>
        {d ? (
          <div className="space-y-4">
            <div className="flex justify-end"><ExportButton filename={`matriks-analisa-sinyal-${f.sumber}-${d.meta?.periode_label}`} build={build} /></div>
            <Interpretasi lines={d.interpretasi} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {i ? <>
                <Kpi label="Alert IBS" value={i.alert} tone="amber" tip={d.definisi?.alert_ibs} sub={`${nf(i.kasus)} kasus`} />
                <Kpi label="Alert terverifikasi" value={i.verif_pct} pct tip="Alert terverifikasi ÷ total alert." sub={`${nf(i.terverifikasi)} alert`} />
                <Kpi label="Respons ≤ 24 jam (IBS)" value={i.respon24_pct} pct tone="blue" tip={d.definisi?.respon24} sub={`${nf(i.respon24)} / ${nf(i.respon_tercatat)}`} />
              </> : null}
              {e ? <>
                <Kpi label="Sinyal EBS" value={e.alert} tone="amber" tip={d.definisi?.sinyal_ebs} sub={`${nf(e.kasus)} kasus`} />
                <Kpi label="Kualitas sinyal" value={e.verif_pct} pct tip="Sinyal terverifikasi ÷ seluruh sinyal (positive predictive value sederhana)." sub={`Discarded ${pf(e.alert ? Math.round((e.discarded / e.alert) * 1000) / 10 : null)} · investigasi ${nf(e.investigasi)}`} />
                <Kpi label="Konversi ke KLB" value={e.konversi_klb_pct} pct tone="red" tip={d.definisi?.konversi_klb} sub={`${nf(e.klb_terverifikasi)} dari ${nf(e.terverifikasi)} terverifikasi menjadi KLB (total KLB ${nf(e.klb)})`} />
              </> : null}
              {!e && !i ? <div className="col-span-full"><Empty>Tidak ada alert/sinyal pada filter ini.</Empty></div> : null}
            </div>
            <Panel title="Tren mingguan alert/sinyal" desc="Per minggu epid: total alert/sinyal, terverifikasi, dan KLB.">
              {d.tren?.length ? (
                <div className="h-64"><ResponsiveContainer>
                  <LineChart data={d.tren} margin={{ right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => nf(v)} />
                    <Tooltip formatter={(v: any) => nf(v as number)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line isAnimationActive={false} dataKey="alert" name="Alert/sinyal" stroke="#d97706" strokeWidth={2} dot={false} />
                    <Line isAnimationActive={false} dataKey="terverifikasi" name="Terverifikasi" stroke="#0f766e" strokeWidth={2} dot={false} />
                    <Line isAnimationActive={false} dataKey="klb" name="KLB" stroke="#dc2626" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer></div>
              ) : <Empty />}
            </Panel>
            <Panel title="Alert/sinyal per penyakit" desc="Diurutkan menurut jumlah alert/sinyal. Klik untuk memfilter penyakit." tip={d.definisi?.konversi_klb}>
              <SignalTable rows={d.penyakit || []} first="Penyakit" ebs={ebs} ibs={ibs} onRow={(x) => set({ penyakit: [x.key] })} />
            </Panel>
            <Panel title={`Alert/sinyal per ${lvl.toLowerCase()}`} desc="Klik untuk menelusuri ke level berikutnya.">
              <SignalTable rows={d.wilayah || []} first={lvl} ebs={ebs} ibs={ibs} onRow={d.meta?.level !== 'unit' ? (x) => drill(d.meta?.level, x.key, set, f) : undefined} />
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="20 kecamatan hotspot" desc="Kecamatan dengan alert/sinyal terbanyak (seri: kasus). Hanya baris dengan kecamatan terisi." tip="Peringkat menurut jumlah alert/sinyal, lalu kasus.">
                {d.hotspot?.length ? (
                  <div className="skdr-table-card overflow-x-auto"><table className="skdr-table w-full text-[11px]">
                    <thead><tr><th className="text-right">#</th><th className="text-left">Kecamatan</th><th className="text-right">Alert/sinyal</th><th className="text-right">Kasus</th><th className="text-right">Terverifikasi</th><th className="text-right">KLB</th><th className="text-right">Kematian</th></tr></thead>
                    <tbody>{d.hotspot.map((x: any, n: number) => <tr key={x.key}><td className="text-right text-slate-400">{n + 1}</td><td className="font-semibold">{x.label}</td><td className="text-right font-bold">{nf(x.alert)}</td><td className="text-right">{nf(x.kasus)}</td><td className="text-right">{pf(x.verif_pct)}</td><td className="text-right">{nf(x.klb)}</td><td className="text-right">{nf(x.kematian)}</td></tr>)}</tbody>
                  </table></div>
                ) : <Empty>Belum ada alert/sinyal dengan kecamatan terisi.</Empty>}
              </Panel>
              {ebs ? (
                <Panel title="Analisa sumber informasi (Laporan EBS)" desc="Sinyal per sumber informasi dan kualitasnya (proporsi terverifikasi, konversi KLB).">
                  {siAllEmpty ? <Note>Sumber informasi belum diisi pada Laporan EBS periode ini (data impor API SKDR lama tidak memuat field ini). Analisa sumber tersedia untuk Laporan EBS yang diisi lewat form.</Note> : null}
                  <SignalTable rows={d.sumber_informasi || []} first="Sumber informasi" ebs ibs={false} />
                </Panel>
              ) : null}
            </div>
            <Panel title="Definisi indikator">
              <dl className="grid gap-2 text-[11.5px] md:grid-cols-2">{Object.entries(d.definisi || {}).map(([k, v]) => <div key={k}><dt className="font-bold text-slate-700">{({ alert_ibs: 'Alert IBS', sinyal_ebs: 'Sinyal EBS', konversi_klb: 'Konversi KLB', respon24: 'Respons ≤ 24 jam' } as any)[k] || k}</dt><dd className="text-slate-600">{String(v)}</dd></div>)}</dl>
            </Panel>
            <div className="text-[10.5px] text-slate-400">Waktu kueri: {d.ms} ms</div>
          </div>
        ) : null}
      </State>
      <div className="flex items-center gap-2"><span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600">Line list</span><Seg value={llv} onChange={(v) => setLl(v as DaftarJenis)} options={llOpts} testId="sinyal-linelist" /></div>
      <Daftar f={f} jenis={llv} />
    </div>
  )
}
