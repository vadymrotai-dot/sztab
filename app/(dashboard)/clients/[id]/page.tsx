import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PencilIcon, MailIcon, PhoneIcon, MapPinIcon, BuildingIcon, GlobeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClientContacts } from '@/components/clients/client-contacts'
import { ClientDeals } from '@/components/clients/client-deals'
import { ClientTasks } from '@/components/clients/client-tasks'
import { NewDealButton } from '@/components/clients/new-deal-button'
import { VatSection } from '@/app/(dashboard)/_shared/vat-section'
import { GusSection } from '@/app/(dashboard)/_shared/gus-section'
import { KrsSection } from '@/app/(dashboard)/_shared/krs-section'
import { StatusBadgesRow } from '@/app/(dashboard)/_shared/status-badges-row'
import { MatchesPanel } from '@/components/matches/matches-panel'
import { BuyingSignalsSection } from '@/components/clients/buying-signals-section'
import { FinancialsSection } from '@/components/clients/financials-section'
import { BusinessProfileSection } from '@/components/clients/business-profile-section'
import { PeopleSection } from '@/components/clients/people-section'
import { ProfileFieldsTable } from '@/components/clients/profile-fields-table'
import { MsigChangesSection } from '@/components/clients/msig-changes-section'
import { EnrichmentProgressBanner } from '@/components/clients/enrichment-progress-banner'
import { MetricsRow } from '@/components/clients/metrics-row'
import { AnchorNav } from '@/components/clients/anchor-nav'
import { ClientActionBar } from '@/components/clients/client-action-bar'

const segmentColors: Record<string, string> = {
  maly_opt: 'bg-slate-500',
  sredni_opt: 'bg-blue-500',
  duzy_opt: 'bg-green-500',
  katalog: 'bg-purple-500',
  docel: 'bg-indigo-600',
  niesklasyfikowany: 'bg-gray-400',
}

