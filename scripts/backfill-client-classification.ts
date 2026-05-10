// scripts/backfill-client-classification.ts
// Sprint S6D Day 1 (11.05.2026) — classify existing 264 clients.
//
// Strategy: hybrid derive+LLM
//   1. Якщо clients.business_profile->>'business_format' IS NOT NULL
//      AND clients.business_profile->>'client_type' IS NULL
//      → derive client_type через BUSINESS_FORMAT_TO_CLIENT_TYPE mapping
//        (no API call, ~$0)
//   2. Якщо business_profile IS NULL OR business_format IS NULL
//      → call analyzeBusinessProfile() (AI Haiku, ~$0.01 per client)
//   3. Якщо business_profile->>'client_type' IS NOT NULL → skip (already done)
//
// Pagination: Supabase JS default 1000-row LIMIT. Iterate via .range().
// Idempotent — safe to re-run.
//
// Run:
//   pnpm dlx tsx scripts/backfill-client-classification.ts [--dry-run] [--limit=N]

import '@/lib/env'

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js'
import {
  analyzeBusinessProfile,
  BUSINESS_FORMAT_TO_CLIENT_TYPE,
  type BusinessProfile,
  type ClientType,
} from '@/lib/ai/business-analysis'

const PAGE_SIZE = 200

interface ClientRow {
  id: string
  nip: string | null
  title: string | null
  business_profile: BusinessProfile | null
}

// Sprint S6D Day 1 BUGFIX (11.05.2026) — explicit SupabaseClient type
// instead of `ReturnType<typeof createSupabaseClient>` (default generics
// resolve to <any, "public", "public", any, any> which mismatches strict
// SupabaseClient type expected by lib/ai/business-analysis.ts —
// ReturnType<...> generics widening = caller-vs-callee incompatibility).
// Canonical SupabaseClient<unknown, ...> aligns з analyzeBusinessProfile
// signature → клієнт-side TS validation passes без cast.
async function fetchAll(supabase: SupabaseClient): Promise<ClientRow[]> {
  const all: ClientRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, nip, title, business_profile')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Fetch clients failed: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...((data as unknown) as ClientRow[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

interface BackfillStats {
  total: number
  already_classified: number
  derived_from_business_format: number
  ai_calls_made: number
  ai_calls_succeeded: number
  ai_calls_failed: number
  total_ai_cost_usd: number
  skipped_no_nip: number
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required у .env.local')
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''

  const supabase = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('[backfill] Fetching all clients...')
  const all = await fetchAll(supabase)
  const targetSubset = all.slice(0, Math.min(limit, all.length))
  console.log(`[backfill] Loaded ${all.length} clients (processing ${targetSubset.length})`)
  if (dryRun) console.log('[backfill] DRY RUN — no DB writes will occur')

  const stats: BackfillStats = {
    total: targetSubset.length,
    already_classified: 0,
    derived_from_business_format: 0,
    ai_calls_made: 0,
    ai_calls_succeeded: 0,
    ai_calls_failed: 0,
    total_ai_cost_usd: 0,
    skipped_no_nip: 0,
  }

  for (let i = 0; i < targetSubset.length; i += 1) {
    const client = targetSubset[i]
    const progress = `[${i + 1}/${targetSubset.length}]`

    // Path 0: already classified — skip
    if (client.business_profile?.client_type) {
      stats.already_classified += 1
      continue
    }

    // Path A: derive з business_format (no API call)
    if (client.business_profile?.business_format) {
      const businessFormat = client.business_profile.business_format
      const derivedType: ClientType =
        BUSINESS_FORMAT_TO_CLIENT_TYPE[businessFormat] ?? 'inne'
      const updatedProfile: BusinessProfile = {
        ...client.business_profile,
        client_type: derivedType,
        client_subtype: '',
        classification_confidence: 75,
        classification_reasoning_pl: `Derived from business_format='${businessFormat}' (Sprint S6D Day 1 backfill, no LLM call)`,
      }
      console.log(
        `${progress} DERIVE ${client.nip ?? '(no NIP)'} ${client.title ?? ''} → ${derivedType}`,
      )
      if (!dryRun) {
        const { error } = await supabase
          .from('clients')
          .update({ business_profile: updatedProfile })
          .eq('id', client.id)
        if (error) {
          console.error(`${progress} ❌ DB update failed: ${error.message}`)
          stats.ai_calls_failed += 1
          continue
        }
      }
      stats.derived_from_business_format += 1
      continue
    }

    // Path B: no business_profile → run AI Business Analysis
    if (!client.nip) {
      console.warn(`${progress} SKIP no NIP — id=${client.id}`)
      stats.skipped_no_nip += 1
      continue
    }
    if (!anthropicKey) {
      console.warn(`${progress} SKIP ANTHROPIC_API_KEY missing — id=${client.id}`)
      stats.ai_calls_failed += 1
      continue
    }

    console.log(
      `${progress} AI ${client.nip} ${client.title ?? ''} → calling analyzeBusinessProfile...`,
    )
    if (dryRun) {
      stats.ai_calls_made += 1
      continue
    }
    stats.ai_calls_made += 1
    try {
      const result = await analyzeBusinessProfile(supabase, anthropicKey, client.id)
      if (result.profile) {
        stats.ai_calls_succeeded += 1
        stats.total_ai_cost_usd += result.cost_usd
        console.log(
          `${progress} ✅ ${result.profile.business_format} → ${result.profile.client_type} (conf=${result.profile.classification_confidence}, $${result.cost_usd.toFixed(4)})`,
        )
      } else {
        stats.ai_calls_failed += 1
        console.error(`${progress} ❌ AI failed: ${result.error}`)
      }
    } catch (err) {
      stats.ai_calls_failed += 1
      console.error(
        `${progress} ❌ Crashed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  console.log('\n[backfill] STATS:')
  console.log(JSON.stringify(stats, null, 2))
  console.log(`\nTotal AI cost: $${stats.total_ai_cost_usd.toFixed(4)}`)
  console.log(
    `Free derived: ${stats.derived_from_business_format} (no API cost)`,
  )
  console.log(`Already classified (skipped): ${stats.already_classified}`)
  if (dryRun) console.log('\nDRY RUN — no changes were persisted.')
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
