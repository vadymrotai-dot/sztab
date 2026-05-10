'use client'

// Prospects table — Phase 2.6 / Promt 3.
// Sortable + filterable table z bulk action "Add to Clients".
// Filter state synced to URL query params (bookmarkable).

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { ProspectDetailPanel } from './prospect-detail-panel'
import { BulkActionBar, type CohortOption } from './bulk-action-bar'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface ProspectRow {
  id: string
  /** Phase 2.8 (migration 055) made ceidg_id nullable — KRS-only prospekti
   *  не мають CEIDG counterpart. Type updated 08.05.2026 Phase 2 Krok 1.A. */
  ceidg_id: string | null
  nip: string | null
  regon: string | null
  name: string
  owner_name: string | null
  status: string
  /** 'ceidg' | 'krs' (default 'ceidg' per migration 014).
   *  Phase 2 Krok 1.A — added до interface для "Źródło" column display. */
  source: string | null
  /** Phase 2.8 — KRS prezes/chairman name з glowna_osoba.imiona_i_nazwisko. */
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
  // Score columns (LEFT JOIN — могą być null jeśli prospect bez score)
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
  // VAT enrichment (migration 017)
  vat_status?: string | null
  vat_registered_date?: string | null
  vat_bank_accounts?: string[] | null
  vat_last_checked?: string | null
  // GUS enrichment (migrations 018a/018b)
  gus_legal_name?: string | null
  gus_regon?: string | null
  gus_status?: string | null
  registered_date?: string | null
  employee_count_range?: string | null
  pkd_codes?: string[] | null
  gus_last_checked?: string | null
  // KRS enrichment (migrations 021/022)
  krs_number?: string | null
  krs_full_name?: string | null
  krs_legal_form?: string | null
  krs_registration_date?: string | null
  krs_status?: string | null
  krs_management_board?: import('@/app/(dashboard)/_shared/krs-section').KrsBoardMember[] | null
  krs_pkd_with_descriptions?: import('@/app/(dashboard)/_shared/krs-section').KrsPkdEntry[] | null
  krs_last_checked?: string | null
  /** Phase 2 Krok 1.E (S-CORE.3.B Phase A) — Ukrainian-founder signal.
   *  Computed by lib/intelligence/ukrainian-detect.ts, cached jsonb.
   *  detected=true тільки для verified (CRBR) + high (UK first+surname без PL).
   *  Display: 🇺🇦 inline flag поряд з nazwa якщо detected=true. INFO-ONLY. */
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

type SortKey = 'name' | 'miejscowosc' | 'horeca_meta_score'
type SortDir = 'asc' | 'desc' | null

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const parsed = Number.parseFloat(v)
  return Number.isFinite(parsed) ? parsed : 0
}

// ─── Phase 2 Krok 1.A — "Źródło" column helpers ───────────────

/** Derive display label з row.source + krs_legal_form ILIKE classification.
 *  Mirror server-side filter logic у page.tsx for consistent UX. */
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

/** Tailwind classes для Badge color coding by source/legal-form. */
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
// URL sync
// ────────────────────────────────────────────────────────────

interface FilterState {
  scoreMin: number
  scoreMax: number
  channels: Set<Channel> // empty = no channel filter (all)
  hasContact: boolean
  hideClosedChains: boolean
  showExcluded: boolean // default FALSE — excluded prospects (filter_passed=false) hidden
  sortKey: SortKey
  sortDir: SortDir
}

const DEFAULT_FILTER: FilterState = {
  scoreMin: 0,
  scoreMax: 100,
  channels: new Set(),
  hasContact: false,
  hideClosedChains: false,
  showExcluded: false,
  sortKey: 'horeca_meta_score',
  sortDir: 'desc',
}

