'use client'
// Interactive multi-layer OpenLayers map for Dasbor MBG & Dasbor SKDR EBS/IBS.
// Uses the exact same basemap proxy (/osm-tiles/{z}/{x}/{y}.png), floating toolbar, layer popover,
// clustering, click overlay popup, and collapsible legend style as SpasialMap (/dashboard/spasial).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Overlay from 'ol/Overlay'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import HeatmapLayer from 'ol/layer/Heatmap'
import VectorSource from 'ol/source/Vector'
import Cluster from 'ol/source/Cluster'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import Feature, { type FeatureLike } from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import { boundingExtent, createEmpty, extend, isEmpty } from 'ol/extent'
import 'ol/ol.css'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import type { MapPoint, MapRegion } from '@/lib/dasbor-ebs-ibs-api'
import type { MbgMapPoint, MbgMapRegion } from '@/lib/dasbor-mbg-api'

export type BaseMap = 'light' | 'osm' | 'satellite' | 'none'
export type PointMode = 'kluster' | 'titik' | 'off'
export type EbsMapMetric = 'kasus' | 'laporan' | 'kematian' | 'klb'
export type IbsMapMetric = 'agregat_kasus' | 'agregat_laporan' | 'individu_pasien' | 'agregat_kunjungan'
export type GiziMapMetric = 'kunjungan' | 'rekap12_baik' | 'rekap12_belum_baik' | 'avg_skor'
export type KeracunanMapMetric = 'kasus' | 'kejadian' | 'meninggal' | 'terpapar'
export type MapMode = 'ebs' | 'ibs' | 'gizi' | 'keracunan'
type MetricKey = EbsMapMetric | IbsMapMetric | GiziMapMetric | KeracunanMapMetric
type AnyRegion = MapRegion | MbgMapRegion
type AnyPoint = MapPoint | MbgMapPoint

const geoCache: Record<string, Promise<any>> = {}
const loadJson = (url: string) =>
  (geoCache[url] ||= fetch(url).then((r) => {
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  }))

async function loadGeoFeatures(level: 'prov' | 'kab', provCode: string | null, provName: string | null) {
  if (level === 'prov') {
    return (await loadJson(`${PUBLIC_BASE_PATH}/data/indonesia-38-provinces.geojson`)).features || []
  }
  let code = provCode
  if (!code && provName) {
    try {
      const provs = (await loadJson(`${PUBLIC_BASE_PATH}/data/indonesia-38-provinces.geojson`)).features || []
      const hit = provs.find(
        (f: any) => String(f.properties?.provinsi || '').trim().toLowerCase() === provName.trim().toLowerCase(),
      )
      if (hit) code = String(hit.properties?.id_provinsi || '')
    } catch {}
  }
  let fs: any[] = []
  if (provName) {
    try {
      const r = await loadJson(`${PUBLIC_BASE_PATH}/wilayah-data?level=kabupaten&province=${encodeURIComponent(provName)}`)
      fs = r?.geojson?.features || []
    } catch {
      fs = []
    }
  }
  if (!fs.length || (code && !fs.some((f: any) => String(f.properties?.kode_prov) === String(code)))) {
    const all = (await loadJson(`${PUBLIC_BASE_PATH}/data/indonesia-kabupaten.geojson`)).features || []
    fs = code ? all.filter((f: any) => String(f.properties?.kode_prov) === String(code)) : all
  }
  return fs
}

const MODE_CFG: Record<
  MapMode,
  {
    title: string
    palette: string[]
    defaultMetric: MetricKey
    metrics: { key: MetricKey; label: string }[]
    normalHex: string
    alertHex: string
    normalLabel: string
    alertLabel: string
    isAlert: (p: AnyPoint) => boolean
  }
