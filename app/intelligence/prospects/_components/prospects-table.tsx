'use client'

// app/intelligence/prospects/_components/prospects-table.tsx
// Prospects table — Phase 2.6 / Promt 3.
//
// Sprint S-UX-CORE STEP 4.1 (14.05.2026) — full rewrite на DataTable foundation:
//   - <DataTable> (components/ui/data-table.tsx) replace hand-rolled <Table>
//   - useTableUrlState (lib/table/use-table-url-state.ts) для q/sort/page/size
//   - manualSorting + manualPagination + manualFiltering = ALL server-side
//   - 10 sortable columns (раніше тільки 3)
//   - Search input у DataTable toolbar (раніше відсутній — головна Vadym pain)
//   - Page size 50/100/200/500 selector у footer
//   - Filter toolbar (slider, channels, switches) тепер ПИШЕ до URL → server
//     refetch. Раніше: useMemo on visible 50 rows (incoherent з 2705 pool).
//
// Preserved:
//   - ProspectDetailPanel (row click → side panel detail view)
//   - BulkActionBar (sticky bottom, cohort dropdown, "Add to Clients")
//   - All filter chips на page.tsx (type/UA/client_type) — server-side, untouched

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { DataTable } from '@/components/ui/data-table'
import { useTableUrlState } from '@/lib/table/use-table-url-state'
import { createSortableHeader } from '@/lib/table/table-helpers'

import { ProspectDetailPanel } from './prospect-detail-panel'
import { BulkActionBar, type CohortOption } from './bulk-action-bar'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface ProspectRow {
  id: string
  /** Phase 2.8 (migration 055) made ceidg_id nullable — KRS-only prospekti
   *  не мають CEIDG counterpart. */
  ceidg_id: string | null
  nip: string | null
  regon: string | null
  name: string
  owner_name: string | null
  status: string
  source: string | null
  decision_maker_name?: string | null
  pkd_main: string | null
  pkd_all: string[] | null
  wojewodztwo: string | null
  miejscowosc: string | null
  adres_full: string | null
  email: string | null
  telefon: string | null
  www: string | null
  data_rozpoczecia: string | null
  raw_data: unknown
  sklep_score: number | string | null
  restaurant_score: number | string | null
  catering_score: number | string | null
  cafe_score: number | string | null
  horeca_meta_score: number | string | null
  dominant_channel: string | null
  is_chain_franchise: boolean | null
  chain_brand: string | null
  filter_passed: boolean | null
  filter_exclusion_reason: string | null
  score_breakdown: unknown
  scoring_version: string | null
  has_contact: boolean | null
  // VAT enrichment
  vat_status?: string | null
  vat_registered_date?: string | null
  vat_bank_accounts?: string[] | null
  vat_last_checked?: string | null
  // GUS enrichment
  gus_legal_name?: string | null
  gus_regon?: string | null
  gus_status?: string | null
  registered_date?: string | null
  employee_count_range?: string | null
  pkd_codes?: string[] | null
  gus_last_checked?: string | null
  // KRS enrichment
  krs_number?: string | null
  krs_full_name?: string | null
  krs_legal_form?: string | null
  krs_registration_date?: string | null
  krs_status?: string | null
  krs_management_board?: import('@/app/(dashboard)/_shared/krs-section').KrsBoardMember[] | null
  krs_pkd_with_descriptions?: import('@/app/(dashboard)/_shared/krs-section').KrsPkdEntry[] | null
  krs_last_checked?: string | null
  ua_founders_signal?: {
    detected: boolean
    confidence: 'verified' | 'high' | 'medium' | 'low' | null
    source: 'crbr' | 'heuristic' | null
    names?: string[]
    signals?: string[]
  } | null
}

type Channel = 'sklep' | 'restaurant' | 'catering' | 'cafe' | 'multi'
const ALL_CHANNELS: Channel[] = ['sklep', 'restaurant', 'catering', 'cafe', 'multi']

const CHANNEL_LABEL_PL: Record<Channel, string> = {
  sklep: 'sklep',
  restaurant: 'restauracja',
  catering: 'catering',
  cafe: 'kawiarnia',
  multi: 'multi',
}

