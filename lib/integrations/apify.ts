// lib/integrations/apify.ts
// Generic Apify Actor caller + product-specific helpers (Aleo,
// Panorama Firm). Synchronous run-sync-get-dataset-items endpoint —
// blokuje server action aż actor skończy + zwróci wyniki, bez
// polowania run state. Najprostsze i działa w Vercel functions
// dopóki actor mieści się w 5 min.
//
// IMPORTANT — actor IDs (powerai~aleo-company-scraper, trev0n~
// panoramafirm-scraper) wzięte z brief Vadyma. NIE zostały
// zweryfikowane z Apify Store przy pisaniu (sandbox bez Apify
// account). Jeśli pierwszy run zwróci 404 — zaloguj się na
// apify.com/store, znajdź właściwy actor, i podmień ID poniżej
// (Apify używa "username~actor-slug" format z ~ zamiast / w URL).

const APIFY_API_BASE = 'https://api.apify.com/v2'

export interface ApifyRunInput {
  actorId: string
  input: Record<string, unknown>
  timeoutSecs?: number
}

export interface ApifyRunResult<T = unknown> {
  runId: string
  status: 'SUCCEEDED' | 'FAILED' | 'TIMEOUT'
  items: T[]
  duration_ms: number
  error?: string
}

export async function runApifyActor<T = unknown>(
  apiToken: string,
  spec: ApifyRunInput,
): Promise<ApifyRunResult<T>> {
  const startTime = Date.now()
  const url = `${APIFY_API_BASE}/acts/${spec.actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(apiToken)}`
  const timeoutMs = (spec.timeoutSecs ?? 120) * 1000

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec.input),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        runId: response.headers.get('x-apify-run-id') ?? 'unknown',
        status: 'FAILED',
        items: [],
        duration_ms: Date.now() - startTime,
        error: `Apify ${response.status}: ${errorText.slice(0, 200)}`,
      }
    }

    const data = (await response.json()) as unknown
    const items: T[] = Array.isArray(data) ? (data as T[]) : []

    return {
      runId: response.headers.get('x-apify-run-id') ?? 'unknown',
      status: 'SUCCEEDED',
      items,
      duration_ms: Date.now() - startTime,
    }
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    return {
      runId: 'failed',
      status: isAbort ? 'TIMEOUT' : 'FAILED',
      items: [],
      duration_ms: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ────────────────────────────────────────────────────────────
// Aleo (aleo.com) — polski katalog firm B2B z NIP/KRS/branża.
// Actor IDs do weryfikacji w Apify Store przed pierwszym runem.
// ────────────────────────────────────────────────────────────

export interface AleoCompany {
  name: string
  nip?: string
  krs?: string
  regon?: string
  address?: string
  city?: string
  category?: string
  website?: string
  phone?: string
  rating?: number
  url?: string
}

export async function scrapeAleo(
  apiToken: string,
  query: { keyword: string; location?: string; limit?: number },
): Promise<ApifyRunResult<AleoCompany>> {
  return runApifyActor<AleoCompany>(apiToken, {
    // VERIFY BEFORE FIRST RUN — exact ID może być inny w Apify Store.
    actorId: 'powerai~aleo-company-scraper',
    input: {
      searchQuery: query.keyword,
      location: query.location ?? 'Mazowieckie',
      maxItems: query.limit ?? 50,
    },
    timeoutSecs: 180,
  })
}

// ────────────────────────────────────────────────────────────
// Panorama Firm (panoramafirm.pl) — polski katalog z lepszą
// pokryciem małych lokalnych firm + email/phone gdy podane.
// ────────────────────────────────────────────────────────────

export interface PanoramaFirmCompany {
  name: string
  nip?: string
  regon?: string
  category?: string
  subcategory?: string
  description?: string
  address?: string
  street?: string
  city?: string
  postalCode?: string
  voivodeship?: string
  phone?: string
  email?: string
  website?: string
  openingHours?: string
}

export async function scrapePanoramaFirm(
  apiToken: string,
  query: {
    keyword: string
    city: string
    limit?: number
    extractDetails?: boolean
  },
): Promise<ApifyRunResult<PanoramaFirmCompany>> {
  return runApifyActor<PanoramaFirmCompany>(apiToken, {
    // VERIFY BEFORE FIRST RUN — exact ID do potwierdzenia.
    actorId: 'trev0n~panoramafirm-scraper',
    input: {
      keyword: query.keyword,
      city: query.city,
      maxItems: query.limit ?? 50,
      extractDetails: query.extractDetails ?? true,
    },
    timeoutSecs: 300,
  })
}
