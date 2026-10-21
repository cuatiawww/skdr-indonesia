'use client'
// PR 018: horizontal auto-scrolling carousel of compact disease cards, directly below the map.
// Auto-scroll (requestAnimationFrame, ~30 px/s) pauses on hover, keyboard focus, drag and when the tab is hidden;
// disabled under prefers-reduced-motion. Prev/next buttons, mouse drag and touch swipe (native overflow scroll).
// Loops by rendering the list twice and wrapping scrollLeft, so there is never an empty gap at the end.
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import DiseaseCard from '@/components/dashboard/DiseaseCard'
import type { SummaryDisease } from '@/components/dashboard/DiseaseTable'
import type { Sumber, UkuranEbs } from '@/lib/use-sumber'

const SPEED = 30 // px per second

export default function DiseaseCarousel({ rows, sumber, ukuran }: { rows: SummaryDisease[]; sumber: Sumber; ukuran: UkuranEbs }) {
  const { t } = useTranslation()
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [user, setUser] = useState(false) // user pressed pause
  const [reduced, setReduced] = useState(false)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const loop = rows.length > 2

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const f = () => setReduced(m.matches)
    f(); m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])

  const paused = hover || focus || user || reduced || !loop
  useEffect(() => {
    if (paused) return
    let raf = 0, last = performance.now(), acc = 0
    const step = (now: number) => {
      const el = track.current
      if (el && !document.hidden && !drag.current) {
        acc += ((now - last) / 1000) * SPEED
        const whole = Math.floor(acc)
        if (whole >= 1) {
          acc -= whole
          el.scrollLeft += whole
          const half = el.scrollWidth / 2
          if (el.scrollLeft >= half) el.scrollLeft -= half
        }
      }
      last = now
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [paused])

  const page = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-slide]')
    const w = card ? card.offsetWidth + 12 : 280
    if (loop && dir === -1 && el.scrollLeft < w) el.scrollLeft += el.scrollWidth / 2
    el.scrollBy({ left: dir * w, behavior: reduced ? 'auto' : 'smooth' })
  }

  const list = loop ? [...rows, ...rows] : rows
  return (
    <section aria-roledescription="carousel" aria-label={t('skdr.carousel.label')} data-testid="disease-carousel"
      className="skdr-section min-w-0"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false) }}>
      <div className="skdr-section-head flex items-end justify-between gap-2">
        <div className="min-w-0"><div className="skdr-eyebrow">{t('skdr.carousel.eyebrow')}</div><h2 className="skdr-section-title">{t('skdr.carousel.title')}</h2></div>
        <div className="flex items-center gap-1">
          {loop && !reduced ? (
            <button type="button" onClick={() => setUser((u) => !u)} aria-label={user ? t('skdr.carousel.play') : t('skdr.carousel.pause')} title={user ? t('skdr.carousel.play') : t('skdr.carousel.pause')}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">{user ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>
          ) : null}
          <button type="button" onClick={() => page(-1)} aria-label={t('skdr.carousel.prev')} data-testid="carousel-prev"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => page(1)} aria-label={t('skdr.carousel.next')} data-testid="carousel-next"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div ref={track} className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing select-none"
        onPointerDown={(e) => { if (e.pointerType !== 'mouse' || !track.current) return; drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false } }}
        onPointerMove={(e) => { const d = drag.current; if (!d || !track.current) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 4) d.moved = true; track.current.scrollLeft = d.left - dx }}
        onPointerUp={() => { setTimeout(() => { drag.current = null }, 0) }}
        onPointerLeave={() => { drag.current = null }}
        onClickCapture={(e) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation() } }}>
        {list.map((r, i) => (
          <div key={`${r.code}-${i}`} data-slide className="w-[15.5rem] shrink-0 sm:w-[16.5rem]" aria-hidden={i >= rows.length ? true : undefined}>
            <DiseaseCard r={r} sumber={sumber} ukuran={ukuran} compact />
          </div>
        ))}
      </div>
    </section>
  )
}
