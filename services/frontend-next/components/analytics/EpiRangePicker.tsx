'use client'
// PR 016: the single period control of a page — an MMWR epi-week range (same convention as the dashboard filter bar).
// Kept in the URL as startYear/startWeek/endYear/endWeek, so every widget and link follows the same period.
import { useCallback, useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { getCurrentEpiWeek, getEpiWeekDateRange, getWeeksInYear } from '@/lib/epi-week'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export type EpiRange = { startYear: number; startWeek: number; endYear: number; endWeek: number }

const defaultRange = (): EpiRange => { const c = getCurrentEpiWeek(); return { startYear: c.year, startWeek: 1, endYear: c.year, endWeek: c.week } }

/** Reads the range from the URL once (default: week 1 of the current epi year → current week) and writes changes back. */
export function useEpiRange() {
  const [range, setRange] = useState<EpiRange>(defaultRange)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const num = (k: string) => { const v = Number(sp.get(k)); return Number.isFinite(v) && v > 0 ? v : null }
    const d = defaultRange()
    setRange({ startYear: num('startYear') ?? d.startYear, startWeek: num('startWeek') ?? d.startWeek, endYear: num('endYear') ?? d.endYear, endWeek: num('endWeek') ?? d.endWeek })
    setReady(true)
  }, [])
  const update = useCallback((r: EpiRange) => {
    setRange(r)
    const url = new URL(window.location.href)
    Object.entries(r).forEach(([k, v]) => url.searchParams.set(k, String(v)))
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])
  return { range, setRange: update, ready }
}

const sel = 'rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700'

export default function EpiRangePicker({ value, onChange }: { value: EpiRange; onChange: (r: EpiRange) => void }) {
  const { t, locale } = useTranslation()
  const cur = getCurrentEpiWeek()
  const years = Array.from({ length: 4 }, (_, i) => cur.year - i)
  const weeks = (y: number) => Array.from({ length: y === cur.year ? cur.week : getWeeksInYear(y) }, (_, i) => i + 1)
  const a = getEpiWeekDateRange(value.startYear, value.startWeek, locale === 'en' ? 'en' : 'id')
  const b = getEpiWeekDateRange(value.endYear, value.endWeek, locale === 'en' ? 'en' : 'id')
  const invalid = value.startYear * 100 + value.startWeek > value.endYear * 100 + value.endWeek
  const set = (p: Partial<EpiRange>) => {
    const n = { ...value, ...p }
    n.startWeek = Math.min(n.startWeek, weeks(n.startYear).length); n.endWeek = Math.min(n.endWeek, weeks(n.endYear).length)
    onChange(n)
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="epi-range">
      <CalendarDays className="h-3.5 w-3.5 text-primary" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.filter.epiRange')}</span>
      <select aria-label={t('skdr.filter.startWeekAria')} className={sel} value={value.startWeek} onChange={(e) => set({ startWeek: Number(e.target.value) })}>
        {weeks(value.startYear).map((w) => <option key={w} value={w}>{t('skdr.filter.weekShort', { week: w })}</option>)}
      </select>
      <select aria-label={t('skdr.filter.startYearAria')} className={sel} value={value.startYear} onChange={(e) => set({ startYear: Number(e.target.value) })}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <span className="text-xs text-slate-400">–</span>
      <select aria-label={t('skdr.filter.endWeekAria')} className={sel} value={value.endWeek} onChange={(e) => set({ endWeek: Number(e.target.value) })}>
        {weeks(value.endYear).map((w) => <option key={w} value={w}>{t('skdr.filter.weekShort', { week: w })}</option>)}
      </select>
      <select aria-label={t('skdr.filter.endYearAria')} className={sel} value={value.endYear} onChange={(e) => set({ endYear: Number(e.target.value) })}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <span className={`text-[11px] ${invalid ? 'font-bold text-red-600' : 'text-slate-500'}`}>{invalid ? t('skdr.filter.invalidRange') : `${a.startFormatted} — ${b.endFormatted}`}</span>
    </div>
  )
}
