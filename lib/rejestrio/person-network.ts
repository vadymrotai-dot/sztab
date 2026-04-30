// lib/rejestrio/person-network.ts
// Sprint S1 Phase 2 — fetch /osoby/{id}/krs-powiazania → person_network_links.

import { rejestrioGet, RejestrioError } from './client'

interface PowiazanieRaw {
  id?: number
  nazwa?: string
  krs_powiazania_kwerendowane?: Array<{
    typ?: string
    opis?: string | null
    kierunek?: string
    data_start?: string | null
    data_koniec?: string | null
  }>
  krs?: string | number
}

export interface PersonNetworkLink {
  linked_krs: string | null
  linked_company_name: string | null
  relation_type: string | null
  relation_kierunek: 'AKTYWNY' | 'PASYWNY' | null
  data_start: string | null
  data_koniec: string | null
}

export async function fetchPersonNetwork(
  apiKey: string,
  personId: number | string,
): Promise<PersonNetworkLink[]> {
  try {
    const raw = await rejestrioGet<PowiazanieRaw[]>(
      apiKey,
      `/osoby/${personId}/krs-powiazania?aktualnosc=aktualne`,
    )
    if (!Array.isArray(raw)) return []
    const out: PersonNetworkLink[] = []
    for (const org of raw) {
      const linkedKrs = org.krs ? String(org.krs).padStart(10, '0') : null
      const linkedName = org.nazwa ?? null
      const relations = org.krs_powiazania_kwerendowane ?? []
      for (const rel of relations) {
        const kierunek = rel.kierunek === 'AKTYWNY' || rel.kierunek === 'PASYWNY' ? rel.kierunek : null
        out.push({
          linked_krs: linkedKrs,
          linked_company_name: linkedName,
          relation_type: rel.typ ?? rel.opis ?? null,
          relation_kierunek: kierunek,
          data_start: rel.data_start ?? null,
          data_koniec: rel.data_koniec ?? null,
        })
      }
    }
    return out
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) return []
    throw err
  }
}
