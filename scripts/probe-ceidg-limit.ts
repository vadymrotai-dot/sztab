// scripts/probe-ceidg-limit.ts
// Phase 2.6 Step 2 / pre-bootstrap probe: test page size limits.
//
// CEIDG default limit z probe (KROK 0) = 10. Pytanie czy API akceptuje
// 100 / 500 / więcej. Jeśli tak → bootstrap może być 8-50x szybszy.
//
// Run:
//   $env:CEIDG_API_KEY="<jwt>"
//   pnpm dlx tsx scripts/probe-ceidg-limit.ts

import 'dotenv/config'

import { CeidgClient } from '@/lib/ceidg/client'

const apiKey = process.env.CEIDG_API_KEY
if (!apiKey) {
  console.error('❌ Brak CEIDG_API_KEY w env.')
  process.exit(1)
}

const FILTERS = {
  pkd: '5610A',
  wojewodztwo: 'mazowieckie',
  status: 'AKTYWNY' as const,
}

const PROBES = [10, 100, 500]

async function main() {
  const client = new CeidgClient(apiKey!)

  console.log('\n══════ Probe page size limits ══════')
  console.log('  filters: pkd=5610A, wojewodztwo=mazowieckie, status=AKTYWNY')
  console.log('  testing limits:', PROBES.join(', '), '\n')

  const results: Array<{
    requested: number
    returned: number
    count: number
    durationMs: number
    lastPage: number | null
    estimatedFullSyncMin: number
  }> = []

  for (const limit of PROBES) {
    const t0 = Date.now()
    try {
      const response = await client.listFirms(FILTERS, 0, limit)
      const dt = Date.now() - t0

      const returned = response.firmy.length
      const totalCount = response.count

      // Wyciągnij last page index z links.last (?...&page=N)
      let lastPage: number | null = null
      try {
        const url = new URL(response.links.last)
        const p = url.searchParams.get('page')
        lastPage = p === null ? null : Number.parseInt(p, 10)
      } catch {
        lastPage = null
      }

      // ETA dla full sync: (lastPage+1) × dt + 5% buffer
      const totalPages = lastPage !== null ? lastPage + 1 : Math.ceil(totalCount / returned)
      const estimatedMs = totalPages * dt
      const estimatedFullSyncMin = Math.round((estimatedMs / 60_000) * 1.05)

      results.push({
        requested: limit,
        returned,
        count: totalCount,
        durationMs: dt,
        lastPage,
        estimatedFullSyncMin,
      })

      console.log(`  limit=${limit.toString().padStart(4)}:`)
      console.log(`    requested:    ${limit}`)
      console.log(`    returned:     ${returned} ${returned !== limit ? `⚠️ (CEIDG zacapił do ${returned})` : '✓'}`)
      console.log(`    duration:     ${dt}ms`)
      console.log(`    total count:  ${totalCount}`)
      console.log(`    total pages:  ${totalPages} (last index ${lastPage ?? '?'})`)
      console.log(`    full sync ETA: ~${estimatedFullSyncMin} min`)
      console.log()
    } catch (err) {
      const dt = Date.now() - t0
      console.error(`  limit=${limit}: ❌ FAILED after ${dt}ms`)
      console.error(`    ${err instanceof Error ? err.message : String(err)}`)
      console.log()
    }
  }

  console.log('══════ Summary ══════')
  console.table(
    results.map((r) => ({
      requested: r.requested,
      returned: r.returned,
      'time (s)': (r.durationMs / 1000).toFixed(1),
      'count total': r.count,
      'pages': (r.lastPage ?? '?') + (r.lastPage !== null ? '+1' : ''),
      'full sync ETA (min)': r.estimatedFullSyncMin,
    })),
  )

  console.log('\n✅ Probe done.')
}

main().catch((err) => {
  console.error('\n❌ Probe failed:', err)
  process.exit(1)
})
