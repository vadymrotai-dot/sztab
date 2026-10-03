// app/partner-portal/[id]/page.tsx — Portal partnera: pełny profil firmy +
// interakcja (status, notatki). [id] = bgk_companies.id. RLS pilnuje, że
// partner widzi tylko własne przypisania — brak wiersza = "Nie znaleziono".

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getPartnerUser, getPartnerAccount } from '@/lib/partner/session'
import { createClient } from '@/lib/supabase/server'
import { CompanyInteractionForm } from '@/components/partner/company-interaction-form'
import { CompanyProfileView } from '@/components/partner/company-profile-view'

export const dynamic = 'force-dynamic'

export default async function PartnerCompanyProfile({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getPartnerUser()
  if (!user) redirect('/partner-portal/login')
  const acc = await getPartnerAccount(user.id)
  if (!acc) redirect('/partner-portal/login')

  const supabase = await createClient()
  const { data: link } = await supabase
    .from('partner_company_links')
    .select('status, notes, shared_at, updated_at, company:bgk_companies(*)')
    .eq('company_id', id)
    .maybeSingle()

  if (!link || !link.company) notFound()

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link
        href="/partner-portal"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[#1F3A5F] hover:underline"
      >
        <ArrowLeftIcon className="size-3" /> Wszystkie firmy
      </Link>
      <CompanyProfileView
        company={link.company as Record<string, unknown>}
        status={link.status as string}
        interactionPanel={
          <CompanyInteractionForm
            companyId={id}
            initialStatus={link.status as string}
            initialNotes={(link.notes as string | null) ?? ''}
          />
        }
      />
    </div>
  )
}
