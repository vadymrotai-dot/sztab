// lib/rejestrio/parsers/founded.ts
// Sprint S2A Phase 1B — derive founded_at z najstarszego _zakres.
// wpis_wprowadzajacy_data у rozdzial-ogolny entries.
//
// rozdzial-ogolny doesn't expose a top-level data_zarejestrowania field.
// First entry's _zakres.wpis_wprowadzajacy_data approximates founding date.
// KOZAK forma_prawna._zakres = "2022-06-20" — matches GUS rejestracja.

interface ZakresMeta {
  wpis_wprowadzajacy_numer?: number
  wpis_wprowadzajacy_data?: string
}

interface FieldWithZakres {
  _zakres?: ZakresMeta
  _obiekty?: Record<string, FieldWithZakres>
}

/** Recursively collect all wpis_wprowadzajacy_data values з top-level fields
 *  (and one level of _obiekty). Returns oldest (lexically smallest YYYY-MM-DD). */
export function deriveFoundedAt(rozdzialOgolny: Record<string, unknown>): string | null {
  const dates: string[] = []

  function walk(node: unknown, depth: number) {
    if (depth > 3) return // limit recursion
    if (!node || typeof node !== 'object') return
    const o = node as FieldWithZakres
    if (o._zakres?.wpis_wprowadzajacy_data) {
      dates.push(o._zakres.wpis_wprowadzajacy_data)
    }
    if (o._obiekty) {
      for (const child of Object.values(o._obiekty)) walk(child, depth + 1)
    }
  }

  for (const key of Object.keys(rozdzialOgolny)) {
    walk(rozdzialOgolny[key], 0)
  }

  if (dates.length === 0) return null
  // ISO format YYYY-MM-DD sorts lexically — smallest = oldest
  dates.sort()
  return dates[0] ?? null
}
