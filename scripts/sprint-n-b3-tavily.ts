// scripts/sprint-n-b3-tavily.ts
// Sprint N Phase B3 — Tavily fallback для cohort entities WITHOUT website
// після B1 (Apify) + B2 (website crawler). Uses Sprint M FIX 6 blocklist.

import '@/lib/env'
import * as fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { searchCompanyOnline } from '@/lib/enrichment/web-search'
import { upsertFields } from '@/lib/profile/merge'

interface CohortEntry {
  id: string
  type: 'client' | 'prospect'
  name: string
  nip: string
}

async function hasWebsite(
  supabase: ReturnType<typeof createClient>,
  e: CohortEntry,
): Promise<boolean> {
  const { data } = await supabase
    .from('company_profile_fields')
    .select('value_text')
    .eq(e.type === 'client' ? 'client_id' : 'prospect_id', e.id)
    .eq('field_key', 'website')
    .is('superseded_at', null)
    .limit(1)
    .maybeSingle()
  return Boolean((data as { value_text: string | null } | null)?.value_text)
}

async function main() {
  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey) {
    console.error('TAVILY_API_KEY missing — set у env або skip B3')
    process.exit(1)
  }

  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cohort = JSON.parse(
    await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8'),
  ) as CohortEntry[]

  console.log(`B3 Tavily fallback: scanning cohort of ${cohort.length}`)

  const stats = {
    skipped_have_website: 0,
    queried: 0,
    found_website: 0,
    found_facebook: 0,
    found_instagram: 0,
    error: 0,
    total_cost_usd: 0,
  }

  for (let i = 0; i < cohort.length; i++) {
    const e = cohort[i]!
    const tag = `[${i + 1}/${cohort.length}] ${e.name.slice(0, 40)}`
    if (await hasWebsite(supabase, e)) {
      stats.skipped_have_website++
      console.log(`${tag} SKIP (вже має website)`)
      continue
    }
    try {
      const r = await searchCompanyOnline(tavilyKey, e.name, e.nip)
      stats.queried++
      stats.total_cost_usd += r.search_cost_usd

      const fields: Array<{ field_key: string; value: { value_text?: string; value_json?: unknown } }> = []
      if (r.website_url) {
        fields.push({ field_key: 'website', value: { value_text: r.website_url } })
        stats.found_website++
      }
      if (r.facebook_url) {
        fields.push({ field_key: 'facebook_url', value: { value_text: r.facebook_url } })
        stats.found_facebook++
      }
      if (r.instagram_url) {
        fields.push({ field_key: 'instagram_url', value: { value_text: r.instagram_url } })
        stats.found_instagram++
      }
      if (r.google_maps_urls.length > 0) {
        fields.push({ field_key: 'google_maps_urls', value: { value_json: r.google_maps_urls } })
      }
      if (r.news_mentions.length > 0) {
        fields.push({ field_key: 'news_mentions', value: { value_json: r.news_mentions } })
      }

      if (fields.length > 0) {
        await upsertFields(supabase, { type: e.type, id: e.id }, fields, 'WWW')
      }

      console.log(
        `${tag} cost=$${r.search_cost_usd.toFixed(4)} www=${r.website_url ?? '—'} fb=${r.facebook_url ? '✓' : '—'} ig=${r.instagram_url ? '✓' : '—'}`,
      )
    } catch (err) {
      stats.error++
      console.error(`${tag} ERROR: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\n━━━ B3 Tavily summary ━━━`)
  console.log(JSON.stringify(stats, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
