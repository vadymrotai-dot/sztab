// lib/enrichment/contact-preflight.ts
// Sprint J / Issue 2 fix — pre-Apify check.
//
// Перевіряє чи target вже має contact data (з Bitrix import у clients,
// CEIDG self-reported у prospects, або fresh contact_enrichment row)
// перед тим як burn Apify call. 254/260 clients у Sztab DB вже мали
// phone/email/website з Bitrix — тому це fix savings on bulk.
//
// Schema notes:
//   clients.{phone, email, website}
//   ceidg_prospects.{telefon, email, www}     (Polish CEIDG fields)
//   contact_enrichment.{phone, email, website} (uniform schema)

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ExistingContact {
  phone: string | null
  email: string | null
  website: string | null
  source: 'clients' | 'ceidg_prospects' | 'contact_enrichment'
}

function hasAnyContact(c: { phone?: string | null; email?: string | null; website?: string | null }): boolean {
  return Boolean(c.phone || c.email || c.website)
}

/** Returns existing contact data if available, else null.
 *  Checked у order: source-of-truth table (clients/prospects) → fresh
 *  contact_enrichment (success status, expires_at > now). */
export async function findExistingContact(
  supabase: SupabaseClient,
  targetType: 'client' | 'prospect',
  targetId: string,
): Promise<ExistingContact | null> {
  // 1. Source-of-truth table
  if (targetType === 'client') {
    const { data } = await supabase
      .from('clients')
      .select('phone, email, website')
      .eq('id', targetId)
      .maybeSingle()
    if (data && hasAnyContact(data as { phone?: string | null; email?: string | null; website?: string | null })) {
      const c = data as { phone: string | null; email: string | null; website: string | null }
      return { ...c, source: 'clients' }
    }
  } else {
    const { data } = await supabase
      .from('ceidg_prospects')
      .select('telefon, email, www')
      .eq('id', targetId)
      .maybeSingle()
    if (data) {
      const p = data as { telefon: string | null; email: string | null; www: string | null }
      const mapped = { phone: p.telefon, email: p.email, website: p.www }
      if (hasAnyContact(mapped)) {
        return { ...mapped, source: 'ceidg_prospects' }
      }
    }
  }

  // 2. Fresh contact_enrichment
  const { data: ceData } = await supabase
    .from('contact_enrichment')
    .select('phone, email, website, enriched_at, expires_at, status')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'success')
    .gt('expires_at', new Date().toISOString())
    .order('enriched_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ceData) {
    const ce = ceData as {
      phone: string | null
      email: string | null
      website: string | null
    }
    if (hasAnyContact(ce)) {
      return { ...ce, source: 'contact_enrichment' }
    }
  }

  return null
}
