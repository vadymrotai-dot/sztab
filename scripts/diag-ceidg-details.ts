#!/usr/bin/env tsx
// scripts/diag-ceidg-details.ts
// Sprint S-CEIDG-DETAILS Day 1 (15.05.2026) — read-only smoke test для
// CEIDG firma details flow. NO DB writes — pure CEIDG API probe + extract.
//
// CLI:
//   pnpm exec tsx scripts/diag-ceidg-details.ts            # all 4 test NIPs
//   pnpm exec tsx scripts/diag-ceidg-details.ts 1250825446 # single NIP override
//
// Cost: ~4 CEIDG calls × $0.0001 = $0.0004 total для full run.
//
// What it tests:
//   1. CEIDG `?nip=` filter — verify returns expected count
//   2. /firma/{uuid} details fetch — verify uprawnienia present
//   3. extractBrandAliasesFromKoncesje — verify regex coverage on real data
//   4. sp.z o.o. expected to miss CEIDG (these are KRS entities) — verify
//      we handle gracefully

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

import { CeidgClient } from '@/lib/ceidg/client'
import { extractBrandAliasesFromKoncesje } from '@/lib/intelligence/extract-koncesje'

// Sprint S-CEIDG-DETAILS Day 1 (15.05.2026) — CLI-safe params reader.
// getCeidgApiKey() з lib/ceidg/client.ts use @/lib/supabase/server which
// requires Next.js request scope (cookies()). Diag script runs з tsx CLI
// → throw "cookies was called outside request scope". Pattern: direct
// service-role client (mirror scripts/diag-clients-id-500.ts).
//
// params shape: SINGLE-row table, ceidg_api_key as own column (NOT key-value).
// Verified live 15.05.2026.
async function loadCeidgApiKey(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing у .env.local',
    )
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase
    .from('params')
    .select('ceidg_api_key')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`params SELECT error: ${error.message}`)
  const key = (data as { ceidg_api_key?: string | null } | null)?.ceidg_api_key
  if (!key) {
    throw new Error('params.ceidg_api_key is NULL — set via /settings → Klucze API')
  }
  return key
}

type Expected = 'jdg_with_koncesja' | 'jdg_gastronomia' | 'spzoo_skip'

interface TestNip {
  nip: string
  expected: Expected
  label: string
}

const TEST_NIPS: TestNip[] = [
  { nip: '1250825446', expected: 'jdg_with_koncesja', label: 'MARCIN BOROWY (Kemer Kebab)' },
  { nip: '1231562224', expected: 'jdg_gastronomia',  label: 'Domek Sushi (test JDG-gastronomia)' },
  { nip: '7561993172', expected: 'spzoo_skip',       label: 'KOZAK OLEK (sp. z o.o. — should skip)' },
  { nip: '8381734558', expected: 'spzoo_skip',       label: 'AGRO GROUP (sp. z o.o. hurtownia — should skip)' },
]

async function probeNip(client: CeidgClient, t: TestNip): Promise<void> {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`▶ ${t.label}  (NIP=${t.nip}, expected=${t.expected})`)
  console.log('═'.repeat(70))

  // Step 1 — CEIDG search by NIP
  let searchResult
  try {
    searchResult = await client.listFirms({ nip: t.nip }, 0, 2)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ CEIDG search threw: ${msg}`)
    return
  }
  const firmy = searchResult.firmy ?? []
  console.log(`  CEIDG search count: ${searchResult.count}`)

  if (firmy.length === 0) {
    if (t.expected === 'spzoo_skip') {
      console.log(`  ✓ EXPECTED: no CEIDG entry для sp. z o.o. (KRS-only entity)`)
    } else {
      console.log(`  ❌ UNEXPECTED: JDG NIP returned 0 firms — possibly mis-typed NIP`)
    }
    return
  }

  if (t.expected === 'spzoo_skip') {
    console.log(`  ⚠ RED FLAG: sp. z o.o. found у CEIDG (${firmy[0].nazwa}) — bad data, investigate`)
    // Continue anyway — log uprawnienia якщо present
  }

  const firma = firmy[0]
  console.log(`  firmy[0]:`)
  console.log(`    id:     ${firma.id}`)
  console.log(`    nazwa:  ${firma.nazwa}`)
  console.log(`    status: ${firma.status}`)
  console.log(`    wlasciciel: ${firma.wlasciciel.imie} ${firma.wlasciciel.nazwisko}`)

  // Step 2 — fetch details
  let details
  try {
    details = await client.getFirmDetails(firma.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ getFirmDetails threw: ${msg}`)
    return
  }
  if (!details) {
    console.error(`  ❌ getFirmDetails returned null`)
    return
  }

  const uprawnienia = details.uprawnienia ?? []
  console.log(`  uprawnienia.length: ${uprawnienia.length}`)
  if (uprawnienia.length > 0) {
    for (const [i, u] of uprawnienia.entries()) {
      console.log(`    [${i}] nazwa: ${u.nazwa?.slice(0, 80) ?? '(no nazwa)'}`)
      console.log(`        opis:  ${u.opis ?? '(no opis)'}`)
      console.log(`        dataOd→Do: ${u.dataOd ?? '?'} → ${u.dataDo ?? '?'}`)
    }
  } else {
    if (t.expected === 'jdg_with_koncesja') {
      console.log(`  ❌ UNEXPECTED: expected уprawnienia but got 0`)
    } else {
      console.log(`  ✓ JDG без koncesji (normal for many small JDG without alcohol/event permits)`)
    }
  }

  // Step 3 — extract aliases
  const aliases = extractBrandAliasesFromKoncesje(uprawnienia)
  console.log(`\n  extractBrandAliasesFromKoncesje → ${aliases.length} aliases:`)
  for (const a of aliases) {
    console.log(`    {brand: "${a.brand}", kind: "${a.kind}", address: ${a.address ? `"${a.address}"` : 'null'}}`)
  }

  // Verdict
  if (t.expected === 'jdg_with_koncesja') {
    if (aliases.length > 0) {
      console.log(`\n  ✅ PASS: ${aliases.length} brand_aliases extracted (expected ≥1)`)
    } else {
      console.log(`\n  ❌ FAIL: 0 aliases (expected ≥1)`)
    }
  } else if (t.expected === 'jdg_gastronomia') {
    console.log(
      `\n  ℹ INFO: aliases.length=${aliases.length} (variable — gastronomia JDG may or may not have alcohol koncesja)`,
    )
  }
}

async function main() {
  const overrideNip = process.argv[2]
  let testSet: TestNip[]
  if (overrideNip) {
    testSet = [{ nip: overrideNip, expected: 'jdg_with_koncesja', label: `CLI override` }]
  } else {
    testSet = TEST_NIPS
  }

  const apiKey = await loadCeidgApiKey()
  const client = new CeidgClient(apiKey)

  console.log(`CEIDG details diag — ${testSet.length} NIP(s) to probe`)

  for (const t of testSet) {
    await probeNip(client, t)
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`Diag complete. Cost estimate: ${testSet.length * 2} CEIDG API calls ≈ $${(testSet.length * 2 * 0.0001).toFixed(4)}`)
  console.log('═'.repeat(70))
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
