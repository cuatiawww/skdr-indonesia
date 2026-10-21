// PR 99: helpers for count display and file-export responses.

/** NULL/undefined/'' is "not reported" ('-' dash), never 0. A stated 0 stays "0". */
export function fmtReportedCount(value) {
  if (value === null || value === undefined || value === '') return '\u2014'
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '\u2014'
}

/**
 * Why an export response cannot be saved as a file, or '' when it can.
 * A 200 that is JSON/HTML (login page, proxy error page) or empty is an error.
 */
export function exportResponseProblem(contentType, size, format) {
  const type = String(contentType || '').toLowerCase()
  if (!size) return 'Export returned an empty file'
  if (type.includes('text/html')) return 'Export returned a web page instead of a file (session or proxy error)'
  if (type.includes('application/json')) return 'Export returned JSON instead of a file'
  if (format === 'xlsx' && !type.includes('ms-excel') && !type.includes('spreadsheet')) {
    return `Export returned unexpected content type ${type || 'unknown'}`
  }
  if (format === 'csv' && !type.includes('text/csv')) {
    return `Export returned unexpected content type ${type || 'unknown'}`
  }
  return ''
}

/** Filename from Content-Disposition, else the fallback. */
export function exportFilename(disposition, fallback) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(String(disposition || ''))
  return match ? decodeURIComponent(match[1].trim()) : fallback
}
