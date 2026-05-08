// app/intelligence/prospects/page.tsx
// Phase 2.6 / Promt 3: Prospects table page (table-first variant A).
// Reads scored_prospects view (RLS via security_invoker=true on view).
// Phase 1 Krok 4 (08.05.2026) — moved з app/(dashboard)/intelligence/prospects/.
// Phase 2 Krok 1.A (post-08.05) — server-side filter "Тип фірми" via
// ?type= CSV param (fop / spzoo / sa / inne, multi-select). Default — всі.
// Phase 2 Krok 1.B (08.05.2026 evening) — server-side pagination via
// ?page= + ?size= params. Default size=50, valid sizes [50, 100, 200].
// Removed hard limit(100) — unblocks 205 KRS prospekti previously invisible
// (поточний pool: 100 ФОП + 305 sp.z o.o. — без pagination Vadym бачив
// тільки top 100 по horeca_meta_score).

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

const PAGE_SIZES = [50, 100, 200] as const
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

/** Canonical URL builder. Drops params at default (size=50, page=1, type=all). */
function buildHref(opts: {
  type?: string | null
  page?: number
  size?: PageSize
}): string {
  const sp = new URLSearchParams()
  if (opts.type) sp.set('type', opts.type)
  if (opts.page && opts.page > 1) sp.set('page', String(opts.page))
  if (opts.size && opts.size !== DEFAULT_SIZE) sp.set('size', String(opts.size))
  const s = sp.toString()
  return s ? `/intelligence/prospects?${s}` : '/intelligence/prospects'
}

/** Toggle single TypeId; resets page to 1; preserves size.
 *  - Toggling одне з default (selected=null=all) → deselect → решта 3.
 *  - Result == ALL_TYPES або порожнє → drop ?type= (back to default).
 */
function chipHref(
  typeId: TypeId,
  selected: Set<TypeId> | null,
  size: PageSize,
): string {
  const next = selected ? new Set(selected) : new Set<TypeId>(ALL_TYPES)
  if (next.has(typeId)) {
    next.delete(typeId)
  } else {
    next.add(typeId)
  }
  const typeStr = selectedToTypeStr(next)
  return buildHref({ type: typeStr, size })
}

/** Set explicit page; preserves type + size. */
function pageHref(
  target: number,
  selected: Set<TypeId> | null,
  size: PageSize,
): string {
  const typeStr = selectedToTypeStr(selected)
  return buildHref({ type: typeStr, page: target, size })
}

/** Set page size; resets page to 1; preserves type. */
function sizeHref(target: PageSize, selected: Set<TypeId> | null): string {
  const typeStr = selectedToTypeStr(selected)
  return buildHref({ type: typeStr, size: target })
}

// ─── Page ────────────────────────────────────────────────────────

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; size?: string }>
}) {
  const sp = await searchParams
  const selected = parseTypeParam(sp.type)
  const size = parseSize(sp.size)
  let page = parsePage(sp.page)

  const supabase = await createClient()

  // Query factory — re-builds для optional refetch якщо page > totalPages.
  function buildQuery() {
    let q = supabase
      .from('scored_prospects')
      .select('*', { count: 'exact' })
      .order('horeca_meta_score', { ascending: false, nullsFirst: false })
    if (selected) {
      const expr = buildTypeFilterExpression(selected)
      if (expr) {
        q = q.or(expr)
      }
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

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages || totalCount === 0

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Prospekty"
        breadcrumbs={[
          { label: 'AI Discovery', href: '/intelligence' },
          { label: 'Prospekty' },
        ]}
      />

      {/* Type filter chips (Phase 2 Krok 1.A) */}
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
                href={chipHref(opt.id, selected, size)}
                className={active ? 'pointer-events-auto' : undefined}
              >
                {opt.label}
              </Link>
            </Button>
          )
        })}
        {!isAllActive && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={buildHref({ size })}>Reset</Link>
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {counterText}
        </span>
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

      <ProspectsTable
        initialProspects={(prospects ?? []) as ProspectRow[]}
        cohorts={cohorts}
      />

      {/* Pagination footer (Phase 2 Krok 1.B) */}
      <div className="mt-4 flex items-center justify-between px-6 pb-6">
        <p className="text-sm text-muted-foreground">{counterText}</p>
        <div className="flex items-center gap-2">
          {/* Size selector — STEP 4 */}
          <span className="text-xs text-muted-foreground">Per page:</span>
          {PAGE_SIZES.map((s) => (
            <Button
              key={s}
              asChild
              variant={size === s ? 'default' : 'outline'}
              size="sm"
            >
              <Link href={sizeHref(s, selected)}>{s}</Link>
            </Button>
          ))}

          {/* Spacer */}
          <span className="mx-2 h-4 w-px bg-border" aria-hidden />

          {/* Prev/Next — STEP 3 */}
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={prevDisabled}
            className={cn(prevDisabled && 'pointer-events-none opacity-50')}
          >
            <Link
              href={prevDisabled ? '#' : pageHref(page - 1, selected, size)}
              aria-disabled={prevDisabled || undefined}
            >
              ← Poprzednia
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={nextDisabled}
            className={cn(nextDisabled && 'pointer-events-none opacity-50')}
          >
            <Link
              href={nextDisabled ? '#' : pageHref(page + 1, selected, size)}
              aria-disabled={nextDisabled || undefined}
            >
              Następna →
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
