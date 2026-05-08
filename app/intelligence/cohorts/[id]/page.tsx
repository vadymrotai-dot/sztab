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

interface ProspectSnapshot {
  id: string
  name: string
  owner_name: string | null
  source: string | null
  krs_legal_form: string | null
  miejscowosc: string | null
  dominant_channel: string | null
  horeca_meta_score: number | string | null
  has_contact: boolean | null
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
    return d.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
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
  if (prospectIds.length > 0) {
    const { data: prospects } = await supabase
      .from('scored_prospects')
      .select(
        'id, name, owner_name, source, krs_legal_form, miejscowosc, dominant_channel, horeca_meta_score, has_contact',
      )
      .in('id', prospectIds)
    prospectMap = new Map(
      ((prospects ?? []) as ProspectSnapshot[]).map((p) => [p.id, p]),
    )
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

  // Compose final row shapes для client component
  const prospectRows: ProspectMemberRow[] = prospectMembers.map((m) => {
    const snap = prospectMap.get(m.subject_id)
    return {
      cohort_id: m.cohort_id,
      subject_type: 'prospect',
      subject_id: m.subject_id,
      added_at: m.added_at,
      status: m.status,
      notes: m.notes,
      snapshot: snap ?? null,
    }
  })

  const clientRows: ClientMemberRow[] = clientMembers.map((m) => {
    const snap = clientMap.get(m.subject_id)
    return {
      cohort_id: m.cohort_id,
      subject_type: 'client',
      subject_id: m.subject_id,
      added_at: m.added_at,
      status: m.status,
      notes: m.notes,
      snapshot: snap ?? null,
    }
  })

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
      />

      <div className="px-6 pb-6">
        <Button asChild variant="outline" size="sm">
          <Link href="/intelligence/cohorts">← Wszystkie cohortі</Link>
        </Button>
      </div>
    </div>
  )
}
