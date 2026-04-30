// scripts/diag-apify-find-allegro.ts
// READ-ONLY — query Apify Store API to find published Allegro scrapers.
// Token never logged.
import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(
    `SELECT apify_api_token FROM params WHERE apify_api_token IS NOT NULL LIMIT 1;`,
  )
  const token = (r.rows?.[0] as { apify_api_token?: string })?.apify_api_token
  if (!token) throw new Error('no apify token')

  const url = `https://api.apify.com/v2/store?search=allegro&limit=20&token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  console.log(`store search status: ${res.status}`)
  if (!res.ok) {
    console.log((await res.text()).slice(0, 300))
    return
  }
  const json = (await res.json()) as {
    data?: { items?: Array<{ name?: string; username?: string; title?: string; description?: string; pricingInfos?: unknown; stats?: { totalRuns?: number } }> }
  }
  const items = json.data?.items ?? []
  console.log(`found ${items.length} actors\n`)
  for (const it of items) {
    const id = `${it.username}~${it.name}`
    const runs = it.stats?.totalRuns ?? 0
    const desc = (it.description ?? '').slice(0, 100).replace(/\n/g, ' ')
    console.log(`${id}  runs=${runs}`)
    console.log(`  title: ${it.title ?? '?'}`)
    console.log(`  desc:  ${desc}\n`)
  }
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
