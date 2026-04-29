// scripts/sprint-n-b2-website.ts
// Sprint N Phase B2 — regex website crawler для cohort entities з website_url.

import '@/lib/env'
import * as fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { extractWebsiteRegex } from '@/lib/enrichment/website-regex'
import { upsertFields } from '@/lib/profile/merge'

interface CohortEntry {
  id: string
  type: 'client' | 'prospect'
  name: string
  nip: string
}

async function getWebsite(
  supabase: ReturnType<typeof createClient>,
  e: CohortEntry,
): Promise<string | null> {
  // Priority: canonical company_profile_fields → contact_enrichment.website
  // → clients.website / ceidg_prospects.www
  const { data: canonical } = await supabase
    .from('company_profile_fields')
    .select('value_text')
    .eq(e.type === 'client' ? 'client_id' : 'prospect_id', e.id)
    .eq('field_key', 'website')
    .is('superseded_at', null)
    .order('source_priority', { ascending: false })
    .limit(1)
    .maybeSingle()
  const cv = (canonical as { value_text: string | null } | null)?.value_text
  if (cv) return cv

  if (e.type === 'client') {
    const { data: c } = await supabase
      .from('clients')
      .select('website')
      .eq('id', e.id)
      .maybeSingle()
    return (c as { website: string | null } | null)?.website ?? null
  } else {
    const { data: p } = await supabase
      .from('ceidg_prospects')
      .select('www')
      .eq('id', e.id)
      .maybeSingle()
    return (p as { www: string | null } | null)?.www ?? null
  }
}

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cohort = JSON.parse(
    await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8'),
  ) as CohortEntry[]
  console.log(`B2 website crawler: ${cohort.length} entities`)

  const stats = {
    no_website: 0,
    fetched: 0,
    extracted_phone: 0,
    extracted_email: 0,
    extracted_social: 0,
    error: 0,
  }

  for (let i = 0; i < cohort.length; i++) {
    const e = cohort[i]!
    const tag = `[${i + 1}/${cohort.length}] ${e.name.slice(0, 40)}`
    const websiteRaw = await getWebsite(supabase, e)
    const website = normalizeUrl(websiteRaw)
    if (!website) {
      console.log(`${tag} no website`)
      stats.no_website++
      continue
    }

    try {
      const result = await extractWebsiteRegex(website)
      stats.fetched += result.pages_fetched.length > 0 ? 1 : 0

      const fields: Array<{ field_key: string; value: { value_text?: string; value_json?: unknown } }> = []
      if (result.phones.length > 0) {
        fields.push({ field_key: 'phone', value: { value_text: result.phones[0]! } })
        if (result.phones.length > 1) {
          fields.push({ field_key: 'phones_all', value: { value_json: result.phones } })
        }
        stats.extracted_phone++
      }
      if (result.emails.length > 0) {
        fields.push({ field_key: 'email', value: { value_text: result.emails[0]! } })
        if (result.emails.length > 1) {
          fields.push({ field_key: 'emails_all', value: { value_json: result.emails } })
        }
        stats.extracted_email++
      }
      if (result.facebook_url) {
        fields.push({ field_key: 'facebook_url', value: { value_text: result.facebook_url } })
        stats.extracted_social++
      }
      if (result.instagram_url) {
        fields.push({ field_key: 'instagram_url', value: { value_text: result.instagram_url } })
      }
      if (result.linkedin_url) {
        fields.push({ field_key: 'linkedin_url', value: { value_text: result.linkedin_url } })
      }

      if (fields.length > 0) {
        await upsertFields(supabase, { type: e.type, id: e.id }, fields, 'WWW')
      }

      console.log(
        `${tag} fetched=${result.pages_fetched.length} phones=${result.phones.length} emails=${result.emails.length} social=${[result.facebook_url, result.instagram_url, result.linkedin_url].filter(Boolean).length}`,
      )
    } catch (err) {
      stats.error++
      console.error(`${tag} ERROR: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\n━━━ B2 website summary ━━━`)
  console.log(JSON.stringify(stats, null, 2))
  console.log(`Cost: $0 (pure HTTP)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
