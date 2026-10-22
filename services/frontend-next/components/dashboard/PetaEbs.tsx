'use client'
// PR 023: peta EBS rinci di Sebaran wilayah. Choropleth provinsi → kab/kota (klik untuk turun), titik kecamatan
// (rata-rata koordinat laporan bila ada). Filter jenis unit / status laporan / status KLB, pembanding tahun lalu,
// kelengkapan koordinat per wilayah. Semua dari /api/v1/ebs-wilayah, ikut filter dasbor (termasuk kategori).
import { useEffect, useMemo, useRef, useState } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import 'ol/ol.css'
import { fetchFrom } from '@/lib/api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { ErrorState } from '@/components/ui/Skeleton'
import { nf, pf, toQs } from '@/lib/alert-skdr'

type Region = { key: string; name: string | null; geo: string | null; lat: number | null; lng: number | null; reports: number; cases: number; deaths: number
  with_coords: number; klb: number; coords_pct: number | null; prev_reports: number | null }
type Wil = { level: string; parent: string; prev_available: boolean; regions: Region[]
  options: { kel_unit: { value: string; count: number }[]; sts_rumor: { value: string; count: number }[]; klb: { value: string; label: string }[] } }
type Crumb = { level: 'prov' | 'kab' | 'kec'; parent: string; label: string }
const geoCache: Record<string, Promise<any>> = {}
const loadGeo = (f: string) => (geoCache[f] ||= fetch(`${PUBLIC_BASE_PATH}/data/${f}`).then((r) => r.json()))
const SCALE = ['#f1f5f9', '#ccfbf1', '#5eead4', '#14b8a6', '#0f766e', '#134e4a']
const shade = (v: number, max: number) => (v <= 0 || max <= 0 ? SCALE[0] : SCALE[Math.min(5, 1 + Math.floor((Math.sqrt(v / max)) * 4.999))])

function Multi({ label, opts, value, set }: { label: string; opts: { value: string; label?: string; count?: number }[]; value: string[]; set: (v: string[]) => void }) {
  return (
    <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}
      <select multiple value={value} onChange={(e) => set([...e.target.selectedOptions].map((o) => o.value))} className="mt-1 h-20 min-w-[180px] rounded-lg border border-slate-200 px-1 text-xs font-normal normal-case text-slate-700">
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label || o.value}{o.count !== undefined ? ` (${nf(o.count)})` : ''}</option>)}
      </select>
    </label>
  )
}

export type EbsMetric = 'reports' | 'cases' | 'deaths' | 'klb' | 'change' | 'coords_pct'
export type EbsOptions = Wil['options'] & { prev_available: boolean }
type Props = { query: Record<string, unknown>; embedded?: boolean; ku?: string[]; sr?: string[]; klb?: string[]; metric?: EbsMetric; showMatrix?: boolean
  onOptions?: (o: EbsOptions) => void; onTotals?: (t: { rep: number; pv: number | null; coords: number | null; level: string }) => void }
