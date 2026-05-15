// lib/profile/merge.ts
// Sprint K / Phase 2F — canonical profile merge core.
//
// Source priority hierarchy (top wins на conflict):
//   KRS=10, GUS=9, CEIDG=8, VAT_BL=7, BZP=6, Manual=5, Apify=4, AI=3
//
// upsertField behavior:
//   - newPriority > existing.source_priority → supersede, INSERT new
//   - newPriority == existing.source_priority AND value differs → supersede,
//     INSERT new (newer wins at equal priority)
//   - newPriority == existing AND value same → record verification
//     (update last_verified_at; no new row)
//   - newPriority < existing.source_priority → ignore, log як 'unchanged'
//
// All operations append entries до enrichment_log при caller.

import type { SupabaseClient } from '@supabase/supabase-js'

export const SOURCE_PRIORITIES: Record<string, number> = {
  KRS: 10,
  GUS: 9,
  CEIDG: 8,
  VAT_BL: 7,
  BZP: 6,
  // Sprint S-MENU Day 3 (15.05.2026) — 'manual_override' розрізняє
  // користувацький UI override (POST /api/clients/[id]/website) від
  // legacy 'manual' import flow. Same priority (5) — both win проти
  // automated sources, але distinct у DB audit trail.
  manual: 5,
  manual_override: 5,
  // Sprint S-MENU Day 3.1 (15.05.2026) — RAISED tavily_brand from 2 to 5.
  // Day 3 bug: naive Tavily (STEP 4.5) writes website pod source='WWW'
  // priority 4, so 'tavily_brand' priority 2 was IGNORED by merge.ts
  // (priority < existing). Раining до 5 (= manual_override) дозволяє
  // brand-aware discovery wins над naive 'WWW' (4). Priority collision
  // з manual_override impossible because STEP 6.6 gate checks
  // websiteIsManual=true і skips entirely. CASCADE:
  //   10  KRS / sprawozdania_KRS / MSiG  (official registries)
  //    9  GUS
  //    8  CEIDG
  //    7  VAT_BL
  //    6  BZP
  //    5  manual_override / manual_legacy / tavily_brand  (CEIDG-driven)
  //    4  WWW / Apify_GMaps  (naive Tavily + Apify)
  //    3  AI
  tavily_brand: 5,
  Apify_GMaps: 4,
  AI: 3,
  WWW: 4, // Website extraction — same tier as Apify
  sprawozdania_KRS: 9, // Same as GUS — official filings
  MSiG: 9, // Same as GUS — official Monitor publication
}

export type ProfileTargetType = 'client' | 'prospect'

export interface UpsertFieldResult {
  status: 'inserted' | 'superseded' | 'verified' | 'ignored_lower_priority'
  field_id?: string
  superseded_id?: string
}

export interface FieldValue {
  value_text?: string | null
  value_number?: number | null
  value_json?: unknown
}

function valueEquals(
  a: { value_text: string | null; value_number: number | null; value_json: unknown },
  b: FieldValue,
): boolean {
  if (a.value_text !== (b.value_text ?? null)) return false
  if (a.value_number !== (b.value_number ?? null)) return false
  // Compare JSON via stringify (good enough for primitives + flat objects)
  const aJson = a.value_json === null ? null : JSON.stringify(a.value_json)
  const bJson = b.value_json === undefined ? null : JSON.stringify(b.value_json)
  return aJson === bJson
}

interface ExistingRow {
  id: string
  value_text: string | null
  value_number: number | null
  value_json: unknown
  source: string
  source_priority: number
  last_verified_at: string
}

