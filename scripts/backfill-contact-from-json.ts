/**
 * S-DATA.2.C — Backfill dedicated contact columns from existing JSON sources.
 *
 * Promotes contact data що вже existуй у JSONB columns / raw_payload до
 * dedicated columns. ZERO new API calls — only DB writes.
 *
 * Sources promoted:
 *   1. clients.vat_data.result.subject.workingAddress → clients.address + city
 *      (fallback to residenceAddress якщо workingAddress NULL)
 *   2. contact_enrichment.raw_payload (apify_gmaps success only) → dedicated
 *      phone/website columns, з wrong-match protection (60% Jaccard threshold
 *      + gastronomy keyword filter to reject restaurant matches for B2B clients)
 *
 * Sources SKIPPED (already promoted in production):
 *   - regdata_krs_fullnames → persons.imie/nazwisko (handled у lookup/route.ts
 *     post-actor run, lines 1054-1073)
 *   - rejestrio_v2 → persons + person_company_links (handled у lookup post-fetch)
 *
 * Safety:
 *   - Don't overwrite existing NOT NULL/non-empty dedicated values
 *   - Whole-DB scope (311 clients) — opt-in scoping via --cohort-id
 *   - Dry-run за замовчуванням — explicit --apply flag для real writes
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-contact-from-json.ts --dry
 *   pnpm exec tsx scripts/backfill-contact-from-json.ts --apply
 *   pnpm exec tsx scripts/backfill-contact-from-json.ts --apply --cohort-id <uuid>
 *
 * Sprint S-DATA.2.C (21.05.2026).
 */

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ─── CLI args ──────────────────────────────────────────────────
const argv = process.argv.slice(2)
const DRY = !argv.includes('--apply')
const COHORT_ID_IDX = argv.indexOf('--cohort-id')
const COHORT_ID = COHORT_ID_IDX > -1 ? argv[COHORT_ID_IDX + 1] : null

// ─── Wrong-match protection ────────────────────────────────────
const GASTRO_KEYWORDS = [
  'restauracja', 'restaurant', 'pizzeria', 'pizza', 'kebab', 'kebabnia',
  'sushi', 'bar', 'pub', 'kawiarnia', 'cafe', 'café', 'cukiernia',
  'piekarnia', 'lodziarnia', 'naleśniki', 'burger', 'fast food',
  'food truck', 'jadłodajnia',
]

const LEGAL_SUFFIXES = [
  /\b(sp[óo]łka z ograniczon[aą]?\s+odpowiedzialno[sś]ci[aą]?)\b/gi,
  /\b(sp\.\s*z\s*o\.?\s*o\.?)\b/gi,
  /\b(s\.?a\.?)\b/gi,
  /\b(spółka cywilna|s\.?c\.?)\b/gi,
  /\b(p\.p\.h\.u?\.?|p\.h\.u?\.?)\b/gi,
  /\.{1,}/g,
]

function normalize(s: string): string {
  let n = s.toLowerCase()
  for (const re of LEGAL_SUFFIXES) n = n.replace(re, ' ')
  // strip diacritics
  n = n.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return n
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2)
}

function jaccardSim(a: string, b: string): number {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (ta.size === 0 || tb.size === 0) return 0
  const intersect = new Set([...ta].filter(x => tb.has(x))).size
  const union = ta.size + tb.size - intersect
  return intersect / union
}

function isGastroCategory(categories: string[] | string | null | undefined): boolean {
  if (!categories) return false
  const text = (Array.isArray(categories) ? categories.join(' ') : categories).toLowerCase()
  return GASTRO_KEYWORDS.some(k => text.includes(k))
}

const POSTAL_CITY_RE = /(\d{2}-\d{3})\s+([A-ZŁŚŻŹĆĘĄÓŃa-złśżźćęąóń\.\s\-]+?)(?:\s*,|$)/