const CHANNEL_BADGE_CLASS: Record<Channel, string> = {
  sklep: 'bg-blue-100 text-blue-800 border-transparent',
  restaurant: 'bg-teal-100 text-teal-800 border-transparent',
  catering: 'bg-amber-100 text-amber-800 border-transparent',
  cafe: 'bg-rose-100 text-rose-800 border-transparent',
  multi: 'bg-purple-100 text-purple-800 border-transparent',
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const parsed = Number.parseFloat(v)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Derive display label з row.source + krs_legal_form ILIKE classification. */
function sourceLabel(row: ProspectRow): string {
  if (row.source === 'ceidg') return 'CEIDG (ФОП)'
  if (row.source === 'krs') {
    const lf = row.krs_legal_form?.toUpperCase() ?? ''
    if (lf.includes('OGRANICZON')) return 'KRS (sp. z o.o.)'
    if (lf.includes('AKCYJNA')) return 'KRS (S.A.)'
    return 'KRS (inne)'
  }
  return row.source ?? '?'
}

function sourceBadgeClass(row: ProspectRow): string {
  if (row.source === 'ceidg') return 'bg-emerald-100 text-emerald-800 border-transparent'
  if (row.source === 'krs') {
    const lf = row.krs_legal_form?.toUpperCase() ?? ''
    if (lf.includes('OGRANICZON')) return 'bg-indigo-100 text-indigo-800 border-transparent'
    if (lf.includes('AKCYJNA')) return 'bg-violet-100 text-violet-800 border-transparent'
    return 'bg-slate-100 text-slate-700 border-transparent'
  }
  return 'bg-muted text-muted-foreground border-transparent'
}

function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-700 font-semibold'
  if (score >= 60) return 'text-blue-700 font-semibold'
  if (score >= 40) return 'text-slate-700'
  return 'text-muted-foreground'
}

function getChainTier(p: ProspectRow): 'closed' | 'hybrid' | 'open' | 'unverified' | null {
  if (!p.is_chain_franchise) return null
  const breakdown = p.score_breakdown as
    | { chain?: { loyalty_tier?: string | null; tier_status?: string | null } }
    | null
  const tier = breakdown?.chain?.loyalty_tier
  const status = breakdown?.chain?.tier_status
  if (tier === 'closed' || tier === 'hybrid' || tier === 'open') return tier
  if (status === 'unverified') return 'unverified'
  return null
}

const CHAIN_BADGE_CLASS: Record<string, string> = {
  closed: 'bg-red-100 text-red-800 border-transparent',
  hybrid: 'bg-amber-100 text-amber-800 border-transparent',
  open: 'bg-emerald-100 text-emerald-800 border-transparent',
  unverified: 'bg-slate-100 text-slate-700 border-transparent',
}

// ────────────────────────────────────────────────────────────
// Client filter state (slider, channels, switches)
// STEP 4.1 — лише UI state. Real filtering = server-side через URL params.
// ────────────────────────────────────────────────────────────

interface ClientFilterState {
  scoreMin: number
  scoreMax: number
  channels: Set<Channel>
  hasContact: boolean
  hideClosedChains: boolean
  showExcluded: boolean
}

