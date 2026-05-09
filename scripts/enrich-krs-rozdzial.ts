// scripts/enrich-krs-rozdzial.ts
// Phase A.2 (10.05.2026) — KRS deeper enrichment для нових 1416 sp.z o.o.
// без decision_maker_name + persons.
//
// Per Vadym Q1=A1 (budget 20 zł cap) + Q2=B1 (rozdzial-ogolny ONLY, skip CRBR)
// + Q3=approve persons writes.
//
// Flow per NIP (krs_number):
//   1. fetchRozdzialOgolny(apiKey, krs) → zarzad + prokurenci + wspolnicy (з імен)
//   2. Per person з імен (imie + nazwisko present):
//      a) INSERT INTO persons ON CONFLICT (rejestrio_person_id) DO NOTHING
//         (if rejestrio_person_id null → unconditional insert)
//      b) Pre-check person_company_links — INSERT only якщо tuple new
//   3. UPDATE ceidg_prospects.decision_maker_name = first zarzad member (для UA heuristic)
//
// Cost guard: 0.05 PLN per call assumed. Hard cap 20 zł = ~400 NIPs default.
// Override з --max-cost=N (zł).
//
// Idempotent: re-run skips NIPs з decision_maker_name set.
// Resume: state file .enrich-krs-rozdzial-progress.json tracks processed IDs.
//
// Usage:
//   pnpm dlx tsx scripts/enrich-krs-rozdzial.ts --probe 5
//   pnpm dlx tsx scripts/enrich-krs-rozdzial.ts                  # bulk з 20 zł cap
//   pnpm dlx tsx scripts/enrich-krs-rozdzial.ts --max-cost=50    # override cap
//   pnpm dlx tsx scripts/enrich-krs-rozdzial.ts --dry-run        # no DB writes
//   pnpm dlx tsx scripts/enrich-krs-rozdzial.ts --reset          # delete state file

import '@/lib/env'

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  fetchRozdzialOgolny,
  type ExtractedPerson,
} from '@/lib/rejestrio/rozdzial-ogolny'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://pxovjyxsktxdbovmybxz.supabase.co'

const COST_PER_CALL_PLN = 0.05 // search.ts comment estimate; адаптується якщо real different
const DEFAULT_MAX_COST_PLN = 20
const STATE_FILE = path.resolve(
  process.cwd(),
  '.enrich-krs-rozdzial-progress.json',
)

// ─── CLI ────────────────────────────────────────────────────────

interface CliFlags {
  probe: number | null // якщо set — process тільки N NIPs, exit
  maxCostPln: number
  dryRun: boolean
  reset: boolean
}

function parseCli(): CliFlags {
  const args = process.argv.slice(2)
  let probe: number | null = null
  let maxCostPln = DEFAULT_MAX_COST_PLN
  let dryRun = false
  let reset = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--probe') {
      const n = Number.parseInt(args[i + 1] ?? '5', 10)
      probe = Number.isFinite(n) && n > 0 ? n : 5
      i++
    } else if (a.startsWith('--max-cost=')) {
      const n = parseFloat(a.split('=')[1] ?? '')
      if (Number.isFinite(n) && n > 0) maxCostPln = n
    } else if (a === '--dry-run') {
      dryRun = true
    } else if (a === '--reset') {
      reset = true
    } else {
      console.error(`❌ Unknown arg: ${a}`)
      process.exit(1)
    }
  }
  return { probe, maxCostPln, dryRun, reset }
}

// ─── State ──────────────────────────────────────────────────────

interface State {
  version: 1
  processedProspectIds: string[]
  total_calls: number
  total_cost_pln: number
  started_at: string
}

async function loadState(): Promise<State> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8')
    const s = JSON.parse(raw) as State
    if (s.version !== 1) throw new Error(`unsupported version ${s.version}`)
    return s
  } catch {
    return {
      version: 1,
      processedProspectIds: [],
      total_calls: 0,
      total_cost_pln: 0,
      started_at: new Date().toISOString(),
    }
  }
}

async function saveState(s: State): Promise<void> {
  const tmp = STATE_FILE + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf-8')
  await fs.rename(tmp, STATE_FILE)
}

async function deleteState(): Promise<void> {
  try {
    await fs.unlink(STATE_FILE)
  } catch {
    /* ignore */
  }
}

// ─── DB helpers ─────────────────────────────────────────────────

interface ProspectRow {
  id: string
  krs_number: string
  decision_maker_name: string | null
}

