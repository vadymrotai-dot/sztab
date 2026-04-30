// lib/enrichment/gus.ts
// GUS BIR1.1 SOAP/XML client. Free public API, key in
// params.gus_api_key. 3-step flow:
//   1. Zaloguj(pKluczUzytkownika) → sessionId (60 min TTL)
//   2. DaneSzukajPodmioty(pParametryWyszukiwania) → basic result з REGON
//   3. DanePobierzPelnyRaport(pRegon, pNazwaRaportu) → full detail
//
// SessionId musi iść w HTTP header `sid` na requestach 2-3.
// Response używa MTOM/XOP multipart wrapper — strip envelope before parse.
// Inner result jest XML escaped jako string в `<XxxResult>` — decode +
// re-parse.

import { XMLParser } from 'fast-xml-parser'

const ENDPOINT = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc'
const UA = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36'
const NS_ACTION = 'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl'

const RATE_LIMIT_MS = 200 // 5 req/s
let lastCallAt = 0

async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastCallAt
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed))
  }
  lastCallAt = Date.now()
}

// ────────────────────────────────────────────────────────────
// Low-level SOAP call
// ────────────────────────────────────────────────────────────

async function soapCall(
  action: string,
  bodyXml: string,
  sessionId?: string,
): Promise<string> {
  await throttle()

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract" xmlns:wsa="http://www.w3.org/2005/08/addressing">
  <soap:Header>
    <wsa:To>${ENDPOINT}</wsa:To>
    <wsa:Action>${NS_ACTION}/${action}</wsa:Action>
  </soap:Header>
  <soap:Body>
    ${bodyXml}
  </soap:Body>
</soap:Envelope>`

  const headers: Record<string, string> = {
    'Content-Type': 'application/soap+xml; charset=utf-8',
    'User-Agent': UA,
  }
  if (sessionId) headers.sid = sessionId

  const startedAt = Date.now()
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: envelope,
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  const durationMs = Date.now() - startedAt

  console.log(`[GUS] ${action} HTTP ${res.status} (${durationMs}ms, ${text.length}B)`)

  if (!res.ok) {
    throw new Error(`GUS ${action} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  // Strip MTOM/XOP wrapper — extract just <Envelope>...</Envelope>
  const envMatch = text.match(/<s?:?Envelope[\s\S]*?<\/s?:?Envelope>/)
  if (!envMatch) {
    throw new Error(`GUS ${action}: no SOAP envelope in response (got ${text.slice(0, 200)})`)
  }
  return envMatch[0]
}

// ────────────────────────────────────────────────────────────
// Parsing helpers
// ────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({ removeNSPrefix: true, parseTagValue: false })

interface SoapResult {
  Envelope?: { Body?: Record<string, unknown> }
}

function parseEnvelope(xml: string): SoapResult {
  return xmlParser.parse(xml) as SoapResult
}

/** Decode HTML entities in escaped XML string (&lt; → < etc.). */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, '\r')
    .replace(/&amp;/g, '&')
}

/** Parse inner escaped XML inside `<XxxResult>` element. */
function parseInnerXml(escapedXml: string): unknown {
  const decoded = decodeEntities(escapedXml)
  return xmlParser.parse(decoded)
}

// ────────────────────────────────────────────────────────────
// Step 1: Zaloguj
// ────────────────────────────────────────────────────────────

export async function gusLogin(apiKey: string): Promise<string> {
  const xml = await soapCall(
    'Zaloguj',
    `<ns:Zaloguj><ns:pKluczUzytkownika>${apiKey}</ns:pKluczUzytkownika></ns:Zaloguj>`,
  )
  const parsed = parseEnvelope(xml)
  const sessionId = (parsed.Envelope?.Body as { ZalogujResponse?: { ZalogujResult?: string } })
    ?.ZalogujResponse?.ZalogujResult
  if (!sessionId || sessionId.length === 0) {
    throw new Error('GUS Zaloguj: empty sessionId (invalid API key?)')
  }
  return sessionId
}

// ────────────────────────────────────────────────────────────
// Step 2: DaneSzukajPodmioty (search by NIP)
// ────────────────────────────────────────────────────────────

export interface GusSearchResult {
  Regon: string
  Nip: string
  StatusNip?: string
  Nazwa: string
  Wojewodztwo?: string
  Powiat?: string
  Gmina?: string
  Miejscowosc?: string
  KodPocztowy?: string
  Ulica?: string
  NrNieruchomosci?: string
  NrLokalu?: string
  Typ?: 'F' | 'P' | 'LF' | 'LP'  // F=fizyczna, P=prawna, LF/LP=local
  SilosID?: string  // 1=osoba fizyczna, 2=type unit, 6=osoba prawna
  DataZakonczeniaDzialalnosci?: string
  MiejscowoscPoczty?: string
}

