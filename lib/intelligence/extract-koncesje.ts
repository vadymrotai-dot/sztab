// lib/intelligence/extract-koncesje.ts
// Sprint S-CEIDG-DETAILS Day 1 (15.05.2026)
// Sprint S-MENU Day 3.1.2 (15.05.2026) — Format B parser + city extraction
//
// Pure function extractor: CEIDG uprawnienia[].opis → BrandAlias[].
//
// CEIDG `uprawnienia` field contains koncesje (alkohol, eventy, transport,
// pedagogical etc.). For B2B-relevant ones (alcohol licenses tied до
// gastronomy), the `opis` field captures business kind + brand name +
// address у unstructured Polish text. Two formats observed live:
//
// FORMAT A — uppercase prefix (most kebab/bar concessions):
//   "BAR KEMER KEBAB UL. MAGICZNA 6 LOK.1A, 03-289 WARSZAWA"
//   ↑ NIP 1250825446 MARCIN BOROWY (Kemer Kebab)
//
// FORMAT B — lowercase "lokal gastronomiczny" phrase з quoted brand:
//   'lokal gastronomiczny "Fabryka sushi", ul. Skarbka z Gór 15U lok. U9, 03-287 Warszawa'
//   ↑ NIP 8381175797 Dariusz Wieczorek (Fabryka Sushi)
//
// Algorithm:
//   1. Try FORMAT A: BUSINESS_KIND_RE prefix → kind + brand + address
//   2. Якщо Format A fails, try FORMAT B: LOKAL_GASTRO_RE quoted-brand pattern
//   3. Either format: extract city + postal via POSTAL_CITY_RE з address text
//   4. Dedupe by uppercase brand
//   5. Skip rows з NON_BRAND_KEYWORDS (admin licenses)

import type { CeidgUprawnienie } from '@/lib/ceidg/types'

export interface BrandAlias {
  /** Commercial brand name, UPPERCASE. "KEMER KEBAB" / "FABRYKA SUSHI". */
  brand: string
  /** Business kind. Sprint S-MENU Day 3.1.2 — extended з 'LOKAL GASTRONOMICZNY'.
   *  Format A: 'BAR', 'RESTAURACJA', 'SKLEP', 'KAWIARNIA', ...
   *  Format B: 'LOKAL GASTRONOMICZNY' (only kind observed у Format B). */
  kind: string | null
  /** Full address text. Format A: after ulica marker. Format B: after
   *  closing quote of brand. NULL якщо unable to parse. */
  address: string | null
  /** Sprint S-MENU Day 3.1.2 (15.05.2026) — extracted city name з postal code
   *  match. UPPERCASE для Format A consistency, original case for Format B.
   *  NULL якщо POSTAL_CITY_RE не matches. Day 3.1 STEP 6.6 reads це для
   *  Tavily geo targeting. */
  city?: string | null
  /** Sprint S-MENU Day 3.1.2 — extracted postal code "XX-XXX". NULL коли
   *  address не contains valid postal. */
  postal_code?: string | null
  /** Provenance: how was this alias discovered. */
  source: 'ceidg_koncesje'
}

// FORMAT A — uppercase business kind prefix. ^anchor + kind token + trailing space.
// RESTAURACJA(?:-BAR)? handles "RESTAURACJA" alone OR "RESTAURACJA-BAR" together.
// FAST\s+FOOD allows single-space or multi-space variants.
const BUSINESS_KIND_RE =
  /^(BAR|RESTAURACJA(?:-BAR)?|KAWIARNIA|PIZZERIA|SKLEP|HURTOWNIA|MARKET|KEBAB|FAST\s+FOOD|PUB|KLUB|HOTEL|PENSJONAT|CUKIERNIA|PIEKARNIA)\s+/i

// Ulica/address marker — caller uses regex.exec to get .index (split point).
// Captures marker token у group 1 для future reuse якщо потрібно.
const ULICA_RE = /\s+(UL\.|ULICA|AL\.|ALEJA|PL\.|PLAC|OS\.|OSIEDLE)\s+/i

