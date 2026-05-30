// scripts/backfill-cpf-to-clients.ts
// Sprint TYDZIEN2.T2.1 (28.05.2026) — one-shot backfill cpf→clients.
//
// Reads active company_profile_fields для CLIENT_WRITEBACK_FIELDS
// (email/phone/website), and writes wartość back до clients.{field}
// JEŻELI clients.{field} jest NULL or ''. Conflict (clients has different
// value): SKIP + log do tmp/sync-conflicts.md.
//
// Usage:
//   pnpm tsx scripts/backfill-cpf-to-clients.ts          # dry-run
//   pnpm tsx scripts/backfill-cpf-to-clients.ts --apply  # real updates
//
// Idempotent — safe re-run. Per-row UPDATE (no batch transaction; Supabase
// REST). NIE komitujemy this script per protocol — utility tool.
//
// NON-GOALS:
//   - facebook_url / instagram_url (NO columns у clients schema yet)
//   - city / address (cpf does not source them — separate sprint)
//   - overwrite (NULL-only policy)

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const SYNCABLE_FIELDS = ['email', 'phone', 'website'] as const
type Field = (typeof SYNCABLE_FIELDS)[number]

interface CpfRow {
  client_id: string
  value_text: string | null
  source: string
  source_priority: number
}

interface ClientRow {
  id: string
  title: string
  email: string | null
  phone: string | null
  website: string | null
}

interface Conflict {
  client_id: string
  client_title: string
  field: Field
  clients_value: string
  cpf_value: string
  cpf_source: string
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function fetchCpfForField(field: Field): Promise<CpfRow[]> {
  const rows: CpfRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('company_profile_fields')
      .select('client_id, value_text, source, source_priority')
      .eq('field_key', field)
      .is('superseded_at', null)
      .not('client_id', 'is', null)
      .not('value_text', 'is', null)
      .range(offset, offset + 999)
    if (error) throw new Error(`fetchCpfForField ${field}: ${error.message}`)
    const chunk = (data ?? []) as CpfRow[]
    rows.push(...chunk)
    if (chunk.length < 1000) break
    offset += 1000
  }
  return rows
}

function isEmpty(v: string | null | undefined): boolean {
  return v === null || v === undefined || v === ''
}

function valuesEqual(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim()
}

