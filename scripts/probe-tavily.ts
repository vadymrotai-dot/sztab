// scripts/probe-tavily.ts
// Sprint S6C STEP 1 (11.05.2026) — diagnostic probe Tavily API проти SOLERA NIP.
//
// Goal: capture raw HTTP response (status, body, headers, timing) для 2
// queries. Validate чи Tavily реально повертає [] для SOLERA, чи API key
// expired, чи rate limit hit.
//
// Pattern reference: scripts/sprint-m-rejestrio-probe.ts
//
// Usage (Vadym у PowerShell):
//   pnpm dlx tsx scripts/probe-tavily.ts
//
// Reads TAVILY_API_KEY з:
//   1. process.env.TAVILY_API_KEY (set explicit у PowerShell)
//   2. params.tavily_api_key (DB fallback via management SQL)

import '@/lib/env'

import { executeManagementSQL } from '@/lib/supabase/management'

const TAVILY_BASE = 'https://api.tavily.com'

const SOLERA_NAME = 'SOLERA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ'
const SOLERA_NIP = '5262870489'

async function getApiKey(): Promise<string> {
  // Try env first
  const envKey = process.env.TAVILY_API_KEY
  if (envKey?.length) {
    console.log('  source: process.env.TAVILY_API_KEY')
    return envKey
  }
  // Fallback: params table
  const r = await executeManagementSQL(
    `SELECT tavily_api_key FROM params LIMIT 1;`,
  )
  const row = r.rows?.[0] as { tavily_api_key?: string } | undefined
  if (!row?.tavily_api_key) {
    throw new Error(
      'TAVILY_API_KEY missing у env AND params.tavily_api_key — set один з них',
    )
  }
  console.log('  source: params.tavily_api_key (DB)')
  return row.tavily_api_key
}

interface ProbeResult {
  query: string
  http_status: number
  duration_ms: number
  request_body: unknown
  response_headers: Record<string, string>
  response_body: unknown
  results_count: number
  error: string | null
}

