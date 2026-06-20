// app/intelligence/cohorts/[id]/page.tsx
// Phase 2 Krok 1.C1 (08.05.2026) — Cohort detail view.
// Phase 2 Krok 1.C2 (08.05.2026 evening) — додано Klienci section.
// Phase 2 Krok 1.D1 (08.05.2026 night) — status mutation (inline + bulk),
// notes inline edit, filter chips ?status= URL param. Restructured:
// server fetches + counts + chips, client component handles selection +
// mutations.
//
// Polymorphic FK pattern — cohort_members.subject_id NOT а PostgREST FK
// до scored_prospects/clients (різні subject_types можливі). Тому 2-query
// merge pattern per section.
//
// Composite PK (cohort_id, subject_type, subject_id) — server actions
// accept tuple keys (per Krok 1.D1 Q2=B2).

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  CohortMembersClient,
  type ProspectMemberRow,
  type ClientMemberRow,
} from './_components/cohort-members-client'
import { CohortEnrichButton } from './_components/cohort-enrich-button'
import { buildCohortBatchPlan } from '@/lib/enrichment/apify-batch'
import type { CohortMemberStatus } from '@/lib/actions/cohorts'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────

interface CohortRow {
  id: string
  name: string
  description: string | null
  created_at: string
  created_by_user_id: string | null
}

interface MemberRowRaw {
  cohort_id: string
  subject_type: string
  subject_id: string
  added_at: string
  status: CohortMemberStatus
  notes: string | null
}

/** Sprint S-UX-CORE STEP 3.3 (14.05.2026) — business_profile exposed
 *  через scored_prospects view (migration 063 join: ceidg_prospects.business_profile).
 *  Used у cohort score drilldown modal для AI re-score section + false
 *  positive heuristic ("strength<60 + combined≥70 → ⚠ warning"). */
export interface ProspectBusinessProfile {
  buyer_strength_for_chm?: number | null
  client_type?: string | null
  [key: string]: unknown
}

interface ProspectSnapshot {
  id: string
  name: string
  nip: string | null
  owner_name: string | null
  source: string | null
  krs_legal_form: string | null
  miejscowosc: string | null
  dominant_channel: string | null
  horeca_meta_score: number | string | null
  has_contact: boolean | null
  /** STEP 3.3 — joined for drilldown. */
  business_profile: ProspectBusinessProfile | null
}

/** Sprint S6D Day 4 BUGFIX (12.05.2026) — enrichment data joined з
 *  contact_enrichment table для cohort prospect rows.
 *  - status: 'success' / 'partial' / 'no_match' / 'error'
 *  - phone / website / gmaps_rating / gmaps_reviews_count populated тільки
 *    коли status='success' (per apify enrichment contract). */
export interface ProspectEnrichment {
  status: string | null
  phone: string | null
  website: string | null
  gmaps_rating: number | string | null
  gmaps_reviews_count: number | null
}

/** Sprint S-RANK B-min (13.05.2026) — match aggregation per prospect.
 *  max_score = MAX(combined_score) across all products для цього prospect.
 *  count = total match rows (typically ~34 = всі CzM products).
 *  breakdown = score_breakdown JSONB з top-scoring product row, structure:
 *  { total, base: {pkd, activity, size, geo, recency, niche},
 *    bonuses: {ua_founder_boost, revenue, ...}, penalties: {...}, reasons:[] }.
 *  Sprint S-UX-CORE STEP 3.3 (14.05.2026) — extra fields на top match для
 *  drilldown modal: algo_score (pre-AI), ai_score (L6 override або null),
 *  reason_codes (e.g. ['buyer_strength_cap:5', 'shell_company_penalty']). */
export interface ProspectMatch {
  max_score: number | null
  count: number
  breakdown: unknown
  top_algo_score: number | null
  top_ai_score: number | null
  top_reason_codes: string[]
}

interface ClientSnapshot {
  id: string
  title: string
  city: string | null
  nip: string | null
  industry: string | null
  segment: string | null
  status: string | null
}

// ─── Filter chips config ─────────────────────────────────────────

const ALL_STATUSES: CohortMemberStatus[] = [
  'pending',
  'called',
  'interested',
  'not_interested',
  'callback',
]

const STATUS_LABELS: Record<CohortMemberStatus | 'all', string> = {
  all: 'Wszystkie',
  pending: 'Pending',
  called: 'Zadzwoniono',
  interested: 'Zainteresowani',
  not_interested: 'Nie zaint.',
  callback: 'Callback',
}

