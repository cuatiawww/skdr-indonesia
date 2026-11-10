'use client'
// PR 042: Kinerja Pelaporan - IBS kelengkapan & ketepatan (capped at 100%, unit × minggu deduplicated, target line,
// traffic-light legend) and EBS cakupan unit pelapor, 7-1-7 timeliness and kelengkapan isian.
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nf, pf, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { Empty, ExportButton, InfoTip, Interpretasi, Kpi, kinerjaTone, Note, Panel, Pct, State } from './ui'
import { drill } from './TabRingkasan'

function Legenda({ ambang, target }: { ambang: any; target: number }) {
  const h = ambang?.hijau ?? 80, k = ambang?.kuning ?? 60
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600" data-testid="legenda-kinerja">
      <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-600" /> Baik ≥ {h}%</span>
      <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500" /> Perlu perhatian {k}–&lt;{h}%</span>
      <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-600" /> Rendah &lt; {k}%</span>
      <span className="inline-flex items-center gap-1"><span className="h-0.5 w-5 border-t-2 border-dashed border-slate-800" /> Target {target}%</span>
    </div>
  )
}

export default function TabKinerja({ f, set, focus }: { f: AFilter; set: (p: Partial<AFilter>) => void; focus?: 'kelengkapan' | 'ketepatan' }) {
  const r = useAnalisa('kinerja', f)
  const d: any = r.data
  const target = d?.target_pct ?? 80
  const amb = d?.ambang || {}
  const ibs = d?.ibs
  const ebs = d?.ebs
  const lvl = d?.meta?.level_label || 'Wilayah'
  const showL = focus !== 'ketepatan', showT = focus !== 'kelengkapan'
  const build = () => {
    const s: any[] = []
    if (ibs) {
      s.push({ name: 'IBS per wilayah', rows: [[lvl, 'Unit diharapkan', 'Laporan diharapkan (unit × minggu)', 'Laporan diterima', 'Tepat waktu', 'Kelengkapan (%)', 'Ketepatan thd diharapkan (%)', 'Ketepatan thd diterima (%)'], ...ibs.wilayah.map((x: any) => [x.label, x.unit, x.diharapkan, x.diterima, x.tepat, x.kelengkapan_pct, x.ketepatan_pct, x.ketepatan_diterima_pct]),
        ['TOTAL', ibs.total.unit, ibs.total.diharapkan, ibs.total.diterima, ibs.total.tepat, ibs.total.kelengkapan_pct, ibs.total.ketepatan_pct, null]], note: `${d.definisi?.kelengkapan || ''} ${d.definisi?.ketepatan || ''}` })
      s.push({ name: 'IBS per minggu', rows: [['Minggu epid', 'Unit diharapkan', 'Diterima', 'Tepat waktu', 'Kelengkapan (%)', 'Ketepatan (%)'], ...ibs.mingguan.map((x: any) => [x.label, x.diharapkan, x.diterima, x.tepat, x.kelengkapan_pct, x.ketepatan_pct])] })
      s.push({ name: 'IBS unit terendah', rows: [['Unit', 'Wilayah', 'Jenis unit', 'Minggu diharapkan', 'Diterima', 'Tepat waktu', 'Kelengkapan (%)', 'Ketepatan (%)'], ...ibs.unit_rendah.map((x: any) => [x.unit, x.wilayah, x.jenis_unit, x.diharapkan, x.diterima, x.tepat, x.kelengkapan_pct, x.ketepatan_pct])] })
    }
    if (ebs) {
      s.push({ name: 'EBS cakupan', rows: [[lvl, 'Puskesmas/RS melapor', 'Semua unit melapor', 'Fasyankes terdaftar', 'Cakupan (%)', 'Laporan', 'Kasus'], ...ebs.wilayah.map((x: any) => [x.label, x.unit_fasyankes_melapor, x.unit_melapor, x.fasyankes_terdaftar, x.cakupan_pct, x.laporan, x.kasus])], note: ebs.definisi_cakupan })
      s.push({ name: 'EBS 7-1-7', rows: [['Indikator', 'Definisi', 'Memenuhi', 'Penyebut', '%', 'Median (hari)'], ...ebs.t717.map((x: any) => [x.label, x.definisi, x.memenuhi, x.penyebut, x.pct, x.median_hari ?? null])] })
      s.push({ name: 'EBS kelengkapan isian', rows: [['Field', 'Terisi', 'Total laporan', '%'], ...ebs.isian.map((x: any) => [x.field, x.terisi, x.total, x.pct])] })
    }
    s.push({ name: 'Interpretasi', rows: [['Interpretasi'], ...(d?.interpretasi || []).map((x: string) => [x])] })
    return s
  }
  // Target drawn as a constant dashed series (a recharts reference line did not render in this React 19 setup).
  const bars = (rows0: any[], key: string, name: string) => {
    const rows = rows0.slice(0, 40).map((x) => ({ ...x, __target: target }))
    return (
      <div style={{ height: Math.max(220, rows.length * 20 + 60) }}><ResponsiveContainer>
        <ComposedChart data={rows} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 10 }} interval={0} />
          <Tooltip formatter={(v: any, n: any) => [pf(v as number), n]} />
          <Bar isAnimationActive={false} dataKey={key} name={name}>{rows.map((x, i) => <Cell key={i} fill={kinerjaTone(x[key], amb).color} />)}</Bar>
          <Line isAnimationActive={false} dataKey="__target" name={`Target ${target}%`} stroke="#0f172a" strokeDasharray="5 4" dot={false} activeDot={false} />
        </ComposedChart>
      </ResponsiveContainer></div>
    )
  }
  return (
    <State {...r}>
      {d ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><Legenda ambang={amb} target={target} /><ExportButton filename={`matriks-analisa-kinerja-${f.sumber}-${d.meta?.periode_label}`} build={build} /></div>
          <Interpretasi lines={d.interpretasi} />
          {ibs ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {showL ? <Kpi label="Kelengkapan IBS" value={ibs.total.kelengkapan_pct} pct tone={ibs.total.kelengkapan_pct >= target ? 'teal' : 'red'} tip={d.definisi?.kelengkapan} sub={`${nf(ibs.total.diterima)} / ${nf(ibs.total.diharapkan)} laporan`} /> : null}
                {showT ? <Kpi label="Ketepatan IBS" value={ibs.total.ketepatan_pct} pct tone={ibs.total.ketepatan_pct >= target ? 'teal' : 'red'} tip={d.definisi?.ketepatan} sub={`${nf(ibs.total.tepat)} tepat waktu (≤ ${d.batas_hari} hari dari awal minggu)`} /> : null}
                <Kpi label="Unit diharapkan" value={ibs.total.unit} tone="slate" tip="Unit dengan ≥ 1 Laporan Agregat IBS pada tahun yang sama di wilayah terpilih." />
                <Kpi label="Minggu dihitung" value={d.minggu_diharapkan} tone="slate" tip="Hanya minggu epid yang sudah berakhir yang dihitung sebagai minggu diharapkan." />
              </div>
              <Note>{ibs.catatan}</Note>
              <div className="grid gap-4 xl:grid-cols-2">
                {showL ? <Panel title={`Kelengkapan per ${lvl.toLowerCase()}`} tip={d.definisi?.kelengkapan} desc="Diurutkan dari yang terendah. Maks. 100% (unit × minggu dihitung sekali).">{ibs.wilayah.length ? bars(ibs.wilayah, 'kelengkapan_pct', 'Kelengkapan') : <Empty />}</Panel> : null}
                {showT ? <Panel title={`Ketepatan per ${lvl.toLowerCase()}`} tip={d.definisi?.ketepatan} desc="Ketepatan terhadap laporan diharapkan. Maks. 100%.">{ibs.wilayah.length ? bars([...ibs.wilayah].sort((a: any, b: any) => (a.ketepatan_pct ?? 0) - (b.ketepatan_pct ?? 0)), 'ketepatan_pct', 'Ketepatan') : <Empty />}</Panel> : null}
              </div>
              <Panel title="Tren mingguan kelengkapan & ketepatan" desc="Per minggu epid: laporan diterima ÷ unit diharapkan.">
                {ibs.mingguan.length ? (
                  <div className="h-64"><ResponsiveContainer>
                    <LineChart data={ibs.mingguan.map((x: any) => ({ ...x, __target: target }))} margin={{ right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: any) => pf(v as number)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line isAnimationActive={false} dataKey="__target" name={`Target ${target}%`} stroke="#0f172a" strokeDasharray="5 4" dot={false} />
                      {showL ? <Line isAnimationActive={false} dataKey="kelengkapan_pct" name="Kelengkapan" stroke="#0f766e" strokeWidth={2} /> : null}
                      {showT ? <Line isAnimationActive={false} dataKey="ketepatan_pct" name="Ketepatan" stroke="#2563eb" strokeWidth={2} /> : null}
                    </LineChart>
                  </ResponsiveContainer></div>
                ) : <Empty />}
              </Panel>
              <Panel title={`Tabel kinerja per ${lvl.toLowerCase()}`} desc="Klik nama untuk menelusuri.">
                <div className="skdr-table-card max-h-[520px] overflow-auto"><table className="skdr-table w-full text-[11px]">
                  <thead className="sticky top-0"><tr><th className="text-left">{lvl}</th><th className="text-right">Unit diharapkan <InfoTip text="Unit dengan ≥ 1 Laporan Agregat IBS pada tahun yang sama." /></th><th className="text-right">Laporan diharapkan <InfoTip text="Unit diharapkan × minggu epid yang sudah berakhir." /></th><th className="text-right">Diterima <InfoTip text="Unit × minggu dengan Laporan Agregat IBS terkirim (dihitung sekali)." /></th><th className="text-right">Tepat waktu</th>{showL ? <th className="text-right">Kelengkapan</th> : null}{showT ? <><th className="text-right">Ketepatan (thd diharapkan)</th><th className="text-right">Ketepatan (thd diterima)</th></> : null}</tr></thead>
                  <tbody>{ibs.wilayah.map((x: any) => <tr key={x.key}><td>{d.meta?.level !== 'unit' && x.key ? <button type="button" className="font-semibold text-primary hover:underline" onClick={() => drill(d.meta?.level, x.key, set, f)}>{x.label}</button> : x.label}</td><td className="text-right tabular-nums">{nf(x.unit)}</td><td className="text-right tabular-nums">{nf(x.diharapkan)}</td><td className="text-right tabular-nums">{nf(x.diterima)}</td><td className="text-right tabular-nums">{nf(x.tepat)}</td>{showL ? <td className="text-right"><Pct v={x.kelengkapan_pct} ambang={amb} /></td> : null}{showT ? <><td className="text-right"><Pct v={x.ketepatan_pct} ambang={amb} /></td><td className="text-right"><Pct v={x.ketepatan_diterima_pct} ambang={amb} /></td></> : null}</tr>)}</tbody>
                  <tfoot><tr className="bg-slate-100 font-bold"><td>TOTAL</td><td className="text-right">{nf(ibs.total.unit)}</td><td className="text-right">{nf(ibs.total.diharapkan)}</td><td className="text-right">{nf(ibs.total.diterima)}</td><td className="text-right">{nf(ibs.total.tepat)}</td>{showL ? <td className="text-right"><Pct v={ibs.total.kelengkapan_pct} ambang={amb} /></td> : null}{showT ? <><td className="text-right"><Pct v={ibs.total.ketepatan_pct} ambang={amb} /></td><td /></> : null}</tr></tfoot>
                </table></div>
              </Panel>
              <Panel title="20 unit dengan kelengkapan terendah" desc="Unit pelapor yang paling sering tidak mengirim Laporan Agregat IBS pada periode ini.">
                {ibs.unit_rendah.length ? (
                  <div className="skdr-table-card overflow-x-auto"><table className="skdr-table w-full text-[11px]">
                    <thead><tr><th className="text-left">Unit</th><th className="text-left">Wilayah</th><th className="text-left">Jenis</th><th className="text-right">Minggu diharapkan</th><th className="text-right">Diterima</th><th className="text-right">Tepat</th><th className="text-right">Kelengkapan</th><th className="text-right">Ketepatan</th></tr></thead>
                    <tbody>{ibs.unit_rendah.map((x: any, i: number) => <tr key={i}><td>{x.unit || '–'}</td><td>{x.wilayah}</td><td>{x.jenis_unit || '–'}</td><td className="text-right">{nf(x.diharapkan)}</td><td className="text-right">{nf(x.diterima)}</td><td className="text-right">{nf(x.tepat)}</td><td className="text-right"><Pct v={x.kelengkapan_pct} ambang={amb} /></td><td className="text-right"><Pct v={x.ketepatan_pct} ambang={amb} /></td></tr>)}</tbody>
                  </table></div>
                ) : <Empty />}
              </Panel>
            </>
          ) : null}
          {ebs ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Cakupan EBS" value={ebs.total.cakupan_pct} pct tone={(ebs.total.cakupan_pct ?? 0) >= target ? 'teal' : 'red'} tip={ebs.definisi_cakupan} sub={`${nf(ebs.total.unit_fasyankes_melapor)} / ${nf(ebs.total.fasyankes_terdaftar)} Puskesmas + RS`} />
                {ebs.t717.map((t: any) => <Kpi key={t.key} label={t.label} value={t.pct} pct tone={t.pct === null ? 'slate' : t.pct >= target ? 'teal' : 'amber'} tip={t.definisi} sub={t.penyebut ? `${nf(t.memenuhi)} / ${nf(t.penyebut)}${t.median_hari !== undefined && t.median_hari !== null ? ` · median ${nf(t.median_hari, 1)} hari` : ''}` : 'Belum bisa dihitung (field kosong)'} />)}
              </div>
              <Panel title={`Cakupan unit pelapor EBS per ${lvl.toLowerCase()}`} tip={ebs.definisi_cakupan} desc="Unit Puskesmas/RS yang mengirim ≥ 1 Laporan EBS ÷ Puskesmas + RS terdaftar. Maks. 100%.">
                {ebs.wilayah.length ? (
                  <>
                    {bars([...ebs.wilayah].filter((x: any) => x.fasyankes_terdaftar > 0).sort((a: any, b: any) => (a.cakupan_pct ?? 0) - (b.cakupan_pct ?? 0)), 'cakupan_pct', 'Cakupan')}
                    <div className="skdr-table-card mt-3 max-h-[480px] overflow-auto"><table className="skdr-table w-full text-[11px]">
                      <thead className="sticky top-0"><tr><th className="text-left">{lvl}</th><th className="text-right">Puskesmas/RS melapor</th><th className="text-right">Semua unit melapor</th><th className="text-right">Fasyankes terdaftar</th><th className="text-right">Cakupan</th><th className="text-right">Laporan EBS</th><th className="text-right">Kasus</th></tr></thead>
                      <tbody>{ebs.wilayah.map((x: any) => <tr key={x.key}><td>{x.label || '(Tanpa wilayah)'}{x.lebih_dari_terdaftar ? <InfoTip text="Unit melapor lebih banyak dari fasyankes terdaftar (nama unit berbeda ejaan / unit non-master); cakupan dibatasi 100%." /> : null}</td><td className="text-right">{nf(x.unit_fasyankes_melapor)}</td><td className="text-right">{nf(x.unit_melapor)}</td><td className="text-right">{nf(x.fasyankes_terdaftar)}</td><td className="text-right"><Pct v={x.cakupan_pct} ambang={amb} /></td><td className="text-right">{nf(x.laporan)}</td><td className="text-right">{nf(x.kasus)}</td></tr>)}</tbody>
                    </table></div>
                  </>
                ) : <Empty>Tidak ada Laporan EBS pada periode ini.</Empty>}
              </Panel>
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Ketepatan waktu 7-1-7 (Laporan EBS)" tip="Target 7-1-7: deteksi ≤ 7 hari sejak mulai gejala, notifikasi ≤ 1 hari sejak deteksi, respons awal ≤ 7 hari sejak notifikasi.">
                  <div className="skdr-table-card overflow-x-auto"><table className="skdr-table w-full text-[11px]">
                    <thead><tr><th className="text-left">Indikator</th><th className="text-right">Memenuhi</th><th className="text-right">Penyebut</th><th className="text-right">%</th><th className="text-right">Median</th></tr></thead>
                    <tbody>{ebs.t717.map((t: any) => <tr key={t.key}><td><b>{t.label}</b><div className="text-[10px] text-slate-500">{t.definisi}</div></td><td className="text-right">{nf(t.memenuhi)}</td><td className="text-right">{nf(t.penyebut)}</td><td className="text-right">{t.penyebut ? <Pct v={t.pct} ambang={amb} /> : '–'}</td><td className="text-right">{t.median_hari === undefined || t.median_hari === null ? '–' : `${nf(t.median_hari, 1)} hari`}</td></tr>)}</tbody>
                  </table></div>
                  <div className="mt-2 text-[10.5px] text-slate-500">Respons memakai pembaruan pertama laporan setelah dibuat sebagai proksi tindakan awal.</div>
                </Panel>
                <Panel title="Kelengkapan isian Laporan EBS" tip="Persentase Laporan EBS yang mengisi tiap field. Field kosong membatasi analisa (mis. W1, umur, tanggal mulai gejala).">
                  <div className="skdr-table-card overflow-x-auto"><table className="skdr-table w-full text-[11px]">
                    <thead><tr><th className="text-left">Field</th><th className="text-right">Terisi</th><th className="text-right">Total</th><th className="text-right">%</th></tr></thead>
                    <tbody>{ebs.isian.map((x: any) => <tr key={x.field}><td>{x.field}</td><td className="text-right">{nf(x.terisi)}</td><td className="text-right">{nf(x.total)}</td><td className="text-right"><Pct v={x.pct} ambang={amb} /></td></tr>)}</tbody>
                  </table></div>
                </Panel>
              </div>
            </>
          ) : null}
          <div className="text-[10.5px] text-slate-400">Waktu kueri: {d.ms} ms</div>
        </div>
      ) : null}
    </State>
  )
}
