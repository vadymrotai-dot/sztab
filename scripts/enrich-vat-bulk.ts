// scripts/enrich-vat-bulk.ts
// Bulk VAT enrichment dla ceidg_prospects + clients without vat_data.
//
// Prereq: .env.local with SUPABASE_SERVICE_ROLE_KEY (run setup-env.ts).
//
// Run:
//   pnpm dlx tsx scripts/enrich-vat-bulk.ts [--limit=N] [--target=prospects|clients|both]
//
// Resumable: czyta tylko rekordy z vat_last_checked IS NULL. Re-run
// pomija już wzbogacone (idempotent). Use --refresh-stale=DAYS żeby
// re-fetch starsze niż N dni (e.g. monthly refresh).

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'

import { enrichWithVAT, normalizeNip, isValidNip } from '@/lib/enrichment/vat'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

interface CliFlags {
  limit: number | null
  target: 'prospects' | 'clients' | 'both'
  refreshStaleDays: number | null
}

function parseCli(): CliFlags {
  const args = process.argv.slice(2)
  let limit: number | null = null
  let target: 'prospects' | 'clients' | 'both' = 'both'
  let refreshStaleDays: number | null = null
  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.split('=')[1] ?? '', 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg.startsWith('--target=')) {
      const t = arg.split('=')[1]
      if (t === 'prospects' || t === 'clients' || t === 'both') target = t
    } else if (arg.startsWith('--refresh-stale=')) {
      const n = Number.parseInt(arg.split('=')[1] ?? '', 10)
      if (Number.isFinite(n) && n > 0) refreshStaleDays = n
    } else {
      console.error(`❌ Unknown arg: ${arg}`)
      process.exit(1)
    }
  }
  return { limit, target, refreshStaleDays }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processTable(
  supabase: any,
  table: 'ceidg_prospects' | 'clients',
  limit: number | null,
  refreshStaleDays: number | null,
): Promise<{ processed: number; updated: number; skipped: number; errors: number }> {
  const idColumn = table === 'ceidg_prospects' ? 'id' : 'id'
  const nameColumn = table === 'ceidg_prospects' ? 'name' : 'title'

  let query = supabase
    .from(table)
    .select(`${idColumn}, nip, ${nameColumn}, vat_last_checked`)
    .not('nip', 'is', null)

  if (refreshStaleDays !== null) {
    const cutoff = new Date(Date.now() - refreshStaleDays * 86_400_000).toISOString()
    query = query.or(`vat_last_checked.is.null,vat_last_checked.lt.${cutoff}`)
  } else {
    query = query.is('vat_last_checked', null)
  }

  if (limit !== null) query = query.limit(limit)

  const { data: rows, error } = await query
  if (error) {
    console.error(`❌ Read ${table} failed:`, error.message)
    return { processed: 0, updated: 0, skipped: 0, errors: 1 }
  }

  const records = (rows ?? []) as Array<{
    id: string
    nip: string | null
    [k: string]: unknown
  }>

  console.log(`\n[VAT bulk] ${table}: ${records.length} records to enrich`)

  let processed = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const [idx, record] of records.entries()) {
    if (!record.nip) {
      skipped += 1
      continue
    }
    const cleanNip = normalizeNip(record.nip)
    if (!isValidNip(cleanNip)) {
      console.warn(`  [${idx + 1}/${records.length}] skip: invalid NIP "${record.nip}"`)
      skipped += 1
      continue
    }

    const name = (record[nameColumn] as string | undefined) ?? '?'
    process.stdout.write(`  [${idx + 1}/${records.length}] nip=${cleanNip} (${name.slice(0, 30)}) ... `)

    try {
      const vatData = await enrichWithVAT(cleanNip)
      const { error: upErr } = await supabase
        .from(table)
        .update({
          vat_data: vatData.raw,
          vat_status: vatData.status,
          vat_registered_date: vatData.registered_date,
          vat_bank_accounts: vatData.bank_accounts,
          vat_last_checked: vatData.checked_at,
        })
        .eq('id', record.id)

      if (upErr) {
        console.log(`❌ DB error: ${upErr.message}`)
        errors += 1
      } else {
        console.log(`✓ ${vatData.status}`)
        updated += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`❌ ${msg.slice(0, 100)}`)
      errors += 1
    }

    processed += 1
  }

  return { processed, updated, skipped, errors }
}

async function main() {
  const flags = parseCli()
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaKey) {
    console.error('❌ Brak SUPABASE_SERVICE_ROLE_KEY w env')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`\n══════ VAT bulk enrichment ══════`)
  console.log(`  target: ${flags.target}`)
  console.log(`  limit:  ${flags.limit ?? '∞'}`)
  console.log(`  refresh-stale-days: ${flags.refreshStaleDays ?? 'OFF (only NULL last_checked)'}`)

  const totals = { processed: 0, updated: 0, skipped: 0, errors: 0 }

  if (flags.target === 'prospects' || flags.target === 'both') {
    const r = await processTable(supabase, 'ceidg_prospects', flags.limit, flags.refreshStaleDays)
    totals.processed += r.processed
    totals.updated += r.updated
    totals.skipped += r.skipped
    totals.errors += r.errors
  }

  if (flags.target === 'clients' || flags.target === 'both') {
    const r = await processTable(supabase, 'clients', flags.limit, flags.refreshStaleDays)
    totals.processed += r.processed
    totals.updated += r.updated
    totals.skipped += r.skipped
    totals.errors += r.errors
  }

  console.log(`\n══════ Summary ══════`)
  console.log(`  processed:  ${totals.processed}`)
  console.log(`  updated:    ${totals.updated}`)
  console.log(`  skipped:    ${totals.skipped}`)
  console.log(`  errors:     ${totals.errors}`)
  console.log(`\n✅ Done.`)
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
