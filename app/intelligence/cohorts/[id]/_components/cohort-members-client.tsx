'use client'

// app/intelligence/cohorts/[id]/_components/cohort-members-client.tsx
// Phase 2 Krok 1.D1 (08.05.2026) — interactive cohort members UI.
// Wraps Prospekti + Klienci sections з shared selection state, inline
// status mutation (DropdownMenu badge), notes inline edit з explicit
// Save/Cancel buttons.
//
// Selection key encoding: `${subject_type}:${subject_id}` — cohort_id
// implicit (per page params). Per Krok 1.D1 Q2=B2 — composite tuple keys
// у server actions, NIE schema id PK change.
//
// Optimistic updates: useTransition + manual local override Map для
// status (immediate badge color change). Notes — local edit value у
// parent state, explicit Save trigger через button/Enter (NIE save-on-blur;
// blur-as-trigger had race condition між focus loss + React state commit).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckIcon,
  PencilIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  updateCohortMemberStatus,
  updateCohortMemberNotes,
  type CohortMemberStatus,
  type MemberKey,
} from '@/lib/actions/cohorts'

import { CohortBulkBar } from './cohort-bulk-bar'

// ─── Types ────────────────────────────────────────────────────────

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
}

/** Sprint S6D Day 4 — enrichment з contact_enrichment (apify_gmaps),
 *  joined server-side у page.tsx. */
export interface ProspectEnrichmentData {
  status: string | null
  phone: string | null
  website: string | null
  gmaps_rating: number | string | null
  gmaps_reviews_count: number | null
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

export interface ProspectMemberRow {
  cohort_id: string
  subject_type: 'prospect'
  subject_id: string
  added_at: string
  status: CohortMemberStatus
  notes: string | null
  snapshot: ProspectSnapshot | null
  /** Sprint S6D Day 4 — joined contact_enrichment data. Null коли not
   *  yet enriched OR enrichment failed (no_match/error). */
  enrichment: ProspectEnrichmentData | null
}

export interface ClientMemberRow {
  cohort_id: string
  subject_type: 'client'
  subject_id: string
  added_at: string
  status: CohortMemberStatus
  notes: string | null
  snapshot: ClientSnapshot | null
}

interface Props {
  cohortId: string
  prospects: ProspectMemberRow[]
  clients: ClientMemberRow[]
  statusFilter: CohortMemberStatus | null
  statusFilterLabel: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────

const NOTES_MAX = 200

const ALL_STATUSES: CohortMemberStatus[] = [
  'pending',
  'called',
  'interested',
  'not_interested',
  'callback',
]

function statusLabel(s: CohortMemberStatus): string {
  // Plural form — consistent з bulk Select + filter chips (Vadym 09.05 i18n).
  if (s === 'pending') return 'Pending'
  if (s === 'called') return 'Zadzwoniono'
  if (s === 'interested') return 'Zainteresowani'
  if (s === 'not_interested') return 'Nie zainteresowani'
  if (s === 'callback') return 'Callback'
  return s
}

function statusBadgeClass(s: CohortMemberStatus): string {
  if (s === 'pending') return 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  if (s === 'called') return 'bg-sky-100 text-sky-700 hover:bg-sky-200'
  if (s === 'interested')
    return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
  if (s === 'not_interested')
    return 'bg-rose-100 text-rose-700 hover:bg-rose-200'
  if (s === 'callback') return 'bg-amber-100 text-amber-700 hover:bg-amber-200'
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

/** Encode composite PK as selection key для useState<Set<string>>.
 *  cohort_id implicit (page param), so 2-component string. */
function memberKey(row: ProspectMemberRow | ClientMemberRow): string {
  return `${row.subject_type}:${row.subject_id}`
}

function decodeMemberKey(
  key: string,
  cohortId: string,
): MemberKey | null {
  const idx = key.indexOf(':')
  if (idx === -1) return null
  const subject_type = key.slice(0, idx)
  const subject_id = key.slice(idx + 1)
  if (subject_type !== 'prospect' && subject_type !== 'client') return null
  return { cohort_id: cohortId, subject_type, subject_id }
}

// ─── Main client component ─────────────────────────────────────

export function CohortMembersClient({
  cohortId,
  prospects,
  clients,
  statusFilter,
  statusFilterLabel,
}: Props) {
  const router = useRouter()

  // Selection state (cross-section)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Optimistic status overrides — Map<memberKey, status>. Cleared after
  // server confirms (router.refresh() invalidates props).
  const [optimisticStatus, setOptimisticStatus] = useState<
    Map<string, CohortMemberStatus>
  >(new Map())

  // Notes inline edit state
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const [statusPending, startStatusTransition] = useTransition()
  const [notesPending, startNotesTransition] = useTransition()

  // ─── Selection helpers ────────────────────────────────────────

  const toggleOne = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleAllProspects = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = prospects.every((p) => next.has(memberKey(p)))
      if (allSelected) {
        prospects.forEach((p) => next.delete(memberKey(p)))
      } else {
        prospects.forEach((p) => next.add(memberKey(p)))
      }
      return next
    })
  }

