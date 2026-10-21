'use client'
// PR 012: SVG choropleth per province (or kab/kota inside one province). Geometry: public/data/*.geojson
// (province id_provinsi = master_locations.code; kab kode_kab = master_kabkota.code). Click a province to drill down.
import { useEffect, useMemo, useState } from 'react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fmt, shade } from '@/lib/analytics-api'

type Feat = { code: string; name: string; d: string; cx: number; cy: number }
const cache: Record<string, any> = {}

async function load(level: 'province' | 'kabkota') {
  const f = level === 'province' ? 'indonesia-38-provinces.geojson' : 'indonesia-kabupaten.geojson'
  if (!cache[f]) cache[f] = fetch(`${PUBLIC_BASE_PATH}/data/${f}`).then((r) => r.json())
  return cache[f]
}

export default function ChoroplethMap({ level, provinceCode, values, hue, onPick, height = 360 }: {
  level: 'province' | 'kabkota'; provinceCode?: string | null; values: Record<string, number>; hue: 'ebs' | 'pe'
  onPick?: (code: string) => void; height?: number
}) {
  const { t } = useTranslation()
  const [geo, setGeo] = useState<any>(null)
  const [err, setErr] = useState(false)
  const [hover, setHover] = useState<Feat | null>(null)
  useEffect(() => { let a = true; setGeo(null); load(level).then((g) => a && setGeo(g)).catch(() => a && setErr(true)); return () => { a = false } }, [level])
  const W = 1000
  const feats = useMemo<{ list: Feat[]; H: number }>(() => {
    if (!geo) return { list: [], H: 400 }
    const fs = (geo.features || []).filter((f: any) => level === 'province' || String(f.properties.kode_prov) === String(provinceCode))
    let [x0, y0, x1, y1] = [180, 90, -180, -90]
    const each = (g: any, fn: (x: number, y: number) => void) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach((poly: any) => poly.forEach((ring: any) => ring.forEach((p: number[]) => fn(p[0], p[1]))))
    fs.forEach((f: any) => each(f.geometry, (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }))
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180)
    const sx = W / Math.max(1e-6, (x1 - x0) * k)
    const H = Math.round(Math.max(1e-6, y1 - y0) * sx)
    const px = (x: number) => ((x - x0) * k * sx).toFixed(1)
    const py = (y: number) => ((y1 - y) * sx).toFixed(1)
    const list: Feat[] = fs.map((f: any) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
      let d = ''
      for (const poly of polys) for (const ring of poly) {
        let last = ''
        ring.forEach((p: number[], i: number) => { const s = `${px(p[0])},${py(p[1])}`; if (s !== last) { d += (i ? 'L' : 'M') + s; last = s } })
        d += 'Z'
      }
      const p = f.properties
      return { code: String(level === 'province' ? p.id_provinsi : p.kode_kab), name: String(level === 'province' ? p.provinsi : p.nama_kab), d,
        cx: Number(px(p.centerlong)), cy: Number(py(p.centerlat)) }
    })
    return { list, H }
  }, [geo, level, provinceCode])
  const max = Math.max(0, ...Object.values(values))
  if (err) return <div className="p-6 text-center text-xs text-red-600">{t('skdr.penyakit.mapFailed')}</div>
  if (!geo) return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>{t('skdr.penyakit.mapLoading')}</div>
  if (!feats.list.length) return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>{t('skdr.penyakit.mapNoGeometry')}</div>
  return (
    <div className="relative" data-testid="choropleth">
      <svg viewBox={`0 0 ${W} ${feats.H}`} className="w-full" style={{ maxHeight: height }} role="img" aria-label={t('skdr.penyakit.mapAria')}>
        {feats.list.map((f) => (
          <path key={f.code} d={f.d} fill={shade(values[f.code] || 0, max, hue)} stroke="#fff" strokeWidth={level === 'province' ? 1 : 0.6}
            className={onPick ? 'cursor-pointer transition-opacity hover:opacity-80' : ''} onMouseEnter={() => setHover(f)} onMouseLeave={() => setHover(null)}
            onClick={() => onPick?.(f.code)}>
            <title>{`${f.name}: ${fmt(values[f.code] || 0)}`}</title>
          </path>
        ))}
      </svg>
      {hover ? <div className="pointer-events-none absolute left-2 top-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[11px] shadow"><b>{hover.name}</b>: {fmt(values[hover.code] || 0)}</div> : null}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
        <span>0</span>{[0.05, 0.2, 0.45, 0.7, 1].map((x) => <span key={x} className="h-3 w-6 rounded-sm" style={{ background: shade(x * max || 0.0001, max || 1, hue) }} />)}<span>{fmt(max)}</span>
        {onPick && level === 'province' ? <span className="ml-auto">{t('skdr.penyakit.mapDrill')}</span> : null}
      </div>
    </div>
  )
}