> = {
  ebs: {
    title: 'EBS',
    palette: ['#e5e7eb', '#ccfbf1', '#5eead4', '#14b8a6', '#0f766e', '#115e59'],
    defaultMetric: 'kasus',
    metrics: [
      { key: 'kasus', label: 'Jumlah Kasus' },
      { key: 'laporan', label: 'Jumlah Laporan' },
      { key: 'kematian', label: 'Jumlah Kematian' },
      { key: 'klb', label: 'Kejadian KLB' },
    ],
    normalHex: '#0d9488',
    alertHex: '#dc2626',
    normalLabel: 'Non-KLB',
    alertLabel: 'Ada KLB',
    isAlert: (p) => Number((p as MapPoint).klb || 0) > 0,
  },
  ibs: {
    title: 'IBS',
    palette: ['#e5e7eb', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'],
    defaultMetric: 'agregat_kasus',
    metrics: [
      { key: 'agregat_kasus', label: 'Kasus Agregat' },
      { key: 'agregat_laporan', label: 'Laporan Agregat' },
      { key: 'individu_pasien', label: 'Pasien Form Individu' },
      { key: 'agregat_kunjungan', label: 'Total Kunjungan' },
    ],
    normalHex: '#2563eb',
    alertHex: '#7c3aed',
    normalLabel: 'Agregat / Gabungan',
    alertLabel: 'Khusus Individu',
    isAlert: (p) => Number((p as MapPoint).individu_pasien || 0) > 0 && Number((p as MapPoint).agregat_kasus || 0) === 0,
  },
  gizi: {
    title: 'Pengawasan Gizi MBG',
    palette: ['#e5e7eb', '#d1fae5', '#6ee7b7', '#10b981', '#059669', '#065f46'],
    defaultMetric: 'kunjungan',
    metrics: [
      { key: 'avg_skor', label: 'Rata-rata Skor SOP' },
      { key: 'kunjungan', label: 'Jumlah Kunjungan' },
      { key: 'rekap12_baik', label: 'Standar Gizi BAIK (F12)' },
      { key: 'rekap12_belum_baik', label: 'Perlu Perbaikan (F12)' },
    ],
    normalHex: '#059669',
    alertHex: '#d97706',
    normalLabel: 'SPPG Baik / Terpantau',
    alertLabel: 'Skor < 80 / F12 BELUM BAIK',
    isAlert: (p) => Number((p as MbgMapPoint).rekap12_belum_baik || 0) > 0 || ((p as MbgMapPoint).avg_skor ?? 100) < 80,
  },
  keracunan: {
    title: 'Keracunan Pangan MBG',
    palette: ['#e5e7eb', '#ffedd5', '#fdba74', '#f97316', '#dc2626', '#991b1b'],
    defaultMetric: 'kasus',
    metrics: [
      { key: 'kasus', label: 'Jumlah Kasus' },
      { key: 'kejadian', label: 'Jumlah Kejadian' },
      { key: 'meninggal', label: 'Korban Meninggal' },
      { key: 'terpapar', label: 'Populasi Terpapar' },
    ],
    normalHex: '#ea580c',
    alertHex: '#b91c1c',
    normalLabel: 'Kejadian Non-Fatal',
    alertLabel: 'Ada Kematian',
    isAlert: (p) => Number((p as MbgMapPoint).meninggal || 0) > 0,
  },
}

function shadeHex(v: number, max: number, palette: string[]) {
  if (v <= 0 || max <= 0) return palette[0]
  const idx = Math.min(5, 1 + Math.floor(Math.sqrt(v / max) * 4.999))
  return palette[idx]
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const nf = (v: number | undefined | null) => new Intl.NumberFormat('id-ID').format(v || 0)

function createBaseSource(base: BaseMap) {
  if (base === 'satellite') {
    return new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      crossOrigin: 'anonymous',
      attributions: 'Esri',
    })
  }
  // 'light' and 'osm' both use the application's own OSM tile proxy (same as SpasialMap & Dasbor SKDR — no Carto)
  return new OSM({ url: `${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`, crossOrigin: 'anonymous' })
}

type PopupState =
  | { kind: 'region'; region: AnyRegion; hasData: boolean }
  | { kind: 'point'; point: AnyPoint }
  | { kind: 'cluster'; items: AnyPoint[] }

function Row({ l, v, tone }: { l: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-0.5 last:border-0">
      <span className="text-slate-500">{l}</span>
      <b className={`tabular-nums ${tone || 'text-slate-800'}`}>{v}</b>
    </div>
  )
}