export async function upsertField(
  supabase: SupabaseClient,
  target: { type: ProfileTargetType; id: string },
  fieldKey: string,
  value: FieldValue,
  source: string,
  confidence = 1.0,
): Promise<UpsertFieldResult> {
  const priority = SOURCE_PRIORITIES[source] ?? 1
  const targetCol = target.type === 'client' ? 'client_id' : 'prospect_id'

  // Find current active row для (target, field)
  const { data: existingRows } = await supabase
    .from('company_profile_fields')
    .select('id, value_text, value_number, value_json, source, source_priority, last_verified_at')
    .eq(targetCol, target.id)
    .eq('field_key', fieldKey)
    .is('superseded_at', null)
    .limit(1)

  const existing = ((existingRows ?? []) as ExistingRow[])[0] ?? null

  const newRow: Record<string, unknown> = {
    [targetCol]: target.id,
    field_key: fieldKey,
    value_text: value.value_text ?? null,
    value_number: value.value_number ?? null,
    value_json: value.value_json ?? null,
    source,
    source_priority: priority,
    confidence,
    last_verified_at: new Date().toISOString(),
  }

  if (!existing) {
    const { data: ins, error } = await supabase
      .from('company_profile_fields')
      .insert(newRow)
      .select('id')
      .single()
    if (error) throw new Error(`upsertField insert: ${error.message}`)
    return { status: 'inserted', field_id: (ins as { id: string }).id }
  }

  const sameValue = valueEquals(existing, value)

  // Lower priority — ignore unless same value (verification still useful)
  if (priority < existing.source_priority) {
    if (sameValue) {
      // Bump last_verified_at on existing — confirms same value via lower-tier source
      await supabase
        .from('company_profile_fields')
        .update({ last_verified_at: new Date().toISOString() })
        .eq('id', existing.id)
      return { status: 'verified', field_id: existing.id }
    }
    return { status: 'ignored_lower_priority', field_id: existing.id }
  }

  // Same priority + same value — verification
  if (priority === existing.source_priority && sameValue) {
    await supabase
      .from('company_profile_fields')
      .update({ last_verified_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { status: 'verified', field_id: existing.id }
  }

  // Same priority + different value, OR higher priority → supersede + insert
  await supabase
    .from('company_profile_fields')
    .update({
      superseded_at: new Date().toISOString(),
      superseded_by_source: source,
    })
    .eq('id', existing.id)
  const { data: ins, error } = await supabase
    .from('company_profile_fields')
    .insert(newRow)
    .select('id')
    .single()
  if (error) throw new Error(`upsertField re-insert: ${error.message}`)
  return {
    status: 'superseded',
    field_id: (ins as { id: string }).id,
    superseded_id: existing.id,
  }
}

/** Bulk upsert — array of fields у one source. Returns per-field results. */
export async function upsertFields(
  supabase: SupabaseClient,
  target: { type: ProfileTargetType; id: string },
  fields: Array<{ field_key: string; value: FieldValue; confidence?: number }>,
  source: string,
): Promise<{
  added: string[]
  updated: string[]
  unchanged: string[]
  ignored: string[]
}> {
  const result = { added: [] as string[], updated: [] as string[], unchanged: [] as string[], ignored: [] as string[] }
  for (const f of fields) {
    try {
      const r = await upsertField(supabase, target, f.field_key, f.value, source, f.confidence)
      if (r.status === 'inserted') result.added.push(f.field_key)
      else if (r.status === 'superseded') result.updated.push(f.field_key)
      else if (r.status === 'verified') result.unchanged.push(f.field_key)
      else if (r.status === 'ignored_lower_priority') result.ignored.push(f.field_key)
    } catch (err) {
      console.error(`[merge] field ${f.field_key} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return result
}

/** Read merged profile fields для target. Returns active rows тільки. */
export async function getActiveProfileFields(
  supabase: SupabaseClient,
  target: { type: ProfileTargetType; id: string },
): Promise<
  Array<{
    field_key: string
    value_text: string | null
    value_number: number | null
    value_json: unknown
    source: string
    source_priority: number
    confidence: number
    last_verified_at: string
  }>
> {
  const targetCol = target.type === 'client' ? 'client_id' : 'prospect_id'
  const { data } = await supabase
    .from('company_profile_fields')
    .select(
      'field_key, value_text, value_number, value_json, source, source_priority, confidence, last_verified_at',
    )
    .eq(targetCol, target.id)
    .is('superseded_at', null)
    .order('source_priority', { ascending: false })
  return (data ?? []) as Array<{
    field_key: string
    value_text: string | null
    value_number: number | null
    value_json: unknown
    source: string
    source_priority: number
    confidence: number
    last_verified_at: string
  }>
}
