// scripts/enrich-krs-bulk.ts
// Bulk KRS enrichment for records з krs_number set.
// Polite throttle: 1 req/s built-in (lib/enrichment/krs.ts).
//
// Run:
//   pnpm exec tsx scripts/enrich-krs-bulk.ts [--limit=N] [--target=prospects|clients|both]

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'

import { enrichWithKRS, KrsNotFoundError } from '@/lib/enrichment/krs'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

interface CliFlags {
  limit: number | null
  target: 'prospects' | 'clients' | 'both'
}

function parseCli(): CliFlags {
  const args = process.argv.slice(2)
  let limit: number | null = null
  let target: 'prospects' | 'clients' | 'both' = 'both'
  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.split('=')[1] ?? '', 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg.startsWith('--target=')) {
      const t = arg.split('=')[1]
      if (t === 'prospects' || t === 'clients' || t === 'both') target = t
    }
  }
  return { limit, target }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processTable(
  supabase: any,
  table: 'ceidg_prospects' | 'clients',
  limit: number | null,
): Promise<{ processed: number; updated: number; notFound: number; errors: number }> {
  const nameColumn = table === 'ceidg_prospects' ? 'name' : 'title'

  let query = supabase
    .from(table)
    .select(`id, krs_number, ${nameColumn}, krs_last_checked`)
    .not('krs_number', 'is', null)
    .is('krs_last_checked', null)
  if (limit !== null) query = query.limit(limit)

  const { data: rows, error } = await query
  if (error) {
    console.error(`❌ Read ${table} failed:`, error.message)
    return { processed: 0, updated: 0, notFound: 0, errors: 1 }
  }
  const records = (rows ?? []) as Array<{
    id: string
    krs_number: string | null
    [k: string]: unknown
  }>
  console.log(`\n[KRS bulk] ${table}: ${records.length} records to enrich`)

  let processed = 0
  let updated = 0
  let notFound = 0
  let errors = 0

  for (const [idx, record] of records.entries()) {
    if (!record.krs_number) continue
    const name = (record[nameColumn] as string | undefined) ?? '?'
    process.stdout.write(`  [${idx + 1}/${records.length}] krs=${record.krs_number} (${name.slice(0, 30)}) ... `)

    try {
      const data = await enrichWithKRS(record.krs_number)
      const { error: upErr } = await supabase
        .from(table)
        .update({
          krs_data: data.raw,
          krs_full_name: data.full_name,
          krs_legal_form: data.legal_form,
          krs_registration_date: data.registration_date,
          krs_management_board: data.management_board,
          krs_pkd_with_descriptions: data.pkd_with_descriptions,
          krs_status: data.status,
          krs_last_checked: data.checked_at,
        })
        .eq('id', record.id)
      if (upErr) {
        console.log(`❌ DB: ${upErr.message}`)
        errors += 1
      } else {
        console.log(
          `✓ ${data.legal_form ?? '?'} / ${data.status} / ${data.pkd_with_descriptions.length} PKD / ${data.management_board.length} board`,
        )
        updated += 1
      }
    } catch (err) {
      if (err instanceof KrsNotFoundError) {
        console.log(`— not found in any rejestr`)
        notFound += 1
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`❌ ${msg.slice(0, 100)}`)
        errors += 1
      }
    }
    processed += 1
  }

  return { processed, updated, notFound, errors }
}

async function main() {
  const flags = parseCli()
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaKey) {
    console.error('❌ Brak SUPABASE_SERVICE_ROLE_KEY w env (run setup-env.ts)')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`\n══════ KRS bulk enrichment ══════`)
  console.log(`  target: ${flags.target}`)
  console.log(`  limit:  ${flags.limit ?? '∞'}`)

  const totals = { processed: 0, updated: 0, notFound: 0, errors: 0 }

  if (flags.target === 'prospects' || flags.target === 'both') {
    const r = await processTable(supabase, 'ceidg_prospects', flags.limit)
    totals.processed += r.processed
    totals.updated += r.updated
    totals.notFound += r.notFound
    totals.errors += r.errors
  }

  if (flags.target === 'clients' || flags.target === 'both') {
    const r = await processTable(supabase, 'clients', flags.limit)
    totals.processed += r.processed
    totals.updated += r.updated
    totals.notFound += r.notFound
    totals.errors += r.errors
  }

  console.log(`\n══════ Summary ══════`)
  console.log(`  processed: ${totals.processed}`)
  console.log(`  updated:   ${totals.updated}`)
  console.log(`  not found: ${totals.notFound}`)
  console.log(`  errors:    ${totals.errors}`)
  console.log(`\n✅ Done.`)
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
