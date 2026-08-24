// app/(dashboard)/clients/[id]/page.tsx
// Sprint S2B Phase 2 — comprehensive client detail redesign.
// Connects S1 (rejestr.io v2) + S2A (score formula) DB fields.
// Drops: sticky 5-action bar, horizontal anchor nav, debug "Profil canonical
// 18 pól", raw JSON dumps, stale "Sprawozdania niedostępne HTTP 400".

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
import {
  ClientPricingPanel,
  type PricingSegmentOption,
  type PricingExample,
} from '@/components/clients/client-pricing-panel'
import { ProfileSectionV2 } from '@/components/clients/profile-section-v2'
import { FinancialStatementsTable } from '@/components/clients/financial-statements-table'
import { PersonsSectionV2 } from '@/components/clients/persons-section-v2'
import { SignalsSection } from '@/components/clients/signals-section'
import { ContactSectionV2 } from '@/components/clients/contact-section-v2'
import { ContactSectionV3 } from '@/components/clients/contact-section-v3'
import { ClientNotesSection } from '@/components/clients/client-notes-section'
import { ClientTimelineSection } from '@/components/clients/client-timeline-section'
import { buildTimelineEvents } from '@/lib/timeline/build-events'
import { OrdersSection } from '@/components/clients/orders-section'
import { ClientDetailActions } from '@/components/clients/client-detail-actions'
import { SendOfferButton } from '@/components/clients/send-offer-button'
import { ClientTypeBadge } from '@/components/clients/client-type-badge'
import { MenuSection, type MenuDish, type MenuCoverage, type MenuDishesSource } from '@/components/clients/menu-section'
import { PredictionsSectionAsync } from '@/components/clients/predictions-section-async'
import type { ClientType } from '@/lib/ai/business-analysis'
import { SectionActionLink } from '@/components/clients/section-action-link'
import { KrsRefreshButton } from '@/components/clients/krs-refresh-button'

const statusColor: Record<string, string> = {
  nowy: 'bg-blue-500',
  aktywny: 'bg-green-500',
  nieaktywny: 'bg-gray-400',
}