function parseCity(addr: string): string | null {
  const m = POSTAL_CITY_RE.exec(addr)
  if (!m) return null
  return m[2].trim()
}

// ─── Step 1: backfill address+city з vat_data ─────────────────
async function backfillAddress() {
  const sel = COHORT_ID
    ? supabase.from('cohort_members').select('subject_id').eq('cohort_id', COHORT_ID).eq('subject_type', 'client')
    : null
  let clientIds: string[] | null = null
  if (sel) {
    const { data } = await sel
    clientIds = (data ?? []).map(r => r.subject_id)
  }

  let query = supabase
    .from('clients')
    .select('id, title, nip, address, city, vat_data')
  if (clientIds) query = query.in('id', clientIds)
  const { data: clients, error } = await query
  if (error) {
    console.error('fetch clients failed:', error.message)
    return
  }

  let addrUpdates = 0
  let cityUpdates = 0
  let skippedHasAddr = 0
  let skippedNoVat = 0
  const actions: Array<{ id: string; title: string; addr?: string; city?: string }> = []

  for (const c of clients ?? []) {
    const hasAddr = (c.address ?? '').trim().length > 0
    const hasCity = (c.city ?? '').trim().length > 0
    if (hasAddr && hasCity) continue

    const vd: any = c.vat_data
    const subject = vd?.result?.subject
    const srcAddr = subject?.workingAddress ?? subject?.residenceAddress
    if (!srcAddr) {
      skippedNoVat += 1
      continue
    }

    const updates: Record<string, string> = {}
    if (!hasAddr) {
      updates.address = srcAddr
      addrUpdates += 1
    } else {
      skippedHasAddr += 1
    }
    if (!hasCity) {
      const parsed = parseCity(srcAddr)
      if (parsed) {
        updates.city = parsed
        cityUpdates += 1
      }
    }

    if (Object.keys(updates).length === 0) continue
    actions.push({ id: c.id, title: (c.title ?? '').slice(0, 40), ...updates })

    if (!DRY) {
      const { error: upErr } = await supabase.from('clients').update(updates).eq('id', c.id)
      if (upErr) console.error(`update ${c.id} failed:`, upErr.message)
    }
  }

  console.log('=== Step 1: vat_data → clients.address+city ===')
  console.log(`  Clients scanned: ${clients?.length ?? 0}`)
  console.log(`  Will update address: ${addrUpdates}`)
  console.log(`  Will update city: ${cityUpdates}`)
  console.log(`  Skipped (already has address): ${skippedHasAddr}`)
  console.log(`  Skipped (no vat_data address): ${skippedNoVat}`)
  console.log(`  Mode: ${DRY ? 'DRY-RUN' : 'APPLIED'}`)
  if (actions.length) {
    console.log(`  Sample 5 actions:`)
    for (const a of actions.slice(0, 5)) {
      console.log(`    ${a.id.slice(0, 8)} | ${a.title}`)
      if (a.addr) console.log(`      address := "${a.addr.slice(0, 60)}"`)
      if (a.city) console.log(`      city := "${a.city}"`)
    }
  }
}

