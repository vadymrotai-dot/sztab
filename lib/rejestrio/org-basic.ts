// lib/rejestrio/org-basic.ts
// Sprint S1 Phase 2 — basic /org/{krs} endpoint dla rejestrio_org_id +
// employees_count if exposed (Biznes plan).

import { rejestrioGet, RejestrioError } from './client'

interface OrgBasicRaw {
  id?: number
  krs?: string
  nazwa?: string
  liczba_pracownikow?: number | null
  [k: string]: unknown
}

export interface OrgBasic {
  rejestrio_org_id: number | null
  employees_count: number | null
  raw: OrgBasicRaw
}

export async function fetchOrgBasic(apiKey: string, krs: string): Promise<OrgBasic | null> {
  try {
    const raw = await rejestrioGet<OrgBasicRaw>(apiKey, `/org/${krs}`)
    return {
      rejestrio_org_id: raw.id ?? null,
      employees_count: typeof raw.liczba_pracownikow === 'number' ? raw.liczba_pracownikow : null,
      raw,
    }
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) return null
    throw err
  }
}
