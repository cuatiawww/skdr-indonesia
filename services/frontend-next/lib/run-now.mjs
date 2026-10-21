// Run now (Data Sources): toast text for the collector answer and run polling rules.

export const RUN_NOW_POLL_MS = 5000
export const RUN_NOW_MAX_WATCH_MS = 15 * 60 * 1000

const SKIP_LABELS = {
  already_running: 'already running',
  failure_backoff: 'paused after repeated failures',
  ibs_source: 'IBS source, use the IBS run',
  skdr_detached: 'SKDR source is detached',
  not_found: 'source not found',
  unsupported_type: 'no collector for this source type',
}

// PR 81: collector_runs.skip_stats reasons, shortest first in the run line.
const SKIP_STAT_LABELS = {
  too_old: 'too old',
  unknown_date: 'no date',
  page_feed_date_drift: 'date mismatch',
  landing_page: 'homepage/section',
  too_short: 'too short',
  duplicate_url: 'duplicate URL',
  duplicate_title: 'duplicate title',
}

/** "skipped 3 too old · 1 homepage/section" from a run's skip_stats; '' when none. */
export function skipStatsLabel(stats) {
  if (!stats || typeof stats !== 'object') return ''
  const parts = Object.entries(stats)
    .map(([key, value]) => [key, Number(value) || 0])
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${value} ${SKIP_STAT_LABELS[key] || key.replace(/_/g, ' ')}`)
  return parts.length ? `skipped ${parts.join(' · ')}` : ''
}

function formatUntil(until) {
  if (!until) return ''
  const date = new Date(until)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function skipReasonLabel(reason, until) {
  const label = SKIP_LABELS[reason] || String(reason || 'not started').replace(/_/g, ' ')
  const time = formatUntil(until)
  return time ? `${label} until ${time}` : label
}

export function shortRunId(runId) {
  return runId ? String(runId).slice(0, 8) : ''
}

/** { kind: 'success' | 'info' | 'error', message } for the Run now response. */
export function runNowToast(name, result) {
  if (!result || result.success === false) {
    return { kind: 'error', message: `${name}: ${result?.error || 'collector did not accept the run'}` }
  }
  if (result.skipped) {
    return { kind: 'info', message: `${name} skipped: ${skipReasonLabel(result.reason, result.until)}` }
  }
  const id = shortRunId(result.run_id)
  const state = String(result.status || 'QUEUED').toUpperCase() === 'RUNNING' ? 'started' : 'queued'
  return { kind: 'success', message: id ? `${name} ${state} (run #${id})` : `${name} ${state}` }
}

export function isRunActive(status) {
  const value = String(status || '').toUpperCase()
  return value === 'RUNNING' || value === 'QUEUED'
}

/** Message once a watched run has left QUEUED/RUNNING, else null. */
export function runFinishedToast(name, run) {
  if (!run || isRunActive(run.status)) return null
  const status = String(run.status || '').toUpperCase()
  if (status === 'SUCCESS') {
    return { kind: 'success', message: `${name} finished: ${run.records_found ?? 0} found, ${run.records_ingested ?? 0} new` }
  }
  if (status === 'SKIPPED') {
    return { kind: 'info', message: `${name} skipped: ${skipReasonLabel(run.skip_reason)}` }
  }
  return { kind: 'error', message: `${name} failed: ${run.error_message || status || 'unknown error'}` }
}
