// scripts/backfill-ua-founders.ts
// S-CORE.3.B Phase A (09.05.2026) — one-shot backfill ua_founders_signal
// для всіх clients + ceidg_prospects. Vadym runs у PowerShell:
//
//   pnpm dlx tsx scripts/backfill-ua-founders.ts
//
// Idempotent — re-running overwrites existing signal з fresh computation.
// Updates: clients.ua_founders_signal + ceidg_prospects.ua_founders_signal.
//
// Sources:
//   - clients: crbr_beneficiaries (verified UA citizenship/residency) +
//     decision_maker_name + persons via person_company_links
//   - ceidg_prospects: decision_maker_name + owner_name + persons via
//     person_company_links (CRBR не covers JDG)
//
// Per Vadym Q5: detected=true тільки для 'verified' + 'high' confidence.
// 'medium'/'low' stored з detected=false для debugging.

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import { buildUaFoundersSignal } from '@/lib/intelligence/ukrainian-detect'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '❌ Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
  )
  console.error('   Перевір .env.local — повинні бути налаштовані.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface Stats {
  total: number
  verified: number
  high: number
  medium: number
  low_or_null: number
  errors: number
}

const emptyStats = (): Stats => ({
  total: 0,
  verified: 0,
  high: 0,
  medium: 0,
  low_or_null: 0,
  errors: 0,
})

interface CrbrRow {
  imie: string | null
  nazwisko: string | null
  kraj_rezydencji: string | null
  obywatelstwa: string[]
}

interface PersonLinkRow {
  persons: { imie: string; nazwisko: string } | null
}

async function fetchPersonNames(
  table: 'client_id' | 'prospect_id',
  entityId: string,
): Promise<string[]> {
  const { data: links } = await supabase
    .from('person_company_links')
    .select('persons(imie, nazwisko)')
    .eq(table, entityId)
  return ((links ?? []) as PersonLinkRow[])
    .filter((l) => l.persons)
    .map((l) => `${l.persons!.imie} ${l.persons!.nazwisko}`)
}

async function backfillClients(): Promise<Stats> {
  const stats = emptyStats()
  console.log('📋 Fetching clients...')

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, title, decision_maker_name')

  if (error) {
    console.error('❌ clients fetch failed:', error.message)
    return stats
  }
  if (!clients || clients.length === 0) {
    console.log('  (no clients)')
    return stats
  }

  stats.total = clients.length
  console.log(`  → ${stats.total} clients to process\n`)

  for (const c of clients as Array<{
    id: string
    title: string
    decision_maker_name: string | null
  }>) {
    try {
      // CRBR beneficiaries
      const { data: crbr } = await supabase
        .from('crbr_beneficiaries')
        .select('imie, nazwisko, kraj_rezydencji, obywatelstwa')
        .eq('client_id', c.id)

      const personNames = await fetchPersonNames('client_id', c.id)

      const signal = buildUaFoundersSignal({
        crbrBeneficiaries: (crbr ?? []) as CrbrRow[],
        decisionMakerName: c.decision_maker_name,
        personNames,
      })

      // Tally
      if (signal.confidence === 'verified') stats.verified++
      else if (signal.confidence === 'high') stats.high++
      else if (signal.confidence === 'medium') stats.medium++
      else stats.low_or_null++

      const { error: upErr } = await supabase
        .from('clients')
        .update({ ua_founders_signal: signal })
        .eq('id', c.id)

      if (upErr) {
        stats.errors++
        console.error(`  ✗ client ${c.id} (${c.title}): ${upErr.message}`)
      }
    } catch (e) {
      stats.errors++
      console.error(
        `  ✗ client ${c.id}:`,
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  return stats
}

async function backfillProspects(): Promise<Stats> {
  const stats = emptyStats()
  console.log('📋 Fetching ceidg_prospects...')

  const { data: prospects, error } = await supabase
    .from('ceidg_prospects')
    .select('id, name, decision_maker_name, owner_name')

  if (error) {
    console.error('❌ prospects fetch failed:', error.message)
    return stats
  }
  if (!prospects || prospects.length === 0) {
    console.log('  (no prospects)')
    return stats
  }

  stats.total = prospects.length
  console.log(`  → ${stats.total} prospects to process\n`)

  for (const p of prospects as Array<{
    id: string
    name: string
    decision_maker_name: string | null
    owner_name: string | null
  }>) {
    try {
      const personNames = await fetchPersonNames('prospect_id', p.id)

      const signal = buildUaFoundersSignal({
        crbrBeneficiaries: [], // CRBR не covers JDG (sole-proprietors)
        decisionMakerName: p.decision_maker_name,
        ownerName: p.owner_name,
        personNames,
      })

      if (signal.confidence === 'verified') stats.verified++
      else if (signal.confidence === 'high') stats.high++
      else if (signal.confidence === 'medium') stats.medium++
      else stats.low_or_null++

      const { error: upErr } = await supabase
        .from('ceidg_prospects')
        .update({ ua_founders_signal: signal })
        .eq('id', p.id)

      if (upErr) {
        stats.errors++
        console.error(`  ✗ prospect ${p.id} (${p.name}): ${upErr.message}`)
      }
    } catch (e) {
      stats.errors++
      console.error(
        `  ✗ prospect ${p.id}:`,
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  return stats
}

function printStats(label: string, s: Stats): void {
  console.log(`\n=== ${label} ===`)
  console.log(`  Total:     ${s.total}`)
  console.log(`  Verified:  ${s.verified}  (CRBR-confirmed UA)`)
  console.log(`  High:      ${s.high}  (UK first + UK surname без PL)`)
  console.log(`  Medium:    ${s.medium}  (single UK signal — detected=false per Q5)`)
  console.log(`  Low/null:  ${s.low_or_null}  (no UK signal)`)
  console.log(`  Errors:    ${s.errors}`)
  console.log(
    `  Detected (verified+high): ${s.verified + s.high} / ${s.total} (${
      s.total === 0
        ? 0
        : Math.round(((s.verified + s.high) / s.total) * 100)
    }%)`,
  )
}

async function main(): Promise<void> {
  console.log('🇺🇦 Backfill UA founders signal — S-CORE.3.B Phase A\n')
  console.log(`Target DB: ${SUPABASE_URL}`)
  console.log('Computed via lib/intelligence/ukrainian-detect.ts\n')

  const cs = await backfillClients()
  printStats('CLIENTS', cs)

  const ps = await backfillProspects()
  printStats('CEIDG PROSPECTS', ps)

  console.log('\n=== TOTAL ===')
  console.log(
    `  Detected (UA founder visibility): clients=${cs.verified + cs.high}, prospects=${
      ps.verified + ps.high
    }`,
  )
  console.log(`  Total processed: ${cs.total + ps.total}`)
  console.log(`  Total errors:    ${cs.errors + ps.errors}`)
  console.log('\n✓ Backfill завершено.')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
