'use client'
// PR 071: Penyelarasan Layout Peta Spasial 2-Dock Terpadu (mengacu pada /dashboard/skdr/ringkasan)
// - Header Interaktif: Eyebrow MapPin, Quick Metric Pills, Level/Count badge, Analisa Wilayah & Pengaturan Lapisan toggles
// - Kontainer Auto-Layout 640px: Left Dock (340px / 40px) + Center Map Canvas + Right Dock (320px / 40px)
// - Mendukung mode: 'keracunan' | 'gizi' | 'zoonosis' | 'ebs' | 'ibs' dengan isolasi variabel kontekstual
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
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Layers,
  ListTree,
  MapPin,
  Maximize2,
  Minimize2,
  Search,
  Settings,
  Sparkles,
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
export type ZoonosisMapMetric = 'kasus' | 'kematian' | 'cfr' | 'alert'
export type MapMode = 'ebs' | 'ibs' | 'gizi' | 'keracunan' | 'zoonosis'
type MetricKey = EbsMapMetric | IbsMapMetric | GiziMapMetric | KeracunanMapMetric | ZoonosisMapMetric
type AnyRegion = MapRegion | MbgMapRegion | Record<string, unknown>
type AnyPoint = MapPoint | MbgMapPoint | Record<string, unknown>

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

