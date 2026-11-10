'use client'
// PR 042: Matriks & Laporan - generic pivot (baris × kolom × ukuran) with heatmap table, TOTAL row/column, chart,
// wilayah drilldown + breadcrumb, and a "Jenis Laporan" selector that reproduces every old IBS/EBS report, graph and diagram.
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nf, pf, SUMBER_LABEL, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { COLORS, Empty, ExportButton, heat, InfoTip, Interpretasi, Note, Panel, Seg, State } from './ui'
import { DIM_LABEL, GROUPS, PRESETS, UKURAN_DEF, UKURAN_IDX, UKURAN_LABEL, type Dim, type Preset, type Ukuran } from './presets'
import Daftar from './Daftar'
import TabKinerja from './TabKinerja'
import { drill } from './TabRingkasan'

const NATURAL: Dim[] = ['periode', 'kel_umur']
const USIA_ORDER = ['0_7hr', '8_28hr', 'lt1th', '1_4th', '5_9th', '10_14th', '15_19th', '20_44th', '45_54th', '55_69th', 'gt70th']
const MAX_COLS = 40
const EBS_ONLY: Dim[] = ['status_rumor', 'klb_status', 'w1', 'sumber_info']

export default function TabMatriks({ f, set, sync, potensial }: { f: AFilter; set: (p: Partial<AFilter>) => void; sync: (extra: Record<string, string | null>) => void; potensial?: string[] }) {
  const [pid, setPid] = useState('matriks')
  const [baris, setBaris] = useState<Dim>('wilayah')
  const [kolom, setKolom] = useState<Dim>('penyakit')
  const [ukuran, setUkuran] = useState<Ukuran[]>(['kasus'])
  const [view, setView] = useState<'both' | 'tabel' | 'grafik'>('both')
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const j = sp.get('jenis'); const pr = PRESETS.find((x) => x.id === j)
    if (pr) apply(pr, false)
    if (j === 'kustom') { const b = sp.get('baris') as Dim; const k = sp.get('kolom') as Dim; const u = (sp.get('ukuran') || '').split(',').filter(Boolean) as Ukuran[]; if (b) setBaris(b); if (k) setKolom(k); if (u.length) setUkuran(u) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const preset = PRESETS.find((x) => x.id === pid) || PRESETS[0]
  function apply(pr: Preset, user = true) {
    setPid(pr.id)
    if (pr.kind === 'pivot' && pr.id !== 'kustom') { setBaris(pr.baris!); setKolom(pr.kolom!); setUkuran(pr.ukuran!) }
    if (user) {
      if (pr.src !== 'any' && pr.src !== f.sumber) set({ sumber: pr.src })
      sync({ jenis: pr.id, baris: null, kolom: null, ukuran: null })
    }
  }
  const setCustom = (b: Dim, k: Dim, u: Ukuran[]) => { setBaris(b); setKolom(k); setUkuran(u); setPid('kustom'); sync({ jenis: 'kustom', baris: b, kolom: k, ukuran: u.join(',') }) }
  const qf: AFilter = useMemo(() => {
    const g: AFilter = { ...f, ...(preset.fx || {}) }
    if (preset.potensial && !f.penyakit.length && potensial?.length) g.penyakit = potensial
    return g
  }, [f, preset, potensial])
  const visiblePresets = PRESETS.filter((x) => x.src === 'any' || x.src === f.sumber || (f.sumber === 'semua' && x.src !== 'semua') || x.src === 'semua' && f.sumber === 'semua')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <label className="min-w-[18rem] flex-1">
          <div className="mb-1 flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600">Jenis laporan / grafik / diagram <InfoTip text="Semua jenis laporan, grafik, dan diagram dari menu Analisa IBS & EBS lama tersedia di sini. Memilih jenis milik sumber lain otomatis mengganti Sumber." /></div>
          <select value={pid} onChange={(e) => apply(PRESETS.find((x) => x.id === e.target.value)!)} data-testid="jenis-laporan"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-primary">
            {GROUPS.map((g) => {
              const items = (f.sumber === 'semua' ? PRESETS : visiblePresets).filter((x) => x.group === g)
              return items.length ? <optgroup key={g} label={g}>{items.map((x) => <option key={x.id} value={x.id}>{x.label}{x.src !== 'any' && x.src !== f.sumber ? ` (${x.src.toUpperCase()})` : ''}</option>)}</optgroup> : null
            })}
            {f.sumber !== 'semua' ? <optgroup label="Sumber lain">{PRESETS.filter((x) => !visiblePresets.includes(x)).map((x) => <option key={x.id} value={x.id}>{x.group}: {x.label}</option>)}</optgroup> : null}
          </select>
        </label>
        {preset.kind === 'pivot' ? (
          <>
            <DimSel label="Baris" value={baris} onChange={(v) => setCustom(v, kolom === v ? 'none' : kolom, ukuran)} sumber={f.sumber} />
            <DimSel label="Kolom" value={kolom} onChange={(v) => setCustom(baris, v, v === 'none' ? ukuran : ukuran.slice(0, 1))} sumber={f.sumber} allowNone />
            <label>
              <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600">Ukuran</div>
              <select value={ukuran[0]} onChange={(e) => setCustom(baris, kolom, [e.target.value as Ukuran, ...(kolom === 'none' ? ukuran.slice(1).filter((u) => u !== e.target.value) : [])])} data-testid="ukuran"
                className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold">{(Object.keys(UKURAN_LABEL) as Ukuran[]).map((u) => <option key={u} value={u}>{UKURAN_LABEL[u]}</option>)}</select>
            </label>
            <Seg value={view} onChange={(v) => setView(v as typeof view)} options={[{ value: 'both', label: 'Tabel + grafik' }, { value: 'tabel', label: 'Tabel' }, { value: 'grafik', label: 'Grafik' }]} testId="matriks-view" />
          </>
        ) : null}
      </div>
      {preset.lama ? <div className="text-[11px] text-slate-500">Menggantikan: <b>{preset.lama}</b>{preset.desc ? ` · ${preset.desc}` : ''}</div> : null}
      {preset.fx && Object.keys(preset.fx).length ? <Note tone="blue">Jenis laporan ini menambahkan filter: {Object.entries(preset.fx).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join('/') : v}`).join(', ')}.</Note> : null}
      {preset.potensial ? <Note tone="blue">Penyakit potensial wabah mengikuti pengaturan <code>matriks_analisa.potensial_wabah</code>{f.penyakit.length ? ' — filter penyakit yang Anda pilih dipakai.' : '.'}</Note> : null}
      {preset.kind === 'daftar' ? <Daftar f={qf} jenis={preset.daftar!} /> : null}
      {preset.kind === 'kinerja' ? <TabKinerja f={qf} set={set} focus={preset.kinerja} /> : null}
      {preset.kind === 'rumorverif' ? <RumorVerif f={qf} /> : null}
      {preset.kind === 'pivot' ? <PivotView f={qf} set={set} baris={baris} kolom={kolom} ukuran={ukuran} chart={pid === 'kustom' ? (baris === 'periode' ? 'line' : kolom === 'none' ? 'bar' : 'stack') : preset.chart || 'bar'} view={view} title={preset.id === 'kustom' ? `${DIM_LABEL[baris]} × ${DIM_LABEL[kolom]}` : preset.label} /> : null}
    </div>
  )
}

function DimSel({ label, value, onChange, sumber, allowNone }: { label: string; value: Dim; onChange: (v: Dim) => void; sumber: string; allowNone?: boolean }) {
  const dims = (Object.keys(DIM_LABEL) as Dim[]).filter((d) => (allowNone || d !== 'none') && (sumber === 'ebs' || !EBS_ONLY.includes(d)) && (sumber === 'semua' || d !== 'sumber'))
  return (
    <label>
      <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value as Dim)} data-testid={`dim-${label.toLowerCase()}`} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold">
        {dims.map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
      </select>
    </label>
  )
}

type Row = { key: string; label: string; vals: Record<string, number>; total: number }
type ColT = { key: string; label: string; total: number }

function buildMatrix(data: any[], baris: Dim, kolom: Dim, ukuran: Ukuran[]) {
  const multi = kolom === 'none' && ukuran.length > 1
  const rows = new Map<string, Row>()
  const cols = new Map<string, ColT>()
  for (const d of data) {
    const r = rows.get(d[1]) || { key: d[1], label: d[0], vals: {}, total: 0 }
    if (multi) {
      for (const u of ukuran) { r.vals[u] = (r.vals[u] || 0) + d[UKURAN_IDX[u]]; const c = cols.get(u) || { key: u, label: UKURAN_LABEL[u], total: 0 }; c.total += d[UKURAN_IDX[u]]; cols.set(u, c) }
      r.total += d[UKURAN_IDX[ukuran[0]]]
    } else {
      const v = d[UKURAN_IDX[ukuran[0]]]
      r.vals[d[3]] = (r.vals[d[3]] || 0) + v; r.total += v
      const c = cols.get(d[3]) || { key: d[3], label: kolom === 'none' ? UKURAN_LABEL[ukuran[0]] : d[2], total: 0 }; c.total += v; cols.set(d[3], c)
    }
    rows.set(d[1], r)
  }
  const nat = (dim: Dim) => (a: { key: string }, b: { key: string }) => dim === 'kel_umur' ? idx(a.key) - idx(b.key) : a.key.localeCompare(b.key)
  const idx = (k: string) => { const i = USIA_ORDER.indexOf(k); return i < 0 ? 99 : i }
  let rs = [...rows.values()].sort(NATURAL.includes(baris) ? nat(baris) : (a, b) => b.total - a.total || a.label.localeCompare(b.label))
  let cs = [...cols.values()]
  if (!multi) cs.sort(NATURAL.includes(kolom) ? nat(kolom) : (a, b) => b.total - a.total || a.label.localeCompare(b.label))
  let other = false
  if (cs.length > MAX_COLS) {
    other = true
    const keep = new Set(cs.slice(0, MAX_COLS - 1).map((c) => c.key))
    const rest = cs.slice(MAX_COLS - 1)
    const lain: ColT = { key: '__lain', label: `Lainnya (${rest.length})`, total: rest.reduce((a, c) => a + c.total, 0) }
    rs = rs.map((r) => { const v: Record<string, number> = {}; let l = 0; for (const [k, x] of Object.entries(r.vals)) { if (keep.has(k)) v[k] = x; else l += x } if (l) v.__lain = l; return { ...r, vals: v } })
    cs = [...cs.slice(0, MAX_COLS - 1), lain]
  }
  return { rs, cs, multi, other, grand: multi ? 0 : rs.reduce((a, r) => a + r.total, 0) }
}

function PivotView({ f, set, baris, kolom, ukuran, chart, view, title }: { f: AFilter; set: (p: Partial<AFilter>) => void; baris: Dim; kolom: Dim; ukuran: Ukuran[]; chart: string; view: string; title: string }) {
  const r = useAnalisa('pivot', f, { baris, kolom })
  const d: any = r.data
  const m = useMemo(() => buildMatrix(d?.data || [], baris, kolom, ukuran), [d, baris, kolom, ukuran])
  const max = useMemo(() => Math.max(1, ...m.rs.flatMap((x) => m.cs.map((c) => x.vals[c.key] || 0))), [m])
  const level = d?.meta?.level
  const canDrill = baris === 'wilayah' && level && level !== 'unit'
  const crumbs: any[] = d?.meta?.breadcrumb || []
  const goCrumb = (lv: string) => {
    if (lv === 'nasional') set({ prov: '', kab: '', kec: '' })
    else if (lv === 'provinsi') set({ kab: '', kec: '' })
    else if (lv === 'kabkota') set({ kec: '' })
  }
  const rowName = baris === 'wilayah' ? d?.meta?.level_label || 'Wilayah' : DIM_LABEL[baris]
  const kosong = [...m.rs.filter((x) => x.key === '(Belum diisi)'), ...m.cs.filter((c) => c.key === '(Belum diisi)')]
  const totalAll = m.multi ? (m.cs[0]?.total || 0) : m.grand
  const kosongPct = kosong.length && totalAll ? Math.round((kosong[0].total / totalAll) * 100) : 0
  const interp = useMemo(() => {
    if (!m.rs.length) return []
    const u = UKURAN_LABEL[ukuran[0]].toLowerCase()
    const L: string[] = []
    const ranked = [...m.rs].sort((a, b) => b.total - a.total)
    L.push(`${d?.meta?.periode_label || ''} · ${SUMBER_LABEL[f.sumber]}: total ${nf(totalAll)} ${u} pada ${nf(m.rs.length)} ${rowName.toLowerCase()}.`)
    if (ranked[0] && totalAll) L.push(`Tertinggi: ${ranked[0].label} (${nf(ranked[0].total)}, ${pf(Math.round((ranked[0].total / totalAll) * 1000) / 10)} dari total)${ranked[1] ? `, diikuti ${ranked[1].label} (${nf(ranked[1].total)})` : ''}.`)
    if (!m.multi && kolom !== 'none' && m.cs[0]) L.push(`${DIM_LABEL[kolom]} terbanyak: ${m.cs[0].label} (${nf(m.cs[0].total)}, ${pf(Math.round((m.cs[0].total / Math.max(1, totalAll)) * 1000) / 10)}).`)
    if (baris === 'periode' && m.rs.length >= 2) {
      const a = m.rs[m.rs.length - 2].total, b = m.rs[m.rs.length - 1].total
      if (a > 0) L.push(`Periode terakhir (${m.rs[m.rs.length - 1].label}) ${b >= a ? 'naik' : 'turun'} ${Math.abs(Math.round(((b - a) / a) * 100))}% dibanding periode sebelumnya.`)
    }
    if (m.multi && ukuran.includes('kasus') && ukuran.includes('kematian')) { const k = m.cs.find((c) => c.key === 'kasus')?.total || 0; const mt = m.cs.find((c) => c.key === 'kematian')?.total || 0; if (k) L.push(`CFR keseluruhan ${pf(Math.round((mt / k) * 1000) / 10)} (${nf(mt)} kematian / ${nf(k)} kasus).`) }
    return L
  }, [m, d, ukuran, kolom, baris, f.sumber, rowName, totalAll])
  const build = () => [{
    name: title.slice(0, 31),
    rows: [[rowName, ...m.cs.map((c) => c.label), ...(m.multi ? [] : ['TOTAL'])], ...m.rs.map((x) => [x.label, ...m.cs.map((c) => x.vals[c.key] || 0), ...(m.multi ? [] : [x.total])]),
      ['TOTAL', ...m.cs.map((c) => c.total), ...(m.multi ? [] : [m.grand])]],
    note: `${title} · ${SUMBER_LABEL[f.sumber]} · ${d?.meta?.periode_label || ''} · ${crumbs.map((c) => c.label).join(' > ')} · Ukuran: ${ukuran.map((u) => UKURAN_LABEL[u]).join(', ')}`,
  }, { name: 'Interpretasi', rows: [['Interpretasi'], ...interp.map((s) => [s])] }]
  // chart data
  const chartRows = chart === 'line' ? m.rs : m.rs.slice(0, 20)
  const series = m.cs.slice(0, chart === 'pie' ? 1 : 8)
  const cdata = chartRows.map((x) => { const o: any = { label: x.label }; for (const c of series) o[c.key] = x.vals[c.key] || 0; if (!m.multi && m.cs.length > series.length) o.__rest = x.total - series.reduce((a, c) => a + (x.vals[c.key] || 0), 0); return o })
  const hasRest = !m.multi && chart !== 'pie' && m.cs.length > series.length
  return (
    <State {...r} kind="table">
      {d ? (
        <div className="space-y-3">
          <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Breadcrumb wilayah" data-testid="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.level} className="inline-flex items-center gap-1">
                {i > 0 ? <ChevronRight className="h-3 w-3 text-slate-400" /> : null}
                {i < crumbs.length - 1 ? <button type="button" onClick={() => goCrumb(c.level)} className="font-semibold text-primary hover:underline">{c.label}</button> : <span className="font-bold text-slate-800">{c.label}</span>}
              </span>
            ))}
            <span className="ml-2 text-slate-400">· baris = {rowName}{canDrill ? ' (klik untuk menelusuri)' : ''}</span>
          </nav>
          <Interpretasi lines={interp} />
          {kosongPct >= 30 ? <Note>{kosongPct}% {UKURAN_LABEL[ukuran[0]].toLowerCase()} berada pada kategori "(Belum diisi)": field ini tidak diisi pada sebagian besar laporan (data impor API SKDR lama tidak memuat field ini). Angka per kategori hanya mewakili laporan yang mengisi.</Note> : null}
          {d.truncated ? <Note tone="red">Hasil dipotong pada 60.000 sel. Persempit filter.</Note> : null}
          {m.other ? <Note>Hanya {MAX_COLS - 1} kolom terbesar ditampilkan; sisanya digabung ke "Lainnya" (ekspor Excel memuat kolom yang sama).</Note> : null}
          {!m.rs.length ? <Empty>Tidak ada data untuk kombinasi ini. Coba ubah periode atau filter.</Empty> : (
            <>
              {view !== 'tabel' && chart !== 'none' ? (
                <Panel title={title} desc={`${UKURAN_LABEL[ukuran[0]]}${m.multi ? ', ' + ukuran.slice(1).map((u) => UKURAN_LABEL[u]).join(', ') : ''} · diurutkan menurut nilai${chart !== 'line' && m.rs.length > 20 ? ' (20 teratas)' : ''}`} tip={UKURAN_DEF[ukuran[0]]} testId="matriks-chart">
                  <div style={{ height: chart === 'line' || chart === 'pie' ? 300 : Math.max(220, chartRows.length * 24 + 60) }}>
                    <ResponsiveContainer>
                      {chart === 'line' ? (
                        <LineChart data={cdata} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => nf(v)} />
                          <Tooltip formatter={(v: any) => nf(v as number)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                          {series.map((c, i) => <Line isAnimationActive={false} key={c.key} dataKey={c.key} name={c.label} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />)}
                        </LineChart>
                      ) : chart === 'pie' ? (
                        <PieChart>
                          <Pie isAnimationActive={false} data={m.rs.slice(0, 12).map((x) => ({ name: x.label, value: x.total }))} dataKey="value" nameKey="name" outerRadius={110} label={(e: any) => `${e.name}: ${nf(e.value)}`}>
                            {m.rs.slice(0, 12).map((x, i) => <Cell key={x.key} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => nf(v as number)} />
                        </PieChart>
                      ) : (
                        <BarChart data={cdata} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => nf(v)} />
                          <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: any) => nf(v as number)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                          {series.map((c, i) => <Bar isAnimationActive={false} key={c.key} dataKey={c.key} name={c.label} stackId={chart === 'stack' ? 's' : undefined} fill={COLORS[i % COLORS.length]} />)}
                          {hasRest ? <Bar isAnimationActive={false} dataKey="__rest" name="Lainnya" stackId={chart === 'stack' ? 's' : undefined} fill="#cbd5e1" /> : null}
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </Panel>
              ) : null}
              {view !== 'grafik' ? (
                <Panel title={`Tabel: ${title}`} desc="Warna sel = intensitas relatif terhadap sel terbesar. Baris diurutkan menurut total (periode/umur menurut urutan waktu/umur)." testId="matriks-table"
                  actions={<ExportButton filename={`matriks-analisa-${title}-${d.meta?.periode_label}`} build={build} />}>
                  <div className="skdr-table-card max-h-[640px] overflow-auto">
                    <table className="skdr-table w-full text-[11px]">
                      <thead className="sticky top-0 z-20"><tr>
                        <th className="sticky left-0 z-30 bg-slate-50 text-left">{rowName}</th>
                        {m.cs.map((c) => <th key={c.key} className="whitespace-nowrap text-right">{c.label}</th>)}
                        {!m.multi ? <th className="text-right">TOTAL</th> : null}
                      </tr></thead>
                      <tbody>
                        {m.rs.map((x) => (
                          <tr key={x.key}>
                            <td className="sticky left-0 z-10 whitespace-nowrap bg-white font-semibold">
                              {canDrill && x.key ? <button type="button" className="text-left text-primary hover:underline" onClick={() => drill(level, x.key, set, f)} title="Telusuri ke level berikutnya">{x.label}</button> : x.label}
                            </td>
                            {m.cs.map((c) => { const v = x.vals[c.key] || 0; return <td key={c.key} className="text-right tabular-nums" style={m.multi ? undefined : heat(v, max)}>{nf(v)}</td> })}
                            {!m.multi ? <td className="text-right font-bold tabular-nums">{nf(x.total)}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-20"><tr className="bg-slate-100 font-bold">
                        <td className="sticky left-0 bg-slate-100">TOTAL</td>
                        {m.cs.map((c) => <td key={c.key} className="text-right tabular-nums">{nf(c.total)}</td>)}
                        {!m.multi ? <td className="text-right tabular-nums">{nf(m.grand)}</td> : null}
                      </tr></tfoot>
                    </table>
                  </div>
                  <div className="mt-1 text-[10.5px] text-slate-400">{nf(m.rs.length)} baris × {nf(m.cs.length)} kolom · kueri {d.ms} ms · 0 ditampilkan sebagai 0 (bukan kosong).</div>
                </Panel>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </State>
  )
}

function RumorVerif({ f }: { f: AFilter }) {
  const a = useAnalisa('pivot', { ...f, basis: 'rumor' }, { baris: 'penyakit', kolom: 'none' })
  const b = useAnalisa('pivot', { ...f, basis: 'verif', verif: ['Terverifikasi'] }, { baris: 'penyakit', kolom: 'none' })
  const rows = useMemo(() => {
    const m = new Map<string, { label: string; rumor: number; verif: number }>()
    for (const d of (a.data as any)?.data || []) { const k = String(d[0]).toLowerCase(); const o = m.get(k) || { label: d[0], rumor: 0, verif: 0 }; o.rumor += d[4]; m.set(k, o) }
    for (const d of (b.data as any)?.data || []) { const k = String(d[0]).toLowerCase(); const o = m.get(k) || { label: d[0], rumor: 0, verif: 0 }; o.verif += d[4]; m.set(k, o) }
    return [...m.values()].sort((x, y) => y.rumor + y.verif - x.rumor - x.verif)
  }, [a.data, b.data])
  const tr = rows.reduce((s, x) => s + x.rumor, 0), tv = rows.reduce((s, x) => s + x.verif, 0)
  return (
    <State loading={a.loading || b.loading} error={a.error || b.error} reload={() => { a.reload(); b.reload() }} kind="table">
      <div className="space-y-3">
        <Interpretasi lines={[`${nf(tr)} Laporan EBS menurut penyakit rumor; ${nf(tv)} (${pf(tr ? Math.round((tv / tr) * 1000) / 10 : null)}) berstatus terverifikasi.`, rows[0] ? `Penyakit terbanyak: ${rows[0].label} (rumor ${nf(rows[0].rumor)}, terverifikasi ${nf(rows[0].verif)}).` : null]} />
        <Panel title="Penyakit rumor vs terverifikasi" desc="Rumor = penyakit seperti dilaporkan pertama kali (semua status). Terverifikasi = penyakit hasil verifikasi pada laporan berstatus Terverifikasi*. Dicocokkan menurut nama penyakit; penyakit bisa berubah saat verifikasi, jadi bandingkan jumlahnya, bukan rasio per baris."
          actions={<ExportButton filename="matriks-analisa-rumor-vs-terverifikasi" build={() => [{ name: 'Rumor vs terverifikasi', rows: [['Penyakit', 'Laporan menurut penyakit rumor', 'Laporan terverifikasi menurut penyakit hasil verifikasi', 'Selisih (terverifikasi - rumor)'], ...rows.map((x) => [x.label, x.rumor, x.verif, x.verif - x.rumor])] }]} />}>
          {!rows.length ? <Empty /> : (
            <>
              <div style={{ height: Math.max(220, Math.min(20, rows.length) * 24 + 60) }}><ResponsiveContainer>
                <BarChart data={rows.slice(0, 20)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => nf(v as number)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar isAnimationActive={false} dataKey="rumor" name="Rumor" fill="#94a3b8" /><Bar isAnimationActive={false} dataKey="verif" name="Terverifikasi" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer></div>
              <div className="skdr-table-card mt-3 max-h-[480px] overflow-auto"><table className="skdr-table w-full text-[11px]">
                <thead className="sticky top-0"><tr><th className="text-left">Penyakit</th><th className="text-right">Rumor</th><th className="text-right">Terverifikasi</th><th className="text-right">Selisih <InfoTip text="Terverifikasi − rumor. Positif = lebih banyak laporan yang setelah verifikasi menjadi penyakit ini daripada yang awalnya dilaporkan sebagai penyakit ini (penyakit dapat berubah saat verifikasi)." /></th></tr></thead>
                <tbody>{rows.map((x) => <tr key={x.label}><td>{x.label}</td><td className="text-right tabular-nums">{nf(x.rumor)}</td><td className="text-right tabular-nums">{nf(x.verif)}</td><td className={`text-right tabular-nums ${x.verif - x.rumor > 0 ? 'text-teal-700' : x.verif - x.rumor < 0 ? 'text-slate-500' : ''}`}>{x.verif - x.rumor > 0 ? '+' : ''}{nf(x.verif - x.rumor)}</td></tr>)}</tbody>
              </table></div>
            </>
          )}
        </Panel>
      </div>
    </State>
  )
}