// ─── Step 2: contact_enrichment.raw_payload → dedicated cols ──
async function backfillContactCols() {
  let scope = supabase
    .from('contact_enrichment')
    .select('id, target_id, target_type, source, status, phone, email, website, raw_payload')
    .eq('source', 'apify_gmaps')
    .eq('status', 'success')

  if (COHORT_ID) {
    const { data: members } = await supabase
      .from('cohort_members')
      .select('subject_id')
      .eq('cohort_id', COHORT_ID)
      .eq('subject_type', 'client')
    const ids = (members ?? []).map(m => m.subject_id)
    if (ids.length) scope = scope.in('target_id', ids)
  }

  const { data: enrichments, error } = await scope
  if (error) {
    console.error('fetch contact_enrichment failed:', error.message)
    return
  }

  // Pre-fetch client titles for wrong-match check
  const targetIds = Array.from(new Set((enrichments ?? []).map(e => e.target_id)))
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, title')
    .in('id', targetIds)
  const titleById = new Map((clientRows ?? []).map(c => [c.id, c.title ?? '']))

  let phoneUpdates = 0
  let websiteUpdates = 0
  let wrongMatchFiltered = 0
  let gastroFiltered = 0
  let skippedHasValue = 0
  let skippedNoData = 0
  const actions: Array<{ id: string; clientTitle: string; gmapsTitle: string; sim: number; updates: Record<string, string> }> = []

  for (const e of enrichments ?? []) {
    const rp: any = e.raw_payload
    const item = rp?.items?.[0]
    if (!item) {
      skippedNoData += 1
      continue
    }

    const phone = item.phoneUnformatted || item.phone
    const website = item.website
    const gmapsTitle = item.title ?? ''
    const clientTitle = titleById.get(e.target_id) ?? ''

    // Wrong-match protection
    const sim = jaccardSim(clientTitle, gmapsTitle)
    const isGastro = isGastroCategory(item.categoryName || item.categories)

    if (sim < 0.6) {
      wrongMatchFiltered += 1
      continue
    }
    if (isGastro) {
      gastroFiltered += 1
      continue
    }

    const updates: Record<string, string> = {}
    if (!e.phone && phone) {
      updates.phone = phone
      phoneUpdates += 1
    }
    if (!e.website && website) {
      updates.website = website
      websiteUpdates += 1
    }

    if (Object.keys(updates).length === 0) {
      skippedHasValue += 1
      continue
    }

    actions.push({
      id: e.id,
      clientTitle: clientTitle.slice(0, 40),
      gmapsTitle: gmapsTitle.slice(0, 40),
      sim,
      updates,
    })

    if (!DRY) {
      const { error: upErr } = await supabase
        .from('contact_enrichment')
        .update(updates)
        .eq('id', e.id)
      if (upErr) console.error(`update ce ${e.id} failed:`, upErr.message)
    }
  }

  console.log('\n=== Step 2: contact_enrichment dedicated cols ===')
  console.log(`  Apify GMaps success runs scanned: ${enrichments?.length ?? 0}`)
  console.log(`  Will update phone: ${phoneUpdates}`)
  console.log(`  Will update website: ${websiteUpdates}`)
  console.log(`  Filtered (wrong-match Jaccard<60%): ${wrongMatchFiltered}`)
  console.log(`  Filtered (gastronomy category for B2B): ${gastroFiltered}`)
  console.log(`  Skipped (already has value): ${skippedHasValue}`)
  console.log(`  Skipped (no raw_payload.items): ${skippedNoData}`)
  console.log(`  Mode: ${DRY ? 'DRY-RUN' : 'APPLIED'}`)
  if (actions.length) {
    console.log(`  Sample 5 valid match actions:`)
    for (const a of actions.slice(0, 5)) {
      console.log(`    ce ${a.id.slice(0, 8)} sim=${a.sim.toFixed(2)}`)
      console.log(`      client: "${a.clientTitle}"`)
      console.log(`      gmaps : "${a.gmapsTitle}"`)
      if (a.updates.phone) console.log(`      phone := "${a.updates.phone}"`)
      if (a.updates.website) console.log(`      website := "${a.updates.website}"`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`S-DATA.2.C Backfill — ${DRY ? 'DRY-RUN' : '*** APPLY MODE ***'}`)
  console.log(`Scope: ${COHORT_ID ? `cohort ${COHORT_ID}` : 'whole DB'}`)
  console.log(`${'='.repeat(60)}\n`)

  await backfillAddress()
  await backfillContactCols()

  console.log(`\n${'='.repeat(60)}`)
  if (DRY) console.log('DRY-RUN COMPLETE. Re-run з --apply щоб write.')
  else console.log('APPLY COMPLETE.')
  console.log(`${'='.repeat(60)}\n`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
