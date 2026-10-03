'use server'

// app/actions/partner-admin.ts — Portal partnera, akcje admina (Vadym/staff).
// Konta partnerów tworzy WYŁĄCZNIE admin (analog createPortalAccountForClient
// w app/actions/portal-admin.ts) — brak self-service rejestracji.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPortalUser } from '@/lib/portal/session'
import { isPartnerUser } from '@/lib/partner/session'
import { getOrCreateShortPartnerLoginLink } from '@/lib/partner/login-link'

type Result = { ok: true } | { ok: false; error: string }
type LinkResult = { ok: true; link: string | null } | { ok: false; error: string }

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null as null }
  // Ani portal-user, ani partner-user nie może wywoływać akcji admina.
  if (await isPortalUser(user.id)) return { user: null as null }
  if (await isPartnerUser(user.id)) return { user: null as null }
  return { user }
}

export async function createPartner(input: {
  name: string
  slug: string
  notes?: string
}): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const name = (input.name || '').trim()
  const slug = (input.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
  if (!name || !slug) return { ok: false, error: 'Nazwa i slug są wymagane' }

  const admin = createAdminClient()
  const { error } = await admin.from('partners').insert({
    name,
    slug,
    notes: input.notes?.trim() || null,
    created_by: user.id,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/partners')
  return { ok: true }
}

export async function createPartnerAccount(
  partnerId: string,
  email: string,
): Promise<LinkResult> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const pid = (partnerId || '').trim()
  const mail = (email || '').trim().toLowerCase()
  if (!pid) return { ok: false, error: 'Brak partner_id' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, error: 'Niepoprawny e-mail' }

  const admin = createAdminClient()

  const { data: partner } = await admin.from('partners').select('id').eq('id', pid).maybeSingle()
  if (!partner) return { ok: false, error: 'Partner o tym id nie istnieje' }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: mail,
    email_confirm: true,
    // KRYTYCZNE: bez tego middleware traktuje konto jak nieznanego non-staff
    // i przekieruje na /staff/onboard, NIGDY na /partner-portal.
    app_metadata: { role: 'partner' },
  })
  if (createErr || !created?.user) {
    const already = /already.*registered|already.*exists/i.test(createErr?.message || '')
    return {
      ok: false,
      error: already
        ? 'Ten e-mail jest już zarejestrowany (inne konto) — sprawdź ręcznie w Supabase Auth.'
        : `Błąd tworzenia konta: ${createErr?.message ?? 'nieznany'}`,
    }
  }

  const { data: accRow, error: insertErr } = await admin
    .from('partner_accounts')
    .insert({
      auth_user_id: created.user.id,
      partner_id: pid,
      email: mail,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insertErr) return { ok: false, error: insertErr.message }

  revalidatePath('/partners')

  return getOrCreateShortPartnerLoginLink(accRow.id as string, user.id)
}

export async function getPartnerLoginLink(partnerAccountId: string): Promise<LinkResult> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  return getOrCreateShortPartnerLoginLink(partnerAccountId, user.id)
}

// Przypisanie firm do partnera (po liście bgk_companies.id). Idempotentne —
// upsert po unique(partner_id, company_id), istniejące linki nietknięte.
export async function assignCompaniesToPartner(
  partnerId: string,
  companyIds: string[],
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const pid = (partnerId || '').trim()
  if (!pid) return { ok: false, error: 'Brak partner_id' }
  const ids = Array.from(new Set((companyIds || []).map((s) => s.trim()).filter(Boolean)))
  if (ids.length === 0) return { ok: false, error: 'Brak firm do przypisania' }

  const admin = createAdminClient()
  const rows = ids.map((company_id) => ({ partner_id: pid, company_id }))
  const { error } = await admin
    .from('partner_company_links')
    .upsert(rows, { onConflict: 'partner_id,company_id', ignoreDuplicates: true })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/partners')
  return { ok: true }
}

export async function assignAllUnassignedToPartner(
  partnerId: string,
  sourceBatch: string,
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const pid = (partnerId || '').trim()
  if (!pid) return { ok: false, error: 'Brak partner_id' }

  const admin = createAdminClient()
  const { data: companies, error: selErr } = await admin
    .from('bgk_companies')
    .select('id')
    .eq('source_batch', sourceBatch)
  if (selErr) return { ok: false, error: selErr.message }
  const ids = (companies ?? []).map((c) => c.id as string)
  if (ids.length === 0) return { ok: false, error: `Brak firm w paczce "${sourceBatch}"` }

  const rows = ids.map((company_id) => ({ partner_id: pid, company_id }))
  const { error } = await admin
    .from('partner_company_links')
    .upsert(rows, { onConflict: 'partner_id,company_id', ignoreDuplicates: true })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/partners')
  return { ok: true }
}
