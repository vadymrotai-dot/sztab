// lib/cron-runs.ts
// Sprint G — observability helper. Wraps cron handlers з cron_runs telemetry.
//
// Pattern:
//   const runId = await startCronRun(supabase, 'matching-refresh')
//   try {
//     ... do work ...
//     await finishCronRun(supabase, runId, 'success', { pairs_processed: N })
//   } catch (err) {
//     await finishCronRun(supabase, runId, 'error', { error_message: msg })
//   }

import type { SupabaseClient } from '@supabase/supabase-js'

export async function startCronRun(
  supabase: SupabaseClient,
  jobName: string,
  meta?: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('cron_runs')
    .insert({
      job_name: jobName,
      status: 'running',
      meta: meta ?? null,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error(`[CRON_RUNS] Failed to start record для ${jobName}:`, error?.message)
    return null
  }
  return (data as { id: string }).id
}

interface FinishOptions {
  pairs_processed?: number
  error_message?: string
  meta?: Record<string, unknown>
}

export async function finishCronRun(
  supabase: SupabaseClient,
  runId: string | null,
  status: 'success' | 'error',
  options: FinishOptions = {},
): Promise<void> {
  if (!runId) return

  // Compute duration від started_at
  const { data: row } = await supabase
    .from('cron_runs')
    .select('started_at')
    .eq('id', runId)
    .single()
  const startedAt = (row as { started_at: string } | null)?.started_at
  const durationMs = startedAt
    ? Date.now() - new Date(startedAt).getTime()
    : null

  const { error } = await supabase
    .from('cron_runs')
    .update({
      finished_at: new Date().toISOString(),
      status,
      pairs_processed: options.pairs_processed ?? null,
      duration_ms: durationMs,
      error_message: options.error_message?.slice(0, 1000) ?? null,
      meta: options.meta ?? null,
    })
    .eq('id', runId)
  if (error) {
    console.error(`[CRON_RUNS] Failed to finish ${runId}:`, error.message)
  }
}