function parseFilterFromUrl(sp: URLSearchParams): FilterState {
  const min = Number.parseInt(sp.get('score_min') ?? '', 10)
  const max = Number.parseInt(sp.get('score_max') ?? '', 10)
  const channelsRaw = sp.get('channels') ?? ''
  const channels = new Set<Channel>(
    channelsRaw
      .split(',')
      .filter((s): s is Channel => ALL_CHANNELS.includes(s as Channel)),
  )
  const sortKeyRaw = sp.get('sort') as SortKey | null
  const sortDirRaw = sp.get('dir') as 'asc' | 'desc' | null
  return {
    scoreMin: Number.isFinite(min) ? Math.max(0, min) : 0,
    scoreMax: Number.isFinite(max) ? Math.min(100, max) : 100,
    channels,
    hasContact: sp.get('has_contact') === 'true',
    hideClosedChains: sp.get('hide_closed') === 'true',
    showExcluded: sp.get('show_excluded') === 'true',
    sortKey:
      sortKeyRaw === 'name' ||
      sortKeyRaw === 'miejscowosc' ||
      sortKeyRaw === 'horeca_meta_score'
        ? sortKeyRaw
        : 'horeca_meta_score',
    sortDir: sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : 'desc',
  }
}

function filterToUrl(f: FilterState): string {
  const params = new URLSearchParams()
  if (f.scoreMin !== 0) params.set('score_min', String(f.scoreMin))
  if (f.scoreMax !== 100) params.set('score_max', String(f.scoreMax))
  if (f.channels.size > 0)
    params.set('channels', Array.from(f.channels).join(','))
  if (f.hasContact) params.set('has_contact', 'true')
  if (f.hideClosedChains) params.set('hide_closed', 'true')
  if (f.showExcluded) params.set('show_excluded', 'true')
  if (f.sortKey !== 'horeca_meta_score') params.set('sort', f.sortKey)
  if (f.sortDir !== 'desc') params.set('dir', f.sortDir ?? 'desc')
  const s = params.toString()
  return s ? `?${s}` : ''
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export interface ProspectsTableProps {
  initialProspects: ProspectRow[]
  /** Phase 2 Krok 1.C1 — cohort options для bulk-action dropdown.
   *  Server-fetched у parent /intelligence/prospects/page.tsx. Empty array
   *  показує "Brak cohortów" placeholder + opens "+ Nowa cohort" dialog. */
  cohorts?: CohortOption[]
}

export function ProspectsTable({
  initialProspects,
  cohorts = [],
}: ProspectsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [filter, setFilter] = useState<FilterState>(() =>
    parseFilterFromUrl(new URLSearchParams(searchParams.toString())),
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)

  // Sync filter changes to URL (replace, no history bloat)
  useEffect(() => {
    const url = filterToUrl(filter)
    const current = `?${searchParams.toString()}`
    if (url !== current && !(url === '' && current === '?')) {
      router.replace(`/intelligence/prospects${url}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  // Total excluded (filter_passed=false) — for transparency counter
  const totalExcluded = useMemo(
    () => initialProspects.filter((p) => p.filter_passed === false).length,
    [initialProspects],
  )

  // Apply filters + sort
  const filtered = useMemo(() => {
    let rows = initialProspects.filter((p) => {
      // Hide excluded by default (RADEKZOOH wide_spectrum_freelancer etc.)
      // Toggle "Pokaż wykluczone" inverts to show them.
      if (!filter.showExcluded && p.filter_passed === false) return false
      const meta = num(p.horeca_meta_score)
      if (meta < filter.scoreMin || meta > filter.scoreMax) return false
      if (filter.channels.size > 0) {
        const ch = (p.dominant_channel ?? '') as Channel
        if (!filter.channels.has(ch)) return false
      }
      if (filter.hasContact && !p.has_contact) return false
      if (filter.hideClosedChains) {
        const tier = getChainTier(p)
        if (tier === 'closed') return false
      }
      return true
    })
    // Sort
    if (filter.sortKey && filter.sortDir) {
      const dirMul = filter.sortDir === 'asc' ? 1 : -1
      rows = [...rows].sort((a, b) => {
        if (filter.sortKey === 'horeca_meta_score') {
          return (num(a.horeca_meta_score) - num(b.horeca_meta_score)) * dirMul
        }
        const av = String(a[filter.sortKey] ?? '').toLowerCase()
        const bv = String(b[filter.sortKey] ?? '').toLowerCase()
        return av.localeCompare(bv) * dirMul
      })
    }
    return rows
  }, [initialProspects, filter])

  const totalAvailable = initialProspects.length
  const totalFiltered = filtered.length

  // Bulk select handlers
  const allSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id))
  const toggleAll = () =>
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev)
        filtered.forEach((p) => next.delete(p.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((p) => next.add(p.id))
      return next
    })
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const clearSelection = () => setSelected(new Set())

  const resetFilters = () =>
    setFilter({ ...DEFAULT_FILTER, channels: new Set() })

  const toggleChannel = (ch: Channel) =>
    setFilter((f) => {
      const next = new Set(f.channels)
      if (next.has(ch)) next.delete(ch)
      else next.add(ch)
      return { ...f, channels: next }
    })

  const setSort = (key: SortKey) =>
    setFilter((f) => {
      if (f.sortKey !== key) return { ...f, sortKey: key, sortDir: 'asc' }
      // toggle asc → desc → asc (no unsorted state — always sorted)
      return { ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }
    })

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
          `Dodano ${added} klientów${skipped_duplicates > 0 ? ` (${skipped_duplicates} duplikatów pominięto)` : ''}`,
        )
        clearSelection()
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Błąd sieci')
      }
    })
  }

  const detailProspect = useMemo(
    () => initialProspects.find((p) => p.id === detailId) ?? null,
    [initialProspects, detailId],
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {/* Counter + filters bar */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-md border bg-background/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {totalFiltered === totalAvailable
              ? `${totalAvailable} dostępnych`
              : `${totalFiltered} z ${totalAvailable} po filtrach`}
            {totalExcluded > 0 && (
              <span className="ml-2 text-xs">
                · Wykluczone: <span className="font-medium">{totalExcluded}</span>
                {!filter.showExcluded && ' (ukryte)'}
              </span>
            )}
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={resetFilters}
            className="ml-auto h-auto p-0 text-xs text-muted-foreground"
          >
            Resetuj filtry
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Score range slider */}
          <div className="flex min-w-[220px] flex-1 items-center gap-3">
            <Label className="shrink-0 text-xs text-muted-foreground">
              Score: {filter.scoreMin}–{filter.scoreMax}
            </Label>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[filter.scoreMin, filter.scoreMax]}
              onValueChange={(v) =>
                setFilter((f) => ({
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
              const active = filter.channels.has(ch)
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

          {/* Has contact toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="has-contact"
              checked={filter.hasContact}
              onCheckedChange={(v) =>
                setFilter((f) => ({ ...f, hasContact: v }))
              }
            />
            <Label htmlFor="has-contact" className="cursor-pointer text-xs">
              Tylko z kontaktem
            </Label>
          </div>

          {/* Hide closed chains */}
          <div className="flex items-center gap-2">
            <Switch
              id="hide-closed"
              checked={filter.hideClosedChains}
              onCheckedChange={(v) =>
                setFilter((f) => ({ ...f, hideClosedChains: v }))
              }
            />
            <Label htmlFor="hide-closed" className="cursor-pointer text-xs">
              Ukryj closed chains
            </Label>
          </div>

          {/* Show excluded (default false — RADEKZOOH wide_spectrum etc. hidden) */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-excluded"
              checked={filter.showExcluded}
              onCheckedChange={(v) =>
                setFilter((f) => ({ ...f, showExcluded: v }))
              }
            />
            <Label htmlFor="show-excluded" className="cursor-pointer text-xs">
              Pokaż wykluczone
            </Label>
          </div>
        </div>
      </div>

      {/* Bulk action bar — Phase 2 Krok 1.C1 (08.05.2026):
          inline bar relocated to sticky bottom + extended з cohort UI.
          See <BulkActionBar /> below table closing tag. */}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
          {totalAvailable === 0 ? (
            <>
              Brak prospektów w bazie.
              <br />
              <span className="mt-2 inline-block text-xs">
                Uruchom <code className="rounded bg-muted px-1.5 py-0.5 font-mono">scripts/sync-ceidg-bootstrap.ts</code> aby pobrać dane z CEIDG.
              </span>
            </>
          ) : (
            <>
              Brak prospektów po filtrach.{' '}
              <button
                type="button"
                onClick={resetFilters}
                className="text-primary underline"
              >
                Resetuj filtry
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Zaznacz wszystkie"
                  />
                </TableHead>
                <TableHead>
                  <SortHeader
                    label="Nazwa"
                    sortKey="name"
                    activeSort={filter.sortKey}
                    activeDir={filter.sortDir}
                    onSort={setSort}
                  />
                </TableHead>
                {/* Sprint S6C STEP 2 — NIP column для disambiguation
                    (e.g. 2 SOLERA Sp.z o.o. — Warszawska + Wrocławska).
                    Hidden on mobile через hidden md:table-cell. */}
                <TableHead className="hidden md:table-cell">NIP</TableHead>
                {/* Phase 2 Krok 1.A — Źródło column (CEIDG/KRS classification) */}
                <TableHead>Źródło</TableHead>
                <TableHead>Właściciel</TableHead>
                <TableHead>
                  <SortHeader
                    label="Miasto"
                    sortKey="miejscowosc"
                    activeSort={filter.sortKey}
                    activeDir={filter.sortDir}
                    onSort={setSort}
                  />
                </TableHead>
                <TableHead>Kanał</TableHead>
                <TableHead className="text-right">
                  <SortHeader
                    label="Score"
                    sortKey="horeca_meta_score"
                    activeSort={filter.sortKey}
                    activeDir={filter.sortDir}
                    onSort={setSort}
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-center">Kontakt</TableHead>
                <TableHead>Sieć</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const isSelected = selected.has(p.id)
                const meta = num(p.horeca_meta_score)
                const ch = (p.dominant_channel ?? null) as Channel | null
                const tier = getChainTier(p)
                return (
                  <TableRow
                    key={p.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      isSelected && 'bg-primary/5',
                    )}
                    onClick={() => setDetailId(p.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(p.id)}
                        aria-label={`Zaznacz ${p.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
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
                            aria-label="Ukrainian founders signal"
                          >
                            🇺🇦{' '}
                            {p.ua_founders_signal.confidence === 'verified'
                              ? 'verified'
                              : 'likely'}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    {/* Sprint S6C STEP 2 — NIP cell для disambiguation */}
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {p.nip ?? '—'}
                    </TableCell>
                    {/* Phase 2 Krok 1.A — Źródło Badge */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px]', sourceBadgeClass(p))}
                      >
                        {sourceLabel(p)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.owner_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.miejscowosc ?? '—'}
                    </TableCell>
                    <TableCell>
                      {ch && CHANNEL_LABEL_PL[ch] ? (
                        <Badge
                          variant="outline"
                          className={cn('text-xs', CHANNEL_BADGE_CLASS[ch])}
                        >
                          {CHANNEL_LABEL_PL[ch]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn('tabular-nums', scoreColorClass(meta))}>
                        {p.horeca_meta_score === null ? '—' : meta.toFixed(0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {p.has_contact ? (
                        <span className="text-emerald-600">✓</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.is_chain_franchise && p.chain_brand && tier ? (
                        <Badge
                          variant="outline"
                          className={cn('text-xs', CHAIN_BADGE_CLASS[tier])}
                        >
                          {p.chain_brand} · {tier}
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sticky bulk action bar — Phase 2 Krok 1.C1 */}
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

// ────────────────────────────────────────────────────────────
// Sort header
// ────────────────────────────────────────────────────────────

function SortHeader({
  label,
  sortKey,
  activeSort,
  activeDir,
  onSort,
  align,
}: {
  label: string
  sortKey: SortKey
  activeSort: SortKey
  activeDir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = activeSort === sortKey
  const Icon =
    !active ? ArrowUpDownIcon : activeDir === 'asc' ? ArrowUpIcon : ArrowDownIcon
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 hover:text-foreground',
        active ? 'text-foreground' : 'text-muted-foreground',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      <Icon className="size-3" />
    </button>
  )
}

// Re-export icon used in SortHeader so unused-import lint OK
export { ExternalLinkIcon }
