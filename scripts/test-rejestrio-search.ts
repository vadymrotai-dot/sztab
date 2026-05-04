// scripts/test-rejestrio-search.ts
// Phase 2.8 health check / diagnostic — 1 live call через
// searchOrganizations() з реальними filters. Prints response shape +
// sample, щоб verify endpoint живий і shape ще match-ить очікувань.
//
// Cost: ~$0.05 per run (1 search call).
//
// Run:
//   $env:KRS_REJESTR_API_TOKEN = "<token>"
//   pnpm dlx tsx scripts/test-rejestrio-search.ts
//
// Use cases:
//   • After API key rotation — verify auth still works
//   • If sync-krs-bootstrap.ts крашить — isolate чи endpoint shape
//     ще той самий
//   • Future debug коли rejestr.io оновлять API contract

import '@/lib/env'

import {
  searchOrganizations,
  type KrsSearchFilters,
} from '@/lib/rejestrio/search'

const TEST_FILTERS: KrsSearchFilters = {
  // Canonical KRS PKD format = '46.39.Z' (з крапками), НЕ CEIDG-style '4639Z'.
  // rejestr.io API повертає HTTP 400 "format is invalid" якщо без крапок.
  przewazajacy_pkd: '46.39.Z',
  terc_wojewodztwo: '14', // mazowieckie
}

const TEST_PAGE = 0
const TEST_LIMIT = 5 // small щоб output читабельний

async function main() {
  const apiKey = process.env.KRS_REJESTR_API_TOKEN
  if (!apiKey) {
    console.error('❌ KRS_REJESTR_API_TOKEN env var required')
    console.error('   $env:KRS_REJESTR_API_TOKEN = "<token>"  (PowerShell)')
    process.exit(1)
  }

  console.log('\n══════ rejestr.io GET /org health check ══════')
  console.log('  filters: ', JSON.stringify(TEST_FILTERS))
  console.log('  page:    ', TEST_PAGE, '(0-based — URL strona =', TEST_PAGE + 1, ')')
  console.log('  limit:   ', TEST_LIMIT, '(URL ile_na_strone)')
  console.log('  cost:    ~0.05 zł')
  console.log()

  const startedAt = Date.now()
  try {
    const res = await searchOrganizations(
      apiKey,
      TEST_FILTERS,
      TEST_PAGE,
      TEST_LIMIT,
    )
    const elapsed = Date.now() - startedAt

    console.log(`✓ Response (${elapsed}ms):`)
    console.log(`  liczba_wszystkich_wynikow: ${res.liczba_wszystkich_wynikow}`)
    console.log(`  wyniki.length:             ${res.wyniki?.length ?? 0}`)
    console.log(`  top-level keys:            [${Object.keys(res).join(', ')}]`)
    console.log()

    if (res.wyniki && res.wyniki.length > 0) {
      const first = res.wyniki[0]
      console.log('First wynik (truncated):')
      console.log(`  id:        ${first.id}`)
      console.log(`  typ:       ${first.typ}`)
      console.log(`  nazwy keys:    [${Object.keys(first.nazwy ?? {}).join(', ')}]`)
      console.log(`  numery keys:   [${Object.keys(first.numery ?? {}).join(', ')}]`)
      console.log(`  stan keys:     [${Object.keys(first.stan ?? {}).join(', ')}]`)
      console.log(`  adres keys:    [${Object.keys(first.adres ?? {}).join(', ')}]`)
      console.log(`  metadane keys: [${Object.keys(first.metadane ?? {}).join(', ')}]`)
      console.log()
      console.log('Full first wynik (JSON, 1500 chars max):')
      console.log(JSON.stringify(first, null, 2).slice(0, 1500))
    } else {
      console.log('⚠ wyniki array empty — фільтри не дали match? Перевір TERC.')
    }

    process.exit(0)
  } catch (err) {
    const elapsed = Date.now() - startedAt
    console.error(`\n❌ Call failed (${elapsed}ms):`)
    console.error(`   ${err instanceof Error ? err.message : String(err)}`)
    if (err instanceof Error && err.stack) {
      console.error(err.stack.split('\n').slice(0, 5).join('\n'))
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n❌ Test crashed:', err)
  process.exit(1)
})
