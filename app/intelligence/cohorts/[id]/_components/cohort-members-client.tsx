'use client'

// app/intelligence/cohorts/[id]/_components/cohort-members-client.tsx
// Phase 2 Krok 1.D1 (08.05.2026) — interactive cohort members UI.
// Phase 2 Krok 1.C1/C2 — prospекti + klienci sections.
//
// Sprint S-UX-CORE STEP 2 (14.05.2026) — migrated to shared DataTable:
//   - components/ui/data-table.tsx wraps TanStack Table v8
//   - lib/table/use-table-url-state.ts — bidirectional URL ↔ state sync
//   - lib/table/table-helpers (createSortableHeader + multi-field filter)
//
// Selection key encoding: `${subject_type}:${subject_id}` — cohort_id
// implicit (per page params). Per Krok 1.D1 Q2=B2 — composite tuple keys
// у server actions, НЕ schema id PK change.
//
// Optimistic updates: useTransition + manual local override Map для
// status (immediate badge color change). Notes — local edit value у
// parent state, explicit Save trigger через button/Enter (НЕ save-on-blur;
// blur-as-trigger had race condition між focus loss + React state commit).

import { useMemo, useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckIcon,
  PencilIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react'
import type { ColumnDef, ColumnFiltersState, RowSelectionState } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { DataTable } from '@/components/ui/data-table'
import { useTableUrlState } from '@/lib/table/use-table-url-state'
import {
  createSortableHeader,
  createMultiFieldGlobalFilter,
} from '@/lib/table/table-helpers'
import {
  ScoreHistogram,
  scoreTierFilterFn,
  getProspectEffectiveScore,
  type ScoreTier,
} from '@/components/cohort/score-histogram'
import { ScoreDrilldownModal } from '@/components/cohort/score-drilldown-modal'

import {
  updateCohortMemberStatus,
  updateCohortMemberNotes,
  updateClientNotes,
  type CohortMemberStatus,
  type MemberKey,
} from '@/lib/actions/cohorts'

import { CohortBulkBar } from './cohort-bulk-bar'

// ─── Types ────────────────────────────────────────────────────────

/** Sprint S-UX-CORE STEP 3.3 (14.05.2026) — business_profile JSONB
 *  exposed для drilldown modal AI section + false-positive heuristic
 *  (buyer_strength_for_chm < 60 + combined ≥ 70 → ⚠ warning). */
export interface ProspectBusinessProfile {
  buyer_strength_for_chm?: number | null
  client_type?: string | null
  // інші keys у JSONB ignored для UI рендеру (extensible).
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
  /** STEP 3.3 — joined з ceidg_prospects.business_profile JSONB. */
  business_profile: ProspectBusinessProfile | null
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

/** Sprint S-RANK B-min (13.05.2026) — match aggregation per prospect.
 *  Joined server-side у page.tsx via matches table (combined_score per prospect).
 *  Sprint S-UX-CORE STEP 3.3 (14.05.2026) — extended з top-match algo_score /
 *  ai_score / reason_codes для drilldown modal AI re-score section + false
 *  positive heuristic. */
export interface ProspectMatchData {
  max_score: number | null
  count: number
  breakdown: unknown
  /** STEP 3.3 — top match's algo_score (raw, pre-AI). */
  top_algo_score: number | null
  /** STEP 3.3 — top match's ai_score (null коли L6 AI ne ran). */
  top_ai_score: number | null
  /** STEP 3.3 — top match's reason_codes (e.g. ['buyer_strength_cap:5']). */
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
  /** Sprint S-RANK B-min (13.05.2026) — matches.combined_score MAX per prospect.
   *  Null коли matching algo ne ran для цього prospекta (e.g. hard filter
   *  excluded: brak PKD, brak krs_legal_form). */
  match: ProspectMatchData | null
  /** Fix 11.06 (B) — buyer_strength z najnowszej analizy AI (twin-aware po NIP).
   *  Główny score listy, spójny z profilem. Null → fallback 'wstępny'. */
  buyer_strength_display?: number | null
  /** Fix 11.06 (C) — id bliźniaka-clienta gdy istnieje. Gdy ustawione,
   *  notatka czyta/pisze clients.notes (jedno źródło z profilem). */
  notes_client_id?: string | null
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
  /** Sprint TYDZIEN2.T2.3.1 (28.05.2026) — map NIP → existing clients.id.
   *  Pozwala prospect row link directly do /clients/{id}?from=cohort&fromId=
   *  gdy parallel clients row istnieje (KRS unification). Fallback do
   *  /intelligence/lookup gdy nie ma. Server-resolved bulk SELECT. */
  nipToClientId?: Record<string, string>
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
    // Sprint TYDZIEN2 BUGFIX (28.05.2026) — fixed timeZone aby uniknąć React
    // #418 hydration mismatch (Node UTC vs browser Europe/Warsaw — text content
    // SSR vs client різний, hydration aborted, downstream Link click handlers
    // не attached). Sztab = PL B2B, Europe/Warsaw natural choice (DST auto).
    return d.toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Warsaw',
    })
  } catch {
    return iso
  }
}

