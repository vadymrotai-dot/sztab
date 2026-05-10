'use server'

// app/clients/[id]/actions/override-classification.ts
// Sprint S6D Day 1 (11.05.2026) — manual override AI classification.
// Vadym recovers from misclassification без full re-analysis.
//
// Pattern: read existing business_profile JSONB → merge new client_type +
// confidence=100 + reasoning="Ręczna nadpisana" → update.
//
// Idempotent. RLS via createClient (Supabase SSR session).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BusinessProfile, ClientType } from '@/lib/ai/business-analysis'

const VALID_TYPES: readonly ClientType[] = [
  'gastronomia',
  'hurtownia',
  'sklep_detal',
  'catering',
  'hotel',
  'instytucja',
  'production',
  'sieci_handlowe',
  'inne',
] as const

interface Args {
  clientId: string
  newType: ClientType
  newSubtype?: string
}

interface Result {
  ok: boolean
  error?: string
}

export async function overrideClassification(args: Args): Promise<Result> {
  const { clientId, newType, newSubtype = '' } = args

  if (!VALID_TYPES.includes(newType)) {
    return { ok: false, error: `Niepoprawny client_type: ${newType}` }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'Nieautoryzowany' }
  }

  // Read existing business_profile (may be null якщо client jeszcze
  // не analyzed AI). Якщо null → create minimal stub з classification
  // tylko (Vadym manualny gating perш ніж AI Business Analysis runs).
  const { data: existing, error: readErr } = await supabase
    .from('clients')
    .select('business_profile')
    .eq('id', clientId)
    .single()
  if (readErr) {
    return { ok: false, error: `DB read failed: ${readErr.message}` }
  }

  const currentProfile = (
    existing as { business_profile: BusinessProfile | null } | null
  )?.business_profile

  const updatedProfile: BusinessProfile = currentProfile
    ? {
        ...currentProfile,
        client_type: newType,
        client_subtype: newSubtype,
        classification_confidence: 100,
        classification_reasoning_pl: `Ręczna nadpisana klasyfikacja przez Vadyma (${new Date().toISOString().slice(0, 10)})`,
      }
    : {
        // Stub profile — only classification populated. AI Business
        // Analysis fillsa решту коли user clicks "Analiza klienta".
        business_format: 'other',
        estimated_locations: null,
        product_categories_pl: [],
        target_demographics_pl: [],
        special_traits_pl: [],
        business_summary_pl: '',
        buyer_strength_for_chm: 0,
        buyer_reasoning_pl: '',
        model_used: 'manual_override',
        analyzed_at: new Date().toISOString(),
        input_sources: ['manual'],
        client_type: newType,
        client_subtype: newSubtype,
        classification_confidence: 100,
        classification_reasoning_pl: `Ręczna klasyfikacja przez Vadyma (${new Date().toISOString().slice(0, 10)}) — bez AI Business Analysis. Run "Analiza klienta" żeby uzupełnić pełny profil.`,
      }

  const { error: updErr } = await supabase
    .from('clients')
    .update({ business_profile: updatedProfile })
    .eq('id', clientId)
  if (updErr) {
    return { ok: false, error: `DB update failed: ${updErr.message}` }
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/clients')
  revalidatePath('/intelligence/prospects')
  return { ok: true }
}
