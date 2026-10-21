'use client'

import React, { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Newspaper, ShieldCheck } from 'lucide-react'
import { fetchRelatedArticles, type RelatedArticle, type RelatedArticles } from '@/lib/api'

interface RelatedArticlesPanelProps {
  /** Internal review views only (Admin/Analyst); public views omit it. */
  includeUnpublished?: boolean
  eventId?: string | null
  compact?: boolean
}

function credibility(article: RelatedArticle): string {
  const score = article.source_credibility
  const label = article.source_credibility_label
  if (score == null) return label || 'Unrated'
  return `${label ? `${label} · ` : ''}${Math.round(score * 100)}%`
}

function diff(value?: number | null): string {
  if (value == null || value === 0) return ''
  return ` (${value > 0 ? '+' : ''}${value.toLocaleString()})`
}

export default function RelatedArticlesPanel({ eventId, compact = false, includeUnpublished = false }: RelatedArticlesPanelProps) {
  const [data, setData] = useState<RelatedArticles | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    if (!eventId) return
    let stale = false
    setLoading(true)
    fetchRelatedArticles(eventId, includeUnpublished)
      .then((result) => {
        if (!stale) setData(result)
      })
      .catch((err: unknown) => {
        if (!stale) setError(err instanceof Error ? err.message : 'Related articles could not be loaded')
      })
      .finally(() => {
        if (!stale) setLoading(false)
      })
    return () => {
      stale = true
    }
  }, [eventId])

  if (!eventId) return null

  const related = (data?.articles || []).filter((article) => !article.is_anchor)
  const reference = data?.reference
  const text = compact ? 'text-[9px]' : 'text-[11px]'
  const shown = compact ? related.slice(0, 4) : related

  return (
    <div className={compact ? 'mt-2 border-t border-slate-100 pt-2' : 'rounded-xl border border-slate-200 bg-white p-4'}>
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 font-black uppercase tracking-wide ${compact ? 'text-[9px] text-slate-400' : 'text-xs text-slate-700'}`}>
          <Newspaper className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5 text-[#0060A9]'} />
          Related articles
          {data ? ` (${data.related_count})` : ''}
        </p>
        {data && !compact && (
          <span className="text-[10px] font-semibold text-slate-400">
            Same disease and country, case date ±{data.window_days} days · {data.domain_count} domains
          </span>
        )}
      </div>

      {loading && (
        <p className={`mt-2 flex items-center gap-1.5 ${text} font-semibold text-slate-400`}>
          <Loader2 className="h-3 w-3 animate-spin" /> Loading related articles
        </p>
      )}
      {error && <p className={`mt-2 ${text} font-semibold text-rose-600`}>{error}</p>}

      {data && reference && (
        <div className={`mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
          <p className={`flex items-center gap-1 ${text} font-black text-emerald-800`}>
            <ShieldCheck className="h-3 w-3" />
            Reference figure: {reference.cases.toLocaleString()} cases · {reference.deaths.toLocaleString()} deaths
          </p>
          <p className={`${text} font-semibold text-emerald-700`}>
            {reference.is_anchor ? 'This article' : reference.domain || reference.source_name || 'Source'} — {credibility(reference)}
            {data.figures_differ ? ' · other sources report different figures' : ''}
          </p>
        </div>
      )}

      {data && !loading && related.length === 0 && (
        <p className={`mt-2 ${text} font-semibold text-slate-400`}>No other article reports this event in the window.</p>
      )}

      {shown.length > 0 && (
        <div className={`mt-2 ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
          {shown.map((article) => (
            <a
              key={article.event_id}
              href={article.url || undefined}
              target="_blank"
              rel="noreferrer"
              className={`block rounded-lg border ${article.is_reference ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-100 bg-slate-50'} ${compact ? 'px-2 py-1' : 'px-3 py-2'} hover:border-blue-200 hover:bg-blue-50`}
            >
              <p className={`flex items-start gap-1 ${text} font-bold text-slate-800`}>
                <span className={compact ? 'line-clamp-1' : 'line-clamp-2'}>{article.title || article.url || 'Untitled article'}</span>
                {!compact && article.url && <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />}
              </p>
              <p className={`mt-0.5 ${compact ? 'text-[8px]' : 'text-[10px]'} font-semibold text-slate-500`}>
                {[article.domain || article.source_name, credibility(article), article.published_at].filter(Boolean).join(' · ')}
              </p>
              <p className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-semibold ${article.same_place ? 'text-slate-600' : 'text-slate-400'}`}>
                {article.place || article.country || '—'}: {article.cases.toLocaleString()} cases{diff(article.cases_diff)} · {article.deaths.toLocaleString()} deaths{diff(article.deaths_diff)}
                {article.is_reference ? ' · reference' : ''}
                {!article.same_place ? ' · other area' : ''}
              </p>
            </a>
          ))}
          {related.length > shown.length && (
            <p className="text-[9px] font-semibold text-slate-400">+{related.length - shown.length} more related articles</p>
          )}
        </div>
      )}
    </div>
  )
}