function parseStatusParam(raw: string | undefined): CohortMemberStatus | null {
  if (!raw || raw === 'all') return null
  if ((ALL_STATUSES as string[]).includes(raw)) {
    return raw as CohortMemberStatus
  }
  return null
}

function chipHref(
  cohortId: string,
  status: CohortMemberStatus | null,
): string {
  if (status === null) return `/intelligence/cohorts/${cohortId}`
  return `/intelligence/cohorts/${cohortId}?status=${status}`
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    // Sprint TYDZIEN2 BUGFIX (28.05.2026) — fixed timeZone defensively.
    // Tu Server Component (renderowane raz, без hydration), ale fixed TZ
    // zapobiega edge case daty UTC vs PL na granicy północy ("27.05" vs "28.05").
    return d.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Warsaw',
    })
  } catch {
    return iso
  }
}

// ─── Page ────────────────────────────────────────────────────────

export default async function CohortDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const statusFilter = parseStatusParam(sp.status)

  const supabase = await createClient()

  // Fetch cohort
  const { data: cohort, error: cohortErr } = await supabase
    .from('cohorts')
    .select('*')
    .eq('id', id)
    .single()

  if (cohortErr || !cohort) {
    notFound()
  }

  const cohortRow = cohort as CohortRow

  // Phase 2 Krok 1.D1 — counts query (ALL statuses, NIE filter applied —
  // chip labels show all-status counts).
  const { data: allStatusRows } = await supabase
    .from('cohort_members')
    .select('status')
    .eq('cohort_id', id)

  const statusCounts: Record<CohortMemberStatus, number> = {
    pending: 0,
    called: 0,
    interested: 0,
    not_interested: 0,
    callback: 0,
  }
  for (const r of (allStatusRows ?? []) as Array<{
    status: CohortMemberStatus
  }>) {
    if (r.status in statusCounts) statusCounts[r.status]++
  }
  const totalAllStatus = (allStatusRows ?? []).length

  // Members fetch (з filter applied якщо active)
  let prospectQuery = supabase
    .from('cohort_members')
    .select('cohort_id, subject_type, subject_id, added_at, status, notes')
    .eq('cohort_id', id)
    .eq('subject_type', 'prospect')
  if (statusFilter) prospectQuery = prospectQuery.eq('status', statusFilter)
  prospectQuery = prospectQuery.order('added_at', { ascending: false })

  let clientQuery = supabase
    .from('cohort_members')
    .select('cohort_id, subject_type, subject_id, added_at, status, notes')
    .eq('cohort_id', id)
    .eq('subject_type', 'client')
  if (statusFilter) clientQuery = clientQuery.eq('status', statusFilter)
  clientQuery = clientQuery.order('added_at', { ascending: false })

  const [
    { data: prospectMembersRaw, error: memErr },
    { data: clientMembersRaw, error: clientMemErr },
  ] = await Promise.all([prospectQuery, clientQuery])

  // Snapshot fetches (2-query merge per polymorphic FK pattern)
  const prospectMembers = (prospectMembersRaw ?? []) as MemberRowRaw[]
  const prospectIds = prospectMembers.map((m) => m.subject_id)

  let prospectMap = new Map<string, ProspectSnapshot>()
  // Sprint S6D Day 4 — enrichment data joined paralelno з prospects snapshot.
  // 12 success rows з contact_enrichment були invisible у UI бо page query
  // ne joined this table. Now: рядок показує phone/website/rating у tooltip.
  let enrichmentMap = new Map<string, ProspectEnrichment>()
  // Sprint S-RANK B-min (13.05.2026) — matches join для score column. Cohort
  // UI раніше читав scored_prospects.horeca_meta_score (NULL для sp.z o.o.)
  // → "—" everywhere. Тепер joinимо matches.combined_score (max per prospect)
  // + score_breakdown JSONB для tooltip render.
  let matchMap = new Map<string, ProspectMatch>()
  if (prospectIds.length > 0) {
    const [prospectsRes, enrichmentRes, matchesRes] = await Promise.all([
      supabase
        .from('scored_prospects')
        .select(
          'id, name, nip, owner_name, source, krs_legal_form, miejscowosc, dominant_channel, horeca_meta_score, has_contact, business_profile',
        )
        .in('id', prospectIds),
      supabase
        .from('contact_enrichment')
        .select('target_id, status, phone, website, gmaps_rating, gmaps_reviews_count')
        .in('target_id', prospectIds)
        .eq('target_type', 'prospect')
        .eq('source', 'apify_gmaps'),
      // Sprint S-RANK B-min — pull combined_score + breakdown для each
      // prospect_id. Sort у JS: pick row з highest combined_score per
      // prospect (the algorithm produces 1 row per product, ~34 rows per
      // prospect — we display the BEST match score).
      // STEP 3.3 — also pull algo_score, ai_score, reason_codes для
      // drilldown modal (top match row used).
      supabase
        .from('matches')
        .select('prospect_id, combined_score, algo_score, ai_score, reason_codes, score_breakdown')
        .in('prospect_id', prospectIds)
        .order('combined_score', { ascending: false, nullsFirst: false }),
    ])
    prospectMap = new Map(
      ((prospectsRes.data ?? []) as ProspectSnapshot[]).map((p) => [p.id, p]),
    )
    type EnrichRow = ProspectEnrichment & { target_id: string }
    enrichmentMap = new Map(
      ((enrichmentRes.data ?? []) as EnrichRow[]).map((r) => [
        r.target_id,
        {
          status: r.status,
          phone: r.phone,
          website: r.website,
          gmaps_rating: r.gmaps_rating,
          gmaps_reviews_count: r.gmaps_reviews_count,
        },
      ]),
    )
    // Aggregate matches: count + top-row (best score + breakdown) per prospect.
    // STEP 3.3 — top-row also yields algo_score / ai_score / reason_codes
    // для drilldown modal AI section. Matches sorted DESC, so first hit
    // per prospect_id IS the top row.
    type MatchRow = {
      prospect_id: string
      combined_score: number | null
      algo_score: number | null
      ai_score: number | null
      reason_codes: string[] | null
      score_breakdown: unknown
    }
    for (const m of (matchesRes.data ?? []) as MatchRow[]) {
      const existing = matchMap.get(m.prospect_id)
      if (!existing) {
        matchMap.set(m.prospect_id, {
          max_score: m.combined_score,
          count: 1,
          breakdown: m.score_breakdown,
          top_algo_score: m.algo_score,
          top_ai_score: m.ai_score,
          top_reason_codes: Array.isArray(m.reason_codes) ? m.reason_codes : [],
        })
      } else {
        existing.count += 1
        // matches sorted DESC, тому first row має highest score;
        // breakdown + algo/ai/reasons вже з top row, не overwrite.
      }
    }
  }

  const clientMembers = (clientMembersRaw ?? []) as MemberRowRaw[]
  const clientIds = clientMembers.map((m) => m.subject_id)

  let clientMap = new Map<string, ClientSnapshot>()
  if (clientIds.length > 0) {
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, title, city, nip, industry, segment, status')
      .in('id', clientIds)
    clientMap = new Map(
      ((clientsData ?? []) as ClientSnapshot[]).map((c) => [c.id, c]),
    )
  }

  // Sprint TYDZIEN2.T2.3.1 (28.05.2026) — resolve prospects' NIPs do existing
  // `clients.id` (sprint P unification creates parallel clients row for each
  // KRS-bootstrap prospect). Direct profile link instead of /intelligence/lookup
  // gdy resolved. RLS: clients SELECT policy = auth.uid() = owner_id, czyli
  // anon supabase (cookie session = Vadym) widzi swoje rows. Coverage varies
  // by cohort: KRS-based 100%, CEIDG-based 20-38%, niektóre 0%.
  let nipToClientId: Record<string, string> = {}
  // Fix 11.06 (B+C) — twin-aware: NIP → { client id, notes, buyer_strength }.
  let nipToClientData: Record<
    string,
    { id: string; notes: string | null; buyerStrength: number | null }
  > = {}
  const prospectNips = prospectMembers
    .map((m) => prospectMap.get(m.subject_id)?.nip)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
  if (prospectNips.length > 0) {
    const uniqueNips = Array.from(new Set(prospectNips))
    const { data: clientsByNip } = await supabase
      .from('clients')
      .select('id, nip, notes, business_profile')
      .in('nip', uniqueNips)
    const map: Record<string, string> = {}
    const dataMap: Record<
      string,
      { id: string; notes: string | null; buyerStrength: number | null }
    > = {}
    for (const row of (clientsByNip ?? []) as Array<{
      id: string
      nip: string
      notes: string | null
      business_profile: { buyer_strength_for_chm?: number | null } | null
    }>) {
      // First-wins jeśli >1 clients row na ten sam NIP (rare). Vadym może
      // manualnie dedupe później; navigation deterministic w międzyczasie.
      if (row.nip && !map[row.nip]) map[row.nip] = row.id
      if (row.nip && !dataMap[row.nip]) {
        dataMap[row.nip] = {
          id: row.id,
          notes: row.notes ?? null,
          buyerStrength:
            typeof row.business_profile?.buyer_strength_for_chm === 'number'
              ? row.business_profile.buyer_strength_for_chm
              : null,
        }
      }
    }
    nipToClientId = map
    nipToClientData = dataMap
  }

  // Fix 16.06 (Wariant A→tekst) — OSTATNIA notatka dla twin z tabeli
  // client_notes (NIE clients.notes — martwa; karta liczy z client_notes,
  // migracja 076). 1 zapytanie batch ORDER created_at DESC (jak karta), w JS
  // bierzemy pierwszy = najnowszy per client_id → { body, id }. RLS
  // auth.uid()=owner_id; loader pod sesją Vadyma (jak karta) → widzi notatki.
  const latestNoteByClient = new Map<string, { id: string; body: string }>()
  const twinClientIds = Array.from(
    new Set(Object.values(nipToClientData).map((d) => d.id)),
  )
  // Fix 18.06 — batch obejmuje też bezpośrednich członków-klientów kohorty
  // (subject_id = client id wprost, bez rozwiązywania po NIP), aby lista Klienci
  // pokazywała ostatnią notatkę z client_notes (symetrycznie do prospektów-twin).
  const noteClientIds = Array.from(new Set([...twinClientIds, ...clientIds]))
  if (noteClientIds.length > 0) {
    const { data: notesRows } = await supabase
      .from('client_notes')
      .select('id, client_id, body, created_at')
      .in('client_id', noteClientIds)
      .order('created_at', { ascending: false })
    for (const r of (notesRows ?? []) as Array<{
      id: string
      client_id: string
      body: string
    }>) {
      if (!latestNoteByClient.has(r.client_id)) {
        latestNoteByClient.set(r.client_id, { id: r.id, body: r.body })
      }
    }
  }

  // Compose final row shapes для client component
  const prospectRows: ProspectMemberRow[] = prospectMembers.map((m) => {
    const snap = prospectMap.get(m.subject_id)
    // Fix 11.06 (B+C) — twin-aware po NIP.
    const twin = snap?.nip ? nipToClientData[snap.nip] : undefined
    const prospectBuyer =
      typeof snap?.business_profile?.buyer_strength_for_chm === 'number'
        ? snap.business_profile.buyer_strength_for_chm
        : null
    return {
      cohort_id: m.cohort_id,
      subject_type: 'prospect',
      subject_id: m.subject_id,
      added_at: m.added_at,
      status: m.status,
      // Wariant A→tekst — notatka: twin = ostatnia z client_notes (tabela,
      // źródło karty), no-twin = cohort_members.notes. notes_last_id → edycja
      // tej konkretnej notatki klienta ze listy (updateClientNote po id).
      notes: twin ? (latestNoteByClient.get(twin.id)?.body ?? null) : m.notes,
      notes_last_id: twin ? (latestNoteByClient.get(twin.id)?.id ?? null) : null,
      notes_client_id: twin?.id ?? null,
      // B — buyer_strength: twin-client nadpisuje, fallback prospect.
      buyer_strength_display: twin?.buyerStrength ?? prospectBuyer,
      snapshot: snap ?? null,
      // Sprint S6D Day 4 — enrichment з contact_enrichment (apify_gmaps).
      enrichment: enrichmentMap.get(m.subject_id) ?? null,
      // Sprint S-RANK B-min (13.05.2026) — match score + breakdown з matches table.
      match: matchMap.get(m.subject_id) ?? null,
    }
  })

  // Sprint S-RANK B-min — sort prospects by match_score DESC NULLS LAST.
  // Vadym screen workflow: top 5 з score≥70 above fold, "0 matches" prospekты
  // унизу для manual triage. Within same score, fallback to horeca_meta_score
  // (CEIDG sole-prop fallback), потім name ASC.
  prospectRows.sort((a, b) => {
    const aScore = a.match?.max_score ?? -1
    const bScore = b.match?.max_score ?? -1
    if (bScore !== aScore) return bScore - aScore
    const aMeta = typeof a.snapshot?.horeca_meta_score === 'number'
      ? a.snapshot.horeca_meta_score
      : -1
    const bMeta = typeof b.snapshot?.horeca_meta_score === 'number'
      ? b.snapshot.horeca_meta_score
      : -1
    if (bMeta !== aMeta) return bMeta - aMeta
    return (a.snapshot?.name ?? '').localeCompare(b.snapshot?.name ?? '', 'pl')
  })

  const clientRows: ClientMemberRow[] = clientMembers.map((m) => {
    const snap = clientMap.get(m.subject_id)
    // Fix 18.06 — notatka klienta z client_notes (subject_id = client id wprost).
    // notes_client_id/notes_last_id włączają w NotesCell ścieżkę client_notes
    // (tekst + inline-edit), spójnie z kartą klienta i listą prospektów-twin.
    const note = latestNoteByClient.get(m.subject_id)
    return {
      cohort_id: m.cohort_id,
      subject_type: 'client',
      subject_id: m.subject_id,
      added_at: m.added_at,
      status: m.status,
      notes: note?.body ?? null,
      notes_client_id: m.subject_id,
      notes_last_id: note?.id ?? null,
      snapshot: snap ?? null,
    }
  })

  // Phase 2 Krok 1.E — eligible NIP count для bulk Apify enrichment button.
  // Server-side via buildCohortBatchPlan (single source of truth з route
  // handler logic). Failure here is non-fatal (button shows 0 + disabled).
  let enrichEligibleCount = 0
  try {
    const enrichPlan = await buildCohortBatchPlan(supabase, id)
    enrichEligibleCount = enrichPlan.unique_nips
  } catch {
    enrichEligibleCount = 0
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={cohortRow.name}
        breadcrumbs={[
          { label: 'AI Discovery', href: '/intelligence' },
          { label: 'Cohorts', href: '/intelligence/cohorts' },
          { label: cohortRow.name },
        ]}
      />

      <div className="px-6 pt-4 pb-2">
        {cohortRow.description && (
          <p className="mb-2 max-w-3xl text-sm text-muted-foreground">
            {cohortRow.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Utworzono {formatDate(cohortRow.created_at)} ·{' '}
          {prospectMembers.length} prospektów + {clientMembers.length}{' '}
          klientów{' '}
          {statusFilter && (
            <span className="text-amber-700">
              (filtr: {STATUS_LABELS[statusFilter]})
            </span>
          )}
        </p>
      </div>

      {/* Enrich Apify button — Phase 2 Krok 1.E (09.05.2026).
          Між description (вище) і filter chips (нижче) per Vadym Q2. */}
      <div className="flex flex-wrap items-center gap-2 px-6 pt-2">
        <CohortEnrichButton
          cohortId={id}
          eligibleCount={enrichEligibleCount}
        />
      </div>

      {/* Filter chips — Phase 2 Krok 1.D1 */}
      <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Button
          asChild
          size="sm"
          variant={statusFilter === null ? 'default' : 'outline'}
        >
          <Link href={chipHref(id, null)}>
            {STATUS_LABELS.all}{' '}
            <span className="ml-1 text-xs opacity-70">
              ({totalAllStatus})
            </span>
          </Link>
        </Button>
        {ALL_STATUSES.map((s) => {
          const count = statusCounts[s]
          const active = statusFilter === s
          return (
            <Button
              key={s}
              asChild
              size="sm"
              variant={active ? 'default' : 'outline'}
              className={cn(count === 0 && !active && 'opacity-50')}
            >
              <Link href={chipHref(id, s)}>
                {STATUS_LABELS[s]}{' '}
                <span className="ml-1 text-xs opacity-70">({count})</span>
              </Link>
            </Button>
          )
        })}
      </div>

      {(memErr || clientMemErr) && (
        <div className="px-6 pt-2">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Błąd ładowania członków:{' '}
            {memErr?.message ?? clientMemErr?.message ?? 'unknown'}
          </div>
        </div>
      )}

      <CohortMembersClient
        cohortId={id}
        prospects={prospectRows}
        clients={clientRows}
        statusFilter={statusFilter}
        statusFilterLabel={
          statusFilter ? STATUS_LABELS[statusFilter] : null
        }
        nipToClientId={nipToClientId}
      />

      <div className="px-6 pb-6">
        <Button asChild variant="outline" size="sm">
          <Link href="/intelligence/cohorts">← Wszystkie cohortі</Link>
        </Button>
      </div>
    </div>
  )
}
