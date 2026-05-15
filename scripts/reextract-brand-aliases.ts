#!/usr/bin/env tsx
// scripts/reextract-brand-aliases.ts
// Sprint S-MENU Day 3.1.2 (15.05.2026) — historical backfill.
// Sprint S-MENU Day 3.1.2.1 (15.05.2026) — stale tavily_brand website invalidation.
//
// Re-runs extractBrandAliasesFromKoncesje (Day 3.1.2 updated parser що handles
// Format B "lokal gastronomiczny" pattern) проти clients що had empty
// brand_aliases після Day 1 deploy. Fixes Fortuna-style JDG clients que
// CEIDG koncesja text НE matched legacy Format A regex.
//
// Day 3.1.2.1 — ALSO invalidates stale company_profile_fields[website] rows
// з source='tavily_brand' для clients що just got new brand_aliases. Без
// invalidation, прошлий wrong-brand tavily_brand_search winner blocks STEP
// 6.6 from re-firing on next Phase B run (gate checks "is website aggregator"
// not "did input brand change"). See diag for Fortuna 15.05 — лак brand_aliases
// updated to FABRYKA SUSHI but fortuna.info.pl (Pensjonat) remained active.
//
// Scope filter:
//   - ceidg_id IS NOT NULL (JDG clients — CEIDG covers only sole proprietors;
//     sp.z o.o./S.A. registered у KRS не CEIDG, ceidg_id залишається NULL)
//   - brand_aliases empty/null (filtered client-side bo PostgREST jsonb-eq
//     не parses literal '[]' reliably). With --force flag, processes ALL.
//
// Estimated impact (live count 15.05.2026): 2 affected clients (Fortuna,
// DEKOB) для organic backfill. With --force: also re-process MARCIN
// (already populated) для website invalidation.
// CEIDG API quota: $0.0001 × N. Rate-limit: 1 req/sec.
//
// CLI:
//   pnpm exec tsx scripts/reextract-brand-aliases.ts                      # organic backfill (empty only)
//   pnpm exec tsx scripts/reextract-brand-aliases.ts --dry                # preview, no DB writes
//   pnpm exec tsx scripts/reextract-brand-aliases.ts --limit 5            # cap at 5 candidates
//   pnpm exec tsx scripts/reextract-brand-aliases.ts --force              # process ALL ceidg_id clients
//   pnpm exec tsx scripts/reextract-brand-aliases.ts --skip-invalidation  # backfill without website cleanup
//   pnpm exec tsx scripts/reextract-brand-aliases.ts --dry --force        # preview --force scope
//
// --force behavior (Day 3.1.2.1): bypasses empty-brand-aliases filter, re-
// extracts ВСЕ ceidg_id-having clients regardless of current state. Three
// outcomes per client:
//   (a) brand_aliases was empty → got populated → UPDATE + INVALIDATE
//   (b) brand_aliases populated AND extraction === current → NO CHANGE +
//       INVALIDATE (Fortuna case — brand right but stale website)
//   (c) brand_aliases populated AND extraction differs → UPDATE + INVALIDATE
//
// --skip-invalidation: brand_aliases UPDATE only, website left alone.
// Vadym opt-out для manual website management.
//
// NO Phase B re-trigger. Just updates clients.brand_aliases JSONB + supersedes
// stale company_profile_fields[website] rows. Vadym runs /api/intelligence/
// lookup manually на clients want full re-analysis.

import '@/lib/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

/** Sprint S-MENU Day 3.1.2.1 (15.05.2026) — invalidate stale tavily_brand
 *  website row + matching clients.website canonical mirror.
 *
 *  Workflow:
 *    1. SELECT active company_profile_fields[website] WHERE source='tavily_brand'
 *    2. If row found: UPDATE superseded_at=NOW, superseded_by_source='manual_backfill_invalidation'
 *    3. ALSO clear clients.website IF current value === superseded value
 *       (defensive — preserve Vadym's manual edits made после backfill ran)
 *    4. Return diagnostics для logging.
 *
 *  In --dry mode: no DB writes, returns what WOULD happen. */
