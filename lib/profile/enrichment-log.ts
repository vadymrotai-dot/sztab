// lib/profile/enrichment-log.ts
// Sprint K — append-only event log helper.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface LogStartOptions {
  /** Per migration 031 + 057 (Phase S-CORE.3.A α'): 'product' added.
   *  DB CHECK extended; safe to use. */
  target_type: 'company' | 'person' | 'product'
  target_id: string
  source: string
}

export async function startEnrichmentRun(
  supabase: SupabaseClient,
  opts: LogStartOptions,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('enrichment_log')
    .insert({
      target_type: opts.target_type,
      target_id: opts.target_id,
      source: opts.source,
      status: 'running',
    })
    .select('id')
    .single()
  if (error) {
    console.error('[enrichment_log] start failed:', error.message)
    return null
  }
  return (data as { id: string }).id
}

export async function finishEnrichmentRun(
  supabase: SupabaseClient,
  runId: string | null,
  result: {
    status: 'success' | 'partial' | 'error'
    fields_added?: string[]
    fields_updated?: string[]
    fields_unchanged?: string[]
    raw_payload?: unknown
    error_message?: string
    cost_usd?: number
  },
): Promise<void> {
  if (!runId) return
  const { error } = await supabase
    .from('enrichment_log')
    .update({
      run_completed_at: new Date().toISOString(),
      status: result.status,
      fields_added: result.fields_added ?? [],
      fields_updated: result.fields_updated ?? [],
      fields_unchanged: result.fields_unchanged ?? [],
      raw_payload: result.raw_payload ?? null,
      error_message: result.error_message?.slice(0, 1000) ?? null,
      cost_usd: result.cost_usd ?? 0,
    })
    .eq('id', runId)
  if (error) console.error('[enrichment_log] finish failed:', error.message)
}