export async function gusSearch(
  sessionId: string,
  nip: string,
): Promise<GusSearchResult | null> {
  const xml = await soapCall(
    'DaneSzukajPodmioty',
    `<ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <dat:Nip>${nip}</dat:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>`,
    sessionId,
  )
  const parsed = parseEnvelope(xml)
  const resultStr = (parsed.Envelope?.Body as {
    DaneSzukajPodmiotyResponse?: { DaneSzukajPodmiotyResult?: string }
  })?.DaneSzukajPodmiotyResponse?.DaneSzukajPodmiotyResult

  if (!resultStr || typeof resultStr !== 'string') return null

  // Inner XML wrapped: <root><dane>...</dane></root>
  const inner = parseInnerXml(resultStr) as { root?: { dane?: GusSearchResult | GusSearchResult[] } }
  const dane = inner.root?.dane
  if (!dane) return null
  // Multi-result returns array; we expect 1 by NIP — take first
  return Array.isArray(dane) ? dane[0] : dane
}

// ────────────────────────────────────────────────────────────
// Step 3: DanePobierzPelnyRaport (full report by REGON)
// ────────────────────────────────────────────────────────────

export type ReportType =
  | 'BIR11OsFizycznaDaneOgolne'
  | 'BIR11OsFizycznaDzialalnoscCeidg'
  | 'BIR11OsFizycznaPkd'
  | 'BIR11OsFizycznaListaJednLokalnych'
  | 'BIR11OsPrawna'
  | 'BIR11OsPrawnaPkd'
  | 'BIR11OsPrawnaListaJednLokalnych'
  | 'BIR11OsPrawnaSpCywilnaWspolnicy'
  | 'BIR11TypPodmiotu'

/** Pick report dla SilosID. */
export function reportTypeForSilos(silosId: string | undefined): ReportType {
  if (silosId === '6') return 'BIR11OsPrawna'
  return 'BIR11OsFizycznaDaneOgolne'
}

export function pkdReportTypeForSilos(silosId: string | undefined): ReportType {
  if (silosId === '6') return 'BIR11OsPrawnaPkd'
  return 'BIR11OsFizycznaPkd'
}

export async function gusGetReport(
  sessionId: string,
  regon: string,
  reportType: ReportType,
): Promise<unknown> {
  const xml = await soapCall(
    'DanePobierzPelnyRaport',
    `<ns:DanePobierzPelnyRaport>
      <ns:pRegon>${regon}</ns:pRegon>
      <ns:pNazwaRaportu>${reportType}</ns:pNazwaRaportu>
    </ns:DanePobierzPelnyRaport>`,
    sessionId,
  )
  const parsed = parseEnvelope(xml)
  const resultStr = (parsed.Envelope?.Body as {
    DanePobierzPelnyRaportResponse?: { DanePobierzPelnyRaportResult?: string }
  })?.DanePobierzPelnyRaportResponse?.DanePobierzPelnyRaportResult

  if (!resultStr || typeof resultStr !== 'string') return null
  return parseInnerXml(resultStr)
}

// ────────────────────────────────────────────────────────────
// High-level enrichment
// ────────────────────────────────────────────────────────────

export interface GusEnrichedData {
  found: boolean
  regon: string | null
  legal_name: string | null
  status: 'active' | 'suspended' | 'liquidation' | 'deregistered' | null
  registered_date: string | null
  employee_count_range: '0' | '1-9' | '10-49' | '50-249' | '250+' | null
  pkd_codes: string[]
  pkd_main: string | null
  raw: unknown
  checked_at: string
}

/** Map GUS LiczbaPracujacych (number) to bucket. */
function bucketEmployeeCount(n: number | null): GusEnrichedData['employee_count_range'] {
  if (n === null || Number.isNaN(n)) return null
  if (n === 0) return '0'
  if (n <= 9) return '1-9'
  if (n <= 49) return '10-49'
  if (n <= 249) return '50-249'
  return '250+'
}

/** Determine status z DataZakonczeniaDzialalnosci + DataZawieszenia. */
function deriveStatus(
  search: GusSearchResult,
  report: Record<string, string | undefined>,
): GusEnrichedData['status'] {
  if (search.DataZakonczeniaDzialalnosci) return 'deregistered'
  // BIR11Os{Fizyczna,Prawna} report fields:
  // - praw_dataZawieszeniaDzialalnosci / fiz_dataZawieszeniaDzialalnosci
  const dataZaw =
    report.praw_dataZawieszeniaDzialalnosci ?? report.fiz_dataZawieszeniaDzialalnosci
  const dataWzn =
    report.praw_dataWznowieniaDzialalnosci ?? report.fiz_dataWznowieniaDzialalnosci
  if (dataZaw && !dataWzn) return 'suspended'
  return 'active'
}

