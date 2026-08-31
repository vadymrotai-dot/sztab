'use server'

// app/portal/actions.ts — Portal klienta Faza 0.
// Rejestracja konta portalowego (po zalogowaniu magic-linkiem): klient podaje
// NIP → tworzymy client_portal_accounts(status='pending') + match po NIP jako
// KANDYDAT (nie aktywny). Powiązanie aktywuje RĘCZNIE Vadym w adminie.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Result = { ok: true } | { ok: false; error: string }

export async function registerPortalAccount(nipRaw: string): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niezalogowany' }

  const nip = (nipRaw || '').replace(/\D/g, '')
  if (nip.length < 10) return { ok: false, error: 'Niepoprawny NIP (10 cyfr)' }

  const admin = createAdminClient()

  // Idempotencja — konto już istnieje.
  const { data: existing } = await admin
    .from('client_portal_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (existing) return { ok: true }

  // Match po NIP — tylko kandydat (matched_client_id), NIE aktywne powiązanie.
  const { data: match } = await admin
    .from('clients')
    .select('id')
    .eq('nip', nip)
    .maybeSingle()

  const { error: insErr } = await admin.from('client_portal_accounts').insert({
    auth_user_id: user.id,
    email: user.email,
    nip_submitted: nip,
    matched_client_id: match?.id ?? null,
    status: 'pending',
  })
  if (insErr) return { ok: false, error: insErr.message }

  // Tag roli dla middleware (gate). Nawet 'pending' user jest portalowy.
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { role: 'portal' },
  })

  revalidatePath('/portal/onboard')
  return { ok: true }
}
