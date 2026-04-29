// scripts/sprint-n-b1-apify.ts
// Sprint N Phase B1 — Apify GMaps for cohort з pre-flight skip.

import '@/lib/env'
import * as fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { findExistingContact } from '@/lib/enrichment/contact-preflight'
import { enrichContactsApify } from '@/lib/enrichment/apify'
import { upsertFields } from '@/lib/profile/merge'
import {
  startEnrichmentRun,
  finishEnrichmentRun,
} from '@/lib/profile/enrichment-log'

interface CohortEntry {
  id: string
  type: 'client' | 'prospect'
  name: string
  nip: string
  score: number
  region: string | null
  legal_form: string | null
}

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Read Apify token з params
  const { data: paramsRow } = await supabase
    .from('params')
    .select('apify_api_token')
    .limit(1)
    .maybeSingle()
  const apifyKey =
    (paramsRow as { apify_api_token?: string } | null)?.apify_api_token ?? ''
  if (!apifyKey) throw new Error('apify_api_token missing у params')

  const cohort = JSON.parse(
    await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8'),
  ) as CohortEntry[]
  console.log(`Cohort: ${cohort.length} entities`)

  const stats = {
    skipped_preflight: 0,
    apify_success: 0,
    apify_partial: 0,
    apify_no_match: 0,
    apify_error: 0,
    total_cost_usd: 0,
  }

  for (let i = 0; i < cohort.length; i++) {
    const e = cohort[i]!
    const tag = `[${i + 1}/${cohort.length}] ${e.name.slice(0, 40)}`

    // Pre-flight
    const existing = await findExistingContact(supabase, e.type, e.id)
    if (existing) {
      console.log(`${tag} SKIP (preflight: ${existing.source})`)
      stats.skipped_preflight++
      continue
    }

    // Pull city для query
    let city: string | null = null
    if (e.type === 'client') {
      const { data: c } = await supabase
        .from('clients')
        .select('city, region, address')
        .eq('id', e.id)
        .maybeSingle()
      const r = c as { city: string | null; region: string | null; address: string | null } | null
      city = r?.city ?? r?.region ?? null
    } else {
      const { data: p } = await supabase
        .from('ceidg_prospects')
        .select('miejscowosc, wojewodztwo')
        .eq('id', e.id)
        .maybeSingle()
      const r = p as { miejscowosc: string | null; wojewodztwo: string | null } | null
      city = r?.miejscowosc ?? r?.wojewodztwo ?? null
    }

    const runId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: e.id,
      source: 'Apify_GMaps',
    })

    try {
      const result = await enrichContactsApify(apifyKey, {
        name: e.name,
        city,
        voivodeship: e.region,
        nip: e.nip,
      })

      // Persist contact_enrichment
      await supabase.from('contact_enrichment').upsert(
        {
          target_type: e.type,
          target_id: e.id,
          source: 'apify_gmaps',
          phone: result.phone,
          email: result.email,
          website: result.website,
          gmaps_url: result.gmaps_url,
          gmaps_rating: result.gmaps_rating,
          gmaps_reviews_count: result.gmaps_reviews_count,
          raw_payload: result.raw_payload,
          status: result.status,
          error_message: result.error_message ?? null,
          cost_usd: result.cost_usd,
          enriched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
        { onConflict: 'target_type,target_id,source' },
      )

      // Mirror to canonical
      if (result.status === 'success' || result.status === 'partial') {
        const fields: Array<{
          field_key: string
          value: { value_text?: string; value_number?: number }
        }> = []
        if (result.phone) fields.push({ field_key: 'phone', value: { value_text: result.phone } })
        if (result.email) fields.push({ field_key: 'email', value: { value_text: result.email } })
        if (result.website) fields.push({ field_key: 'website', value: { value_text: result.website } })
        if (result.gmaps_rating !== null) fields.push({ field_key: 'gmaps_rating', value: { value_number: result.gmaps_rating } })
        if (result.gmaps_reviews_count !== null) fields.push({ field_key: 'gmaps_reviews_count', value: { value_number: result.gmaps_reviews_count } })
        if (fields.length > 0) {
          await upsertFields(
            supabase,
            { type: e.type, id: e.id },
            fields,
            'Apify_GMaps',
          )
        }
      }

      await finishEnrichmentRun(supabase, runId, {
        status: result.status === 'success' ? 'success' : 'partial',
        raw_payload: result.raw_payload,
        cost_usd: result.cost_usd,
        error_message: result.error_message,
      })

      stats.total_cost_usd += result.cost_usd
      if (result.status === 'success') stats.apify_success++
      else if (result.status === 'partial') stats.apify_partial++
      else if (result.status === 'no_match') stats.apify_no_match++
      else stats.apify_error++

      console.log(
        `${tag} ${result.status} cost=$${result.cost_usd.toFixed(4)} phone=${result.phone ? '✓' : '—'} email=${result.email ? '✓' : '—'} www=${result.website ? '✓' : '—'}`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stats.apify_error++
      console.error(`${tag} ERROR: ${msg.slice(0, 150)}`)
      await finishEnrichmentRun(supabase, runId, {
        status: 'error',
        error_message: msg,
      })
    }
  }

  console.log('\n━━━ B1 Apify summary ━━━')
  console.log(JSON.stringify(stats, null, 2))
  console.log(`Total cost: $${stats.total_cost_usd.toFixed(4)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
