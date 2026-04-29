// lib/enrichment/bzp.ts
// Sprint K / Phase 2A — BZP (Biuletyn Zamówień Publicznych) integration.
//
// Endpoint: https://ezamowienia.gov.pl/mo-client-board/bzp/api/notice
// Free, no auth.
//
// Use cases:
//   1. Search by winner NIP — на demand при /api/intelligence/lookup
//      (returns historical wins for known target)
//   2. Daily monitor — bzp-monitor cron pulls new notices з last 24h,
//      filters HoReCa CPV, links by NIP до existing entities
//
// HoReCa-relevant CPV codes (food-related):
//   15xxxxxx = food/beverages
//   55xxxxxx = catering services
//   55300000 = food services
//   55400000 = catering for events

const BZP_BASE = 'https://ezamowienia.gov.pl/mo-client-board/bzp/api'
const REQUEST_TIMEOUT_MS = 30_000

/** HoReCa-relevant CPV first-2-digits prefixes. */
export const HORECA_CPV_PREFIXES = ['15', '55']

export interface BzpNotice {
  noticeId: string // 'BZP 2025/BZP-00184237'
  publicationDate: string | null
  awardDate: string | null
  subject: string | null
  contractValue: number | null
  currency: string | null
  cpvCodes: string[]
  orderingParty: {
    name: string | null
    nip: string | null
    type: string | null // 'szpital'/'gmina'/'szkoła'/'inny'
  }
  winner: {
    name: string | null
    nip: string | null
  } | null
  contractPeriod: string | null
  raw: unknown
}

interface BzpApiItem {
  noticeId?: string
  noticeType?: string
  publishingDate?: string
  awardingDate?: string
  contractAwardSection?: {
    contractAwardDate?: string
    awardedTo?: Array<{ name?: string; identifier?: string; nip?: string }>
    valueOfContractAward?: { amount?: number; currency?: string }
  }
  scopeSection?: {
    cpvCodesAdditional?: string[]
    cpvCodeMain?: string
    title?: string
  }
  contractingAuthoritySection?: {
    name?: string
    nip?: string
    type?: string
  }
  contractDuration?: string
}

function isHorecaRelevant(cpv: string[]): boolean {
  return cpv.some((code) => HORECA_CPV_PREFIXES.some((p) => code.startsWith(p)))
}

function parseBzpItem(raw: BzpApiItem): BzpNotice | null {
  const noticeId = raw.noticeId
  if (!noticeId) return null

  const cpvAll: string[] = []
  if (raw.scopeSection?.cpvCodeMain) cpvAll.push(raw.scopeSection.cpvCodeMain)
  if (Array.isArray(raw.scopeSection?.cpvCodesAdditional))
    cpvAll.push(...raw.scopeSection.cpvCodesAdditional)
  const cpv = Array.from(new Set(cpvAll.filter(Boolean)))

  const award = raw.contractAwardSection
  const winnerEntries = Array.isArray(award?.awardedTo) ? award!.awardedTo : []
  const winner = winnerEntries[0] ?? null

  return {
    noticeId,
    publicationDate: raw.publishingDate ?? null,
    awardDate: award?.contractAwardDate ?? raw.awardingDate ?? null,
    subject: raw.scopeSection?.title ?? null,
    contractValue: award?.valueOfContractAward?.amount ?? null,
    currency: award?.valueOfContractAward?.currency ?? 'PLN',
    cpvCodes: cpv,
    orderingParty: {
      name: raw.contractingAuthoritySection?.name ?? null,
      nip: raw.contractingAuthoritySection?.nip ?? null,
      type: raw.contractingAuthoritySection?.type ?? null,
    },
    winner: winner
      ? {
          name: winner.name ?? null,
          nip: winner.nip ?? winner.identifier ?? null,
        }
      : null,
    contractPeriod: raw.contractDuration ?? null,
    raw,
  }
}

/** Search BZP by winner NIP. Returns matching contract award notices. */
export async function searchBzpByWinnerNip(nip: string): Promise<BzpNotice[]> {
  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) return []

  // BZP API search params per public docs
  const url = `${BZP_BASE}/notice?winnerNip=${cleanNip}&size=50&sort=publishingDate,desc`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`BZP network: ${err instanceof Error ? err.message : err}`)
  }
  if (!res.ok) {
    throw new Error(`BZP HTTP ${res.status}`)
  }
  const data = (await res.json()) as { content?: BzpApiItem[]; items?: BzpApiItem[] }
  const items = (data.content ?? data.items ?? []) as BzpApiItem[]
  return items.map(parseBzpItem).filter((x): x is BzpNotice => x !== null)
}

/** Daily monitor — pull notices з last 24h, filter HoReCa CPV. */
export async function fetchRecentHorecaNotices(sinceHours = 24): Promise<BzpNotice[]> {
  const sinceDate = new Date(Date.now() - sinceHours * 3_600_000)
    .toISOString()
    .slice(0, 10)
  const url = `${BZP_BASE}/notice?fromDate=${sinceDate}&size=200&sort=publishingDate,desc`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`BZP network: ${err instanceof Error ? err.message : err}`)
  }
  if (!res.ok) {
    throw new Error(`BZP HTTP ${res.status}`)
  }
  const data = (await res.json()) as { content?: BzpApiItem[]; items?: BzpApiItem[] }
  const items = (data.content ?? data.items ?? []) as BzpApiItem[]
  return items
    .map(parseBzpItem)
    .filter((x): x is BzpNotice => x !== null && isHorecaRelevant(x.cpvCodes))
}