async function invalidateStaleTavilyBrandWebsite(
  supabase: SupabaseClient,
  clientId: string,
  isDry: boolean,
): Promise<{
  supersededRowId: string | null
  supersededValue: string | null
  canonicalCleared: boolean
  error: string | null
}> {
  // Find active tavily_brand website row
  const { data: rows, error: selErr } = await supabase
    .from('company_profile_fields')
    .select('id, value_text')
    .eq('client_id', clientId)
    .eq('field_key', 'website')
    .eq('source', 'tavily_brand')
    .is('superseded_at', null)
    .limit(1)
  if (selErr) {
    return { supersededRowId: null, supersededValue: null, canonicalCleared: false, error: selErr.message }
  }
  const row = (rows ?? [])[0] as { id: string; value_text: string } | undefined
  if (!row) {
    return { supersededRowId: null, supersededValue: null, canonicalCleared: false, error: null }
  }

  if (isDry) {
    return {
      supersededRowId: row.id,
      supersededValue: row.value_text,
      canonicalCleared: false, // would-be — actual check requires DB read
      error: null,
    }
  }

  // Write — supersede row
  const { error: updErr } = await supabase
    .from('company_profile_fields')
    .update({
      superseded_at: new Date().toISOString(),
      superseded_by_source: 'manual_backfill_invalidation',
    })
    .eq('id', row.id)
  if (updErr) {
    return {
      supersededRowId: null,
      supersededValue: row.value_text,
      canonicalCleared: false,
      error: `supersede UPDATE: ${updErr.message}`,
    }
  }

  // Defensive canonical clear — only if clients.website matches superseded value
  const { data: cli, error: cliSelErr } = await supabase
    .from('clients')
    .select('website')
    .eq('id', clientId)
    .maybeSingle()
  let canonicalCleared = false
  if (!cliSelErr && cli && (cli as { website?: string | null }).website === row.value_text) {
    const { error: clrErr } = await supabase
      .from('clients')
      .update({ website: null })
      .eq('id', clientId)
    if (!clrErr) canonicalCleared = true
  }

  return {
    supersededRowId: row.id,
    supersededValue: row.value_text,
    canonicalCleared,
    error: null,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isDry = args.includes('--dry')
  const isForce = args.includes('--force')
  const skipInvalidation = args.includes('--skip-invalidation')
  const limitArgIdx = args.indexOf('--limit')
  const limit = limitArgIdx >= 0 ? parseInt(args[limitArgIdx + 1] ?? '0', 10) : DEFAULT_HARD_CAP
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_HARD_CAP

  console.log(`Sprint S-MENU Day 3.1.2 + 3.1.2.1 — brand_aliases backfill + website invalidation`)
  console.log(
    `Mode: ${isDry ? 'DRY RUN' : 'WRITE'}  Limit: ${effectiveLimit}  Force: ${isForce}  SkipInvalidation: ${skipInvalidation}`,
  )

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const ceidgKey = await loadCeidgApiKey()

  // Fetch candidates: clients з ceidg_id present (JDG proxy — CEIDG covers
  // only sole proprietors; sp.z o.o./S.A. registered у KRS, не CEIDG).
  // Brand_aliases empty/null check done client-side because PostgREST jsonb
  // equality з '[]' literal не matches `[]::jsonb` reliably.
  // --force bypasses empty-brand filter — processes ALL ceidg_id clients.
  const SERVER_FETCH_CAP = 500
  const { data: rawRows, error: selErr } = await supabase
    .from('clients')
    .select('id, nip, title, ceidg_id, entity_type, brand_aliases')
    .not('ceidg_id', 'is', null)
    .limit(SERVER_FETCH_CAP)

  if (selErr) {
    console.error('Candidates fetch failed:', selErr.message)
    process.exit(1)
  }
  type RawRow = CandidateRow & { brand_aliases: unknown }
  const rawList = (rawRows ?? []) as unknown as RawRow[]
  const candidates = isForce
    ? rawList
    : rawList.filter(
        (c) => !c.brand_aliases || (Array.isArray(c.brand_aliases) && c.brand_aliases.length === 0),
      )
  const list = candidates.slice(0, effectiveLimit) as RawRow[]
  console.log(
    `\nFound ${candidates.length} candidate(s) (server-fetched ${rawList.length}, mode=${isForce ? 'FORCE all' : 'organic empty-brand'}, capped to ${effectiveLimit}).`,
  )
  if (list.length === 0) {
    console.log('Nothing to backfill. Exiting.')
    return
  }

  let processed = 0
  let fixed = 0
  let noChange = 0
  let alreadyEmpty = 0
  let fetchFailed = 0
  let websitesSuperseded = 0
  let canonicalsCleared = 0

  for (const c of list) {
    processed += 1
    const details = await fetchFirmDetails(ceidgKey, c.ceidg_id)

    if (!details) {
      fetchFailed += 1
      console.log(`[${processed}/${list.length}] ${c.nip} ${c.title.slice(0, 50)}: FETCH FAILED`)
    } else {
      const aliases = extractBrandAliasesFromKoncesje(
        details.uprawnienia as unknown as Parameters<typeof extractBrandAliasesFromKoncesje>[0],
      )
      const currentAliases = Array.isArray(c.brand_aliases) ? c.brand_aliases : []
      const aliasesJson = JSON.stringify(aliases)
      const currentJson = JSON.stringify(currentAliases)
      const isNoChange = aliasesJson === currentJson

      if (aliases.length === 0) {
        alreadyEmpty += 1
        console.log(
          `[${processed}/${list.length}] ${c.nip} ${c.title.slice(0, 50)}: no extractable brand (uprawnienia=${details.uprawnienia.length})`,
        )
      } else if (isNoChange) {
        noChange += 1
        console.log(
          `[${processed}/${list.length}] ${c.nip} ${c.title.slice(0, 50)}: [NO CHANGE] brand_aliases identical (${aliases.length} aliases)`,
        )
        for (const a of aliases) {
          console.log(
            `    brand="${a.brand}"  kind="${a.kind}"  city="${a.city ?? '-'}"  postal="${a.postal_code ?? '-'}"`,
          )
        }
      } else {
        console.log(
          `[${processed}/${list.length}] ${c.nip} ${c.title.slice(0, 50)}: → ${aliases.length} alias(es) ${currentAliases.length === 0 ? '(was empty)' : '(was: ' + currentAliases.length + ' aliases, changed)'}`,
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

      // Sprint S-MENU Day 3.1.2.1 — invalidate stale tavily_brand website.
      // Fires when:
      //   (a) brand_aliases was empty → got populated (organic backfill)
      //   (b) brand_aliases populated AND --force AND no change (Fortuna case)
      //   (c) brand_aliases populated AND --force AND changed
      // Skipped when --skip-invalidation OR aliases extraction yielded 0.
      const shouldInvalidate =
        !skipInvalidation &&
        aliases.length > 0 &&
        (currentAliases.length === 0 || isForce)
      if (shouldInvalidate) {
        const inv = await invalidateStaleTavilyBrandWebsite(supabase, c.id, isDry)
        if (inv.error) {
          console.warn(`    invalidation failed: ${inv.error}`)
        } else if (inv.supersededRowId) {
          websitesSuperseded += 1
          if (inv.canonicalCleared) canonicalsCleared += 1
          console.log(
            `    ↳ ${isDry ? 'WOULD supersede' : 'superseded'} stale tavily_brand website: ${inv.supersededValue}${
              inv.canonicalCleared ? ' (+ canonical cleared)' : ''
            }`,
          )
        }
      }
    }

    if (processed % 10 === 0) {
      console.log(
        `[${processed}/${list.length}] Progress — fixed=${fixed}, no-change=${noChange}, no-koncesja=${alreadyEmpty}, fetch_fail=${fetchFailed}, websites_superseded=${websitesSuperseded}`,
      )
    }
    // Rate limit — 1 req/sec to CEIDG (avoid hammering)
    if (processed < list.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
    }
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(
    `Done. processed=${processed}, fixed=${fixed}, no-change=${noChange}, no-koncesja=${alreadyEmpty}, fetch_failed=${fetchFailed}`,
  )
  console.log(
    `Websites: superseded=${websitesSuperseded}, canonical_cleared=${canonicalsCleared}${skipInvalidation ? ' (--skip-invalidation)' : ''}`,
  )
  console.log(`Mode: ${isDry ? 'DRY (no DB writes)' : 'WRITE'}  Force: ${isForce}`)
  console.log(`CEIDG quota used: ~$${(processed * 0.0001).toFixed(4)}`)
  console.log(`${'═'.repeat(60)}`)
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