async function probe(label: string, apiKey: string, query: string): Promise<ProbeResult> {
  console.log(`\n━━━ ${label} ━━━`)
  console.log(`Query: "${query}"`)

  const requestBody = {
    api_key: apiKey,
    query,
    search_depth: 'basic',
    max_results: 6,
    include_answer: false,
    country: 'pl',
  }

  const t0 = Date.now()
  const result: ProbeResult = {
    query,
    http_status: 0,
    duration_ms: 0,
    request_body: { ...requestBody, api_key: '<redacted>' },
    response_headers: {},
    response_body: null,
    results_count: 0,
    error: null,
  }

  try {
    const res = await fetch(`${TAVILY_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000),
    })

    result.duration_ms = Date.now() - t0
    result.http_status = res.status

    // Capture relevant headers
    const headerKeys = [
      'content-type',
      'x-ratelimit-remaining',
      'x-ratelimit-limit',
      'x-ratelimit-reset',
      'x-request-id',
      'retry-after',
    ]
    for (const k of headerKeys) {
      const v = res.headers.get(k)
      if (v) result.response_headers[k] = v
    }

    // Body (try JSON, fallback raw text)
    const bodyText = await res.text()
    try {
      result.response_body = JSON.parse(bodyText)
    } catch {
      result.response_body = bodyText.slice(0, 1000) // truncate raw text
    }

    if (res.ok && typeof result.response_body === 'object' && result.response_body !== null) {
      const body = result.response_body as { results?: unknown[] }
      result.results_count = Array.isArray(body.results) ? body.results.length : 0
    } else if (!res.ok) {
      result.error = `HTTP ${res.status}: ${bodyText.slice(0, 200)}`
    }
  } catch (err) {
    result.duration_ms = Date.now() - t0
    result.error = err instanceof Error ? err.message : String(err)
  }

  // Print summary
  console.log(`HTTP status: ${result.http_status}`)
  console.log(`Duration:    ${result.duration_ms}ms`)
  console.log(`Headers:     ${JSON.stringify(result.response_headers, null, 2)}`)
  console.log(`Results:     ${result.results_count} items`)
  if (result.error) {
    console.log(`Error:       ${result.error}`)
  } else {
    console.log(`Body (truncated):`)
    console.log(JSON.stringify(result.response_body, null, 2).slice(0, 2000))
    if (JSON.stringify(result.response_body).length > 2000) {
      console.log('  ... (truncated)')
    }
  }

  return result
}

async function main(): Promise<void> {
  console.log('🔍 Tavily diagnostic probe — Sprint S6C STEP 1')
  console.log(`Target: SOLERA Sp. z o.o. (NIP ${SOLERA_NIP})\n`)

  console.log('Resolving API key...')
  const apiKey = await getApiKey()
  console.log(`  key length: ${apiKey.length} chars (last 4: ...${apiKey.slice(-4)})\n`)

  const results: ProbeResult[] = []

  // Q_a: name + NIP (existing default)
  results.push(
    await probe(
      'Q_a: name + NIP (existing default — used у searchCompanyOnline)',
      apiKey,
      `"${SOLERA_NAME}" ${SOLERA_NIP}`,
    ),
  )

  // Q_b: NIP only
  results.push(
    await probe(
      'Q_b: NIP-only',
      apiKey,
      `${SOLERA_NIP} NIP`,
    ),
  )

  // Q_c: short name + business context (existing alternative)
  results.push(
    await probe(
      'Q_c: name + business hint',
      apiKey,
      `"${SOLERA_NAME}" sklep OR sieć OR firma`,
    ),
  )

  // Q_d: short name only — strip suffix
  const shortName = SOLERA_NAME.replace(
    /\s+SP[ÓO]ŁKA\s+Z\s+OGRANICZON[AĄ]\s+ODPOWIEDZIALNOŚCI[AĄ]?$/i,
    '',
  ).trim()
  results.push(
    await probe(
      `Q_d: short name only ("${shortName}")`,
      apiKey,
      shortName,
    ),
  )

  // ─── Summary ───
  console.log('\n══════ SUMMARY ══════')
  console.log(`Probes:           ${results.length}`)
  const okCount = results.filter((r) => r.http_status === 200 && !r.error).length
  console.log(`HTTP 200 OK:      ${okCount}/${results.length}`)
  const totalResults = results.reduce((s, r) => s + r.results_count, 0)
  console.log(`Total items:      ${totalResults}`)
  const totalDuration = results.reduce((s, r) => s + r.duration_ms, 0)
  console.log(`Total duration:   ${totalDuration}ms`)
  console.log(`Errors:           ${results.filter((r) => r.error).length}`)

  // Diagnose pattern
  console.log('\n══════ DIAGNOSIS ══════')
  if (results.every((r) => r.http_status === 401 || r.http_status === 403)) {
    console.log('❌ ALL queries returned 401/403 — API key invalid/expired')
    console.log('   Fix: rotate TAVILY_API_KEY у /settings → params.tavily_api_key')
  } else if (results.some((r) => r.http_status === 429)) {
    console.log('⚠️  Rate limit hit (429)')
    console.log(
      '   Fix: backoff + retry, OR upgrade Tavily plan (current: probably free tier)',
    )
  } else if (totalResults === 0 && okCount === results.length) {
    console.log('⚠️  ALL queries succeeded (HTTP 200) AЛЕ повернулися 0 items.')
    console.log(
      '   Tavily реально не has SOLERA indexed — це не code bug. Реальний gap:',
    )
    console.log('   → SOLERA може не have web presence indexed by Tavily crawl.')
    console.log('   → Або queries занадто specific. Try Q_d (short name) — найвища шанса.')
    console.log('   → Fix: error visibility у raw_payload + status="partial" замість "success"')
  } else if (totalResults > 0) {
    console.log(`✅ Tavily працює — ${totalResults} items returned across ${okCount} successful queries.`)
    console.log(
      '   Якщо Phase B SOLERA bачив раніше "0 results" — підтвердьте query/timing race.',
    )
  } else {
    console.log('❓ Mixed results — paste output до Cowork chat для analysis.')
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
