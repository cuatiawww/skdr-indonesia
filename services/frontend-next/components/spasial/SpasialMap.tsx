'use client'
// PR 044: Spasial map (OpenLayers): choropleth provinsi / kab-kota (drill), titik unit pelapor (kluster / titik),
// heatmap kasus, popup indikator epidemiologi, legenda + ambang, putar ulang per minggu epid.
// Geometry: public/data GeoJSON (id_provinsi = master_locations.code, kode_kab = master_kabkota.code).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Overlay from 'ol/Overlay'
import { createPortal } from 'react-dom'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import HeatmapLayer from 'ol/layer/Heatmap'
import VectorSource from 'ol/source/Vector'
import Cluster from 'ol/source/Cluster'
import XYZ from 'ol/source/XYZ'
import OSM from 'ol/source/OSM'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import { boundingExtent, createEmpty, extend, isEmpty } from 'ol/extent'
import type { FeatureLike } from 'ol/Feature'
import 'ol/ol.css'
import { ArrowLeft, ChevronDown, ChevronUp, Crosshair, Layers, ListTree, Maximize2, Minimize2, Pause, PanelRight, Play, X } from 'lucide-react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { nf } from '@/lib/analisa-api'
import { areaVal, classesFor, classOf, fmtPct, METRICS, STATUS, statusFor, titikVal, type Area, type MapClass, type Metric, type SpasialResp, type Titik } from '@/lib/spasial-api'
import type { ChoroConfig } from '@/lib/choropleth-classes'

export type BaseMap = 'light' | 'osm' | 'satellite' | 'none'
export type PointMode = 'kluster' | 'titik' | 'off'
export interface Layers { base: BaseMap; choro: boolean; opChoro: number; points: PointMode; heat: boolean; status: string[]; kasusMin: number }
export const DEFAULT_LAYERS: Layers = { base: 'light', choro: true, opChoro: 0.78, points: 'kluster', heat: false, status: [], kasusMin: 0 }
export type Focus = { lat: number; lon: number; titik?: Titik | null; row?: any; area?: Area | null; zoom?: number; nonce: number }

const geoCache: Record<string, Promise<any>> = {}
const loadJson = (url: string) => (geoCache[url] ||= fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() }))
async function loadGeo(level: 'provinsi' | 'kabkota', provCode: string | null, provName: string | null) {
  if (level === 'provinsi') return (await loadJson(`${PUBLIC_BASE_PATH}/data/indonesia-38-provinces.geojson`)).features || []
  let fs: any[] = []
  try {
    const r = await loadJson(`${PUBLIC_BASE_PATH}/wilayah-data?level=kabupaten&province=${encodeURIComponent(provName || '')}`)
    fs = r?.geojson?.features || []
  } catch { fs = [] }
  if (!fs.some((f: any) => String(f.properties?.kode_prov) === String(provCode))) fs = (await loadJson(`${PUBLIC_BASE_PATH}/data/indonesia-kabupaten.geojson`)).features || []
  return fs.filter((f: any) => String(f.properties?.kode_prov) === String(provCode))
}

function baseSource(b: BaseMap) {
  if (b === 'satellite') return new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', crossOrigin: 'anonymous', attributions: 'Esri' })
  if (b === 'osm') return new OSM({ url: `${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`, crossOrigin: 'anonymous' })
  // 'light' = the app's own OSM tile proxy, desaturated via CSS (no third-party key needed)
  return new OSM({ url: `${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`, crossOrigin: 'anonymous' })
}

type Popup = { kind: 'area'; area: Area } | { kind: 'titik'; t: Titik } | { kind: 'row'; row: any } | { kind: 'cluster'; items: Titik[] }

export interface MapHudCtrl {
  fitAll: () => void
  toggleFs: () => void
  fs: boolean
  showLegend: boolean
  setShowLegend: (v: boolean) => void
  showLayers: boolean
  setShowLayers: (v: boolean) => void
}

