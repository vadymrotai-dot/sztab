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
    /** All NIPs found у Wykonawca section (excluding buyer). Used дla strict
     *  post-fetch matching коли parser cannot disambiguate single winner. */
    candidates?: string[]
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

/** Extract all NIPs that appear after a Wykonawca/Wybranego oferenta header.
 *  BZP htmlBody mentions buyer NIP up top + winner NIP в секції "WYKONAWCA"
 *  (sometimes multiple дла konsorcjum). Returns set of candidate winner NIPs. */
function extractWinnerNipsFromHtml(html: string | undefined): Set<string> {
  const nips = new Set<string>()
  if (!html) return nips

  const sectionRegexes = [
    /WYKONAWC[AY][^]*?(?=ZAMAWIAJĄCY|NAGŁÓWEK|OGŁOSZENIE|$)/gi,
    /Wybran[ay][\s\S]{0,4000}?wykonawc[ay][\s\S]{0,4000}/gi,
    /Wykonawca,\s*któremu\s+udzielono\s+zamówienia[\s\S]{0,4000}/gi,
    /Dane\s+wykonawcy[\s\S]{0,4000}/gi,
  ]
  let collected = ''
  for (const re of sectionRegexes) {
    const matches = html.match(re)
    if (matches) collected += matches.join('\n')
  }
  const target = collected || html
  const nipPattern = /NIP[^0-9]{0,15}(\d{10})/g
  let m: RegExpExecArray | null
  while ((m = nipPattern.exec(target)) !== null) {
    if (m[1]) nips.add(m[1])
  }
  return nips
}

/** Try to extract winner display name (best-effort). */
function extractWinnerNameFromHtml(html: string | undefined): string | null {
  if (!html) return null
  const candidates = [
    /Nazwa\s+wykonawcy[^<]*<[^>]*>([^<]+)</i,
    /Wykonawca,\s*któremu\s+udzielono\s+zamówienia[^<]*<[^>]*>([^<]+)</i,
    /Wybran[ay]\s+wykonawc[ay][^<]*<[^>]*>([^<]+)</i,
  ]
  for (const re of candidates) {
    const m = html.match(re)
    if (m && m[1]) {
      const trimmed = m[1].trim()
      if (trimmed.length > 0 && trimmed.length < 200) return trimmed
    }
  }
  return null
}

function parseBzpItem(raw: BzpApiItem): BzpNotice | null {
  const noticeId = raw.noticeNumber ?? raw.bzpNumber
  if (!noticeId) return null
  const cpvCodes = parseCpvField(raw.cpvCode)

  let winner: BzpNotice['winner'] = null
  if (raw.noticeType === NOTICE_TYPE_AWARDED) {
    const candidateNips = extractWinnerNipsFromHtml(raw.htmlBody)
    const buyerNip = raw.organizationNationalId ?? ''
    candidateNips.delete(buyerNip)
    const winnerNip = candidateNips.size === 1 ? [...candidateNips][0]! : null
    const winnerName = extractWinnerNameFromHtml(raw.htmlBody)
    if (winnerNip || winnerName) {
      winner = { nip: winnerNip ?? null, name: winnerName ?? null, candidates: [...candidateNips] }
    } else {
      winner = { nip: null, name: null, candidates: [] }
    }
  }

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

/** Strict winner-side search.
 *  BZP API doesn't expose a winner.nip filter, so we fetch awarded notices
 *  у lookback window then post-filter those whose htmlBody Wykonawca section
 *  contains the target NIP. Returns ONLY notices where matched winner == nip
 *  (single-candidate match OR candidate list contains nip). */
export async function searchBzpByWinnerNip(
  nip: string,
  opts: { lookbackDays?: number } = {},
): Promise<BzpNotice[]> {
  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) return []

  const lookback = opts.lookbackDays ?? 365
  const fromDate = new Date(Date.now() - lookback * 86_400_000).toISOString().slice(0, 10)
  const toDate = new Date().toISOString().slice(0, 10)

  let candidates: BzpNotice[] = []
  try {
    candidates = await bzpSearch({
      noticeType: NOTICE_TYPE_AWARDED,
      fromDate,
      toDate,
      pageSize: 200,
    })
  } catch (err) {
    console.warn('[BZP] awarded search failed:', err instanceof Error ? err.message : err)
    return []
  }

  return candidates.filter((n) => {
    if (!n.winner) return false
    if (n.winner.nip === cleanNip) return true
    if (n.winner.candidates && n.winner.candidates.includes(cleanNip)) return true
    return false
  })
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
