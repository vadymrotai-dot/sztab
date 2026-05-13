// app/intelligence/prospects/page.tsx
// Phase 2.6 / Promt 3: Prospects table page (table-first variant A).
// Reads scored_prospects view (RLS via security_invoker=true on view).
// Phase 1 Krok 4 (08.05.2026) — moved з app/(dashboard)/intelligence/prospects/.
// Phase 2 Krok 1.A (post-08.05) — server-side filter "Тип фірми" via
// ?type= CSV param (fop / spzoo / sa / inne, multi-select). Default — всі.
// Phase 2 Krok 1.B (08.05.2026 evening) — server-side pagination via
// ?page= + ?size= params. Default size=50, valid sizes [50, 100, 200].
//
// Sprint S-UX-CORE STEP 4.1 (14.05.2026) — Vadym pain points fix:
//   - NO search input → додати ?q= → server-side ILIKE на name/nip/miejscowosc
//   - Sort name тільки page-local → ?sort=&?dir= → server-side ORDER BY
//   - Page size 200 з реsetом filterів → useTableUrlState preserves URL params
//   - Page size 500 додано (top sales reps want 500 row dump для phone calls)
//   - Rendered через <DataTable> foundation (cohort UX parity)

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { CLIENT_TYPE_META } from '@/lib/clients/client-type-meta'
import type { ClientType } from '@/lib/ai/business-analysis'

import { ProspectsTable, type ProspectRow } from './_components/prospects-table'
import type { CohortOption } from './_components/bulk-action-bar'

export const dynamic = 'force-dynamic'

// ─── Type filter — 4 mutually exclusive (multi-select via CSV) ────

const TYPE_OPTIONS = [
  { id: 'fop', label: 'ФОП' },
  { id: 'spzoo', label: 'sp. z o.o.' },
  { id: 'sa', label: 'S.A.' },
  { id: 'inne', label: 'inne' },
] as const

type TypeId = (typeof TYPE_OPTIONS)[number]['id']
const ALL_TYPES = TYPE_OPTIONS.map((o) => o.id) as TypeId[]

// ─── Pagination constants ────────────────────────────────────────

// STEP 4.1 — додано 500 (top sales reps want big phone-call dump)
const PAGE_SIZES = [50, 100, 200, 500] as const
type PageSize = (typeof PAGE_SIZES)[number]
const DEFAULT_SIZE: PageSize = 50

function parseSize(raw: string | undefined): PageSize {
  const n = parseInt(raw ?? '', 10)
  if ((PAGE_SIZES as readonly number[]).includes(n)) return n as PageSize
  return DEFAULT_SIZE
}

function parsePage(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

// ─── Sort + search params (STEP 4.1) ────────────────────────────

const SORTABLE_COLUMNS = [
  'name',
  'nip',
  'source',
  'owner_name',
  'miejscowosc',
  'dominant_channel',
  'horeca_meta_score',
  'has_contact',
] as const
type SortColumn = (typeof SORTABLE_COLUMNS)[number]
const DEFAULT_SORT: SortColumn = 'horeca_meta_score'
const DEFAULT_DIR: 'asc' | 'desc' = 'desc'

function parseSort(raw: string | undefined): SortColumn {
  if (raw && (SORTABLE_COLUMNS as readonly string[]).includes(raw)) {
    return raw as SortColumn
  }
  return DEFAULT_SORT
}

function parseDir(raw: string | undefined): 'asc' | 'desc' {
  return raw === 'asc' ? 'asc' : 'desc'
}

/** Escape `%` `,` and `*` characters що мають special meaning у PostgREST
 *  filter expressions. Used для user input у `.or(name.ilike.*Q*)`. */
function escapeIlikeQuery(q: string): string {
  return q.replace(/[%,*()]/g, ' ').trim()
}

// ─── UA filter (Phase 2 Krok 1.E S-CORE.3.B Phase A — opt-in) ────

type UaFilter = 'verified' | 'likely' | null

function parseUaFilter(raw: string | undefined): UaFilter {
  if (raw === 'verified' || raw === 'likely') return raw
  return null
}

// ─── Client type filter (Sprint S6D Day 1 — opt-in) ────────────
// Filter via JSONB path business_profile->>client_type. 'unknown' = NULL
// (client not yet classified by AI). Default null = no filter (all types).

const CLIENT_TYPES: readonly ClientType[] = [
  'gastronomia',
  'hurtownia',
  'sklep_detal',
  'catering',
  'hotel',
  'instytucja',
  'production',
  'sieci_handlowe',
  'inne',
] as const

type ClientTypeFilter = ClientType | 'unknown' | null

function parseClientTypeFilter(raw: string | undefined): ClientTypeFilter {
  if (!raw) return null
  if (raw === 'unknown') return 'unknown'
  if ((CLIENT_TYPES as readonly string[]).includes(raw)) return raw as ClientType
  return null
}

// ─── Type param parsing ─────────────────────────────────────────

function parseTypeParam(raw: string | undefined): Set<TypeId> | null {
  if (!raw) return null // null sentinel = "all" (no filter)
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is TypeId => (ALL_TYPES as string[]).includes(p))
  return parts.length > 0 ? new Set(parts) : null
}

