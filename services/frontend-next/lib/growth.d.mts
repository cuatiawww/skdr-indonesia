// PR 154: types for lib/growth.mjs
export type GrowthInfo = { kind: 'pct' | 'new' | 'na' | 'flat'; pct: number | null; up: boolean }
export const MAX_MEANINGFUL_GROWTH_PCT: number
export function growthInfo(current: number, previous: number, maxPct?: number): GrowthInfo
export function growthText(info: GrowthInfo, fmt?: (n: number) => string, signed?: boolean): string
export const GROWTH_NA_TITLE: string
export type GrowthCaption = { headline: string; detail: string; tone: 'up' | 'down' | 'neutral' }
export function growthCaption(current: number, previous: number, opts?: { current?: string; previous?: string; noun?: string; fmt?: (n: number) => string; fmtPct?: (n: number) => string }): GrowthCaption
export const GROWTH_FOOTNOTE: string