async function main(): Promise<void> {
  console.log(`[backfill] mode = ${APPLY ? 'APPLY (real UPDATE)' : 'DRY-RUN'}`)
  console.log(`[backfill] syncable fields: ${SYNCABLE_FIELDS.join(', ')}`)

  // Load all clients once (~331 rows)
  const { data: clientsRaw, error: clErr } = await supabase
    .from('clients')
    .select('id, title, email, phone, website')
    .range(0, 999)
  if (clErr) throw new Error(`load clients: ${clErr.message}`)
  const clients = (clientsRaw ?? []) as ClientRow[]
  const clientMap = new Map<string, ClientRow>(clients.map((c) => [c.id, c]))
  console.log(`[backfill] loaded ${clients.length} clients`)

  const summary: Record<Field, { backfill_candidates: number; updated: number; conflicts: number; skipped_filled: number; cpf_total: number }> =
    {
      email: { backfill_candidates: 0, updated: 0, conflicts: 0, skipped_filled: 0, cpf_total: 0 },
      phone: { backfill_candidates: 0, updated: 0, conflicts: 0, skipped_filled: 0, cpf_total: 0 },
      website: { backfill_candidates: 0, updated: 0, conflicts: 0, skipped_filled: 0, cpf_total: 0 },
    }
  const conflicts: Conflict[] = []
  const sampleUpdates: Record<Field, Array<{ client_title: string; old: string; new: string; source: string }>> = {
    email: [], phone: [], website: [],
  }

  for (const field of SYNCABLE_FIELDS) {
    const cpfRows = await fetchCpfForField(field)
    summary[field].cpf_total = cpfRows.length
    console.log(`\n[backfill] === field=${field} | cpf active rows: ${cpfRows.length} ===`)

    for (const cpf of cpfRows) {
      const client = clientMap.get(cpf.client_id)
      if (!client) continue
      const current = client[field]
      const newVal = (cpf.value_text ?? '').trim()
      if (!newVal) continue

      if (isEmpty(current)) {
        summary[field].backfill_candidates++
        if (sampleUpdates[field].length < 5) {
          sampleUpdates[field].push({
            client_title: client.title,
            old: '(empty)',
            new: newVal,
            source: cpf.source,
          })
        }
        if (APPLY) {
          const { error } = await supabase
            .from('clients')
            .update({ [field]: newVal, updated_at: new Date().toISOString() })
            .eq('id', cpf.client_id)
          if (error) {
            console.error(`  [error] ${cpf.client_id}.${field}: ${error.message}`)
          } else {
            summary[field].updated++
            // mutate cached client so subsequent fields see updated state.
            // Cast via unknown — ClientRow ma named props без index signature.
            ;(client as unknown as Record<string, unknown>)[field] = newVal
          }
        }
      } else if (!valuesEqual(current as string, newVal)) {
        summary[field].conflicts++
        conflicts.push({
          client_id: cpf.client_id,
          client_title: client.title,
          field,
          clients_value: current as string,
          cpf_value: newVal,
          cpf_source: cpf.source,
        })
      } else {
        // values equal — already in sync
        summary[field].skipped_filled++
      }
    }
  }

  // Print summary table
  console.log('\n=== SUMMARY ===')
  console.log('field    | cpf | candidates(empty+cpf) | updated | conflicts | already_synced')
  console.log('---------|-----|-----------------------|---------|-----------|---------------')
  for (const f of SYNCABLE_FIELDS) {
    const s = summary[f]
    console.log(
      `${f.padEnd(8)} | ${String(s.cpf_total).padStart(3)} | ${String(s.backfill_candidates).padStart(21)} | ${String(s.updated).padStart(7)} | ${String(s.conflicts).padStart(9)} | ${String(s.skipped_filled).padStart(13)}`,
    )
  }

  // Sample updates (dry-run shows what WOULD apply)
  if (!APPLY) {
    console.log('\n=== SAMPLE UPDATES (max 5 per field) — DRY-RUN ===')
    for (const f of SYNCABLE_FIELDS) {
      console.log(`\n[${f}]`)
      for (const u of sampleUpdates[f]) {
        console.log(`  ${u.client_title.slice(0, 50).padEnd(50)} ${u.old.padEnd(8)} → ${u.new}  (${u.source})`)
      }
      if (sampleUpdates[f].length === 0) console.log('  (none)')
    }
  }

  // Conflict log
  if (conflicts.length > 0) {
    const path = 'tmp/sync-conflicts.md'
    try {
      mkdirSync(dirname(path), { recursive: true })
    } catch {
      // ignore
    }
    const lines: string[] = []
    lines.push('# cpf→clients Sync Conflicts')
    lines.push('')
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
    lines.push('')
    lines.push('NULL-only policy → SKIP (clients value wins).')
    lines.push('Vadym manual review for each row recommended.')
    lines.push('')
    lines.push('| client_title | field | clients.X | cpf.value | cpf.source |')
    lines.push('|---|---|---|---|---|')
    for (const c of conflicts) {
      lines.push(
        `| ${c.client_title.slice(0, 60)} | ${c.field} | ${c.clients_value.slice(0, 60)} | ${c.cpf_value.slice(0, 60)} | ${c.cpf_source} |`,
      )
    }
    writeFileSync(path, lines.join('\n') + '\n', 'utf8')
    console.log(`\n[backfill] wrote ${conflicts.length} conflicts → ${path}`)
  } else {
    console.log('\n[backfill] no conflicts detected')
  }

  if (!APPLY) {
    console.log('\n[backfill] DRY-RUN complete. Re-run з --apply щоб writeback.')
  } else {
    console.log('\n[backfill] APPLY complete.')
  }
}

main().catch((e) => {
  console.error('[backfill] fatal:', e)
  process.exit(1)
})
