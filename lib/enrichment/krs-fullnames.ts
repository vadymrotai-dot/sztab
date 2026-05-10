// lib/enrichment/krs-fullnames.ts
// Sprint S6D Day 2 (11.05.2026) — regdata/krs-fullnames-scraper.
//
// Resolves Polish KRS RODO censorship pattern "(KRS anon) PREZES ZARZĄDU 1"
// → real director names. KRS API v2 anonymizes names per RODO compliance;
// regdata actor parses public PDF KRS filings де real names ще visible.
//
// Actor: regdata/krs-fullnames-scraper
// Pricing: $5 / 1,000 firms = $0.005 per call.
// Endpoint: https://api.apify.com/v2/acts/regdata~krs-fullnames-scraper/
//   run-sync-get-dataset-items?token={APIFY_API_TOKEN}
//
// Trigger condition: persons.imie ILIKE '%KRS anon%' для client OR
// caller demand (Phase B step explicit invocation).
//
// Persistence:
//   1. UPDATE persons SET imie/nazwisko WHERE id IN (matched anon persons)
//   2. UPDATE ceidg_prospects.decision_maker_name (for prospects too)
//   3. INSERT contact_enrichment row source='regdata_krs_fullnames'
//      raw_payload = scraper output (audit trail).

const APIFY_BASE = 'https://api.apify.com/v2'
const ACTOR_ID = 'regdata~krs-fullnames-scraper'
const REQUEST_TIMEOUT_MS = 180_000
const RATE_LIMIT_PER_MIN = 30
const RATE_WINDOW_MS = 60_000
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000]
// $5 / 1k = $0.005 per firm — pricing verified у Apify Store + research v4.
const COST_PER_RESULT_USD = 0.005

const requestTimestamps: number[] = []
async function rateLimit(): Promise<void> {
  const now = Date.now()
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW_MS) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT_PER_MIN) {
    const wait = requestTimestamps[0] + RATE_WINDOW_MS - now
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait))
      return rateLimit()
    }
  }
  requestTimestamps.push(now)
}

// ─── Public types ───
export interface KrsFullnamesTarget {
  /** NIP — primary key для actor lookup. */
  nip: string
  /** Optional KRS number — actor uses this якщо provided, else falls back to NIP. */
  krs?: string | null
}

export interface KrsFullnamesPerson {
  /** Polish first name (capitalized) */
  imie: string
  /** Polish surname (capitalized) */
  nazwisko: string
  /** Role (PREZES ZARZĄDU / WICEPREZES ZARZĄDU / CZŁONEK ZARZĄDU / etc.) */
  rola: string
  /** Optional disambiguator якщо firma має multiple persons w той sam role */
  index?: number | null
}

export interface KrsFullnamesEnrichResult {
  status: 'success' | 'no_match' | 'partial' | 'error'
  persons: KrsFullnamesPerson[]
  raw_payload: unknown
  cost_usd: number
  error_message?: string
}

// ─── Apify actor response shape (defensive) ───
interface ApifyPersonRecord {
  imie?: string
  firstName?: string
  given_name?: string
  nazwisko?: string
  lastName?: string
  surname?: string
  family_name?: string
  rola?: string
  role?: string
  function?: string
  funkcja?: string
  index?: number
}
interface ApifyKrsFullnamesPayload {
  nip?: string
  krs?: string
  persons?: ApifyPersonRecord[]
  zarzad?: ApifyPersonRecord[]
  members?: ApifyPersonRecord[]
}

function normalizeRole(raw: string | undefined): string {
  if (!raw) return 'CZŁONEK ZARZĄDU'
  return raw.trim().toUpperCase()
}

function normalizePersons(payload: ApifyKrsFullnamesPayload): KrsFullnamesPerson[] {
  const candidates =
    payload.persons ?? payload.zarzad ?? payload.members ?? []
  const out: KrsFullnamesPerson[] = []
  for (const p of candidates) {
    const imie = p.imie ?? p.firstName ?? p.given_name ?? ''
    const nazwisko = p.nazwisko ?? p.lastName ?? p.surname ?? p.family_name ?? ''
    if (!imie.trim() && !nazwisko.trim()) continue
    out.push({
      imie: imie.trim(),
      nazwisko: nazwisko.trim(),
      rola: normalizeRole(p.rola ?? p.role ?? p.function ?? p.funkcja),
      index: typeof p.index === 'number' ? p.index : null,
    })
  }
  return out
}

async function callApify(
  apiKey: string,
  target: KrsFullnamesTarget,
): Promise<ApifyKrsFullnamesPayload[]> {
  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&memory=1024`
  const body = {
    // Defensive — actor може accept either NIP, KRS, або both.
    nip: target.nip,
    krs: target.krs ?? null,
    nips: [target.nip],
    krsNumbers: target.krs ? [target.krs] : [],
  }

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) {
        if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 1000))
          continue
        }
        const errBody = await res.text().catch(() => '')
        throw new Error(`KRS-fullnames HTTP ${res.status}: ${errBody.slice(0, 200)}`)
      }
      const items = (await res.json()) as ApifyKrsFullnamesPayload[]
      return Array.isArray(items) ? items : []
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES - 1) {
        const isAbort = err instanceof Error && err.name === 'TimeoutError'
        if (!isAbort) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 1000))
          continue
        }
      }
      break
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

// ─── Public entry ───
export async function enrichKrsFullnames(
  apiKey: string,
  target: KrsFullnamesTarget,
): Promise<KrsFullnamesEnrichResult> {
  if (!apiKey) return zeroResult('error', 0, 'APIFY_API_TOKEN missing')
  if (!target.nip?.trim()) return zeroResult('error', 0, 'target.nip empty')

  await rateLimit()

  let items: ApifyKrsFullnamesPayload[]
  try {
    items = await callApify(apiKey, target)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return zeroResult('error', 0, `KRS-fullnames call failed: ${msg.slice(0, 200)}`)
  }

  const cost = items.length * COST_PER_RESULT_USD
  if (items.length === 0) {
    return zeroResult('no_match', cost, undefined, { target, items: [] })
  }

  // Multiple payload entries possible (по 1 per matched firm). Take first
  // matched (NIP-precise actor — single entry expected).
  const persons = normalizePersons(items[0])
  if (persons.length === 0) {
    return zeroResult('partial', cost, 'actor returned 0 persons (PDF parse failed?)', {
      target,
      items,
    })
  }

  return {
    status: 'success',
    persons,
    raw_payload: { target, items, persons_count: persons.length },
    cost_usd: Math.round(cost * 10000) / 10000,
  }
}

function zeroResult(
  status: KrsFullnamesEnrichResult['status'],
  cost: number,
  error?: string,
  raw?: unknown,
): KrsFullnamesEnrichResult {
  return {
    status,
    persons: [],
    raw_payload: raw ?? null,
    cost_usd: Math.round(cost * 10000) / 10000,
    error_message: error,
  }
}

/** Helper: чи персона у DB виглядає anonymized (KRS RODO censorship)?
 *  Used by Phase B trigger logic. */
export function isAnonymizedPerson(imie: string | null, nazwisko: string | null): boolean {
  if (!imie || !nazwisko) return false
  if (/^\(KRS anon\)/i.test(imie)) return true
  // Pattern from KRS UI export: "L******" (single letter + asterisks)
  if (/^L\*+$/.test(nazwisko) || /^[A-Z]\*+$/.test(nazwisko)) return true
  return false
}
