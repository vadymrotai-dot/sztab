// app/(dashboard)/clients/[id]/page.tsx
// Sprint S2B Phase 2 — comprehensive client detail redesign.
// Connects S1 (rejestr.io v2) + S2A (score formula) DB fields.
// Drops: sticky 5-action bar, horizontal anchor nav, debug "Profil canonical
// 18 pól", raw JSON dumps, stale "Sprawozdania niedostępne HTTP 400".

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PencilIcon } from 'lucide-react'
import { ClientContacts } from '@/components/clients/client-contacts'
import { ClientDeals } from '@/components/clients/client-deals'
import { ClientTasks } from '@/components/clients/client-tasks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NewDealButton } from '@/components/clients/new-deal-button'
import { MatchesPanel } from '@/components/matches/matches-panel'
import { BusinessProfileSection } from '@/components/clients/business-profile-section'
import { EnrichmentProgressBanner } from '@/components/clients/enrichment-progress-banner'
import { AccordionSection } from '@/components/clients/accordion-section'
import { MetricStrip } from '@/components/clients/metric-strip'
import { ProfileSectionV2 } from '@/components/clients/profile-section-v2'
import { FinancialStatementsTable } from '@/components/clients/financial-statements-table'
import { PersonsSectionV2 } from '@/components/clients/persons-section-v2'
import { SignalsSection } from '@/components/clients/signals-section'
import { ContactSectionV2 } from '@/components/clients/contact-section-v2'