async function fetchProspectsToEnrich(
  supabase: SupabaseClient,
): Promise<ProspectRow[]> {
  // Fetch ВСІ KRS prospекті БЕЗ decision_maker_name. Pagination through 1000-cap.
  const PAGE = 1000
  let from = 0
  const all: ProspectRow[] = []
  while (true) {
    const { data, error } = await supabase
      .from('ceidg_prospects')
      .select('id, krs_number, decision_maker_name')
      .not('krs_number', 'is', null)
      .is('decision_maker_name', null)
      .range(from, from + PAGE - 1)
    if (error) {
      throw new Error(`prospects fetch at ${from}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    all.push(
      ...(data as Array<{
        id: string
        krs_number: string | null
        decision_maker_name: string | null
      }>)
        .filter((r) => r.krs_number !== null && r.krs_number.length > 0)
        .map((r) => ({
          id: r.id,
          krs_number: r.krs_number as string,
          decision_maker_name: r.decision_maker_name,
        })),
    )
    from += data.length
    if (data.length < PAGE) break
  }
  return all
}

interface PersonInsertResult {
  inserted: number
  skipped_anon: number
  linked: number
  link_skipped: number
}

async function upsertPersonsAndLinks(
  supabase: SupabaseClient,
  prospectId: string,
  people: ExtractedPerson[],
  dryRun: boolean,
): Promise<PersonInsertResult> {
  const result: PersonInsertResult = {
    inserted: 0,
    skipped_anon: 0,
    linked: 0,
    link_skipped: 0,
  }

  for (const p of people) {
    // Skip anon (persons.imie + nazwisko NOT NULL)
    if (!p.imie?.trim() || !p.nazwisko?.trim()) {
      result.skipped_anon++
      continue
    }

    // Step 1 — find or insert person
    let personId: string | null = null

    if (p.rejestrio_person_id !== null) {
      // Lookup first (UNIQUE constraint)
      const { data: existing } = await supabase
        .from('persons')
        .select('id')
        .eq('rejestrio_person_id', p.rejestrio_person_id)
        .maybeSingle()
      if (existing) {
        personId = (existing as { id: string }).id
      }
    }

    if (!personId && !dryRun) {
      const { data: inserted, error: insErr } = await supabase
        .from('persons')
        .insert({
          imie: p.imie.trim(),
          nazwisko: p.nazwisko.trim(),
          rejestrio_person_id: p.rejestrio_person_id,
          source: 'rejestrio_v2',
        })
        .select('id')
        .single()
      if (insErr) {
        // Conflict через UNIQUE rejestrio_person_id — re-fetch
        if (insErr.code === '23505' && p.rejestrio_person_id !== null) {
          const { data: refetch } = await supabase
            .from('persons')
            .select('id')
            .eq('rejestrio_person_id', p.rejestrio_person_id)
            .maybeSingle()
          if (refetch) personId = (refetch as { id: string }).id
        } else {
          throw new Error(
            `persons INSERT failed для ${p.imie} ${p.nazwisko}: ${insErr.message}`,
          )
        }
      } else if (inserted) {
        personId = (inserted as { id: string }).id
        result.inserted++
      }
    }

    if (!personId) {
      // Dry-run або failed
      result.skipped_anon++
      continue
    }

    // Step 2 — pre-check person_company_link (no unique constraint per migration 031)
    const { data: existingLink } = await supabase
      .from('person_company_links')
      .select('id')
      .eq('person_id', personId)
      .eq('prospect_id', prospectId)
      .maybeSingle()

    if (existingLink) {
      result.link_skipped++
      continue
    }

    if (!dryRun) {
      const rola = p.funkcja ?? p.rola_typ.toUpperCase()
      const jest_decyzyjny =
        p.rola_typ === 'zarzad' ||
        (p.funkcja?.toUpperCase().includes('PREZES') ?? false)

      const { error: linkErr } = await supabase
        .from('person_company_links')
        .insert({
          person_id: personId,
          prospect_id: prospectId,
          rola,
          jest_decyzyjny,
          sila_relacji: 70,
          zrodlo: 'rejestrio_v2',
          data_od: new Date().toISOString().slice(0, 10),
        })
      if (linkErr) {
        throw new Error(
          `person_company_links INSERT failed (${rola}): ${linkErr.message}`,
        )
      }
      result.linked++
    } else {
      result.linked++ // dry-run counter
    }
  }

  return result
}

async function updateDecisionMakerName(
  supabase: SupabaseClient,
  prospectId: string,
  zarzad: ExtractedPerson[],
  prokurenci: ExtractedPerson[],
  dryRun: boolean,
): Promise<string | null> {
  // First zarzad member > prokurent > null
  const candidates = [...zarzad, ...prokurenci].filter(
    (p) => p.imie?.trim() && p.nazwisko?.trim(),
  )
  if (candidates.length === 0) return null
  const first = candidates[0]
  const fullName = `${first.imie} ${first.nazwisko}`

  if (!dryRun) {
    const { error } = await supabase
      .from('ceidg_prospects')
      .update({ decision_maker_name: fullName })
      .eq('id', prospectId)
    if (error) {
      throw new Error(`decision_maker_name update failed: ${error.message}`)
    }
  }
  return fullName
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cli = parseCli()
  const apiKey = process.env.KRS_REJESTR_API_TOKEN
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!apiKey) {
    console.error('❌ Brak KRS_REJESTR_API_TOKEN w env')
    console.error('   $env:KRS_REJESTR_API_TOKEN = "<token>"  (PowerShell)')
    process.exit(1)
  }
  if (!supaKey && !cli.dryRun) {
    console.error('❌ Brak SUPABASE_SERVICE_ROLE_KEY w env (wymагany unless --dry-run)')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, supaKey ?? 'dummy', {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (cli.reset) {
    await deleteState()
    console.log('  ↺ state reset (deleted .enrich-krs-rozdzial-progress.json)\n')
  }

  console.log('\n══════ KRS rozdzial-ogolny enrichment (Phase A.2) ══════')
  console.log(
    `  mode:       ${cli.probe ? `PROBE (${cli.probe} NIPs)` : 'BULK'}`,
  )
  console.log(`  max cost:   ${cli.maxCostPln} zł`)
  console.log(`  dry-run:    ${cli.dryRun}`)
  console.log()

  console.log('📋 Fetching prospects (krs_number IS NOT NULL + decision_maker_name IS NULL)...')
  const all = await fetchProspectsToEnrich(supabase)
  console.log(`  → ${all.length} prospects eligible\n`)

  if (all.length === 0) {
    console.log('  (nothing to enrich — exiting)')
    return
  }

  const state = await loadState()
  const processed = new Set(state.processedProspectIds)
  const queue = all.filter((p) => !processed.has(p.id))
  console.log(`  → ${queue.length} after state filter (${processed.size} already processed)`)

  const limit = cli.probe ?? queue.length
  const todo = queue.slice(0, limit)
  console.log(`  → ${todo.length} planned this run\n`)

  let totalPersonsInserted = 0
  let totalLinks = 0
  let totalDecisionMakers = 0
  let total404 = 0
  let totalErrors = 0

  for (let i = 0; i < todo.length; i++) {
    const row = todo[i]

    // Cost guard
    if (state.total_cost_pln + COST_PER_CALL_PLN > cli.maxCostPln) {
      console.log(
        `\n💰 COST CAP HIT — ${state.total_cost_pln.toFixed(2)} zł (cap ${cli.maxCostPln} zł). Stopping.`,
      )
      console.log(`   Re-run з вищим --max-cost= щоб continue.`)
      break
    }

    try {
      const ogolny = await fetchRozdzialOgolny(apiKey, row.krs_number)
      state.total_calls++
      state.total_cost_pln += COST_PER_CALL_PLN

      if (!ogolny) {
        total404++
        if (!cli.probe) state.processedProspectIds.push(row.id)
      } else {
        const allPeople = [
          ...ogolny.zarzad,
          ...ogolny.prokurenci,
          ...ogolny.wspolnicy,
        ]
        const ins = await upsertPersonsAndLinks(
          supabase,
          row.id,
          allPeople,
          cli.dryRun,
        )
        totalPersonsInserted += ins.inserted
        totalLinks += ins.linked

        const dmName = await updateDecisionMakerName(
          supabase,
          row.id,
          ogolny.zarzad,
          ogolny.prokurenci,
          cli.dryRun,
        )
        if (dmName) totalDecisionMakers++

        if (!cli.probe) state.processedProspectIds.push(row.id)

        if (cli.probe || (i + 1) % 50 === 0 || i === todo.length - 1) {
          console.log(
            `  [${i + 1}/${todo.length}] krs=${row.krs_number}: ` +
              `+${ins.inserted} persons, +${ins.linked} links, dm="${dmName ?? '—'}" ` +
              `| Σ ${state.total_calls} calls, ${state.total_cost_pln.toFixed(2)} zł`,
          )
        }
      }
    } catch (e) {
      totalErrors++
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ krs=${row.krs_number}: ${msg}`)
    }

    // Save state every 50 NIPs
    if (!cli.probe && (i + 1) % 50 === 0) {
      await saveState(state)
    }
  }

  if (!cli.probe) {
    await saveState(state)
  }

  // ─── Summary ───
  console.log('\n══════ SUMMARY ══════')
  console.log(`  NIPs processed:        ${todo.length}`)
  console.log(`  Persons inserted:      ${totalPersonsInserted}`)
  console.log(`  person_company_links:  ${totalLinks}`)
  console.log(`  decision_makers set:   ${totalDecisionMakers}`)
  console.log(`  rejestrio 404:         ${total404}`)
  console.log(`  errors:                ${totalErrors}`)
  console.log(`  API calls cumulative:  ${state.total_calls}`)
  console.log(`  Cost cumulative:       ${state.total_cost_pln.toFixed(2)} zł (estimate ${COST_PER_CALL_PLN} PLN/call)`)
  if (cli.dryRun) console.log('  (DRY RUN — no DB writes)')
  if (cli.probe) {
    console.log('\n📊 PROBE complete. Якщо output matches expected:')
    console.log('   pnpm dlx tsx scripts/enrich-krs-rozdzial.ts')
    console.log('   (бeз --probe, з default 20 zł cap)')
  }
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
