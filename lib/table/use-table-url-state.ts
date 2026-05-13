'use client'

// lib/table/use-table-url-state.ts
// Sprint S-UX-CORE STEP 1.2 (14.05.2026) — bidirectional URL ↔ TanStack
// state sync hook.
//
// Pattern eqolves з app/intelligence/prospects/_components/prospects-table.tsx
// (parseFilterFromUrl/filterToUrl lines 226-267) — modernized для TanStack
// Table v8 state shape (sorting, columnFilters, globalFilter, pagination).
//
// URL param schema (з namespace prefix to avoid collision з page-specific
// URL params):
//   ?sort=<columnId>      single-column sort
//   ?dir=asc|desc          sort direction (default desc)
//   ?q=<text>              global filter (debounced 300ms write)
//   ?page=<int>            pageIndex+1 (1-based для human readability)
//   ?size=<int>            pageSize (default 50)
//   ?f.<columnId>=<value>  per-column filter (one param per filter)
//                          multi-value: comma-separated string
//
// Behavior:
//   - Reads URL once on mount → seeds TanStack state via setters
//   - Watches state changes → writes back через router.replace (preserves
//     unrelated query params, e.g. ?status=Pending z cohort tabs)
//   - Debounce 300ms на globalFilter write (avoid URL spam during typing)
//   - Sort + pagination + columnFilters write instantly

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from '@tanstack/react-table'

interface UrlStateOptions {
  /** Reserved URL param keys що НЕ варто стирати при write-back.
   *  Default: ['status', 'tab', 'cohort_id'] — common page-level params. */
  preserveKeys?: string[]
  /** Default pageSize якщо ?size= не set. Default 50. */
  defaultPageSize?: number
  /** Column ids що приймають filter via URL (whitelist for safety). */
  filterableColumnIds?: string[]
  /** Column ids що приймають sort via URL. */
  sortableColumnIds?: string[]
  /** Debounce ms для globalFilter write. Default 300. */
  globalFilterDebounceMs?: number
}

interface UrlStateReturn {
  sorting: SortingState
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>
  columnFilters: ColumnFiltersState
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>
  globalFilter: string
  setGlobalFilter: React.Dispatch<React.SetStateAction<string>>
  pagination: PaginationState
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>
  /** Imperative reset до defaults (clears all URL filter params). */
  resetAll: () => void
}

const DEFAULT_PRESERVE_KEYS = ['status', 'tab', 'cohort_id']

export function useTableUrlState(options: UrlStateOptions = {}): UrlStateReturn {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const {
    preserveKeys = DEFAULT_PRESERVE_KEYS,
    defaultPageSize = 50,
    filterableColumnIds,
    sortableColumnIds,
    globalFilterDebounceMs = 300,
  } = options

  // ─── Initial hydration з URL ───
  const initialFromUrl = useRef(
    parseUrl(searchParams, {
      defaultPageSize,
      filterableColumnIds,
      sortableColumnIds,
    }),
  ).current

  const [sorting, setSorting] = useState<SortingState>(initialFromUrl.sorting)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialFromUrl.columnFilters,
  )
  const [globalFilter, setGlobalFilter] = useState<string>(initialFromUrl.globalFilter)
  const [pagination, setPagination] = useState<PaginationState>(initialFromUrl.pagination)

  // ─── Write-back до URL ───
  // sort + columnFilters + pagination — instant
  // globalFilter — debounced
  const writeUrl = useCallback(
    (overrides?: {
      sorting?: SortingState
      columnFilters?: ColumnFiltersState
      globalFilter?: string
      pagination?: PaginationState
    }) => {
      const next = new URLSearchParams()
      // Preserve unrelated keys
      const current = new URLSearchParams(searchParams.toString())
      for (const key of preserveKeys) {
        const val = current.get(key)
        if (val !== null) next.set(key, val)
      }

      const s = overrides?.sorting ?? sorting
      const cf = overrides?.columnFilters ?? columnFilters
      const gf = overrides?.globalFilter ?? globalFilter
      const p = overrides?.pagination ?? pagination

      // Sort — single column for simplicity (TanStack supports multi but
      // URL gets ugly; Sztab tables rarely need multi-column sort)
      if (s.length > 0) {
        const first = s[0]
        next.set('sort', first.id)
        if (first.desc) next.set('dir', 'desc')
        else next.set('dir', 'asc')
      }
      // Column filters
      for (const f of cf) {
        const val = Array.isArray(f.value) ? f.value.join(',') : String(f.value ?? '')
        if (val) next.set(`f.${f.id}`, val)
      }
      // Global filter
      if (gf) next.set('q', gf)
      // Pagination
      if (p.pageIndex > 0) next.set('page', String(p.pageIndex + 1))
      if (p.pageSize !== defaultPageSize) next.set('size', String(p.pageSize))

      const qs = next.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      router.replace(url, { scroll: false })
    },
    [
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      pathname,
      router,
      searchParams,
      preserveKeys,
      defaultPageSize,
    ],
  )

  // Instant writes для sort/columnFilters/pagination
  useEffect(() => {
    writeUrl({ sorting })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting])
  useEffect(() => {
    writeUrl({ columnFilters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnFilters])
  useEffect(() => {
    writeUrl({ pagination })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination])

  // Debounced write для globalFilter
  useEffect(() => {
    const id = setTimeout(() => writeUrl({ globalFilter }), globalFilterDebounceMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter])

  // ─── Imperative reset ───
  const resetAll = useCallback(() => {
    setSorting([])
    setColumnFilters([])
    setGlobalFilter('')
    setPagination({ pageIndex: 0, pageSize: defaultPageSize })
  }, [defaultPageSize])

  return {
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
    pagination,
    setPagination,
    resetAll,
  }
}

// ─── URL parsing helpers ────────────────────────────────────────────

interface ParseOptions {
  defaultPageSize: number
  filterableColumnIds?: string[]
  sortableColumnIds?: string[]
}

function parseUrl(
  sp: URLSearchParams,
  opts: ParseOptions,
): {
  sorting: SortingState
  columnFilters: ColumnFiltersState
  globalFilter: string
  pagination: PaginationState
} {
  // Sort
  const sortId = sp.get('sort')
  const sortDir = sp.get('dir')
  const sortAllowed =
    sortId !== null &&
    (opts.sortableColumnIds === undefined || opts.sortableColumnIds.includes(sortId))
  const sorting: SortingState =
    sortAllowed && sortId
      ? [{ id: sortId, desc: sortDir !== 'asc' }]
      : []

  // Column filters — iterate всі ?f.<colId>= params
  const columnFilters: ColumnFiltersState = []
  for (const [key, value] of sp.entries()) {
    if (!key.startsWith('f.')) continue
    const colId = key.slice(2)
    if (opts.filterableColumnIds && !opts.filterableColumnIds.includes(colId)) continue
    if (!value) continue
    // Multi-value comma-separated → array; single → string
    const parsedValue: unknown = value.includes(',') ? value.split(',') : value
    columnFilters.push({ id: colId, value: parsedValue })
  }

  // Global filter
  const globalFilter = sp.get('q') ?? ''

  // Pagination
  const pageRaw = parseInt(sp.get('page') ?? '', 10)
  const sizeRaw = parseInt(sp.get('size') ?? '', 10)
  const pageIndex = Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw - 1 : 0
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : opts.defaultPageSize

  return {
    sorting,
    columnFilters,
    globalFilter,
    pagination: { pageIndex, pageSize },
  }
}
