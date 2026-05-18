#!/usr/bin/env tsx
// scripts/seed-test-order.ts
// Sprint S-ORDER.1.B.1 — seed 1 test order draft для cohort client
// Output: access_token URL для відкриття у браузері (1.B.2 UI smoke test)
//
// Idempotent: re-run шукає existing draft for same client first.
//
// CLI:
//   pnpm exec tsx scripts/seed-test-order.ts

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

const COHORT_ID = '57f6a19f-68d1-4cb3-996b-98119771d4a8'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Two-pass fetch — cohort_members has no FK to clients (polymorphic subject_id),
  // тому PostgREST inner-join не працює. Resolve subject_ids first, then query clients.
  const { data: members, error: mErr } = await supabase
    .from('cohort_members')
    .select('subject_id')
    .eq('cohort_id', COHORT_ID)
    .eq('subject_type', 'client')
  if (mErr) {
    console.error('Fetch cohort members failed:', mErr.message)
    process.exit(1)
  }
  if (!members || members.length === 0) {
    console.error('Cohort empty')
    process.exit(1)
  }
  const memberIds = members.map((m) => m.subject_id as string)
  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, title, nip, phone')
    .in('id', memberIds)
    .not('phone', 'is', null)
    .limit(1)
  if (cErr) {
    console.error('Fetch clients failed:', cErr.message)
    process.exit(1)
  }
  if (!clients || clients.length === 0) {
    console.error('No cohort client з phone знайдено')
    process.exit(1)
  }
  const client = clients[0] as { id: string; title: string; nip: string; phone: string }
  console.log(`Test client: ${client.title} (NIP ${client.nip}, phone ${client.phone})`)

  // Check if draft already exists для цього client (idempotent)
  const { data: existing } = await supabase
    .from('orders')
    .select('id, access_token, order_number')
    .eq('client_id', client.id)
    .eq('status', 'draft')
    .maybeSingle()
  const baseUrlLocal = 'http://localhost:3000'
  const baseUrlProd = 'https://sztab.vercel.app'
  if (existing) {
    console.log('\n[ALREADY EXISTS] draft order id:', existing.id)
    console.log('order_number:', existing.order_number)
    console.log('Public URL (local):', `${baseUrlLocal}/zamowienie/${existing.access_token}`)
    console.log('Public URL (prod):', `${baseUrlProd}/zamowienie/${existing.access_token}`)
    return
  }

  // Create new draft
  const { data: created, error } = await supabase
    .from('orders')
    .insert({
      client_id: client.id,
      cohort_id: COHORT_ID,
      order_number: 'DRAFT-TEMP',
      status: 'draft',
    })
    .select('id, access_token')
    .single()
  if (error || !created) {
    console.error('Insert failed:', error)
    process.exit(1)
  }
  console.log('\n[CREATED] draft order id:', created.id)
  console.log('Access token:', created.access_token)
  console.log('Public URL (local):', `${baseUrlLocal}/zamowienie/${created.access_token}`)
  console.log('Public URL (prod):', `${baseUrlProd}/zamowienie/${created.access_token}`)
  console.log(`\nDelete via SQL: DELETE FROM orders WHERE id = '${created.id}';`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
