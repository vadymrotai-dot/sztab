// lib/intelligence/extract-koncesje.ts
// Sprint S-CEIDG-DETAILS Day 1 (15.05.2026)
//
// Pure function extractor: CEIDG uprawnienia[].opis → BrandAlias[].
//
// CEIDG `uprawnienia` field contains koncesje (alkohol, eventy, transport,
// pedagogical etc.). For B2B-relevant ones (alcohol licenses tied до
// gastronomy), the `opis` field captures business kind + brand name +
// address у unstructured Polish text. Example real payload (NIP 1250825446
// — HANDEL,GASTRONOMIA,TRANSPORT - MARCIN BOROWY):
//
//   uprawnienia[0].opis = "BAR KEMER KEBAB UL. MAGICZNA 6 LOK.1A, 03-289 WARSZAWA"
//
// Registry name "MARCIN BOROWY" tells us NOTHING. opis tells us EVERYTHING:
// it's a kebab bar at MAGICZNA 6, Warszawa Białołęka. This is the source
// that closes JDG↔brand loops для majority gastronomy concessions.
//
// Algorithm (split-based, not single mega-regex):
//   1. Match BUSINESS_KIND_RE prefix → extract kind + slice
//   2. У remainder, find ULICA_RE marker → split brand (before) + address (after)
//   3. Якщо немає ULICA marker → brand = whole remainder, address = null
//   4. Skip коли brand < 2 chars OR opis contains NON_BRAND_KEYWORDS

import type { CeidgUprawnienie } from '@/lib/ceidg/types'

export interface BrandAlias {
  /** Commercial brand name, UPPERCASE. "KEMER KEBAB". */
  brand: string
  /** Business kind. "BAR", "RESTAURACJA-BAR", "SKLEP", "HOTEL", etc. */
  kind: string | null
  /** Full address text after ulica marker, до end of opis. Includes postal
   *  code + city коли present. NULL якщо opis не contains ulica marker. */
  address: string | null
  /** Provenance: how was this alias discovered. */
  source: 'ceidg_koncesje'
}

// Business kind prefix. ^anchor + kind token + trailing space.
// RESTAURACJA(?:-BAR)? handles "RESTAURACJA" alone OR "RESTAURACJA-BAR" together.
// FAST\s+FOOD allows single-space or multi-space variants.
const BUSINESS_KIND_RE =
  /^(BAR|RESTAURACJA(?:-BAR)?|KAWIARNIA|PIZZERIA|SKLEP|HURTOWNIA|MARKET|KEBAB|FAST\s+FOOD|PUB|KLUB|HOTEL|PENSJONAT|CUKIERNIA|PIEKARNIA)\s+/i

// Ulica/address marker — caller uses regex.exec to get .index (split point).
// Captures marker token у group 1 для future reuse якщо потрібно.
const ULICA_RE = /\s+(UL\.|ULICA|AL\.|ALEJA|PL\.|PLAC|OS\.|OSIEDLE)\s+/i

// Skip uprawnienia коли opis виглядає як non-brand admin text. Used як
// negative guard (BUSINESS_KIND_RE positive match overrides — е.г. "BAR X
// licencja..." still treated as brand).
const NON_BRAND_KEYWORDS = [
  'LICENCJA TRANSPORTOWA',
  'POZWOLENIE NA',
  'UPRAWNIENIA PEDAGOGICZNE',
  'CERTYFIKAT',
  'KWALIFIKACJE ZAWODOWE',
]

/**
 * Extract brand aliases from CEIDG uprawnienia array.
 *
 * Dedupe by uppercase brand (one entry per unique brand even якщо multiple
 * koncesje rows). Empty input → []. Malformed entries silently skipped.
 *
 * SMOKE examples (verified 15.05.2026 against live CEIDG payload):
 *
 *   Input:  [{ opis: "BAR KEMER KEBAB UL. MAGICZNA 6 LOK.1A, 03-289 WARSZAWA" }]
 *   Output: [{ brand: "KEMER KEBAB", kind: "BAR",
 *             address: "MAGICZNA 6 LOK.1A, 03-289 WARSZAWA",
 *             source: "ceidg_koncesje" }]
 *
 *   Input:  [{ opis: "BAR PIWNICA" }]
 *   Output: [{ brand: "PIWNICA", kind: "BAR", address: null, source: "ceidg_koncesje" }]
 *
 *   Input:  [{ opis: "LICENCJA TRANSPORTOWA NR 12345" }]
 *   Output: []  (NON_BRAND_KEYWORDS skip — нема business kind prefix)
 *
 *   Input:  []  → []
 *   Input:  undefined → []
 *
 *   Multi-koncesja, same brand → 1 entry (dedupe).
 */
export function extractBrandAliasesFromKoncesje(
  uprawnienia: CeidgUprawnienie[] | undefined,
): BrandAlias[] {
  if (!uprawnienia || uprawnienia.length === 0) return []

  const dedupe = new Map<string, BrandAlias>()

  for (const u of uprawnienia) {
    const opis = u.opis?.trim()
    if (!opis) continue

    // STEP A — try business kind prefix
    const kindMatch = BUSINESS_KIND_RE.exec(opis)
    if (!kindMatch) {
      // No business kind → check NON_BRAND_KEYWORDS guard (defensive — admin
      // text не повинне reach далі). Якщо matches — explicit skip; інакше
      // тоже skip (no brand signal без kind prefix).
      continue
    }

    const kind = kindMatch[1].toUpperCase().replace(/\s+/g, ' ')
    const afterKind = opis.slice(kindMatch[0].length)

    // Negative guard: коли opis (full) contains admin keyword AFTER kind
    // (rare but possible) — could be misleading. У real CEIDG payload не
    // бачили цей case але defensive.
    const upperOpis = opis.toUpperCase()
    const hasNonBrand = NON_BRAND_KEYWORDS.some((kw) => upperOpis.includes(kw))
    if (hasNonBrand) continue

    // STEP B — find ulica marker (split point)
    const ulicaMatch = ULICA_RE.exec(afterKind)
    let brand: string
    let address: string | null

    if (ulicaMatch && typeof ulicaMatch.index === 'number') {
      // Brand = text before " UL. " (or similar marker)
      brand = afterKind.slice(0, ulicaMatch.index).trim()
      // Address = text after the marker (skip leading whitespace + marker)
      // ulicaMatch[0] includes "  UL. " (whitespace + marker + whitespace).
      // ulicaMatch.index points to start of leading whitespace. End =
      // index + ulicaMatch[0].length.
      const addrStart = ulicaMatch.index + ulicaMatch[0].length
      address = afterKind.slice(addrStart).trim() || null
    } else {
      // No ulica marker → brand is whole remainder, address null
      brand = afterKind.trim()
      address = null
    }

    brand = brand.toUpperCase().replace(/\s+/g, ' ')
    if (brand.length < 2) continue

    if (!dedupe.has(brand)) {
      dedupe.set(brand, { brand, kind, address, source: 'ceidg_koncesje' })
    }
  }

  return Array.from(dedupe.values())
}
