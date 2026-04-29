// lib/enrichment/msig.ts
// Sprint L Phase 1A — rejestr.io v2 migration.
//
// v2 не має dedicated /msig endpoint, але /org/{id}/krs-wpisy дає повну
// historię KRS wpisów (kожen wpis is published у MSiG за definition).
// Wpisy include change types (zarząd/kapitał/etc.) у opis_zmian field.

import { resolveOrgIdByKrs, resolveOrgIdByNip } from './krs-financials'

const REJESTR_BASE = 'https://rejestr.io/api/v2'
const REQUEST_TIMEOUT_MS = 30_000

export interface MsigChange {
  msig_number: string | null
  publication_date: string | null
  change_type: string | null
  description: string | null
  raw: unknown
}

interface KrsWpis {
  id?: number
  data?: string
  numer_wpisu?: string
  msig?: { numer?: string; data?: string }
  opis_zmian?: string
  rodzaj_wpisu?: string
}

interface KrsWpisyResponse {
  results?: KrsWpis[]
}

function parseChangeType(opis: string): string | null {
  const o = opis.toLowerCase()
  if (o.includes('zarząd') || o.includes('prezes') || o.includes('członek')) return 'zarząd'
  if (o.includes('kapitał') || o.includes('podwyższenie') || o.includes('obniżenie'))
    return 'kapitał'
  if (o.includes('adres') || o.includes('siedziba')) return 'adres'
  if (o.includes('forma prawna') || o.includes('przekształcenie')) return 'forma'
  if (o.includes('rada nadzorcza')) return 'rada nadzorcza'
  if (o.includes('prokurent') || o.includes('prokura')) return 'prokura'
  return null
}

/** Fetch MSiG-equivalent KRS wpisy via rejestr.io v2. */
export async function fetchMsigChanges(
  apiKey: string,
  identifier: { nip?: string; krs?: string },
): Promise<MsigChange[]> {
  if (!apiKey) {
    console.warn('[msig] rejestr.io token missing — returning empty')
    return []
  }

  // Resolve org id
  let orgId: string | null = null
  try {
    if (identifier.krs) orgId = await resolveOrgIdByKrs(apiKey, identifier.krs)
    if (!orgId && identifier.nip) orgId = await resolveOrgIdByNip(apiKey, identifier.nip)
  } catch (err) {
    console.warn('[msig] org resolve failed:', err instanceof Error ? err.message : err)
    return []
  }
  if (!orgId) return []

  const url = `${REJESTR_BASE}/org/${orgId}/krs-wpisy`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Sztab/1.0; +mailto:vadymrotai@gmail.com)',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('[msig] network error:', err instanceof Error ? err.message : err)
    return []
  }
  if (res.status === 404) return []
  if (!res.ok) {
    console.error(`[msig] HTTP ${res.status}`)
    return []
  }

  const data = (await res.json()) as KrsWpisyResponse
  const items = data.results ?? []
  return items.map((r): MsigChange => ({
    msig_number: r.msig?.numer ?? r.numer_wpisu ?? null,
    publication_date: r.msig?.data ?? r.data ?? null,
    change_type: r.rodzaj_wpisu ?? (r.opis_zmian ? parseChangeType(r.opis_zmian) : null),
    description: r.opis_zmian ?? null,
    raw: r,
  }))
}
