'use server'

// app/actions/portal-admin.ts — Portal klienta Faza 0, akcje admina (Vadym).
// Ręczne zatwierdzanie / odrzucanie kont portalowych. NIGDY auto.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPortalUser } from '@/lib/portal/session'
import { lookupNipMF } from '@/lib/nip/mf-lookup'
import { createClientRecord } from '@/app/actions/clients'

type Result = { ok: true } | { ok: false; error: string }
type LinkResult = { ok: true; link: string | null } | { ok: false; error: string }

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sztab.vercel.app'

// Generuje jednorazowy magic-link (Supabase Admin API) bez wysyłki maila —
// zwracany do UI, żeby admin sam wysłał go klientowi (WhatsApp/mail/SMS).
// Ważny ograniczony czas (Supabase default). redirectTo=/portal (konto już
// approved+linked, nie potrzeba /portal/onboard).
async function generatePortalLoginLink(email: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=/portal` },
  })
  if (error || !data?.properties?.action_link) return null
  return data.properties.action_link
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null as null }
  // Portal-user NIE może wywoływać akcji admina.
  if (await isPortalUser(user.id)) return { user: null as null }
  return { user }
}

export async function approvePortalAccount(
  id: string,
  clientId: string,
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const cid = (clientId || '').trim()
  if (!cid) return { ok: false, error: 'Brak client_id do powiązania' }

  const admin = createAdminClient()
  // Walidacja: klient istnieje.
  const { data: cli } = await admin
    .from('clients')
    .select('id')
    .eq('id', cid)
    .maybeSingle()
  if (!cli) return { ok: false, error: 'Klient o tym id nie istnieje' }

  const { error } = await admin
    .from('client_portal_accounts')
    .update({
      client_id: cid,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal-accounts')
  return { ok: true }
}

// Wyszukiwarka klientów do przypisania przy zatwierdzaniu (po nazwie lub NIP).
// Admin-only. Zwraca max 10 dopasowań — bez wpisywania UUID ręcznie.
export async function searchClientsForApproval(
  query: string,
): Promise<
  | { ok: true; clients: { id: string; title: string; nip: string | null }[] }
  | { ok: false; error: string }
> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const q = (query || '').trim()
  if (q.length < 2) return { ok: true, clients: [] }
  const admin = createAdminClient()
  const digits = q.replace(/\D/g, '')
  const like = (s: string) => `%${s.replace(/[%,()]/g, '')}%`
  const builder =
    digits.length >= 5
      ? admin.from('clients').select('id, title, nip').ilike('nip', like(digits))
      : admin.from('clients').select('id, title, nip').ilike('title', like(q))
  const { data, error } = await builder.order('title', { ascending: true }).limit(10)
  if (error) return { ok: false, error: error.message }
  return { ok: true, clients: (data ?? []) as { id: string; title: string; nip: string | null }[] }
}

// 1-klik dla wpisów bez dopasowania: MF lookup → createClientRecord → approve.
// Ochrona przed duplikatem (brak DB-constraint na nip): re-check przy kliknięciu.
//   0 dopasowań → utwórz nowego + approve
//   1 dopasowanie → podepnij istniejącego (bez duplikatu) + approve
//   >1 → komunikat, zero auto-tworzenia
export async function createClientFromNipAndApprove(
  accId: string,
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }

  const admin = createAdminClient()
  const { data: acc } = await admin
    .from('client_portal_accounts')
    .select('id, nip_submitted, status')
    .eq('id', accId)
    .maybeSingle()
  if (!acc) return { ok: false, error: 'Konto nie znalezione' }
  const nip = String(acc.nip_submitted || '').replace(/\D/g, '')
  if (nip.length !== 10) return { ok: false, error: 'Brak/niepoprawny NIP w zgłoszeniu' }

  // Re-check duplikatu po NIP (app-level guard).
  const { data: existing } = await admin
    .from('clients')
    .select('id')
    .eq('nip', nip)
  const matches = (existing ?? []) as { id: string }[]
  if (matches.length > 1) {
    return {
      ok: false,
      error: 'Kilku klientów z tym NIP — wybierz właściwego przez wyszukiwanie.',
    }
  }

  let clientId: string
  if (matches.length === 1) {
    clientId = matches[0].id // podepnij istniejącego, bez duplikatu
  } else {
    const mf = await lookupNipMF(nip)
    const title =
      mf.ok && mf.data.name ? mf.data.name : `Klient NIP ${nip}`
    const created = await createClientRecord({
      title,
      nip,
      city: mf.ok ? mf.data.city || null : null,
      address: mf.ok ? mf.data.address || null : null,
    })
    if (!created.ok || !created.id) {
      return { ok: false, error: created.ok ? 'Błąd tworzenia klienta' : created.error }
    }
    clientId = created.id
  }

  const { error } = await admin
    .from('client_portal_accounts')
    .update({
      client_id: clientId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', accId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal-accounts')
  return { ok: true }
}

export async function rejectPortalAccount(id: string): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('client_portal_accounts')
    .update({ status: 'rejected' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal-accounts')
  return { ok: true }
}

// ── Rejestracja portalu z inicjatywy admina (Faza 2, 28.09.2026) ───────────
// Do tej pory jedyna ścieżka to self-service klienta (NIP form) + approve.
// Ta akcja pozwala adminowi/staff od razu zarejestrować istniejącego klienta
// w portalu — bez czekania aż klient sam się zgłosi. Auth user tworzony przez
// Supabase Admin API (email_confirm:true, bez hasła) — klient loguje się
// pierwszy raz "jednorazowym linkiem e-mail" (już istniejąca ścieżka na
// /portal/login), hasło ustawia sam w „Moje dane" (już istniejące UI).
export async function createPortalAccountForClient(
  clientId: string,
  email: string,
): Promise<LinkResult> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const cid = (clientId || '').trim()
  const mail = (email || '').trim().toLowerCase()
  if (!cid) return { ok: false, error: 'Brak client_id' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, error: 'Niepoprawny e-mail' }

  const admin = createAdminClient()

  const { data: cli } = await admin.from('clients').select('id').eq('id', cid).maybeSingle()
  if (!cli) return { ok: false, error: 'Klient o tym id nie istnieje' }

  const { data: existingApproved } = await admin
    .from('client_portal_accounts')
    .select('id, email')
    .eq('client_id', cid)
    .eq('status', 'approved')
    .maybeSingle()
  if (existingApproved) {
    return { ok: false, error: `Klient ma już aktywne konto portalowe (${existingApproved.email})` }
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: mail,
    email_confirm: true,
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

  const { error: insertErr } = await admin.from('client_portal_accounts').insert({
    auth_user_id: created.user.id,
    client_id: cid,
    email: mail,
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: user.id,
  })
  if (insertErr) return { ok: false, error: insertErr.message }

  revalidatePath(`/clients/${cid}`)
  revalidatePath('/portal-accounts')

  const link = await generatePortalLoginLink(mail)
  return { ok: true, link }
}

// Do już zatwierdzonego konta — np. klient zgubił pierwszy e-mail, albo
// Vadym chce mu wysłać link jeszcze raz innym kanałem (WhatsApp).
export async function getPortalLoginLink(clientId: string): Promise<LinkResult> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const cid = (clientId || '').trim()
  if (!cid) return { ok: false, error: 'Brak client_id' }

  const admin = createAdminClient()
  const { data: acc } = await admin
    .from('client_portal_accounts')
    .select('email')
    .eq('client_id', cid)
    .eq('status', 'approved')
    .maybeSingle()
  if (!acc?.email) return { ok: false, error: 'Brak zatwierdzonego konta dla tego klienta' }

  const link = await generatePortalLoginLink(acc.email as string)
  if (!link) return { ok: false, error: 'Nie udało się wygenerować linku' }
  return { ok: true, link }
}

// ── Punkty dostawy z panelu admina (Faza 2, 28.09.2026) ────────────────────
// Mirror 1:1 pól/walidacji z app/portal/data-actions.ts (portalUpsertDeliveryPoint
// itd.) — ta sama tabela, ten sam kształt danych, żeby klient widział dokładnie
// to co admin poprawił. RLS: staff_all_client_delivery_points (is_staff_member())
// już pokrywa staff — insert/update idzie przez zwykły sesyjny klient (RLS jako
// druga warstwa), nie service-role.
async function clientOwnerId(clientId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('clients').select('owner_id').eq('id', clientId).maybeSingle()
  return (data?.owner_id as string | undefined) ?? null
}

export async function adminUpsertDeliveryPoint(
  clientId: string,
  input: {
    id?: string
    nazwa: string
    ulica?: string | null
    kod_pocztowy?: string | null
    miasto?: string | null
    odbiorca_imie?: string | null
    odbiorca_telefon?: string | null
    typ_punktu?: string | null
  },
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const cid = (clientId || '').trim()
  if (!cid) return { ok: false, error: 'Brak client_id' }

  const nazwa = (input.nazwa || '').trim()
  if (!nazwa) return { ok: false, error: 'Nazwa punktu wymagana' }

  const fields = {
    nazwa,
    ulica: input.ulica?.trim() || null,
    kod_pocztowy: input.kod_pocztowy?.trim() || null,
    miasto: input.miasto?.trim() || null,
    odbiorca_imie: input.odbiorca_imie?.trim() || null,
    odbiorca_telefon: input.odbiorca_telefon?.trim() || null,
    typ_punktu: input.typ_punktu?.trim() || 'sklep',
  }

  const supabase = await createClient()

  if (input.id) {
    const { error } = await supabase
      .from('client_delivery_points')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath(`/clients/${cid}`)
    return { ok: true }
  }

  const ownerId = await clientOwnerId(cid)
  if (!ownerId) return { ok: false, error: 'Nie znaleziono owner_id klienta' }

  const { error } = await supabase.from('client_delivery_points').insert({
    client_id: cid,
    owner_id: ownerId,
    is_active: true,
    ...fields,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/clients/${cid}`)
  return { ok: true }
}

// Soft — domyślne "Usuń" (jak w portalu). Bezpieczne, odwracalne.
export async function adminDeactivateDeliveryPoint(
  clientId: string,
  id: string,
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('client_delivery_points')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/clients/${clientId}`)
  return { ok: true }
}

// Trwałe — tylko admin panel (portal go nie ma, celowo). Bezpieczne mimo to:
// order_delivery_points.client_delivery_point_id → ON DELETE SET NULL
// (migracja 078) — nie psuje historii zamówień, tylko odpina referencję.
// Do realnego sprzątania śmieci testowych (duplikaty, "Test", "123123" itp).
export async function adminDeleteDeliveryPoint(
  clientId: string,
  id: string,
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const supabase = await createClient()
  const { error } = await supabase.from('client_delivery_points').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/clients/${clientId}`)
  return { ok: true }
}
