// lib/rejestrio/rozdzial-wzmianki.ts
// Sprint S1 Phase 2 — last_filing_date dla sprawozdania finansowe.

import { rejestrioGet, RejestrioError } from './client'

interface WzmiankiRaw {
  dokumenty_wzmianka_o_zlozeniu_rocznego_sprawozdania_finansowego?: {
    _obiekty?: Record<string, { _wartosc?: { data?: string; okres?: string } }>
  }
  [k: string]: unknown
}

export interface WzmiankiResult {
  last_filing_date: string | null
  raw: WzmiankiRaw
}

function parsePolishDate(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

export async function fetchRozdzialWzmianki(
  apiKey: string,
  krs: string,
): Promise<WzmiankiResult> {
  let raw: WzmiankiRaw
  try {
    raw = await rejestrioGet<WzmiankiRaw>(apiKey, `/org/${krs}/krs-rozdzialy/wzmianki`)
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) {
      return { last_filing_date: null, raw: {} }
    }
    throw err
  }

  let latest: string | null = null
  const obiekty =
    raw.dokumenty_wzmianka_o_zlozeniu_rocznego_sprawozdania_finansowego?._obiekty
  if (obiekty) {
    for (const entry of Object.values(obiekty)) {
      const date = parsePolishDate(entry?._wartosc?.data)
      if (date && (!latest || date > latest)) latest = date
    }
  }
  return { last_filing_date: latest, raw }
}
