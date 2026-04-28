// scripts/enrich-gus-bulk.ts
// Bulk GUS enrichment dla ceidg_prospects + clients without gus_data.
//
// Run:
//   pnpm exec tsx scripts/enrich-gus-bulk.ts [--limit=N] [--target=prospects|clients|both]

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'

import { enrichWithGUS, gusLogin } from '@/lib/enrichment/gus'

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
  sessionId: string,
  table: 'ceidg_prospects' | 'clients',
  limit: number | null,
): Promise<{ processed: number; updated: number; errors: number }> {
  const nameColumn = table === 'ceidg_prospects' ? 'name' : 'title'

  let query = supabase
    .from(table)
    .select(`id, nip, ${nameColumn}, gus_last_checked`)
    .not('nip', 'is', null)
    .is('gus_last_checked', null)
  if (limit !== null) query = query.limit(limit)

  const { data: rows, error } = await query
  if (error) {
    console.error(`❌ Read ${table} failed:`, error.message)
    return { processed: 0, updated: 0, errors: 1 }
  }
  const records = (rows ?? []) as Array<{
    id: string
    nip: string | null
    [k: string]: unknown
  }>
  console.log(`\n[GUS bulk] ${table}: ${records.length} records to enrich`)

  let processed = 0
  let updated = 0
  let errors = 0

  for (const [idx, record] of records.entries()) {
    if (!record.nip) continue
    const cleanNip = record.nip.replace(/\D/g, '')
    if (cleanNip.length !== 10) continue
    const name = (record[nameColumn] as string | undefined) ?? '?'
    process.stdout.write(`  [${idx + 1}/${records.length}] nip=${cleanNip} (${name.slice(0, 30)}) ... `)

    try {
      const data = await enrichWithGUS(sessionId, cleanNip)
      const { error: upErr } = await supabase
        .from(table)
        .update({
          gus_data: data.raw,
          gus_legal_name: data.legal_name,
          gus_regon: data.regon,
          gus_status: data.status,
          registered_date: data.registered_date,
          employee_count_range: data.employee_count_range,
          pkd_codes: data.pkd_codes,
          gus_last_checked: data.checked_at,
        })
        .eq('id', record.id)
      if (upErr) {
        console.log(`❌ DB: ${upErr.message}`)
        errors += 1
      } else {
        const summary = data.found
          ? `${data.status ?? '?'} / ${data.employee_count_range ?? '?'} pracownik / ${data.pkd_codes.length} pkd`
          : 'NOT FOUND'
        console.log(`✓ ${summary}`)
        updated += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`❌ ${msg.slice(0, 100)}`)
      errors += 1
    }
    processed += 1
  }

  return { processed, updated, errors }
}

async function main() {
  const flags = parseCli()
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const gusKey = process.env.GUS_API_KEY
  if (!supaKey) {
    console.error('❌ Brak SUPABASE_SERVICE_ROLE_KEY w env (run setup-env.ts)')
    process.exit(1)
  }
  if (!gusKey) {
    console.error('❌ Brak GUS_API_KEY w env (run setup-env.ts)')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`\n══════ GUS bulk enrichment ══════`)
  console.log(`  target: ${flags.target}`)
  console.log(`  limit:  ${flags.limit ?? '∞'}`)

  console.log(`\n[GUS] Login...`)
  const sessionId = await gusLogin(gusKey)
  console.log(`[GUS] sessionId acquired (${sessionId.length} chars)`)

  const totals = { processed: 0, updated: 0, errors: 0 }

  if (flags.target === 'prospects' || flags.target === 'both') {
    const r = await processTable(supabase, sessionId, 'ceidg_prospects', flags.limit)
    totals.processed += r.processed
    totals.updated += r.updated
    totals.errors += r.errors
  }

  if (flags.target === 'clients' || flags.target === 'both') {
    const r = await processTable(supabase, sessionId, 'clients', flags.limit)
    totals.processed += r.processed
    totals.updated += r.updated
    totals.errors += r.errors
  }

  console.log(`\n══════ Summary ══════`)
  console.log(`  processed: ${totals.processed}`)
  console.log(`  updated:   ${totals.updated}`)
  console.log(`  errors:    ${totals.errors}`)
  console.log(`\n✅ Done.`)
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
