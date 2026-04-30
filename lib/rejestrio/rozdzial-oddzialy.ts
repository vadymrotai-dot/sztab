// lib/rejestrio/rozdzial-oddzialy.ts
// Sprint S1 Phase 2 — branch offices count z KRS rozdzial 2-7.
// KOZAK z body: [] (no oddzialy). Other companies могут mieć array
// of oddzial entries.

import { rejestrioGet, RejestrioError } from './client'

export interface OddzialyResult {
  branch_offices_count: number
  raw: unknown
}

export async function fetchRozdzialOddzialy(
  apiKey: string,
  krs: string,
): Promise<OddzialyResult> {
  try {
    const raw = await rejestrioGet<unknown>(apiKey, `/org/${krs}/krs-rozdzialy/oddzialy`)
    let count = 0
    if (Array.isArray(raw)) {
      count = raw.length
    } else if (raw && typeof raw === 'object') {
      // Niektóre orgs zwracają obiekt з _obiekty zamiast array
      const obj = raw as { _obiekty?: Record<string, unknown> }
      if (obj._obiekty) count = Object.keys(obj._obiekty).length
    }
    return { branch_offices_count: count, raw }
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) {
      return { branch_offices_count: 0, raw: null }
    }
    throw err
  }
}
