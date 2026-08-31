'use server'

// app/portal/data-actions.ts — Portal klienta Faza 1: SCOPED write actions.
// Pierwsza ścieżka zapisu portal-usera. Zasady:
//  - client_id ZAWSZE z sesji (getPortalAccount approved) — NIGDY z inputu (anty-IDOR).
//  - Zapis przez SESSION client (anon) → RLS (current_portal_client_id()) jest
//    aktywnym strażnikiem izolacji. Próba dotknięcia cudzego wiersza = 0 rows.
//  - Tylko allowlist kolumn (jawny obiekt, nie spread inputu).
//  - clients: BEZ generic update. Wyjątek: marketing_consent (RODO) przez wąską
//    akcję service-role, wyłącznie 3 kolumny zgody.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPortalAccount } from '@/lib/portal/session'

type Result = { ok: true; updated?: number } | { ok: false; error: string }

async function resolveClientId(): Promise<
  { clientId: string; ownerId: string } | null
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const acc = await getPortalAccount(user.id)
  if (!acc || acc.status !== 'approved' || !acc.client_id) return null
  // owner_id klienta (NOT NULL na ccm/cdp) — czytamy service-rolem.
  const admin = createAdminClient()
  const { data: cli } = await admin
    .from('clients')
    .select('owner_id')
    .eq('id', acc.client_id)
    .maybeSingle()
  if (!cli?.owner_id) return null
  return { clientId: acc.client_id, ownerId: cli.owner_id as string }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Kontakt (client_contact_methods) ────────────────────────────────────────
export async function portalUpsertContact(input: {
  id?: string
  kind: 'email' | 'phone'
  value: string
  label?: string | null
  is_primary?: boolean
}): Promise<Result> {
  const ctx = await resolveClientId()
  if (!ctx) return { ok: false, error: 'Brak dostępu' }

  const kind = input.kind === 'phone' ? 'phone' : 'email'
  const value = (input.value || '').trim()
  if (!value) return { ok: false, error: 'Wartość wymagana' }
  if (kind === 'email' && !EMAIL_RE.test(value))
    return { ok: false, error: 'Niepoprawny e-mail' }
  if (kind === 'phone' && value.replace(/\D/g, '').length < 6)
    return { ok: false, error: 'Niepoprawny telefon' }

  const supabase = await createClient() // RLS active
  const label = input.label?.trim() || null
  const is_primary = input.is_primary === true

  if (input.id) {
    const { error, count } = await supabase
      .from('client_contact_methods')
      .update({ kind, value, label, is_primary }, { count: 'exact' })
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/portal/dane')
    return { ok: true, updated: count ?? 0 }
  }

  const { error } = await supabase.from('client_contact_methods').insert({
    client_id: ctx.clientId,
    owner_id: ctx.ownerId,
    kind,
    value,
    label,
    is_primary,
    source: 'portal',
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal/dane')
  return { ok: true }
}

export async function portalDeleteContact(id: string): Promise<Result> {
  const ctx = await resolveClientId()
  if (!ctx) return { ok: false, error: 'Brak dostępu' }
  const supabase = await createClient()
  const { error, count } = await supabase
    .from('client_contact_methods')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal/dane')
  return { ok: true, updated: count ?? 0 }
}

// ── Punkty dostawy (client_delivery_points) ─────────────────────────────────
export async function portalUpsertDeliveryPoint(input: {
  id?: string
  nazwa: string
  ulica?: string | null
  kod_pocztowy?: string | null
  miasto?: string | null
  odbiorca_imie?: string | null
  odbiorca_telefon?: string | null
  typ_punktu?: string | null
}): Promise<Result> {
  const ctx = await resolveClientId()
  if (!ctx) return { ok: false, error: 'Brak dostępu' }

  const nazwa = (input.nazwa || '').trim()
  if (!nazwa) return { ok: false, error: 'Nazwa punktu wymagana' }

  // Allowlist — jawnie, nie spread.
  const fields = {
    nazwa,
    ulica: input.ulica?.trim() || null,
    kod_pocztowy: input.kod_pocztowy?.trim() || null,
    miasto: input.miasto?.trim() || null,
    odbiorca_imie: input.odbiorca_imie?.trim() || null,
    odbiorca_telefon: input.odbiorca_telefon?.trim() || null,
    typ_punktu: input.typ_punktu?.trim() || 'sklep',
  }

  const supabase = await createClient() // RLS active

  if (input.id) {
    const { error, count } = await supabase
      .from('client_delivery_points')
      .update({ ...fields, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/portal/dane')
    return { ok: true, updated: count ?? 0 }
  }

  const { error } = await supabase.from('client_delivery_points').insert({
    client_id: ctx.clientId,
    owner_id: ctx.ownerId,
    is_active: true,
    ...fields,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal/dane')
  return { ok: true }
}

// SOFT-delete — is_active=false, nigdy hard (ochrona order_delivery_points).
export async function portalDeactivateDeliveryPoint(id: string): Promise<Result> {
  const ctx = await resolveClientId()
  if (!ctx) return { ok: false, error: 'Brak dostępu' }
  const supabase = await createClient()
  const { error, count } = await supabase
    .from('client_delivery_points')
    .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal/dane')
  return { ok: true, updated: count ?? 0 }
}

// ── Zgoda marketingowa (clients — WYJĄTEK, wąska akcja service-role) ─────────
// clients pozostaje RLS-read-only; ten jeden RODO-toggle idzie service-rolem,
// WYŁĄCZNIE 3 kolumny zgody, client_id z sesji.
export async function portalSetMarketingConsent(
  consent: boolean,
): Promise<Result> {
  const ctx = await resolveClientId()
  if (!ctx) return { ok: false, error: 'Brak dostępu' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({
      marketing_consent: consent,
      marketing_consent_at: consent ? new Date().toISOString() : null,
      marketing_consent_text: consent
        ? 'Zgoda udzielona przez klienta w panelu (portal).'
        : null,
    })
    .eq('id', ctx.clientId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal/dane')
  return { ok: true }
}