const statusColors: Record<string, string> = {
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
    { data: clients },
    { data: products },
    { data: people },
    { data: suppliers },
    // Sprint K — new sources
    { data: bzpTenders },
    { data: financials },
    { data: msigChanges },
    { data: profileFields },
    { data: personLinks },
    { data: lastFinancialRun },
    { data: topMatch },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase
      .from('contacts')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('*')
      .eq('client_id', id)
      .order('due', { ascending: true }),
    supabase.from('clients').select('id, title').order('title', { ascending: true }),
    supabase.from('products').select('id, name').order('name', { ascending: true }),
    supabase
      .from('people')
      .select('id, name, client_id')
      .order('name', { ascending: true }),
    supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
    // Sprint K
    supabase
      .from('bzp_tenders')
      .select('id, bzp_notice_id, ordering_party, ordering_party_type, cpv_codes, subject, award_value_pln, award_date')
      .eq('client_id', id)
      .order('award_date', { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from('company_financials')
      .select('rok, przychody_pln, zysk_netto_pln, marza_netto, aktywa_pln, kapital_wlasny_pln, zatrudnienie, source_url')
      .eq('client_id', id)
      .order('rok', { ascending: false })
      .limit(5),
    supabase
      .from('msig_changes')
      .select('id, msig_number, publication_date, change_type, description')
      .eq('client_id', id)
      .order('publication_date', { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from('company_profile_fields')
      .select('field_key, value_text, value_number, value_json, source, source_priority, confidence, last_verified_at')
      .eq('client_id', id)
      .is('superseded_at', null)
      .order('source_priority', { ascending: false }),
    supabase
      .from('person_company_links')
      .select(
        'id, rola, jest_decyzyjny, sila_relacji, zrodlo, data_od, data_do, person:persons(id, imie, nazwisko, email_glowny, telefon_komorkowy, linkedin_url)',
      )
      .eq('client_id', id)
      .is('data_do', null)
      .order('jest_decyzyjny', { ascending: false }),
    supabase
      .from('enrichment_log')
      .select('status, error_message, run_completed_at')
      .eq('target_id', id)
      .eq('source', 'sprawozdania_KRS')
      .order('run_started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Sprint M FIX 5: top match score дla Metrics card
    supabase
      .from('matches')
      .select('algo_score')
      .eq('client_id', id)
      .order('algo_score', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!client) {
    notFound()
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={client.title}
        breadcrumbs={[
          { label: 'Klienci', href: '/clients' },
          { label: client.title },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/clients/${id}/edit`}>
                <PencilIcon className="mr-2 size-4" />
                Edytuj
              </Link>
            </Button>
            <NewDealButton
              clientId={id}
              clients={clients || []}
              products={products || []}
              people={people || []}
              suppliers={suppliers || []}
            />
          </div>
        }
      />
      {/* Sprint Q FIX A — combined sticky toolbar (ActionBar + AnchorNav).
           Single sticky container avoids DOM-order stacking conflict (which
           caused AnchorNav to disappear у Sprint P browser test). */}
      <div className="sticky top-0 z-40 bg-background border-b shadow-sm">
        <ClientActionBar
          clientId={id}
          nip={client.nip ?? null}
          topProductName={null}
        />
        <AnchorNav />
      </div>
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Sprint M FIX 3 — async enrichment progress indicator */}
        <EnrichmentProgressBanner clientId={id} />
        {/* #profil section: hero + summary */}
        <section id="profil" className="scroll-mt-20 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">{client.title}</CardTitle>
                  {client.industry && (
                    <CardDescription className="mt-1">{client.industry}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className={cn('text-white', segmentColors[client.segment] || segmentColors.niesklasyfikowany)}>
                    {client.segment}
                  </Badge>
                  <Badge variant="secondary" className={cn('text-white', statusColors[client.status])}>
                    {client.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {client.nip && (
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="size-4 text-muted-foreground" />
                    <span className="text-sm">NIP: {client.nip}</span>
                  </div>
                )}
                {(client.city || client.address) && (
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="size-4 text-muted-foreground" />
                    <span className="text-sm">
                      {[client.address, client.city, client.region].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {client.email && (
                  <div className="flex items-center gap-2">
                    <MailIcon className="size-4 text-muted-foreground" />
                    <a href={`mailto:${client.email}`} className="text-sm hover:underline">
                      {client.email}
                    </a>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2">
                    <PhoneIcon className="size-4 text-muted-foreground" />
                    <a href={`tel:${client.phone}`} className="text-sm hover:underline">
                      {client.phone}
                    </a>
                  </div>
                )}
                {client.website && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <GlobeIcon className="size-4 text-muted-foreground" />
                    <a
                      href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline"
                    >
                      {client.website}
                    </a>
                  </div>
                )}
              </div>
              <div className="mt-6">
                <StatusBadgesRow
                  vatStatus={client.vat_status ?? null}
                  gusStatus={client.gus_status ?? null}
                  employeeCountRange={client.employee_count_range ?? null}
                  krsStatus={client.krs_status ?? null}
                  krsLegalForm={client.krs_legal_form ?? null}
                />
              </div>
              {client.notes && (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-medium">Notatki</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Podsumowanie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Kontakty</span>
                <span className="font-medium">{contacts?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Umowy</span>
                <span className="font-medium">{deals?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Zadania</span>
                <span className="font-medium">{tasks?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Utworzono</span>
                <span className="text-sm">{new Date(client.created_at).toLocaleDateString('pl-PL')}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sprint M FIX 5: 4 metric cards row */}
        <MetricsRow
          bzpCount={bzpTenders?.length ?? 0}
          latestRevenuePln={
            (financials as Array<{ przychody_pln: number | null }> | null)?.[0]?.przychody_pln ?? null
          }
          employeeRange={client.employee_count_range ?? null}
          topMatchScore={(topMatch as { algo_score: number } | null)?.algo_score ?? null}
        />

        {/* #sygnaly section: BZP + sprawozdania + MSiG */}
        <section id="sygnaly" className="scroll-mt-20 flex flex-col gap-6">
          <BuyingSignalsSection tenders={(bzpTenders ?? []) as never} />
          <FinancialsSection
            data={(financials ?? []) as never}
            fallbackCtx={{
              forma_prawna: client.krs_legal_form ?? null,
              lastRunStatus: lastFinancialRun
                ? ((lastFinancialRun as { status: 'success' | 'partial' | 'error' }).status)
                : 'never',
              lastRunError: lastFinancialRun
                ? ((lastFinancialRun as { error_message: string | null }).error_message)
                : null,
            }}
          />
          <MsigChangesSection changes={(msigChanges ?? []) as never} />
        </section>

        {/* #analiza section: AI business profile */}
        <section id="analiza" className="scroll-mt-20">
          <BusinessProfileSection clientId={id} profile={client.business_profile ?? null} />
        </section>

        {/* #osoby section: persons + decision makers */}
        <section id="osoby" className="scroll-mt-20">
          <PeopleSection
            links={(personLinks ?? []) as never}
            title={
              (client.krs_legal_form ?? '').toLowerCase().includes('akcyjna') ||
              (client.krs_legal_form ?? '').toLowerCase().includes('z o.o.')
                ? 'Osoby decyzyjne'
                : 'Właściciel / kontakty'
            }
          />
        </section>

        {/* #kontakt section: VAT + GUS + KRS verification */}
        <section id="kontakt" className="scroll-mt-20 flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <VatSection
            targetType="client"
            targetId={id}
            hasNip={Boolean(client.nip)}
            initial={{
              vat_status: client.vat_status ?? null,
              vat_registered_date: client.vat_registered_date ?? null,
              vat_bank_accounts: client.vat_bank_accounts ?? null,
              vat_last_checked: client.vat_last_checked ?? null,
            }}
          />
          <GusSection
            targetType="client"
            targetId={id}
            hasNip={Boolean(client.nip)}
            initial={{
              gus_legal_name: client.gus_legal_name ?? null,
              gus_regon: client.gus_regon ?? null,
              gus_status: client.gus_status ?? null,
              registered_date: client.registered_date ?? null,
              employee_count_range: client.employee_count_range ?? null,
              pkd_codes: client.pkd_codes ?? null,
              gus_last_checked: client.gus_last_checked ?? null,
            }}
          />
        </div>
          <KrsSection
            targetType="client"
            targetId={id}
            initial={{
              krs_number: client.krs_number ?? null,
              krs_full_name: client.krs_full_name ?? null,
              krs_legal_form: client.krs_legal_form ?? null,
              krs_registration_date: client.krs_registration_date ?? null,
              krs_status: client.krs_status ?? null,
              krs_management_board: client.krs_management_board ?? null,
              krs_pkd_with_descriptions: client.krs_pkd_with_descriptions ?? null,
              krs_last_checked: client.krs_last_checked ?? null,
            }}
          />
        </section>

        {/* #dopasowania section: L5 algo matching */}
        <section id="dopasowania" className="scroll-mt-20">
          <MatchesPanel
            mode="product-side"
            keyType="client_id"
            keyValue={id}
            recomputePath="/api/admin/matching/recompute-client"
            title="Dopasowane produkty Sztab"
          />
        </section>

        {/* #aktywnosc section: history + tabs */}
        <section id="aktywnosc" className="scroll-mt-20 flex flex-col gap-6">
          <ProfileFieldsTable fields={(profileFields ?? []) as never} />
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
        </section>
      </div>
    </div>
  )
}