/** Derive PostgREST .or() filter expression з Set of selected types.
 *  - 'fop'   → source.eq.ceidg
 *  - 'spzoo' → AND(source=krs, krs_legal_form ILIKE *OGRANICZON*)
 *  - 'sa'    → AND(source=krs, krs_legal_form ILIKE *AKCYJNA*)
 *  - 'inne'  → AND(source=krs, NOT spzoo, NOT sa)
 *
 *  ILIKE patterns використовують `*` wildcard (PostgREST URL syntax).
 *  Tolerantne до variations: 'OGRANICZONĄ', 'OGRANICZONA' etc.
 */
function buildTypeFilterExpression(selected: Set<TypeId>): string | null {
  const parts: string[] = []
  if (selected.has('fop')) {
    parts.push('source.eq.ceidg')
  }
  if (selected.has('spzoo')) {
    parts.push('and(source.eq.krs,krs_legal_form.ilike.*OGRANICZON*)')
  }
  if (selected.has('sa')) {
    parts.push('and(source.eq.krs,krs_legal_form.ilike.*AKCYJNA*)')
  }
  if (selected.has('inne')) {
    parts.push(
      'and(source.eq.krs,krs_legal_form.not.ilike.*OGRANICZON*,krs_legal_form.not.ilike.*AKCYJNA*)',
    )
  }
  return parts.length > 0 ? parts.join(',') : null
}

// ─── URL builders ────────────────────────────────────────────────

/** Convert selected Set to canonical CSV string (preserves ALL_TYPES order),
 *  or null якщо "all"/empty (means "drop ?type= param"). */
function selectedToTypeStr(selected: Set<TypeId> | null): string | null {
  if (!selected) return null
  if (selected.size === 0 || selected.size === ALL_TYPES.length) return null
  const ordered = ALL_TYPES.filter((t) => selected.has(t))
  return ordered.length > 0 ? ordered.join(',') : null
}

/** STEP 4.1 — generic preserve-other-params helper. Builds /intelligence/prospects?...
 *  з ALL existing URL params з `sp` (raw searchParams), оverriden лише ключами
 *  у `overrides`. Передача null до override → delete param. Це fixes регресію
 *  де chipHref/uaChipHref strip-али пользовательскі search/sort/score/etc. */
type RawSearchParams = {
  [key: string]: string | undefined
}

function buildHrefMerged(
  sp: RawSearchParams,
  overrides: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams()
  // Copy всі поточні URL params
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v.length > 0) params.set(k, v)
  }
  // Apply overrides (null deletes, undefined ignored, value sets)
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) params.delete(k)
    else if (v !== undefined) params.set(k, String(v))
  }
  // Default page=1 завжди дроп
  if (params.get('page') === '1') params.delete('page')
  if (params.get('size') === String(DEFAULT_SIZE)) params.delete('size')
  const s = params.toString()
  return s ? `/intelligence/prospects?${s}` : '/intelligence/prospects'
}

