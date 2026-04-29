'use client'

// Sprint O Phase 5 — wrapper з tabs (Klienci/Prospекti/Wszystko),
// chip filters, bulk selection, "Akcje grupowe" dropdown, +Dodaj firmę CTA.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { ChevronDownIcon, ZapIcon, BriefcaseIcon } from 'lucide-react'
import { ClientsTable } from '@/components/clients/clients-table'
import { AddCompanyButton } from '@/components/clients/add-company-button'
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
}

const TABS = [
  { value: 'klienci', label: 'Klienci' },
  { value: 'prospекti', label: 'Prospекti' },
  { value: 'wszystko', label: 'Wszystko' },
]

export function ClientsHub({ clients, unifiedRows }: Props) {
  const clientCount = unifiedRows.filter((r) => r.type === 'client').length
  const prospectCount = unifiedRows.filter((r) => r.type === 'prospect').length
  // Subset of clients[] with entity_type='client' для existing ClientsTable
  const onlyClients = clients.filter((c) => (c.entity_type ?? 'client') === 'client')
  const router = useRouter()
  const params = useSearchParams()
  const tab = params.get('tab') ?? 'klienci'

  // Chip filters
  const [onlyWithContact, setOnlyWithContact] = useState(false)
  const [onlyHighMatch, setOnlyHighMatch] = useState(false)
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false)

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
    if (onlyWithContact) rows = rows.filter((r) => r.has_contact)
    if (onlyHighMatch) rows = rows.filter((r) => (r.top_match_score ?? 0) >= 70)
    if (onlyNeedsReview) rows = rows.filter((r) => r.status === 'pending')
    return rows
  }, [unifiedRows, tab, onlyWithContact, onlyHighMatch, onlyNeedsReview])

  function navigateTab(t: string) {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    router.replace(`/clients?${next.toString()}`)
    clearSelection()
  }

  async function exportCohort() {
    if (selectedCount === 0) return
    const ids = Array.from(selected)
    const name = prompt(
      `Eksport ${ids.length} firm jako kohorta. Podaj nazwę:`,
      `Manualna kohorta ${new Date().toISOString().slice(0, 10)}`,
    )
    if (!name) return
    const res = await fetch('/api/handoff/cohort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohort_name: name, entity_ids: ids, source: 'manual_select' }),
    })
    const json = (await res.json()) as { ok: boolean; redirect?: string; error?: string }
    if (json.ok && json.redirect) router.push(json.redirect)
    else alert(json.error ?? 'Błąd eksportu')
  }

  return (
    <div className="flex flex-col">
      {/* Tabs + Add CTA */}
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

        <div className="ml-auto flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                Wybrano <strong>{selectedCount}</strong> firm
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="default">
                    <ZapIcon className="mr-1 size-3" />
                    Akcje grupowe
                    <ChevronDownIcon className="ml-1 size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportCohort}>
                    <BriefcaseIcon className="mr-2 size-4" />
                    Eksport jako kohorta Pikniko
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    Wzbogać kontakty (Apify) — soon
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    Wygeneruj cold openery — soon
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={clearSelection}>
                    Wyczyść zaznaczenie
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <AddCompanyButton />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === 'klienci' && (
          <ClientsTable clients={onlyClients} />
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
              <TableRow key={r.id}>
                <TableCell>
                  <Checkbox checked={checked} onCheckedChange={() => onToggle(r.id)} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/clients/${r.id}`}
                    className="font-medium hover:underline"
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
