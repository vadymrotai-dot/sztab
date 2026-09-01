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