/** Encode composite PK як selection key for TanStack getRowId.
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
  nipToClientId,
}: Props) {
  const router = useRouter()

  // Selection state (cross-section) — source of truth, mirrored to
  // TanStack rowSelection via controlled prop.
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

  // STEP 3.3 — score drilldown modal state. null = closed.
  const [drilldownProspect, setDrilldownProspect] = useState<ProspectMemberRow | null>(null)

  const [statusPending, startStatusTransition] = useTransition()
  const [notesPending, startNotesTransition] = useTransition()
  void notesPending

  // Sprint S-CLEAN (13.05.2026) — sync optimistic overrides з freshly-loaded
  // props. Якщо row.status тепер matches optimistic override (server confirmed
  // через router.refresh()) → drop override silently. Це eliminates flicker
  // який Vadym caught на Day 5 ("Status pill F5 потрібен").
  useEffect(() => {
    setOptimisticStatus((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const row of prospects) {
        const k = memberKey(row)
        if (next.get(k) === row.status) {
          next.delete(k)
          changed = true
        }
      }
      for (const row of clients) {
        const k = memberKey(row)
        if (next.get(k) === row.status) {
          next.delete(k)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [prospects, clients])

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
        router.refresh()
      } catch (e) {
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
        // Fix 11.06 (C) — twin-aware: zapis do clients.notes gdy jest bliźniak.
        const twinClientId = (row as { notes_client_id?: string | null }).notes_client_id
        if (twinClientId) {
          await updateClientNotes(twinClientId, trimmed.length > 0 ? trimmed : null)
        } else {
          await updateCohortMemberNotes(
            {
              cohort_id: row.cohort_id,
              subject_type: row.subject_type,
              subject_id: row.subject_id,
            },
            trimmed.length > 0 ? trimmed : null,
          )
        }
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

  // ─── Bridge: selected Set ↔ TanStack RowSelectionState ────────
  // DataTable приймає rowSelection as Record<rowId, boolean>. Derive
  // from parent selected Set; onChange writes back до Set.

  const prospectRowSelection = useMemo<RowSelectionState>(() => {
    const out: RowSelectionState = {}
    for (const key of selected) {
      if (key.startsWith('prospect:')) out[key] = true
    }
    return out
  }, [selected])

  const clientRowSelection = useMemo<RowSelectionState>(() => {
    const out: RowSelectionState = {}
    for (const key of selected) {
      if (key.startsWith('client:')) out[key] = true
    }
    return out
  }, [selected])

  // Update parent selected Set коли DataTable селект змінюється.
  // We get a partial RowSelectionState за tab (prospect OR client);
  // need to merge з existing selected (preserving counter section).
  const handleProspectSelectionChange = (next: RowSelectionState) => {
    setSelected((prev) => {
      const out = new Set<string>()
      // Preserve all client selections (different table)
      for (const k of prev) if (k.startsWith('client:')) out.add(k)
      // Add new prospect selections
      for (const [k, v] of Object.entries(next)) if (v) out.add(k)
      return out
    })
  }
  const handleClientSelectionChange = (next: RowSelectionState) => {
    setSelected((prev) => {
      const out = new Set<string>()
      for (const k of prev) if (k.startsWith('prospect:')) out.add(k)
      for (const [k, v] of Object.entries(next)) if (v) out.add(k)
      return out
    })
  }

  // ─── URL state для prospекtів table ──────────────────────────
  // Per Vadym S-UX spec: prospекti table get URL sync (Vadym's pain
  // point — refresh loses sort/search). Clients table = internal state
  // тільки (smaller use case, avoids URL param key collision).

  const prospectsUrlState = useTableUrlState({
    defaultPageSize: 50,
    sortableColumnIds: ['name', 'source', 'miejscowosc', 'channel', 'score', 'status', 'added_at'],
    // STEP 3.2: score column filterable via histogram chips.
    filterableColumnIds: ['score'],
    preserveKeys: ['status', 'tab', 'cohort_id'],
  })

  // STEP 3.2: derive active score tier z columnFilters (URL-synced).
  const activeScoreTier: ScoreTier | null = useMemo(() => {
    const f = prospectsUrlState.columnFilters.find((cf) => cf.id === 'score')
    if (!f) return null
    const v = f.value
    if (v === 'high' || v === 'mid' || v === 'low' || v === 'none') return v
    return null
  }, [prospectsUrlState.columnFilters])

  const handleScoreTierChange = (next: ScoreTier | null) => {
    prospectsUrlState.setColumnFilters((prev: ColumnFiltersState) => {
      const without = prev.filter((cf) => cf.id !== 'score')
      return next ? [...without, { id: 'score', value: next }] : without
    })
  }

  // STEP 3.2: pre-compute effective scores для histogram counts.
  // Uses same accessor priority як score column accessorFn (single source).
  const prospectScores = useMemo(
    () => prospects.map((p) => getProspectEffectiveScore(p)),
    [prospects],
  )

  // ─── Column definitions ──────────────────────────────────────

  const prospectColumns = useMemo<ColumnDef<ProspectMemberRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Zaznacz wszystkich prospektów"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label={`Zaznacz ${row.original.snapshot?.name ?? '?'}`}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'name',
        accessorFn: (row) => row.snapshot?.name ?? '',
        header: createSortableHeader<ProspectMemberRow>('Nazwa'),
        cell: ({ row }) => {
          const p = row.original.snapshot
          if (!p) {
            return (
              <span className="text-xs italic text-muted-foreground">
                Prospekt {row.original.subject_id.slice(0, 8)}… (orphan)
              </span>
            )
          }
          // Sprint TYDZIEN2.T2.3.1 (28.05.2026) — conditional href.
          // Якщо parallel clients.id row istnieje (NIP resolved) → bezpośredni
          // profile link з ?from=cohort&fromId= context (blue, як clients rows).
          // Inaczej fallback do /intelligence/lookup?nip= (emerald, як wcześniej)
          // — auto-uruchomi enrichment przy pierwszym otwarciu i utworzy profil.
          const directClientId = p.nip ? nipToClientId?.[p.nip] : undefined
          return (
            <div>
              {p.nip ? (
                directClientId ? (
                  // Sprint TYDZIEN2.T2.3.1 BUGFIX (28.05.2026) — convention
                  // changed з `?from=cohort/{uuid}` na `?from=cohort&fromId={uuid}`.
                  // Slash у query value blокував Next.js Link client-side
                  // navigation (prefetch validation fail, silent click no-op).
                  // Direct URL visit works because browser parses URL standard.
                  // Sprint TYDZIEN2 FINAL (28.05.2026) — prefetch={false} bo cohort
                  // mass-list (50+ Links видимих) → Next.js Link auto-prefetch
                  // flooduje серверу 50+ RSC requests одразу при page load → real
                  // klick "губиться" w prefetch queue. Vercel logs показали
                  // 94 RSC requests/30s. Prefetch disabled per Link u list.
                  <Link
                    href={`/clients/${directClientId}?from=cohort&fromId=${cohortId}`}
                    className="font-medium text-blue-700 hover:underline"
                    prefetch={false}
                  >
                    {p.name}
                  </Link>
                ) : (
                  <Link
                    href={`/intelligence/lookup?nip=${p.nip}`}
                    className="font-medium hover:text-emerald-700 hover:underline"
                    title="Pierwszy lookup utworzy profil"
                    prefetch={false}
                  >
                    {p.name}
                  </Link>
                )
              ) : (
                <div className="font-medium">{p.name}</div>
              )}
              {p.owner_name && (
                <div className="text-xs text-muted-foreground">{p.owner_name}</div>
              )}
            </div>
          )
        },
      },
      {
        id: 'nip',
        accessorFn: (row) => row.snapshot?.nip ?? '',
        header: 'NIP',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.snapshot?.nip ?? '—'}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'source',
        accessorFn: (row) => (row.snapshot ? sourceLabel(row.snapshot) : ''),
        header: createSortableHeader<ProspectMemberRow>('Źródło'),
        cell: ({ row }) => {
          const p = row.original.snapshot
          if (!p) return null
          return (
            <Badge variant="outline" className="text-xs">
              {sourceLabel(p)}
            </Badge>
          )
        },
      },
      {
        id: 'miejscowosc',
        accessorFn: (row) => row.snapshot?.miejscowosc ?? '',
        header: createSortableHeader<ProspectMemberRow>('Miasto'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.snapshot?.miejscowosc ?? '—'}</span>
        ),
      },
      {
        id: 'channel',
        accessorFn: (row) => row.snapshot?.dominant_channel ?? '',
        header: createSortableHeader<ProspectMemberRow>('Kanał'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.snapshot?.dominant_channel ?? '—'}</span>
        ),
      },
      {
        id: 'score',
        accessorFn: (row) => {
          // Fix 11.06 (B) — buyer_strength (analiza AI) priorytetem, spójnie z profilem.
          const bs = row.buyer_strength_display
          if (typeof bs === 'number') return bs
          // Fallback (wstępny): matches.max_score → horeca_meta_score → gmaps_rating
          const ms = row.match?.max_score
          if (typeof ms === 'number' && ms > 0) return ms
          const meta = num(row.snapshot?.horeca_meta_score)
          if (meta > 0) return meta
          const gmaps = row.enrichment?.gmaps_rating
          if (gmaps) return num(gmaps) * 20 // 5★ → 100
          return -1 // sort below all real scores
        },
        header: createSortableHeader<ProspectMemberRow>('Score'),
        sortDescFirst: true,
        // STEP 3.2 — tier filter (histogram chip click). Maps numeric
        // accessor value (-1 / 0+) до 'high'/'mid'/'low'/'none' буckets.
        filterFn: scoreTierFilterFn,
        cell: ({ row }) => {
          const p = row.original.snapshot
          if (!p) return null
          // Fix 11.06 (B) — główny score = buyer_strength (AI), spójny z profilem.
          const bs = row.original.buyer_strength_display
          if (typeof bs === 'number') {
            return (
              <span
                className="tabular-nums font-semibold text-[#1F3A5F]"
                title="Buyer strength (analiza AI) — spójne z profilem klienta"
              >
                {bs}
                <span className="ml-0.5 text-[11px] text-[#888]">/100</span>
              </span>
            )
          }
          const enr = row.original.enrichment
          const meta = num(p.horeca_meta_score)
          const gmapsRating = enr?.gmaps_rating ? num(enr.gmaps_rating) : null
          const matchScore = row.original.match?.max_score ?? null
          const showMatchScore = matchScore !== null && matchScore > 0
          const showOriginalScore = !showMatchScore && meta > 0
          const showGmapsScore =
            !showMatchScore && !showOriginalScore && gmapsRating !== null
          if (showMatchScore) {
            return (
              <span className="inline-flex items-center gap-1 opacity-70">
                <MatchScoreBadge
                  score={matchScore!}
                  breakdown={row.original.match?.breakdown}
                  productCount={row.original.match?.count ?? 0}
                  onOpenDrilldown={() => setDrilldownProspect(row.original)}
                />
                <span className="text-[10px] text-[#888]">wstępny</span>
              </span>
            )
          }
          if (showOriginalScore) {
            return (
              <span className="tabular-nums text-[#888]">
                {meta.toFixed(1)} <span className="text-[10px]">wstępny</span>
              </span>
            )
          }
          if (showGmapsScore) {
            return (
              <span className="text-xs">
                ⭐ {gmapsRating!.toFixed(1)}
                {enr?.gmaps_reviews_count != null && (
                  <span className="ml-1 text-muted-foreground">
                    ({enr.gmaps_reviews_count})
                  </span>
                )}
              </span>
            )
          }
          return <span className="text-xs text-muted-foreground">—</span>
        },
      },
      {
        id: 'contact',
        accessorFn: (row) =>
          row.enrichment?.status === 'success' &&
          (row.enrichment.phone || row.enrichment.website || row.enrichment.gmaps_rating)
            ? 1
            : row.snapshot?.has_contact
              ? 1
              : 0,
        header: 'Kontakt',
        enableSorting: false,
        cell: ({ row }) => {
          const enr = row.original.enrichment
          const p = row.original.snapshot
          const enrSuccess =
            enr?.status === 'success' &&
            (enr.phone || enr.website || enr.gmaps_rating)
          if (enrSuccess) {
            return (
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
                      {enr.phone && <div>📞 {enr.phone}</div>}
                      {enr.website && (
                        <div className="break-all">🌐 {enr.website}</div>
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
            )
          }
          if (p?.has_contact) {
            return (
              <Badge
                variant="outline"
                className="text-xs text-emerald-700 border-emerald-200"
              >
                ✓
              </Badge>
            )
          }
          return <span className="text-xs text-muted-foreground">—</span>
        },
      },
      {
        id: 'notes',
        header: 'Notatka',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          const key = memberKey(r)
          return (
            <NotesCell
              row={r}
              isEditing={editingKey === key}
              isSaving={savingKey === key}
              editValue={editValue}
              onStartEdit={() => startEdit(key, r.notes)}
              onChangeValue={setEditValue}
              onCancel={cancelEdit}
              onSave={() => saveNotes(r, r.snapshot?.name ?? '?')}
            />
          )
        },
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: createSortableHeader<ProspectMemberRow>('Status'),
        cell: ({ row }) => {
          const r = row.original
          const status = effectiveStatus(r)
          return (
            <StatusCell
              status={status}
              busy={statusPending}
              onSelect={(s) =>
                handleStatusChange(r, s, r.snapshot?.name ?? '?')
              }
            />
          )
        },
      },
      {
        id: 'added_at',
        accessorFn: (row) => row.added_at,
        header: createSortableHeader<ProspectMemberRow>('Dodano'),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(row.original.added_at)}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingKey, editValue, savingKey, statusPending, optimisticStatus],
  )

  const clientColumns = useMemo<ColumnDef<ClientMemberRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Zaznacz wszystkich klientów"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label={`Zaznacz ${row.original.snapshot?.title ?? '?'}`}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'title',
        accessorFn: (row) => row.snapshot?.title ?? '',
        header: createSortableHeader<ClientMemberRow>('Nazwa'),
        cell: ({ row }) => {
          const c = row.original.snapshot
          if (!c) {
            return (
              <span className="text-xs italic text-muted-foreground">
                Klient {row.original.subject_id.slice(0, 8)}… (orphan)
              </span>
            )
          }
          return (
            // Sprint TYDZIEN2.T2.3 (28.05.2026) — ?from=cohort&fromId={id} przekazuje
            // cohort context до strony klienta; client page parsuje + buduje
            // breadcrumb "AI Discovery > Cohorts > {name} > {client}" zamiast
            // domyślnego "Klienci > {client}". `cohortId` уже у props.
            // T2.3.1 BUGFIX (28.05.2026) — split з `?from=cohort/{uuid}` aby
            // uniknąć slash w query value (Next.js Link prefetch fail).
            // Sprint TYDZIEN2 FINAL (28.05.2026) — prefetch={false} per mass-list rule.
            <Link
              href={`/clients/${c.id}?from=cohort&fromId=${cohortId}`}
              className="font-medium hover:underline"
              prefetch={false}
            >
              {c.title}
            </Link>
          )
        },
      },
      {
        id: 'city',
        accessorFn: (row) => row.snapshot?.city ?? '',
        header: createSortableHeader<ClientMemberRow>('Miasto'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.snapshot?.city ?? '—'}</span>
        ),
      },
      {
        id: 'nip',
        accessorFn: (row) => row.snapshot?.nip ?? '',
        header: 'NIP',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.snapshot?.nip ?? '—'}</span>
        ),
      },
      {
        id: 'industry',
        accessorFn: (row) => row.snapshot?.industry ?? '',
        header: createSortableHeader<ClientMemberRow>('Industry'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.snapshot?.industry ?? '—'}</span>
        ),
      },
      {
        id: 'segment',
        accessorFn: (row) => row.snapshot?.segment ?? '',
        header: createSortableHeader<ClientMemberRow>('Segment'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.snapshot?.segment ?? '—'}</span>
        ),
      },
      {
        id: 'notes',
        header: 'Notatka',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          const key = memberKey(r)
          return (
            <NotesCell
              row={r}
              isEditing={editingKey === key}
              isSaving={savingKey === key}
              editValue={editValue}
              onStartEdit={() => startEdit(key, r.notes)}
              onChangeValue={setEditValue}
              onCancel={cancelEdit}
              onSave={() => saveNotes(r, r.snapshot?.title ?? '?')}
            />
          )
        },
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: createSortableHeader<ClientMemberRow>('Status'),
        cell: ({ row }) => {
          const r = row.original
          const status = effectiveStatus(r)
          return (
            <StatusCell
              status={status}
              busy={statusPending}
              onSelect={(s) =>
                handleStatusChange(r, s, r.snapshot?.title ?? '?')
              }
            />
          )
        },
      },
      {
        id: 'added_at',
        accessorFn: (row) => row.added_at,
        header: createSortableHeader<ClientMemberRow>('Dodano'),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(row.original.added_at)}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingKey, editValue, savingKey, statusPending, optimisticStatus],
  )

  // Multi-field global filter (name + nip + miejscowosc) для prospекtів
  const prospectGlobalFilter = useMemo(
    () => createMultiFieldGlobalFilter<ProspectMemberRow>(['name', 'nip', 'miejscowosc']),
    [],
  )
  const clientGlobalFilter = useMemo(
    () => createMultiFieldGlobalFilter<ClientMemberRow>(['title', 'nip', 'city']),
    [],
  )

  // ─── Render ──────────────────────────────────────────────────

  const totalCount = prospects.length + clients.length
  const filterActive = statusFilter !== null

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
                </Link>{' '}
                або{' '}
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
          {/* Prospekti section */}
          <section>
            <h2 className="mb-2 text-sm font-medium">
              Prospekti{' '}
              <span className="text-muted-foreground">({prospects.length})</span>
            </h2>
            {prospects.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-xs text-muted-foreground">
                {filterActive
                  ? `Brak prospektów ze statusem "${statusFilterLabel}".`
                  : 'Brak prospektów.'}
              </div>
            ) : (
              <div className="space-y-2">
                {/* STEP 3.2 — score distribution banner */}
                <ScoreHistogram
                  scores={prospectScores}
                  activeTier={activeScoreTier}
                  onChange={handleScoreTierChange}
                />
                <DataTable
                  columns={prospectColumns}
                  data={prospects}
                  searchPlaceholder="Szukaj: nazwa, NIP, miasto..."
                  getRowId={(row) => memberKey(row)}
                  enableRowSelection
                  rowSelection={prospectRowSelection}
                  onRowSelectionChange={handleProspectSelectionChange}
                  globalFilterFn={prospectGlobalFilter}
                  sorting={prospectsUrlState.sorting}
                  onSortingChange={prospectsUrlState.setSorting}
                  columnFilters={prospectsUrlState.columnFilters}
                  onColumnFiltersChange={prospectsUrlState.setColumnFilters}
                  globalFilter={prospectsUrlState.globalFilter}
                  onGlobalFilterChange={prospectsUrlState.setGlobalFilter}
                  pagination={prospectsUrlState.pagination}
                  onPaginationChange={prospectsUrlState.setPagination}
                />
              </div>
            )}
          </section>

          {/* Klienci section */}
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
              <DataTable
                columns={clientColumns}
                data={clients}
                searchPlaceholder="Szukaj: nazwa, NIP, miasto..."
                getRowId={(row) => memberKey(row)}
                enableRowSelection
                rowSelection={clientRowSelection}
                onRowSelectionChange={handleClientSelectionChange}
                globalFilterFn={clientGlobalFilter}
              />
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

      {/* STEP 3.3 — score drilldown modal. Single instance, controlled. */}
      <ScoreDrilldownModal
        prospect={drilldownProspect}
        onClose={() => setDrilldownProspect(null)}
      />
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
            className={cn('cursor-pointer', s === status && 'font-medium')}
          >
            <Badge
              className={cn('mr-2 text-[10px] font-normal', statusBadgeClass(s))}
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

