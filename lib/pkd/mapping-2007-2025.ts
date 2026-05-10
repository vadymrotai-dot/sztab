// lib/pkd/mapping-2007-2025.ts
// Sprint S6D Day 0 (10.05.2026) — PKD 2007 → PKD 2025 mapping + HoReCa fit scoring.
//
// WHY: PKD 2025 weszła w życie 1 stycznia 2025. Перехідне okno do
// 31 grudnia 2026. Sztab DB має MIX kodів (старі firms = PKD 2007,
// нові 2025+ = PKD 2025). UI/scoring/algo MUST normalize до canonical
// PKD 2025 inakszej segmentation вибухає.
//
// Mirror DB tables:
//   - scripts/064_pkd_2025_mapping.sql (pkd_2007_to_2025 + pkd_horeca_fit)
// Цей модуль — TypeScript constant equivalent для UI без DB roundtrip.
// При змінах keep in sync з SQL seed!
//
// Zero dependencies — pure data + helpers, безпечно importувати з
// UI components, scoring engine, або scripts.

// ─── PKD 2007 → PKD 2025 mapping ───
// Source: GUS klucze powiązań PDF (2024). Тільки HoReCa-relevant subset.

export const PKD_2007_TO_2025: Record<string, string> = {
  // Section 56 — Wyżywienie
  '56.10.A': '56.11.Z', // Restauracje (zmiana w PKD 2025)
  '56.10.B': '56.12.Z', // Ruchome placówki gastronomiczne (zmiana)
  '56.21.Z': '56.21.Z', // Catering imprez (bez zmiany)
  '56.29.Z': '56.29.Z', // Catering pozostały (bez zmiany)
  '56.30.Z': '56.30.Z', // Bary, puby (bez zmiany)
  // Section 47 — Sprzedaż detaliczna (всі без зміни в 2025)
  '47.11.Z': '47.11.Z',
  '47.21.Z': '47.21.Z',
  '47.22.Z': '47.22.Z',
  '47.23.Z': '47.23.Z',
  '47.24.Z': '47.24.Z',
  '47.29.Z': '47.29.Z',
  // Section 46 — Sprzedaż hurtowa (всі без зміни в 2025)
  '46.31.Z': '46.31.Z',
  '46.32.Z': '46.32.Z',
  '46.34.A': '46.34.A',
  '46.38.Z': '46.38.Z',
  '46.39.Z': '46.39.Z',
  // Section 55 — Hotele (всі без зміни в 2025)
  '55.10.Z': '55.10.Z',
  '55.20.Z': '55.20.Z',
  '55.30.Z': '55.30.Z',
  '55.90.Z': '55.90.Z',
  // Section 93 — Sport, rekreacja (всі без зміни в 2025)
  '93.11.Z': '93.11.Z',
  '93.21.Z': '93.21.Z',
  '93.29.Z': '93.29.Z',
  // Section 86/87 — Health/social (всі без зміни в 2025)
  '86.10.Z': '86.10.Z',
  '87.30.Z': '87.30.Z',
  // Section 85 — Edukacja (всі без зміни в 2025)
  '85.10.Z': '85.10.Z',
  '85.20.Z': '85.20.Z',
  '85.31.Z': '85.31.Z',
  '85.32.Z': '85.32.Z',
}

// ─── HoReCa fit scoring + category per canonical PKD 2025 code ───

export type HorecaCategory =
  | 'restaurant'
  | 'food_service'
  | 'hotel'
  | 'catering'
  | 'retail'
  | 'wholesale'
  | 'institution'
  | 'production'
  | 'recreation'
  | 'other'

export interface HorecaFit {
  score: number // 0-10. 10 = direct fish supplier sweet spot.
  category: HorecaCategory
  notes: string
}