export default function SpasialMap({ data, titik, metric, setMetric, layers, setLayers, choroCfg, sumber, selectedId, onSelectArea, onDrill, onUp, focus, rightPanel, panelOpen, setPanelOpen, height = 680, fullHeight = false, topHud, leftDock, topOffset, hideDefaultToolbar = false }: {
  data: SpasialResp | null; titik: Titik[]; metric: Metric; setMetric: (m: Metric) => void; layers: Layers; setLayers: (l: Layers) => void
  choroCfg: ChoroConfig | null; sumber: string; selectedId: number | null; onSelectArea: (a: Area | null) => void; onDrill: (a: Area) => void; onUp: (() => void) | null
  focus: Focus | null; rightPanel: ReactNode; panelOpen: boolean; setPanelOpen: (v: boolean) => void; height?: number
  fullHeight?: boolean; topHud?: ReactNode | ((ctrl: MapHudCtrl) => ReactNode); leftDock?: ReactNode; topOffset?: number; hideDefaultToolbar?: boolean
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const el = useRef<HTMLDivElement>(null)
  // OL moves the overlay element into its own container, so it must not be a React-managed node (portal into a detached div)
  const [popNode] = useState<HTMLDivElement | null>(() => (typeof document !== 'undefined' ? document.createElement('div') : null))
  const map = useRef<OlMap | null>(null)
  const tile = useRef<TileLayer<any> | null>(null)
  const choroSrc = useRef(new VectorSource())
  const ptSrc = useRef(new VectorSource())
  const clusterSrc = useRef(new Cluster({ distance: 42, minDistance: 12, source: ptSrc.current }))
  const choroL = useRef<VectorLayer<any> | null>(null)
  const ptL = useRef<VectorLayer<any> | null>(null)
  const clL = useRef<VectorLayer<any> | null>(null)
  const heatL = useRef<HeatmapLayer | null>(null)
  const overlay = useRef<Overlay | null>(null)
  const styleCtx = useRef<{ byCode: Record<string, Area>; cls: MapClass[]; wi: number; metric: Metric; sel: number | null; hover: string | null; op: number; maxK: number }>({ byCode: {}, cls: [], wi: -1, metric: 'kasus', sel: null, hover: null, op: 0.78, maxK: 1 })
  const onSelectRef = useRef(onSelectArea)
  onSelectRef.current = onSelectArea
  const [geoErr, setGeoErr] = useState(false)
  const [geoReady, setGeoReady] = useState(0)
  const [wi, setWi] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [popup, setPopup] = useState<Popup | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)
  const [showLayers, setShowLayers] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [fs, setFs] = useState(false)
  const weeks = data?.minggu || []
  const level = data?.level || 'provinsi'
  const areas = data?.wilayah || []

  // ── map init ──
  useEffect(() => {
    if (!el.current || map.current) return
    tile.current = new TileLayer({ source: baseSource('light'), zIndex: 0, className: 'spasial-base' })
    const choroStyle = (f: FeatureLike) => {
      const c = styleCtx.current
      const a = c.byCode[String(f.get('code'))]
      const v = a ? areaVal(a, c.metric, c.wi) : null
      const k = classOf(v, c.cls, c.metric)
      const sel = a && a.id === c.sel
      const hov = c.hover === f.get('code')
      const col = k.color
      const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16)
      return new Style({
        fill: new Fill({ color: `rgba(${r},${g},${b},${c.op})` }),
        stroke: new Stroke({ color: sel ? '#0f172a' : hov ? '#334155' : 'rgba(255,255,255,0.95)', width: sel ? 3 : hov ? 2 : 0.8 }),
        zIndex: sel ? 2 : hov ? 1 : 0,
      })
    }
    choroL.current = new VectorLayer({ source: choroSrc.current, style: choroStyle, zIndex: 1 })
    heatL.current = new HeatmapLayer({ source: ptSrc.current, blur: 24, radius: 14, weight: (f) => f.get('hw') || 0, zIndex: 2, visible: false, opacity: 0.85 })
    const cache: Record<string, Style> = {}
    const ptStyle = (f: FeatureLike) => {
      const t: Titik = f.get('t'); const v = f.get('v') as ReturnType<typeof titikVal>
      const rad = Math.round(4 + Math.sqrt(Math.max(0, v.k) / Math.max(1, styleCtx.current.maxK)) * 13)
      const late = t.rn > t.r
      const key = `${v.st}|${rad}|${t.lokasi === 'c'}|${late}`
      if (!cache[key]) {
        const color = STATUS[v.st]?.color || '#64748b'
        cache[key] = new Style({
          image: new CircleStyle({ radius: rad, fill: new Fill({ color: t.lokasi === 'c' ? 'rgba(255,255,255,0.7)' : color + 'd9' }),
            stroke: new Stroke({ color: t.lokasi === 'c' ? color : late ? '#111827' : '#ffffff', width: t.lokasi === 'c' ? 2 : late ? 1.6 : 1.2, lineDash: t.lokasi === 'c' ? [3, 2] : undefined }) }),
          zIndex: v.st === 'klb' ? 4 : v.st === 'verif' ? 3 : 2,
        })
      }
      return cache[key]
    }
    ptL.current = new VectorLayer({ source: ptSrc.current, style: ptStyle, zIndex: 3, visible: false })
    const clCache: Record<string, Style> = {}
    const order = ['klb', 'verif', 'alert', 'rumor', 'lapor', 'discarded']
    const clStyle = (f: FeatureLike) => {
      const fs2: Feature[] = f.get('features') || []
      if (fs2.length === 1) return ptStyle(fs2[0])
      let k = 0, worst = 99
      for (const x of fs2) { const v = x.get('v'); k += v.k; worst = Math.min(worst, order.indexOf(v.st) < 0 ? 98 : order.indexOf(v.st)) }
      const st = order[worst] || 'lapor'
      const rad = Math.round(9 + Math.min(14, Math.log10(1 + k) * 3))
      const key = `${st}|${rad}|${fs2.length}`
      if (!clCache[key]) {
        const color = STATUS[st]?.color || '#0f766e'
        clCache[key] = new Style({
          image: new CircleStyle({ radius: rad, fill: new Fill({ color: color + 'cc' }), stroke: new Stroke({ color: '#ffffff', width: 2.5 }) }),
          text: new Text({ text: fs2.length > 999 ? `${Math.round(fs2.length / 100) / 10}rb` : String(fs2.length), font: 'bold 11px Inter, sans-serif', fill: new Fill({ color: '#fff' }) }),
        })
      }
      return clCache[key]
    }
    clL.current = new VectorLayer({ source: clusterSrc.current, style: clStyle, zIndex: 3 })
    overlay.current = new Overlay({ element: popNode!, positioning: 'bottom-center', offset: [0, -12], stopEvent: true, autoPan: { animation: { duration: 200 }, margin: 60 } })
    const m = new OlMap({ target: el.current, layers: [tile.current, choroL.current, heatL.current, clL.current, ptL.current], overlays: [overlay.current],
      view: new View({ center: fromLonLat([118, -2.5]), zoom: 4.6, minZoom: 3.5, maxZoom: 17 }), controls: [] })
    map.current = m
    m.on('pointermove', (e) => {
      if (e.dragging) return
      const hit = m.forEachFeatureAtPixel(e.pixel, (f, l) => ({ f, l }), { hitTolerance: 3 })
      let code: string | null = null, text: string | null = null
      if (hit?.l === choroL.current) {
        code = String(hit.f.get('code'))
        const a = styleCtx.current.byCode[code]
        const mt = METRICS.find((x) => x.key === styleCtx.current.metric)
        const v = a ? areaVal(a, styleCtx.current.metric, styleCtx.current.wi) : null
        text = `${hit.f.get('name')}: ${mt?.label} ${v === null ? '–' : styleCtx.current.metric === 'cfr' || styleCtx.current.metric === 'chg_minggu' ? fmtPct(v, styleCtx.current.metric === 'chg_minggu') : nf(v)}`
      } else if (hit) {
        const fs2: Feature[] = hit.f.get('features') || [hit.f]
        const t: Titik | undefined = fs2[0]?.get('t')
        text = fs2.length > 1 ? `${nf(fs2.length)} unit pelapor · klik untuk memperbesar` : t ? `${t.unit || '(unit tanpa nama)'} · ${nf(fs2[0].get('v').k)} kasus` : null
      }
      if (styleCtx.current.hover !== code) { styleCtx.current.hover = code; choroL.current?.changed() }
      m.getTargetElement().style.cursor = hit ? 'pointer' : ''
      setHover(text ? { x: e.pixel[0], y: e.pixel[1], text } : null)
    })
    m.on('singleclick', (e) => {
      const hit = m.forEachFeatureAtPixel(e.pixel, (f, l) => ({ f, l }), { hitTolerance: 3, layerFilter: (l) => l !== heatL.current })
      if (!hit) { setPopup(null); overlay.current?.setPosition(undefined); return }
      if (hit.l === choroL.current) {
        const a = styleCtx.current.byCode[String(hit.f.get('code'))]
        if (a) { onSelectRef.current(a); setPopup({ kind: 'area', area: a }); overlay.current?.setPosition(e.coordinate) }
        return
      }
      const fs2: Feature[] = hit.f.get('features') || [hit.f]
      if (fs2.length > 1) {
        const ext = boundingExtent(fs2.map((x) => (x.getGeometry() as Point).getCoordinates()))
        const z = m.getView().getZoom() || 5
        if (z < 13 && ext[2] - ext[0] + (ext[3] - ext[1]) > 30) { m.getView().fit(ext, { padding: [80, 80, 80, 80], duration: 350, maxZoom: Math.min(15, z + 3) }); setPopup(null); overlay.current?.setPosition(undefined) }
        else { setPopup({ kind: 'cluster', items: fs2.map((x) => x.get('t')) }); overlay.current?.setPosition((fs2[0].getGeometry() as Point).getCoordinates()) }
        return
      }
      const t: Titik = fs2[0].get('t')
      setPopup({ kind: 'titik', t }); overlay.current?.setPosition((fs2[0].getGeometry() as Point).getCoordinates())
    })
    const onFs = () => { setFs(Boolean(document.fullscreenElement)); setTimeout(() => m.updateSize(), 60) }
    document.addEventListener('fullscreenchange', onFs)
    const ro = new ResizeObserver(() => m.updateSize())
    ro.observe(el.current)
    return () => { document.removeEventListener('fullscreenchange', onFs); ro.disconnect(); m.setTarget(undefined); map.current = null }
  }, [])

  // ── base map ──
  useEffect(() => { if (!tile.current) return; tile.current.setVisible(layers.base !== 'none'); if (layers.base !== 'none') tile.current.setSource(baseSource(layers.base)) }, [layers.base])

  // ── geometry ──
  const geoKey = data ? `${level}|${data.prov ?? ''}` : ''
  useEffect(() => {
    if (!data) return
    let alive = true
    setGeoErr(false)
    const provName = data.meta?.breadcrumb?.[1]?.label || null
    const pc = level === 'kabkota' ? (data.wilayah[0]?.code || '').slice(0, 2) : null
    loadGeo(level, pc, provName).then((fs2) => {
      if (!alive) return
      const feats = new GeoJSON().readFeatures({ type: 'FeatureCollection', features: fs2 }, { featureProjection: 'EPSG:3857' }) as Feature[]
      feats.forEach((f) => { const p = f.getProperties(); f.set('code', String(level === 'provinsi' ? p.id_provinsi : p.kode_kab)); f.set('name', String(level === 'provinsi' ? p.provinsi : p.nama_kab)) })
      choroSrc.current.clear(); choroSrc.current.addFeatures(feats)
      setGeoReady((n) => n + 1)
    }).catch(() => alive && setGeoErr(true))
    return () => { alive = false }
  }, [geoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── fit to scope (selected kab or whole level) ──
  const kabSel = data?.kab?.[0] ?? null
  useEffect(() => {
    const m = map.current
    if (!m || !geoReady) return
    let ext = createEmpty()
    const selA = kabSel ? areas.find((a) => a.id === kabSel) : null
    choroSrc.current.getFeatures().forEach((f) => { if (!selA || f.get('code') === selA.code) extend(ext, f.getGeometry()!.getExtent()) })
    if (isEmpty(ext)) return
    const right = panelOpen && (wrap.current?.clientWidth || 0) > 900 ? (fullHeight ? 400 : 380) : 40
    const topPad = topOffset ? topOffset + 16 : 70
    m.getView().fit(ext, { padding: [topPad, right, 70, 40], duration: 300, maxZoom: kabSel ? 11 : 9 })
  }, [geoReady, kabSel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── choropleth style context ──
  const allWeekVals = useMemo(() => {
    if (wi < 0) return null
    const key = METRICS.find((m) => m.key === metric)?.seri
    if (!key) return null
    return areas.flatMap((a) => a.seri?.[key] || [])
  }, [areas, metric, wi])
  const cls = useMemo(() => classesFor(metric, allWeekVals || areas.map((a) => areaVal(a, metric, -1)), choroCfg), [metric, areas, choroCfg, allWeekVals])
  useEffect(() => {
    const byCode: Record<string, Area> = {}
    areas.forEach((a) => { byCode[a.code] = a })
    Object.assign(styleCtx.current, { byCode, cls, wi, metric, sel: selectedId, op: layers.opChoro })
    choroL.current?.changed()
  }, [areas, cls, wi, metric, selectedId, layers.opChoro, geoReady])
  useEffect(() => { choroL.current?.setVisible(layers.choro) }, [layers.choro])

  // ── points ──
  const statusOpts = statusFor(sumber)
  useEffect(() => {
    const on = layers.status.length ? new Set(layers.status) : null
    const feats: Feature[] = []
    let maxK = 1
    for (const t of titik) {
      const v = titikVal(t, wi)
      if (wi >= 0 && v.k <= 0 && v.a <= 0) continue
      if (on && !on.has(v.st)) continue
      if (layers.kasusMin > 0 && v.k < layers.kasusMin) continue
      maxK = Math.max(maxK, v.k)
      const f = new Feature({ geometry: new Point(fromLonLat([t.lon, t.lat])) })
      f.set('t', t); f.set('v', v)
      feats.push(f)
    }
    feats.forEach((f) => f.set('hw', Math.sqrt(f.get('v').k / maxK)))
    styleCtx.current.maxK = maxK
    ptSrc.current.clear(); ptSrc.current.addFeatures(feats)
  }, [titik, wi, layers.status, layers.kasusMin])
  useEffect(() => {
    ptL.current?.setVisible(layers.points === 'titik'); clL.current?.setVisible(layers.points === 'kluster'); heatL.current?.setVisible(layers.heat)
  }, [layers.points, layers.heat])

  // ── playback ──
  useEffect(() => { setWi(-1); setPlaying(false) }, [data?.meta?.mulai, data?.meta?.akhir])
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setWi((x) => (x + 1 >= weeks.length ? (setPlaying(false), weeks.length - 1) : x + 1)), 1300)
    return () => clearInterval(id)
  }, [playing, weeks.length])

  // ── focus from table / hotspot ──
  useEffect(() => {
    const m = map.current
    if (!m || !focus) return
    const c = fromLonLat([focus.lon, focus.lat])
    m.getView().animate({ center: c, zoom: focus.zoom ?? Math.max(m.getView().getZoom() || 5, 12), duration: 450 })
    if (focus.area) setPopup({ kind: 'area', area: focus.area })
    else if (focus.titik) setPopup({ kind: 'titik', t: focus.titik })
    else if (focus.row) setPopup({ kind: 'row', row: focus.row })
    overlay.current?.setPosition(c)
  }, [focus])
  // close popups when data changes
  useEffect(() => { setPopup(null); overlay.current?.setPosition(undefined) }, [data])

  const closePop = () => { setPopup(null); overlay.current?.setPosition(undefined) }
  const fitAll = useCallback(() => { setGeoReady((n) => n + 1) }, [])
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else wrap.current?.requestFullscreen?.() }
  const mt = METRICS.find((x) => x.key === metric)!
  const lvLabel = level === 'provinsi' ? 'provinsi' : 'kab/kota'
  const btn = (on: boolean) => `flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold transition ${on ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100'}`
  const crumbs: any[] = data?.meta?.breadcrumb || []

  return (
    <div ref={wrap} className={fullHeight ? "relative h-full w-full overflow-hidden bg-slate-100" : "relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xs"} style={{ height: fs ? '100vh' : fullHeight ? '100%' : height }} data-testid="spasial-map" data-base={layers.base}>
      <style>{`[data-base="light"] .spasial-base canvas{filter:grayscale(1) brightness(1.08) contrast(0.88)}`}</style>
      <div ref={el} className="absolute inset-0" />
      {geoErr ? <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Batas wilayah gagal dimuat; titik tetap ditampilkan.</div> : null}

      {fullHeight ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col gap-2.5 p-3">
          {topHud ? (
            <div className="shrink-0">
              {typeof topHud === 'function' ? topHud({ fitAll, toggleFs, fs, showLegend, setShowLegend, showLayers, setShowLayers }) : topHud}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
            <div className="flex max-h-full flex-col gap-2 overflow-y-auto pr-0.5">
              {leftDock}
              {showLegend ? <Legend metric={metric} cls={cls} lvLabel={lvLabel} sumber={sumber} weekly={wi >= 0} points={layers.points !== 'off'} heat={layers.heat} onClose={() => setShowLegend(false)} inline /> : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-end self-stretch pb-0.5">
              {weeks.length > 1 ? (
                <div className="pointer-events-auto flex w-[min(560px,100%)] items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur" data-testid="spasial-playback">
                  <button type="button" disabled={!data?.seri} onClick={() => { if (!playing && wi >= weeks.length - 1) setWi(0); else if (!playing && wi < 0) setWi(0); setPlaying(!playing) }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white disabled:opacity-40" aria-label={playing ? 'Jeda' : 'Putar per minggu epid'} data-testid="spasial-play">
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                  <input type="range" min={-1} max={weeks.length - 1} value={wi} disabled={!data?.seri} onChange={(e) => { setPlaying(false); setWi(Number(e.target.value)) }} className="min-w-0 flex-1 accent-teal-700" aria-label="Minggu epid" data-testid="spasial-week" />
                  <span className="w-[150px] shrink-0 text-right text-[11px] font-extrabold text-slate-700">{wi < 0 ? `Semua minggu (${weeks[0]?.label} – ${weeks[weeks.length - 1]?.label})` : `Minggu ${weeks[wi]?.label}`}</span>
                </div>
              ) : null}
            </div>
            {panelOpen ? (
              <div className="pointer-events-auto h-full w-[380px] shrink-0 max-w-[calc(100vw-24px)]" data-testid="spasial-panel">
                {rightPanel}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* toolbar */}
          {!hideDefaultToolbar ? (
            <div className="absolute left-1/2 top-3 z-40 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur" data-testid="spasial-toolbar">
              {onUp ? <button type="button" onClick={onUp} className={btn(false)} title="Naik satu tingkat wilayah" data-testid="spasial-up"><ArrowLeft className="h-4 w-4" /><span className="hidden md:inline">Kembali</span></button> : null}
              <span className="mx-1 hidden whitespace-nowrap text-[11px] font-black text-slate-800 lg:inline">{crumbs.map((c) => c.label).join(' › ') || 'Indonesia'}</span>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <button type="button" onClick={() => setShowLayers(!showLayers)} className={btn(showLayers)} aria-pressed={showLayers} data-testid="spasial-toggle-layers"><Layers className="h-4 w-4" /><span className="hidden xl:inline">Lapisan</span></button>
              <button type="button" onClick={() => setShowLegend(!showLegend)} className={btn(showLegend)} aria-pressed={showLegend} data-testid="spasial-toggle-legend"><ListTree className="h-4 w-4" /><span className="hidden xl:inline">Legenda</span></button>
              <button type="button" onClick={() => setPanelOpen(!panelOpen)} className={btn(panelOpen)} aria-pressed={panelOpen} data-testid="spasial-toggle-panel"><PanelRight className="h-4 w-4" /><span className="hidden xl:inline">Hotspot & detail</span></button>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <button type="button" onClick={fitAll} className={btn(false)} title="Tampilkan seluruh wilayah terpilih" data-testid="spasial-fit"><Crosshair className="h-4 w-4" /></button>
              <button type="button" onClick={toggleFs} className={btn(fs)} title={fs ? 'Keluar layar penuh' : 'Layar penuh'}>{fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
            </div>
          ) : null}

          {/* layer switcher */}
          {showLayers ? (
            <div className="absolute left-3 z-30 w-[250px] space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-3 text-[11px] shadow-xl backdrop-blur" style={{ top: topOffset ?? 64 }} data-testid="spasial-layers">
              <div className="flex items-center justify-between"><b className="text-xs font-black text-slate-800">Lapisan peta</b><button type="button" onClick={() => setShowLayers(false)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><X className="h-3.5 w-3.5" /></button></div>
              <div>
                <p className="mb-1 font-extrabold uppercase tracking-wider text-slate-500">Peta dasar</p>
                <div className="grid grid-cols-4 gap-1">{([['light', 'Terang'], ['osm', 'OSM'], ['satellite', 'Satelit'], ['none', 'Polos']] as [BaseMap, string][]).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setLayers({ ...layers, base: k })} className={`rounded-md border px-1 py-1 font-bold ${layers.base === k ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>{l}</button>))}</div>
              </div>
              <label className="flex items-center justify-between gap-2 font-bold text-slate-700"><span>Choropleth {lvLabel}</span><input type="checkbox" checked={layers.choro} onChange={(e) => setLayers({ ...layers, choro: e.target.checked })} data-testid="layer-choro" /></label>
              <label className="block"><span className="mb-0.5 block font-bold text-slate-600">Indikator warna wilayah</span>
                <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="h-8 w-full rounded-lg border border-slate-200 px-2 font-bold" data-testid="layer-metric">
                  {METRICS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select></label>
              <label className="block"><span className="font-bold text-slate-600">Transparansi choropleth</span>
                <input type="range" min={0.2} max={1} step={0.05} value={layers.opChoro} onChange={(e) => setLayers({ ...layers, opChoro: Number(e.target.value) })} className="w-full" /></label>
              <div><p className="mb-1 font-extrabold uppercase tracking-wider text-slate-500">Titik unit pelapor</p>
                <div className="grid grid-cols-3 gap-1">{([['kluster', 'Kluster'], ['titik', 'Titik'], ['off', 'Sembunyi']] as [PointMode, string][]).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setLayers({ ...layers, points: k })} data-testid={`layer-points-${k}`} className={`rounded-md border px-1 py-1 font-bold ${layers.points === k ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>{l}</button>))}</div></div>
              <label className="flex items-center justify-between gap-2 font-bold text-slate-700"><span>Heatmap kasus</span><input type="checkbox" checked={layers.heat} onChange={(e) => setLayers({ ...layers, heat: e.target.checked })} data-testid="layer-heat" /></label>
              <div><p className="mb-1 font-extrabold uppercase tracking-wider text-slate-500">Status titik</p>
                <div className="flex flex-wrap gap-1">{statusOpts.map((s) => { const on = !layers.status.length || layers.status.includes(s); return (
                  <button key={s} type="button" title={STATUS[s].tip} onClick={() => { const cur = layers.status.length ? layers.status : statusOpts; const n = on ? cur.filter((x) => x !== s) : [...cur, s]; setLayers({ ...layers, status: n.length === statusOpts.length ? [] : n }) }}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${on ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-100 text-slate-400 line-through'}`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS[s].color }} />{STATUS[s].label}</button>) })}</div></div>
              <label className="flex items-center justify-between gap-2 font-bold text-slate-700"><span>Kasus minimal per unit</span>
                <input type="number" min={0} value={layers.kasusMin || ''} placeholder="0" onChange={(e) => setLayers({ ...layers, kasusMin: Math.max(0, Number(e.target.value) || 0) })} className="h-7 w-20 rounded-md border border-slate-200 px-1.5 text-right" /></label>
            </div>
          ) : null}

          {/* legend */}
          {showLegend && !showLayers ? <Legend metric={metric} cls={cls} lvLabel={lvLabel} sumber={sumber} weekly={wi >= 0} points={layers.points !== 'off'} heat={layers.heat} onClose={() => setShowLegend(false)} /> : null}

          {/* right panel */}
          {panelOpen ? <div className="absolute bottom-3 right-3 z-30 w-[350px] max-w-[calc(100%-24px)] transition-all duration-200" style={{ top: topOffset ?? 64 }} data-testid="spasial-panel">{rightPanel}</div> : null}

          {/* playback */}
          {weeks.length > 1 ? (
            <div className={`absolute bottom-3 left-1/2 z-30 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur ${panelOpen ? 'lg:-ml-[175px]' : ''}`} data-testid="spasial-playback">
              <button type="button" disabled={!data?.seri} onClick={() => { if (!playing && wi >= weeks.length - 1) setWi(0); else if (!playing && wi < 0) setWi(0); setPlaying(!playing) }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white disabled:opacity-40" aria-label={playing ? 'Jeda' : 'Putar per minggu epid'} data-testid="spasial-play">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
              <input type="range" min={-1} max={weeks.length - 1} value={wi} disabled={!data?.seri} onChange={(e) => { setPlaying(false); setWi(Number(e.target.value)) }} className="min-w-0 flex-1 accent-teal-700" aria-label="Minggu epid" data-testid="spasial-week" />
              <span className="w-[150px] shrink-0 text-right text-[11px] font-extrabold text-slate-700">{wi < 0 ? `Semua minggu (${weeks[0]?.label} – ${weeks[weeks.length - 1]?.label})` : `Minggu ${weeks[wi]?.label}`}</span>
            </div>
          ) : null}
        </>
      )}

      {hover && !popup ? <div className="pointer-events-none absolute z-30 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow" style={{ left: hover.x + 14, top: hover.y + 10 }}>{hover.text}</div> : null}

      {/* popup (positioned by OL overlay) */}
      {popNode ? createPortal(<div className={popup ? '' : 'hidden'}>
        {popup ? (
          <div className="w-[290px] rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-xl" data-testid="spasial-popup">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{popup.kind === 'area' ? popup.area.nama : popup.kind === 'titik' ? popup.t.unit || '(unit tanpa nama)' : popup.kind === 'row' ? popup.row.unit : `${nf(popup.items.length)} unit pelapor`}</p>
                <p className="text-[10.5px] text-slate-500">{popup.kind === 'area' ? `${level === 'provinsi' ? 'Provinsi' : 'Kab/Kota'} · ${data?.meta?.periode_label}${wi >= 0 ? ` · ${weeks[wi]?.label}` : ''}`
                  : popup.kind === 'titik' ? [popup.t.ju, popup.t.kec ? `Kec. ${popup.t.kec}` : null, popup.t.kab].filter(Boolean).join(' · ')
                  : popup.kind === 'row' ? [popup.row.kecamatan, popup.row.kabkota].filter(Boolean).join(' · ') : 'Unit berdekatan / satu lokasi'}</p>
              </div>
              <button type="button" onClick={closePop} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><X className="h-3.5 w-3.5" /></button>
            </div>
            {popup.kind === 'area' ? <AreaPopup a={popup.area} wi={wi} weeks={weeks} data={data!} onDrill={level === 'provinsi' || !popup.area.dipilih ? () => { closePop(); onDrill(popup.area) } : null} sumber={sumber} /> : null}
            {popup.kind === 'titik' ? <TitikPopup t={popup.t} wi={wi} label={data?.lokasi_label?.[popup.t.lokasi]} weeks={weeks} /> : null}
            {popup.kind === 'row' ? <div className="space-y-0.5"><p><b>{popup.row.penyakit}</b> · {popup.row.minggu_label}</p><p>Kasus {nf(popup.row.kasus)} · Kematian {nf(popup.row.kematian)}</p>{popup.row.klb ? <p>KLB: {popup.row.klb} · Verifikasi: {popup.row.verif || '–'} · Respons: {popup.row.respon || '–'}</p> : null}</div> : null}
            {popup.kind === 'cluster' ? <ul className="max-h-48 space-y-1 overflow-auto">{[...popup.items].sort((a, b) => b.k - a.k).slice(0, 30).map((t) => (
              <li key={t.idx}><button type="button" className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50" onClick={() => setPopup({ kind: 'titik', t })}>
                <span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS[titikVal(t, wi).st]?.color }} /><span className="truncate">{t.unit}</span></span><b className="tabular-nums">{nf(titikVal(t, wi).k)}</b></button></li>))}</ul> : null}
          </div>
        ) : null}
      </div>, popNode) : null}
      {!data ? <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 text-xs font-bold text-slate-500">Memuat peta…</div> : null}
      <span className="sr-only">{mt.label}</span>
    </div>
  )
}

function Row({ l, v, tone }: { l: string; v: ReactNode; tone?: string }) {
  return <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-0.5 last:border-0"><span className="text-slate-500">{l}</span><b className={`tabular-nums ${tone || 'text-slate-800'}`}>{v}</b></div>
}
const chgTone = (v: number | null) => (v === null ? 'text-slate-400' : v > 0 ? 'text-red-600' : v < 0 ? 'text-emerald-600' : 'text-slate-600')

function AreaPopup({ a, wi, weeks, data, onDrill, sumber }: { a: Area; wi: number; weeks: { label: string }[]; data: SpasialResp; onDrill: (() => void) | null; sumber: string }) {
  const w = wi >= 0 && a.seri
  const k = w ? a.seri!.k[wi] : a.kasus, m = w ? a.seri!.m[wi] : a.kematian
  const cur = w ? a.seri!.k[wi] : a.minggu_ini
  const prev = w ? (wi > 0 ? a.seri!.k[wi - 1] : null) : a.minggu_lalu
  const ch = prev ? Math.round(((cur - prev) * 1000) / prev) / 10 : null
  return (
    <div>
      <Row l="Kasus" v={nf(k)} />
      <Row l="Kematian" v={nf(m)} />
      <Row l="CFR" v={k > 0 ? fmtPct(Math.round((m * 1000) / k) / 10) : '–'} />
      <Row l={w ? `Perubahan vs ${wi > 0 ? weeks[wi - 1]?.label : 'minggu sebelumnya'}` : `Perubahan ${data.minggu_ini} vs ${data.minggu_lalu}`} v={<span className={chgTone(ch)}>{prev === null ? '–' : `${nf(prev)} → ${nf(cur)} (${fmtPct(ch, true)})`}</span>} />
      {!w ? <Row l="Perubahan vs periode sebelumnya" v={<span className={chgTone(a.chg_periode)}>{fmtPct(a.chg_periode, true)}</span>} /> : null}
      <Row l="Laporan" v={nf(w ? a.seri!.l[wi] : a.laporan)} />
      <Row l={sumber === 'ebs' ? 'Sinyal EBS' : 'Alert / sinyal'} v={nf(w ? a.seri!.a[wi] : a.alert)} />
      <Row l="KLB" v={nf(w ? a.seri!.b[wi] : a.klb)} tone={(w ? a.seri!.b[wi] : a.klb) > 0 ? 'text-red-600' : undefined} />
      {!w ? <Row l="Unit pelapor" v={nf(a.unit)} /> : null}
      {!w && a.porsi !== null ? <Row l="Porsi kasus dari total" v={fmtPct(a.porsi)} /> : null}
      {onDrill ? <button type="button" onClick={onDrill} className="mt-2 w-full rounded-lg bg-teal-700 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800" data-testid="spasial-drill">{data.level === 'provinsi' ? 'Perbesar ke kab/kota provinsi ini' : 'Fokus ke kab/kota ini'}</button> : null}
    </div>
  )
}

function TitikPopup({ t, wi, label, weeks }: { t: Titik; wi: number; label?: string; weeks: { label: string }[] }) {
  const v = titikVal(t, wi)
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-1">
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: STATUS[v.st]?.color || '#64748b' }}>{STATUS[v.st]?.label || v.st}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{t.src === 'ebs' ? 'Laporan EBS' : 'Laporan Agregat IBS'}</span>
      </div>
      <Row l={wi >= 0 ? `Kasus ${weeks[wi]?.label}` : 'Kasus'} v={nf(v.k)} />
      {wi < 0 ? <><Row l="Kematian" v={nf(t.m)} /><Row l="CFR" v={t.k > 0 ? fmtPct(Math.round((t.m * 1000) / t.k) / 10) : '–'} /><Row l="Laporan" v={nf(t.l)} /></> : null}
      <Row l={t.src === 'ebs' ? 'Sinyal' : 'Alert'} v={nf(v.a)} />
      <Row l="KLB" v={nf(v.b)} tone={v.b > 0 ? 'text-red-600' : undefined} />
      {wi < 0 && t.v ? <Row l="Terverifikasi" v={nf(t.v)} /> : null}
      {wi < 0 && t.rn ? <Row l="Respons ≤ 24 jam" v={`${nf(t.r)} / ${nf(t.rn)} (${fmtPct(Math.round((t.r * 1000) / t.rn) / 10)})`} tone={t.r < t.rn ? 'text-amber-700' : 'text-emerald-700'} /> : null}
      <p className={`mt-1 text-[10px] ${t.lokasi === 'c' ? 'font-bold text-amber-700' : 'text-slate-400'}`}>Lokasi: {label || t.lokasi}</p>
    </div>
  )
}

function Legend({ metric, cls, lvLabel, sumber, weekly, points, heat, onClose, inline = false }: { metric: Metric; cls: MapClass[]; lvLabel: string; sumber: string; weekly: boolean; points: boolean; heat: boolean; onClose: () => void; inline?: boolean }) {
  const [col, setCol] = useState(false)
  const mt = METRICS.find((x) => x.key === metric)!
  return (
    <div className={inline ? "pointer-events-auto w-[265px] rounded-2xl border border-slate-200 bg-white/95 p-3 text-[10.5px] text-slate-600 shadow-lg backdrop-blur" : "absolute bottom-16 left-3 z-30 w-[240px] rounded-xl border border-slate-200 bg-white/95 p-2.5 text-[10.5px] text-slate-600 shadow-lg backdrop-blur"} data-testid="spasial-legend">
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={() => setCol(!col)} className="flex flex-1 items-center gap-1 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">Legenda {col ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup legenda"><X className="h-3 w-3" /></button>
      </div>
      {!col ? (
        <div className="mt-1.5 space-y-2">
          <div>
            <p className="font-bold text-slate-700">{mt.label} per {lvLabel}</p>
            <ul className="mt-1 space-y-0.5">{cls.map((c) => <li key={c.label} className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[2px] border border-slate-300/70" style={{ background: c.color }} /><span className="tabular-nums">{c.label}</span></li>)}
              <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[2px] border border-slate-300/70" style={{ background: '#e5e7eb' }} />{metric === 'chg_minggu' ? 'Tidak ada pembanding' : metric === 'cfr' ? 'Tidak ada kasus' : 'Tidak ada data'}</li></ul>
            <p className="mt-1 leading-snug text-slate-400">{metric === 'chg_minggu' || metric === 'cfr' ? 'Ambang tetap.' : `Kelas: 0 lalu kuartil wilayah bernilai > 0${weekly ? ' (skala sama untuk semua minggu)' : ''}.`}</p>
          </div>
          {points ? (
            <div>
              <p className="font-bold text-slate-700">Titik unit pelapor</p>
              <ul className="mt-1 space-y-0.5">{statusFor(sumber).map((s) => <li key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-white shadow" style={{ background: STATUS[s].color }} />{STATUS[s].label}</li>)}
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-[1.6px] border-slate-900 bg-amber-400" />Ada alert direspons &gt; 24 jam</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-teal-700 bg-white" />Lokasi perkiraan (pusat kab/kota)</li>
                <li className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[8px] font-black text-white">12</span>Kluster: jumlah unit, warna = status terberat</li></ul>
              <p className="mt-1 leading-snug text-slate-400">Ukuran titik sebanding √kasus.</p>
            </div>
          ) : null}
          {heat ? <div className="flex items-center gap-1.5"><span className="h-2.5 w-10 rounded-sm" style={{ background: 'linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)' }} />Heatmap: kepadatan kasus</div> : null}
        </div>
      ) : null}
    </div>
  )
}
