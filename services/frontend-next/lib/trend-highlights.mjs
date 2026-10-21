/** Cards above Priority Signals, taken from the filtered topic list. */

export function largestCluster(alerts) {
  let cluster = null
  for (const alert of alerts || []) {
    const rows = alert.country_breakdown?.length
      ? alert.country_breakdown
      : alert.top_country
        ? [{ country: alert.top_country, cases: alert.top_country_cases }]
        : []
    for (const row of rows) {
      const cases = Number(row.cases) || 0
      if (!cluster || cases > cluster.cases) {
        cluster = { disease: alert.disease, country: row.country, cases }
      }
    }
  }
  return cluster
}

export function focusTopics(alerts) {
  return (alerts || []).slice(1, 3)
}

export function scopeTotalLabel(country) {
  const value = String(country || 'ASEAN').trim()
  const token = value.toLowerCase()
  if (!token || token === 'asean' || token === 'all' || token === 'asean11') return 'Total ASEAN'
  if (token === 'global' || token === 'world') return 'Total'
  return `Total ${value}`
}
