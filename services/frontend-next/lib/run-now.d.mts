export type RunNowResult = {
  success?: boolean
  skipped?: boolean
  status?: string
  run_id?: string | null
  reason?: string | null
  until?: string | null
  error?: string
}
export type RunNowToast = { kind: 'success' | 'info' | 'error'; message: string }
export declare const RUN_NOW_POLL_MS: number
export declare const RUN_NOW_MAX_WATCH_MS: number
export declare function skipReasonLabel(reason?: string | null, until?: string | null): string
export declare function shortRunId(runId?: string | null): string
export declare function runNowToast(name: string, result?: RunNowResult | null): RunNowToast
export declare function isRunActive(status?: string | null): boolean
export declare function runFinishedToast(
  name: string,
  run?: {
    status?: string | null
    records_found?: number | null
    records_ingested?: number | null
    error_message?: string | null
    skip_reason?: string | null
  } | null,
): RunNowToast | null
/** PR 81: "skipped 3 too old · 1 homepage/section" from collector_runs.skip_stats; '' when none. */
export function skipStatsLabel(stats: Record<string, number> | null | undefined): string