export const PKD_HORECA_FIT: Record<string, HorecaFit> = {
  // Restaurant tier
  '56.11.Z': { score: 9, category: 'restaurant', notes: 'Core target — restauracje stałe' },
  '56.12.Z': { score: 3, category: 'food_service', notes: 'Food trucks — limited fresh fish viability' },
  '56.30.Z': { score: 4, category: 'food_service', notes: 'Bary i puby — przekąski rybne low-volume' },
  // Catering tier
  '56.21.Z': { score: 8, category: 'catering', notes: 'Wesela, bankiety = łosoś, dorsz premium' },
  '56.29.Z': { score: 6, category: 'catering', notes: 'Stołówki — volume + low margin' },
  // Hotel tier
  '55.10.Z': { score: 9, category: 'hotel', notes: 'Hotele premium F&B' },
  '55.20.Z': { score: 5, category: 'hotel', notes: 'Pensjonaty — variable F&B' },
  '55.30.Z': { score: 1, category: 'hotel', notes: 'Pola kempingowe — minimal F&B' },
  '55.90.Z': { score: 5, category: 'hotel', notes: 'Akademiki, internaty z stołówkami' },
  // Retail tier
  '47.23.Z': { score: 10, category: 'retail', notes: 'Direct fish reseller — top target' },
  '47.29.Z': { score: 8, category: 'retail', notes: 'Delicatesy — kawior, śledzie, wędzony łosoś' },
  '47.22.Z': { score: 5, category: 'retail', notes: 'Mięso retail — czasem wędzone ryby' },
  '47.11.Z': { score: 4, category: 'retail', notes: 'Sklepy spożywcze ogólne' },
  '47.21.Z': { score: 2, category: 'retail', notes: 'Owoce/warzywa retail — niski fit' },
  '47.24.Z': { score: 3, category: 'retail', notes: 'Piekarnia/cukiernia retail' },
  // Wholesale tier
  '46.38.Z': { score: 7, category: 'wholesale', notes: 'Hurt rybny — partner lub konkurent' },
  '46.39.Z': { score: 6, category: 'wholesale', notes: 'Cash & carry — Makro, Selgros' },
  '46.32.Z': { score: 4, category: 'wholesale', notes: 'Hurt mięsa — czasem wędzone ryby' },
  '46.31.Z': { score: 3, category: 'wholesale', notes: 'Hurt warzyw — minimal cross' },
  '46.34.A': { score: 2, category: 'wholesale', notes: 'Hurt alkoholu — minimal cross' },
  // Institutional tier
  '86.10.Z': { score: 5, category: 'institution', notes: 'Szpitale — institutional catering' },
  '87.30.Z': { score: 5, category: 'institution', notes: 'DPS-y, hospicja' },
  '85.10.Z': { score: 4, category: 'institution', notes: 'Przedszkola — outsourced catering' },
  '85.20.Z': { score: 4, category: 'institution', notes: 'Szkoły podstawowe' },
  '85.31.Z': { score: 4, category: 'institution', notes: 'Licea, gimnazja' },
  '85.32.Z': { score: 4, category: 'institution', notes: 'Szkoły zawodowe' },
  // Recreation tier
  '93.11.Z': { score: 5, category: 'recreation', notes: 'Obiekty sportowe з restauracjami' },
  '93.21.Z': { score: 4, category: 'recreation', notes: 'Parki rozrywki — catering wewnętrzny' },
  '93.29.Z': { score: 3, category: 'recreation', notes: 'Kasyna, kręgielnie з barami' },
}

// ─── Public helpers ───

/**
 * Normalize PKD code до canonical PKD 2025. Якщо input — PKD 2007,
 * returns mapped 2025 code. Якщо input — already PKD 2025 (or unknown),
 * returns as-is.
 *
 * Tolerates whitespace + casing variations.
 *
 * @example
 * normalizeToPkd2025('56.10.A')  // → '56.11.Z'
 * normalizeToPkd2025('56.21.Z')  // → '56.21.Z' (no change)
 * normalizeToPkd2025('99.99.Z')  // → '99.99.Z' (unknown, passthrough)
 */
export function normalizeToPkd2025(code: string | null | undefined): string {
  if (!code) return ''
  const normalized = code.trim().toUpperCase()
  return PKD_2007_TO_2025[normalized] ?? normalized
}

/**
 * Get HoReCa fit score (0-10) для канонічного PKD 2025 code.
 * Returns 0 якщо code не в HoReCa scoring dictionary.
 *
 * Auto-normalizes input — приймає і PKD 2007, і PKD 2025.
 */
export function getHorecaFitScore(code: string | null | undefined): number {
  const canonical = normalizeToPkd2025(code)
  return PKD_HORECA_FIT[canonical]?.score ?? 0
}

/**
 * Get HoReCa category для PKD code.
 * Returns 'other' якщо code не в scoring dictionary.
 */
export function getHorecaCategory(
  code: string | null | undefined,
): HorecaCategory {
  const canonical = normalizeToPkd2025(code)
  return PKD_HORECA_FIT[canonical]?.category ?? 'other'
}

/**
 * Full HoReCa fit lookup. Returns null якщо PKD не tracked.
 */
export function getHorecaFit(
  code: string | null | undefined,
): HorecaFit | null {
  const canonical = normalizeToPkd2025(code)
  return PKD_HORECA_FIT[canonical] ?? null
}

/**
 * Multi-PKD aggregator. Якщо firma ма kilka PKD codes
 * (główny + dodatkowe), повертає highest fit score.
 *
 * Useful для prospects/clients з PKD arrays.
 */
export function getMaxHorecaFitScore(
  codes: ReadonlyArray<string | null | undefined>,
): number {
  let max = 0
  for (const c of codes) {
    const score = getHorecaFitScore(c)
    if (score > max) max = score
  }
  return max
}

/**
 * Categories order для UI segmentation tabs / filters.
 */
export const HORECA_CATEGORIES_ORDER: ReadonlyArray<HorecaCategory> = [
  'restaurant',
  'hotel',
  'catering',
  'wholesale',
  'retail',
  'institution',
  'recreation',
  'food_service',
  'production',
  'other',
] as const

/**
 * Polish labels для UI badges + filter chips.
 */
export const HORECA_CATEGORY_LABELS_PL: Record<HorecaCategory, string> = {
  restaurant: 'Restauracje',
  food_service: 'Obsługa gastronomiczna',
  hotel: 'Hotele',
  catering: 'Catering',
  retail: 'Sklepy detaliczne',
  wholesale: 'Hurtownie',
  institution: 'Instytucje',
  production: 'Producenci',
  recreation: 'Rekreacja',
  other: 'Inne',
}
