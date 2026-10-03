// lib/partner/company-display.ts — pomocnicze funkcje do czytelnego
// wyświetlania leadu bgk_companies w profilu (partner-portal i admin
// /partners/[partnerId]/[companyId]).
//
// Ważne: `zarzad` / `beneficjent_crbr` pochodzą z KRS i są PEŁNE (bez
// maskowania); `decision_person` bywa częściowo zamaskowany, gdy dotyczy
// wieloosobowego zarządu sp. z o.o. ze źródła Google Maps o niższej
// pewności dopasowania. Dla JDG (jednoosobowa działalność) `decision_person`
// to zwykle już pełne imię i nazwisko właściciela. Dlatego priorytet:
// zarzad (pełne, z KRS) > decision_person (może być zamaskowany, ale
// jedyny dostępny dla JDG).

export type NamedRole = { name: string; role?: string }

function extractRaw(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'raw' in (value as Record<string, unknown>)) {
    const raw = (value as Record<string, unknown>).raw
    return typeof raw === 'string' ? raw : null
  }
  return null
}

function parseNameList(raw: string | null): NamedRole[] {
  if (!raw) return []
  if (/nie dotyczy/i.test(raw)) return []
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
      if (m) return { name: m[1].trim(), role: m[2].trim() }
      return { name: s }
    })
}

/** Pełne (nie zamaskowane) imiona i nazwiska osób decyzyjnych / zarządu. */
export function getDecisionMakers(c: Record<string, unknown>): NamedRole[] {
  const fromZarzad = parseNameList(extractRaw(c.zarzad))
  if (fromZarzad.length > 0) return fromZarzad

  const dp = c.decision_person as string | null
  if (dp && !/nie dotyczy/i.test(dp)) {
    const m = dp.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
    if (m) return [{ name: m[1].trim(), role: m[2].trim() }]
    return [{ name: dp }]
  }
  return []
}

/** Czy decision_person wygląda na częściowo zamaskowany (inicjały + gwiazdki). */
export function isMaskedName(name: string): boolean {
  return /\*/.test(name)
}

export function getBeneficiaries(c: Record<string, unknown>): NamedRole[] {
  return parseNameList(extractRaw(c.beneficjent_crbr))
}

export function formatPln(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n) + ' zł'
}

export function formatTenure(months: unknown): string {
  const m = Number(months)
  if (!m || Number.isNaN(m)) return '—'
  const years = Math.floor(m / 12)
  const rem = m % 12
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ${years === 1 ? 'rok' : 'lata'}`)
  if (rem > 0) parts.push(`${rem} mies.`)
  return parts.length > 0 ? parts.join(' ') : '0 mies.'
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export const STATUS_LABELS: Record<string, string> = {
  new: 'Nowa',
  in_progress: 'W trakcie',
  contacted: 'Skontaktowano',
  qualified: 'Zakwalifikowana',
  rejected: 'Odrzucona',
  converted: 'Zamknięta (deal)',
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  contacted: 'bg-amber-50 text-amber-700 border-amber-200',
  qualified: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  converted: 'bg-purple-50 text-purple-700 border-purple-200',
}

export const TIER_BADGE_CLASS: Record<string, string> = {
  'Tier 1 - najcieplejszy': 'bg-orange-100 text-orange-800 border-orange-200',
  'Tier 2': 'bg-slate-100 text-slate-600 border-slate-200',
}
