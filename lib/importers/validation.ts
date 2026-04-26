// Generic field validators used across importers. Pure functions, no DB.

export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0

export const isPositiveNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

export const isNonNegativeNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0

// EAN-8 / EAN-13 / UPC — 8, 12 or 13 digits. Doesn't verify checksum
// (some Vadym exports have leading zeros lost to Excel number coercion;
// we already coerce back to string before checking).
export const isEAN = (v: unknown): boolean => {
  if (typeof v !== 'string') return false
  const t = v.trim()
  return /^\d{8}$|^\d{12,13}$/.test(t)
}

// Gramatura: '3000 g', '900 g', '500g', '1.5 kg', '5000g / ~3000g',
// '3000g / ~2000g' — we keep all of these but emit a warning if the
// shape doesn't match anything recognisable so Vadym can fix in source.
export const isLikelyGramatura = (v: unknown): boolean => {
  if (typeof v !== 'string') return false
  const t = v.trim()
  return /^[\d.,]+\s*(g|kg|ml|l)\b/i.test(t) || /\d+\s*g.*\/.*\d+\s*g/i.test(t)
}

// Coerces to number when the input is a number-looking string ('1.6',
// '1,6'), a number, or null/empty (returns null). Used for cost_eur
// columns that arrive sometimes as Excel number, sometimes as PL-locale
// string '1,6'.
export const toNumberOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const cleaned = v.trim().replace(',', '.').replace(/\s/g, '')
  if (cleaned === '') return null
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

// Coerce to trimmed string or null. Numeric inputs get .toString() so
// EANs that Excel turned into floats come back as digit strings.
export const toStringOrNull = (v: unknown): string | null => {
  if (v == null) return null
  if (typeof v === 'number')
    return Number.isInteger(v) ? v.toString() : v.toString()
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? null : t
  }
  return null
}
