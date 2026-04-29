// lib/enrichment/bzp.ts
// Sprint L Phase 1B — BZP API endpoint fix.
//
// Working endpoint discovered: https://ezamowienia.gov.pl/mo-board/api/v1/notice
// Free, no auth (public). Earlier mo-client-board path returned SPA HTML —
// that's the frontend, not API.
//
// Required params per validation errors:
//   PageSize           (>0)
//   NoticeType         (enum: ContractNotice|TenderResultNotice|ContractPerformingNotice)
//   PublicationDateFrom + PublicationDateTo
//
// Filter `OrderingNip` (orderingParty) recognized; winnerNip filter ignored
// at API level — winner data is inside htmlBody (HTML notice text). Winner
// matching by NIP requires app-side htmlBody parsing.
//
// Returned shape (per real response):
//   { noticeNumber, bzpNumber, publicationDate, orderObject, cpvCode,
//     organizationName, organizationCity, organizationProvince,
//     organizationNationalId (= ordering party NIP), htmlBody, ... }

const BZP_BASE = 'https://ezamowienia.gov.pl/mo-board/api/v1'
const REQUEST_TIMEOUT_MS = 30_000
const UA = 'Mozilla/5.0 (Sztab/1.0; +mailto:vadymrotai@gmail.com)'

/** HoReCa-relevant CPV first-2-digits prefixes. */
export const HORECA_CPV_PREFIXES = ['15', '55']

export interface BzpNotice {
  noticeId: string
  publicationDate: string | null
  awardDate: string | null
  subject: string | null
  contractValue: number | null
  currency: string | null
  cpvCodes: string[]
  orderingParty: {
    name: string | null
    nip: string | null
    type: string | null
  }
  winner: {
    name: string | null
    nip: string | null
  } | null
  contractPeriod: string | null
  raw: unknown
}

interface BzpApiItem {
  noticeNumber?: string
  bzpNumber?: string
  noticeType?: string
  publicationDate?: string
  submittingOffersDate?: string | null
  procedureResult?: string | null
  orderObject?: string
  cpvCode?: string
  organizationName?: string
  organizationCity?: string
  organizationProvince?: string
  organizationCountry?: string
  organizationNationalId?: string
  organizationId?: string
  tenderId?: string
  htmlBody?: string
  isTenderAmountBelowEU?: boolean
  clientType?: string
  orderType?: string
  tenderType?: string
}

const NOTICE_TYPE_AWARDED = 'TenderResultNotice'
const NOTICE_TYPE_ANNOUNCEMENT = 'ContractNotice'

function isHorecaRelevant(cpv: string[]): boolean {
  return cpv.some((code) => HORECA_CPV_PREFIXES.some((p) => code.startsWith(p)))
}

/** Parse "45233140-2 (Roboty drogowe)" → just "45233140-2" */
function parseCpvField(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .map((s) => {
      const m = s.match(/^([\d-]+)/)
      return m && m[1] ? m[1] : s
    })
    .filter(Boolean)
}

/** Naive winner extraction from htmlBody (sufficient для POC; refine later). */
function extractWinnerFromHtml(html: string | undefined): { name: string | null; nip: string | null } | null {
  if (!html) return null
  const winnerNameMatch = html.match(/(?:Wykonawca|Nazwa wykonawcy)[^<]*<[^>]*>([^<]+)</i)
  const nipMatch = html.match(/NIP[^0-9]{0,10}(\d{10})/)
  const name = winnerNameMatch && winnerNameMatch[1] ? winnerNameMatch[1].trim() : null
  const nip = nipMatch && nipMatch[1] ? nipMatch[1] : null
  if (!name && !nip) return null
  return { name: name ?? null, nip: nip ?? null }
}

function parseBzpItem(raw: BzpApiItem): BzpNotice | null {
  const noticeId = raw.noticeNumber ?? raw.bzpNumber
  if (!noticeId) return null
  const cpvCodes = parseCpvField(raw.cpvCode)
  const winner = raw.noticeType === NOTICE_TYPE_AWARDED ? extractWinnerFromHtml(raw.htmlBody) : null
  return {
    noticeId,
    publicationDate: raw.publicationDate ?? null,
    awardDate: raw.noticeType === NOTICE_TYPE_AWARDED ? raw.publicationDate ?? null : null,
    subject: raw.orderObject ?? null,
    contractValue: null,
    currency: 'PLN',
    cpvCodes,
    orderingParty: {
      name: raw.organizationName ?? null,
      nip: raw.organizationNationalId ?? null,
      type: raw.clientType ?? null,
    },
    winner,
    contractPeriod: null,
    raw,
  }
}

interface SearchOpts {
  noticeType?: string
  fromDate?: string
  toDate?: string
  orderingNip?: string
  cpvCode?: string
  pageSize?: number
}

async function bzpSearch(opts: SearchOpts): Promise<BzpNotice[]> {
  const params = new URLSearchParams({
    PageSize: String(opts.pageSize ?? 50),
    NoticeType: opts.noticeType ?? NOTICE_TYPE_AWARDED,
    PublicationDateFrom: opts.fromDate ?? defaultFromDate(),
    PublicationDateTo: opts.toDate ?? defaultToDate(),
  })
  if (opts.orderingNip) params.set('OrderingNip', opts.orderingNip)
  if (opts.cpvCode) params.set('CpvCode', opts.cpvCode)

  const url = `${BZP_BASE}/notice?${params.toString()}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`BZP network: ${err instanceof Error ? err.message : err}`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`BZP HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const items = (await res.json()) as BzpApiItem[]
  return (items ?? []).map(parseBzpItem).filter((x): x is BzpNotice => x !== null)
}

function defaultFromDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}
function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function searchBzpByWinnerNip(nip: string): Promise<BzpNotice[]> {
  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) return []
  // Try OrderingNip — for buyer-side (hospitals/schools/gov)
  try {
    return await bzpSearch({
      noticeType: NOTICE_TYPE_AWARDED,
      orderingNip: cleanNip,
      pageSize: 100,
    })
  } catch (err) {
    console.warn('[BZP] OrderingNip search failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function fetchRecentHorecaNotices(sinceHours = 24): Promise<BzpNotice[]> {
  const sinceDate = new Date(Date.now() - sinceHours * 3_600_000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const notices = await bzpSearch({
    noticeType: NOTICE_TYPE_AWARDED,
    fromDate: sinceDate,
    toDate: today,
    pageSize: 200,
  })
  return notices.filter((n) => isHorecaRelevant(n.cpvCodes))
}

export async function searchBzpByOrderingNip(nip: string): Promise<BzpNotice[]> {
  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) return []
  return bzpSearch({
    noticeType: NOTICE_TYPE_ANNOUNCEMENT,
    orderingNip: cleanNip,
    pageSize: 100,
  })
}
