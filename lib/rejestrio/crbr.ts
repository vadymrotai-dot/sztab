// lib/rejestrio/crbr.ts
// Sprint S1 Phase 2 — beneficjenci rzeczywiści.

import { rejestrioGet, RejestrioError } from './client'

interface CrbrEntryRaw {
  id?: string | number
  kody_krajow_obywatelstwa?: string[]
  kod_kraju_rezydencji?: string
  tozsamosc?: { imie?: string; nazwisko?: string; data_urodzenia?: string }
  rola?: string
  typ?: string
}

export interface CrbrBeneficiary {
  rejestrio_person_id: number | null
  imie: string | null
  nazwisko: string | null
  kraj_rezydencji: string | null
  obywatelstwa: string[]
  rola: string | null
}

export async function fetchCrbr(apiKey: string, krs: string): Promise<CrbrBeneficiary[]> {
  try {
    const raw = await rejestrioGet<CrbrEntryRaw[]>(apiKey, `/org/${krs}/crbr`)
    if (!Array.isArray(raw)) return []
    return raw.map((e) => ({
      rejestrio_person_id: e.id ? Number(e.id) : null,
      imie: e.tozsamosc?.imie ?? null,
      nazwisko: e.tozsamosc?.nazwisko ?? null,
      kraj_rezydencji: e.kod_kraju_rezydencji ?? null,
      obywatelstwa: e.kody_krajow_obywatelstwa ?? [],
      rola: e.rola ?? null,
    }))
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) return []
    throw err
  }
}
