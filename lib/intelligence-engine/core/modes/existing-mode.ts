// lib/intelligence-engine/core/modes/existing-mode.ts
// Sprint S-CORE.1.B — Mode A real implementation.
//
// Mode A iterates owner-scoped existing clients table. Це local DB-only
// query (sequential per-row enrichment NOT wired у цьому sub-sprint per
// scope: "NIE робити real API calls — wire у S-CORE.2").
//
// has_contact filter — inline per Q2 = (a): email NOT NULL OR phone NOT NULL.
// Existing schema:
//   clients(id, title, nip, email, phone, gus_regon, updated_at, owner_id, ...)
// REGON живе у gus_regon (per migration 018b), plain regon відсутній.

import { createClient } from '@/lib/supabase/server'
import type { ExistingFilters, RunResult } from '../../types'

export async function runExistingMode(
  filters?: ExistingFilters,
): Promise<RunResult> {
  const startTime = Date.now()
  const errors: Array<{ source: string; message: string }> = []

  const supabase = await createClient()

  // 1. Збираємо клієнтів за filters. RLS обмежує до owner_id = auth.uid().
  let query = supabase
    .from('clients')
    .select('id, nip, gus_regon, title, email, phone, updated_at')

  if (filters?.client_ids?.length) {
    query = query.in('id', filters.client_ids)
  }
  if (filters?.updated_before) {
    query = query.lt('updated_at', filters.updated_before.toISOString())
  }
  if (filters?.has_contact === true) {
    // Per Q2 = (a) — inline check на clients.email/phone (без JOIN до contacts).
    // PostgREST or syntax: comma-separated, .not.is.null = IS NOT NULL.
    query = query.or('email.not.is.null,phone.not.is.null')
  } else if (filters?.has_contact === false) {
    query = query.is('email', null).is('phone', null)
  }

  const { data: clients, error } = await query

  if (error) {
    return {
      sources_completed: [],
      entities_processed: 0,
      errors: [{ source: 'supabase:clients', message: error.message }],
      duration_ms: Date.now() - startTime,
    }
  }

  // 2. Loop без enrichment payload (per scope: real enrichment у S-CORE.2).
  // TODO S-CORE.2: wire real enrichment pipeline using lib/intelligence/lookup
  //   helpers (enrichWithVAT, enrichWithGUS, enrichWithKRS, fetchRozdzialOgolny,
  //   etc.). Sequential per Vadym, не паралельно — щоб не DDOS-ити sources.
  let processed = 0
  for (const client of clients ?? []) {
    try {
      // TODO S-CORE.2: actual enrichment call here.
      // Зараз просто рахуємо щоб verify the loop працює.
      processed++
    } catch (e) {
      errors.push({
        source: client.nip ?? client.id,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return {
    sources_completed: ['clients_fetch'],
    entities_processed: processed,
    errors,
    duration_ms: Date.now() - startTime,
  }
}
