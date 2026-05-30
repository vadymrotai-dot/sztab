// scripts/seed-contact-methods.ts
// Sprint TYDZIEN2.T2.4.A (28.05.2026) — one-shot seed client_contact_methods.
//
// Reads:
//   - clients.email/phone/website (T2.1 backfilled) → primary methods
//   - company_profile_fields actives для email/phone/website/facebook_url/instagram_url
//     → additional methods з provenance tag (cpf.source)
//
// Dedupe: normalize value before comparison
//   - email: trim + lowercase
//   - phone: strip non-digit
//   - website: lowercase + strip protocol + strip trailing slash
// Final storage uses original (non-normalized) value, але dedupe порівняння
// проти normalized; UNIQUE INDEX (client_id, kind, value) handles DB-level dup.
//
// is_primary logic:
//   - clients.email/phone/website (якщо present) → primary
//   - cpf actives → additional (is_primary=FALSE)
//   - facebook/instagram (cpf only) → first one = primary, rest additional
//
// Usage:
//   pnpm dlx tsx scripts/seed-contact-methods.ts          # dry-run
//   pnpm dlx tsx scripts/seed-contact-methods.ts --apply  # real INSERT
//
// Idempotent (ON CONFLICT DO NOTHING). NIE komitować — untracked utility.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

type Kind = 'email' | 'phone' | 'website' | 'facebook' | 'instagram'

interface ClientRow {
  id: string
  owner_id: string
  email: string | null
  phone: string | null
  website: string | null
}

interface CpfRow {
  client_id: string
  field_key: string
  value_text: string | null
  source: string
}

interface Candidate {
  client_id: string
  owner_id: string
  kind: Kind
  value: string           // original (for storage)
  normalized: string      // for dedupe comparison
  label: string | null
  is_primary: boolean
  source: string
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function normalize(kind: Kind, value: string): string {
  const v = value.trim()
  if (kind === 'email') return v.toLowerCase()
  if (kind === 'phone') return v.replace(/[^\d+]/g, '')
  if (kind === 'website' || kind === 'facebook' || kind === 'instagram') {
    return v.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }
  return v.toLowerCase()
}

function cpfFieldToKind(field_key: string): Kind | null {
  switch (field_key) {
    case 'email':
      return 'email'
    case 'phone':
      return 'phone'
    case 'website':
      return 'website'
    case 'facebook_url':
      return 'facebook'
    case 'instagram_url':
      return 'instagram'
    default:
      return null
  }
}

async function loadClients(): Promise<ClientRow[]> {
  const rows: ClientRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, owner_id, email, phone, website')
      .range(offset, offset + 999)
    if (error) throw new Error(`load clients: ${error.message}`)
    const chunk = (data ?? []) as ClientRow[]
    rows.push(...chunk)
    if (chunk.length < 1000) break
    offset += 1000
  }
  return rows
}

async function loadCpfRows(): Promise<CpfRow[]> {
  const rows: CpfRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('company_profile_fields')
      .select('client_id, field_key, value_text, source')
      .is('superseded_at', null)
      .not('client_id', 'is', null)
      .not('value_text', 'is', null)
      .in('field_key', ['email', 'phone', 'website', 'facebook_url', 'instagram_url'])
      .range(offset, offset + 999)
    if (error) throw new Error(`load cpf: ${error.message}`)
    const chunk = (data ?? []) as CpfRow[]
    rows.push(...chunk)
    if (chunk.length < 1000) break
    offset += 1000
  }
  return rows
}

