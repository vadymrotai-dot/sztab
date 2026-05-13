'use client'

// components/ui/data-table.tsx
// Sprint S-UX-CORE STEP 1.1 (14.05.2026) — Generic DataTable wrapper
// поверх TanStack Table v8. Foundation для replacing 5 hand-rolled tables
// у repo (prospects, cohort-members, products, produkty, clients-hub).
//
// Sprint S-UX-CORE STEP 3.1 (14.05.2026) — sticky header polish:
//   - thead: bg-background + border-b + shadow-sm (z-10)
//   - Outer wrapper: dropped overflow-hidden (clipped sticky thead),
//     replaced з rounded-md border + explicit corner round на inner.
//   - Inner: overflow-x-auto only — horizontal scroll preserved для
//     wide cohort tables (10+ cols). Vertical scroll inherited з
//     nearest ancestor — page-level scroll on cohort detail, modal
//     scroll inside Dialog.
//   - First col (select) optional sticky-left via columnDef meta (opt-in).
//
// Architecture:
//   - useReactTable з core/sorted/filtered/pagination row models
//   - Sticky table header (CSS position:sticky)
//   - Global filter input з debounce 300ms у toolbar slot
//   - Page size selector + pagination buttons у footer
//   - Toolbar slot для page-specific filter chips
//   - Polish UI strings: "Szukaj", "Pokaż", "Strona", "Poprzednia", "Następna"
//
// Composition:
//   - DataTable приймає columns + data + optional toolbar/searchKey
//   - Page-specific table wraps DataTable з custom columns + filter chips
//   - URL state sync — opt-in через useTableUrlState hook (separate file)

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type TableState,
  type Updater,
} from '@tanstack/react-table'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Debounce hook (local — no external dep) ─────────────────────

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// ─── Props ────────────────────────────────────────────────────────

export interface DataTableProps<TData, TValue> {
  /** Column definitions per TanStack Table v8 ColumnDef. */
  columns: ColumnDef<TData, TValue>[]
  /** Row data (server-fetched typically). */
  data: TData[]
  /** Placeholder для global search input. Default: "Szukaj...". */
  searchPlaceholder?: string
  /** Hide global search input коли false (use external filter UI). */
  enableGlobalFilter?: boolean
  /** Page size options для footer selector. Default: [50, 100, 200, 500]. */
  pageSizeOptions?: number[]
  /** Initial pageSize. Default 50. */
  defaultPageSize?: number
  /** Stable row id resolver (для composite keys e.g. cohort_members). */
  getRowId?: (row: TData, index: number, parent?: unknown) => string
  /** Enable row selection (checkbox column expected у columns[]). */
  enableRowSelection?: boolean
  /** Callback коли rowSelection changes (для bulk action bar). */
  onRowSelectionChange?: (selection: RowSelectionState) => void
  /** Empty state ReactNode (показується коли filtered.length === 0). */
  emptyState?: React.ReactNode
  /** Toolbar slot above table — page-specific filter chips / actions. */
  toolbar?: React.ReactNode
  /** Сontrolled sorting state (для URL sync). */
  sorting?: SortingState
  onSortingChange?: (updater: Updater<SortingState>) => void
  /** Controlled column filters state (для URL sync). */
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: (updater: Updater<ColumnFiltersState>) => void
  /** Controlled global filter (для URL sync). Else internal state used. */
  globalFilter?: string
  onGlobalFilterChange?: (value: string) => void
  /** Controlled pagination (для URL sync). */
  pagination?: PaginationState
  onPaginationChange?: (updater: Updater<PaginationState>) => void
  /** Controlled rowSelection (для derivation з parent Set). Else internal. */
  rowSelection?: RowSelectionState
  /** Custom globalFilterFn (для multi-field ILIKE-style filter).
   *  Default: TanStack's `includesString` behavior на all visible cols. */
  globalFilterFn?: import('@tanstack/react-table').FilterFn<TData>
  /** Sprint S-UX-CORE STEP 4.1 (14.05.2026) — manual modes for server-side
   *  sort / pagination / filtering. Коли true, TanStack НЕ re-sorts /
   *  paginates / filters incoming data — assumes server already did it.
   *  Sort/pagination clicks все ще fire onSortingChange / onPaginationChange
   *  (use these to update URL → trigger server refetch). */
  manualSorting?: boolean
  manualPagination?: boolean
  manualFiltering?: boolean
  /** Required коли manualPagination=true — server-known total page count
   *  (для footer "Strona X z Y" display + disabling next/prev). */
  pageCount?: number
  /** Required коли manualPagination=true — server-known total row count
   *  (для footer "N wierszy" display). */
  rowCount?: number
  /** Extra Tailwind className на root wrapper. */
  className?: string
}

