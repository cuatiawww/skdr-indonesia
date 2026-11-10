'use client'
// PR 042: Profil Kasus - kelompok umur × jenis kelamin (Laporan EBS isian usia + Laporan Individu IBS), kematian, CFR + 95% CI.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nf, pf, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { Empty, ExportButton, InfoTip, Interpretasi, Kpi, Note, Panel, State } from './ui'
import { drill } from './TabRingkasan'

export default function TabProfil({ f, set, cakupan }: { f: AFilter; set: (p: Partial<AFilter>) => void; cakupan?: any }) {
  const r = useAnalisa('profil', f)
  const d: any = r.data
  const usia: any[] = d?.usia || []
  const jk = d?.jenis_kelamin || { pria: 0, wanita: 0 }
  const adaUsia = jk.pria + jk.wanita > 0 || usia.some((x) => x.total > 0)
  const tot = d?.total || {}
  const ci = (c: any) => (c ? `${pf(c[0])}–${pf(c[1])}` : '–')
  const build = () => [
    { name: 'Umur x jenis kelamin', rows: [['Kelompok umur', 'Laki-laki', 'Perempuan', 'Tidak diketahui', 'Total', 'Kematian'], ...usia.map((x) => [x.label, x.pria, x.wanita, x.lain, x.total, x.kematian])], note: d?.definisi?.usia },
    { name: 'CFR per penyakit', rows: [['Penyakit', 'Kasus', 'Kematian', 'CFR (%)', 'CI95 bawah', 'CI95 atas'], ...(d?.cfr || []).map((x: any) => [x.label, x.kasus, x.kematian, x.cfr_pct, x.ci95?.[0], x.ci95?.[1]])], note: d?.definisi?.cfr },
    { name: 'Kematian per wilayah', rows: [[d?.meta?.level_label || 'Wilayah', 'Kasus', 'Kematian', 'CFR (%)'], ...(d?.kematian_wilayah || []).map((x: any) => [x.label, x.kasus, x.kematian, x.cfr_pct])] },
    { name: 'Interpretasi', rows: [['Interpretasi'], ...(d?.interpretasi || []).map((s: string) => [s])] },
  ]
  return (
    <State {...r}>
      {d ? (
        <div className="space-y-4">
          <div className="flex justify-end"><ExportButton filename={`matriks-analisa-profil-${f.sumber}-${d.meta?.periode_label}`} build={build} /></div>
          <Interpretasi lines={d.interpretasi} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Kasus" value={tot.kasus} />
            <Kpi label="Kematian" value={tot.kematian} tone="red" />
            <Kpi label="CFR" value={tot.cfr_pct} pct tone="red" tip={d.definisi?.cfr} sub={`95% CI ${ci(tot.ci95)}`} />
            <Kpi label="Kasus dengan umur/JK" value={jk.pria + jk.wanita} tone="blue" tip={d.definisi?.usia}
              sub={`EBS ${nf(d.cakupan?.ebs_laporan_berumur)} dari ${nf(d.cakupan?.ebs_laporan)} laporan · Individu IBS ${nf(d.cakupan?.individu_pasien)} pasien`} />
          </div>
          <Panel title="Kelompok umur & jenis kelamin" tip={d.definisi?.usia} desc="Kasus per kelompok umur menurut jenis kelamin. Sumber: isian usia Laporan EBS (form) dan Laporan Individu IBS.">
            {!adaUsia ? (
              <Empty title="Distribusi umur & jenis kelamin belum tersedia">
                Laporan Agregat IBS dan Laporan EBS hasil impor API SKDR lama tidak memuat umur/jenis kelamin. Data ini muncul setelah Laporan EBS diisi lewat form (isian usia) atau Laporan Individu IBS dikirim
                {cakupan?.ibs ? ` (saat ini ${nf(cakupan.ibs.individu)} Laporan Individu IBS).` : '.'}
              </Empty>
            ) : (
              <>
                <div className="h-72"><ResponsiveContainer>
                  <BarChart data={usia.filter((x) => x.key !== '(Belum diisi)')} margin={{ right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => nf(v)} />
                    <Tooltip formatter={(v: any) => nf(v as number)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar isAnimationActive={false} dataKey="pria" name="Laki-laki" fill="#2563eb" /><Bar isAnimationActive={false} dataKey="wanita" name="Perempuan" fill="#db2777" /><Bar isAnimationActive={false} dataKey="kematian" name="Kematian" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer></div>
                <div className="skdr-table-card mt-3 overflow-x-auto"><table className="skdr-table w-full text-[11px]">
                  <thead><tr><th className="text-left">Kelompok umur</th><th className="text-right">Laki-laki</th><th className="text-right">Perempuan</th><th className="text-right">Tidak diketahui</th><th className="text-right">Total</th><th className="text-right">Porsi</th><th className="text-right">Kematian</th></tr></thead>
                  <tbody>{usia.map((x) => { const all = usia.reduce((a, y) => a + y.total, 0); return <tr key={x.key}><td>{x.label}</td><td className="text-right">{nf(x.pria)}</td><td className="text-right">{nf(x.wanita)}</td><td className="text-right">{nf(x.lain)}</td><td className="text-right font-bold">{nf(x.total)}</td><td className="text-right">{pf(all ? Math.round((x.total / all) * 1000) / 10 : null)}</td><td className="text-right">{nf(x.kematian)}</td></tr> })}</tbody>
                  <tfoot><tr className="bg-slate-100 font-bold"><td>TOTAL</td><td className="text-right">{nf(jk.pria)}</td><td className="text-right">{nf(jk.wanita)}</td><td className="text-right">{nf(usia.reduce((a, y) => a + y.lain, 0))}</td><td className="text-right">{nf(usia.reduce((a, y) => a + y.total, 0))}</td><td className="text-right">100%</td><td className="text-right">{nf(usia.reduce((a, y) => a + y.kematian, 0))}</td></tr></tfoot>
                </table></div>
              </>
            )}
          </Panel>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Kematian & CFR per penyakit" tip={d.definisi?.cfr} desc="Diurutkan menurut jumlah kematian. CI 95% Wilson; CI lebar = jumlah kasus kecil, tafsirkan hati-hati.">
              {!(d.cfr || []).length ? <Empty /> : (
                <div className="skdr-table-card max-h-[480px] overflow-auto"><table className="skdr-table w-full text-[11px]">
                  <thead className="sticky top-0"><tr><th className="text-left">Penyakit</th><th className="text-right">Kasus</th><th className="text-right">Kematian</th><th className="text-right">CFR</th><th className="text-right">CI 95% <InfoTip text="Selang kepercayaan 95% metode Wilson." /></th></tr></thead>
                  <tbody>{d.cfr.map((x: any) => <tr key={x.penyakit}><td className="font-semibold">{x.label}</td><td className="text-right">{nf(x.kasus)}</td><td className="text-right font-bold">{nf(x.kematian)}</td><td className="text-right">{pf(x.cfr_pct)}</td><td className="text-right text-slate-500">{ci(x.ci95)}</td></tr>)}</tbody>
                </table></div>
              )}
            </Panel>
            <Panel title={`Kematian per ${(d.meta?.level_label || 'wilayah').toLowerCase()}`} desc="Diurutkan menurut jumlah kematian. Klik untuk menelusuri.">
              {!(d.kematian_wilayah || []).length ? <Empty /> : (
                <div className="skdr-table-card max-h-[480px] overflow-auto"><table className="skdr-table w-full text-[11px]">
                  <thead className="sticky top-0"><tr><th className="text-left">{d.meta?.level_label}</th><th className="text-right">Kasus</th><th className="text-right">Kematian</th><th className="text-right">CFR</th></tr></thead>
                  <tbody>{d.kematian_wilayah.map((x: any) => <tr key={x.key}><td>{d.meta?.level !== 'unit' && x.key ? <button type="button" className="font-semibold text-primary hover:underline" onClick={() => drill(d.meta?.level, x.key, set, f)}>{x.label}</button> : x.label}</td><td className="text-right">{nf(x.kasus)}</td><td className="text-right font-bold">{nf(x.kematian)}</td><td className="text-right">{pf(x.cfr_pct)}</td></tr>)}</tbody>
                </table></div>
              )}
            </Panel>
          </div>
          {f.sumber !== 'ebs' ? <Note>Untuk IBS, kasus adalah kasus agregat (suspek) dari Laporan Agregat IBS; CFR adalah CFR kasus terlapor.</Note> : null}
          <div className="text-[10.5px] text-slate-400">Waktu kueri: {d.ms} ms</div>
        </div>
      ) : null}
    </State>
  )
}