async function main(): Promise<void> {
  console.log(`[seed] mode = ${APPLY ? 'APPLY (real INSERT)' : 'DRY-RUN'}`)

  const clients = await loadClients()
  const cpfRows = await loadCpfRows()
  console.log(`[seed] loaded ${clients.length} clients, ${cpfRows.length} cpf rows`)

  const clientMap = new Map<string, ClientRow>(clients.map((c) => [c.id, c]))

  // Build per-client candidate lists
  const perClient = new Map<string, Candidate[]>()
  function addCandidate(c: Candidate): void {
    const list = perClient.get(c.client_id) ?? []
    // dedupe in-memory by normalized value (prevent same value pushed via
    // clients.email i cpf[email] simultaneously)
    if (list.some((x) => x.kind === c.kind && x.normalized === c.normalized)) return
    list.push(c)
    perClient.set(c.client_id, list)
  }

  // Pass 1: clients.* — primary candidates з source='migration_seed'
  for (const c of clients) {
    const fields: Array<[Kind, string | null]> = [
      ['email', c.email],
      ['phone', c.phone],
      ['website', c.website],
    ]
    for (const [kind, raw] of fields) {
      if (!raw || !raw.trim()) continue
      addCandidate({
        client_id: c.id,
        owner_id: c.owner_id,
        kind,
        value: raw.trim(),
        normalized: normalize(kind, raw),
        label: null,
        is_primary: true, // clients.* is canonical primary (per T2.1 sync)
        source: 'migration_seed',
      })
    }
  }

  // Pass 2: cpf actives — additional (or primary якщо clients.* puste для тego kind)
  for (const r of cpfRows) {
    const kind = cpfFieldToKind(r.field_key)
    if (!kind || !r.value_text || !r.value_text.trim()) continue
    const client = clientMap.get(r.client_id)
    if (!client) continue // orphan cpf row — skip

    const normalized = normalize(kind, r.value_text)
    const list = perClient.get(r.client_id) ?? []
    // Якщо тієї ж kind ще немає primary — це стане primary
    const hasPrimaryOfKind = list.some((x) => x.kind === kind && x.is_primary)
    addCandidate({
      client_id: r.client_id,
      owner_id: client.owner_id,
      kind,
      value: r.value_text.trim(),
      normalized,
      label: null,
      is_primary: !hasPrimaryOfKind,
      source: r.source,
    })
  }

  // Stats
  const byKind: Record<string, number> = {}
  const primaryByKind: Record<string, number> = {}
  let totalCandidates = 0
  for (const list of perClient.values()) {
    totalCandidates += list.length
    for (const c of list) {
      byKind[c.kind] = (byKind[c.kind] ?? 0) + 1
      if (c.is_primary) primaryByKind[c.kind] = (primaryByKind[c.kind] ?? 0) + 1
    }
  }

  console.log('\n=== CANDIDATE SUMMARY ===')
  console.log(`Clients з ≥1 method: ${perClient.size} / ${clients.length}`)
  console.log(`Total candidates: ${totalCandidates}`)
  console.log('\nBy kind:')
  for (const k of ['email', 'phone', 'website', 'facebook', 'instagram'] as Kind[]) {
    console.log(`  ${k.padEnd(10)} total=${(byKind[k] ?? 0).toString().padStart(4)}  primary=${(primaryByKind[k] ?? 0).toString().padStart(4)}`)
  }

  // Sample 5 candidates з kожного kind
  console.log('\n=== SAMPLE (max 5 per kind) ===')
  const sampleByKind: Record<string, Candidate[]> = {}
  for (const list of perClient.values()) {
    for (const c of list) {
      const arr = sampleByKind[c.kind] ?? []
      if (arr.length < 5) {
        arr.push(c)
        sampleByKind[c.kind] = arr
      }
    }
  }
  for (const k of ['email', 'phone', 'website', 'facebook', 'instagram']) {
    console.log(`\n[${k}]`)
    for (const c of sampleByKind[k] ?? []) {
      const flag = c.is_primary ? '⭐' : '  '
      console.log(`  ${flag} ${c.value.slice(0, 55).padEnd(55)} [${c.source}]  client=${c.client_id.slice(0, 8)}…`)
    }
    if (!sampleByKind[k]?.length) console.log('  (none)')
  }

  if (!APPLY) {
    console.log('\n[seed] DRY-RUN complete. Re-run з --apply щоб INSERT.')
    return
  }

  // APPLY mode — batched INSERTs через Supabase REST (PostgREST upsert)
  console.log('\n=== APPLY: INSERT з ON CONFLICT DO NOTHING ===')
  const allRows: Array<{
    client_id: string
    owner_id: string
    kind: Kind
    value: string
    label: string | null
    is_primary: boolean
    source: string
  }> = []
  for (const list of perClient.values()) {
    for (const c of list) {
      allRows.push({
        client_id: c.client_id,
        owner_id: c.owner_id,
        kind: c.kind,
        value: c.value,
        label: c.label,
        is_primary: c.is_primary,
        source: c.source,
      })
    }
  }

  // Batch 500 rows per INSERT
  let inserted = 0
  let conflicts = 0
  let errors = 0
  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500)
    const { data, error } = await supabase
      .from('client_contact_methods')
      .upsert(batch, {
        onConflict: 'client_id,kind,value',
        ignoreDuplicates: true, // ON CONFLICT DO NOTHING
      })
      .select('id')
    if (error) {
      console.error(`  [error] batch ${i / 500}: ${error.message}`)
      errors += batch.length
      continue
    }
    const insertedNow = (data ?? []).length
    inserted += insertedNow
    conflicts += batch.length - insertedNow
    console.log(`  batch ${(i / 500) | 0}: ${insertedNow} inserted, ${batch.length - insertedNow} conflicts`)
  }

  console.log(`\n[seed] APPLY complete: ${inserted} inserted, ${conflicts} conflicts, ${errors} errors`)
}

main().catch((e) => {
  console.error('[seed] fatal:', e)
  process.exit(1)
})
