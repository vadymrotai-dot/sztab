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
//     persons via person_company_links (active relations: data_do IS NULL)
//     NOTE: clients table NIE має decision_maker_name (тільки ceidg_prospects).
//     Phase A.1 fix (09.05.2026 evening) — removed bad SELECT.
//   - ceidg_prospects: decision_maker_name + owner_name + persons via
//     person_company_links (CRBR не covers JDG sole-proprietors)
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

/** Supabase JS returns nested resources як array навіть якщо FK is single.
 *  Flexible shape — support both для safety + cast through unknown. */
interface PersonLinkRowRaw {
  persons:
    | { imie: string; nazwisko: string }
    | Array<{ imie: string; nazwisko: string }>
    | null
}

/** Phase B HOTFIX (10.05.2026) — pagination wrapper.
 *  Supabase JS default LIMIT 1000 silently caps fetches. KRS sync доcadił
 *  +1416 sp.z o.o. → ceidg_prospects тепер ~2761 rows. Без pagination
 *  backfill processing тільки first 1000 → нові firms без ua_founders_signal. */
async function fetchAllPaginated<T>(
  table: 'clients' | 'ceidg_prospects',
  selectColumns: string,
): Promise<T[]> {
  const PAGE = 1000
  let from = 0
  const all: T[] = []
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .range(from, from + PAGE - 1)
    if (error) {
      throw new Error(`${table} pagination at offset ${from}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    from += data.length
    if (data.length < PAGE) break
  }
  return all
}

async function fetchPersonNames(
  table: 'client_id' | 'prospect_id',
  entityId: string,
): Promise<string[]> {
  // Active relations only — data_do IS NULL означає роль не закінчена.
  // jest_decyzyjny не filter'имо — heuristic не вимагає decision-maker
  // status (просто any linked person).
  const { data: links } = await supabase
    .from('person_company_links')
    .select('persons(imie, nazwisko)')
    .eq(table, entityId)
    .is('data_do', null)

  const rows = (links ?? []) as unknown as PersonLinkRowRaw[]
  const names: string[] = []
  for (const l of rows) {
    if (!l.persons) continue
    const obj = Array.isArray(l.persons) ? l.persons[0] : l.persons
    if (obj?.imie && obj?.nazwisko) {
      names.push(`${obj.imie} ${obj.nazwisko}`)
    }
  }
  return names
}

async function backfillClients(): Promise<Stats> {
  const stats = emptyStats()
  console.log('📋 Fetching clients...')

  // clients table NIE має decision_maker_name (per Phase A.1 fix).
  // People-name heuristic sources для clients:
  //   1. crbr_beneficiaries (verified UA citizenship/residency)
  //   2. persons via person_company_links (heuristic-only)
  // Phase B HOTFIX (10.05.2026) — pagination wraps Supabase 1000-row default.
  let clients: Array<{ id: string; title: string }>
  try {
    clients = await fetchAllPaginated<{ id: string; title: string }>(
      'clients',
      'id, title',
    )
  } catch (e) {
    console.error(
      '❌ clients fetch failed:',
      e instanceof Error ? e.message : String(e),
    )
    return stats
  }
  if (clients.length === 0) {
    console.log('  (no clients)')
    return stats
  }

  stats.total = clients.length
  console.log(`  → ${stats.total} clients to process\n`)

  for (const c of clients) {
    try {
      // CRBR beneficiaries (verified UA citizenship/residency)
      const { data: crbr } = await supabase
        .from('crbr_beneficiaries')
        .select('imie, nazwisko, kraj_rezydencji, obywatelstwa')
        .eq('client_id', c.id)

      // Persons via person_company_links (active relations, heuristic)
      const personNames = await fetchPersonNames('client_id', c.id)

      const signal = buildUaFoundersSignal({
        crbrBeneficiaries: (crbr ?? []) as CrbrRow[],
        // decisionMakerName омітнутий — clients не має цієї колонки
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
  console.log('📋 Fetching ceidg_prospects (з pagination)...')

  // Phase B HOTFIX (10.05.2026) — pagination wraps Supabase 1000-row default.
  // Post-KRS sync ceidg_prospects ~2761 rows (1080 ФОПи + 1681 sp.z o.o.).
  type ProspectFetch = {
    id: string
    name: string
    decision_maker_name: string | null
    owner_name: string | null
  }
  let prospects: ProspectFetch[]
  try {
    prospects = await fetchAllPaginated<ProspectFetch>(
      'ceidg_prospects',
      'id, name, decision_maker_name, owner_name',
    )
  } catch (e) {
    console.error(
      '❌ prospects fetch failed:',
      e instanceof Error ? e.message : String(e),
    )
    return stats
  }
  if (prospects.length === 0) {
    console.log('  (no prospects)')
    return stats
  }

  stats.total = prospects.length
  console.log(`  → ${stats.total} prospects to process\n`)

  for (const p of prospects) {
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