// ─── MatchScoreBadge — color-coded score з tooltip breakdown ────────
// Sprint S-RANK B-min (13.05.2026)
// Color tiers per Vadym spec:
//   ≥70 = green (emerald) — "dosledni glebiej"
//   50-69 = yellow (amber) — "może być"
//   <50 = grey — "low priority"
// Tooltip shows score_breakdown JSONB (pkd/activity/size/geo/recency/niche
// + ua_founder_boost bonus + penalties).

interface ScoreBreakdown {
  total?: number
  base?: Partial<Record<'pkd' | 'activity' | 'size' | 'geo' | 'recency' | 'niche', number>>
  bonuses?: Record<string, number>
  penalties?: Record<string, number>
  reasons?: string[]
}

function MatchScoreBadge({
  score,
  breakdown,
  productCount,
  onOpenDrilldown,
}: {
  score: number
  breakdown: unknown
  productCount: number
  /** STEP 3.3 — optional click handler → opens drilldown modal. Якщо не
   *  передано, badge поводиться як hover-only tooltip (legacy mode).
   *
   *  FIX #2 (14.05.2026) — раніше button був INSIDE TooltipTrigger asChild
   *  (Radix Slot composed props), і onClick якось не fire'ив. Restructure:
   *  button — OUTERMOST element. Tooltip+TooltipTrigger+Badge — INSIDE
   *  button. Click on button (anywhere в Badge area) → React fires onClick
   *  directly без Slot interception. Hover on Badge → Tooltip portal shows. */
  onOpenDrilldown?: () => void
}) {
  const tierClass =
    score >= 70
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : score >= 50
        ? 'bg-amber-100 text-amber-800 border-amber-300'
        : 'bg-gray-100 text-gray-700 border-gray-300'
  const b = (breakdown && typeof breakdown === 'object' ? breakdown : null) as ScoreBreakdown | null
  const base = b?.base ?? {}
  const bonuses = b?.bonuses ?? {}
  const penalties = b?.penalties ?? {}

  // Tooltip wraps non-interactive Badge (span). Used in обох modes (clickable
  // and read-only). Click handling moved до outer button wrapper if drilldown
  // enabled.
  const tooltipNode = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-semibold tabular-nums',
              onOpenDrilldown
                ? 'cursor-pointer transition-transform hover:scale-105'
                : 'cursor-help',
              tierClass,
            )}
          >
            {score}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs space-y-1 text-xs">
          <div className="font-medium">Algo score: {score}/100</div>
          <div className="text-[10px] text-muted-foreground">
            best з {productCount} {productCount === 1 ? 'produktu' : 'produktów'}
          </div>
          {b && (
            <>
              <div className="mt-1.5 border-t pt-1">
                <div className="font-medium text-[10px] uppercase text-muted-foreground">
                  Składowe
                </div>
                {base.pkd !== undefined && base.pkd > 0 && <div>PKD fit: {base.pkd}</div>}
                {base.activity !== undefined && base.activity > 0 && (
                  <div>Aktywność: {base.activity}</div>
                )}
                {base.size !== undefined && base.size > 0 && <div>Rozmiar: {base.size}</div>}
                {base.geo !== undefined && base.geo > 0 && <div>Geografia: {base.geo}</div>}
                {base.recency !== undefined && base.recency > 0 && (
                  <div>Świeżość: {base.recency}</div>
                )}
                {base.niche !== undefined && base.niche > 0 && (
                  <div>Niche bonus: {base.niche}</div>
                )}
              </div>
              {Object.entries(bonuses).some(([, v]) => v > 0) && (
                <div className="mt-1 border-t pt-1">
                  <div className="font-medium text-[10px] uppercase text-emerald-700">
                    Bonusy
                  </div>
                  {Object.entries(bonuses).map(([k, v]) =>
                    v > 0 ? (
                      <div key={k}>
                        {k}: +{v}
                      </div>
                    ) : null,
                  )}
                </div>
              )}
              {Object.entries(penalties).some(([, v]) => v !== 0) && (
                <div className="mt-1 border-t pt-1">
                  <div className="font-medium text-[10px] uppercase text-rose-700">
                    Penalty
                  </div>
                  {Object.entries(penalties).map(([k, v]) =>
                    v !== 0 ? (
                      <div key={k}>
                        {k}: {v}
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  // FIX #2 — drilldown mode: button at outermost level, Tooltip wrapped inside.
  // Click anywhere в Badge area → React fires button's onClick directly.
  // Tooltip portal renders to body, не conflicts з button hierarchy.
  if (onOpenDrilldown) {
    return (
      <button
        type="button"
        onClick={onOpenDrilldown}
        aria-label={`Score ${score} — kliknij dla szczegółów`}
        className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
      >
        {tooltipNode}
      </button>
    )
  }

  // Read-only mode (no drilldown handler) — render tooltip alone.
  return tooltipNode
}
