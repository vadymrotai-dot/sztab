// app/(dashboard)/clients/[id]/page.tsx
// Sprint S2B Phase 2 — comprehensive client detail redesign.
// Connects S1 (rejestr.io v2) + S2A (score formula) DB fields.
// Drops: sticky 5-action bar, horizontal anchor nav, debug "Profil canonical
// 18 pól", raw JSON dumps, stale "Sprawozdania niedostępne HTTP 400".

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { ClientContacts } from '@/components/clients/client-contacts'
import { ClientDeals } from '@/components/clients/client-deals'
import { ClientTasks } from '@/components/clients/client-tasks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MatchesPanel } from '@/components/matches/matches-panel'
import { BusinessProfileSection } from '@/components/clients/business-profile-section'
import { WebsiteOverrideCard } from '@/components/clients/website-override-card'
import { EnrichmentProgressBanner } from '@/components/clients/enrichment-progress-banner'
import { AccordionSection } from '@/components/clients/accordion-section'
import { MetricStrip } from '@/components/clients/metric-strip'
import { ProfileSectionV2 } from '@/components/clients/profile-section-v2'
import { FinancialStatementsTable } from '@/components/clients/financial-statements-table'
import { PersonsSectionV2 } from '@/components/clients/persons-section-v2'
import { SignalsSection } from '@/components/clients/signals-section'
import { ContactSectionV2 } from '@/components/clients/contact-section-v2'
import { ClientDetailActions } from '@/components/clients/client-detail-actions'
import { OrderLinkButton } from '@/components/clients/order-link-button'
import { ClientTypeBadge } from '@/components/clients/client-type-badge'
import { MenuSection, type MenuDish, type MenuCoverage, type MenuDishesSource } from '@/components/clients/menu-section'
import { PredictionsSection } from '@/components/clients/predictions-section'
import { aggregateMonthlyIngredients } from '@/lib/predictions/aggregate-ingredients'
import type { ClientType } from '@/lib/ai/business-analysis'
import { SectionActionLink } from '@/components/clients/section-action-link'
import { KrsRefreshButton } from '@/components/clients/krs-refresh-button'

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
    { data: bzpTenders },
    { data: financialStatements },
    { data: profileFields },
    { data: personLinks },
    { data: crbr },
    { data: branches },
    { data: topMatch },
    { data: pkdMain },
    // Sprint S6B-UI-A — Apify Google Maps data для SignalsSection card
    { data: apifyEnrichment },
    // Sprint S6D Day 3 — menu enrichment rows (www_menu / wedo_pdf_menu / blocked)
    { data: menuRows },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('contacts').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('deals').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('tasks').select('*').eq('client_id', id).order('due', { ascending: true }),
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
    // Sprint S6B-UI-A — Apify Google Maps card data (Phase B STEP 5).
    // contact_enrichment row з gmaps_rating, reviews_count, gmaps_url, phone.
    supabase
      .from('contact_enrichment')
      .select('status, gmaps_rating, gmaps_reviews_count, gmaps_url, phone, raw_payload')
      .eq('target_id', id)
      .eq('target_type', 'client')
      .eq('source', 'apify_gmaps')
      .maybeSingle(),
    // Sprint S6D Day 3 — fetch menu sources для MenuSection.
    // Order priority: wedo_pdf_menu (full PDF) > www_menu (full HTML) >
    //   www_menu_blocked (UpMenu marker) > apify_gmaps (popular subset).
    // Read all sources, merge у component-side prep below.
    supabase
      .from('contact_enrichment')
      .select('source, status, raw_payload, enriched_at')
      .eq('target_id', id)
      .eq('target_type', 'client')
      // Sprint S-MENU Day 3.2 (15.05.2026) — added 'restaumatic_menu' (top
      // priority JSON-LD source from Restaumatic-hosted PL gastronomy).
      .in('source', ['restaumatic_menu', 'wedo_pdf_menu', 'www_menu', 'www_menu_blocked']),
  ])

  if (!client) notFound()

  // S-ORDER.1.D — resolve cohort_id для tracking order leads
  const { data: cohortMember } = await supabase
    .from('cohort_members')
    .select('cohort_id')
    .eq('subject_id', id)
    .eq('subject_type', 'client')
    .limit(1)
    .maybeSingle()
  const orderCohortId = cohortMember?.cohort_id ?? null

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
  // Sprint S6B-UI-A — JDG NIE skladają sprawozdań finansowych. Якщо
  // legal_form indicates sole-prop OR krs_number missing → no misleading
  // "Brak danych" — explicit "JDG nie składa sprawozdań".
  const isJdg =
    !c.krs_number ||
    /JDG|JEDNOOSOBOW|JEDNOSOBOW/i.test(c.krs_legal_form ?? '')
  const fsMeta =
    fs.length > 0
      ? `${fs.length} lat KRS · ostatni rok ${fs[0]?.okres_data_koniec.slice(0, 4)}`
      : isJdg
        ? 'JDG nie składa sprawozdań'
        : 'Brak danych'
  const personsMeta = `${personsForSection.length} zarząd · ${crbrEntries.length} BO`
  const signalsMeta =
    (c.bankruptcy_flag || c.liquidation_flag || c.restructuring_flag
      ? '⚠️ Red flags · '
      : '✓ Aktywna · ') + `${bzpCount} BZP`
  const matchesMeta = topMatchScore !== null ? `TOP score ${topMatchScore}` : 'Brak dopasowań'
  // Sprint S6B-UI-A — dynamic meta з business_profile JSONB замість
  // hardcoded "Czudowa Marka — buyer strength".
  const bp = (c.business_profile as {
    business_format?: string
    buyer_strength_for_chm?: number
  } | null) ?? null
  const FORMAT_PL: Record<string, string> = {
    single_store: 'Pojedynczy sklep',
    chain: 'Sieć sklepów',
    franchise: 'Franczyza',
    online: 'Sklep online',
    B2B_distributor: 'Dystrybutor B2B',
    gastronomy: 'Gastronomia',
    manufacturer: 'Producent',
    service: 'Usługi',
    other: 'Inne',
  }
  const aiMeta = bp?.business_format
    ? `${FORMAT_PL[bp.business_format] ?? bp.business_format} — siła kupującego ${
        bp.buyer_strength_for_chm ?? '?'
      }/100`
    : 'Brak analizy — uruchom "Analiza klienta"'
  const contactSourcesCount = [emailValue, phoneValue, websiteValue].filter(Boolean).length

  // Sprint S6D Day 3 — menu data prep (для MenuSection component).
  // Merge sources by priority: wedo_pdf_menu > www_menu > apify_gmaps popular.
  // UpMenu blocked detected якщо www_menu_blocked row present.
  const isGastronomia =
    (c.business_profile as { client_type?: ClientType } | null)?.client_type === 'gastronomia'

  type MenuRow = {
    source: string
    status: string | null
    raw_payload: { dishes?: MenuDish[] } | null
    enriched_at: string | null
  }
  const menuRowsTyped = ((menuRows ?? []) as unknown) as MenuRow[]
  // Sprint S-MENU Day 3.2 (15.05.2026) — restaumaticRow checked FIRST.
  // Restaumatic JSON-LD = highest quality source (structured sections,
  // prices, descriptions; zero AI cost). MARCIN BOROWY case: 65 dishes.
  const restaumaticRow = menuRowsTyped.find((r) => r.source === 'restaumatic_menu' && (r.raw_payload?.dishes?.length ?? 0) > 0)
  const wedoRow = menuRowsTyped.find((r) => r.source === 'wedo_pdf_menu' && r.status !== 'partial' && (r.raw_payload?.dishes?.length ?? 0) > 0)
  const wwwRow = menuRowsTyped.find((r) => r.source === 'www_menu' && (r.raw_payload?.dishes?.length ?? 0) > 0)
  const upMenuBlockedRow = menuRowsTyped.find((r) => r.source === 'www_menu_blocked')

  let menuDishes: MenuDish[] = []
  let menuCoverage: MenuCoverage = 'none'
  let menuSource: MenuDishesSource = 'manual'
  let menuLastUpdated: string | null = null

  // Sprint S-MENU Day 3.2 — Restaumatic checked first (top priority).
  if (restaumaticRow) {
    menuDishes = restaumaticRow.raw_payload?.dishes ?? []
    menuSource = 'restaumatic_menu'
    menuCoverage = menuDishes.length > 10 ? 'full_menu' : 'popular_only'
    menuLastUpdated = restaumaticRow.enriched_at
  } else if (wedoRow) {
    menuDishes = wedoRow.raw_payload?.dishes ?? []
    menuSource = 'wedo_pdf_menu'
    menuCoverage = menuDishes.length > 10 ? 'full_menu' : 'popular_only'
    menuLastUpdated = wedoRow.enriched_at
  } else if (wwwRow) {
    menuDishes = wwwRow.raw_payload?.dishes ?? []
    menuSource = 'www_menu'
    menuCoverage = menuDishes.length > 10 ? 'full_menu' : 'popular_only'
    menuLastUpdated = wwwRow.enriched_at
  } else {
    // Fallback — extract popular dishes з apify_gmaps row (Day 3 КРОК 1
    // scrapePlaceDetailPage flag enables menu_dishes if actor returns них).
    // Sprint S6D Day 3 BUGFIX (12.05.2026) — defensive Array.isArray.
    // Apify може повернути `menu` як object (not array) OR missing entirely.
    // Direct `.filter` crash → HTTP 500 на /clients/{id}.
    const gmapsRaw = (apifyEnrichment as { raw_payload?: unknown } | null)?.raw_payload as
      | { best?: { menu?: unknown } }
      | null
    const gmapsMenuRaw = gmapsRaw?.best?.menu
    const gmapsMenu = Array.isArray(gmapsMenuRaw)
      ? (gmapsMenuRaw as Array<{ name?: string; price?: number | string; description?: string }>)
      : []
    if (gmapsMenu.length > 0) {
      menuDishes = gmapsMenu
        .filter((d) => typeof d.name === 'string' && d.name.trim())
        .map((d) => {
          const priceParsed =
            typeof d.price === 'number'
              ? d.price
              : typeof d.price === 'string'
                ? parseFloat(d.price.replace(/[^\d,.\-]/g, '').replace(',', '.'))
                : null
          return {
            name_pl: d.name!.trim(),
            price_pln: priceParsed && Number.isFinite(priceParsed) ? priceParsed : null,
            category: null,
            description: d.description ?? null,
          }
        })
      menuSource = 'gmaps_menu'
      menuCoverage = 'popular_only'
    }
  }

  // Sprint S6D Day 4 — fetch aggregated ingredient prediction (lazy, only
  // when gastronomia + Anthropic key configured). Runs AI calls per dish
  // server-side; cache hits y dish_ingredient_mappings keep cost low after
  // warm-up. Якщо anthropicKey missing OR not gastronomia → null prediction.
  let aggregatedPrediction: Awaited<
    ReturnType<typeof aggregateMonthlyIngredients>
  >['prediction'] = null
  if (isGastronomia) {
    try {
      const { data: paramsRow } = await supabase
        .from('params')
        .select('anthropic_api_key')
        .limit(1)
        .maybeSingle()
      const anthropicKey =
        (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? ''
      if (anthropicKey) {
        const { prediction } = await aggregateMonthlyIngredients(
          supabase,
          id,
          anthropicKey,
        )
        aggregatedPrediction = prediction
      }
    } catch (err) {
      // Non-fatal — log + render empty
      console.error('[predictions] aggregation failed:', err)
    }
  }

  return (
    <div className="flex flex-col bg-[#FAFAF7] min-h-screen">
      <PageHeader
        title={c.title}
        breadcrumbs={[{ label: 'Klienci', href: '/clients' }, { label: c.title }]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <OrderLinkButton
              clientId={id}
              clientName={c.title}
              cohortId={orderCohortId}
            />
            <ClientDetailActions
              clientId={id}
              nip={c.nip}
              hasProfile={Boolean(
                (c.business_profile as { business_format?: string } | null)?.business_format,
              )}
            />
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-3 p-6">
        {/* Hero row — status + client_type + NIP + KRS, secondary identity.
            Sprint S6D Day 1 — додано ClientTypeBadge для two-track UI gating
            (gastronomia/hurtownia conditional sections planned Day 6+). */}
        <div className="flex flex-wrap items-center gap-3 px-1">
          <Badge variant="secondary" className={`text-white ${statusColor[c.status] ?? 'bg-gray-400'}`}>
            {c.status}
          </Badge>
          <ClientTypeBadge
            clientId={id}
            clientType={
              ((c.business_profile as {
                client_type?: ClientType
              } | null)?.client_type) as ClientType | undefined
            }
            classificationConfidence={
              (c.business_profile as { classification_confidence?: number } | null)
                ?.classification_confidence
            }
          />
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

        {/* Sprint S6D Day 3 — Menu section (тільки для gastronomia клієнтів).
            Rendered ВИЩЕ Profil accordion бо це core capability per Vadym
            ("наша перемога коли ми бачимо меню клієнта"). */}
        {isGastronomia && (
          <AccordionSection
            id="menu"
            title="Menu klienta"
            meta={
              menuCoverage === 'full_menu'
                ? `${menuDishes.length} dań — pełne menu`
                : menuCoverage === 'popular_only'
                  ? `${menuDishes.length} dań — tylko popularne`
                  : upMenuBlockedRow
                    ? 'UpMenu (iframe — niedostępne)'
                    : 'Brak menu'
            }
            defaultOpen={true}
          >
            <MenuSection
              dishes={menuDishes}
              coverage={menuCoverage}
              source={menuSource}
              lastUpdated={menuLastUpdated}
              upMenuDetected={Boolean(upMenuBlockedRow)}
            />
          </AccordionSection>
        )}

        {/* Sprint S6D Day 4 — Monthly ingredient prediction (Tier 1 formula).
            Always renders для gastronomia — fallback empty state якщо
            aggregation returned null (e.g. anthropic_api_key missing).
            Server-side aggregation runs AI per dish (cached у dish_ingredient_mappings). */}
        {isGastronomia && (
          <AccordionSection
            id="predictions"
            title="Prognoza miesięcznej potrzeby"
            meta={
              aggregatedPrediction
                ? aggregatedPrediction.coverage_tier === 'full_menu'
                  ? `${aggregatedPrediction.ingredients.length} składników z pełnego menu`
                  : aggregatedPrediction.coverage_tier === 'popular_only'
                    ? `${aggregatedPrediction.ingredients.length} składników z popularnych`
                    : `${aggregatedPrediction.ingredients.length} składników wg podtypu`
                : 'Niedostępne'
            }
            defaultOpen={true}
          >
            {aggregatedPrediction ? (
              <PredictionsSection
                predictionId={aggregatedPrediction.prediction_id ?? null}
                coverage={aggregatedPrediction.coverage_tier}
                predictionConfidence={aggregatedPrediction.prediction_confidence}
                dishesCount={aggregatedPrediction.dishes_count}
                dishesSource={aggregatedPrediction.dishes_source}
                volume={aggregatedPrediction.volume}
                ingredients={aggregatedPrediction.ingredients}
                reviewsCount={
                  (apifyEnrichment as { gmaps_reviews_count?: number | null } | null)
                    ?.gmaps_reviews_count ?? 0
                }
              />
            ) : (
              <div className="rounded border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">Prognoza niedostępna</p>
                <p className="mt-1 text-xs">
                  Możliwe przyczyny: brak <code>anthropic_api_key</code> w params,
                  brak business_profile.client_type=&apos;gastronomia&apos; w DB
                  (sprawdź badge), lub agregacja zwróciła błąd (sprawdź logs serwera).
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  Uruchom &quot;Pełna re-analiza&quot; aby odświeżyć źródła danych.
                </p>
              </div>
            )}
          </AccordionSection>
        )}

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

        {/* Sprint S-MENU Day 3 (15.05.2026) — Manual website override.
            Placed after Profil but before Sprawozdania — visible without
            accordion expand. Reason: Tavily-picked aggregator URLs
            (monitorfirm.pb.pl, yelp.com) block menu extraction; Vadym
            potrzebuje quick override без going into "Edytuj" full form. */}
        <WebsiteOverrideCard
          clientId={id}
          currentWebsite={websiteValue ?? null}
          currentSource={websiteSource}
        />

        <AccordionSection
          id="sprawozdania"
          title="Sprawozdania finansowe"
          meta={fsMeta}
          detailHref={`/clients/${id}/sprawozdania`}
          action={<KrsRefreshButton clientId={id} enabled={Boolean(c.nip)} />}
        >
          <FinancialStatementsTable rows={fs} />
        </AccordionSection>

        <AccordionSection
          id="osoby"
          title="Osoby"
          meta={personsMeta}
          action={<KrsRefreshButton clientId={id} enabled={Boolean(c.nip)} />}
          defaultOpen={true}
        >
          <PersonsSectionV2 persons={personsForSection} crbr={crbrEntries} />
        </AccordionSection>

        <AccordionSection
          id="sygnaly"
          title="Sygnały"
          meta={signalsMeta}
          action={<SectionActionLink label="Sprawdź BZP" href={`/intelligence/lookup?nip=${c.nip ?? ''}`} />}
          defaultOpen={true}
        >
          <SignalsSection
            lastFilingDate={c.last_filing_date}
            bankruptcyFlag={Boolean(c.bankruptcy_flag)}
            liquidationFlag={Boolean(c.liquidation_flag)}
            restructuringFlag={Boolean(c.restructuring_flag)}
            suspendedAt={c.suspended_at}
            bzpCount={bzpCount}
            bzpRecent={(bzpTenders ?? []).slice(0, 3) as Array<{
              ordering_party: string | null
              award_date: string | null
            }>}
            apify={
              apifyEnrichment
                ? (apifyEnrichment as {
                    status: string | null
                    gmaps_rating: number | null
                    gmaps_reviews_count: number | null
                    gmaps_url: string | null
                    phone: string | null
                  })
                : null
            }
          />
        </AccordionSection>

        <AccordionSection
          id="analiza-ai"
          title="Analiza biznesowa (AI)"
          meta={aiMeta}
          defaultOpen={true}
        >
          <BusinessProfileSection clientId={id} profile={(c.business_profile as never) ?? null} />
        </AccordionSection>

        <AccordionSection
          id="dopasowania"
          title="Dopasowania produktów"
          meta={matchesMeta}
          action={<SectionActionLink label="Pokaż TOP-10 →" href={`/matches?client_id=${id}`} primary />}
        >
          <MatchesPanel
            mode="product-side"
            keyType="client_id"
            keyValue={id}
            recomputePath="/api/admin/matching/recompute-client"
            title=""
          />
        </AccordionSection>

        <AccordionSection
          id="kontakt"
          title="Kontakt"
          meta={`${contactSourcesCount} źródeł`}
          action={<SectionActionLink label="+ Dodaj kontakt" href={`/clients/${id}#aktywnosc`} />}
        >
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
          id="aktywnosc"
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
