/** Which master-country rows belong on the map for a region filter. */

export const NAME_GROUPS = [
  ["vietnam", "viet nam"],
  ["laos", "lao pdr", "lao"],
  ["brunei", "brunei darussalam"],
  ["south korea", "korea", "republic of korea"],
  ["united states", "united states of america", "usa"],
  ["united kingdom", "uk", "great britain"],
  ["russia", "russian federation"],
  ["turkey", "turkiye", "türkiye"],
  ["myanmar", "burma"],
];

export function normCountry(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function sameCountry(left, right) {
  const a = normCountry(left);
  const b = normCountry(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return NAME_GROUPS.some((group) => group.includes(a) && group.includes(b));
}

export function countryInScope(country, scope) {
  if (!country || country.is_active === false) return false;
  if (scope === "global") return true;
  if (scope === "indonesia") return country.iso3 === "IDN";
  const codes = new Set((country.regions || []).map((region) => region.code));
  const home = country.home_region || "";
  if (scope === "asean") return codes.has("ASEAN") || home === "ASEAN";
  if (scope === "asean3") return codes.has("ASEAN_PLUS_THREE") || home === "ASEAN" || home === "ASEAN+3";
  return false;
}

export function nextAdminLevel(level) {
  const current = Number(level) || 0;
  if (current >= 5) return null;
  return current + 1;
}

export function adminLevelCode(level) {
  return `ADM${level}`;
}