// ─── Component ────────────────────────────────────────────────────

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Szukaj...',
  enableGlobalFilter = true,
  pageSizeOptions = [50, 100, 200, 500],
  defaultPageSize = 50,
  getRowId,
  enableRowSelection = false,
  onRowSelectionChange,
  emptyState,
  toolbar,
  sorting: controlledSorting,
  onSortingChange,
  columnFilters: controlledColumnFilters,
  onColumnFiltersChange,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
  pagination: controlledPagination,
  onPaginationChange,
  rowSelection: controlledRowSelection,
  globalFilterFn,
  manualSorting = false,
  manualPagination = false,
  manualFiltering = false,
  pageCount: serverPageCount,
  rowCount: serverRowCount,
  className,
}: DataTableProps<TData, TValue>) {
  // Internal states fallback (uncontrolled mode)
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([])
  const [internalFilters, setInternalFilters] = React.useState<ColumnFiltersState>([])
  const [internalGlobalRaw, setInternalGlobalRaw] = React.useState('')
  const [internalPagination, setInternalPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  })
  const [internalRowSelection, setInternalRowSelection] =
    React.useState<RowSelectionState>({})

  // Determine effective state — controlled wins if prop provided
  const sorting = controlledSorting ?? internalSorting
  const columnFilters = controlledColumnFilters ?? internalFilters
  const pagination = controlledPagination ?? internalPagination
  const rowSelection = controlledRowSelection ?? internalRowSelection
  const globalFilterRaw =
    controlledGlobalFilter !== undefined ? controlledGlobalFilter : internalGlobalRaw
  const globalFilter = useDebouncedValue(globalFilterRaw, 300)

  const setSorting = onSortingChange ?? setInternalSorting
  const setColumnFilters = onColumnFiltersChange ?? setInternalFilters
  const setGlobalFilterRaw =
    onGlobalFilterChange ??
    ((v: string) => setInternalGlobalRaw(v))
  const setPagination = onPaginationChange ?? setInternalPagination

  // Bubble row selection up якщо callback provided (internal mode only;
  // controlled mode callbacks own updates).
  React.useEffect(() => {
    if (controlledRowSelection === undefined) {
      onRowSelectionChange?.(internalRowSelection)
    }
  }, [internalRowSelection, onRowSelectionChange, controlledRowSelection])

  const table = useReactTable<TData>({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: (updater) => {
      const next =
        typeof updater === 'function' ? (updater as (old: string) => string)(globalFilterRaw) : updater
      setGlobalFilterRaw(next)
    },
    onPaginationChange: setPagination,
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? (updater as (old: RowSelectionState) => RowSelectionState)(rowSelection)
          : updater
      // Controlled mode: bubble new value up через callback (parent owns state).
      // Internal mode: write to internal useState (effect bubbles up too).
      if (controlledRowSelection !== undefined) {
        onRowSelectionChange?.(next)
      } else {
        setInternalRowSelection(next)
      }
    },
    getRowId,
    enableRowSelection,
    globalFilterFn,
    manualSorting,
    manualPagination,
    manualFiltering,
    // STEP 4.1 — pageCount required по TanStack для manual pagination.
    // -1 = unknown total (next button always enabled until empty page).
    pageCount: manualPagination ? (serverPageCount ?? -1) : undefined,
    rowCount: manualPagination ? serverRowCount : undefined,
    getCoreRowModel: getCoreRowModel(),
    // Skip these row models у manual modes — server already did the work.
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
  })

  // STEP 4.1 — у manual modes use server-provided totals; else compute з TanStack.
  const totalRows = manualFiltering
    ? (serverRowCount ?? data.length)
    : table.getFilteredRowModel().rows.length
  const totalAll = manualFiltering ? (serverRowCount ?? data.length) : data.length
  const pageCount = manualPagination ? (serverPageCount ?? 1) : table.getPageCount()
  const currentPage = pagination.pageIndex + 1

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar slot + global search.
          HOTFIX (14.05.2026 evening) — search input на LEFT (поряд saved views
          + custom toolbar elements) замість far-right. Vadym критика: "пошукова
          панель так далеко від назв". Layout тепер: [Search] [Toolbar slot]. */}
      {(toolbar || enableGlobalFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          {enableGlobalFilter && (
            <div className="relative w-full sm:w-80">
              <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={globalFilterRaw}
                onChange={(e) => setGlobalFilterRaw(e.target.value)}
                className="pl-9 h-9"
                aria-label="Wyszukaj"
              />
            </div>
          )}
          {toolbar && (
            <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          )}
        </div>
      )}

      {/* Table container — STEP 3.1: dropped outer overflow-hidden;
          rounded-md + border via outer; horizontal scroll via inner. */}
      <div className="rounded-md border">
        <div className="overflow-x-auto rounded-md">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background border-b shadow-[0_1px_0_0_var(--tw-shadow-color)] shadow-border/60">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="bg-background">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center">
                    {emptyState ?? (
                      <div className="text-sm text-muted-foreground">
                        {totalAll === 0
                          ? 'Brak danych.'
                          : 'Brak wyników dla wybranych filtrów.'}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Footer: count + page size + pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          {totalRows === totalAll
            ? `${totalAll} ${rowsLabel(totalAll)}`
            : `${totalRows} z ${totalAll} ${rowsLabel(totalAll)}`}
        </div>
        <div className="flex items-center gap-2">
          <span>Pokaż:</span>
          <select
            value={pagination.pageSize}
            onChange={(e) => {
              const newSize = Number(e.target.value)
              setPagination((prev) =>
                typeof prev === 'function'
                  ? { pageIndex: 0, pageSize: newSize }
                  : { pageIndex: 0, pageSize: newSize },
              )
            }}
            className="h-8 rounded-md border bg-background px-2"
            aria-label="Wielkość strony"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="mx-2">
            Strona {currentPage} z {Math.max(1, pageCount)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Poprzednia strona"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Następna strona"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Polish pluralized "wiersz" — 1 wiersz, 2-4 wiersze, 5+ wierszy. */
function rowsLabel(n: number): string {
  if (n === 1) return 'wiersz'
  const lastTwo = n % 100
  if (lastTwo >= 12 && lastTwo <= 14) return 'wierszy'
  const last = n % 10
  if (last >= 2 && last <= 4) return 'wiersze'
  return 'wierszy'
}
