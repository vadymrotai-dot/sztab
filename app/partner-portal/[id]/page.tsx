// app/partner-portal/[id]/page.tsx — Portal partnera: pełny profil firmy +
// interakcja (status, notatki). [id] = bgk_companies.id. RLS pilnuje, że
// partner widzi tylko własne przypisania — brak wiersza = "Nie znaleziono".

import { redirect, notFound } from 'next/navigation'
import { getPartnerUser, getPartnerAccount } from '@/lib/partner/session'
import { createClient } from '@/lib/supabase/server'
import { CompanyInteractionForm } from '@/components/partner/company-interaction-form'

export const dynamic = 'force-dynamic'

function formatPln(v: unknown) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(Number(v)) + ' zł'
}

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
    .select(
      'status, notes, shared_at, updated_at, company:bgk_companies(*)',
    )
    .eq('company_id', id)
    .maybeSingle()

  if (!link || !link.company) notFound()

  const c = link.company as Record<string, unknown>

  const field = (label: string, value: unknown) => (
    <div className="border-b border-[#F0EDE4] py-2 last:border-0">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </div>
    </div>
  )

  const jsonField = (label: string, value: unknown) => {
    const raw =
      value && typeof value === 'object' && 'raw' in (value as Record<string, unknown>)
        ? (value as Record<string, unknown>).raw
        : value
    return (
      <div className="border-b border-[#F0EDE4] py-2 last:border-0">
        <div className="text-xs uppercase text-slate-400">{label}</div>
        <div className="text-sm text-slate-800">{raw ? String(raw) : '—'}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">{String(c.name ?? '')}</h1>
        <p className="text-sm text-slate-500">
          NIP: {String(c.nip ?? '—')} · {String(c.legal_form ?? '—')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Lead BGK/Credipass</h2>
          {field('Tier', c.tier)}
          {field('Kwota poręczenia brutto', formatPln(c.amount_gross_pln))}
          {field('Data poręczenia BGK', c.bgk_guarantee_date)}
          {field('Status VAT', c.vat_status)}
          {field('Wielkość', c.size_category)}
          {field('Staż (miesiące)', c.tenure_months)}
          {field('Data rejestracji', c.registered_at)}
        </div>

        <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Kontakt</h2>
          {field('Osoba decyzyjna', c.decision_person)}
          {field('Funkcja', c.decision_function)}
          {field('Telefon', c.phone)}
          {field('E-mail', c.email ?? c.krs_search_email)}
          {field('Strona WWW', c.website)}
        </div>

        <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Dane rejestrowe</h2>
          {field('PKD główne', c.pkd_main)}
          {field('Region (TERYT)', c.region_teryt)}
          {jsonField('Zarząd', c.zarzad)}
          {jsonField('Beneficjent rzeczywisty (CRBR)', c.beneficjent_crbr)}
          {field('Zgodność zarząd/beneficjent', c.zgodnosc_zarzad_beneficjent)}
        </div>

        <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Interakcja</h2>
          <CompanyInteractionForm
            companyId={id}
            initialStatus={link.status as string}
            initialNotes={(link.notes as string | null) ?? ''}
          />
        </div>
      </div>
    </div>
  )
}
