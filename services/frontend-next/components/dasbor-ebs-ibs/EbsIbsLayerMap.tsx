'use client'
// PR 035: Interactive multi-layer OpenLayers map for Dasbor SKDR EBS & IBS.
// Supports 4 composable layers controlled directly by user toggles/sliders:
// 1. Basemap (OSM, Carto Light, ESRI Satelit, Topografi, Carto Dark)
// 2. Choropleth Wilayah (Provinsi -> click drill-down to Kab/Kota)
// 3. Spatial Heatmap Spasial (ol/layer/Heatmap weighted by real transaction metrics)
// 4. Titik Lokasi / Fasyankes (proportional markers from master_fasyankes / master_kabkota coords)
import { useEffect, useMemo, useRef, useState } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import HeatmapLayer from 'ol/layer/Heatmap'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import 'ol/ol.css'
import { Flame, Layers, MapPin, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import type { MapPoint, MapRegion } from '@/lib/dasbor-ebs-ibs-api'

type BaseMap = 'osm' | 'light' | 'satellite' | 'terrain' | 'dark'
export type EbsMapMetric = 'kasus' | 'laporan' | 'kematian' | 'klb'
export type IbsMapMetric = 'agregat_kasus' | 'agregat_laporan' | 'individu_pasien' | 'agregat_kunjungan'
type MetricKey = EbsMapMetric | IbsMapMetric

const geoCache: Record<string, Promise<any>> = {}
const loadGeo = (file: string) => (geoCache[file] ||= fetch(`${PUBLIC_BASE_PATH}/data/${file}`).then((r) => r.json()))

const SCALE_EBS = ['#f1f5f9', '#ccfbf1', '#5eead4', '#14b8a6', '#0f766e', '#115e59']
const SCALE_IBS = ['#f1f5f9', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a']

function shadeColor(v: number, max: number, palette: string[]) {
  if (v <= 0 || max <= 0) return palette[0]
  const idx = Math.min(5, 1 + Math.floor(Math.sqrt(v / max) * 4.999))
  return palette[idx]
}

const nf = (v: number | undefined | null) => new Intl.NumberFormat('id-ID').format(v || 0)

function createBaseSource(base: BaseMap) {
  switch (base) {
    case 'light':
      return new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', crossOrigin: 'anonymous' })
    case 'dark':
      return new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', crossOrigin: 'anonymous' })
    case 'satellite':
      return new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', crossOrigin: 'anonymous' })
    case 'terrain':
      return new XYZ({ url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png', crossOrigin: 'anonymous' })
    default:
      return new OSM({ url: `${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`, crossOrigin: 'anonymous' })
  }
}

export default function EbsIbsLayerMap({
  mode,
  level,
  parentName,
  regions,
  points,
  onDrillDown,
  onResetLevel,
}: {
  mode: 'ebs' | 'ibs'
  level: 'prov' | 'kab'
  parentName?: string | null
  regions: MapRegion[]
  points: MapPoint[]
  onDrillDown: (provId: number, provName: string) => void
  onResetLevel: () => void
}) {
  const palette = mode === 'ebs' ? SCALE_EBS : SCALE_IBS
  const metricOptions: { key: MetricKey; label: string }[] = mode === 'ebs'
    ? [
        { key: 'kasus', label: 'Jumlah Kasus' },
        { key: 'laporan', label: 'Jumlah Laporan' },
        { key: 'kematian', label: 'Jumlah Kematian' },
        { key: 'klb', label: 'Kejadian KLB' },
      ]
    : [
        { key: 'agregat_kasus', label: 'Kasus Agregat' },
        { key: 'agregat_laporan', label: 'Laporan Agregat' },
        { key: 'individu_pasien', label: 'Pasien Form Individu' },
        { key: 'agregat_kunjungan', label: 'Total Kunjungan' },
      ]

  const [metric, setMetric] = useState<MetricKey>(mode === 'ebs' ? 'kasus' : 'agregat_kasus')
  useEffect(() => {
    setMetric(mode === 'ebs' ? 'kasus' : 'agregat_kasus')
  }, [mode])

  const [panelOpen, setPanelOpen] = useState(true)
  const [baseMap, setBaseMap] = useState<BaseMap>('light')
  const [showChoro, setShowChoro] = useState(true)
  const [showHeat, setShowHeat] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [opChoro, setOpChoro] = useState(0.75)
  const [opHeat, setOpHeat] = useState(0.7)
  const [opMarkers, setOpMarkers] = useState(0.95)
  const [heatRadius, setHeatRadius] = useState(18)
  const [heatBlur, setHeatBlur] = useState(22)
  const [fs, setFs] = useState(false)
  const [hoverRegion, setHoverRegion] = useState<MapRegion | null>(null)
  const [hoverPoint, setHoverPoint] = useState<MapPoint | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapObj = useRef<OlMap | null>(null)
  const tileLayer = useRef<TileLayer<OSM | XYZ> | null>(null)
  const choroLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const heatLayer = useRef<HeatmapLayer | null>(null)
  const markerLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const choroSrc = useRef(new VectorSource())
  const heatSrc = useRef(new VectorSource())
  const markerSrc = useRef(new VectorSource())

  const valOfRegion = (r?: MapRegion | null) => {
    if (!r) return 0
    return Number((r as Record<string, unknown>)[metric] ?? 0)
  }

  const valOfPoint = (p: MapPoint) => {
    if (metric === 'agregat_kunjungan') return Number(p.agregat_kasus ?? 0) || Number(p.agregat_laporan ?? 0)
    return Number((p as Record<string, unknown>)[metric] ?? 0)
  }

  const maxRegion = useMemo(() => Math.max(0, ...regions.map((r) => valOfRegion(r))), [regions, metric])
  const maxPoint = useMemo(() => Math.max(0, ...points.map((p) => valOfPoint(p))), [points, metric])
  const byGeo = useMemo(() => new Map(regions.map((r) => [r.geo, r])), [regions])

  // Initialize OpenLayers Map once
  useEffect(() => {
    if (!mapEl.current || mapObj.current) return
    const tl = new TileLayer({ source: createBaseSource(baseMap), opacity: 0.85 })
    const cl = new VectorLayer({ source: choroSrc.current, opacity: opChoro, visible: showChoro })
    const hl = new HeatmapLayer({
      source: heatSrc.current,
      blur: heatBlur,
      radius: heatRadius,
      opacity: opHeat,
      visible: showHeat,
      weight: (f) => Number(f.get('weight') ?? 0),
    })
    const ml = new VectorLayer({ source: markerSrc.current, opacity: opMarkers, visible: showMarkers })
    tileLayer.current = tl
    choroLayer.current = cl
    heatLayer.current = hl
    markerLayer.current = ml

    const m = new OlMap({
      target: mapEl.current,
      layers: [tl, cl, hl, ml],
      view: new View({ center: fromLonLat([118, -2.5]), zoom: 4.35 }),
    })
    mapObj.current = m

    m.on('pointermove', (ev) => {
      let pt: MapPoint | null = null
      let rg: MapRegion | null = null
      let rgLvl: string | null = null
      m.forEachFeatureAtPixel(ev.pixel, (f) => {
        if (!pt && f.get('point')) pt = f.get('point') as MapPoint
        if (!rg && f.get('region')) {
          rg = f.get('region') as MapRegion
          rgLvl = (f.get('lvl') as string) || null
        }
      })
      setHoverPoint(pt)
      setHoverRegion(pt ? null : rg)
      const target = m.getTargetElement()
      if (target) target.style.cursor = pt || (rg && rgLvl === 'prov') ? 'pointer' : ''
    })

    m.on('singleclick', (ev) => {
      const f = m.forEachFeatureAtPixel(ev.pixel, (x) => (x.get('region') ? x : null))
      if (!f) return
      const r = f.get('region') as MapRegion | undefined
      if (r && f.get('lvl') === 'prov') {
        const id = Number(r.key)
        if (Number.isFinite(id) && id > 0) onDrillDown(id, r.name)
      }
    })

    return () => {
      m.setTarget(undefined)
      mapObj.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync basemap, visibility, opacity, heatmap params
  useEffect(() => {
    tileLayer.current?.setSource(createBaseSource(baseMap))
  }, [baseMap])

  useEffect(() => {
    choroLayer.current?.setVisible(showChoro)
    choroLayer.current?.setOpacity(opChoro)
    heatLayer.current?.setVisible(showHeat)
    heatLayer.current?.setOpacity(opHeat)
    heatLayer.current?.setRadius(heatRadius)
    heatLayer.current?.setBlur(heatBlur)
    markerLayer.current?.setVisible(showMarkers)
    markerLayer.current?.setOpacity(opMarkers)
  }, [showChoro, opChoro, showHeat, opHeat, heatRadius, heatBlur, showMarkers, opMarkers])

  // Render Choropleth + Heatmap + Marker layers whenever data/metric/level changes
  useEffect(() => {
    if (!mapObj.current) return
    let alive = true

    // 1) Spatial Heatmap & Markers
    heatSrc.current.clear()
    markerSrc.current.clear()
    const ptDenom = Math.max(1, maxPoint)
    for (const p of points) {
      const v = valOfPoint(p)
      const weight = v > 0 ? Math.max(0.2, Math.min(1, Math.sqrt(v / ptDenom))) : 0.15
      const geom = new Point(fromLonLat([p.lng, p.lat]))
      const hf = new Feature({ geometry: geom, weight })
      heatSrc.current.addFeature(hf)

      const mf = new Feature({ geometry: geom.clone(), point: p })
      const radius = 5 + Math.round(13 * Math.sqrt((v || 1) / ptDenom))
      const isHighlight = mode === 'ebs' ? (p.klb || 0) > 0 : (p.individu_pasien || 0) > 0 && (p.agregat_kasus || 0) === 0
      const fill = mode === 'ebs'
        ? (isHighlight ? 'rgba(220, 38, 38, 0.85)' : 'rgba(13, 148, 136, 0.85)')
        : (isHighlight ? 'rgba(124, 58, 237, 0.85)' : 'rgba(37, 99, 235, 0.85)')
      mf.setStyle(new Style({
        image: new CircleStyle({
          radius,
          fill: new Fill({ color: fill }),
          stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
        }),
      }))
      markerSrc.current.addFeature(mf)
    }

    // 2) GeoJSON Choropleth
    choroSrc.current.clear()
    const file = level === 'prov' ? 'indonesia-38-provinces.geojson' : 'indonesia-kabupaten.geojson'
    loadGeo(file).then((gj) => {
      if (!alive || !mapObj.current) return
      const fs = new GeoJSON().readFeatures(gj, { featureProjection: 'EPSG:3857' }) as Feature[]
      for (const f of fs) {
        const code = String(level === 'prov' ? f.get('id_provinsi') : f.get('kode_kab'))
        const r = byGeo.get(code)
        if (level === 'kab' && !r) continue
        const v = valOfRegion(r)
        f.set('region', r || { key: code, name: String(f.get('provinsi') || f.get('nama_kab') || code), geo: code, lat: null, lng: null, unit_unik: 0 })
        f.set('lvl', level)
        f.setStyle(new Style({
          fill: new Fill({ color: shadeColor(v, maxRegion, palette) }),
          stroke: new Stroke({ color: level === 'prov' ? '#cbd5e1' : '#ffffff', width: 0.9 }),
        }))
        choroSrc.current.addFeature(f)
      }
      if (level === 'kab') {
        const ex = choroSrc.current.getExtent()
        if (ex && isFinite(ex[0])) {
          mapObj.current.getView().fit(ex, { padding: [36, 36, 36, 36], maxZoom: 10, duration: 350 })
        }
      } else {
        mapObj.current.getView().animate({ center: fromLonLat([118, -2.5]), zoom: 4.35, duration: 300 })
      }
    }).catch(() => {})

    return () => { alive = false }
  }, [regions, points, level, metric, mode, maxRegion, maxPoint]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetView = () => {
    if (level === 'kab') onResetLevel()
    else mapObj.current?.getView().animate({ center: fromLonLat([118, -2.5]), zoom: 4.35, duration: 300 })
  }

  const toggleFs = () => {
    if (!wrapRef.current) return
    if (!document.fullscreenElement) {
      wrapRef.current.requestFullscreen?.().then(() => setFs(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setFs(false)).catch(() => {})
    }
  }

  const hasAny = regions.length > 0 || points.length > 0

  return (
    <div ref={wrapRef} className={`skdr-card flex flex-col overflow-hidden ${fs ? 'h-screen rounded-none bg-white' : ''}`} data-testid="ebs-ibs-map">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span>Peta Spasial &amp; Layering Wilayah ({mode === 'ebs' ? 'EBS' : 'IBS'})</span>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {nf(points.length)} titik · {nf(regions.length)} wilayah
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <button
              type="button"
              onClick={onResetLevel}
              className={level === 'prov' ? 'font-bold text-slate-800' : 'text-primary underline hover:text-brand-900'}
            >
              Indonesia (Provinsi)
            </button>
            {level === 'kab' ? (
              <>
                <span>›</span>
                <span className="font-bold text-slate-800">{parentName || 'Kabupaten/Kota'}</span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400">· Klik provinsi berdata untuk melihat Kab/Kota</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetView}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Reset tampilan peta"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Peta
          </button>
          <button
            type="button"
            onClick={toggleFs}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title={fs ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {fs ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Body: Left layer panel + OpenLayers Map */}
      <div className={`relative flex min-h-[460px] flex-1 ${fs ? 'h-full' : 'h-[480px]'}`}>
        <aside className={`z-10 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/90 transition-all ${panelOpen ? 'w-[252px]' : 'w-10'}`}>
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            className="flex w-full items-center gap-1.5 border-b border-slate-200/70 bg-white px-2.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
            {panelOpen ? (
              <>
                <span>Kontrol Layer Peta</span>
                <ChevronLeft className="ml-auto h-4 w-4 text-slate-400" />
              </>
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>

          {panelOpen ? (
            <div className="space-y-4 p-3 text-xs">
              <div>
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Metrik Peta</div>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as MetricKey)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-primary"
                >
                  {metricOptions.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Lapisan Data (Layers)</div>

                {/* Choropleth layer */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <label className="flex cursor-pointer items-center justify-between gap-2 font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-primary" /> Choropleth Wilayah</span>
                    <input type="checkbox" checked={showChoro} onChange={(e) => setShowChoro(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                  </label>
                  {showChoro ? (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Opasitas</span>
                      <input type="range" min={0.1} max={1} step={0.05} value={opChoro} onChange={(e) => setOpChoro(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="w-7 text-right tabular-nums">{Math.round(opChoro * 100)}%</span>
                    </div>
                  ) : null}
                </div>

                {/* Spatial Heatmap layer */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <label className="flex cursor-pointer items-center justify-between gap-2 font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5 text-orange-500" /> Heatmap Spasial</span>
                    <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} className="h-3.5 w-3.5 accent-orange-500" />
                  </label>
                  {showHeat ? (
                    <div className="mt-2 space-y-1.5 text-[10px] text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="w-11">Opasitas</span>
                        <input type="range" min={0.1} max={1} step={0.05} value={opHeat} onChange={(e) => setOpHeat(Number(e.target.value))} className="flex-1 accent-orange-500" />
                        <span className="w-7 text-right tabular-nums">{Math.round(opHeat * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-11">Radius</span>
                        <input type="range" min={6} max={40} step={1} value={heatRadius} onChange={(e) => setHeatRadius(Number(e.target.value))} className="flex-1 accent-orange-500" />
                        <span className="w-7 text-right tabular-nums">{heatRadius}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-11">Blur</span>
                        <input type="range" min={6} max={45} step={1} value={heatBlur} onChange={(e) => setHeatBlur(Number(e.target.value))} className="flex-1 accent-orange-500" />
                        <span className="w-7 text-right tabular-nums">{heatBlur}</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Proportional Markers layer */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <label className="flex cursor-pointer items-center justify-between gap-2 font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-teal-600" /> Titik Unit / Lokasi</span>
                    <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} className="h-3.5 w-3.5 accent-teal-600" />
                  </label>
                  {showMarkers ? (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Opasitas</span>
                      <input type="range" min={0.1} max={1} step={0.05} value={opMarkers} onChange={(e) => setOpMarkers(Number(e.target.value))} className="flex-1 accent-teal-600" />
                      <span className="w-7 text-right tabular-nums">{Math.round(opMarkers * 100)}%</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Basemap selector */}
              <div>
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Peta Dasar (Basemap)</div>
                <div className="grid grid-cols-2 gap-1">
                  {([
                    ['light', 'Carto Light'],
                    ['osm', 'OSM'],
                    ['satellite', 'Satelit'],
                    ['terrain', 'Topografi'],
                    ['dark', 'Gelap'],
                  ] as [BaseMap, string][]).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setBaseMap(k)}
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${baseMap === k ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        {/* Map Canvas */}
        <div className="relative flex-1 bg-slate-100">
          <div ref={mapEl} className="h-full w-full" />

          {/* Empty data notice on map when no transaction locations exist */}
          {!hasAny ? (
            <div className="pointer-events-none absolute inset-x-4 top-4 mx-auto max-w-md rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-center text-xs text-slate-600 shadow-sm">
              Belum ada data transaksi berlokasi pada filter aktif. Isi atau ubah filter untuk melihat sebaran wilayah, heatmap spasial, dan titik unit.
            </div>
          ) : null}

          {/* Hover tooltip */}
          {(hoverPoint || hoverRegion) ? (
            <div className="pointer-events-none absolute right-3 top-3 z-20 max-w-xs rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 text-xs shadow-md">
              {hoverPoint ? (
                <>
                  <div className="font-bold text-slate-900">{hoverPoint.unit_nama}</div>
                  <div className="text-[11px] text-slate-500">
                    {[hoverPoint.jenis_unit, hoverPoint.kabkota_name, hoverPoint.province_name].filter(Boolean).join(' · ')}
                  </div>
                  {mode === 'ebs' ? (
                    <div className="mt-1.5 space-y-0.5 text-slate-700">
                      <div><b>{nf(hoverPoint.laporan)}</b> laporan · <b>{nf(hoverPoint.kasus)}</b> kasus · <b>{nf(hoverPoint.kematian)}</b> kematian</div>
                      <div>KLB: <b>{nf(hoverPoint.klb)}</b> · Terakhir: {hoverPoint.last_date || '—'}</div>
                    </div>
                  ) : (
                    <div className="mt-1.5 space-y-0.5 text-slate-700">
                      <div>Agregat: <b>{nf(hoverPoint.agregat_laporan)}</b> lap · <b>{nf(hoverPoint.agregat_kasus)}</b> kasus · <b>{nf(hoverPoint.agregat_kematian)}</b> mati</div>
                      <div>Form Individu: <b>{nf(hoverPoint.individu_pasien)}</b> pasien · Terakhir: {hoverPoint.last_periode || '—'}</div>
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-slate-400">Sumber koordinat: {hoverPoint.coord_source || 'master'}</div>
                </>
              ) : hoverRegion ? (
                <>
                  <div className="font-bold text-slate-900">{hoverRegion.name}</div>
                  {mode === 'ebs' ? (
                    <div className="mt-1 space-y-0.5 text-slate-700">
                      <div><b>{nf(hoverRegion.laporan)}</b> laporan ({nf(hoverRegion.dikirim)} dikirim, {nf(hoverRegion.draf)} draf)</div>
                      <div><b>{nf(hoverRegion.kasus)}</b> kasus · <b>{nf(hoverRegion.kematian)}</b> kematian · <b>{nf(hoverRegion.klb)}</b> KLB</div>
                      <div>Unit pelapor: <b>{nf(hoverRegion.unit_unik)}</b></div>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-0.5 text-slate-700">
                      <div>Agregat: <b>{nf(hoverRegion.agregat_laporan)}</b> lap · <b>{nf(hoverRegion.agregat_kasus)}</b> kasus · <b>{nf(hoverRegion.agregat_kematian)}</b> mati</div>
                      <div>Form Individu: <b>{nf(hoverRegion.individu_pasien)}</b> pasien · Total Kunjungan: <b>{nf(hoverRegion.agregat_kunjungan)}</b></div>
                      <div>Unit pelapor: <b>{nf(hoverRegion.unit_unik)}</b></div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          {/* Dynamic Legend (computed strictly from real DB min/max) */}
          <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] shadow-sm">
            <div className="font-bold text-slate-700">
              {metricOptions.find((m) => m.key === metric)?.label} (Maks: {nf(maxRegion)})
            </div>
            <div className="mt-1 flex items-center gap-1">
              {palette.map((c, i) => (
                <span key={i} className="h-2.5 w-5 rounded-sm border border-slate-200" style={{ background: c }} title={i === 0 ? '0' : `Kelas ${i}`} />
              ))}
              <span className="ml-1 text-[10px] text-slate-500">0 — {nf(maxRegion)}</span>
            </div>
            {showMarkers ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[10px] text-slate-600">
                {mode === 'ebs' ? (
                  <>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> Non-KLB</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Ada KLB</span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Agregat / Gabungan</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" /> Khusus Individu</span>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
