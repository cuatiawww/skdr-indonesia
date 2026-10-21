'use client'
// PR 018 (Spesifikasi No. 10 "Menu bagian"): floating quick-nav for Dasbor. Entries are derived from the page's own
// top-level sections (section.skdr-section + its h2.skdr-section-title), so no section list is hardcoded here.
// Appears once the filter bar has scrolled out of view; the filter bar itself stays non-sticky.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronUp, ListTree } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

type Item = { id: string; label: string; el: HTMLElement }
const KEY = 'skdr_section_nav_collapsed'
const OFFSET = 84

function collect(root: HTMLElement): Item[] {
  const out: Item[] = []
  const seen = new Set<string>()
  root.querySelectorAll<HTMLElement>('section.skdr-section').forEach((sec, i) => {
    if (sec.parentElement?.closest('section.skdr-section')) return // only top-level sections
    const h = sec.querySelector('h2.skdr-section-title')
    // short pill label: the section title without a trailing parenthetical (e.g. "CFR per penyakit (Kasus PE, …)")
    const label = h?.textContent?.replace(/\s*\([^)]*\)\s*$/, '').trim()
    if (!label || seen.has(label) || sec.offsetHeight === 0) return
    seen.add(label)
    if (!sec.id) sec.id = `bagian-${i}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    out.push({ id: sec.id, label, el: sec })
  })
  return out
}

export default function SectionNav({ rootRef, sentinelRef }: { rootRef: RefObject<HTMLElement | null>; sentinelRef: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Item[]>([])
  const [active, setActive] = useState('')
  const [shown, setShown] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setCollapsed(window.localStorage.getItem(KEY) === '1') }, [])
  const toggle = () => setCollapsed((c) => { window.localStorage.setItem(KEY, c ? '0' : '1'); return !c })

  // sections list follows the DOM (widgets render asynchronously, hide when a source has no data)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setItems((prev) => {
      const next = collect(root)
      return prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.label === next[i].label) ? prev : next
    })) }
    run()
    const mo = new MutationObserver(run)
    mo.observe(root, { childList: true, subtree: true, characterData: true })
    return () => { mo.disconnect(); cancelAnimationFrame(raf) }
  }, [rootRef])

  // visibility (past the filter bar) + horizontal placement within the content column
  useEffect(() => {
    const onScroll = () => {
      const s = sentinelRef.current, root = rootRef.current
      if (s) setShown(s.getBoundingClientRect().top < 0)
      if (root) { const r = root.getBoundingClientRect(); setBox((b) => (b && b.left === r.left && b.width === r.width ? b : { left: r.left, width: r.width })) }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [rootRef, sentinelRef])

  // active section
  useEffect(() => {
    if (!items.length) return
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (vis[0]) setActive((vis[0].target as HTMLElement).id)
    }, { rootMargin: `-${OFFSET}px 0px -55% 0px`, threshold: 0 })
    items.forEach((it) => io.observe(it.el))
    return () => io.disconnect()
  }, [items])

  // keep the active pill in view on mobile
  useEffect(() => {
    const a = barRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)
    a?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [active])

  const go = (it: Item) => {
    const y = it.el.getBoundingClientRect().top + window.scrollY - OFFSET
    window.scrollTo({ top: y, behavior: 'smooth' })
    setActive(it.id)
  }

  if (!shown || items.length < 2 || !box) return null
  return (
    <nav aria-label={t('skdr.sectionNav.aria')} data-testid="section-nav" className="pointer-events-none fixed top-3 z-40 flex justify-center px-3 print:hidden" style={{ left: box.left, width: box.width }}>
      {collapsed ? (
        <button type="button" onClick={toggle} data-testid="section-nav-open" className="pointer-events-auto ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-bold text-brand-800 shadow-[0_2px_10px_rgba(15,23,42,0.08)] backdrop-blur-md hover:bg-white">
          <ListTree className="h-3.5 w-3.5" />{t('skdr.sectionNav.show')}
        </button>
      ) : (
        <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-[0_2px_10px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div ref={barRef} className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((it) => (
              <button key={it.id} type="button" data-id={it.id} onClick={() => go(it)} aria-current={active === it.id ? 'true' : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${active === it.id ? 'bg-primary text-white' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-800'}`}>
                {it.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={toggle} data-testid="section-nav-hide" aria-label={t('skdr.sectionNav.hide')} title={t('skdr.sectionNav.hide')}
            className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      )}
    </nav>
  )
}
