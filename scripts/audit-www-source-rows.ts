#!/usr/bin/env tsx
// scripts/audit-www-source-rows.ts
// Sprint S-MENU Day 4.1 (16.05.2026) — read-only audit of active
// company_profile_fields[website] rows з source='WWW' (priority 4 — naive
// Tavily pick). Classifies each as pollution (in blocklist), pollution_new
// (covered by Day 4.1 expansion), or likely_real.
//
// Use case: Day 4 coverage stats showed 25 active WWW=4 rows. Sample of 15
// revealed 5 aggregator pollution (krs-online, yellowpages, wiadomoscihandlowe,
// nipregon, targeo). Full audit measures pollution rate across all 25.
//
// CLI:
//   pnpm exec tsx scripts/audit-www-source-rows.ts          # full audit
//   pnpm exec tsx scripts/audit-www-source-rows.ts --limit=50  # higher cap
//
// NO writes. Read-only diagnostic. If pollution rate >40% → recommend Day
// 4.2 invalidation script (mirror reextract-brand-aliases Day 3.1.2.1 pattern).

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import { AGGREGATOR_BLOCKLIST, isAggregator } from '@/lib/enrichment/web-search'

const DEFAULT_LIMIT = 100

// Day 4.1 ADDED entries — used to distinguish "blocklist worked, was pollution"
// from "Day 4.1 fix newly catches this pollution".
const DAY_4_1_NEW_ENTRIES = [
  'krs-online.com.pl',
  'yellowpages.pl',
  'wiadomoscihandlowe.pl',
  'nipregon.pl',
  'targeo.pl',
]

interface Row {
  client_id: string
  value_text: string | null
  created_at: string | null
}

interface ClassifiedRow extends Row {
  host: string
  classification: 'pollution_in_blocklist' | 'pollution_new_day4_1' | 'likely_real'
  matched_entry: string | null
}

function classify(host: string): { classification: ClassifiedRow['classification']; matched: string | null } {
  // Check Day 4.1 new entries first
  for (const entry of DAY_4_1_NEW_ENTRIES) {
    if (host === entry || host.endsWith('.' + entry)) {
      return { classification: 'pollution_new_day4_1', matched: entry }
    }
  }
  // Check existing blocklist (excluding Day 4.1 entries)
  if (isAggregator(host)) {
    const matched = AGGREGATOR_BLOCKLIST.find((b) => host === b || host.endsWith('.' + b)) ?? null
    if (matched && !DAY_4_1_NEW_ENTRIES.includes(matched)) {
      return { classification: 'pollution_in_blocklist', matched }
    }
  }
  return { classification: 'likely_real', matched: null }
}