  const toggleAllClients = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = clients.every((c) => next.has(memberKey(c)))
      if (allSelected) {
        clients.forEach((c) => next.delete(memberKey(c)))
      } else {
        clients.forEach((c) => next.add(memberKey(c)))
      }
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  // ─── Effective status (optimistic override) ──────────────────

  const effectiveStatus = (
    row: ProspectMemberRow | ClientMemberRow,
  ): CohortMemberStatus => {
    return optimisticStatus.get(memberKey(row)) ?? row.status
  }

  // ─── Inline status mutation ──────────────────────────────────

  const handleStatusChange = (
    row: ProspectMemberRow | ClientMemberRow,
    newStatus: CohortMemberStatus,
    displayName: string,
  ) => {
    const key = memberKey(row)
    if (effectiveStatus(row) === newStatus) return

    // Optimistic override
    setOptimisticStatus((prev) => {
      const next = new Map(prev)
      next.set(key, newStatus)
      return next
    })

    startStatusTransition(async () => {
      try {
        await updateCohortMemberStatus(
          {
            cohort_id: row.cohort_id,
            subject_type: row.subject_type,
            subject_id: row.subject_id,
          },
          newStatus,
        )
        toast.success(`${displayName} → ${statusLabel(newStatus)}`)
        // Clear optimistic для цього key (server-fresh data via refresh)
        setOptimisticStatus((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
        router.refresh()
      } catch (e) {
        // Revert optimistic on error
        setOptimisticStatus((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error(`Błąd: ${msg}`)
      }
    })
  }

  // ─── Notes inline edit ───────────────────────────────────────

  const startEdit = (key: string, currentNotes: string | null) => {
    setEditingKey(key)
    setEditValue(currentNotes ?? '')
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const saveNotes = (
    row: ProspectMemberRow | ClientMemberRow,
    displayName: string,
  ) => {
    const key = memberKey(row)
    const trimmed = editValue.trim()

    // No-op якщо unchanged
    if ((row.notes ?? '') === trimmed) {
      cancelEdit()
      return
    }

    if (trimmed.length > NOTES_MAX) {
      toast.error(`Notatka max ${NOTES_MAX} znaków`)
      return
    }

    setSavingKey(key)
    startNotesTransition(async () => {
      try {
        await updateCohortMemberNotes(
          {
            cohort_id: row.cohort_id,
            subject_type: row.subject_type,
            subject_id: row.subject_id,
          },
          trimmed.length > 0 ? trimmed : null,
        )
        toast.success(`Notatka zapisana: ${displayName}`)
        setEditingKey(null)
        setEditValue('')
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error(`Błąd: ${msg}`)
      } finally {
        setSavingKey(null)
      }
    })
  }

  // ─── Render helpers ──────────────────────────────────────────

  const allProspectsSelected =
    prospects.length > 0 && prospects.every((p) => selected.has(memberKey(p)))
  const allClientsSelected =
    clients.length > 0 && clients.every((c) => selected.has(memberKey(c)))

  const totalCount = prospects.length + clients.length
  const filterActive = statusFilter !== null

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6 px-6 pb-6 pt-4">
      {totalCount === 0 ? (
        <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
          {filterActive ? (
            <>
              <p className="font-medium">
                Brak członków ze statusem &quot;{statusFilterLabel}&quot;.
              </p>
              <p className="mt-2">
                <Link
                  href={`/intelligence/cohorts/${cohortId}`}
                  className="text-primary underline"
                >
                  Pokaż wszystkie statusy
                </Link>
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      ) : (
        <>
          {/* Prospekti section — Krok 1.C1 */}
          <section>
            <h2 className="mb-2 text-sm font-medium">
              Prospekti{' '}
              <span className="text-muted-foreground">
                ({prospects.length})
              </span>
            </h2>
            {prospects.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-xs text-muted-foreground">
                {filterActive
                  ? `Brak prospektów ze statusem "${statusFilterLabel}".`
                  : 'Brak prospektów.'}
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={allProspectsSelected}
                          onCheckedChange={toggleAllProspects}
                          aria-label="Zaznacz wszystkich prospektów"
                        />
                      </TableHead>
                      <TableHead>Nazwa</TableHead>
                      <TableHead>Źródło</TableHead>
                      <TableHead>Miasto</TableHead>
                      <TableHead>Kanał</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-center">Kontakt</TableHead>
                      <TableHead className="min-w-[200px]">Notatka</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        Dodano
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prospects.map((row) => {
                      const key = memberKey(row)
                      const p = row.snapshot
                      const isSelected = selected.has(key)
                      const isEditing = editingKey === key
                      const isSaving = savingKey === key
                      const status = effectiveStatus(row)
                      const displayName = p?.name ?? row.subject_id.slice(0, 8)

                      if (!p) {
                        return (
                          <TableRow key={key}>
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleOne(key)}
                              />
                            </TableCell>
                            <TableCell
                              colSpan={9}
                              className="text-xs text-muted-foreground italic"
                            >
                              Prospekt {row.subject_id.slice(0, 8)}… (orphan)
                            </TableCell>
                          </TableRow>
                        )
                      }

                      // Sprint S6D Day 4 — enrichment data joined server-side.
                      const enr = row.enrichment
                      const enrSuccess =
                        enr?.status === 'success' &&
                        (enr.phone || enr.website || enr.gmaps_rating)
                      const meta = num(p.horeca_meta_score)
                      const gmapsRating = enr?.gmaps_rating
                        ? num(enr.gmaps_rating)
                        : null
                      // Score column logic (Vadym ETAP 3):
                      // - JDG з horeca_meta_score > 0 → show оригінальний score
                      // - sp.z o.o. з gmaps_rating → show "⭐ X.X" + reviews count
                      // - інакше — '—'
                      const showOriginalScore = meta > 0
                      const showGmapsScore = !showOriginalScore && gmapsRating !== null
                      return (
                        <TableRow
                          key={key}
                          className={cn(isSelected && 'bg-muted/30')}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(key)}
                              aria-label={`Zaznacz ${p.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            {/* Sprint S6D Day 4 ETAP 4 — clickable name → lookup page з prefill NIP */}
                            {p.nip ? (
                              <Link
                                href={`/intelligence/lookup?nip=${p.nip}`}
                                className="font-medium hover:text-emerald-700 hover:underline"
                              >
                                {p.name}
                              </Link>
                            ) : (
                              <div className="font-medium">{p.name}</div>
                            )}
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
                            {showOriginalScore ? (
                              meta.toFixed(1)
                            ) : showGmapsScore ? (
                              <span className="text-xs">
                                ⭐ {gmapsRating!.toFixed(1)}
                                {enr?.gmaps_reviews_count != null && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({enr.gmaps_reviews_count})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {enrSuccess ? (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="cursor-default text-xs text-emerald-700 border-emerald-200"
                                    >
                                      ✓
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs">
                                    <div className="space-y-1 text-xs">
                                      {enr.phone && (
                                        <div>📞 {enr.phone}</div>
                                      )}
                                      {enr.website && (
                                        <div className="break-all">
                                          🌐 {enr.website}
                                        </div>
                                      )}
                                      {enr.gmaps_rating != null && (
                                        <div>
                                          ⭐ {num(enr.gmaps_rating).toFixed(1)}
                                          {enr.gmaps_reviews_count != null && (
                                            <> ({enr.gmaps_reviews_count} opinii)</>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : p.has_contact ? (
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
                            <NotesCell
                              row={row}
                              isEditing={isEditing}
                              isSaving={isSaving}
                              editValue={editValue}
                              onStartEdit={() => startEdit(key, row.notes)}
                              onChangeValue={setEditValue}
                              onCancel={cancelEdit}
                              onSave={() => saveNotes(row, p.name)}
                            />
                          </TableCell>
                          <TableCell>
                            <StatusCell
                              status={status}
                              busy={statusPending}
                              onSelect={(s) =>
                                handleStatusChange(row, s, p.name)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(row.added_at)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Klienci section — Krok 1.C2 */}
          <section>
            <h2 className="mb-2 text-sm font-medium">
              Klienci{' '}
              <span className="text-muted-foreground">({clients.length})</span>
            </h2>
            {clients.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-xs text-muted-foreground">
                {filterActive
                  ? `Brak klientów ze statusem "${statusFilterLabel}".`
                  : 'Brak klientów.'}
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={allClientsSelected}
                          onCheckedChange={toggleAllClients}
                          aria-label="Zaznacz wszystkich klientów"
                        />
                      </TableHead>
                      <TableHead>Nazwa</TableHead>
                      <TableHead>Miasto</TableHead>
                      <TableHead>NIP</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Segment</TableHead>
                      <TableHead className="min-w-[200px]">Notatka</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        Dodano
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((row) => {
                      const key = memberKey(row)
                      const c = row.snapshot
                      const isSelected = selected.has(key)
                      const isEditing = editingKey === key
                      const isSaving = savingKey === key
                      const status = effectiveStatus(row)
                      const displayName = c?.title ?? row.subject_id.slice(0, 8)

                      if (!c) {
                        return (
                          <TableRow key={key}>
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleOne(key)}
                              />
                            </TableCell>
                            <TableCell
                              colSpan={8}
                              className="text-xs text-muted-foreground italic"
                            >
                              Klient {row.subject_id.slice(0, 8)}… (orphan)
                            </TableCell>
                          </TableRow>
                        )
                      }

                      return (
                        <TableRow
                          key={key}
                          className={cn(isSelected && 'bg-muted/30')}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(key)}
                              aria-label={`Zaznacz ${c.title}`}
                            />
                          </TableCell>
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
                            <NotesCell
                              row={row}
                              isEditing={isEditing}
                              isSaving={isSaving}
                              editValue={editValue}
                              onStartEdit={() => startEdit(key, row.notes)}
                              onChangeValue={setEditValue}
                              onCancel={cancelEdit}
                              onSave={() => saveNotes(row, c.title)}
                            />
                          </TableCell>
                          <TableCell>
                            <StatusCell
                              status={status}
                              busy={statusPending}
                              onSelect={(s) =>
                                handleStatusChange(row, s, c.title)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(row.added_at)}
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

      {/* Sticky bulk bar — Krok 1.D1 */}
      {selected.size > 0 && (
        <CohortBulkBar
          cohortId={cohortId}
          memberKeys={Array.from(selected)
            .map((k) => decodeMemberKey(k, cohortId))
            .filter((k): k is MemberKey => k !== null)}
          onClear={clearSelection}
        />
      )}
    </div>
  )
}

// ─── StatusCell — DropdownMenu wrapping clickable Badge ──────────

function StatusCell({
  status,
  busy,
  onSelect,
}: {
  status: CohortMemberStatus
  busy: boolean
  onSelect: (s: CohortMemberStatus) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        <button
          type="button"
          className="inline-flex items-center"
          aria-label={`Status: ${statusLabel(status)} — kliknij щoб zmienić`}
        >
          <Badge
            className={cn(
              'cursor-pointer text-xs font-normal transition-transform hover:scale-105',
              statusBadgeClass(status),
              busy && 'opacity-60',
            )}
          >
            {statusLabel(status)}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel className="text-xs">Zmień status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => onSelect(s)}
            className={cn(
              'cursor-pointer',
              s === status && 'font-medium',
            )}
          >
            <Badge
              className={cn(
                'mr-2 text-[10px] font-normal',
                statusBadgeClass(s),
              )}
            >
              {statusLabel(s)}
            </Badge>
            {s === status && <CheckIcon className="ml-auto size-3" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── NotesCell — inline edit з explicit Save/Cancel buttons ─────
// Per Krok 1.D1 BUG #1 fix (Vadym smoke 09.05): save-on-blur was unreliable
// (race condition між blur firing і React state commit). Explicit Save
// button + Enter key + Escape key — deterministic UX. onMouseDown
// preventDefault on buttons keeps Input focused so click reliably fires.

function NotesCell({
  row,
  isEditing,
  isSaving,
  editValue,
  onStartEdit,
  onChangeValue,
  onCancel,
  onSave,
}: {
  row: ProspectMemberRow | ClientMemberRow
  isEditing: boolean
  isSaving: boolean
  editValue: string
  onStartEdit: () => void
  onChangeValue: (v: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={editValue}
          onChange={(e) => onChangeValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            } else if (e.key === 'Enter') {
              e.preventDefault()
              onSave()
            }
          }}
          maxLength={NOTES_MAX}
          autoFocus
          disabled={isSaving}
          className="h-7 text-xs"
          placeholder="Notatka (max 200 znaków)…"
        />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSave}
          disabled={isSaving}
          className="rounded-md p-1 hover:bg-emerald-100 disabled:opacity-50"
          title="Zapisz (Enter)"
          aria-label="Zapisz notatkę"
        >
          <CheckIcon className="size-3.5 text-emerald-700" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-md p-1 hover:bg-rose-100 disabled:opacity-50"
          title="Anuluj (Esc)"
          aria-label="Anuluj edycję"
        >
          <XIcon className="size-3.5 text-rose-700" />
        </button>

        {isSaving && (
          <Loader2Icon className="size-3 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>
    )
  }

  if (row.notes) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="group flex items-start gap-1 text-left text-xs hover:text-foreground"
      >
        <span className="line-clamp-2">{row.notes}</span>
        <PencilIcon className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onStartEdit}
      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      + dodaj notatkę
    </button>
  )
}
