'use client'

// lib/table/table-helpers.tsx
// Sprint S-UX-CORE STEP 1.3 (14.05.2026) — reusable helpers для Sztab
// common DataTable patterns. Replaces hand-rolled sort/filter/badge
// logic у prospects-table.tsx, cohort-members-client.tsx, products-content.tsx,
// produkty-shell.tsx, clients-table.tsx (3000+ LOC duplicated).
//
// Sprint S-UX-CORE STEP 1.3 BUGFIX (14.05.2026) — renamed з .ts → .tsx
// бо file містить JSX (createSortableHeader, createBadgeCell, defaultEmptyState
// returning <Button>, <Badge>, <span>). TSC у .ts mode парсив <Button> як
// TypeScript generic cast → 53 errors. .tsx extension fix it.
//
// Imports:
//   import { createSortableHeader, createBadgeCell,
//            createMultiFieldGlobalFilter, defaultEmptyState } from '@/lib/table/table-helpers'

import * as React from 'react'
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from 'lucide-react'
import type { Column, FilterFn, Row } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── 1. createSortableHeader ─────────────────────────────────────
// Returns a header.Cell function що рендерить label + arrow indicator.
// Click toggles asc → desc → unsorted via column.toggleSorting().
//
// Usage:
//   {
//     accessorKey: 'score',
//     header: createSortableHeader('Score'),
//     cell: ({ row }) => row.original.score
//   }

export function createSortableHeader<TData>(label: string) {
  return function SortableHeader({ column }: { column: Column<TData, unknown> }) {
    const isSorted = column.getIsSorted()
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => column.toggleSorting(isSorted === 'asc')}
        className="-ml-2 h-8 data-[state=open]:bg-accent"
      >
        <span>{label}</span>
        {isSorted === 'asc' ? (
          <ArrowUpIcon className="ml-1.5 size-3" />
        ) : isSorted === 'desc' ? (
          <ArrowDownIcon className="ml-1.5 size-3" />
        ) : (
          <ArrowUpDownIcon className="ml-1.5 size-3 opacity-50" />
        )}
      </Button>
    )
  }
}

// ─── 2. createBadgeCell ──────────────────────────────────────────
// Returns a cell function що рендерить Badge з color tier based на value.
// Used для score (green/yellow/grey/red), status, etc.
//
// Usage:
//   {
//     accessorKey: 'score',
//     cell: createBadgeCell({
//       getValue: (v) => Number(v),
//       tiers: [
//         { match: (v) => v >= 70, className: 'bg-emerald-100 text-emerald-800', label: (v) => `${v}` },
//         { match: (v) => v >= 50, className: 'bg-amber-100 text-amber-800', label: (v) => `${v}` },
//         { match: (v) => v > 0, className: 'bg-gray-100 text-gray-700', label: (v) => `${v}` },
//       ],
//       fallback: <span className="text-xs text-muted-foreground">—</span>,
//     })
//   }

interface BadgeTier<V> {
  match: (value: V) => boolean
  className: string
  label: (value: V) => string
}

interface BadgeCellOptions<V> {
  /** Coerce raw cell value до typed V. */
  getValue: (raw: unknown) => V | null | undefined
  /** Ordered tiers — first matching wins. */
  tiers: BadgeTier<V>[]
  /** Fallback ReactNode коли value is null/undefined OR no tier matches. */
  fallback?: React.ReactNode
}

export function createBadgeCell<TData, V>(opts: BadgeCellOptions<V>) {
  return function BadgeCell({ row, column }: { row: Row<TData>; column: Column<TData, unknown> }) {
    const raw = row.getValue(column.id) as unknown
    const value = opts.getValue(raw)
    if (value === null || value === undefined) {
      return opts.fallback ?? <span className="text-xs text-muted-foreground">—</span>
    }
    const tier = opts.tiers.find((t) => t.match(value))
    if (!tier) {
      return opts.fallback ?? <span className="text-xs text-muted-foreground">—</span>
    }
    return (
      <Badge variant="outline" className={cn('text-xs tabular-nums', tier.className)}>
        {tier.label(value)}
      </Badge>
    )
  }
}

// ─── 3. createMultiFieldGlobalFilter ─────────────────────────────
// FilterFn що матчить query string ILIKE-style across multiple columns.
// Used як TanStack global filter — set table.options.globalFilterFn.
//
// Usage:
//   const globalFilter = createMultiFieldGlobalFilter<ProspectRow>(['name', 'nip', 'miejscowosc'])
//   useReactTable({ ..., globalFilterFn: globalFilter })

export function createMultiFieldGlobalFilter<TData>(
  fieldIds: string[],
): FilterFn<TData> {
  return (row, _columnId, filterValue) => {
    if (!filterValue || typeof filterValue !== 'string') return true
    const q = filterValue.trim().toLowerCase()
    if (!q) return true
    for (const fieldId of fieldIds) {
      const raw = row.getValue(fieldId) as unknown
      if (raw === null || raw === undefined) continue
      const str = String(raw).toLowerCase()
      if (str.includes(q)) return true
    }
    return false
  }
}

// ─── 4. defaultEmptyState ────────────────────────────────────────
// Component-level empty state з "Brak wyników" + "Wyczyść filtry" action.
// Used коли filtered rows = 0.
//
// Usage у DataTable:
//   emptyState={defaultEmptyState({
//     hasFilters: globalFilter !== '' || columnFilters.length > 0,
//     onClear: resetAll,
//   })}

interface EmptyStateOptions {
  hasFilters: boolean
  onClear?: () => void
  emptyMessage?: string
  filteredMessage?: string
}

export function defaultEmptyState(opts: EmptyStateOptions): React.ReactNode {
  const {
    hasFilters,
    onClear,
    emptyMessage = 'Brak danych.',
    filteredMessage = 'Brak wyników dla wybranych filtrów.',
  } = opts
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
      <span>{hasFilters ? filteredMessage : emptyMessage}</span>
      {hasFilters && onClear && (
        <Button variant="outline" size="sm" onClick={onClear}>
          Wyczyść filtry
        </Button>
      )}
    </div>
  )
}

// ─── 5. arrayFilterFn ────────────────────────────────────────────
// Helper FilterFn для multi-select column filters (e.g. "channels=horeca,catering").
// Matches row якщо row[columnId] є один з array values.

export const arrayFilterFn: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (!filterValue) return true
  const values = Array.isArray(filterValue) ? filterValue : [filterValue]
  if (values.length === 0) return true
  const cellValue = row.getValue(columnId) as unknown
  if (cellValue === null || cellValue === undefined) return false
  return values.includes(String(cellValue))
}

// ─── 6. rangeFilterFn ────────────────────────────────────────────
// Helper FilterFn для numeric range column filters (e.g. "score 50-90").
// Filter value: [min, max] tuple or comma-string "min,max".

export const rangeFilterFn: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (!filterValue) return true
  const raw = filterValue as unknown
  const tuple = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : null
  if (!tuple || tuple.length !== 2) return true
  const [minStr, maxStr] = tuple
  const min = Number(minStr)
  const max = Number(maxStr)
  if (!Number.isFinite(min) && !Number.isFinite(max)) return true
  const cellValue = Number(row.getValue(columnId))
  if (!Number.isFinite(cellValue)) return false
  if (Number.isFinite(min) && cellValue < min) return false
  if (Number.isFinite(max) && cellValue > max) return false
  return true
}
