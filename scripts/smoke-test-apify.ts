// scripts/smoke-test-apify.ts
// Sprint H Step 7 smoke — 3 diverse prospects з TOP-20, run enrichContactsApify
// directly. Acceptance: ≥2/3 return at least 1 contact field.

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import { enrichContactsApify } from '@/lib/enrichment/apify'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apifyKey = process.env.APIFY_API_TOKEN
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  if (!apifyKey) {
    console.error('❌ APIFY_API_TOKEN missing')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('\n══════ Sprint H — Apify Smoke Test ══════\n')

  // Pick 3 diverse prospects (різні воеводства)
  const { data: prospectRows } = await supabase
    .from('ceidg_prospects')
    .select('id, name, nip, miejscowosc, wojewodztwo, pkd_main')
    .not('nip', 'is', null)
    .limit(20)
  const prospects = (prospectRows ?? []) as Array<{
    id: string
    name: string
    nip: string
    miejscowosc: string | null
    wojewodztwo: string | null
    pkd_main: string | null
  }>

  // Pick 3 з різних воеводств
  const seenWoj = new Set<string>()
  const picked: typeof prospects = []
  for (const p of prospects) {
    const woj = p.wojewodztwo ?? '?'
    if (seenWoj.has(woj)) continue
    seenWoj.add(woj)
    picked.push(p)
    if (picked.length >= 3) break
  }
  // Fallback fill якщо менше 3 distinct woj
  if (picked.length < 3) {
    for (const p of prospects) {
      if (picked.find((x) => x.id === p.id)) continue
      picked.push(p)
      if (picked.length >= 3) break
    }
  }

  if (picked.length === 0) {
    console.error('❌ no prospects з NIP')
    process.exit(1)
  }

  console.log(`Picked ${picked.length} prospects:\n`)
  for (const p of picked) {
    console.log(`  • ${p.name} | NIP ${p.nip} | ${p.miejscowosc ?? '?'}, ${p.wojewodztwo ?? '?'} | PKD ${p.pkd_main ?? '—'}`)
  }
  console.log()

  let successful = 0
  let totalCost = 0
  const results: Array<{
    name: string
    status: string
    phone: string | null
    email: string | null
    website: string | null
    cost: number
    error?: string
  }> = []

  for (const p of picked) {
    console.log(`[${p.name}]`)
    const r = await enrichContactsApify(apifyKey, {
      name: p.name,
      city: p.miejscowosc,
      voivodeship: p.wojewodztwo,
      nip: p.nip,
    })
    console.log(`  status: ${r.status}`)
    console.log(`  phone:    ${r.phone ?? '—'}`)
    console.log(`  email:    ${r.email ?? '—'}`)
    console.log(`  website:  ${r.website ?? '—'}`)
    console.log(`  rating:   ${r.gmaps_rating ?? '—'} (${r.gmaps_reviews_count ?? '—'} reviews)`)
    console.log(`  cost:     $${r.cost_usd}`)
    if (r.error_message) console.log(`  error:    ${r.error_message}`)
    if (r.status === 'success') successful++
    totalCost += r.cost_usd
    results.push({
      name: p.name,
      status: r.status,
      phone: r.phone,
      email: r.email,
      website: r.website,
      cost: r.cost_usd,
      error: r.error_message,
    })
    console.log()
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('APIFY SMOKE RESULT')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Tested:           ${picked.length}`)
  console.log(`Status=success:   ${successful} ${successful >= 2 ? '✅' : '❌'} (≥2 needed)`)
  console.log(`Total cost:       $${totalCost.toFixed(4)}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch((err) => {
  console.error('❌ Crashed:', err)
  process.exit(1)
})