function parseClientFilterFromUrl(sp: URLSearchParams): ClientFilterState {
  const min = Number.parseInt(sp.get('score_min') ?? '', 10)
  const max = Number.parseInt(sp.get('score_max') ?? '', 10)
  const channelsRaw = sp.get('channels') ?? ''
  const channels = new Set<Channel>(
    channelsRaw
      .split(',')
      .filter((s): s is Channel => ALL_CHANNELS.includes(s as Channel)),
  )
  return {
    scoreMin: Number.isFinite(min) ? Math.max(0, min) : 0,
    scoreMax: Number.isFinite(max) ? Math.min(100, max) : 100,
    channels,
    hasContact: sp.get('has_contact') === 'true',
    hideClosedChains: sp.get('hide_closed') === 'true',
    showExcluded: sp.get('show_excluded') === 'true',
  }
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export interface ProspectsTableProps {
  initialProspects: ProspectRow[]
  cohorts?: CohortOption[]
  /** STEP 4.1 — server-known totals для DataTable manual pagination. */
  totalRowCount: number
  totalPageCount: number
}

export function ProspectsTable({
  initialProspects,
  cohorts = [],
  totalRowCount,
  totalPageCount,
}: ProspectsTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  // ─── URL state (sort/q/page/size) via shared hook ───
  // STEP 4.1 — preserveKeys = всі page-level filter params не вписані у
  // useTableUrlState (так щоб sort/search клiки не стирали filter chips).
  const urlState = useTableUrlState({
    defaultPageSize: 50,
    sortableColumnIds: [
      'name',
      'nip',
      'source',
      'owner_name',
      'miejscowosc',
      'dominant_channel',
      'horeca_meta_score',
      'has_contact',
    ],
    preserveKeys: [
      'type',
      'ua_filter',
      'client_type',
      'score_min',
      'score_max',
      'channels',
      'has_contact',
      'hide_closed',
      'show_excluded',
    ],
  })

  // ─── Client filter toolbar state ───
  // STEP 4.1 — local mirror з URL. Slider drag → setState (immediate UI feedback)
  // → debounced URL write → server refetch. Switches/channels → instant URL write.
  const [clientFilter, setClientFilter] = useState<ClientFilterState>(() =>
    parseClientFilterFromUrl(new URLSearchParams(searchParams.toString())),
  )

  // Sync local state з URL changes (e.g. router.refresh, browser back/forward)
  useEffect(() => {
    setClientFilter(parseClientFilterFromUrl(new URLSearchParams(searchParams.toString())))
  }, [searchParams])

  /** Write client filter changes до URL (preserving sort/q/page/size etc).
   *  Resets ?page= до 1 — filter change може shrink pool < current page * size. */
  const writeClientFilterToUrl = useCallback(
    (next: ClientFilterState) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page') // reset on filter change

      // Score range
      if (next.scoreMin === 0) params.delete('score_min')
      else params.set('score_min', String(next.scoreMin))
      if (next.scoreMax === 100) params.delete('score_max')
      else params.set('score_max', String(next.scoreMax))

      // Channels CSV
      if (next.channels.size === 0) params.delete('channels')
      else params.set('channels', Array.from(next.channels).join(','))

      // Switches
      if (!next.hasContact) params.delete('has_contact')
      else params.set('has_contact', 'true')
      if (!next.hideClosedChains) params.delete('hide_closed')
      else params.set('hide_closed', 'true')
      if (!next.showExcluded) params.delete('show_excluded')
      else params.set('show_excluded', 'true')

      const s = params.toString()
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname],
  )

  // Debounced URL write для slider (avoid spam during drag)
  useEffect(() => {
    const id = setTimeout(() => writeClientFilterToUrl(clientFilter), 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFilter.scoreMin, clientFilter.scoreMax])

  // ─── Selection state (bridge ↔ TanStack RowSelection) ───
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const rowSelection = useMemo<RowSelectionState>(() => {
    const out: RowSelectionState = {}
    for (const id of selected) out[id] = true
    return out
  }, [selected])
  const handleRowSelectionChange = (next: RowSelectionState) => {
    const out = new Set<string>()
    for (const [k, v] of Object.entries(next)) {
      if (v) out.add(k)
    }
    setSelected(out)
  }
  const clearSelection = () => setSelected(new Set())

  // ─── Detail panel state ───
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailProspect = useMemo(
    () => initialProspects.find((p) => p.id === detailId) ?? null,
    [initialProspects, detailId],
  )

  // ─── ColumnDef ───
  const columns = useMemo<ColumnDef<ProspectRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Zaznacz wszystkie"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label={`Zaznacz ${row.original.name}`}
            // Stop click з cell propagating до row (row click → detail panel)
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: createSortableHeader<ProspectRow>('Nazwa'),
        cell: ({ row }) => {
          const p = row.original
          return (
            <button
              type="button"
              onClick={() => setDetailId(p.id)}
              className="text-left font-medium hover:text-emerald-700 hover:underline"
            >
              <span className="inline-flex items-center gap-1.5">
                {p.name}
                {p.ua_founders_signal?.detected && (
                  <span
                    className="inline-flex items-center rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-700"
                    title={
                      p.ua_founders_signal.source === 'crbr'
                        ? `UA-власники (verified з CRBR): ${(p.ua_founders_signal.names ?? []).join(', ')}`
                        : `UA-likely (heuristic): ${(p.ua_founders_signal.names ?? []).join(', ')}`
                    }
                  >
                    🇺🇦{' '}
                    {p.ua_founders_signal.confidence === 'verified' ? 'verified' : 'likely'}
                  </span>
                )}
              </span>
            </button>
          )
        },
      },
      {
        id: 'nip',
        accessorKey: 'nip',
        header: createSortableHeader<ProspectRow>('NIP'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.nip ?? '—'}
          </span>
        ),
      },
      {
        id: 'source',
        accessorKey: 'source',
        header: createSortableHeader<ProspectRow>('Źródło'),
        cell: ({ row }) => {
          const p = row.original
          return (
            <Badge variant="outline" className={cn('text-[10px]', sourceBadgeClass(p))}>
              {sourceLabel(p)}
            </Badge>
          )
        },
      },
      {
        id: 'owner_name',
        accessorKey: 'owner_name',
        header: createSortableHeader<ProspectRow>('Właściciel'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.owner_name ?? '—'}
          </span>
        ),
      },
      {
        id: 'miejscowosc',
        accessorKey: 'miejscowosc',
        header: createSortableHeader<ProspectRow>('Miasto'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.miejscowosc ?? '—'}</span>
        ),
      },
      {
        id: 'dominant_channel',
        accessorKey: 'dominant_channel',
        header: createSortableHeader<ProspectRow>('Kanał'),
        cell: ({ row }) => {
          const ch = (row.original.dominant_channel ?? null) as Channel | null
          if (!ch || !CHANNEL_LABEL_PL[ch]) {
            return <span className="text-xs text-muted-foreground">—</span>
          }
          return (
            <Badge variant="outline" className={cn('text-xs', CHANNEL_BADGE_CLASS[ch])}>
              {CHANNEL_LABEL_PL[ch]}
            </Badge>
          )
        },
      },
      {
        id: 'horeca_meta_score',
        accessorKey: 'horeca_meta_score',
        header: createSortableHeader<ProspectRow>('Score'),
        sortDescFirst: true,
        cell: ({ row }) => {
          const p = row.original
          const meta = num(p.horeca_meta_score)
          return (
            <span className={cn('tabular-nums', scoreColorClass(meta))}>
              {p.horeca_meta_score === null ? '—' : meta.toFixed(0)}
            </span>
          )
        },
      },
      {
        id: 'has_contact',
        accessorKey: 'has_contact',
        header: createSortableHeader<ProspectRow>('Kontakt'),
        cell: ({ row }) =>
          row.original.has_contact ? (
            <span className="text-emerald-600">✓</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'chain',
        header: 'Sieć',
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original
          const tier = getChainTier(p)
          if (!p.is_chain_franchise || !p.chain_brand || !tier) return null
          return (
            <Badge variant="outline" className={cn('text-xs', CHAIN_BADGE_CLASS[tier])}>
              {p.chain_brand} · {tier}
            </Badge>
          )
        },
      },
    ],
    // setDetailId is stable (useState setter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ─── Bulk actions ───
  const handleAddToClients = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startTransition(async () => {
      try {
        const res = await fetch('/api/prospects/add-to-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospect_ids: ids }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? 'Błąd dodawania klientów')
          return
        }
        const { added, skipped_duplicates } = data
        toast.success(
          `Dodano ${added} klientów${
            skipped_duplicates > 0 ? ` (${skipped_duplicates} duplikatów pominięto)` : ''
          }`,
        )
        clearSelection()
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Błąd sieci')
      }
    })
  }

  // ─── Filter toolbar (slider + channels + switches) ───
  const toggleChannel = (ch: Channel) => {
    setClientFilter((f) => {
      const next = new Set(f.channels)
      if (next.has(ch)) next.delete(ch)
      else next.add(ch)
      const updated = { ...f, channels: next }
      // Instant URL write для channels (no slider debounce)
      writeClientFilterToUrl(updated)
      return updated
    })
  }

  const updateSwitch = (key: 'hasContact' | 'hideClosedChains' | 'showExcluded', value: boolean) => {
    setClientFilter((f) => {
      const updated = { ...f, [key]: value }
      writeClientFilterToUrl(updated)
      return updated
    })
  }

  const resetClientFilters = () => {
    const reset: ClientFilterState = {
      scoreMin: 0,
      scoreMax: 100,
      channels: new Set(),
      hasContact: false,
      hideClosedChains: false,
      showExcluded: false,
    }
    setClientFilter(reset)
    writeClientFilterToUrl(reset)
  }

  const hasActiveClientFilter =
    clientFilter.scoreMin > 0 ||
    clientFilter.scoreMax < 100 ||
    clientFilter.channels.size > 0 ||
    clientFilter.hasContact ||
    clientFilter.hideClosedChains ||
    clientFilter.showExcluded

  // ─── Render ───
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {/* Client filter toolbar — slider + channels + switches.
          Pisze URL params → server refetch via Next.js navigation. */}
      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-4">
          {/* Score range slider */}
          <div className="flex min-w-[240px] flex-1 items-center gap-3">
            <Label className="shrink-0 text-xs text-muted-foreground">
              Score: {clientFilter.scoreMin}–{clientFilter.scoreMax}
            </Label>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[clientFilter.scoreMin, clientFilter.scoreMax]}
              onValueChange={(v) =>
                setClientFilter((f) => ({
                  ...f,
                  scoreMin: v[0] ?? 0,
                  scoreMax: v[1] ?? 100,
                }))
              }
              className="flex-1"
            />
          </div>

          {/* Channel pills */}
          <div className="flex items-center gap-1">
            {ALL_CHANNELS.map((ch) => {
              const active = clientFilter.channels.has(ch)
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    active
                      ? CHANNEL_BADGE_CLASS[ch] + ' shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {CHANNEL_LABEL_PL[ch]}
                </button>
              )
            })}
          </div>

          {/* Has contact */}
          <div className="flex items-center gap-2">
            <Switch
              id="has-contact"
              checked={clientFilter.hasContact}
              onCheckedChange={(v) => updateSwitch('hasContact', v)}
            />
            <Label htmlFor="has-contact" className="cursor-pointer text-xs">
              Tylko z kontaktem
            </Label>
          </div>

          {/* Hide closed chains */}
          <div className="flex items-center gap-2">
            <Switch
              id="hide-closed"
              checked={clientFilter.hideClosedChains}
              onCheckedChange={(v) => updateSwitch('hideClosedChains', v)}
            />
            <Label htmlFor="hide-closed" className="cursor-pointer text-xs">
              Ukryj closed chains
            </Label>
          </div>

          {/* Show excluded */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-excluded"
              checked={clientFilter.showExcluded}
              onCheckedChange={(v) => updateSwitch('showExcluded', v)}
            />
            <Label htmlFor="show-excluded" className="cursor-pointer text-xs">
              Pokaż wykluczone
            </Label>
          </div>

          {hasActiveClientFilter && (
            <Button
              variant="link"
              size="sm"
              onClick={resetClientFilters}
              className="ml-auto h-auto p-0 text-xs text-muted-foreground"
            >
              Resetuj filtry
            </Button>
          )}
        </div>
      </div>

      {/* DataTable з manual modes (server-side everything) */}
      <DataTable
        columns={columns}
        data={initialProspects}
        searchPlaceholder="Szukaj: nazwa, NIP, miasto..."
        getRowId={(row) => row.id}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={handleRowSelectionChange}
        sorting={urlState.sorting}
        onSortingChange={urlState.setSorting}
        globalFilter={urlState.globalFilter}
        onGlobalFilterChange={urlState.setGlobalFilter}
        pagination={urlState.pagination}
        onPaginationChange={urlState.setPagination}
        manualSorting
        manualPagination
        manualFiltering
        pageCount={totalPageCount}
        rowCount={totalRowCount}
        pageSizeOptions={[50, 100, 200, 500]}
      />

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          cohorts={cohorts}
          onAddToClients={handleAddToClients}
          onClear={clearSelection}
          pending={pending}
        />
      )}

      {/* Detail panel */}
      <ProspectDetailPanel
        prospect={detailProspect}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}

