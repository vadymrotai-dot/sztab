// app/intelligence/cohorts/[id]/page.tsx
// Phase 2 Krok 1.C1 (08.05.2026) — Cohort detail view.
// Per Vadym Q3: prospects side тільки. Krok 1.C2 додасть UNION ALL для clients.
// Per Vadym Q4: status badges = read-only display (mutation у Krok 1.D).
//
// Polymorphic FK pattern — cohort_members.subject_id NOT а PostgREST FK
// до scored_prospects (різні subject_types можливі). Тому 2-query merge
// pattern: members first, then scored_prospects WHERE id IN (...).

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────

type CohortStatus =
  | 'pending'
  | 'called'
  | 'interested'
  | 'not_interested'
  | 'callback'

interface CohortRow {
  id: string
  name: string
  description: string | null
  created_at: string
  created_by_user_id: string | null
}

interface MemberRow {
  cohort_id: string
  subject_type: string
  subject_id: string
  added_at: string
  status: CohortStatus
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

/** Phase 2 Krok 1.C2 — clients table snapshot. Schema gap (per Vadym Q3):
 *  no total_revenue / last_invoice_date columns (Subiekt не integrated).
 *  Picked basic substitute cols. */
interface ClientSnapshot {
  id: string
  title: string
  city: string | null
  nip: string | null
  industry: string | null
  segment: string | null
  status: string | null
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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusLabel(s: CohortStatus): string {
  if (s === 'pending') return 'Pending'
  if (s === 'called') return 'Zadzwoniono'
  if (s === 'interested') return 'Zainteresowany'
  if (s === 'not_interested') return 'Nie zainteresowany'
  if (s === 'callback') return 'Callback'
  return s
}

/** Display-only color map (Krok 1.D додасть mutation UI). Per Vadym
 *  decision message: pending=neutral, called=blue, interested=green,
 *  not_interested=red, callback=amber. */
function statusBadgeClass(s: CohortStatus): string {
  if (s === 'pending') return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
  if (s === 'called') return 'bg-sky-100 text-sky-700 hover:bg-sky-100'
  if (s === 'interested')
    return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
  if (s === 'not_interested')
    return 'bg-rose-100 text-rose-700 hover:bg-rose-100'
  if (s === 'callback') return 'bg-amber-100 text-amber-700 hover:bg-amber-100'
  return 'bg-gray-100 text-gray-700'
}

function sourceLabel(p: ProspectSnapshot): string {
  if (p.source === 'ceidg') return 'CEIDG (ФОП)'
  if (p.source === 'krs') {
    const lf = p.krs_legal_form?.toUpperCase() ?? ''
    if (lf.includes('OGRANICZON')) return 'KRS (sp. z o.o.)'
    if (lf.includes('AKCYJNA')) return 'KRS (S.A.)'
    return 'KRS (inne)'
  }
  return p.source ?? '?'
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// ─── Page ────────────────────────────────────────────────────────

export default async function CohortDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  // Phase 2 Krok 1.C2 — fetch BOTH prospect i client members у parallel.
  const [
    { data: prospectMembersRaw, error: memErr },
    { data: clientMembersRaw, error: clientMemErr },
  ] = await Promise.all([
    supabase
      .from('cohort_members')
      .select('cohort_id, subject_type, subject_id, added_at, status, notes')
      .eq('cohort_id', id)
      .eq('subject_type', 'prospect')
      .order('added_at', { ascending: false }),
    supabase
      .from('cohort_members')
      .select('cohort_id, subject_type, subject_id, added_at, status, notes')
      .eq('cohort_id', id)
      .eq('subject_type', 'client')
      .order('added_at', { ascending: false }),
  ])

  // Prospect side: fetch scored_prospects снапшот через 2-query merge
  // (polymorphic subject_id не PostgREST FK).
  const prospectMembers = (prospectMembersRaw ?? []) as MemberRow[]
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

  // Client side: fetch clients table снапшот, same 2-query merge
  const clientMembers = (clientMembersRaw ?? []) as MemberRow[]
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

  const totalCount = prospectMembers.length + clientMembers.length

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
          klientów = {totalCount}
        </p>
      </div>

      {(memErr || clientMemErr) && (
        <div className="px-6 pt-2">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Błąd ładowania członków:{' '}
            {memErr?.message ?? clientMemErr?.message ?? 'unknown'}
          </div>
        </div>
      )}

      <div className="px-6 pb-6 pt-4 space-y-6">
        {totalCount === 0 ? (
          <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
            <p className="font-medium">Cohort пуста.</p>
            <p className="mt-2">
              Idź do{' '}
              <Link
                href="/intelligence/prospects"
                className="text-primary underline"
              >
                /intelligence/prospects
              </Link>
              {' '}або{' '}
              <Link href="/clients" className="text-primary underline">
                /clients
              </Link>{' '}
              щoб dodać members.
            </p>
          </div>
        ) : (
          <>
            {/* Prospekti section (Krok 1.C1) — TOP */}
            <section>
              <h2 className="mb-2 text-sm font-medium">
                Prospekti{' '}
                <span className="text-muted-foreground">
                  ({prospectMembers.length})
                </span>
              </h2>
              {prospectMembers.length === 0 ? (
                <div className="rounded-md border p-6 text-center text-xs text-muted-foreground">
                  Brak prospektów. Idź do{' '}
                  <Link
                    href="/intelligence/prospects"
                    className="text-primary underline"
                  >
                    /intelligence/prospects
                  </Link>{' '}
                  щoб dodać.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nazwa</TableHead>
                        <TableHead>Źródło</TableHead>
                        <TableHead>Miasto</TableHead>
                        <TableHead>Kanał</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="text-center">Kontakt</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-xs text-muted-foreground">
                          Dodano
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prospectMembers.map((m) => {
                        const p = prospectMap.get(m.subject_id)
                        if (!p) {
                          return (
                            <TableRow key={m.subject_id}>
                              <TableCell
                                colSpan={8}
                                className="text-xs text-muted-foreground italic"
                              >
                                Prospekt {m.subject_id.slice(0, 8)}… (orphan
                                — może usunięty z bazy)
                              </TableCell>
                            </TableRow>
                          )
                        }
                        const meta = num(p.horeca_meta_score)
                        return (
                          <TableRow key={m.subject_id}>
                            <TableCell>
                              <div className="font-medium">{p.name}</div>
                              {p.owner_name && (
                                <div className="text-xs text-muted-foreground">
                                  {p.owner_name}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {sourceLabel(p)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {p.miejscowosc ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {p.dominant_channel ?? '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {meta.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center">
                              {p.has_contact ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-emerald-700 border-emerald-200"
                                >
                                  ✓
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  'text-xs font-normal',
                                  statusBadgeClass(m.status),
                                )}
                              >
                                {statusLabel(m.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDateTime(m.added_at)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            {/* Klienci section (Krok 1.C2) — BELOW */}
            <section>
              <h2 className="mb-2 text-sm font-medium">
                Klienci{' '}
                <span className="text-muted-foreground">
                  ({clientMembers.length})
                </span>
              </h2>
              {clientMembers.length === 0 ? (
                <div className="rounded-md border p-6 text-center text-xs text-muted-foreground">
                  Brak klientów. Idź do{' '}
                  <Link href="/clients" className="text-primary underline">
                    /clients
                  </Link>{' '}
                  щoб dodać.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nazwa</TableHead>
                        <TableHead>Miasto</TableHead>
                        <TableHead>NIP</TableHead>
                        <TableHead>Industry</TableHead>
                        <TableHead>Segment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-xs text-muted-foreground">
                          Dodano
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientMembers.map((m) => {
                        const c = clientMap.get(m.subject_id)
                        if (!c) {
                          return (
                            <TableRow key={m.subject_id}>
                              <TableCell
                                colSpan={7}
                                className="text-xs text-muted-foreground italic"
                              >
                                Klient {m.subject_id.slice(0, 8)}… (orphan —
                                może usunięty z bazy)
                              </TableCell>
                            </TableRow>
                          )
                        }
                        return (
                          <TableRow key={m.subject_id}>
                            <TableCell>
                              <Link
                                href={`/clients/${c.id}`}
                                className="font-medium hover:underline"
                              >
                                {c.title}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.city ?? '—'}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {c.nip ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.industry ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.segment ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  'text-xs font-normal',
                                  statusBadgeClass(m.status),
                                )}
                              >
                                {statusLabel(m.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDateTime(m.added_at)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}

        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/intelligence/cohorts">← Wszystkie cohortі</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