export default function PetaEbs({ query, embedded, ...p }: Props) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ level: 'prov', parent: '', label: 'Indonesia' }])
  const [ku0, setKu] = useState<string[]>([]); const [sr0, setSr] = useState<string[]>([]); const [klb0, setKlb] = useState<string[]>([])
  const ku = p.ku ?? ku0, sr = p.sr ?? sr0, klb = p.klb ?? klb0
  const [metric0, setMetric] = useState<EbsMetric>('reports'); const metric = p.metric ?? metric0; const showMatrix = p.showMatrix ?? true
  const [d, setD] = useState<Wil | null>(null); const [err, setErr] = useState(false); const [tick, setTick] = useState(0)
  const [hover, setHover] = useState<Region | null>(null)
  const cur = crumbs[crumbs.length - 1]
  const qs = toQs({ ...query, level: cur.level, parent: cur.parent, kel_unit: ku.join(','), sts_rumor: sr.join(','), klb: klb.join(',') })
  useEffect(() => {
    let alive = true; setErr(false)
    fetchFrom<Wil>(`/api/v1/ebs-wilayah?${qs}`).then((x) => { if (!alive) return; setD(x); p.onOptions?.({ ...x.options, prev_available: x.prev_available }) }).catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [qs, tick])

  const el = useRef<HTMLDivElement>(null)
  const map = useRef<OlMap | null>(null)
  const poly = useRef(new VectorSource()); const pts = useRef(new VectorSource())
  const byKey = useMemo(() => new Map((d?.regions || []).map((r) => [cur.level === 'prov' ? (r.geo || r.key) : cur.level === 'kab' ? (r.geo || r.key) : r.key, r])), [d, cur.level])
  const val = (r?: Region) => !r ? 0 : metric === 'cases' ? r.cases : metric === 'deaths' ? r.deaths : metric === 'klb' ? r.klb : metric === 'coords_pct' ? (r.coords_pct ?? 0) : metric === 'change' ? (r.prev_reports ? ((r.reports - r.prev_reports) * 100) / r.prev_reports : 0) : r.reports
  const max = Math.max(1, ...(d?.regions || []).map((r) => Math.abs(val(r))))

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = new OlMap({ target: el.current, layers: [
      new TileLayer({ source: new OSM({ url: `${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`, crossOrigin: 'anonymous' }), opacity: 0.5 }),
      new VectorLayer({ source: poly.current }), new VectorLayer({ source: pts.current }),
    ], view: new View({ center: fromLonLat([118, -2.5]), zoom: 4.3 }) })
    map.current.on('pointermove', (e) => { const f = map.current!.forEachFeatureAtPixel(e.pixel, (x) => x); setHover((f?.get('region') as Region) || null) })
    map.current.on('singleclick', (e) => {
      const f = map.current!.forEachFeatureAtPixel(e.pixel, (x) => x); const r = f?.get('region') as Region | undefined; const lvl = f?.get('lvl')
      if (!r) return
      if (lvl === 'prov') setCrumbs((c) => [...c, { level: 'kab', parent: r.key, label: r.name || r.key }])
      else if (lvl === 'kab') setCrumbs((c) => [...c, { level: 'kec', parent: r.key, label: r.name || r.key }])
    })
    return () => { map.current?.setTarget(undefined); map.current = null }
  }, [])

  useEffect(() => {
    if (!d || !map.current) return
    const signed = metric === 'change'
    const color = (r?: Region) => { const v = val(r); if (!r) return SCALE[0]; if (signed) return v > 0 ? `rgba(220,38,38,${Math.min(0.85, 0.15 + Math.abs(v) / max)})` : `rgba(37,99,235,${Math.min(0.85, 0.15 + Math.abs(v) / max)})`; return shade(v, max) }
    poly.current.clear(); pts.current.clear()
    const fit = () => { const ex = (pts.current.getFeatures().length ? pts.current : poly.current).getExtent(); if (ex && isFinite(ex[0])) map.current!.getView().fit(ex, { padding: [30, 30, 30, 30], maxZoom: 10, duration: 300 }) }
    if (cur.level === 'kec') {
      for (const r of d.regions) {
        if (r.lat === null || r.lng === null) continue
        const f = new Feature({ geometry: new Point(fromLonLat([r.lng, r.lat])), region: r, lvl: 'kec' })
        f.setStyle(new Style({ image: new CircleStyle({ radius: 4 + 14 * Math.sqrt(Math.abs(val(r)) / max), fill: new Fill({ color: color(r) === SCALE[0] ? '#94a3b8' : color(r) }), stroke: new Stroke({ color: '#0f172a', width: 1 }) }) }))
        pts.current.addFeature(f)
      }
      fit(); return
    }
    const file = cur.level === 'prov' ? 'indonesia-38-provinces.geojson' : 'indonesia-kabupaten.geojson'
    loadGeo(file).then((gj) => {
      const fs = new GeoJSON().readFeatures(gj, { featureProjection: 'EPSG:3857' }) as Feature[]
      for (const f of fs) {
        const code = String(cur.level === 'prov' ? f.get('id_provinsi') : f.get('kode_kab'))
        const r = byKey.get(code)
        if (cur.level === 'kab' && !r) continue
        f.set('region', r); f.set('lvl', cur.level)
        f.setStyle(new Style({ fill: new Fill({ color: color(r) }), stroke: new Stroke({ color: '#ffffff', width: 0.8 }) }))
        poly.current.addFeature(f)
      }
      // kab/kota without polygon (new regions) as points at master centroid
      if (cur.level === 'kab') for (const r of d.regions) {
        if (r.geo && fs.some((f) => String(f.get('kode_kab')) === r.geo)) continue
        if (r.lat === null || r.lng === null) continue
        const f = new Feature({ geometry: new Point(fromLonLat([r.lng, r.lat])), region: r, lvl: 'kab' })
        f.setStyle(new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: color(r) }), stroke: new Stroke({ color: '#0f172a', width: 1 }) }) }))
        pts.current.addFeature(f)
      }
      const ex = poly.current.getExtent(); if (cur.level !== 'prov' && ex && isFinite(ex[0])) map.current!.getView().fit(ex, { padding: [30, 30, 30, 30], duration: 300 })
      if (cur.level === 'prov') map.current!.getView().animate({ center: fromLonLat([118, -2.5]), zoom: 4.3, duration: 300 })
    })
  }, [d, metric]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = [...(d?.regions || [])].sort((a, b) => b.reports - a.reports)
  const tot = rows.reduce((a, r) => ({ rep: a.rep + r.reports, co: a.co + r.with_coords, pv: a.pv + (r.prev_reports || 0) }), { rep: 0, co: 0, pv: 0 })
  useEffect(() => { if (d) p.onTotals?.({ rep: tot.rep, pv: d.prev_available ? tot.pv : null, coords: tot.rep ? (tot.co * 100) / tot.rep : null, level: cur.level }) }, [d]) // eslint-disable-line react-hooks/exhaustive-deps
  const noPoint = cur.level === 'kec' ? rows.filter((r) => r.lat === null).length : 0
  return (
    <div className={embedded ? "flex h-full flex-col p-2" : "skdr-card mt-4 p-4"} data-testid="peta-ebs">
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          {embedded ? null : <div className="text-sm font-bold text-slate-800">Peta laporan EBS rinci</div>}
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">{crumbs.map((c, i) => (
            <span key={i}>{i ? ' › ' : ''}<button type="button" className={i === crumbs.length - 1 ? 'font-bold text-slate-800' : 'text-primary underline'} onClick={() => setCrumbs(crumbs.slice(0, i + 1))}>{c.label}</button></span>))}
            <span className="ml-2 text-slate-400">{cur.level === 'kec' ? 'tingkat kecamatan' : 'klik wilayah untuk turun ke ' + (cur.level === 'prov' ? 'kab/kota' : 'kecamatan')}</span></div>
        </div>
        {embedded ? null : <>
        <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">Ukuran
          <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} className="mt-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal normal-case text-slate-700" data-testid="peta-ebs-metric">
            <option value="reports">Laporan</option><option value="cases">Kasus</option><option value="deaths">Kematian</option><option value="klb">Laporan KLB</option><option value="change" disabled={!d?.prev_available}>Perubahan vs tahun lalu</option><option value="coords_pct">Kelengkapan koordinat</option>
          </select></label>
        <Multi label="Jenis unit" opts={d?.options.kel_unit || []} value={ku} set={setKu} />
        <Multi label="Status laporan" opts={d?.options.sts_rumor || []} value={sr} set={setSr} />
        <Multi label="Status KLB" opts={d?.options.klb || []} value={klb} set={setKlb} />
        </>}
      </div>
      {err ? <ErrorState onRetry={() => setTick((x) => x + 1)} /> : null}
      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 ${showMatrix ? "xl:grid-cols-3" : ""}`}>
        <div className={`relative overflow-hidden rounded-xl border border-slate-200 ${embedded ? "h-full min-h-[440px]" : "h-[460px]"} ${showMatrix ? "xl:col-span-2" : ""}`}>
          <div ref={el} className="h-full w-full" />
          {hover ? <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-white/95 px-3 py-2 text-xs shadow" data-testid="peta-ebs-tip">
            <div className="font-bold">{hover.name}</div>
            <div>{nf(hover.reports)} laporan · {nf(hover.cases)} kasus · {nf(hover.deaths)} kematian · {nf(hover.klb)} KLB</div>
            {hover.prev_reports !== null ? <div>Tahun lalu {nf(hover.prev_reports)} ({hover.prev_reports ? pf(((hover.reports - hover.prev_reports) * 100) / hover.prev_reports) : '—'})</div> : null}
            <div>Koordinat terisi {pf(hover.coords_pct)}</div></div> : null}
        </div>
        {showMatrix ? <div className="max-h-[560px] overflow-auto" data-testid="peta-ebs-matrix">
          {embedded ? null : <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-slate-50 p-2"><b className="block text-lg">{nf(tot.rep)}</b>laporan</div>
            <div className="rounded-lg bg-slate-50 p-2"><b className="block text-lg">{d?.prev_available ? nf(tot.pv) : '—'}</b>tahun lalu</div>
            <div className="rounded-lg bg-slate-50 p-2" data-testid="peta-ebs-coords"><b className="block text-lg">{pf(tot.rep ? (tot.co * 100) / tot.rep : null)}</b>bertitik koordinat</div>
          </div>}
          <table className="w-full text-xs"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500"><th className="px-1 py-1 text-left">Wilayah</th><th className="px-1 text-right">Laporan</th><th className="px-1 text-right">Thn lalu</th><th className="px-1 text-right">Koord.</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.key} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => cur.level !== 'kec' && setCrumbs([...crumbs, { level: cur.level === 'prov' ? 'kab' : 'kec', parent: r.key, label: r.name || r.key }])}>
                <td className="px-1 py-1 font-semibold">{r.name || r.key}</td><td className="px-1 text-right font-mono">{nf(r.reports)}</td>
                <td className="px-1 text-right font-mono">{r.prev_reports === null ? '—' : nf(r.prev_reports)}</td><td className="px-1 text-right">{pf(r.coords_pct)}</td></tr>))}</tbody></table>
          {!rows.length && d ? <p className="py-6 text-center text-sm text-slate-500">Tidak ada laporan EBS untuk filter ini.</p> : null}
          {noPoint ? <p className="mt-2 text-[11px] text-slate-500">{nf(noPoint)} kecamatan belum memiliki titik lokasi; datanya tetap ada di tabel.</p> : null}
        </div> : null}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Sumber: SKDR – laporan EBS. Wilayah baru yang belum memiliki batas peta ditampilkan sebagai titik.</p>
    </div>
  )
}
