'use client'
// PR 018: choropleth classes from app_settings.map_choropleth (migrasi 033/034).
// Aturan spesifikasi No. 57: lima kelas — 0, lalu empat kelas kuartil (25/50/75%) yang dihitung ulang untuk setiap peta
// dari wilayah bernilai > 0 pada tingkat yang ditampilkan; batas sama → satu angka, kelas kosong digabung.
import { useMemo } from 'react'
import { useSettings } from '@/lib/settings-context'

export type ChoroClass = { min: number; max: number | null; label: string; color: string }
export type ChoroConfig =
  | { mode: 'quantile'; zeroColor: string; colors: string[]; quantiles: number[] }
  | { mode: 'fixed'; classes: ChoroClass[] }

const isColor = (c: unknown): c is string => typeof c === 'string' && c.length > 0

export function parseChoroConfig(raw: unknown): ChoroConfig | null {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (v?.mode === 'quantile' && isColor(v.zero_color) && Array.isArray(v.colors) && v.colors.length && Array.isArray(v.quantiles)) {
      const q = v.quantiles.map(Number).filter((x: number) => x > 0 && x < 1).sort((a: number, b: number) => a - b)
      return { mode: 'quantile', zeroColor: v.zero_color, colors: v.colors.filter(isColor), quantiles: q }
    }
    const list = Array.isArray(v?.classes) ? v.classes : null
    if (!list?.length) return null
    const classes = list.filter((c: any) => isColor(c?.color) && Number.isFinite(Number(c?.min)))
      .map((c: any) => ({ min: Number(c.min), max: c.max == null ? null : Number(c.max), label: String(c.label ?? c.min), color: String(c.color) }))
      .sort((a: ChoroClass, b: ChoroClass) => a.min - b.min)
    return classes.length ? { mode: 'fixed', classes } : null
  } catch {
    return null
  }
}

/** Nearest-rank quantile on ascending integers. */
function qRank(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]
}

const label = (min: number, max: number | null) => (max == null ? `${min}+` : min === max ? `${min}` : `${min}–${max}`)

/** Classes for one map: `values` = all region values at the displayed level (zeros allowed). */
export function buildChoroClasses(cfg: ChoroConfig | null, values: number[]): ChoroClass[] | null {
  if (!cfg) return null
  if (cfg.mode === 'fixed') return cfg.classes
  const pos = values.map((x) => Math.round(x || 0)).filter((x) => x > 0).sort((a, b) => a - b)
  const out: ChoroClass[] = [{ min: 0, max: 0, label: '0', color: cfg.zeroColor }]
  if (!pos.length) return out
  const top = pos[pos.length - 1]
  const cuts = [...cfg.quantiles.map((p) => qRank(pos, p)), top]
  let lo = 1
  cuts.forEach((hi, i) => {
    if (hi < lo) return // empty class (equal breaks) → merged
    const last = hi === top && out.length > 1
    const color = cfg.colors[Math.min(cfg.colors.length - 1, i)]
    // last class open-ended ("10+") only if it spans more than one value
    out.push({ min: lo, max: last && hi > lo ? null : hi, label: label(lo, last && hi > lo ? null : hi), color })
    lo = hi + 1
  })
  return out
}

export function choroClassFor(value: number, classes: ChoroClass[]): ChoroClass {
  const v = Math.max(0, Math.round(value || 0))
  return classes.find((c) => v >= c.min && (c.max == null || v <= c.max)) || classes[classes.length - 1]
}

export function useChoroConfig(): ChoroConfig | null {
  const { settings } = useSettings() as any
  const raw = settings?.map_choropleth
  return useMemo(() => parseChoroConfig(raw), [raw])
}
