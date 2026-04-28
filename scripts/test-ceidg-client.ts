// scripts/test-ceidg-client.ts
// Local smoke test dla CeidgClient.
//
// Prereq: .env.local with CEIDG_API_KEY (run setup-env.ts).
//
// Run:
//   pnpm dlx tsx scripts/test-ceidg-client.ts
//
// Lub w bash:
//   CEIDG_API_KEY=<jwt> pnpm tsx scripts/test-ceidg-client.ts
//
// Sprawdza:
//   1. listFirms({pkd:'5610A', wojewodztwo:'mazowieckie', status:'AKTYWNY'}, 1, 10)
//   2. getFirmDetails(firms[0].id)
//   3. Rate limiter timing dla 5 sekwencyjnych calls
//
// NIE woła getCeidgApiKey() (to wymaga Next.js cookies context).

import 'dotenv/config'

import { CeidgClient, normalizePkd } from '@/lib/ceidg/client'

const apiKey = process.env.CEIDG_API_KEY
if (!apiKey) {
  console.error('❌ Brak CEIDG_API_KEY w env. Przykład (PowerShell):')
  console.error('   $env:CEIDG_API_KEY="<jwt>"; pnpm tsx scripts/test-ceidg-client.ts')
  process.exit(1)
}

async function main() {
  const client = new CeidgClient(apiKey!)

  // ──────────────────────────────────────────────────────────
  // Test 1: listFirms
  // ──────────────────────────────────────────────────────────
  console.log('\n══════ TEST 1: listFirms ══════')
  console.log('  filters: pkd=5610A, wojewodztwo=mazowieckie, status=AKTYWNY')
  console.log('  page=1, limit=10\n')

  const list = await client.listFirms(
    { pkd: '5610A', wojewodztwo: 'mazowieckie', status: 'AKTYWNY' },
    1,
    10,
  )

  console.log(`  ✓ count (total matching): ${list.count}`)
  console.log(`  ✓ firms returned: ${list.firmy.length}`)
  console.log(`  ✓ links.next: ${list.links.next ? 'yes' : 'no'}`)
  console.log(`  ✓ links.last: ${list.links.last}\n`)
  console.log('  First 10 firms:')
  for (const [idx, firm] of list.firmy.entries()) {
    const owner = `${firm.wlasciciel.imie} ${firm.wlasciciel.nazwisko}`
    const city = firm.adresDzialalnosci.miasto
    const nip = firm.wlasciciel.nip ?? '—'
    console.log(`    ${idx + 1}. [${nip}] ${firm.nazwa} (${owner}, ${city})`)
  }

  if (list.firmy.length === 0) {
    console.error('\n❌ Brak firm w response — nie mogę testować detail.')
    process.exit(1)
  }

  // ──────────────────────────────────────────────────────────
  // Test 2: getFirmDetails
  // ──────────────────────────────────────────────────────────
  console.log('\n══════ TEST 2: getFirmDetails ══════')
  const firstId = list.firmy[0].id
  console.log(`  id: ${firstId}\n`)

  const detail = await client.getFirmDetails(firstId)
  if (!detail) {
    console.error(`❌ getFirmDetails zwrócił null dla ${firstId}`)
    process.exit(1)
  }

  console.log(`  ✓ nazwa:           ${detail.nazwa}`)
  console.log(`  ✓ status:          ${detail.status} (numerStatusu=${detail.numerStatusu})`)
  console.log(`  ✓ dataRozpoczecia: ${detail.dataRozpoczecia}`)
  console.log(`  ✓ wlasciciel:      ${detail.wlasciciel.imie} ${detail.wlasciciel.nazwisko}`)
  console.log(`  ✓ NIP / REGON:     ${detail.wlasciciel.nip ?? '—'} / ${detail.wlasciciel.regon ?? '—'}`)
  console.log(`  ✓ pkdGlowny:       ${detail.pkdGlowny?.kod ?? '—'} (${detail.pkdGlowny?.nazwa ?? '—'})`)
  console.log(`  ✓ pkd count:       ${detail.pkd?.length ?? 0}`)
  if (detail.pkd && detail.pkd.length > 0) {
    for (const p of detail.pkd) {
      console.log(`      • ${p.kod} — ${p.nazwa}`)
    }
  }
  const adr = detail.adresDzialalnosci
  console.log(
    `  ✓ adres:           ${adr.ulica ?? ''} ${adr.budynek ?? ''}${adr.lokal ? '/' + adr.lokal : ''}, ${adr.kod ?? ''} ${adr.miasto}`,
  )
  console.log(`  ✓ wojewodztwo:     ${adr.wojewodztwo}`)
  console.log(`  ✓ powiat / gmina:  ${adr.powiat} / ${adr.gmina}`)
  if (detail.adresKorespondencyjny) {
    console.log(`  ✓ adres koresp.:   ${detail.adresKorespondencyjny.miasto}, ${detail.adresKorespondencyjny.kod ?? '—'}`)
  }
  if (detail.obywatelstwa && detail.obywatelstwa.length > 0) {
    console.log(`  ✓ obywatelstwa:    ${detail.obywatelstwa.map((o) => o.symbol).join(', ')}`)
  }

  // Helper sanity check
  console.log(`\n  normalizePkd("56.10.A") → "${normalizePkd('56.10.A')}"`)

  // ──────────────────────────────────────────────────────────
  // Test 3: rate limiter timing — 5 sekwencyjnych calls
  // ──────────────────────────────────────────────────────────
  console.log('\n══════ TEST 3: rate limiter (5 sekwencyjnych) ══════')
  const timings: number[] = []
  for (let i = 0; i < 5; i += 1) {
    const t0 = Date.now()
    await client.listFirms(
      { pkd: '5610A', wojewodztwo: 'mazowieckie', status: 'AKTYWNY' },
      i,
      5,
    )
    const dt = Date.now() - t0
    timings.push(dt)
    console.log(`  call #${i + 1}: ${dt}ms`)
  }
  const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length)
  console.log(`  avg: ${avg}ms`)
  console.log(
    '  (przy 50/180s window i 5 calls nie powinno być sleepu — czas zależny od latencji)',
  )

  console.log('\n✅ All tests passed.\n')
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err)
  process.exit(1)
})
