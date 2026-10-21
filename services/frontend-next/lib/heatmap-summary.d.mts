export function heatmapSummary(
  countries: Array<{ total_cases?: number; total_deaths?: number; total_events?: number; diseases?: Array<{ disease: string; cases: number; deaths: number; events: number }> }> | undefined | null,
  diseases: string[] | undefined | null,
): { countries: number; reporting: number; cases: number; deaths: number };
