'use client'

// Sprint O Phase 5 — wrapper з tabs (Klienci/Prospекti/Wszystko),
// chip filters, bulk selection, "Akcje grupowe" dropdown, +Dodaj firmę CTA.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChevronDownIcon,
  SearchIcon,
  PlusIcon,
  UploadIcon,
  MoreHorizontalIcon,
} from 'lucide-react'
import { ClientsTable } from '@/components/clients/clients-table'
import { AddCompanyButton } from '@/components/clients/add-company-button'
import {
  BulkActionBar,
  type CohortOption,
} from '@/components/clients/bulk-action-bar'
import type { Client } from '@/lib/types'

export interface UnifiedRow {
  type: 'client' | 'prospect'
  id: string
  name: string
  nip: string | null
  city: string | null
  region: string | null
  industry: string | null
  status: string | null
  has_contact: boolean
  top_match_score: number | null
}

interface Props {
  clients: Array<Client & { entity_type?: 'client' | 'prospect' }>
  unifiedRows: UnifiedRow[]
  /** Phase 2 Krok 1.C2 — cohort options для bulk-action dropdown.
   *  Server-fetched у parent app/(dashboard)/clients/page.tsx. */
  cohorts?: CohortOption[]
}

const TABS = [
  { value: 'klienci', label: 'Klienci' },
  { value: 'prospекti', label: 'Prospекti' },
  { value: 'wszystko', label: 'Wszystko' },
]

export function ClientsHub({ clients, unifiedRows, cohorts = [] }: Props) {
  const clientCount = unifiedRows.filter((r) => r.type === 'client').length
  const prospectCount = unifiedRows.filter((r) => r.type === 'prospect').length
  // Subset of clients[] with entity_type='client' для existing ClientsTable
  const onlyClients = clients.filter((c) => (c.entity_type ?? 'client') === 'client')
  const router = useRouter()
  const params = useSearchParams()
  const tab = params.get('tab') ?? 'klienci'

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Chip filters
  const [onlyWithContact, setOnlyWithContact] = useState(false)
  const [onlyHighMatch, setOnlyHighMatch] = useState(false)
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false)
  const [activeIndustries, setActiveIndustries] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'created'>('score')

  // Industry options derived from clients data (Sprint Q FIX C — moved
  // от 8 inline chips → popover, no need to cap at 20 anymore)
  const industryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of unifiedRows) if (r.industry?.trim()) set.add(r.industry)
    return Array.from(set).sort()
  }, [unifiedRows])

  // Bulk selection (across all rows у aktywny tab)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectedCount = selected.size

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  // Filter unified rows for prospекti / wszystko tabs
  const filteredUnified = useMemo(() => {
    let rows: UnifiedRow[] = unifiedRows
    if (tab === 'prospекti') rows = rows.filter((r) => r.type === 'prospect')
    else if (tab === 'klienci') rows = rows.filter((r) => r.type === 'client')
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.nip ?? '').includes(q) ||
          (r.city ?? '').toLowerCase().includes(q),
      )
    }
    if (onlyWithContact) rows = rows.filter((r) => r.has_contact)
    if (onlyHighMatch) rows = rows.filter((r) => (r.top_match_score ?? 0) >= 70)
    if (onlyNeedsReview) rows = rows.filter((r) => r.status === 'pending')
    if (activeIndustries.size > 0) {
      rows = rows.filter((r) => r.industry && activeIndustries.has(r.industry))
    }
    // Sort
    if (sortBy === 'score') {
      rows = [...rows].sort((a, b) => (b.top_match_score ?? 0) - (a.top_match_score ?? 0))
    } else if (sortBy === 'name') {
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    }
    return rows
  }, [unifiedRows, tab, searchQuery, onlyWithContact, onlyHighMatch, onlyNeedsReview, activeIndustries, sortBy])

  // Filter onlyClients (Klienci tab) by search query
  const filteredOnlyClients = useMemo(() => {
    if (!searchQuery.trim()) return onlyClients
    const q = searchQuery.trim().toLowerCase()
    return onlyClients.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.nip ?? '').includes(q) ||
        (c.city ?? '').toLowerCase().includes(q),
    )
  }, [onlyClients, searchQuery])

  function toggleIndustry(name: string) {
    setActiveIndustries((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function navigateTab(t: string) {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    router.replace(`/clients?${next.toString()}`)
    clearSelection()
  }

  // S4 Phase 2: bulk actions handled by BulkActionBar component.

  return (
    <div className="flex flex-col">
      {/* S4 Phase 2A: top bar з search prominent + Add primary + Import + ⋯ */}
      <div className="flex items-center gap-3 border-b bg-white px-6 py-3">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#888]" />
          <Input
            type="search"
            placeholder="Szukaj firmy, NIP lub miasta…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AddCompanyButton />
          <Button
            size="sm"
            variant="outline"
            onClick={() => alert('Importuj CSV — wkrótce (Sprint S5)')}
          >
            <UploadIcon className="mr-1.5 size-3.5" />
            Importuj CSV
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label="Więcej akcji">
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>Eksportuj wszystko (CSV) — soon</DropdownMenuItem>
              <DropdownMenuItem disabled>Konfiguracja kolumn — soon</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-end justify-between border-b px-6">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((t) => {
            const active = t.value === tab
            const count =
              t.value === 'klienci'
                ? clientCount
                : t.value === 'prospекti'
                  ? prospectCount
                  : unifiedRows.length
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => navigateTab(t.value)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                }`}
              >
                {t.label}
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {count}
                </Badge>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Chip filters */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-6 py-3">
        <span className="text-xs font-medium text-muted-foreground">Filtry:</span>
        <ChipToggle
          label="Tylko z kontaktem"
          active={onlyWithContact}
          onChange={() => setOnlyWithContact((v) => !v)}
        />
        <ChipToggle
          label="Wysokie dopasowanie (≥70)"
          active={onlyHighMatch}
          onChange={() => setOnlyHighMatch((v) => !v)}
        />
        <ChipToggle
          label="Wymaga review"
          active={onlyNeedsReview}
          onChange={() => setOnlyNeedsReview((v) => !v)}
        />
        {industryOptions.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-xs transition flex items-center gap-1 ${
                  activeIndustries.size > 0
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-muted-foreground/30 hover:bg-muted'
                }`}
              >
                Branża
                {activeIndustries.size > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 min-w-[18px] px-1.5 text-[10px]">
                    {activeIndustries.size}
                  </Badge>
                )}
                <ChevronDownIcon className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-2" align="start">
              <div className="max-h-[280px] space-y-1 overflow-auto">
                {industryOptions.map((ind) => {
                  const checked = activeIndustries.has(ind)
                  return (
                    <label
                      key={ind}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleIndustry(ind)}
                      />
                      <span className="flex-1 truncate">{ind}</span>
                    </label>
                  )
                })}
              </div>
              {activeIndustries.size > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveIndustries(new Set())}
                  className="mt-1 w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  Wyczyść wybór ({activeIndustries.size})
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}
        <span className="ml-2 text-xs text-muted-foreground">Sort:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'score' | 'name' | 'created')}
          className="rounded-md border bg-background px-2 py-1 text-xs"
        >
          <option value="score">Score (DESC)</option>
          <option value="name">Nazwa (A-Z)</option>
          <option value="created">Data utworzenia</option>
        </select>

        {/* Selection count moved to BulkActionBar (sticky bottom). */}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto pb-20">
        {tab === 'klienci' && (
          <ClientsTable
            clients={filteredOnlyClients}
            selected={selected}
            onToggleSelect={toggleOne}
            onToggleSelectAll={(ids) => {
              setSelected((prev) => {
                const next = new Set(prev)
                const all = ids.every((id) => next.has(id))
                if (all) ids.forEach((id) => next.delete(id))
                else ids.forEach((id) => next.add(id))
                return next
              })
            }}
          />
        )}
        {tab === 'prospекti' && (
          <UnifiedTable
            rows={filteredUnified}
            selected={selected}
            onToggle={toggleOne}
            onSelectAll={(rows) => {
              setSelected((prev) => {
                const next = new Set(prev)
                const all = rows.every((r) => next.has(r.id))
                if (all) rows.forEach((r) => next.delete(r.id))
                else rows.forEach((r) => next.add(r.id))
                return next
              })
            }}
          />
        )}
        {tab === 'wszystko' && (
          <UnifiedTable
            rows={filteredUnified}
            selected={selected}
            onToggle={toggleOne}
            onSelectAll={(rows) => {
              setSelected((prev) => {
                const next = new Set(prev)
                const all = rows.every((r) => next.has(r.id))
                if (all) rows.forEach((r) => next.delete(r.id))
                else rows.forEach((r) => next.add(r.id))
                return next
              })
            }}
          />
        )}
      </div>

      {/* S4 Phase 2B: BulkActionBar appears when ≥1 row selected.
          Phase 2 Krok 1.C2: pass cohorts + filtered clientTypedSelectedIds
          (entity_type='client' subset тільки) для cohort dropdown. */}
      {selectedCount > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          clientTypedSelectedIds={unifiedRows
            .filter((r) => r.type === 'client' && selected.has(r.id))
            .map((r) => r.id)}
          cohorts={cohorts}
          onClear={clearSelection}
        />
      )}
    </div>
  )
}

