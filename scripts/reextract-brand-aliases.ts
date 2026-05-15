#!/usr/bin/env tsx
// scripts/reextract-brand-aliases.ts
// Sprint S-MENU Day 3.1.2 (15.05.2026) — historical backfill.
//
// Re-runs extractBrandAliasesFromKoncesje (Day 3.1.2 updated parser що handles
// Format B "lokal gastronomiczny" pattern) проти clients що had empty
// brand_aliases після Day 1 deploy. Fixes Fortuna-style JDG clients que
// CEIDG koncesja text НE matched legacy Format A regex.
//
// Scope filter:
//   - entity_type = 'JDG'  (CEIDG covers only JDG, not sp.z o.o.)
//   - ceidg_id IS NOT NULL (we have UUID cached for direct API fetch)
//   - brand_aliases IS NULL OR jsonb_array_length(brand_aliases) = 0
//
// Estimated impact (per ad-hoc count): ~50-100 affected clients. CEIDG API
// quota cost: $0.0001 × N ≈ $0.005-0.010 total. Rate-limit: 1 req/sec.
//
// CLI:
//   pnpm exec tsx scripts/reextract-brand-aliases.ts          # full backfill
//   pnpm exec tsx scripts/reextract-brand-aliases.ts --dry    # preview only
//   pnpm exec tsx scripts/reextract-brand-aliases.ts --limit 5  # cap at 5
//
// NO Phase B re-trigger. Just updates clients.brand_aliases JSONB. Vadym
// runs `/api/intelligence/lookup` manually на clients want full re-analysis.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import { extractBrandAliasesFromKoncesje } from '@/lib/intelligence/extract-koncesje'

const CEIDG_API_BASE = 'https://dane.biznes.gov.pl/api/ceidg/v3'
const FETCH_TIMEOUT_MS = 10_000
const RATE_LIMIT_DELAY_MS = 1_000
const DEFAULT_HARD_CAP = 200

async function loadCeidgApiKey(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing у .env.local')
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase
    .from('params')
    .select('ceidg_api_key')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`params SELECT: ${error.message}`)
  const key = (data as { ceidg_api_key?: string | null } | null)?.ceidg_api_key
  if (!key) throw new Error('params.ceidg_api_key is NULL — set via /settings → Klucze API')
  return key
}

interface CandidateRow {
  id: string
  nip: string | null
  title: string
  ceidg_id: string
  entity_type: string | null
}

async function fetchFirmDetails(
  ceidgKey: string,
  ceidgId: string,
): Promise<{ uprawnienia: Array<{ opis?: string }> } | null> {
  try {
    const res = await fetch(`${CEIDG_API_BASE}/firma/${ceidgId}`, {
      headers: { Authorization: `Bearer ${ceidgKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn(`  CEIDG HTTP ${res.status} для UUID=${ceidgId}`)
      return null
    }
    const json = (await res.json()) as { firma?: Array<{ uprawnienia?: Array<{ opis?: string }> }> }
    const firma = json?.firma?.[0]
    if (!firma) return null
    return { uprawnienia: firma.uprawnienia ?? [] }
  } catch (err) {
    console.warn(`  fetch failed для UUID=${ceidgId}:`, err instanceof Error ? err.message : err)
    return null
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isDry = args.includes('--dry')
  const limitArgIdx = args.indexOf('--limit')
  const limit = limitArgIdx >= 0 ? parseInt(args[limitArgIdx + 1] ?? '0', 10) : DEFAULT_HARD_CAP
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_HARD_CAP

  console.log(`Sprint S-MENU Day 3.1.2 — brand_aliases backfill`)
  console.log(`Mode: ${isDry ? 'DRY RUN' : 'WRITE'}  Limit: ${effectiveLimit}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const ceidgKey = await loadCeidgApiKey()

  // Fetch candidates — JDG + ceidg_id IS NOT NULL + brand_aliases empty/null.
  // PostgREST filter for jsonb_array_length(brand_aliases) = 0:
  // use `brand_aliases=eq.[]` (matches literal empty JSONB array).
  const { data: candidates, error: selErr } = await supabase
    .from('clients')
    .select('id, nip, title, ceidg_id, entity_type')
    .eq('entity_type', 'JDG')
    .not('ceidg_id', 'is', null)
    .eq('brand_aliases', '[]')
    .limit(effectiveLimit)

  if (selErr) {
    console.error('Candidates fetch failed:', selErr.message)
    process.exit(1)
  }
  const list = (candidates ?? []) as unknown as CandidateRow[]
  console.log(`\nFound ${list.length} candidate(s) (entity_type=JDG, ceidg_id present, brand_aliases=[]).`)
  if (list.length === 0) {
    console.log('Nothing to backfill. Exiting.')
    return
  }

  let processed = 0
  let fixed = 0
  let alreadyEmpty = 0
  let fetchFailed = 0

  for (const c of list) {
    processed += 1
    const details = await fetchFirmDetails(ceidgKey, c.ceidg_id)
    if (!details) {
      fetchFailed += 1
    } else {
      const aliases = extractBrandAliasesFromKoncesje(
        details.uprawnienia as unknown as Parameters<typeof extractBrandAliasesFromKoncesje>[0],
      )
      if (aliases.length === 0) {
        alreadyEmpty += 1
      } else {
        console.log(
          `[${processed}/${list.length}] ${c.nip} ${c.title.slice(0, 50)}: → ${aliases.length} alias(es)`,
        )
        for (const a of aliases) {
          console.log(
            `    brand="${a.brand}"  kind="${a.kind}"  city="${a.city ?? '-'}"  postal="${a.postal_code ?? '-'}"`,
          )
        }
        if (!isDry) {
          const { error: updErr } = await supabase
            .from('clients')
            .update({ brand_aliases: aliases })
            .eq('id', c.id)
          if (updErr) {
            console.error(`    UPDATE failed: ${updErr.message}`)
          } else {
            fixed += 1
          }
        } else {
          fixed += 1
        }
      }
    }
    if (processed % 10 === 0) {
      console.log(
        `[${processed}/${list.length}] Progress — fixed=${fixed}, no-koncesja=${alreadyEmpty}, fetch_fail=${fetchFailed}`,
      )
    }
    // Rate limit — 1 req/sec to CEIDG (avoid hammering)
    if (processed < list.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
    }
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Done. processed=${processed}, fixed=${fixed}, no-koncesja=${alreadyEmpty}, fetch_failed=${fetchFailed}`)
  console.log(`Mode: ${isDry ? 'DRY (no DB writes)' : 'WRITE (clients.brand_aliases updated)'}`)
  console.log(`CEIDG quota used: ~$${(processed * 0.0001).toFixed(4)}`)
  console.log(`${'═'.repeat(60)}`)
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
