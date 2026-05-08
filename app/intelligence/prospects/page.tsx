// app/intelligence/prospects/page.tsx
// Phase 2.6 / Promt 3: Prospects table page (table-first variant A).
// Reads scored_prospects view (RLS via security_invoker=true on view).
// Phase 1 Krok 4 (08.05.2026) — moved з app/(dashboard)/intelligence/prospects/.
// Phase 2 Krok 1.A (post-08.05) — server-side filter "Тип фірми" via
// ?type= CSV param (fop / spzoo / sa / inne, multi-select). Default — всі.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

import { ProspectsTable, type ProspectRow } from './_components/prospects-table'

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

/** Build href що toggles single TypeId у current selection.
 *  Default (selected=null = all) → toggling одне deselect → set з решти 3.
 *  Якщо result == ALL_TYPES (всі) → drop param (back to default).
 *  Якщо result порожнє → drop param too (показати всі знов).
 */
function chipHref(typeId: TypeId, selected: Set<TypeId> | null): string {
  const next = selected ? new Set(selected) : new Set<TypeId>(ALL_TYPES)
  if (next.has(typeId)) {
    next.delete(typeId)
  } else {
    next.add(typeId)
  }
  if (next.size === 0 || next.size === ALL_TYPES.length) {
    return '/intelligence/prospects'
  }
  // Preserve canonical order для stable URLs
  const ordered = ALL_TYPES.filter((t) => next.has(t))
  return `/intelligence/prospects?type=${ordered.join(',')}`
}

// ─── Page ────────────────────────────────────────────────────────

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const sp = await searchParams
  const selected = parseTypeParam(sp.type)

  const supabase = await createClient()

  // Default ordering: meta DESC, NULLS LAST (unscored prospekti на dnie).
  // Limit 100 — UI mode dla 25-100 рекордів; pagination V2 (Krok 1.B)
  // gdy >100 потрібно бачити всі (e.g. KRS 305 prospekti).
  let query = supabase
    .from('scored_prospects')
    .select('*')
    .order('horeca_meta_score', { ascending: false, nullsFirst: false })
    .limit(100)

  if (selected) {
    const expr = buildTypeFilterExpression(selected)
    if (expr) {
      query = query.or(expr)
    }
  }

  const { data: prospects, error } = await query

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
                href={chipHref(opt.id, selected)}
                className={active ? 'pointer-events-auto' : undefined}
              >
                {opt.label}
              </Link>
            </Button>
          )
        })}
        {!isAllActive && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/intelligence/prospects">Reset</Link>
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {prospects?.length ?? 0} z 100 max (Krok 1.B = pagination)
        </span>
      </div>

      <ProspectsTable initialProspects={(prospects ?? []) as ProspectRow[]} />
    </div>
  )
}