export const MODE_CFG: Record<
  MapMode,
  {
    title: string
    eyebrow: string
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
    title: 'Sebaran Sinyal & Rumor EBS per Wilayah',
    eyebrow: 'PETA SPASIAL EVENT-BASED SURVEILLANCE',
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
    title: 'Sebaran Kasus & Pelaporan Agregat IBS',
    eyebrow: 'PETA SPASIAL INDICATOR-BASED SURVEILLANCE',
    palette: ['#e5e7eb', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'],
    defaultMetric: 'agregat_kasus',
    metrics: [
      { key: 'agregat_kasus', label: 'Kasus Agregat' },
      { key: 'agregat_laporan', label: 'Laporan Agregat' },
      { key: 'individu_pasien', label: 'Pasien Individu' },
      { key: 'agregat_kunjungan', label: 'Total Kunjungan' },
    ],
    normalHex: '#2563eb',
    alertHex: '#7c3aed',
    normalLabel: 'Agregat / Gabungan',
    alertLabel: 'Khusus Individu',
    isAlert: (p) => Number((p as MapPoint).individu_pasien || 0) > 0 && Number((p as MapPoint).agregat_kasus || 0) === 0,
  },
  gizi: {
    title: 'Sebaran Capaian Skor SOP & Cakupan Pengawasan Gizi SPPG',
    eyebrow: 'PETA SPASIAL PENGAWASAN STANDAR GIZI SPPG',
    palette: ['#e5e7eb', '#d1fae5', '#6ee7b7', '#10b981', '#059669', '#065f46'],
    defaultMetric: 'avg_skor',
    metrics: [
      { key: 'avg_skor', label: 'Rata-rata Skor SOP' },
      { key: 'kunjungan', label: 'Jumlah Kunjungan' },
      { key: 'rekap12_baik', label: 'Standar BAIK (F12)' },
      { key: 'rekap12_belum_baik', label: 'Perlu Perbaikan (F12)' },
    ],
    normalHex: '#059669',
    alertHex: '#d97706',
    normalLabel: 'SPPG Baik / Terpantau',
    alertLabel: 'Skor < 80 / Belum Baik',
    isAlert: (p) => Number((p as MbgMapPoint).rekap12_belum_baik || 0) > 0 || ((p as MbgMapPoint).avg_skor ?? 100) < 80,
  },
  keracunan: {
    title: 'Sebaran Distribusi Insiden & Kasus Keracunan Pangan MBG',
    eyebrow: 'PETA SPASIAL KEJADIAN KERACUNAN PANGAN MBG',
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
  zoonosis: {
    title: 'Sebaran Kasus & Alert Zoonosis per Wilayah',
    eyebrow: 'PETA SPASIAL PENYAKIT ZOONOSIS ONE HEALTH',
    palette: ['#e5e7eb', '#fef3c7', '#fde68a', '#f59e0b', '#d97706', '#9a3412'],
    defaultMetric: 'kasus',
    metrics: [
      { key: 'kasus', label: 'Kasus Zoonosis' },
      { key: 'kematian', label: 'Kematian' },
      { key: 'cfr', label: 'CFR (%)' },
      { key: 'alert', label: 'Alert SKDR' },
    ],
    normalHex: '#d97706',
    alertHex: '#dc2626',
    normalLabel: 'Terkendali / Terpantau',
    alertLabel: 'Ada Kematian / Alert Zoonotik',
    isAlert: (p) => Number((p as any).kematian || 0) > 0 || Number((p as any).alert || 0) > 0,
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
  eyebrow,
}: {
  mode: MapMode
  level: 'prov' | 'kab'
  parentName?: string | null
  regions: AnyRegion[]
  points: AnyPoint[]
  onDrillDown: (provId: number, provName: string) => void
  onResetLevel: () => void
  compact?: boolean
  initialMetric?: MetricKey
  title?: string
  eyebrow?: string
}) {
  const cfg = MODE_CFG[mode] || MODE_CFG.keracunan
  const palette = cfg.palette
  const metricOptions = cfg.metrics

  const [metric, setMetric] = useState<MetricKey>(initialMetric || cfg.defaultMetric)
  useEffect(() => {
    setMetric(initialMetric || cfg.defaultMetric)
  }, [mode, initialMetric, cfg.defaultMetric])

  // 2-Dock States
  const [leftDockOpen, setLeftDockOpen] = useState(!compact)
  const [rightDockOpen, setRightDockOpen] = useState(false)
  const [leftTab, setLeftTab] = useState<'hotspot' | 'ringkasan' | 'titik'>('hotspot')
  const [searchRegion, setSearchRegion] = useState('')
  const [searchPoint, setSearchPoint] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<AnyRegion | null>(null)

  const [baseMap, setBaseMap] = useState<BaseMap>('light')
  const [showChoro, setShowChoro] = useState(true)
  const [opChoro, setOpChoro] = useState(0.78)
  const [pointMode, setPointMode] = useState<PointMode>('kluster')
  const [showHeat, setShowHeat] = useState(false)
  const [opHeat, setOpHeat] = useState(0.75)
  const [heatRadius, setHeatRadius] = useState(16)
  const [heatBlur, setHeatBlur] = useState(22)
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
      const rec = r as Record<string, unknown>
      if (m === 'cfr') return Number(rec.cfr ?? 0)
      if (m === 'alert') return Number(rec.alert ?? 0)
      return Number(rec[m] ?? 0)
    },
    [metric],
  )

  const valOfPoint = useCallback(
    (p: AnyPoint, m: MetricKey = metric) => {
      const rec = p as Record<string, unknown>
      if (m === 'agregat_kunjungan') {
        const mp = p as MapPoint
        return Number(mp.agregat_kasus ?? 0) || Number(mp.agregat_laporan ?? 0)
      }
      if (m === 'avg_skor') return Number((p as MbgMapPoint).kunjungan ?? (rec.kunjungan ?? 0))
      if (m === 'terpapar') return Number((p as MbgMapPoint).kasus ?? (rec.kasus ?? 0))
      if (m === 'cfr') return Number(rec.cfr ?? 0)
      if (m === 'alert') return Number(rec.alert ?? 0)
      return Number(rec[m] ?? 0)
    },
    [metric],
  )

  const pointLabel = (p: AnyPoint) => {
    const ptEbs = p as MapPoint
    const ptMbg = p as MbgMapPoint
    const rec = p as Record<string, unknown>
    return (
      (rec.label as string) ||
      ptMbg.nama_sppg ||
      (ptMbg.unit_nama ? `Puskesmas ${ptMbg.unit_nama}` : '') ||
      ((ptEbs as any).nama_unit as string) ||
      ptEbs.jenis_unit ||
      (rec.unit_nama as string) ||
      'Titik Lokasi'
    )
  }

  // Dynamic ranking and filtering
  const maxRegion = useMemo(() => {
    let m = 0
    for (const r of regions) {
      const v = valOfRegion(r)
      if (v > m) m = v
    }
    return Math.max(1, m)
  }, [regions, valOfRegion])

  const maxPoint = useMemo(() => {
    let m = 0
    for (const p of points) {
      const v = valOfPoint(p)
      if (v > m) m = v
    }
    return Math.max(1, m)
  }, [points, valOfPoint])

  const rankedRegions = useMemo(() => {
    const q = searchRegion.trim().toLowerCase()
    const list = q ? regions.filter((r) => String((r as any).name || '').toLowerCase().includes(q)) : [...regions]
    return list.sort((a, b) => valOfRegion(b) - valOfRegion(a))
  }, [regions, searchRegion, valOfRegion])

  const rankedPoints = useMemo(() => {
    const q = searchPoint.trim().toLowerCase()
    const list = q
      ? points.filter(
          (p) =>
            pointLabel(p).toLowerCase().includes(q) ||
            String((p as any).province_name || '').toLowerCase().includes(q) ||
            String((p as any).kabkota_name || '').toLowerCase().includes(q),
        )
      : [...points]
    return list.sort((a, b) => valOfPoint(b) - valOfPoint(a)).slice(0, 50)
  }, [points, searchPoint, valOfPoint])

  const summaryStats = useMemo(() => {
    let sumVal = 0
    let totalKasus = 0
    let totalKematian = 0
    let totalKejadian = 0
    for (const r of regions) {
      sumVal += valOfRegion(r)
      totalKasus += Number((r as any).kasus || 0)
      totalKematian += Number((r as any).meninggal || (r as any).kematian || 0)
      totalKejadian += Number((r as any).kejadian || (r as any).laporan || 0)
    }
    return {
      sumVal,
      totalKasus,
      totalKematian,
      totalKejadian,
      totalWil: regions.length,
      totalTitik: points.length,
    }
  }, [regions, points, valOfRegion])

  const byGeoMap = useMemo(() => {
    const m = new Map<string, AnyRegion>()
    for (const r of regions) {
      const key = String((r as any).key || (r as any).name || '').trim().toLowerCase()
      if (key) m.set(key, r)
      const name = String((r as any).name || '').trim().toLowerCase()
      if (name) m.set(name, r)
    }
    return m
  }, [regions])

  useEffect(() => {
    styleCtx.current = {
      byGeo: byGeoMap,
      metric,
      maxRegion,
      maxPoint,
      palette,
      opChoro,
      hoverCode: null,
      mode,
    }
    choroLayer.current?.changed()
    markerLayer.current?.changed()
    clusterLayer.current?.changed()
  }, [byGeoMap, metric, maxRegion, maxPoint, palette, opChoro, mode])

  // Initialize OpenLayers Map
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
      const mc = MODE_CFG[c.mode] || MODE_CFG.keracunan
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
      const mc = MODE_CFG[c.mode] || MODE_CFG.keracunan
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
      stopEvent: true,
      offset: [0, -12],
      autoPan: { animation: { duration: 250 } },
    })

    const m = new OlMap({
      target: mapEl.current,
      layers: [tl, cl, hl, ml, cluL],
      overlays: [ov],
      view: new View({
        center: fromLonLat([118, -2.5]),
        zoom: 5,
        minZoom: 4,
        maxZoom: 18,
      }),
      controls: [],
    })

    mapObj.current = m
    tileLayer.current = tl
    choroLayer.current = cl
    heatLayer.current = hl
    markerLayer.current = ml
    clusterLayer.current = cluL
    overlayRef.current = ov

    // Pointer move for hover info
    m.on('pointermove', (ev) => {
      if (ev.dragging) return
      const px = ev.pixel
      let found: { text: string } | null = null
      m.forEachFeatureAtPixel(
        px,
        (feat, layer) => {
          if (found) return
          if (layer === cl) {
            const code = String(feat.get('code') || '')
            const name = String(feat.get('name') || code)
            const r = styleCtx.current.byGeo.get(code)
            const v = r ? Number((r as Record<string, unknown>)[styleCtx.current.metric] ?? 0) : null
            const lbl = MODE_CFG[styleCtx.current.mode]?.metrics.find((x) => x.key === styleCtx.current.metric)?.label || ''
            found = {
              text: `${name}: ${v === null ? 'Tidak ada data' : styleCtx.current.metric === 'avg_skor' ? `${v.toFixed(1)} skor` : styleCtx.current.metric === 'cfr' ? `${v.toFixed(1)}%` : nf(v)} (${lbl})`,
            }
          } else if (layer === cluL || layer === ml) {
            const fs2: Feature[] = feat.get('features') || [feat]
            if (fs2.length === 1) {
              const pt = fs2[0].get('point') as AnyPoint
              found = { text: `${pointLabel(pt)} (${nf(valOfPoint(pt))})` }
            } else {
              found = { text: `${fs2.length} lokasi berdekatan` }
            }
          }
        },
        { hitTolerance: 4 },
      )
      setHover(found ? { x: px[0], y: px[1], text: (found as any).text } : null)
    })

    // Click on feature -> Popup / Select
    m.on('singleclick', (ev) => {
      let hit: { f: Feature; layer: any } | null = null
      m.forEachFeatureAtPixel(
        ev.pixel,
        (feat, layer) => {
          if (!hit) hit = { f: feat as Feature, layer }
        },
        { hitTolerance: 6 },
      )

      if (!hit) {
        setPopup(null)
        ov.setPosition(undefined)
        return
      }

      if (hit.layer === cl) {
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
            sppg_unik: 0,
            kasus: 0,
            kematian: 0,
          } as unknown as AnyRegion)
        setPopup({ kind: 'region', region: regionObj, hasData: Boolean(rg) })
        setSelectedRegion(regionObj)
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

  // Sync Basemap
  useEffect(() => {
    if (!tileLayer.current) return
    if (baseMap === 'none') {
      tileLayer.current.setVisible(false)
    } else {
      tileLayer.current.setVisible(true)
      tileLayer.current.setSource(createBaseSource(baseMap))
    }
  }, [baseMap])

  // Sync Point layers
  useEffect(() => {
    if (markerLayer.current) markerLayer.current.setVisible(pointMode === 'titik')
    if (clusterLayer.current) clusterLayer.current.setVisible(pointMode === 'kluster')
  }, [pointMode])

  useEffect(() => {
    if (choroLayer.current) choroLayer.current.setVisible(showChoro)
  }, [showChoro])

  useEffect(() => {
    if (heatLayer.current) {
      heatLayer.current.setVisible(showHeat)
      heatLayer.current.setOpacity(opHeat)
      heatLayer.current.setRadius(heatRadius)
      heatLayer.current.setBlur(heatBlur)
    }
  }, [showHeat, opHeat, heatRadius, heatBlur])

  // Load GeoJSON Boundaries
  useEffect(() => {
    let alive = true
    setGeoErr(false)
    choroSrc.current.clear()

    loadGeoFeatures(level, null, parentName || null)
      .then((feats) => {
        if (!alive) return
        const fmt = new GeoJSON()
        const olFeats: Feature[] = []
        for (const f of feats) {
          try {
            const geom = fmt.readGeometry(f.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
            const name = String(
              f.properties?.kabkot ||
                f.properties?.kabupaten ||
                f.properties?.provinsi ||
                f.properties?.name ||
                f.properties?.WADMKK ||
                '',
            )
            const code = name.trim().toLowerCase()
            const feat = new Feature({ geometry: geom, name, code, rawProps: f.properties })
            olFeats.push(feat)
          } catch {}
        }
        choroSrc.current.addFeatures(olFeats)

        if (olFeats.length > 0 && mapObj.current) {
          const ext = choroSrc.current.getExtent()
          if (!isEmpty(ext)) {
            mapObj.current.getView().fit(ext, { padding: [40, 40, 40, 40], duration: 400, maxZoom: level === 'kab' ? 10 : 6 })
          }
        }
      })
      .catch(() => {
        if (alive) setGeoErr(true)
      })

    return () => {
      alive = false
    }
  }, [level, parentName])

  // Load Point features
  useEffect(() => {
    pointSrc.current.clear()
    const fs2: Feature[] = []
    for (const p of points) {
      const lat = Number((p as any).lat)
      const lng = Number((p as any).lng || (p as any).lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue
      const v = valOfPoint(p)
      const f = new Feature({
        geometry: new Point(fromLonLat([lng, lat])),
        point: p,
        val: v,
        weight: Math.min(1, Math.max(0.1, v / Math.max(1, maxPoint))),
      })
      fs2.push(f)
    }
    pointSrc.current.addFeatures(fs2)
  }, [points, maxPoint, valOfPoint])

  const fitAll = () => {
    if (!mapObj.current) return
    const ext = createEmpty()
    if (choroSrc.current.getFeatures().length) extend(ext, choroSrc.current.getExtent())
    if (pointSrc.current.getFeatures().length) extend(ext, pointSrc.current.getExtent())
    if (!isEmpty(ext)) {
      mapObj.current.getView().fit(ext, { padding: [50, 50, 50, 50], duration: 450, maxZoom: level === 'kab' ? 11 : 6 })
    }
  }

  const toggleFs = () => {
    if (!wrapRef.current) return
    if (!document.fullscreenElement) {
      wrapRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  const closePopup = () => {
    setPopup(null)
    overlayRef.current?.setPosition(undefined)
  }

  const activeMetricLabel = metricOptions.find((m) => m.key === metric)?.label || ''
  const lvLabel = level === 'prov' ? 'Provinsi' : 'Kabupaten/Kota'

  return (
    <div
      ref={wrapRef}
      className={`skdr-card p-5 w-full flex flex-col transition-all ${fs ? 'fixed inset-0 z-50 rounded-none h-screen w-screen overflow-hidden' : ''}`}
      data-testid="spasial-2dock-card"
      data-base={baseMap}
    >
      <style>{`[data-base="light"] .spasial-base canvas{filter:grayscale(1) brightness(1.08) contrast(0.88)}`}</style>

      {/* Card Header matching /dashboard/skdr/ringkasan */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wider text-teal-700 flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {eyebrow || cfg.eyebrow}
          </div>
          <h3 className="text-base font-black text-slate-900 mt-0.5">
            {title || cfg.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Metric Pills */}
          <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
            {metricOptions.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  metric === m.key
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 tabular-nums">
            {level === 'kab' ? `Kab/Kota (${parentName || 'Wilayah'})` : 'Nasional (38 Provinsi)'} · {points.length} Titik
          </span>

          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
            <button
              type="button"
              onClick={() => setLeftDockOpen(!leftDockOpen)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1.5 ${
                leftDockOpen
                  ? 'border-teal-700 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Buka / Ciutkan Analisa & Detail Wilayah"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Analisa Wilayah</span>
            </button>
            <button
              type="button"
              onClick={() => setRightDockOpen(!rightDockOpen)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1.5 ${
                rightDockOpen
                  ? 'border-teal-700 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Buka / Ciutkan Pengaturan Peta & Lapisan"
            >
              <Settings className="h-3.5 w-3.5 text-teal-700" />
              <span className="hidden sm:inline">Pengaturan Lapisan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Map Container with Collapsible Left & Right Docks (640px height) */}
      <div className={`mt-4 flex ${fs ? 'flex-1 h-[calc(100vh-80px)]' : 'h-[640px]'} w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative`}>
        {/* Left Dock: Analisa & Hotspot Wilayah */}
        {leftDockOpen ? (
          <aside
            className="w-[340px] shrink-0 h-full border-r border-slate-200 bg-white z-20 flex flex-col transition-all duration-300 overflow-hidden"
            data-testid="peta-left-dock"
          >
            {/* Dock Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-800">
                  {level === 'kab' ? parentName || 'Kab/Kota' : 'Indonesia'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {regions.length} {lvLabel.toLowerCase()} · {points.length} titik lokasi
                </p>
              </div>
              <div className="flex items-center gap-1">
                {level === 'kab' ? (
                  <button
                    type="button"
                    onClick={() => {
                      closePopup()
                      onResetLevel()
                    }}
                    className="rounded-lg px-2 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 flex items-center gap-1"
                    title="Kembali ke Provinsi"
                  >
                    <ArrowLeft className="h-3 w-3" /> Provinsi
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLeftDockOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                  aria-label="Ciutkan analisa wilayah"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div role="tablist" className="flex border-b border-slate-200 bg-white px-2 py-1.5 gap-1">
              {(
                [
                  ['hotspot', 'Hotspot Wilayah'],
                  ['ringkasan', 'Ringkasan'],
                  ['titik', 'Daftar Titik'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={leftTab === k}
                  onClick={() => setLeftTab(k)}
                  className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    leftTab === k ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Tab 1: Hotspot Wilayah */}
            {leftTab === 'hotspot' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="p-2 border-b border-slate-100 bg-white">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={`Cari ${lvLabel.toLowerCase()}...`}
                      value={searchRegion}
                      onChange={(e) => setSearchRegion(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                <ol className="divide-y divide-slate-100 overflow-y-auto flex-1 p-1">
                  {rankedRegions.length === 0 ? (
                    <li className="p-4 text-center text-xs text-slate-400">Tidak ada wilayah yang cocok</li>
                  ) : (
                    rankedRegions.map((r, i) => {
                      const val = valOfRegion(r)
                      const pct = Math.min(100, Math.max(4, (val / maxRegion) * 100))
                      const rName = String((r as any).name || (r as any).key || '')
                      const isSelected = selectedRegion && String((selectedRegion as any).name || '') === rName

                      return (
                        <li
                          key={i}
                          className={`p-2 rounded-lg transition hover:bg-slate-50 ${isSelected ? 'bg-teal-50/70' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-black text-slate-600">
                                {i + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRegion(r)
                                  if ((r as any).lat != null && (r as any).lng != null && mapObj.current) {
                                    mapObj.current.getView().animate({
                                      center: fromLonLat([(r as any).lng, (r as any).lat]),
                                      zoom: 8,
                                      duration: 500,
                                    })
                                  }
                                }}
                                className="text-left font-bold text-xs text-slate-800 hover:text-teal-700 truncate"
                              >
                                {rName}
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs font-black tabular-nums text-slate-800">
                                {metric === 'avg_skor'
                                  ? `${val.toFixed(1)}`
                                  : metric === 'cfr'
                                  ? `${val.toFixed(1)}%`
                                  : nf(val)}
                              </span>
                              {level === 'prov' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const provId = Number((r as any).id || (r as any).province_id || i + 1)
                                    onDrillDown(provId, rName)
                                  }}
                                  className="rounded p-1 text-slate-400 hover:bg-teal-100 hover:text-teal-800"
                                  title={`Telusuri Kab/Kota di ${rName}`}
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: shadeHex(val, maxRegion, palette),
                              }}
                            />
                          </div>
                        </li>
                      )
                    })
                  )}
                </ol>
              </div>
            )}

            {/* Tab 2: Ringkasan Analisa */}
            {leftTab === 'ringkasan' && (
              <div className="p-3.5 space-y-3 overflow-y-auto flex-1 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total {activeMetricLabel}</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 tabular-nums">
                      {metric === 'avg_skor'
                        ? `${(summaryStats.sumVal / Math.max(1, summaryStats.totalWil)).toFixed(1)}`
                        : metric === 'cfr'
                        ? `${summaryStats.totalKasus > 0 ? ((summaryStats.totalKematian / summaryStats.totalKasus) * 100).toFixed(1) : 0}%`
                        : nf(summaryStats.sumVal)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cakupan Wilayah</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 tabular-nums">
                      {summaryStats.totalWil} {lvLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Titik Terpantau</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 tabular-nums">
                      {summaryStats.totalTitik} Lokasi
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {mode === 'keracunan' ? 'Korban Meninggal' : mode === 'zoonosis' ? 'Kematian Zoonosis' : 'Status Waspada'}
                    </p>
                    <p className={`text-base font-black mt-0.5 tabular-nums ${summaryStats.totalKematian > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {summaryStats.totalKematian}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3 leading-relaxed text-teal-950">
                  <p className="font-bold flex items-center gap-1.5 mb-1 text-teal-900">
                    <Sparkles className="h-3.5 w-3.5 text-teal-700" /> Interpretasi Spasial
                  </p>
                  {rankedRegions.length > 0 ? (
                    <p className="text-[11.5px]">
                      Wilayah dengan nilai tertinggi saat ini tercatat di{' '}
                      <b>{String((rankedRegions[0] as any).name || (rankedRegions[0] as any).key)}</b> dengan{' '}
                      <b>
                        {metric === 'avg_skor'
                          ? `${valOfRegion(rankedRegions[0]).toFixed(1)} skor SOP`
                          : metric === 'cfr'
                          ? `${valOfRegion(rankedRegions[0]).toFixed(1)}% CFR`
                          : `${nf(valOfRegion(rankedRegions[0]))} ${activeMetricLabel.toLowerCase()}`}
                      </b>
                      {rankedRegions.length > 1 ? `, diikuti oleh ${String((rankedRegions[1] as any).name || '')}` : ''}.
                    </p>
                  ) : (
                    <p className="text-[11.5px]">Belum ada data transaksi tercatat pada filter aktif ini.</p>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Daftar Titik Lokasi */}
            {leftTab === 'titik' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="p-2 border-b border-slate-100 bg-white">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari fasyankes / SPPG / lokasi..."
                      value={searchPoint}
                      onChange={(e) => setSearchPoint(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                <ul className="divide-y divide-slate-100 overflow-y-auto flex-1 p-1">
                  {rankedPoints.length === 0 ? (
                    <li className="p-4 text-center text-xs text-slate-400">Tidak ada titik yang cocok</li>
                  ) : (
                    rankedPoints.map((p, i) => {
                      const val = valOfPoint(p)
                      const isAlert = cfg.isAlert(p)
                      const ptLat = Number((p as any).lat)
                      const ptLng = Number((p as any).lng || (p as any).lon)

                      return (
                        <li
                          key={i}
                          onClick={() => {
                            if (mapObj.current && ptLat && ptLng) {
                              mapObj.current.getView().animate({
                                center: fromLonLat([ptLng, ptLat]),
                                zoom: 13,
                                duration: 600,
                              })
                              setPopup({ kind: 'point', point: p })
                              overlayRef.current?.setPosition(fromLonLat([ptLng, ptLat]))
                            }
                          }}
                          className="p-2 hover:bg-slate-50 cursor-pointer rounded-lg transition flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-xs text-slate-800 truncate">{pointLabel(p)}</p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {[String((p as any).kabkota_name || ''), String((p as any).province_name || '')]
                                .filter(Boolean)
                                .join(', ') || 'Lokasi Terdaftar'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`h-2 w-2 rounded-full ${isAlert ? 'bg-red-500' : 'bg-emerald-500'}`}
                              title={isAlert ? cfg.alertLabel : cfg.normalLabel}
                            />
                            <span className="text-xs font-black tabular-nums text-slate-700">{nf(val)}</span>
                          </div>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            )}
          </aside>
        ) : (
          <aside
            className="w-10 shrink-0 border-r border-slate-200 bg-white/95 backdrop-blur z-20 flex flex-col h-full transition-all duration-300"
            data-testid="peta-left-dock-collapsed"
          >
            <button
              type="button"
              onClick={() => setLeftDockOpen(true)}
              className="flex h-full w-full flex-col items-center justify-start gap-3 py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              title="Buka Analisa Wilayah"
              aria-label="Buka Analisa Wilayah"
            >
              <ChevronRight className="h-4 w-4 text-slate-400" />
              <MapPin className="h-4 w-4 text-teal-700" />
              <span
                className="text-[10px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Analisa Wilayah
              </span>
            </button>
          </aside>
        )}

        {/* Center Map Canvas */}
        <div className="min-w-0 flex-1 relative h-full">
          <div ref={mapEl} className="absolute inset-0" />

          {geoErr ? (
            <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 shadow">
              Batas wilayah gagal dimuat; titik lokasi tetap ditampilkan.
            </div>
          ) : null}

          {/* Breadcrumb at Top Left */}
          {level === 'kab' && (
            <div className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur text-xs">
              <button
                type="button"
                onClick={() => {
                  closePopup()
                  onResetLevel()
                }}
                className="font-bold text-teal-700 hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Nasional
              </button>
              <span className="text-slate-300">|</span>
              <span className="font-extrabold text-slate-800">{parentName}</span>
            </div>
          )}

          {/* Map Quick Controls at Top Right */}
          <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur">
            <button
              type="button"
              onClick={fitAll}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              title="Tampilkan Seluruh Peta"
            >
              <Crosshair className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleFs}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              title={fs ? 'Keluar Layar Penuh' : 'Layar Penuh'}
            >
              {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Right Dock: Pengaturan Peta & Lapisan */}
        <aside
          className={`shrink-0 border-l border-slate-200 bg-white/95 backdrop-blur z-20 flex flex-col h-full transition-all duration-300 ${
            rightDockOpen ? 'w-[320px]' : 'w-10'
          }`}
          data-testid="peta-right-dock"
        >
          {rightDockOpen ? (
            <div className="flex h-full flex-col overflow-hidden">
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between border-b border-slate-100 p-3 bg-white">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-teal-700" />
                  <span className="text-sm font-bold text-slate-800">
                    Pengaturan Peta & Lapisan
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRightDockOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Tutup pengaturan peta"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
                {/* Visualisasi Wilayah & Kasus */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Visualisasi Wilayah & Kasus
                  </div>
                  <div className="space-y-2">
                    {/* Choropleth Switch */}
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Choropleth Poligon ({lvLabel})</span>
                        <input
                          type="checkbox"
                          checked={showChoro}
                          onChange={(e) => setShowChoro(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 accent-teal-700"
                        />
                      </div>
                      {showChoro && (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Opasitas</span>
                          <input
                            type="range"
                            min={0.2}
                            max={1}
                            step={0.05}
                            value={opChoro}
                            onChange={(e) => setOpChoro(Number(e.target.value))}
                            className="h-1 flex-1 cursor-pointer accent-teal-700"
                          />
                          <span className="text-[10px] font-bold text-slate-600 tabular-nums w-8 text-right">
                            {Math.round(opChoro * 100)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Point Mode Toggle */}
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Titik Sebaran Lokasi</span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{points.length} titik</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['kluster', 'titik', 'off'] as const).map((modeKey) => (
                          <button
                            key={modeKey}
                            type="button"
                            onClick={() => setPointMode(modeKey)}
                            className={`rounded-lg py-1 font-bold capitalize transition text-[11px] ${
                              pointMode === modeKey
                                ? 'bg-teal-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {modeKey}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Heatmap Toggle */}
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Heatmap Kepadatan</span>
                        <input
                          type="checkbox"
                          checked={showHeat}
                          onChange={(e) => setShowHeat(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 accent-teal-700"
                        />
                      </div>
                      {showHeat && (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Opasitas</span>
                          <input
                            type="range"
                            min={0.2}
                            max={1}
                            step={0.05}
                            value={opHeat}
                            onChange={(e) => setOpHeat(Number(e.target.value))}
                            className="h-1 flex-1 cursor-pointer accent-teal-700"
                          />
                          <span className="text-[10px] font-bold text-slate-600 tabular-nums w-8 text-right">
                            {Math.round(opHeat * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pemilihan Peta Dasar (Basemap) */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Peta Dasar (Basemap)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ['light', 'Terang (Satusehat)'],
                        ['osm', 'OpenStreetMap'],
                        ['satellite', 'Citra Satelit'],
                        ['none', 'Polos (Batas Saja)'],
                      ] as const
                    ).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setBaseMap(k)}
                        className={`rounded-xl border p-2 text-left font-bold transition text-[11px] ${
                          baseMap === k
                            ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Legenda & Nilai Batas */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Legenda Warna: {activeMetricLabel}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
                    <div className="flex items-center gap-1">
                      {palette.map((c, i) => (
                        <span
                          key={i}
                          className="h-4 flex-1 rounded-[3px] border border-slate-200/60"
                          style={{ background: c }}
                          title={`Kategori ${i}`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 tabular-nums">
                      <span>0 / Minimum</span>
                      <span>Maksimum: {metric === 'avg_skor' ? `${maxRegion.toFixed(1)} skor` : metric === 'cfr' ? `${maxRegion.toFixed(1)}%` : nf(maxRegion)}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border-2 border-white shadow-xs" style={{ background: cfg.normalHex }} />
                        <span className="text-slate-700 font-medium">{cfg.normalLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border-2 border-white shadow-xs" style={{ background: cfg.alertHex }} />
                        <span className="text-slate-700 font-medium">{cfg.alertLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRightDockOpen(true)}
              className="flex h-full w-full flex-col items-center justify-start gap-3 py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              title="Buka Pengaturan Lapisan"
              aria-label="Buka Pengaturan Lapisan"
            >
              <ChevronLeft className="h-4 w-4 text-slate-400" />
              <Settings className="h-4 w-4 text-teal-700" />
              <span
                className="text-[10px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Pengaturan Lapisan
              </span>
            </button>
          )}
        </aside>
      </div>

      {/* Cursor-following Hover Tooltip */}
      {hover && !popup ? (
        <div
          className="pointer-events-none absolute z-40 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-md backdrop-blur"
          style={{ left: hover.x + 16, top: hover.y + 12 }}
        >
          {hover.text}
        </div>
      ) : null}

      {/* Feature Click Popup Modal / Tooltip */}
      {popNode
        ? createPortal(
            <div className={popup ? '' : 'hidden'}>
              {popup ? (
                <div
                  className="w-[290px] rounded-2xl border border-slate-200 bg-white p-3.5 text-[11px] text-slate-700 shadow-xl"
                  data-testid="mbg-map-popup"
                >
                  <div className="mb-2 flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {popup.kind === 'region'
                          ? String((popup.region as any).name || (popup.region as any).key || '')
                          : popup.kind === 'point'
                          ? pointLabel(popup.point)
                          : `${nf(popup.items.length)} lokasi berdekatan`}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {popup.kind === 'region'
                          ? `${level === 'prov' ? 'Provinsi' : 'Kabupaten/Kota'} · ${cfg.title}`
                          : popup.kind === 'point'
                          ? [
                              String((popup.point as any).kabkota_name || ''),
                              String((popup.point as any).province_name || ''),
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Lokasi Titik Terdaftar'
                          : 'Pilih lokasi di bawah untuk melihat rincian'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closePopup}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Tutup"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {popup.kind === 'region' && (
                    <div className="space-y-1.5">
                      <Row l="Kasus / Insiden" v={nf((popup.region as any).kasus ?? (popup.region as any).kejadian)} />
                      <Row l="Korban Meninggal" v={nf((popup.region as any).meninggal ?? (popup.region as any).kematian)} tone="text-red-600 font-bold" />
                      {(popup.region as any).avg_skor != null && (
                        <Row l="Rata-rata Skor SOP" v={`${Number((popup.region as any).avg_skor).toFixed(1)}`} />
                      )}
                      {(popup.region as any).cfr != null && (
                        <Row l="CFR (%)" v={`${Number((popup.region as any).cfr).toFixed(1)}%`} />
                      )}
                      {level === 'prov' && (
                        <button
                          type="button"
                          onClick={() => {
                            const provName = String((popup.region as any).name || (popup.region as any).key || '')
                            const provId = Number((popup.region as any).id || (popup.region as any).province_id || 1)
                            closePopup()
                            onDrillRef.current(provId, provName)
                          }}
                          className="mt-2.5 w-full rounded-xl bg-teal-700 py-1.5 text-xs font-bold text-white hover:bg-teal-800 transition flex items-center justify-center gap-1.5"
                        >
                          <ChevronRight className="h-4 w-4" /> Telusuri Kabupaten/Kota
                        </button>
                      )}
                    </div>
                  )}

                  {popup.kind === 'point' && (
                    <div className="space-y-1.5">
                      <Row l="Kasus Terkait" v={nf(valOfPoint(popup.point))} />
                      {(popup.point as any).last_date && (
                        <Row l="Waktu Terakhir" v={String((popup.point as any).last_date)} />
                      )}
                      <div className="mt-2 pt-1 border-t border-slate-100 flex items-center gap-1.5">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${cfg.isAlert(popup.point) ? 'bg-red-500' : 'bg-emerald-500'}`}
                        />
                        <span className="text-[10px] font-bold text-slate-700">
                          {cfg.isAlert(popup.point) ? cfg.alertLabel : cfg.normalLabel}
                        </span>
                      </div>
                    </div>
                  )}

                  {popup.kind === 'cluster' && (
                    <ul className="max-h-44 space-y-1 overflow-auto divide-y divide-slate-100">
                      {popup.items.slice(0, 15).map((it, idx) => (
                        <li
                          key={idx}
                          onClick={() => setPopup({ kind: 'point', point: it })}
                          className="py-1 cursor-pointer hover:bg-slate-50 flex items-center justify-between text-xs"
                        >
                          <span className="truncate font-medium">{pointLabel(it)}</span>
                          <b className="tabular-nums ml-2">{nf(valOfPoint(it))}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>,
            popNode!,
          )
        : null}
    </div>
  )
}