// Sprint S-MENU Day 3.1.2 — FORMAT B regex. Catches:
//   'lokal gastronomiczny "Fabryka sushi", ul. Skarbka z Gór 15U...'
//   'lokal gastronomiczny „Smaczna Mamusia", ul. Krucza 9, 00-001 Warszawa'
//   'w lokalu gastronomicznym \'Pizzeria Tymek\', Rynek 5'
//
// Group 1 = brand text (без quotes). Generous quote-char-class covers:
//   straight " ' / curly „ " ' ' / single-typewriter
// Group 2 = remaining text (address + city) after closing quote + optional comma
const LOKAL_GASTRO_RE =
  /(?:w\s+lokalu\s+gastronomicznym|lokal\s+gastronomiczny)\s+["'„"''‚‛""′″`]([^"'„"''‚‛""′″`]+?)["'„"''‚‛""′″`](?:\s*,?\s*)(.+)$/i

// Sprint S-MENU Day 3.1.2 — postal code + city extraction. Universal — works
// for any address text containing "XX-XXX City" pattern. Case-insensitive
// to handle both "03-289 WARSZAWA" (Format A) and "03-287 Warszawa" (Format B).
const POSTAL_CITY_RE =
  /(\d{2}-\d{3})\s+([A-ZŁŚŻŹĆĘŚŁĄÓŃ][\wąęłńóśźżĄĘŁŃÓŚŹŻ\s\-]+?)(?:\s*,|\s*$)/

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

/** Sprint S-MENU Day 3.1.2 — extract postal code + city з address text.
 *  Returns null/null tuple якщо no match. */
function extractCityFromAddress(addressText: string): {
  city: string | null
  postal_code: string | null
} {
  if (!addressText) return { city: null, postal_code: null }
  const m = POSTAL_CITY_RE.exec(addressText)
  if (!m) return { city: null, postal_code: null }
  return {
    postal_code: m[1] ?? null,
    city: m[2]?.trim() ?? null,
  }
}

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
 *             city: "WARSZAWA", postal_code: "03-289",
 *             source: "ceidg_koncesje" }]
 *
 *   Input:  [{ opis: 'lokal gastronomiczny "Fabryka sushi", ul. Skarbka z Gór 15U lok. U9, 03-287 Warszawa' }]
 *   Output: [{ brand: "FABRYKA SUSHI", kind: "LOKAL GASTRONOMICZNY",
 *             address: "ul. Skarbka z Gór 15U lok. U9, 03-287 Warszawa",
 *             city: "Warszawa", postal_code: "03-287",
 *             source: "ceidg_koncesje" }]
 *
 *   Input:  [{ opis: "LICENCJA TRANSPORTOWA NR 12345" }]
 *   Output: []  (NON_BRAND_KEYWORDS skip — нема business kind prefix)
 *
 *   Multi-koncesja, same brand → 1 entry (dedupe by uppercase brand).
 */
export function extractBrandAliasesFromKoncesje(
  uprawnienia: CeidgUprawnienie[] | undefined,
): BrandAlias[] {
  if (!uprawnienia || uprawnienia.length === 0) return []

  const dedupe = new Map<string, BrandAlias>()

  for (const u of uprawnienia) {
    const opis = u.opis?.trim()
    if (!opis) continue

    // Negative guard: koncesje admin keywords — skip regardless of format
    const upperOpis = opis.toUpperCase()
    const hasNonBrand = NON_BRAND_KEYWORDS.some((kw) => upperOpis.includes(kw))
    if (hasNonBrand) continue

    let brand: string | null = null
    let kind: string | null = null
    let address: string | null = null

    // ─── FORMAT A — uppercase business kind prefix ───
    const kindMatch = BUSINESS_KIND_RE.exec(opis)
    if (kindMatch) {
      kind = kindMatch[1].toUpperCase().replace(/\s+/g, ' ')
      const afterKind = opis.slice(kindMatch[0].length)
      const ulicaMatch = ULICA_RE.exec(afterKind)
      if (ulicaMatch && typeof ulicaMatch.index === 'number') {
        brand = afterKind.slice(0, ulicaMatch.index).trim()
        const addrStart = ulicaMatch.index + ulicaMatch[0].length
        address = afterKind.slice(addrStart).trim() || null
      } else {
        brand = afterKind.trim()
        address = null
      }
    } else {
      // ─── FORMAT B — "lokal gastronomiczny '[BRAND]'" pattern ───
      // Sprint S-MENU Day 3.1.2: catches Fortuna-style koncesje where opis
      // starts з lowercase phrase + quoted brand name.
      const lokalMatch = LOKAL_GASTRO_RE.exec(opis)
      if (lokalMatch) {
        brand = lokalMatch[1].trim()
        kind = 'LOKAL GASTRONOMICZNY'
        address = lokalMatch[2]?.trim() || null
      }
    }

    if (!brand) continue
    brand = brand.toUpperCase().replace(/\s+/g, ' ')
    if (brand.length < 2) continue

    // Sprint S-MENU Day 3.1.2 — extract city + postal_code з address
    // (universal — works for both formats). Day 3.1 STEP 6.6 reads це для
    // Tavily geo-targeted query construction.
    const { city, postal_code } = address
      ? extractCityFromAddress(address)
      : { city: null, postal_code: null }

    if (!dedupe.has(brand)) {
      dedupe.set(brand, {
        brand,
        kind,
        address,
        city,
        postal_code,
        source: 'ceidg_koncesje',
      })
    }
  }

  return Array.from(dedupe.values())
}

// ─── Sprint S-MENU Day 3.1.2 — inline smoke tests ───
// Run з: pnpm exec tsx lib/intelligence/extract-koncesje.ts
// (or import у scripts/test-extract-koncesje.ts для CI integration)
//
// Verified live data 15.05.2026:
//   - Test A (MARCIN BOROWY uprawnienia[0]): real CEIDG payload
//   - Test B (Fortuna uprawnienia[0]): real CEIDG payload з direct API probe

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isMain = typeof require !== 'undefined' && require.main === module
if (isMain) {
  type CU = CeidgUprawnienie
  function run(label: string, input: CU[], expected: Partial<BrandAlias>[]): void {
    const got = extractBrandAliasesFromKoncesje(input)
    const ok = JSON.stringify(got.map((g) => ({
      brand: g.brand,
      kind: g.kind,
      city: g.city ?? null,
      postal_code: g.postal_code ?? null,
    }))) === JSON.stringify(expected.map((e) => ({
      brand: e.brand ?? null,
      kind: e.kind ?? null,
      city: e.city ?? null,
      postal_code: e.postal_code ?? null,
    })))
    console.log(`${ok ? '✓' : '✗'} ${label}`)
    if (!ok) {
      console.log('  expected:', JSON.stringify(expected, null, 2))
      console.log('  got:     ', JSON.stringify(got, null, 2))
    }
  }
  // Test A — MARCIN BOROWY format
  run(
    'Test A (Format A — BAR KEMER KEBAB)',
    [{ opis: 'BAR KEMER KEBAB UL. MAGICZNA 6 LOK.1A, 03-289 WARSZAWA' } as CU],
    [{ brand: 'KEMER KEBAB', kind: 'BAR', city: 'WARSZAWA', postal_code: '03-289' }],
  )
  // Test B — Fortuna format (real live payload)
  run(
    'Test B (Format B — lokal gastronomiczny "Fabryka sushi")',
    [{ opis: 'lokal gastronomiczny "Fabryka sushi", ul. Skarbka z Gór 15U lok. U9, 03-287 Warszawa' } as CU],
    [{ brand: 'FABRYKA SUSHI', kind: 'LOKAL GASTRONOMICZNY', city: 'Warszawa', postal_code: '03-287' }],
  )
  // Test C — dedupe multi-koncesja same brand
  run(
    'Test C (dedupe multi-koncesja same brand)',
    [
      { opis: 'lokal gastronomiczny "Fabryka sushi", ul. Skarbka z Gór 15U lok. U9, 03-287 Warszawa' } as CU,
      { opis: 'lokal gastronomiczny "Fabryka sushi", ul. Skarbka z Gór 15U lok.U9, 03-287 Warszawa' } as CU,
    ],
    [{ brand: 'FABRYKA SUSHI', kind: 'LOKAL GASTRONOMICZNY', city: 'Warszawa', postal_code: '03-287' }],
  )
  // Test D — no match (admin license text)
  run('Test D (no match — admin license)', [{ opis: 'LICENCJA TRANSPORTOWA NR 12345' } as CU], [])
  // Test E — empty input
  run('Test E (empty input)', [], [])
  // Test F — undefined safeguard
  console.log(
    extractBrandAliasesFromKoncesje(undefined).length === 0
      ? '✓ Test F (undefined input → [])'
      : '✗ Test F (undefined input)',
  )
  // Test G — Format A WITHOUT address (kind + brand only)
  run(
    'Test G (Format A — kind+brand, no address)',
    [{ opis: 'BAR PIWNICA' } as CU],
    [{ brand: 'PIWNICA', kind: 'BAR', city: null, postal_code: null }],
  )
  // Test H — curly quotes у Format B
  run(
    'Test H (Format B — curly quotes „...")',
    [{ opis: 'lokal gastronomiczny „Smaczna Mamusia", ul. Krucza 9, 00-001 Warszawa' } as CU],
    [{ brand: 'SMACZNA MAMUSIA', kind: 'LOKAL GASTRONOMICZNY', city: 'Warszawa', postal_code: '00-001' }],
  )
}