export async function enrichWithGUS(
  sessionId: string,
  nip: string,
): Promise<GusEnrichedData> {
  const search = await gusSearch(sessionId, nip)
  const checkedAt = new Date().toISOString()

  if (!search) {
    return {
      found: false,
      regon: null,
      legal_name: null,
      status: null,
      registered_date: null,
      employee_count_range: null,
      pkd_codes: [],
      pkd_main: null,
      raw: { search: null, report: null, pkd: null },
      checked_at: checkedAt,
    }
  }

  const reportType = reportTypeForSilos(search.SilosID)
  const pkdReportType = pkdReportTypeForSilos(search.SilosID)

  const [report, pkdReport] = await Promise.all([
    gusGetReport(sessionId, search.Regon, reportType),
    gusGetReport(sessionId, search.Regon, pkdReportType),
  ])

  // Extract fields — report shape: { root: { dane: {...} } }
  const reportData =
    ((report as { root?: { dane?: Record<string, string> | Record<string, string>[] } })?.root
      ?.dane) ?? {}
  const reportFlat: Record<string, string | undefined> = Array.isArray(reportData)
    ? reportData[0] ?? {}
    : (reportData as Record<string, string | undefined>)

  // Employee count fields:
  //   praw_liczbaJednLokalnych (rzadko relevant)
  //   praw_pkdPodstawowyKlasaWielkosci (klasa wielkości — codes 0-3)
  //   For Os Fizyczna: not directly available; default to 1-9
  const empCountRaw =
    reportFlat.praw_liczbaPracujacych ??
    reportFlat.fiz_liczbaPracujacych ??
    null
  const empCount = empCountRaw ? Number.parseInt(empCountRaw, 10) : null
  const employee_count_range =
    bucketEmployeeCount(empCount) ??
    // Fallback dla os fizyczna: zwykle 1-9
    (search.SilosID === '1' ? '1-9' : null)

  // Registration date — verified field names from real GUS response
  const registered_date =
    reportFlat.praw_dataWpisuPodmiotuDoRegon ??
    reportFlat.fiz_dataWpisuPodmiotuDoRegon ??
    reportFlat.praw_dataPowstania ??
    reportFlat.fiz_dataPowstania ??
    null

  // PKD codes from pkd report — Sprint L Phase 1C: GUS uses BOTH naming
  // conventions. Real data inspected:
  //   • osoba prawna (sp.z o.o./S.A.): praw_pkdKod (no underscore)
  //     + praw_pkdNazwa + praw_pkdPrzewazajace ('1' = main)
  //   • osoba fizyczna (JDG): fiz_pkdKod (no underscore)
  // Earlier extractor used praw_pkd_Kod (з underscore) — WRONG. Most
  // entities had 0 PKD codes through canonical merge despite raw payload
  // having them. Now reads both shapes для backward compat.
  const pkdData =
    ((pkdReport as { root?: { dane?: Record<string, string> | Record<string, string>[] } })?.root
      ?.dane) ?? []
  const pkdArr = Array.isArray(pkdData) ? pkdData : [pkdData]
  const pkd_codes: string[] = []
  let pkd_main: string | null = null
  for (const p of pkdArr) {
    if (!p) continue
    // Try all known field names (current preferred → legacy fallback)
    const code =
      p.praw_pkdKod ??
      p.fiz_pkdKod ??
      p.praw_pkd_Kod ??
      p.fiz_pkd_Kod ??
      p.lp_pkd_Kod ??
      p.pkdKod ??
      p.kod ??
      null
    if (typeof code === 'string' && code.length > 0) {
      pkd_codes.push(code)
      // Track main PKD (Przewazajace = '1' marks the dominant code)
      const main = p.praw_pkdPrzewazajace ?? p.fiz_pkdPrzewazajace
      if (main === '1' && !pkd_main) pkd_main = code
    }
  }
  // Fallback: якщо нема marked main, take first code
  if (!pkd_main && pkd_codes.length > 0) pkd_main = pkd_codes[0] ?? null

  return {
    found: true,
    regon: search.Regon,
    legal_name: search.Nazwa,
    status: deriveStatus(search, reportFlat),
    registered_date,
    employee_count_range,
    pkd_codes,
    pkd_main,
    raw: { search, report, pkd: pkdReport },
    checked_at: checkedAt,
  }
}