// Sprint TYDZIEN2 PERF (28.05.2026) — page maxDuration safety net.
// Vercel Pro plan dozwala do 60s. Suspense + async PredictionsSection robi
// AI agregację у tle (5-30s typowo), maxDuration zapewnia że nawet jeśli
// streaming utknie — Vercel nie zwróci 503 zbyt wcześnie.
export const maxDuration = 60

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  // Sprint TYDZIEN2.T2.3 (28.05.2026) — ?from=cohort&fromId={uuid} convention.
  // Cohort row Link na /intelligence/cohorts/[id] przekazuje cohort context
  // aby dynamic breadcrumb pokazał drogę powrotną. Backward-compat: bez param
  // — fallback do standardowego "Klienci > {title}".
  // T2.3.1 BUGFIX (28.05.2026) — convention split z `?from=cohort/{uuid}` na
  // 2 osobne params aby uniknąć slash w query value (Next.js Link prefetch
  // silnie no-op'ował click navigation).
  searchParams: Promise<{ from?: string; fromId?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  // Sprint TYDZIEN2.T2.3 — parse ?from=cohort&fromId={uuid} jeśli obecne.
  // T2.3.1 BUGFIX — 2 separate params (slash w query blокował Link nav).
  // Validation: UUID v4 regex (relaxed — accept any UUID format). Jeśli invalid
  // lub cohort nie istnieje → fallback do default breadcrumb (graceful).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  let fromCohortId: string | null = null
  if (sp.from === 'cohort' && sp.fromId && UUID_RE.test(sp.fromId)) {
    fromCohortId = sp.fromId
  }
  let fromCohort: { id: string; name: string } | null = null
  if (fromCohortId) {
    // cohorts RLS = FOR ALL TO authenticated (migration 060) → anon supabase OK
    const { data } = await supabase
      .from('cohorts')
      .select('id, name')
      .eq('id', fromCohortId)
      .maybeSingle()
    if (data) fromCohort = data as { id: string; name: string }
  }

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
    // Sprint TYDZIEN2 PERF (28.05.2026) — combined contact_enrichment fetch
    // (apify_gmaps + menus). Wcześniej 2 osobne queries dla тих самих rows;
    // teraz 1 z .in() filter + client-side split. Saves 1 round-trip.
    { data: enrichmentRows },
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
    // Sprint TYDZIEN2 PERF (28.05.2026) — combined contact_enrichment for
    // Apify GMaps (gmaps_rating/reviews/phone) + menu sources
    // (restaumatic/wedo/www/blocked). Single query з .in() filter + ALL fields
    // potrzebne dla obu use cases; split у TypeScript poniżej.
    supabase
      .from('contact_enrichment')
      .select('source, status, gmaps_rating, gmaps_reviews_count, gmaps_url, phone, raw_payload, enriched_at')
      .eq('target_id', id)
      .eq('target_type', 'client')
      .in('source', ['apify_gmaps', 'restaumatic_menu', 'wedo_pdf_menu', 'www_menu', 'www_menu_blocked']),
  ])

  if (!client) notFound()

  // Sprint TYDZIEN2 PERF — split combined enrichment rows do dwóch shapes:
  //   apifyEnrichment — single row apify_gmaps (backward-compat z poprzednim
  //     code path: { status, gmaps_rating, gmaps_reviews_count, gmaps_url,
  //     phone, raw_payload })
  //   menuRows — array menu source rows (restaumatic/wedo/www/blocked)
  type EnrichmentRow = {
    source: string
    status: string | null
    gmaps_rating: number | null
    gmaps_reviews_count: number | null
    gmaps_url: string | null
    phone: string | null
    raw_payload: unknown
    enriched_at: string | null
  }
  const enrichmentAll = (enrichmentRows ?? []) as EnrichmentRow[]
  const apifyEnrichment = enrichmentAll.find((r) => r.source === 'apify_gmaps') ?? null
  const menuRows = enrichmentAll.filter((r) => r.source !== 'apify_gmaps')

  // Sprint TYDZIEN2 PERF (28.05.2026) — parallelize 3 post-initial queries
  // (cohort_member, orders, client_contact_methods). Wcześniej każdy był osobny
  // await sequential → 3 round-trips. Tepere — Promise.all → 1 batch, ~200-400ms
  // saved typically. order_items zostaje sequential bo depends od orders.ids.
  //
  // BUGFIX (28.05.2026) — orders + order_items mają RLS enabled bez policies
  // (migration 069 Option B: service-role only). Anon-based `supabase` (cookie
  // session) zwraca 0 rows → empty state nawet gdy real orders istnieją.
  // Używamy adminSupabase (jak /operacje/zamowienia/page.tsx). Auth guard
  // na linii ~50 (redirect '/auth/login') juz zatrzymał anon access do strony.
  const adminSupabase = createAdminClient()
  const [
    { data: cohortMember },
    { data: clientOrdersData },
    { data: contactMethodsData },
    { data: clientNotesData },
  ] = await Promise.all([
    // S-ORDER.1.D — resolve cohort_id для tracking order leads
    supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('subject_id', id)
      .eq('subject_type', 'client')
      .limit(1)
      .maybeSingle(),
    // Sprint TYDZIEN2.T2.2 — orders (admin client bypassuje RLS deny)
    adminSupabase
      .from('orders')
      .select(
        'id, order_number, status, cennik_tier, price_mode, total_net, total_brutto, total_vat, delivery_address, preferred_delivery_date, customer_notes, submitted_at, created_at, link_opened_at, confirmed_at, proforma_fakturownia_number, vat_fakturownia_number',
      )
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    // Sprint TYDZIEN2.T2.4.B — client_contact_methods (RLS auth.uid()=owner_id)
    supabase
      .from('client_contact_methods')
      .select('id, kind, value, label, is_primary, source, created_at')
      .eq('client_id', id)
      .order('kind', { ascending: true })
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true }),
    // Sprint TYDZIEN2.T2.5 — client_notes (RLS auth.uid()=owner_id, migration 076)
    // Newest first dla UI display. Anon supabase wystarczy bo RLS authenticated.
    // T2.6 (29.05.2026) — extended select z kind + occurred_at (migration 077)
    // dla timeline UNION. T2.5 ClientNotesSection ignoruje te kolumny.
    supabase
      .from('client_notes')
      .select('id, body, kind, occurred_at, created_at, updated_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  ])
  const clientOrders = (clientOrdersData ?? []) as Array<{
    id: string
    order_number: string
    status: string
    cennik_tier: string | null
    price_mode: string | null
    total_net: number
    total_brutto: number
    total_vat: number
    delivery_address: string | null
    preferred_delivery_date: string | null
    customer_notes: string | null
    submitted_at: string | null
    created_at: string
    link_opened_at: string | null
    confirmed_at: string | null
    proforma_fakturownia_number: string | null
    vat_fakturownia_number: string | null
  }>
  const orderIds = clientOrders.map((o) => o.id)
  let orderItemsByOrder: Record<string, Array<{ product_name_snapshot: string; qty: number; gramatura_snapshot: string | null }>> = {}
  if (orderIds.length > 0) {
    const { data: itemsData } = await adminSupabase
      .from('order_items')
      .select('order_id, product_name_snapshot, qty, gramatura_snapshot, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
    type ItemRow = {
      order_id: string
      product_name_snapshot: string
      qty: number
      gramatura_snapshot: string | null
    }
    for (const row of (itemsData ?? []) as ItemRow[]) {
      if (!orderItemsByOrder[row.order_id]) orderItemsByOrder[row.order_id] = []
      orderItemsByOrder[row.order_id]!.push({
        product_name_snapshot: row.product_name_snapshot,
        qty: row.qty,
        gramatura_snapshot: row.gramatura_snapshot,
      })
    }
  }

  // Sprint TYDZIEN2.T2.4.B — client_contact_methods fetched у Promise.all wyżej.
  const contactMethods = (contactMethodsData ?? []) as Array<{
    id: string
    kind: string
    value: string
    label: string | null
    is_primary: boolean
    source: string
    created_at: string
  }>

  // Sprint TYDZIEN2.T2.5 (29.05.2026) — client_notes fetched у Promise.all wyżej.
  // Sorted DESC za created_at z server query. UI ClientNotesSection renderowany
  // jak-is bez resortowania.
  // T2.6 (29.05.2026) — extended z kind + occurred_at dla timeline.
  const clientNotes = (clientNotesData ?? []) as Array<{
    id: string
    body: string
    kind: string
    occurred_at: string | null
    created_at: string
    updated_at: string
  }>

  // Sprint TYDZIEN2.T2.6 (29.05.2026) — Historia interakcji.
  // Build timeline events list z orders + client_notes (UNION-style).
  // ZERO new queries — reuses już fetchowane clientOrders + clientNotes.
  // Sortowane DESC za COALESCE(occurred_at, created_at) inside helper.
  const timelineEvents = buildTimelineEvents({
    orders: clientOrders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      created_at: o.created_at,
      link_opened_at: o.link_opened_at,
      submitted_at: o.submitted_at,
      confirmed_at: o.confirmed_at,
    })),
    notes: clientNotes,
  })

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
    gus_legal_form: string | null
    krs_registration_date: string | null
    registered_date: string | null
    gus_status: string | null
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

  // Fix (24.08.2026) — priorytet email: ręczny ⭐ primary z client_contact_methods
  // wygrywa nad auto-źródłami (KRS / website_scrape / clients.email). Operator
  // wybiera właściwy adres gwiazdką — oferta/link muszą go użyć.
  const starredEmail = contactMethods.find((m) => m.kind === 'email' && m.is_primary)
  const anyEmailMethod = contactMethods.find((m) => m.kind === 'email')
  const emailValue =
    starredEmail?.value ??
    c.email_krs ??
    emailField?.value_text ??
    anyEmailMethod?.value ??
    c.email
  const emailSource = starredEmail
    ? starredEmail.source
    : c.email_krs
      ? 'KRS'
      : emailField?.source ?? (anyEmailMethod ? anyEmailMethod.source : null)
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

  // Sprint TYDZIEN2 PERF (28.05.2026) — defer aggregateMonthlyIngredients
  // do PredictionsSectionAsync (Suspense fallback skeleton). Wcześniej tu
  // robiło się sync AI calls (Haiku per dish) i blokowało page render → 503.
  // Tepere: page renderuje HTML natychmiast; section stremuje gdy AI ready.

  // Faza 1 DAGOLD (089) — KROK E: dane do panelu cen klienta.
  // Segmenty A/B/C + produkt przykładowy (pierwszy z marżą bazową i kosztem)
  // do żywego podglądu ceny tego klienta.
  const [{ data: priceSegmentsData }, { data: exampleProductData }] = await Promise.all([
    supabase
      .from('price_segments')
      .select('code, name, znizka_pct')
      .order('sort_order', { ascending: true }),
    supabase
      .from('products')
      .select('name, cost_pln, marza_bazowa_pct')
      .not('marza_bazowa_pct', 'is', null)
      .gt('cost_pln', 0)
      .order('name', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  const pricingSegments: PricingSegmentOption[] = (priceSegmentsData ?? []).map((s) => ({
    code: s.code as string,
    name: s.name as string,
    znizka_pct: Number(s.znizka_pct ?? 0),
  }))
  const pricingExample: PricingExample | null =
    exampleProductData &&
    exampleProductData.cost_pln != null &&
    exampleProductData.marza_bazowa_pct != null &&
    Number(exampleProductData.marza_bazowa_pct) < 1
      ? {
          name: exampleProductData.name as string,
          segAPrice:
            Math.round(
              (Number(exampleProductData.cost_pln) /
                (1 - Number(exampleProductData.marza_bazowa_pct))) *
                100,
            ) / 100,
        }
      : null

  return (
    <div className="flex flex-col bg-[#FAFAF7] min-h-screen">
      <PageHeader
        title={c.title}
        breadcrumbs={
          // Sprint TYDZIEN2.T2.3 (28.05.2026) — dynamic 4-step breadcrumb gdy
          // przyszli z cohort (explicit ?from=cohort/{uuid} + cohort exists),
          // inaczej 2-step fallback. 4-step zachowuje consistency z cohort
          // page own breadcrumb (AI Discovery > Cohorts > {name}).
          fromCohort
            ? [
                { label: 'AI Discovery', href: '/intelligence' },
                { label: 'Cohorts', href: '/intelligence/cohorts' },
                { label: fromCohort.name, href: `/intelligence/cohorts/${fromCohort.id}` },
                { label: c.title },
              ]
            : [{ label: 'Klienci', href: '/clients' }, { label: c.title }]
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SendOfferButton
              clientId={id}
              clientTitle={c.title}
              clientEmail={emailValue ?? null}
              attachOffer={false}
              label="Wyślij link do zamówienia"
            />
            <SendOfferButton
              clientId={id}
              clientTitle={c.title}
              clientEmail={emailValue ?? null}
              attachOffer={true}
              label="Wyślij ofertę"
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
          {c.gus_status === 'deregistered' && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
              Wykreślona z REGON
            </span>
          )}
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
          buyerStrength={bp?.buyer_strength_for_chm ?? null}
          topMatchScore={topMatchScore}
          latestRevenuePln={latestRevenuePln}
          revenueYoyPct={revenueYoyPct}
          employeesCount={employeesCount}
          branchOfficesCount={branchOfficesCount}
        />

        <ClientPricingPanel
          clientId={id}
          initialSegmentCode={(c.price_segment_code as string | null) ?? null}
          initialZnizka={
            c.znizka_indywidualna_pct != null ? Number(c.znizka_indywidualna_pct) : null
          }
          initialZnizkaKalmar={
            c.znizka_indywidualna_kalmar_pct != null
              ? Number(c.znizka_indywidualna_kalmar_pct)
              : null
          }
          initialRetail={(c as { retail_pricing?: boolean }).retail_pricing === true}
          segments={pricingSegments}
          example={pricingExample}
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
        {/* Fix 12.06 — BEZ Suspense. Render PredictionsSectionAsync czyta tylko
            gotowy cache (menu_predictions) i jest natychmiastowy; streaming tu
            zbędny. Usunięcie boundary eliminuje fallback-swap/re-suspend przy
            hydracji (przycisk "Policz prognozę" pozostawał ukryty na zawsze,
            onClick martwy). Liczenie jest jawne — POST /compute-prediction. */}
        {isGastronomia && (
          <AccordionSection
            id="predictions"
            title="Prognoza miesięcznej potrzeby"
            meta="Analiza menu"
            defaultOpen={true}
          >
            <PredictionsSectionAsync
              clientId={id}
              reviewsCount={
                (apifyEnrichment as { gmaps_reviews_count?: number | null } | null)
                  ?.gmaps_reviews_count ?? 0
              }
            />
          </AccordionSection>
        )}

        <AccordionSection title="Profil" meta={profileMeta} defaultOpen={true}>
          <ProfileSectionV2
            forma_prawna={c.krs_legal_form ?? c.gus_legal_form ?? (c.krs_number ? null : 'JDG')}
            address={c.address}
            city={c.city}
            region={c.region}
            nip={c.nip}
            regon={c.gus_regon}
            krs_number={c.krs_number}
            kapital_zakladowy={c.kapital_zakladowy}
            founded_at={c.krs_registration_date ?? c.registered_date ?? c.founded_at}
            vat_status={c.vat_status}
            vat_registered_date={c.vat_registered_date}
            pkd_main={pkdMainCode}
            pkd_main_name={pkdMainName}
            pkd_total_count={c.pkd_codes?.length ?? 0}
            bank_account={bankAccount}
          />
        </AccordionSection>

        {/* Sprint TYDZIEN2.T2.6 (29.05.2026) — Historia interakcji.
            Timeline UNION orders (4 events per row) + client_notes (z kind,
            mig 077). User dodaje wpis (telefon/spotkanie/przypomnienie/notatka)
            z opcjonalną datą zdarzenia. defaultOpen gdy są jakiekolwiek events.
            Pozycja: wysoko (zaraz po Profil), bo to primary CRM view. */}
        <AccordionSection
          id="historia"
          title="Historia"
          meta={
            timelineEvents.length === 0
              ? 'brak wpisów'
              : `${timelineEvents.length} ${
                  timelineEvents.length === 1
                    ? 'wpis'
                    : timelineEvents.length % 10 >= 2 &&
                        timelineEvents.length % 10 <= 4 &&
                        (timelineEvents.length % 100 < 10 ||
                          timelineEvents.length % 100 >= 20)
                      ? 'wpisy'
                      : 'wpisów'
                }`
          }
          defaultOpen={timelineEvents.length > 0}
        >
          <ClientTimelineSection clientId={id} events={timelineEvents} />
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
          <BusinessProfileSection
            clientId={id}
            profile={(c.business_profile as never) ?? null}
            legalName={c.title}
          />
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

        {/* Sprint TYDZIEN2.T2.4.B (28.05.2026) — ContactSectionV3 replaces V2.
            V3 reads з client_contact_methods (multi-row, grouped по kind, ⭐
            primary). T2.4.C1 — interactive add/delete/setPrimary.
            V2 fallback zachowany dla edge case клiентów без ccm rows (rare —
            322/341 mają ≥1 method po T2.4.A; T2.4.C1 dozwala każdemu добавити
            via inline form у V3 natomiast).
            T2.4.C1: usunięto SectionActionLink "+ Dodaj kontakt" — per-section
            "+ Dodaj" buttons у V3 obsługują firm methods. Decision-makers
            ("Osoby kontaktowe") osobno w Aktywność accordion. */}
        <AccordionSection
          id="kontakt"
          title="Kontakt"
          meta={
            contactMethods.length > 0
              ? `${contactMethods.length} ${contactMethods.length === 1 ? 'kontakt' : 'kontaktów'}`
              : 'brak'
          }
        >
          {/* T2.4.C1: V3 always renderowany. Pusty stan показує all section
              headers z "+ Dodaj" buttons aby user mógł додати pierwszy method.
              V2 cascade-fallback retired — теперь nawet client без ccm seed
              ma full interactivity. */}
          <ContactSectionV3 clientId={id} methods={contactMethods} websiteValue={websiteValue ?? null} />
        </AccordionSection>

        {/* Sprint TYDZIEN2.T2.5 (29.05.2026) — multi-row notatki klienta.
            Replaces legacy clients.notes (single-field display, edit form only).
            ClientNotesSection — newest first, inline add/edit/delete, mutual
            exclusion add↔edit, "(edytowano)" badge gdy update.
            defaultOpen jeśli już istnieją notatki (seeded z legacy lub user-added). */}
        <AccordionSection
          id="notatki"
          title="Notatki"
          meta={
            clientNotes.length === 0
              ? 'brak'
              : `${clientNotes.length} ${
                  clientNotes.length === 1
                    ? 'notatka'
                    : clientNotes.length % 10 >= 2 &&
                        clientNotes.length % 10 <= 4 &&
                        (clientNotes.length % 100 < 10 || clientNotes.length % 100 >= 20)
                      ? 'notatki'
                      : 'notatek'
                }`
          }
          defaultOpen={clientNotes.length > 0}
        >
          <ClientNotesSection clientId={id} notes={clientNotes} />
        </AccordionSection>

        {/* Sprint TYDZIEN2.T2.2 (28.05.2026) — lista zamówień klienta.
            Hidden 'draft' i 'cancelled' default; toggle pokazuje całość.
            Empty state ok dla 0 zamówień. */}
        <AccordionSection
          id="zamowienia"
          title="Zamówienia"
          meta={
            clientOrders.length === 0
              ? 'brak'
              : `${clientOrders.filter((o) => ['submitted', 'confirmed', 'in_realization', 'shipped', 'invoiced'].includes(o.status)).length} realnych / ${clientOrders.length} total`
          }
          defaultOpen={clientOrders.length > 0}
        >
          <OrdersSection orders={clientOrders} itemsByOrder={orderItemsByOrder} />
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
