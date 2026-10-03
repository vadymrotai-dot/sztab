// app/(dashboard)/partners/[partnerId]/[companyId]/page.tsx — admin: pełny
// profil firmy TAK JAK widzi go partner, z możliwością edycji statusu/
// notatek (adminUpdatePartnerCompanyLink). Analog
// app/partner-portal/[id]/page.tsx, ale po stronie staff, filtrowane
// explicit po partnerId (bez current_portal_partner_id()/sesji partnera).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminCompanyInteractionForm } from '@/components/partner/admin-company-interaction-form'
import { CompanyProfileView } from '@/components/partner/company-profile-view'

export const dynamic = 'force-dynamic'

export default async function AdminPartnerCompanyProfile({
  params,
}: {
  params: Promise<{ partnerId: string; companyId: string }>
}) {
  const { partnerId, companyId } = await params
  const admin = createAdminClient()

  const { data: partner } = await admin
    .from('partners')
    .select('id, name, slug')
    .eq('id', partnerId)
    .maybeSingle()
  if (!partner) notFound()

  const { data: link } = await admin
    .from('partner_company_links')
    .select('status, notes, shared_at, updated_at, company:bgk_companies(*)')
    .eq('partner_id', partnerId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!link || !link.company) notFound()

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link
        href={`/partners/${partnerId}`}
        className="mb-4 inline-flex items-center gap-1 text-xs text-[#1F3A5F] hover:underline"
      >
        <ArrowLeftIcon className="size-3" /> {partner.name} — lista firm
      </Link>
      <CompanyProfileView
        company={link.company as Record<string, unknown>}
        status={link.status as string}
        note={
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
            Podgląd i edycja jako admin — partner widzi ten sam profil i tę samą interakcję.
          </div>
        }
        interactionPanel={
          <AdminCompanyInteractionForm
            partnerId={partnerId}
            companyId={companyId}
            initialStatus={link.status as string}
            initialNotes={(link.notes as string | null) ?? ''}
          />
        }
      />
    </div>
  )
}