function ChipToggle({
  label,
  active,
  onChange,
}: {
  label: string
  active: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? 'border-orange-400 bg-orange-50 text-orange-700'
          : 'border-muted-foreground/30 hover:bg-muted'
      }`}
    >
      {label}
    </button>
  )
}

function UnifiedTable({
  rows,
  selected,
  onToggle,
  onSelectAll,
}: {
  rows: UnifiedRow[]
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectAll: (rows: UnifiedRow[]) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-12 text-center text-sm text-muted-foreground m-6">
        Brak wyników dla wybranych filtrów.
      </div>
    )
  }
  const allChecked = rows.every((r) => selected.has(r.id))
  const someChecked = !allChecked && rows.some((r) => selected.has(r.id))
  return (
    <div className="overflow-x-auto p-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[42px]">
              <Checkbox
                checked={allChecked || (someChecked ? 'indeterminate' : false)}
                onCheckedChange={() => onSelectAll(rows)}
              />
            </TableHead>
            <TableHead>Firma</TableHead>
            <TableHead>NIP</TableHead>
            <TableHead>Lokalizacja</TableHead>
            <TableHead>Branża/PKD</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Top score</TableHead>
            <TableHead>Typ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const checked = selected.has(r.id)
            return (
              <TableRow
                key={r.id}
                className={checked ? 'bg-[#EEEDFE]' : undefined}
              >
                <TableCell>
                  <Checkbox checked={checked} onCheckedChange={() => onToggle(r.id)} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/clients/${r.id}`}
                    className="font-medium hover:underline"
                    prefetch={false}
                  >
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.nip ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  {[r.city, r.region].filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell className="text-xs">{r.industry ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {r.status ?? '—'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.top_match_score ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      r.type === 'client' ? 'bg-blue-50 text-blue-800' : 'bg-purple-50 text-purple-800'
                    }`}
                  >
                    {r.type}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
