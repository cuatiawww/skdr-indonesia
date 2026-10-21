export function normCountry(value: unknown): string;
export function sameCountry(left: unknown, right: unknown): boolean;
export function countryInScope(
  country:
    | {
        is_active?: boolean;
        home_region?: string | null;
        regions?: { code?: string }[];
      }
    | null
    | undefined,
  scope: string,
): boolean;
export function nextAdminLevel(level: number): number | null;
export function adminLevelCode(level: number): string;
