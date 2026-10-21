// PR 016: central theme tokens (Kemenkes logo palette). CSS variables are defined in app/globals.css (defaults) and
// overridden at runtime from app_settings.theme_palette (DB, migration 024) by SettingsProvider.
// Tailwind maps `brand-*`, `primary`, and the legacy `blue-*`/`sky-*` scales to these variables (tailwind.config.ts).
// Values are "R G B" channel triplets so Tailwind opacity modifiers work.
export const BRAND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type ThemePalette = {
  brand?: Partial<Record<(typeof BRAND_STEPS)[number], string>>
  accent?: string
  lime?: string
  ebs?: string
  pe?: string
  ebs_scale?: string[]
  pe_scale?: string[]
  all_scale?: string[]
}

/** CSS colour usable in style props and SVG attributes (Chromium/Firefox resolve var() there). */
export const cssv = (name: string) => `rgb(var(--${name}))`
export const SOURCE_COLOR = { ebs: cssv('src-ebs'), pe: cssv('src-pe') } as const
export const BRAND = { primary: cssv('brand-700'), dark: cssv('brand-800'), light: cssv('brand-500'), soft: cssv('brand-100') } as const

const toChannels = (hex: string) => {
  const h = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`
}

/** Resolve a theme variable to a concrete colour (for canvas renderers such as OpenLayers). */
export function themeRgb(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return `rgba(4, 122, 111, ${alpha})`
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || '4 122 111'
  const [r, g, b] = v.split(/\s+/)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Apply DB palette (hex values) to the CSS variables. Invalid values are ignored. */
export function applyPalette(p?: ThemePalette | null) {
  if (!p || typeof document === 'undefined') return
  const root = document.documentElement.style
  const set = (k: string, hex?: string) => { const c = hex && toChannels(hex); if (c) root.setProperty(`--${k}`, c) }
  for (const s of BRAND_STEPS) set(`brand-${s}`, p.brand?.[s])
  set('brand-accent', p.accent); set('brand-lime', p.lime); set('src-ebs', p.ebs); set('src-pe', p.pe)
  ;(['ebs', 'pe', 'all'] as const).forEach((k) => (p[`${k}_scale`] || []).slice(0, 5).forEach((hex, i) => set(`scale-${k}-${i}`, hex)))
}

/** Sequential 5-step scale (light → dark) per series; 0 stays neutral. */
export function shadeVar(v: number, max: number, hue: 'ebs' | 'pe' | 'all') {
  if (!v || max <= 0) return '#f1f5f9'
  const t = Math.sqrt(v / max)
  return cssv(`scale-${hue}-${Math.min(4, Math.floor(t * 4.999))}`)
}
