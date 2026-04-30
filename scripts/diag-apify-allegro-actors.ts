// scripts/diag-apify-allegro-actors.ts
// READ-ONLY — vet alternative Allegro scrapers. Get full actor metadata,
// recent run statistics (success/failure ratio), and input schema.
import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const APIFY = 'https://api.apify.com/v2'
const CANDIDATES = [
  'e-commerce~allegro-fast-product-scraper',
  'parseforge~allegro-scraper',
]

interface ActorInfo {
  id?: string
  name?: string
  username?: string
  title?: string
  description?: string
  stats?: {
    totalRuns?: number
    totalUsers?: number
    totalUsers30Days?: number
    lastRunStartedAt?: string
  }
  pricingInfos?: Array<{ pricingModel?: string; pricePerUnitUsd?: number; unitName?: string }>
  defaultRunOptions?: { build?: string; timeoutSecs?: number; memoryMbytes?: number }
}

async function getActor(actorId: string, token: string): Promise<ActorInfo | null> {
  const r = await fetch(`${APIFY}/acts/${actorId}?token=${encodeURIComponent(token)}`)
  if (!r.ok) {
    console.log(`  actor lookup failed: ${r.status}`)
    return null
  }
  const j = (await r.json()) as { data?: ActorInfo }
  return j.data ?? null
}

async function getActorRuns(actorId: string, token: string) {
  const r = await fetch(`${APIFY}/acts/${actorId}/runs?limit=20&desc=true&token=${encodeURIComponent(token)}`)
  if (!r.ok) return []
  const j = (await r.json()) as { data?: { items?: Array<{ status: string; startedAt: string; stats?: { runTimeSecs?: number; itemCount?: number } }> } }
  return j.data?.items ?? []
}

async function getActorBuilds(actorId: string, token: string): Promise<string | null> {
  const r = await fetch(`${APIFY}/acts/${actorId}/builds?limit=1&desc=true&token=${encodeURIComponent(token)}`)
  if (!r.ok) return null
  const j = (await r.json()) as { data?: { items?: Array<{ buildNumber: string; finishedAt?: string; status?: string }> } }
  const items = j.data?.items ?? []
  if (items.length === 0) return null
  const b = items[0]
  return `${b.buildNumber} (${b.status}) finished ${b.finishedAt ?? '?'}`
}

async function getInputSchema(actorId: string, token: string): Promise<unknown> {
  // Input schema lives in a specific build — fetch latest build з input schema
  const r = await fetch(`${APIFY}/acts/${actorId}/builds?limit=1&desc=true&token=${encodeURIComponent(token)}`)
  if (!r.ok) return null
  const j = (await r.json()) as { data?: { items?: Array<{ id: string }> } }
  const buildId = j.data?.items?.[0]?.id
  if (!buildId) return null
  const br = await fetch(`${APIFY}/actor-builds/${buildId}?token=${encodeURIComponent(token)}`)
  if (!br.ok) return null
  const bj = (await br.json()) as { data?: { actorDefinition?: { input?: unknown; readme?: string } } }
  return bj.data?.actorDefinition?.input ?? null
}

async function main() {
  const r = await executeManagementSQL(
    `SELECT apify_api_token FROM params WHERE apify_api_token IS NOT NULL LIMIT 1;`,
  )
  const token = (r.rows?.[0] as { apify_api_token?: string })?.apify_api_token
  if (!token) throw new Error('no apify token')

  for (const actorId of CANDIDATES) {
    console.log(`\n═══════════════════════════════════════════════`)
    console.log(`Actor: ${actorId}`)
    console.log(`═══════════════════════════════════════════════`)

    const info = await getActor(actorId, token)
    if (!info) continue

    console.log(`title:        ${info.title ?? '?'}`)
    console.log(`totalRuns:    ${info.stats?.totalRuns}`)
    console.log(`30dUsers:     ${info.stats?.totalUsers30Days}`)
    console.log(`lastRunAt:    ${info.stats?.lastRunStartedAt}`)
    console.log(`pricing:      ${JSON.stringify(info.pricingInfos)}`)
    console.log(`defaultRunOpts: ${JSON.stringify(info.defaultRunOptions)}`)

    const build = await getActorBuilds(actorId, token)
    console.log(`latestBuild:  ${build}`)

    const runs = await getActorRuns(actorId, token)
    if (runs.length > 0) {
      console.log(`\n--- last ${runs.length} runs ---`)
      const succeeded = runs.filter((x) => x.status === 'SUCCEEDED').length
      const failed = runs.filter((x) => x.status !== 'SUCCEEDED').length
      console.log(`succeeded: ${succeeded}/${runs.length}, failed: ${failed}`)
      for (const run of runs.slice(0, 5)) {
        console.log(
          `  ${run.startedAt}  status=${run.status}  duration=${run.stats?.runTimeSecs}s  items=${run.stats?.itemCount ?? '?'}`,
        )
      }
    } else {
      console.log(`(no public runs accessible — may need to start one з нашим token)`)
    }

    const schema = await getInputSchema(actorId, token)
    if (schema) {
      console.log(`\n--- input schema ---`)
      console.log(JSON.stringify(schema, null, 2).slice(0, 1500))
    } else {
      console.log(`(input schema not accessible)`)
    }
  }
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
