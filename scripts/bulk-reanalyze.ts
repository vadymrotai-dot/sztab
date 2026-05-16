#!/usr/bin/env tsx
// scripts/bulk-reanalyze.ts
// Sprint S-MENU Day 4.1 (16.05.2026) — bulk Pełna re-analiza для clients
// без brand_aliases / website. Mass-validates Sprint S-MENU pipeline coverage.
//
// Use case: 47 gastronomy clients без website після Day 3.1.3 deploy.
// Sprint S-MENU verified 3/3 cases end-to-end (Fortuna 100 dishes, MARCIN 65,
// DEKOB), але mass coverage measurement pending. Script triggers Phase B
// re-analiza serial з 8s sleep between requests.
//
// Auth: requires SZTAB_SESSION_COOKIE env var (paste from Chrome DevTools).
// Cookie expires ~7 days. NOT bypassing production auth (no service-role
// header), maintains security boundary.
//
// CLI:
//   pnpm exec tsx scripts/bulk-reanalyze.ts --dry --limit=10           # preview
//   pnpm exec tsx scripts/bulk-reanalyze.ts --limit=10                 # actual batch
//   pnpm exec tsx scripts/bulk-reanalyze.ts --client-type=hurtownia    # different type
//   pnpm exec tsx scripts/bulk-reanalyze.ts --where=brand-aliases-empty --limit=20
//   pnpm exec tsx scripts/bulk-reanalyze.ts --sleep-ms=5000             # faster
//
// Cost projection: ~$0.03-0.05 per Phase B run × 47 candidates = $1.50-2.50 total.
// Wall-clock: 47 × (60s Phase B + 8s sleep) ≈ 53 min serial.
// Apify 402 (billing exhausted) gracefully logged, batch continues.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_LIMIT = 50
const DEFAULT_SLEEP_MS = 8_000
const REQUEST_TIMEOUT_MS = 130_000 // Phase A returns ~10-30s; Phase B fire-and-forget
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.SZTAB_BASE_URL ||
  'https://sztab.vercel.app'

interface CandidateRow {
  id: string
  nip: string | null
  title: string
  website: string | null
  brand_aliases: unknown
  business_profile: { client_type?: string } | null
}

interface BatchStats {
  total: number
  success: number
  http_401: number
  http_402_apify: number
  http_timeout: number
  http_other_error: number
  no_nip: number
  errors: Array<{ id: string; nip: string | null; status: number; message: string }>
}

async function loadDeltaStats(
  supabase: ReturnType<typeof createClient>,
  beforeIds: Set<string>,
): Promise<{ with_brand_aliases: number; with_website: number; with_menu: number }> {
  // Re-query candidates після batch — count how many gained brand_aliases/website/menu
  const { data } = await supabase
    .from('clients')
    .select('id, website, brand_aliases')
    .in('id', Array.from(beforeIds))
  const rows = (data ?? []) as Array<{ id: string; website: string | null; brand_aliases: unknown }>
  let withBrand = 0
  let withWebsite = 0
  for (const r of rows) {
    if (r.website) withWebsite += 1
    const ba = Array.isArray(r.brand_aliases) ? r.brand_aliases : []
    if (ba.length > 0) withBrand += 1
  }
  // Menu count — query contact_enrichment for any successful menu row
  const { data: menuRows } = await supabase
    .from('contact_enrichment')
    .select('target_id, source, status')
    .in('target_id', Array.from(beforeIds))
    .in('source', ['restaumatic_menu', 'www_menu', 'wedo_pdf_menu', 'wolt_menu'])
    .eq('status', 'success')
  const menuClients = new Set((menuRows ?? []).map((r) => (r as { target_id: string }).target_id))
  return {
    with_brand_aliases: withBrand,
    with_website: withWebsite,
    with_menu: menuClients.size,
  }
}

async function reanalyzeOne(
  cookie: string,
  nip: string,
  timeoutMs: number,
): Promise<{ status: number; body: string; success: boolean; durationMs: number }> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${BASE_URL}/api/intelligence/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ nip }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await res.text().catch(() => '')
    return {
      status: res.status,
      body: body.slice(0, 500),
      success: res.ok,
      durationMs: Date.now() - t0,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      status: 0,
      body: `network/timeout: ${msg}`,
      success: false,
      durationMs: Date.now() - t0,
    }
  }
}