const statusColor: Record<string, string> = {
  nowy: 'bg-blue-500',
  aktywny: 'bg-green-500',
  nieaktywny: 'bg-gray-400',
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: client },
    { data: contacts },
    { data: deals },
    { data: tasks },
    { data: clientsList },
    { data: products },
    { data: people },
    { data: suppliers },
    { data: bzpTenders },
    { data: financialStatements },
    { data: profileFields },
    { data: personLinks },
    { data: crbr },
    { data: branches },
    { data: topMatch },
    { data: pkdMain },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('contacts').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('deals').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('tasks').select('*').eq('client_id', id).order('due', { ascending: true }),
    supabase.from('clients').select('id, title').order('title', { ascending: true }),
    supabase.from('products').select('id, name').order('name', { ascending: true }),
    supabase.from('people').select('id, name, client_id').order('name', { ascending: true }),
    supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
    supabase
      .from('bzp_tenders')
      .select('id, ordering_party, award_date')
      .eq('client_id', id)
      .order('award_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('financial_statements')
      .select('okres_data_koniec, przychody_netto, zysk_netto, aktywa_razem, liczba_pracownikow')
      .eq('client_id', id)
      .order('okres_data_koniec', { ascending: false }),
    supabase
      .from('company_profile_fields')
      .select('field_key, value_text, value_number, value_json, source')
      .eq('client_id', id)
      .is('superseded_at', null),
    supabase
      .from('person_company_links')
      .select(
        'rola, jest_decyzyjny, persons:persons!inner(id, imie, nazwisko, source, rejestrio_person_id)',
      )
      .eq('client_id', id)
      .is('data_do', null),
    supabase
      .from('crbr_beneficiaries')
      .select('imie, nazwisko, kraj_rezydencji, obywatelstwa')
      .eq('client_id', id),
    supabase
      .from('company_branches')
      .select('id')
      .eq('client_id', id)
      .eq('status', 'AKTYWNA'),
    supabase
      .from('matches')
      .select('algo_score')
      .eq('client_id', id)
      .order('algo_score', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('company_profile_fields')
      .select('value_text, value_json')
      .eq('client_id', id)
      .eq('field_key', 'pkd_main')
      .is('superseded_at', null)
      .limit(1)
      .maybeSingle(),
  ])

  if (!client) notFound()

  const c = client as Record<string, unknown> & {
    id: string
    title: string
    nip: string | null
    status: string
    industry: string | null
    address: string | null
    city: string | null
    region: string | null
    krs_number: string | null
    krs_legal_form: string | null
    gus_regon: string | null
    pkd_codes: string[] | null
    employee_count_range: string | null
    vat_status: string | null
    vat_registered_date: string | null
    vat_bank_accounts: string[] | null
    bankruptcy_flag: boolean | null
    liquidation_flag: boolean | null
    restructuring_flag: boolean | null
    suspended_at: string | null
    branch_offices_count: number | null
    last_filing_date: string | null
    kapital_zakladowy: number | string | null
    founded_at: string | null
    email_krs: string | null
    website_krs: string | null
    employees_count: number | null
    business_profile: unknown
    phone: string | null
    email: string | null
    website: string | null
  }

  const fs = (financialStatements ?? []) as Array<{
    okres_data_koniec: string
    przychody_netto: number | string | null
    zysk_netto: number | string | null
    aktywa_razem: number | string | null
    liczba_pracownikow: number | null
  }>

  const latestRevenuePln = fs[0]?.przychody_netto
    ? typeof fs[0].przychody_netto === 'string'
      ? parseFloat(fs[0].przychody_netto)
      : fs[0].przychody_netto
    : null
  const prevRevenuePln = fs[1]?.przychody_netto
    ? typeof fs[1].przychody_netto === 'string'
      ? parseFloat(fs[1].przychody_netto)
      : fs[1].przychody_netto
    : null
  const revenueYoyPct =
    latestRevenuePln !== null && prevRevenuePln !== null && prevRevenuePln > 0
      ? ((latestRevenuePln - prevRevenuePln) / prevRevenuePln) * 100
      : null
  const employeesCount = c.employees_count ?? fs[0]?.liczba_pracownikow ?? null
  const branchOfficesCount = c.branch_offices_count ?? branches?.length ?? 0
  const topMatchScore = (topMatch as { algo_score: number } | null)?.algo_score ?? null
  const bzpCount = bzpTenders?.length ?? 0

  type PersonLinkRow = {
    rola: string
    jest_decyzyjny: boolean
    persons:
      | { id: string; imie: string; nazwisko: string; source: string | null; rejestrio_person_id: number | null }
      | { id: string; imie: string; nazwisko: string; source: string | null; rejestrio_person_id: number | null }[]
      | null
  }
  const allPersonLinks = ((personLinks ?? []) as unknown) as PersonLinkRow[]
  const personsForSection = allPersonLinks
    .map((l) => {
      const p = Array.isArray(l.persons) ? l.persons[0] : l.persons
      if (!p) return null
      return {
        imie: p.imie,
        nazwisko: p.nazwisko,
        rola: l.rola,
        jest_decyzyjny: l.jest_decyzyjny,
        source: p.source ?? 'unknown',
        rejestrio_person_id: p.rejestrio_person_id,
        network_count: 0,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const crbrEntries = ((crbr ?? []) as unknown) as Array<{
    imie: string | null
    nazwisko: string | null
    kraj_rezydencji: string | null
    obywatelstwa: string[]
  }>

  type CanonicalField = {
    field_key: string
    value_text: string | null
    value_number: number | null
    value_json: unknown
    source: string | null
  }
  const fieldsArr = ((profileFields ?? []) as CanonicalField[]).filter((f) => f.value_text)
  const fieldsByKey = new Map<string, CanonicalField>()
  for (const f of fieldsArr) if (!fieldsByKey.has(f.field_key)) fieldsByKey.set(f.field_key, f)
  const emailField = fieldsByKey.get('email')
  const phoneField = fieldsByKey.get('phone')
  const websiteField = fieldsByKey.get('website')
  const facebookField = fieldsByKey.get('facebook_url')
  const instagramField = fieldsByKey.get('instagram_url')

  const emailValue = c.email_krs ?? emailField?.value_text ?? c.email
  const emailSource = c.email_krs ? 'KRS' : emailField?.source ?? null
  const websiteValue = c.website_krs ?? websiteField?.value_text ?? c.website
  const websiteSource = c.website_krs ? 'KRS' : websiteField?.source ?? null
  const phoneValue = phoneField?.value_text ?? c.phone
  const phoneSource = phoneField?.source ?? null

  const pkdMainCode = c.pkd_codes?.[0] ?? null
  const pkdMainRow = pkdMain as { value_text: string | null; value_json: unknown } | null
  const pkdMainName = (pkdMainRow?.value_json as { nazwa?: string } | null)?.nazwa ?? null
  const bankAccount = c.vat_bank_accounts?.[0] ?? null

  const profileMeta = `${c.krs_legal_form ?? '—'} · ${[c.city, c.region].filter(Boolean).join(', ') || '—'}`
  const fsMeta =
    fs.length > 0
      ? `${fs.length} lat KRS · ostatni rok ${fs[0]?.okres_data_koniec.slice(0, 4)}`
      : 'Brak danych'
  const personsMeta = `${personsForSection.length} zarząd · ${crbrEntries.length} BO`
  const signalsMeta =
    (c.bankruptcy_flag || c.liquidation_flag || c.restructuring_flag
      ? '⚠️ Red flags · '
      : '✓ Aktywna · ') + `${bzpCount} BZP`
  const matchesMeta = topMatchScore !== null ? `TOP score ${topMatchScore}` : 'Brak dopasowań'
  const contactSourcesCount = [emailValue, phoneValue, websiteValue].filter(Boolean).length

  return (
    <div className="flex flex-col bg-[#FAFAF7] min-h-screen">
      <PageHeader
        title={c.title}
        breadcrumbs={[{ label: 'Klienci', href: '/clients' }, { label: c.title }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/clients/${id}/edit`}>
                <PencilIcon className="mr-1.5 size-3.5" />
                Edytuj
              </Link>
            </Button>
            <NewDealButton
              clientId={id}
              clients={clientsList || []}
              products={products || []}
              people={people || []}
              suppliers={suppliers || []}
            />
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-3 p-6">
        {/* Hero row — status + NIP + KRS, secondary identity */}
        <div className="flex flex-wrap items-center gap-3 px-1">
          <Badge variant="secondary" className={`text-white ${statusColor[c.status] ?? 'bg-gray-400'}`}>
            {c.status}
          </Badge>
          {c.nip && <span className="text-[12px] text-[#888] font-mono">NIP {c.nip}</span>}
          {c.krs_number && (
            <span className="text-[12px] text-[#888] font-mono">KRS {c.krs_number}</span>
          )}
          {c.gus_regon && (
            <span className="text-[12px] text-[#888] font-mono">REGON {c.gus_regon}</span>
          )}
        </div>

        <EnrichmentProgressBanner clientId={id} />

        <MetricStrip
          topMatchScore={topMatchScore}
          latestRevenuePln={latestRevenuePln}
          revenueYoyPct={revenueYoyPct}
          employeesCount={employeesCount}
          branchOfficesCount={branchOfficesCount}
        />

        <AccordionSection title="Profil" meta={profileMeta} defaultOpen={true}>
          <ProfileSectionV2
            forma_prawna={c.krs_legal_form}
            address={c.address}
            city={c.city}
            region={c.region}
            nip={c.nip}
            regon={c.gus_regon}
            krs_number={c.krs_number}
            kapital_zakladowy={c.kapital_zakladowy}
            founded_at={c.founded_at}
            vat_status={c.vat_status}
            vat_registered_date={c.vat_registered_date}
            pkd_main={pkdMainCode}
            pkd_main_name={pkdMainName}
            pkd_total_count={c.pkd_codes?.length ?? 0}
            bank_account={bankAccount}
          />
        </AccordionSection>

        <AccordionSection
          title="Sprawozdania finansowe"
          meta={fsMeta}
          detailHref={`/clients/${id}/sprawozdania`}
        >
          <FinancialStatementsTable rows={fs} />
        </AccordionSection>

        <AccordionSection title="Osoby" meta={personsMeta}>
          <PersonsSectionV2 persons={personsForSection} crbr={crbrEntries} />
        </AccordionSection>

        <AccordionSection title="Sygnały" meta={signalsMeta}>
          <SignalsSection
            lastFilingDate={c.last_filing_date}
            bankruptcyFlag={Boolean(c.bankruptcy_flag)}
            liquidationFlag={Boolean(c.liquidation_flag)}
            restructuringFlag={Boolean(c.restructuring_flag)}
            suspendedAt={c.suspended_at}
            bzpCount={bzpCount}
          />
        </AccordionSection>

        <AccordionSection title="Analiza biznesowa (AI)" meta="Czudowa Marka — buyer strength">
          <BusinessProfileSection clientId={id} profile={(c.business_profile as never) ?? null} />
        </AccordionSection>

        <AccordionSection title="Dopasowania produktów" meta={matchesMeta}>
          <MatchesPanel
            mode="product-side"
            keyType="client_id"
            keyValue={id}
            recomputePath="/api/admin/matching/recompute-client"
            title=""
          />
        </AccordionSection>

        <AccordionSection title="Kontakt" meta={`${contactSourcesCount} źródeł`}>
          <ContactSectionV2
            email={emailValue ?? null}
            emailSource={emailSource}
            phone={phoneValue ?? null}
            phoneSource={phoneSource}
            website={websiteValue ?? null}
            websiteSource={websiteSource}
            facebookUrl={facebookField?.value_text ?? null}
            instagramUrl={instagramField?.value_text ?? null}
            hints={{
              email: !emailValue ? 'Brak w KRS' : undefined,
              phone: !phoneValue ? 'Brak danych' : undefined,
              website: !websiteValue ? 'Brak własnej domeny' : undefined,
            }}
          />
        </AccordionSection>

        <AccordionSection
          title="Aktywność"
          meta={`${(contacts?.length ?? 0) + (deals?.length ?? 0) + (tasks?.length ?? 0)} pozycji`}
        >
          <Tabs defaultValue="contacts">
            <TabsList>
              <TabsTrigger value="contacts">Kontakty ({contacts?.length || 0})</TabsTrigger>
              <TabsTrigger value="deals">Umowy ({deals?.length || 0})</TabsTrigger>
              <TabsTrigger value="tasks">Zadania ({tasks?.length || 0})</TabsTrigger>
            </TabsList>
            <TabsContent value="contacts" className="mt-4">
              <ClientContacts clientId={id} contacts={contacts || []} />
            </TabsContent>
            <TabsContent value="deals" className="mt-4">
              <ClientDeals clientId={id} deals={deals || []} />
            </TabsContent>
            <TabsContent value="tasks" className="mt-4">
              <ClientTasks clientId={id} tasks={tasks || []} />
            </TabsContent>
          </Tabs>
        </AccordionSection>
      </div>
    </div>
  )
}
