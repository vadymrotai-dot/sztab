// scripts/diag-apify-allegro-empty.ts
// READ-ONLY — investigate why automation-lab~allegro-scraper returned 0 items.
// Token never printed.
import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const ACTOR = 'automation-lab~allegro-scraper'
const APIFY = 'https://api.apify.com/v2'

async function main() {
  const r = await executeManagementSQL(
    `SELECT apify_api_token FROM params WHERE apify_api_token IS NOT NULL LIMIT 1;`,
  )
  const token = (r.rows?.[0] as { apify_api_token?: string })?.apify_api_token
  if (!token) throw new Error('no apify token')

  // 1. List recent runs
  const runsRes = await fetch(`${APIFY}/acts/${ACTOR}/runs?limit=5&desc=true&token=${encodeURIComponent(token)}`)
  console.log(`runs list status: ${runsRes.status}`)
  if (!runsRes.ok) {
    console.log((await runsRes.text()).slice(0, 300))
    return
  }
  const runsJson = (await runsRes.json()) as {
    data?: { items?: Array<{ id: string; status: string; startedAt?: string; finishedAt?: string; defaultDatasetId?: string; stats?: { inputBodyLen?: number; runTimeSecs?: number } }> }
  }
  const runs = runsJson.data?.items ?? []
  console.log(`found ${runs.length} recent runs\n`)

  for (const run of runs) {
    console.log(`run ${run.id}  status=${run.status}  started=${run.startedAt}  duration=${run.stats?.runTimeSecs}s  dataset=${run.defaultDatasetId}`)
  }
  console.log()

  if (runs.length === 0) {
    console.log('no runs found — actor never executed з нашим token')
    return
  }

  const last = runs[0]
  console.log(`\n--- inspecting last run: ${last.id} ---`)

  // 2. Full run details
  const runRes = await fetch(`${APIFY}/acts/${ACTOR}/runs/${last.id}?token=${encodeURIComponent(token)}`)
  if (runRes.ok) {
    const runJson = (await runRes.json()) as {
      data?: {
        status?: string
        statusMessage?: string
        exitCode?: number
        stats?: { itemCount?: number; inputBodyLen?: number; runTimeSecs?: number; resurrectCount?: number; computeUnits?: number }
        meta?: unknown
        options?: unknown
      }
    }
    const d = runJson.data
    console.log(`status: ${d?.status}`)
    console.log(`statusMessage: ${d?.statusMessage ?? '(none)'}`)
    console.log(`exitCode: ${d?.exitCode}`)
    console.log(`stats: ${JSON.stringify(d?.stats)}`)
  }

  // 3. Run input (what we sent)
  const inputRes = await fetch(`${APIFY}/key-value-stores/${last.id}/records/INPUT?token=${encodeURIComponent(token)}`)
  console.log(`\ninput record direct fetch status: ${inputRes.status}`)
  // Actually input lives in run's keyValueStore, not run id. Let's fetch via run object.
  const fullRunRes = await fetch(`${APIFY}/acts/${ACTOR}/runs/${last.id}?token=${encodeURIComponent(token)}`)
  const fullRun = (await fullRunRes.json()) as {
    data?: { defaultKeyValueStoreId?: string; defaultDatasetId?: string }
  }
  const kvStore = fullRun.data?.defaultKeyValueStoreId
  if (kvStore) {
    const kvInputRes = await fetch(`${APIFY}/key-value-stores/${kvStore}/records/INPUT?token=${encodeURIComponent(token)}`)
    console.log(`INPUT (from kv-store ${kvStore}): status=${kvInputRes.status}`)
    if (kvInputRes.ok) {
      const txt = await kvInputRes.text()
      console.log(txt.slice(0, 500))
    }
  }

  // 4. Dataset items (raw)
  const datasetId = fullRun.data?.defaultDatasetId
  if (datasetId) {
    const itemsRes = await fetch(`${APIFY}/datasets/${datasetId}/items?limit=3&token=${encodeURIComponent(token)}`)
    console.log(`\ndataset ${datasetId} items: status=${itemsRes.status}`)
    if (itemsRes.ok) {
      const items = (await itemsRes.json()) as unknown[]
      console.log(`item count: ${items.length}`)
      if (items.length > 0) {
        console.log('\n--- raw item sample (first item, all keys) ---')
        const first = items[0] as Record<string, unknown>
        console.log('keys:', Object.keys(first))
        console.log(JSON.stringify(first, null, 2).slice(0, 2000))
      } else {
        console.log('(dataset empty)')
      }
    }
  }

  // 5. Run log (last 100 lines)
  const logRes = await fetch(`${APIFY}/logs/${last.id}?token=${encodeURIComponent(token)}`)
  console.log(`\nrun log: status=${logRes.status}`)
  if (logRes.ok) {
    const log = await logRes.text()
    const lines = log.split('\n')
    console.log(`total log lines: ${lines.length}`)
    console.log('--- last 30 lines ---')
    console.log(lines.slice(-30).join('\n'))
  }
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