function categorizeError(status: number, body: string): keyof BatchStats {
  if (status === 401 || status === 403) return 'http_401'
  if (status === 402 || body.toLowerCase().includes('apify') && body.includes('402')) return 'http_402_apify'
  if (body.toLowerCase().includes('apify') && body.toLowerCase().includes('402')) return 'http_402_apify'
  if (status === 0) return 'http_timeout'
  return 'http_other_error'
}

async function main() {
  const args = process.argv.slice(2)
  const isDry = args.includes('--dry')

  function arg(name: string, def?: string): string | undefined {
    const idx = args.indexOf(`--${name}`)
    if (idx >= 0 && args[idx + 1]) return args[idx + 1]
    const eq = args.find((a) => a.startsWith(`--${name}=`))
    if (eq) return eq.slice(`--${name}=`.length)
    return def
  }

  const clientType = arg('client-type', 'gastronomia')
  const whereMode = arg('where', 'no-website')
  const limitStr = arg('limit', String(DEFAULT_LIMIT))
  const sleepStr = arg('sleep-ms', String(DEFAULT_SLEEP_MS))
  const limit = parseInt(limitStr ?? String(DEFAULT_LIMIT), 10)
  const sleepMs = parseInt(sleepStr ?? String(DEFAULT_SLEEP_MS), 10)

  console.log('Sprint S-MENU Day 4.1 — bulk re-analyze gastronomy coverage')
  console.log(
    `Mode: ${isDry ? 'DRY (no API calls)' : 'WRITE'}  Filter: client_type=${clientType}, where=${whereMode}  Limit: ${limit}  Sleep: ${sleepMs}ms`,
  )
  console.log(`Base URL: ${BASE_URL}`)

  // Auth validation — required for non-dry mode
  const cookie = process.env.SZTAB_SESSION_COOKIE ?? ''
  if (!isDry && !cookie) {
    console.error(
      '\nERROR: SZTAB_SESSION_COOKIE env var missing. Paste з .env.local:\n' +
        '  SZTAB_SESSION_COOKIE="ab12cd34..."\n' +
        'Get cookie value via Chrome DevTools → Application → Cookies → sztab.vercel.app → "__Secure-next-auth.session-token" (or similar Supabase auth cookie).\n' +
        'Cookie expires ~7 days. --dry mode bypasses це check.\n',
    )
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Server-side fetch + client-side filter (PostgREST jsonb-eq gotcha from Day 3.1.2)
  const { data: rawRows, error: selErr } = await supabase
    .from('clients')
    .select('id, nip, title, website, brand_aliases, business_profile')
    .filter('business_profile->>client_type', 'eq', clientType ?? 'gastronomia')
    .limit(500)
  if (selErr) {
    console.error('Candidates fetch failed:', selErr.message)
    process.exit(1)
  }
  const all = (rawRows ?? []) as unknown as CandidateRow[]

  // Apply --where filter client-side
  const filtered = all.filter((c) => {
    if (whereMode === 'no-website') return !c.website
    if (whereMode === 'brand-aliases-empty') {
      return !Array.isArray(c.brand_aliases) || c.brand_aliases.length === 0
    }
    if (whereMode === 'no-website-and-no-brand') {
      const baEmpty = !Array.isArray(c.brand_aliases) || c.brand_aliases.length === 0
      return !c.website && baEmpty
    }
    return true // unknown filter = all
  })

  // Filter: only candidates з NIP (lookup requires NIP)
  const withNip = filtered.filter((c) => c.nip && c.nip.length >= 9)
  const skippedNoNip = filtered.length - withNip.length

  const list = withNip.slice(0, Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT)

  console.log(
    `\nCandidates: ${all.length} of client_type=${clientType}, ${filtered.length} matched --where, ${withNip.length} з NIP, ${list.length} after limit. Skipped (no NIP): ${skippedNoNip}.\n`,
  )
  if (list.length === 0) {
    console.log('No candidates. Exiting.')
    return
  }

  if (isDry) {
    console.log(`=== DRY RUN preview (${list.length} candidates) ===`)
    for (const c of list) {
      const ba_count = Array.isArray(c.brand_aliases) ? c.brand_aliases.length : 0
      console.log(
        `  ${c.nip}  ${(c.title || '').slice(0, 50).padEnd(50)} | brand_aliases=${ba_count}  website=${c.website ?? '(null)'}`,
      )
    }
    console.log(
      `\nDRY mode. To actually re-analyze: pnpm exec tsx scripts/bulk-reanalyze.ts --limit=${list.length}`,
    )
    return
  }

  // Snapshot IDs для post-batch delta query
  const beforeIds = new Set(list.map((c) => c.id))

  // Pre-batch baseline stats
  const baseline = await loadDeltaStats(supabase, beforeIds)
  console.log(
    `Baseline (before batch): brand_aliases=${baseline.with_brand_aliases}, website=${baseline.with_website}, menu=${baseline.with_menu}\n`,
  )

  // Execute batch
  const stats: BatchStats = {
    total: 0,
    success: 0,
    http_401: 0,
    http_402_apify: 0,
    http_timeout: 0,
    http_other_error: 0,
    no_nip: 0,
    errors: [],
  }

  for (const c of list) {
    stats.total += 1
    const idx = stats.total
    const titleShort = (c.title || '').slice(0, 35).padEnd(35)
    if (!c.nip) {
      stats.no_nip += 1
      console.log(`[${idx}/${list.length}] ${titleShort}  SKIP (no NIP)`)
      continue
    }

    const t0 = new Date().toISOString()
    const result = await reanalyzeOne(cookie, c.nip, REQUEST_TIMEOUT_MS)
    const ts = t0.slice(11, 19)
    const ms = Math.round(result.durationMs)

    if (result.success) {
      stats.success += 1
      console.log(`[${idx}/${list.length}] ${ts}  ${c.nip}  ${titleShort}  HTTP ${result.status}  ${ms}ms  ✓`)
    } else {
      const cat = categorizeError(result.status, result.body)
      ;(stats as unknown as Record<string, number>)[cat] += 1
      const errMsg = result.body.slice(0, 100)
      console.log(
        `[${idx}/${list.length}] ${ts}  ${c.nip}  ${titleShort}  HTTP ${result.status}  ${ms}ms  ✗ ${cat}: ${errMsg}`,
      )
      stats.errors.push({ id: c.id, nip: c.nip, status: result.status, message: errMsg })

      // Hard-stop on persistent 401 — cookie expired
      if (cat === 'http_401' && stats.http_401 >= 3) {
        console.error(
          `\n!! 3 consecutive 401 errors — session cookie likely expired. Refresh SZTAB_SESSION_COOKIE та повторити.`,
        )
        break
      }
    }

    // Progress checkpoint every 10
    if (idx % 10 === 0) {
      console.log(
        `  [progress] processed=${idx}, success=${stats.success}, errors=${stats.http_401 + stats.http_402_apify + stats.http_timeout + stats.http_other_error}`,
      )
    }

    // Rate limit (skip last sleep)
    if (idx < list.length) {
      await new Promise((r) => setTimeout(r, sleepMs))
    }
  }

  // Wait short delay for Phase B async work to settle before measuring delta
  // Phase B continues async after Phase A response — give it ~30s breathing room
  // for the LAST few clients before reading delta stats.
  console.log(`\nWaiting 30s для Phase B async settle…`)
  await new Promise((r) => setTimeout(r, 30_000))

  const delta = await loadDeltaStats(supabase, beforeIds)
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`Batch complete.`)
  console.log(
    `  Processed: ${stats.total}  Success: ${stats.success}  401: ${stats.http_401}  402_apify: ${stats.http_402_apify}  timeout: ${stats.http_timeout}  other: ${stats.http_other_error}  no_nip: ${stats.no_nip}`,
  )
  console.log(`\nDelta (after batch vs baseline):`)
  console.log(
    `  brand_aliases populated: ${baseline.with_brand_aliases} → ${delta.with_brand_aliases}  (+${delta.with_brand_aliases - baseline.with_brand_aliases})`,
  )
  console.log(
    `  website populated:       ${baseline.with_website} → ${delta.with_website}  (+${delta.with_website - baseline.with_website})`,
  )
  console.log(
    `  menu extracted:          ${baseline.with_menu} → ${delta.with_menu}  (+${delta.with_menu - baseline.with_menu})`,
  )
  const coverageRate = list.length > 0 ? Math.round((100 * (delta.with_menu - baseline.with_menu)) / list.length) : 0
  console.log(`\n  Coverage rate (new menus / batch size): ${coverageRate}%`)
  console.log(`${'═'.repeat(70)}`)

  if (stats.errors.length > 0) {
    console.log(`\nFirst 10 errors:`)
    for (const e of stats.errors.slice(0, 10)) {
      console.log(`  NIP=${e.nip}  HTTP ${e.status}  ${e.message.slice(0, 120)}`)
    }
  }
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