/** Toggle single TypeId; resets page to 1; preserves ALL other URL params. */
function chipHref(
  typeId: TypeId,
  selected: Set<TypeId> | null,
  sp: RawSearchParams,
): string {
  const next = selected ? new Set(selected) : new Set<TypeId>(ALL_TYPES)
  if (next.has(typeId)) {
    next.delete(typeId)
  } else {
    next.add(typeId)
  }
  const typeStr = selectedToTypeStr(next)
  return buildHrefMerged(sp, { type: typeStr, page: null })
}

/** Toggle UA filter — 3-state cycle. Preserves ALL other URL params. */
function uaChipHref(target: UaFilter, sp: RawSearchParams): string {
  return buildHrefMerged(sp, { ua_filter: target, page: null })
}

/** Set client_type filter. Preserves ALL other URL params. */
function clientTypeHref(target: ClientTypeFilter, sp: RawSearchParams): string {
  return buildHrefMerged(sp, { client_type: target, page: null })
}

// ─── Page ────────────────────────────────────────────────────────

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string
    page?: string
    size?: string
    ua_filter?: string
    client_type?: string
    /** STEP 4.1 — search + sort + ALL filters server-side */
    q?: string
    sort?: string
    dir?: string
    score_min?: string
    score_max?: string
    channels?: string
    has_contact?: string
    hide_closed?: string
    show_excluded?: string
  }>
}) {
  const sp = await searchParams
  const selected = parseTypeParam(sp.type)
  const size = parseSize(sp.size)
  let page = parsePage(sp.page)
  const uaFilter = parseUaFilter(sp.ua_filter)
  const clientTypeFilter = parseClientTypeFilter(sp.client_type)
  // STEP 4.1
  const searchQuery = (sp.q ?? '').trim()
  const sortColumn = parseSort(sp.sort)
  const sortDir = parseDir(sp.dir)
  // STEP 4.1 — раніше client-side, тепер server-side (correct UX coли total != visible page)
  const scoreMinRaw = parseInt(sp.score_min ?? '', 10)
  const scoreMaxRaw = parseInt(sp.score_max ?? '', 10)
  const scoreMin = Number.isFinite(scoreMinRaw) ? Math.max(0, scoreMinRaw) : 0
  const scoreMax = Number.isFinite(scoreMaxRaw) ? Math.min(100, scoreMaxRaw) : 100
  const ALL_CHANNELS_SET = ['sklep', 'restaurant', 'catering', 'cafe', 'multi'] as const
  const channelsList = (sp.channels ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c): c is (typeof ALL_CHANNELS_SET)[number] =>
      (ALL_CHANNELS_SET as readonly string[]).includes(c),
    )
  const hasContact = sp.has_contact === 'true'
  const hideClosed = sp.hide_closed === 'true'
  const showExcluded = sp.show_excluded === 'true'

  const supabase = await createClient()

  // Query factory — re-builds для optional refetch якщо page > totalPages.
  function buildQuery() {
    let q = supabase
      .from('scored_prospects')
      .select('*', { count: 'exact' })
      // STEP 4.1 — URL-driven sort замість hardcoded horeca_meta_score.
      .order(sortColumn, {
        ascending: sortDir === 'asc',
        nullsFirst: false,
      })
    if (selected) {
      const expr = buildTypeFilterExpression(selected)
      if (expr) {
        q = q.or(expr)
      }
    }
    // STEP 4.1 — search ?q= server-side ILIKE на name + nip + miejscowosc.
    //
    // HOTFIX (14.05.2026 evening) — multi-word AND search (Vadym test: "AGRO GROUP"
    // → 1 result раніше = literal substring match. Тепер: кожне слово matches
    // anywhere у any з 3 fields, всі слова потрібні).
    //
    // Implementation: split на whitespace → кожне word окремий .or() group.
    // Supabase chains multiple .or() calls з AND → kombinowany filter:
    //   WHERE (name~"AGRO" OR nip~"AGRO" OR miejscowosc~"AGRO")
    //     AND (name~"GROUP" OR nip~"GROUP" OR miejscowosc~"GROUP")
    // Order слів irrelevant. Standard CRM search behavior (Apollo/Pipedrive pattern).
    if (searchQuery.length > 0) {
      const safe = escapeIlikeQuery(searchQuery)
      if (safe.length > 0) {
        const words = safe.split(/\s+/).filter((w) => w.length > 0)
        for (const word of words) {
          q = q.or(
            `name.ilike.*${word}*,nip.ilike.*${word}*,miejscowosc.ilike.*${word}*`,
          )
        }
      }
    }
    // Phase 2 Krok 1.E S-CORE.3.B Phase A — UA filter (opt-in URL param).
    // 'verified' = CRBR-confirmed (source='crbr'); 'likely' = detected=true
    // (verified + high confidence). Default OFF (no UA bias).
    if (uaFilter === 'verified') {
      q = q.eq('ua_founders_signal->>source', 'crbr')
    } else if (uaFilter === 'likely') {
      q = q.eq('ua_founders_signal->>detected', 'true')
    }
    // Sprint S6D Day 1 — client_type filter (opt-in URL param). Default
    // OFF (no filter). 'unknown' filters до not-yet-classified rows
    // (business_profile NULL or business_profile->>'client_type' NULL).
    if (clientTypeFilter === 'unknown') {
      q = q.is('business_profile->>client_type', null)
    } else if (clientTypeFilter) {
      q = q.eq('business_profile->>client_type', clientTypeFilter)
    }
    // STEP 4.1 — score range (раніше client-side useMemo на 50 rows; тепер
    // server-side для correct UX поверх 2705+ pool).
    if (scoreMin > 0) {
      q = q.gte('horeca_meta_score', scoreMin)
    }
    if (scoreMax < 100) {
      q = q.lte('horeca_meta_score', scoreMax)
    }
    // STEP 4.1 — channels filter via PostgREST .in()
    if (channelsList.length > 0) {
      q = q.in('dominant_channel', channelsList)
    }
    // STEP 4.1 — Tylko z kontaktem switch
    if (hasContact) {
      q = q.eq('has_contact', true)
    }
    // STEP 4.1 — Pokaż wykluczone toggle. Default false → hide filter_passed=false.
    // Use .not.eq которое включає NULL (legacy/unscored rows).
    if (!showExcluded) {
      q = q.or('filter_passed.is.null,filter_passed.eq.true')
    }
    // STEP 4.1 — Ukryj closed chains. Chain tier у JSONB score_breakdown->chain->loyalty_tier.
    // PostgREST JSONB path: '.neq.closed' include NULL (non-chain rows безпечно).
    if (hideClosed) {
      q = q.or(
        'score_breakdown->chain->>loyalty_tier.is.null,score_breakdown->chain->>loyalty_tier.neq.closed',
      )
    }
    return q
  }

  let { data: prospects, count, error } = await buildQuery().range(
    (page - 1) * size,
    page * size - 1,
  )

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / size))

  // If user-requested page is past end → fallback to last valid page.
  // (Edge: filter zmiana може reduce pool < current page * size.)
  let pageCorrected = false
  if (page > totalPages && totalCount > 0) {
    page = totalPages
    pageCorrected = true
    const refetch = await buildQuery().range(
      (page - 1) * size,
      page * size - 1,
    )
    prospects = refetch.data
    if (refetch.error) error = refetch.error
  }

  // Phase 2 Krok 1.C1 — fetch cohorts list для bulk-action dropdown.
  // Embedded count via PostgREST: cohort_members(count) → [{count: N}].
  // Failure here is non-fatal (cohorts dropdown shows empty placeholder).
  const { data: cohortRows } = await supabase
    .from('cohorts')
    .select('id, name, cohort_members(count)')
    .order('created_at', { ascending: false })

  const cohorts: CohortOption[] = (
    (cohortRows ?? []) as Array<{
      id: string
      name: string
      cohort_members: { count: number }[] | null
    }>
  ).map((c) => ({
    id: c.id,
    name: c.name,
    member_count: c.cohort_members?.[0]?.count ?? 0,
  }))

  if (error) {
    return (
      <div className="flex flex-col">
        <PageHeader
          title="Prospekty"
          breadcrumbs={[
            { label: 'AI Discovery', href: '/intelligence' },
            { label: 'Prospekty' },
          ]}
        />
        <div className="p-6">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Błąd ładowania prospektów</p>
            <p className="mt-1 text-xs opacity-80">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  const isAllActive = selected === null

  // Range counter "{N1} – {N2} z {total}".
  // Empty result → "0 – 0 z 0".
  const rowsLen = prospects?.length ?? 0
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * size + 1
  const rangeEnd = totalCount === 0 ? 0 : (page - 1) * size + rowsLen
  const counterText = `${rangeStart} – ${rangeEnd} z ${totalCount}`

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Prospekty"
        breadcrumbs={[
          { label: 'AI Discovery', href: '/intelligence' },
          { label: 'Prospekty' },
        ]}
      />

      {/* Type filter chips (Phase 2 Krok 1.A) — STEP 4.1 chipHref signature change */}
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <span className="text-sm text-muted-foreground">Тип фірми:</span>
        {TYPE_OPTIONS.map((opt) => {
          const active = isAllActive || (selected?.has(opt.id) ?? false)
          return (
            <Button
              key={opt.id}
              variant={active ? 'default' : 'outline'}
              size="sm"
              asChild
            >
              <Link
                href={chipHref(opt.id, selected, sp)}
                className={active ? 'pointer-events-auto' : undefined}
              >
                {opt.label}
              </Link>
            </Button>
          )
        })}
        {!isAllActive && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={buildHrefMerged(sp, { type: null, page: null })}>Reset</Link>
          </Button>
        )}

        {/* UA founders filter chips */}
        <span className="ml-2 inline-flex items-center gap-1 border-l pl-2 text-xs text-muted-foreground">
          🇺🇦 UA-власники:
        </span>
        <Button asChild size="sm" variant={uaFilter === null ? 'default' : 'outline'}>
          <Link href={uaChipHref(null, sp)}>Wszyscy</Link>
        </Button>
        <Button asChild size="sm" variant={uaFilter === 'likely' ? 'default' : 'outline'}>
          <Link href={uaChipHref('likely', sp)}>Likely</Link>
        </Button>
        <Button asChild size="sm" variant={uaFilter === 'verified' ? 'default' : 'outline'}>
          <Link href={uaChipHref('verified', sp)}>Verified</Link>
        </Button>

        {/* Client type filter chips */}
        <span className="ml-2 inline-flex items-center gap-1 border-l pl-2 text-xs text-muted-foreground">
          Тип:
        </span>
        <Button asChild size="sm" variant={clientTypeFilter === null ? 'default' : 'outline'}>
          <Link href={clientTypeHref(null, sp)}>Wszyscy</Link>
        </Button>
        {(['gastronomia', 'hurtownia', 'sklep_detal', 'hotel'] as const).map((t) => {
          const meta = CLIENT_TYPE_META[t]
          const active = clientTypeFilter === t
          return (
            <Button
              key={t}
              asChild
              size="sm"
              variant={active ? 'default' : 'outline'}
              title={meta.label_pl}
            >
              <Link href={clientTypeHref(t, sp)}>
                <span className="mr-1">{meta.emoji}</span>
                {meta.label_pl}
              </Link>
            </Button>
          )
        })}
        <Button
          asChild
          size="sm"
          variant={clientTypeFilter === 'unknown' ? 'default' : 'outline'}
          title="Klient bez przypisanego typu (uruchom Analiza klienta)"
        >
          <Link href={clientTypeHref('unknown', sp)}>❓ Nieznany</Link>
        </Button>

        <span className="ml-auto text-xs text-muted-foreground">{counterText}</span>
      </div>

      {/* Page-correction note (Phase 2 Krok 1.B) */}
      {pageCorrected && (
        <div className="px-6 pt-2">
          <p className="text-xs text-muted-foreground">
            Перенаправлено на сторінку {page} (попередня сторінка поза
            межами для поточного фільтра).
          </p>
        </div>
      )}

      {/* STEP 4.1 — ProspectsTable тепер handles search/sort/pagination via DataTable.
          Server passes total counts для manual pagination footer. */}
      <ProspectsTable
        initialProspects={(prospects ?? []) as ProspectRow[]}
        cohorts={cohorts}
        totalRowCount={totalCount}
        totalPageCount={totalPages}
      />
    </div>
  )
}