async function main() {
  const args = process.argv.slice(2)
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? args[args.indexOf('--limit') + 1]
  const limit = limitArg ? parseInt(limitArg, 10) : DEFAULT_LIMIT
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT

  console.log(`Sprint S-MENU Day 4.1 — WWW=4 source audit`)
  console.log(`Mode: READ-ONLY  Limit: ${effectiveLimit}`)
  console.log(`Blocklist size: ${AGGREGATOR_BLOCKLIST.length} entries (з Day 4.1 ${DAY_4_1_NEW_ENTRIES.length} new)`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: rows, error } = await supabase
    .from('company_profile_fields')
    .select('client_id, value_text, created_at')
    .eq('field_key', 'website')
    .eq('source', 'WWW')
    .is('superseded_at', null)
    .limit(effectiveLimit)
  if (error) {
    console.error('Fetch failed:', error.message)
    process.exit(1)
  }
  const list = (rows ?? []) as Row[]
  console.log(`\nFound ${list.length} active WWW=4 website rows.\n`)
  if (list.length === 0) return

  // Classify each
  const classified: ClassifiedRow[] = []
  for (const r of list) {
    let host = ''
    try {
      host = new URL(r.value_text ?? '').hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      // Invalid URL — treat як likely_real (could be legacy data)
    }
    const { classification, matched } = host
      ? classify(host)
      : { classification: 'likely_real' as const, matched: null }
    classified.push({ ...r, host, classification, matched_entry: matched })
  }

  // Counters
  const counts = {
    pollution_in_blocklist: 0,
    pollution_new_day4_1: 0,
    likely_real: 0,
  }
  for (const c of classified) counts[c.classification] += 1

  console.log('═══════════ Classification breakdown ═══════════')
  console.log(`  pollution_in_blocklist (already у blocklist): ${counts.pollution_in_blocklist}  (${Math.round((100 * counts.pollution_in_blocklist) / list.length)}%)`)
  console.log(`  pollution_new_day4_1   (caught by Day 4.1 add): ${counts.pollution_new_day4_1}  (${Math.round((100 * counts.pollution_new_day4_1) / list.length)}%)`)
  console.log(`  likely_real            (potentially valid sites): ${counts.likely_real}  (${Math.round((100 * counts.likely_real) / list.length)}%)`)
  const totalPollution = counts.pollution_in_blocklist + counts.pollution_new_day4_1
  const pollutionRate = Math.round((100 * totalPollution) / list.length)
  console.log(`\n  TOTAL POLLUTION RATE: ${pollutionRate}% (${totalPollution}/${list.length})`)

  // Print pollution samples
  console.log('\n═══════════ Pollution rows (з client titles, fetched extra) ═══════════')
  const pollutionRows = classified.filter((c) => c.classification !== 'likely_real')
  if (pollutionRows.length > 0) {
    // Fetch client titles for pollution rows
    const ids = pollutionRows.map((r) => r.client_id)
    const { data: cliRows } = await supabase
      .from('clients')
      .select('id, title, business_profile')
      .in('id', ids)
    const titleMap = new Map<string, { title: string; ct: string }>()
    for (const c of (cliRows ?? []) as Array<{ id: string; title: string; business_profile: { client_type?: string } | null }>) {
      titleMap.set(c.id, { title: c.title ?? '?', ct: c.business_profile?.client_type ?? '—' })
    }
    for (const r of pollutionRows) {
      const cli = titleMap.get(r.client_id)
      const tag = r.classification === 'pollution_new_day4_1' ? 'NEW' : 'OLD'
      const title = (cli?.title ?? '?').slice(0, 35).padEnd(35)
      const host = r.host.padEnd(30)
      console.log(`  [${tag}]  ${host}  ${title}  ct=${cli?.ct ?? '—'}  matched=${r.matched_entry}`)
    }
  } else {
    console.log('  (no pollution detected)')
  }

  console.log('\n═══════════ Likely real (top 10 sample) ═══════════')
  const realRows = classified.filter((c) => c.classification === 'likely_real').slice(0, 10)
  if (realRows.length > 0) {
    const ids = realRows.map((r) => r.client_id)
    const { data: cliRows } = await supabase
      .from('clients')
      .select('id, title')
      .in('id', ids)
    const titleMap = new Map<string, string>(
      ((cliRows ?? []) as Array<{ id: string; title: string }>).map((c) => [c.id, c.title ?? '?']),
    )
    for (const r of realRows) {
      const title = (titleMap.get(r.client_id) ?? '?').slice(0, 35).padEnd(35)
      console.log(`  ${r.host.padEnd(30)}  ${title}`)
    }
  }

  console.log('\n═══════════ Recommendation ═══════════')
  if (pollutionRate >= 40) {
    console.log(`  ⚠ HIGH pollution (${pollutionRate}%). Recommend Day 4.2 invalidation script.`)
    console.log(`  Pattern: mirror Day 3.1.2.1 reextract-brand-aliases invalidateStaleTavilyBrandWebsite logic.`)
    console.log(`  Script would supersede all WWW=4 pollution rows + clear clients.website canonical.`)
    console.log(`  Next: bulk-reanalyze.ts run автомatично picks better website via STEP 6.6 brand-aware Tavily.`)
  } else if (pollutionRate >= 20) {
    console.log(`  MODERATE pollution (${pollutionRate}%). Day 4.2 optional — could wait for bulk-reanalyze to organically fix.`)
  } else {
    console.log(`  LOW pollution (${pollutionRate}%). Skip Day 4.2, focus на bulk-reanalyze.`)
  }
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
