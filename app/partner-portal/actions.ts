'use server'

// app/partner-portal/actions.ts — akcje partnera na WŁASNYCH przypisanych
// firmach (partner_company_links). RLS (partner_company_links_partner_update)
// jest drugą warstwą — tu dodatkowo weryfikujemy sesję i że wiersz należy do
// zalogowanego partnera. Adresujemy po company_id (routing /partner-portal/
// [companyId]) — para (partner_id, company_id) jest unique.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPartnerAccount } from '@/lib/partner/session'

type Result = { ok: true } | { ok: false; error: string }

const STATUSES = ['new', 'in_progress', 'contacted', 'qualified', 'rejected', 'converted'] as const

export async function updatePartnerCompanyLink(
  companyId: string,
  input: { status?: string; notes?: string },
): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }

  const acc = await getPartnerAccount(user.id)
  if (!acc) return { ok: false, error: 'Nieautoryzowany' }

  const fields: Record<string, string> = {}
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) {
      return { ok: false, error: 'Niepoprawny status' }
    }
    fields.status = input.status
  }
  if (input.notes !== undefined) {
    fields.notes = input.notes
  }
  if (Object.keys(fields).length === 0) return { ok: true }

  // Sesyjny klient (nie admin) → RLS partner_company_links_partner_update
  // pilnuje, że to WYŁĄCZNIE wiersz własnego partnera.
  const { error } = await supabase
    .from('partner_company_links')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('partner_id', acc.partner_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/partner-portal')
  revalidatePath(`/partner-portal/${companyId}`)
  return { ok: true }
}
