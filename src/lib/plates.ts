export const COUNTRIES = [
  { code: "PL", label: "Poland" },
  { code: "DE", label: "Germany" },
  { code: "CZ", label: "Czechia" },
  { code: "SK", label: "Slovakia" },
  { code: "UA", label: "Ukraine" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export const DEFAULT_COUNTRY: CountryCode = "PL";

/** Must match the generated column in public.plates. */
export function normalizePlate(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isValidPlate(raw: string): boolean {
  const normalized = normalizePlate(raw);
  return normalized.length >= 2 && normalized.length <= 12;
}

export function platePath(country: string, plate: string): string {
  return `/plate/${encodeURIComponent(country)}/${encodeURIComponent(normalizePlate(plate))}`;
}
