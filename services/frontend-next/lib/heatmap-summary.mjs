// PR 161: the Surveillance Location Summary cards are computed from the rows the table shows
// (filtered countries and diseases), never hardcoded ("11", "54 Regions") or read from the
// unfiltered response summary (burden 0 / global burden under a filter).

const norm = (s) => String(s || '').trim().toLowerCase();

export function heatmapSummary(countries, diseases) {
  const wanted = (diseases || []).map(norm).filter((d) => d && d !== 'all');
  let cases = 0;
  let deaths = 0;
  let reporting = 0;
  for (const c of countries || []) {
    let cc = Number(c.total_cases) || 0;
    let cd = Number(c.total_deaths) || 0;
    let ev = Number(c.total_events) || 0;
    if (wanted.length && Array.isArray(c.diseases)) {
      const hit = c.diseases.filter((d) => wanted.some((w) => norm(d.disease) === w || norm(d.disease).includes(w)));
      cc = hit.reduce((a, d) => a + (Number(d.cases) || 0), 0);
      cd = hit.reduce((a, d) => a + (Number(d.deaths) || 0), 0);
      ev = hit.reduce((a, d) => a + (Number(d.events) || 0), 0);
    }
    cases += cc;
    deaths += cd;
    if (ev > 0 || cc > 0) reporting += 1;
  }
  return { countries: (countries || []).length, reporting, cases, deaths };
}