export default function EbsIbsLayerMap({
  mode,
  level,
  parentName,
  regions,
  points,
  onDrillDown,
  onResetLevel,
  compact = false,
  initialMetric,
  title,
}: {
  mode: MapMode
  level: 'prov' | 'kab'
  parentName?: string | null
  regions: AnyRegion[]
  points: AnyPoint[]
  onDrillDown: (provId: number, provName: string) => void
  onResetLevel: () => void
  /** Tampilan ringkas untuk grid 2 kolom (tinggi 440 px) */
  compact?: boolean
  initialMetric?: MetricKey
  title?: string
}) {
  const cfg = MODE_CFG[mode]
  const palette = cfg.palette
  const metricOptions = cfg.metrics

  const [metric, setMetric] = useState<MetricKey>(initialMetric || cfg.defaultMetric)
  useEffect(() => {
    setMetric(initialMetric || MODE_CFG[mode].defaultMetric)
  }, [mode, initialMetric])

  const [baseMap, setBaseMap] = useState<BaseMap>('light')
  const [showChoro, setShowChoro] = useState(true)
  const [opChoro, setOpChoro] = useState(0.78)
  const [pointMode, setPointMode] = useState<PointMode>('kluster')
  const [showHeat, setShowHeat] = useState(false)
  const [opHeat, setOpHeat] = useState(0.75)
  const [heatRadius, setHeatRadius] = useState(16)
  const [heatBlur, setHeatBlur] = useState(22)
  const [showLayers, setShowLayers] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [legendCol, setLegendCol] = useState(false)
  const [fs, setFs] = useState(false)
  const [geoErr, setGeoErr] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const [popNode] = useState<HTMLDivElement | null>(() =>
    typeof document !== 'undefined' ? document.createElement('div') : null,
  )
  const mapObj = useRef<OlMap | null>(null)
  const tileLayer = useRef<TileLayer<OSM | XYZ> | null>(null)
  const choroLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const heatLayer = useRef<HeatmapLayer | null>(null)
  const clusterLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const markerLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const overlayRef = useRef<Overlay | null>(null)
  const choroSrc = useRef(new VectorSource())
  const pointSrc = useRef(new VectorSource())
  const clusterSrc = useRef(new Cluster({ distance: 40, minDistance: 12, source: pointSrc.current }))

  const styleCtx = useRef<{
    byGeo: Map<string, AnyRegion>
    metric: MetricKey
    maxRegion: number
    maxPoint: number
    palette: string[]
    opChoro: number
    hoverCode: string | null
    mode: MapMode
  }>({
    byGeo: new Map(),
    metric: cfg.defaultMetric,
    maxRegion: 1,
    maxPoint: 1,
    palette,
    opChoro: 0.78,
    hoverCode: null,
    mode,
  })

  const onDrillRef = useRef(onDrillDown)
  onDrillRef.current = onDrillDown

  const valOfRegion = useCallback(
    (r?: AnyRegion | null, m: MetricKey = metric) => {
      if (!r) return 0
      return Number((r as Record<string, unknown>)[m] ?? 0)
    },
    [metric],
  )

  const valOfPoint = useCallback(
    (p: AnyPoint, m: MetricKey = metric) => {
      if (m === 'agregat_kunjungan') {
        const mp = p as MapPoint
        return Number(mp.agregat_kasus ?? 0) || Number(mp.agregat_laporan ?? 0)
      }
      if (m === 'avg_skor') return Number((p as MbgMapPoint).kunjungan ?? 0)
      if (m === 'terpapar') return Number((p as MbgMapPoint).kasus ?? 0)
      return Number((p as Record<string, unknown>)[m] ?? 0)
    },
    [metric],
  )

  const pointLabel = (p: AnyPoint) => {
    const ptEbs = p as MapPoint
    const ptMbg = p as MbgMapPoint
    if (mode === 'gizi') return ptMbg.nama_sppg || ptMbg.unit_nama || 'SPPG'
    if (mode === 'keracunan') return ptMbg.label || ptMbg.nama_sppg || 'Kejadian MBG'
    return ptEbs.unit_nama || 'Unit Pelapor'
  }

  const maxRegion = useMemo(() => Math.max(0, ...regions.map((r) => valOfRegion(r))), [regions, valOfRegion])
  const maxPoint = useMemo(() => Math.max(0, ...points.map((p) => valOfPoint(p))), [points, valOfPoint])
  const byGeo = useMemo(() => new Map(regions.map((r) => [String(r.geo), r])), [regions])

  useEffect(() => {
    styleCtx.current = {
      ...styleCtx.current,
      byGeo,
      metric,
      maxRegion,
      maxPoint,
      palette,
      opChoro,
      mode,
    }
    choroLayer.current?.changed()
    markerLayer.current?.changed()
    clusterLayer.current?.changed()
  }, [byGeo, metric, maxRegion, maxPoint, palette, opChoro, mode])

  // Initialize OpenLayers Map once (matching SpasialMap architecture)
  useEffect(() => {
    if (!mapEl.current || mapObj.current) return

    const tl = new TileLayer({
      source: createBaseSource('light'),
      zIndex: 0,
      className: 'spasial-base',
    })

    const choroStyle = (f: FeatureLike) => {
      const c = styleCtx.current
      const code = String(f.get('code') || '')
      const r = c.byGeo.get(code)
      const v = r ? Number((r as Record<string, unknown>)[c.metric] ?? 0) : 0
      const hex = shadeHex(v, c.maxRegion, c.palette)
      const hov = c.hoverCode === code
      return new Style({
        fill: new Fill({ color: hexToRgba(hex, c.opChoro) }),
        stroke: new Stroke({
          color: hov ? '#334155' : 'rgba(255,255,255,0.95)',
          width: hov ? 2 : 0.8,
        }),
        zIndex: hov ? 2 : 1,
      })
    }

    const cl = new VectorLayer({
      source: choroSrc.current,
      style: choroStyle,
      zIndex: 1,
      visible: true,
    })

    const hl = new HeatmapLayer({
      source: pointSrc.current,
      blur: heatBlur,
      radius: heatRadius,
      opacity: opHeat,
      visible: false,
      zIndex: 2,
      weight: (f) => Number(f.get('weight') ?? 0),
    })

    const ptStyle = (f: FeatureLike) => {
      const c = styleCtx.current
      const mc = MODE_CFG[c.mode]
      const p = f.get('point') as AnyPoint
      const v = Number(f.get('val') ?? 1)
      const rad = Math.round(5 + Math.sqrt(Math.max(0, v) / Math.max(1, c.maxPoint)) * 12)
      const isAlert = mc.isAlert(p)
      const hex = isAlert ? mc.alertHex : mc.normalHex
      return new Style({
        image: new CircleStyle({
          radius: rad,
          fill: new Fill({ color: hex + 'd9' }),
          stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
        }),
        zIndex: isAlert ? 4 : 3,
      })
    }

    const ml = new VectorLayer({
      source: pointSrc.current,
      style: ptStyle,
      zIndex: 3,
      visible: false,
    })

    const clStyle = (f: FeatureLike) => {
      const fs2: Feature[] = f.get('features') || []
      if (fs2.length === 1) return ptStyle(fs2[0])
      const c = styleCtx.current
      const mc = MODE_CFG[c.mode]
      let sumV = 0
      let hasAlert = false
      for (const x of fs2) {
        sumV += Number(x.get('val') ?? 0)
        const pt = x.get('point') as AnyPoint
        if (pt && mc.isAlert(pt)) hasAlert = true
      }
      const hex = hasAlert ? mc.alertHex : mc.normalHex
      const rad = Math.round(10 + Math.min(13, Math.log10(1 + sumV + fs2.length) * 3.2))
      return new Style({
        image: new CircleStyle({
          radius: rad,
          fill: new Fill({ color: hex + 'cc' }),
          stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
        }),
        text: new Text({
          text: fs2.length > 999 ? `${Math.round(fs2.length / 100) / 10}rb` : String(fs2.length),
          font: 'bold 11px Inter, sans-serif',
          fill: new Fill({ color: '#ffffff' }),
        }),
        zIndex: hasAlert ? 5 : 4,
      })
    }

    const cluL = new VectorLayer({
      source: clusterSrc.current,
      style: clStyle,
      zIndex: 3,
      visible: true,
    })

    const ov = new Overlay({
      element: popNode!,
      positioning: 'bottom-center',
      offset: [0, -12],
      stopEvent: true,
      autoPan: { animation: { duration: 200 }, margin: 48 },
    })

    tileLayer.current = tl
    choroLayer.current = cl
    heatLayer.current = hl
    markerLayer.current = ml
    clusterLayer.current = cluL
    overlayRef.current = ov

    const m = new OlMap({
      target: mapEl.current,
      layers: [tl, cl, hl, cluL, ml],
      overlays: [ov],
      view: new View({ center: fromLonLat([118, -2.5]), zoom: 4.5, minZoom: 3.5, maxZoom: 17 }),
      controls: [],
    })
    mapObj.current = m

    m.on('pointermove', (ev) => {
      if (ev.dragging) return
      const hit = m.forEachFeatureAtPixel(ev.pixel, (f, l) => ({ f, l }), {
        hitTolerance: 3,
        layerFilter: (l) => l !== hl,
      })
      let code: string | null = null
      let text: string | null = null
      const c = styleCtx.current
      const mc = MODE_CFG[c.mode]
      const mtLabel = mc.metrics.find((x) => x.key === c.metric)?.label || ''

      if (hit?.l === cl) {
        code = String(hit.f.get('code') || '')
        const rg = c.byGeo.get(code)
        const v = rg ? Number((rg as Record<string, unknown>)[c.metric] ?? 0) : 0
        const valTxt = c.metric === 'avg_skor' ? (rg && v > 0 ? `${v.toFixed(1)}%` : '–') : nf(v)
        text = `${hit.f.get('name')}: ${mtLabel} ${valTxt}`
      } else if (hit) {
        const fs2: Feature[] = hit.f.get('features') || [hit.f]
        if (fs2.length > 1) {
          text = `${nf(fs2.length)} lokasi · klik untuk memperbesar`
        } else {
          const pt = fs2[0]?.get('point') as AnyPoint | undefined
          if (pt) {
            const v = Number(fs2[0]?.get('val') ?? 0)
            const lbl =
              c.mode === 'gizi'
                ? (pt as MbgMapPoint).nama_sppg || (pt as MbgMapPoint).unit_nama || 'SPPG'
                : c.mode === 'keracunan'
                  ? (pt as MbgMapPoint).label || (pt as MbgMapPoint).nama_sppg || 'Kejadian MBG'
                  : (pt as MapPoint).unit_nama || 'Unit'
            text = `${lbl} · ${nf(v)}`
          }
        }
      }

      if (c.hoverCode !== code) {
        c.hoverCode = code
        cl.changed()
      }
      const target = m.getTargetElement()
      if (target) target.style.cursor = hit ? 'pointer' : ''
      setHover(text ? { x: ev.pixel[0], y: ev.pixel[1], text } : null)
    })

    m.on('singleclick', (ev) => {
      const hit = m.forEachFeatureAtPixel(ev.pixel, (f, l) => ({ f, l }), {
        hitTolerance: 3,
        layerFilter: (l) => l !== hl,
      })
      if (!hit) {
        setPopup(null)
        ov.setPosition(undefined)
        return
      }
      if (hit.l === cl) {
        const code = String(hit.f.get('code') || '')
        const name = String(hit.f.get('name') || code)
        const rg = styleCtx.current.byGeo.get(code)
        const regionObj: AnyRegion =
          rg ||
          ({
            key: code,
            name,
            geo: code,
            lat: null,
            lng: null,
            unit_unik: 0,
            sppg_unik: 0,
            kunjungan: 0,
            dikirim: 0,
            rekap12_baik: 0,
            rekap12_belum_baik: 0,
            avg_skor: null,
            kejadian: 0,
            ditutup: 0,
            kasus: 0,
            meninggal: 0,
            terpapar: 0,
            lab_hasil: 0,
          } as unknown as AnyRegion)
        setPopup({ kind: 'region', region: regionObj, hasData: Boolean(rg) })
        ov.setPosition(ev.coordinate)
        return
      }

      const fs2: Feature[] = hit.f.get('features') || [hit.f]
      if (fs2.length > 1) {
        const ext = boundingExtent(fs2.map((x) => (x.getGeometry() as Point).getCoordinates()))
        const z = m.getView().getZoom() || 5
        if (z < 12 && ext[2] - ext[0] + (ext[3] - ext[1]) > 30) {
          m.getView().fit(ext, { padding: [64, 64, 64, 64], duration: 350, maxZoom: Math.min(14, z + 3) })
          setPopup(null)
          ov.setPosition(undefined)
        } else {
          setPopup({ kind: 'cluster', items: fs2.map((x) => x.get('point') as AnyPoint) })
          ov.setPosition((fs2[0].getGeometry() as Point).getCoordinates())
        }
        return
      }
      const pt = fs2[0]?.get('point') as AnyPoint | undefined
      if (pt) {
        setPopup({ kind: 'point', point: pt })
        ov.setPosition((fs2[0].getGeometry() as Point).getCoordinates())
      }
    })

    const onFs = () => {
      setFs(Boolean(document.fullscreenElement))
      setTimeout(() => m.updateSize(), 60)
    }
    document.addEventListener('fullscreenchange', onFs)
    const ro = new ResizeObserver(() => m.updateSize())
    ro.observe(mapEl.current)

    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      ro.disconnect()
      m.setTarget(undefined)
      mapObj.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync basemap visibility & source
  useEffect(() => {
    if (!tileLayer.current) return
    tileLayer.current.setVisible(baseMap !== 'none')
    if (baseMap !== 'none') tileLayer.current.setSource(createBaseSource(baseMap))
  }, [baseMap])

  // Sync layer visibility & parameters
  useEffect(() => {
    choroLayer.current?.setVisible(showChoro)
    heatLayer.current?.setVisible(showHeat)
    heatLayer.current?.setOpacity(opHeat)
    heatLayer.current?.setRadius(heatRadius)
    heatLayer.current?.setBlur(heatBlur)
    clusterLayer.current?.setVisible(pointMode === 'kluster')
    markerLayer.current?.setVisible(pointMode === 'titik')
  }, [showChoro, showHeat, opHeat, heatRadius, heatBlur, pointMode])

  // Sync points into VectorSource
  useEffect(() => {
    pointSrc.current.clear()
    const ptDenom = Math.max(1, maxPoint)
    const feats: Feature[] = []
    for (const p of points) {
      if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue
      const v = valOfPoint(p)
      const weight = v > 0 ? Math.max(0.2, Math.min(1, Math.sqrt(v / ptDenom))) : 0.2
      const f = new Feature({
        geometry: new Point(fromLonLat([p.lng, p.lat])),
        point: p,
        val: v,
        weight,
      })
      feats.push(f)
    }
    pointSrc.current.addFeatures(feats)
  }, [points, maxPoint, valOfPoint])

  const fitAll = useCallback(() => {
    const m = mapObj.current
    if (!m) return
    const ext = createEmpty()
    choroSrc.current.getFeatures().forEach((f) => {
      const g = f.getGeometry()
      if (g) extend(ext, g.getExtent())
    })
    if (!isEmpty(ext)) {
      m.getView().fit(ext, {
        padding: [52, 24, 48, 24],
        duration: 300,
        maxZoom: level === 'kab' ? 10 : 8.5,
      })
    } else {
      m.getView().animate({ center: fromLonLat([118, -2.5]), zoom: 4.5, duration: 300 })
    }
  }, [level])

  // Load GeoJSON Choropleth boundaries & fit view extent (same as SpasialMap)
  const provCodeHint = useMemo(() => {
    if (level !== 'kab') return null
    const firstGeo = regions.find((r) => r.geo && String(r.geo).length >= 2)?.geo
    return firstGeo ? String(firstGeo).slice(0, 2) : null
  }, [level, regions])

  useEffect(() => {
    if (!mapObj.current) return
    let alive = true
    setGeoErr(false)
    setPopup(null)
    overlayRef.current?.setPosition(undefined)

    loadGeoFeatures(level, provCodeHint, parentName || null)
      .then((rawFeatures) => {
        if (!alive || !mapObj.current) return
        const feats = new GeoJSON().readFeatures(
          { type: 'FeatureCollection', features: rawFeatures },
          { featureProjection: 'EPSG:3857' },
        ) as Feature[]
        feats.forEach((f) => {
          const p = f.getProperties()
          const code = String(level === 'prov' ? p.id_provinsi : p.kode_kab)
          const name = String(level === 'prov' ? p.provinsi : p.nama_kab || code)
          f.set('code', code)
          f.set('name', name)
          f.set('lvl', level)
        })
        choroSrc.current.clear()
        choroSrc.current.addFeatures(feats)
        choroLayer.current?.changed()
        fitAll()
      })
      .catch(() => {
        if (alive) setGeoErr(true)
      })

    return () => {
      alive = false
    }
  }, [level, parentName, provCodeHint, fitAll])

  const closePopup = () => {
    setPopup(null)
    overlayRef.current?.setPosition(undefined)
  }

  const toggleFs = () => {
    if (!wrapRef.current) return
    if (!document.fullscreenElement) {
      wrapRef.current.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }

  const btn = (on: boolean) =>
    `flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold transition ${
      on ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100'
    }`

  const activeMetricLabel = metricOptions.find((m) => m.key === metric)?.label || ''
  const lvLabel = level === 'prov' ? 'provinsi' : 'kab/kota'

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xs"
      style={{ height: fs ? '100vh' : compact ? 440 : 500 }}
      data-testid="ebs-ibs-map"
      data-base={baseMap}
    >
      <style>{`[data-base="light"] .spasial-base canvas{filter:grayscale(1) brightness(1.08) contrast(0.88)}`}</style>
      <div ref={mapEl} className="absolute inset-0" />

      {geoErr ? (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 shadow">
          Batas wilayah gagal dimuat; titik lokasi tetap ditampilkan.
        </div>
      ) : null}

      {/* Floating Top-Center Toolbar (SpasialMap style) */}
      <div
        className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur"
        data-testid="mbg-map-toolbar"
      >
        {level === 'kab' ? (
          <button
            type="button"
            onClick={() => {
              closePopup()
              onResetLevel()
            }}
            className={btn(false)}
            title="Kembali ke tingkat Provinsi"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Kembali</span>
          </button>
        ) : null}
        <span className="mx-1 whitespace-nowrap text-[11px] font-black text-slate-800">
          {level === 'kab' ? `Indonesia › ${parentName || 'Kab/Kota'}` : title || `Indonesia (${cfg.title})`}
        </span>
        <span className="mx-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 tabular-nums">
          {nf(points.length)} titik · {nf(regions.length)} wil
        </span>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          onClick={() => setShowLayers(!showLayers)}
          className={btn(showLayers)}
          aria-pressed={showLayers}
        >
          <Layers className="h-4 w-4" />
          <span className="hidden md:inline">Lapisan</span>
        </button>
        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className={btn(showLegend)}
          aria-pressed={showLegend}
        >
          <ListTree className="h-4 w-4" />
          <span className="hidden md:inline">Legenda</span>
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" onClick={fitAll} className={btn(false)} title="Tampilkan seluruh wilayah">
          <Crosshair className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleFs}
          className={btn(fs)}
          title={fs ? 'Keluar layar penuh' : 'Layar penuh'}
        >
          {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Floating Top-Left Layer Switcher Popover (SpasialMap style) */}
      {showLayers ? (
        <div
          className="absolute left-3 top-14 z-30 w-[250px] space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-3 text-[11px] shadow-xl backdrop-blur"
          data-testid="mbg-map-layers"
        >
          <div className="flex items-center justify-between">
            <b className="text-xs font-black text-slate-800">Lapisan peta</b>
            <button
              type="button"
              onClick={() => setShowLayers(false)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
              aria-label="Tutup"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div>
            <p className="mb-1 font-extrabold uppercase tracking-wider text-slate-500">Peta dasar</p>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  ['light', 'Terang'],
                  ['osm', 'OSM'],
                  ['satellite', 'Satelit'],
                  ['none', 'Polos'],
                ] as [BaseMap, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBaseMap(k)}
                  className={`rounded-md border px-1 py-1 font-bold ${
                    baseMap === k ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 font-bold text-slate-700">
            <span>Choropleth {lvLabel}</span>
            <input
              type="checkbox"
              checked={showChoro}
              onChange={(e) => setShowChoro(e.target.checked)}
              className="accent-teal-700"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block font-bold text-slate-600">Indikator warna wilayah</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricKey)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 font-bold text-slate-800"
            >
              {metricOptions.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-bold text-slate-600">Transparansi choropleth ({Math.round(opChoro * 100)}%)</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opChoro}
              onChange={(e) => setOpChoro(Number(e.target.value))}
              className="w-full accent-teal-700"
            />
          </label>
          <div>
            <p className="mb-1 font-extrabold uppercase tracking-wider text-slate-500">Titik lokasi / SPPG</p>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['kluster', 'Kluster'],
                  ['titik', 'Titik'],
                  ['off', 'Sembunyi'],
                ] as [PointMode, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPointMode(k)}
                  className={`rounded-md border px-1 py-1 font-bold ${
                    pointMode === k ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 font-bold text-slate-700">
            <span>Heatmap spasial</span>
            <input
              type="checkbox"
              checked={showHeat}
              onChange={(e) => setShowHeat(e.target.checked)}
              className="accent-teal-700"
            />
          </label>
          {showHeat ? (
            <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-12">Opasitas</span>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={opHeat}
                  onChange={(e) => setOpHeat(Number(e.target.value))}
                  className="flex-1 accent-teal-700"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12">Radius</span>
                <input
                  type="range"
                  min={8}
                  max={36}
                  step={1}
                  value={heatRadius}
                  onChange={(e) => setHeatRadius(Number(e.target.value))}
                  className="flex-1 accent-teal-700"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12">Blur</span>
                <input
                  type="range"
                  min={8}
                  max={40}
                  step={1}
                  value={heatBlur}
                  onChange={(e) => setHeatBlur(Number(e.target.value))}
                  className="flex-1 accent-teal-700"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Floating Bottom-Left Legend (SpasialMap style) */}
      {showLegend && !showLayers ? (
        <div
          className="absolute bottom-3 left-3 z-20 w-[236px] rounded-xl border border-slate-200 bg-white/95 p-2.5 text-[10.5px] text-slate-600 shadow-lg backdrop-blur"
          data-testid="mbg-map-legend"
        >
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => setLegendCol(!legendCol)}
              className="flex flex-1 items-center gap-1 text-left text-[10px] font-black uppercase tracking-wide text-slate-500"
            >
              Legenda {legendCol ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => setShowLegend(false)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
              aria-label="Tutup legenda"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {!legendCol ? (
            <div className="mt-1.5 space-y-2">
              <div>
                <p className="font-bold text-slate-700">
                  {activeMetricLabel} per {lvLabel}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  {palette.map((c, i) => (
                    <span
                      key={i}
                      className="h-3 w-5 rounded-[2px] border border-slate-300/70"
                      style={{ background: c }}
                      title={i === 0 ? 'Tidak ada data / 0' : `Kelas ${i}`}
                    />
                  ))}
                  <span className="ml-1 text-[10px] text-slate-500 tabular-nums">
                    0 — {metric === 'avg_skor' ? `${maxRegion.toFixed(0)}%` : nf(maxRegion)}
                  </span>
                </div>
              </div>
              {pointMode !== 'off' ? (
                <div>
                  <p className="font-bold text-slate-700">Titik lokasi / SPPG</p>
                  <ul className="mt-1 space-y-0.5">
                    <li className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full border-2 border-white shadow"
                        style={{ background: cfg.normalHex }}
                      />
                      {cfg.normalLabel}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full border-2 border-white shadow"
                        style={{ background: cfg.alertHex }}
                      />
                      {cfg.alertLabel}
                    </li>
                    {pointMode === 'kluster' ? (
                      <li className="flex items-center gap-1.5">
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-white"
                          style={{ background: cfg.normalHex }}
                        >
                          5
                        </span>
                        Kluster: jumlah titik berdekatan
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              {showHeat ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-10 rounded-sm"
                    style={{ background: 'linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)' }}
                  />
                  Heatmap kepadatan
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Cursor-following Hover Pill (SpasialMap style) */}
      {hover && !popup ? (
        <div
          className="pointer-events-none absolute z-30 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow"
          style={{ left: hover.x + 14, top: hover.y + 10 }}
        >
          {hover.text}
        </div>
      ) : null}

      {/* OpenLayers Click Popup Overlay (SpasialMap style) */}
      {popNode
        ? createPortal(
            <div className={popup ? '' : 'hidden'}>
              {popup ? (
                <div
                  className="w-[285px] rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-xl"
                  data-testid="mbg-map-popup"
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {popup.kind === 'region'
                          ? popup.region.name
                          : popup.kind === 'point'
                            ? pointLabel(popup.point)
                            : `${nf(popup.items.length)} lokasi berdekatan`}
                      </p>
                      <p className="text-[10.5px] text-slate-500">
                        {popup.kind === 'region'
                          ? `${level === 'prov' ? 'Provinsi' : 'Kab/Kota'} · ${cfg.title}`
                          : popup.kind === 'point'
                            ? mode === 'gizi'
                              ? [
                                  (popup.point as MbgMapPoint).unit_nama
                                    ? `PKM ${(popup.point as MbgMapPoint).unit_nama}`
                                    : null,
                                  (popup.point as MbgMapPoint).kabkota_name,
                                  (popup.point as MbgMapPoint).province_name,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')
                              : mode === 'keracunan'
                                ? [
                                    (popup.point as MbgMapPoint).nama_sppg,
                                    (popup.point as MbgMapPoint).kabkota_name,
                                    (popup.point as MbgMapPoint).province_name,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                                : [
                                    (popup.point as MapPoint).jenis_unit,
                                    (popup.point as MapPoint).kabkota_name,
                                    (popup.point as MapPoint).province_name,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                            : 'Klik salah satu lokasi di bawah untuk rincian'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closePopup}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                      aria-label="Tutup"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {popup.kind === 'region' ? (
                    <div>
                      {mode === 'gizi' ? (
                        <>
                          <Row l="Kunjungan" v={nf((popup.region as MbgMapRegion).kunjungan)} />
                          <Row l="SPPG Diawasi" v={nf((popup.region as MbgMapRegion).sppg_unik)} />
                          <Row
                            l="Rata-rata Skor SOP"
                            v={
                              (popup.region as MbgMapRegion).avg_skor != null
                                ? `${(popup.region as MbgMapRegion).avg_skor!.toFixed(1)}%`
                                : '–'
                            }
                            tone={
                              ((popup.region as MbgMapRegion).avg_skor ?? 100) < 80 ? 'text-amber-700' : 'text-emerald-700'
                            }
                          />
                          <Row l="F12 Standar Gizi BAIK" v={nf((popup.region as MbgMapRegion).rekap12_baik)} tone="text-emerald-700" />
                          <Row
                            l="F12 BELUM BAIK"
                            v={nf((popup.region as MbgMapRegion).rekap12_belum_baik)}
                            tone={(popup.region as MbgMapRegion).rekap12_belum_baik > 0 ? 'text-amber-700' : undefined}
                          />
                        </>
                      ) : mode === 'keracunan' ? (
                        <>
                          <Row l="Kejadian" v={nf((popup.region as MbgMapRegion).kejadian)} />
                          <Row l="Kasus Sakit" v={nf((popup.region as MbgMapRegion).kasus)} tone="text-red-700" />
                          <Row
                            l="Meninggal"
                            v={nf((popup.region as MbgMapRegion).meninggal)}
                            tone={(popup.region as MbgMapRegion).meninggal > 0 ? 'text-red-700' : undefined}
                          />
                          <Row l="Populasi Terpapar" v={nf((popup.region as MbgMapRegion).terpapar)} />
                          <Row l="SPPG Terdampak" v={nf((popup.region as MbgMapRegion).sppg_unik)} />
                          <Row l="Lab Ada Hasil" v={nf((popup.region as MbgMapRegion).lab_hasil)} />
                        </>
                      ) : mode === 'ebs' ? (
                        <>
                          <Row l="Laporan EBS" v={nf((popup.region as MapRegion).laporan)} />
                          <Row l="Kasus" v={nf((popup.region as MapRegion).kasus)} />
                          <Row l="Kematian" v={nf((popup.region as MapRegion).kematian)} />
                          <Row l="KLB" v={nf((popup.region as MapRegion).klb)} />
                          <Row l="Unit Pelapor" v={nf((popup.region as MapRegion).unit_unik)} />
                        </>
                      ) : (
                        <>
                          <Row l="Laporan Agregat" v={nf((popup.region as MapRegion).agregat_laporan)} />
                          <Row l="Kasus Agregat" v={nf((popup.region as MapRegion).agregat_kasus)} />
                          <Row l="Kematian Agregat" v={nf((popup.region as MapRegion).agregat_kematian)} />
                          <Row l="Pasien Form Individu" v={nf((popup.region as MapRegion).individu_pasien)} />
                          <Row l="Unit Pelapor" v={nf((popup.region as MapRegion).unit_unik)} />
                        </>
                      )}
                      {level === 'prov' && popup.hasData ? (
                        <button
                          type="button"
                          onClick={() => {
                            const id = Number(popup.region.key)
                            if (Number.isFinite(id) && id > 0) {
                              closePopup()
                              onDrillRef.current(id, popup.region.name)
                            }
                          }}
                          className="mt-2 w-full rounded-lg bg-teal-700 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800"
                        >
                          Perbesar ke kab/kota provinsi ini
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {popup.kind === 'point' ? (
                    <div>
                      {mode === 'gizi' ? (
                        <>
                          <Row l="Kunjungan" v={nf((popup.point as MbgMapPoint).kunjungan)} />
                          <Row
                            l="Skor SOP Rata-rata"
                            v={
                              (popup.point as MbgMapPoint).avg_skor != null
                                ? `${(popup.point as MbgMapPoint).avg_skor!.toFixed(1)}%`
                                : '–'
                            }
                            tone={
                              ((popup.point as MbgMapPoint).avg_skor ?? 100) < 80 ? 'text-amber-700' : 'text-emerald-700'
                            }
                          />
                          <Row l="F12 BAIK" v={nf((popup.point as MbgMapPoint).rekap12_baik)} tone="text-emerald-700" />
                          <Row
                            l="F12 BELUM BAIK"
                            v={nf((popup.point as MbgMapPoint).rekap12_belum_baik)}
                            tone={(popup.point as MbgMapPoint).rekap12_belum_baik > 0 ? 'text-amber-700' : undefined}
                          />
                          <Row l="Tanggal Terakhir" v={(popup.point as MbgMapPoint).last_date || '–'} />
                        </>
                      ) : mode === 'keracunan' ? (
                        <>
                          <Row l="Kejadian" v={nf((popup.point as MbgMapPoint).kejadian)} />
                          <Row l="Kasus Sakit" v={nf((popup.point as MbgMapPoint).kasus)} tone="text-red-700" />
                          <Row
                            l="Meninggal"
                            v={nf((popup.point as MbgMapPoint).meninggal)}
                            tone={(popup.point as MbgMapPoint).meninggal > 0 ? 'text-red-700' : undefined}
                          />
                          <Row l="Lab Hasil" v={nf((popup.point as MbgMapPoint).lab_hasil)} />
                          <Row l="Kejadian Terakhir" v={(popup.point as MbgMapPoint).last_date || '–'} />
                        </>
                      ) : mode === 'ebs' ? (
                        <>
                          <Row l="Laporan" v={nf((popup.point as MapPoint).laporan)} />
                          <Row l="Kasus" v={nf((popup.point as MapPoint).kasus)} />
                          <Row l="Kematian" v={nf((popup.point as MapPoint).kematian)} />
                          <Row l="KLB" v={nf((popup.point as MapPoint).klb)} />
                          <Row l="Tanggal Terakhir" v={(popup.point as MapPoint).last_date || '–'} />
                        </>
                      ) : (
                        <>
                          <Row l="Laporan Agregat" v={nf((popup.point as MapPoint).agregat_laporan)} />
                          <Row l="Kasus Agregat" v={nf((popup.point as MapPoint).agregat_kasus)} />
                          <Row l="Pasien Individu" v={nf((popup.point as MapPoint).individu_pasien)} />
                          <Row l="Periode Terakhir" v={(popup.point as MapPoint).last_periode || '–'} />
                        </>
                      )}
                    </div>
                  ) : null}

                  {popup.kind === 'cluster' ? (
                    <ul className="max-h-48 space-y-1 overflow-auto">
                      {popup.items.slice(0, 30).map((it, idx) => (
                        <li key={idx}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50"
                            onClick={() => setPopup({ kind: 'point', point: it })}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: cfg.isAlert(it) ? cfg.alertHex : cfg.normalHex }}
                              />
                              <span className="truncate">{pointLabel(it)}</span>
                            </span>
                            <b className="tabular-nums">{nf(valOfPoint(it))}</b>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>,
            popNode,
          )
        : null}
    </div>
  )
}
