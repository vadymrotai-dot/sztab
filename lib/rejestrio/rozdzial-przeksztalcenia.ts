// lib/rejestrio/rozdzial-przeksztalcenia.ts
// Sprint S1 Phase 2 — red-flags scanner: bankruptcy / liquidation /
// restructuring. Each appears як top-level key tylko gdy aktualne.
//
// Pattern: postepowanie_upadlosciowe.ogloszenie._obiekty.{N} → bankruptcy
//          likwidacja.informacja_o_otwarciu (without zakonczenie) → liquidation
//          restrukturyzacja.otwarcie (without zakonczenie) → restructuring

import { rejestrioGet, RejestrioError } from './client'

interface PrzeksztalceniaRaw {
  postepowanie_upadlosciowe?: {
    ogloszenie?: { _obiekty?: Record<string, unknown> }
    zakonczenie?: { _obiekty?: Record<string, unknown> }
  }
  likwidacja?: {
    informacja_o_otwarciu?: { _obiekty?: Record<string, unknown> }
    informacja_o_zakonczeniu?: { _obiekty?: Record<string, unknown> }
  }
  restrukturyzacja?: {
    otwarcie?: { _obiekty?: Record<string, unknown> }
    zakonczenie?: { _obiekty?: Record<string, unknown> }
  }
  [k: string]: unknown
}

export interface RedFlags {
  bankruptcy_flag: boolean
  liquidation_flag: boolean
  restructuring_flag: boolean
  raw: PrzeksztalceniaRaw
}

function hasOpen(group: { _obiekty?: Record<string, unknown> } | undefined): boolean {
  return Boolean(group?._obiekty && Object.keys(group._obiekty).length > 0)
}

export async function fetchRozdzialPrzeksztalcenia(
  apiKey: string,
  krs: string,
): Promise<RedFlags> {
  let raw: PrzeksztalceniaRaw
  try {
    raw = await rejestrioGet<PrzeksztalceniaRaw>(
      apiKey,
      `/org/${krs}/krs-rozdzialy/przeksztalcenia`,
    )
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) {
      return { bankruptcy_flag: false, liquidation_flag: false, restructuring_flag: false, raw: {} }
    }
    throw err
  }

  // Bankruptcy: ogłoszenie present AND zakończenie absent
  const bankruptcy =
    hasOpen(raw.postepowanie_upadlosciowe?.ogloszenie) &&
    !hasOpen(raw.postepowanie_upadlosciowe?.zakonczenie)

  const liquidation =
    hasOpen(raw.likwidacja?.informacja_o_otwarciu) &&
    !hasOpen(raw.likwidacja?.informacja_o_zakonczeniu)

  const restructuring =
    hasOpen(raw.restrukturyzacja?.otwarcie) &&
    !hasOpen(raw.restrukturyzacja?.zakonczenie)

  return {
    bankruptcy_flag: bankruptcy,
    liquidation_flag: liquidation,
    restructuring_flag: restructuring,
    raw,
  }
}
