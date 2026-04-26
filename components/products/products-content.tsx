'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
} from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Product } from '@/lib/types'

type GroupBy = 'supplier' | 'category' | 'none'

type SortColumn =
  | 'lp'
  | 'name'
  | 'gramatura'
  | 'ean'
  | 'cost_eur'
  | 'cost_pln'
  | 'price_maly_opt'
  | 'price_sredni'
  | 'price_duzy'
type SortDirection = 'asc' | 'desc'

interface SupplierSummary {
  id: string
  name: string
}

interface ProductsContentProps {
  products: Product[]
  suppliers: SupplierSummary[]
  /** Legacy slot — old page.tsx still passes null. Ignored. */
  params?: unknown
}

const TOOLBAR_KEY = 'products_toolbar_state'
const GROUPS_STATE_KEY = 'products_groups_state'

const NO_SUPPLIER = '__nosup__'
const NO_CATEGORY = '__nocat__'

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '—'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
  }).format(value)
}

const formatEur = (value: number | null | undefined) => {
  if (value == null) return '—'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value)
}

interface ToolbarState {
  groupBy: GroupBy
  hiddenSuppliers: string[]
  hiddenCategories: string[]
  sortColumn: SortColumn
  sortDirection: SortDirection
}

const DEFAULT_TOOLBAR: ToolbarState = {
  groupBy: 'supplier',
  hiddenSuppliers: [],
  hiddenCategories: [],
  sortColumn: 'name',
  sortDirection: 'asc',
}

export function ProductsContent({
  products,
  suppliers,
  params: _params,
}: ProductsContentProps) {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [toolbar, setToolbar] = useState<ToolbarState>(DEFAULT_TOOLBAR)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  // Hydrate state from localStorage once on mount.
  useEffect(() => {
    try {
      const t = localStorage.getItem(TOOLBAR_KEY)
      if (t) setToolbar({ ...DEFAULT_TOOLBAR, ...JSON.parse(t) })
      const g = localStorage.getItem(GROUPS_STATE_KEY)
      if (g) setOpenGroups(JSON.parse(g))
    } catch {
      // bad JSON or unavailable — fall back to defaults
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(TOOLBAR_KEY, JSON.stringify(toolbar))
    } catch {}
  }, [hydrated, toolbar])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(GROUPS_STATE_KEY, JSON.stringify(openGroups))
    } catch {}
  }, [hydrated, openGroups])

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of suppliers) m.set(s.id, s.name)
    return m
  }, [suppliers])

  const supplierFilterOptions = useMemo(() => {
    const used = new Set<string>()
    let hasOrphan = false
    for (const p of products) {
      if (p.supplier_id) used.add(p.supplier_id)
      else hasOrphan = true
    }
    const list = Array.from(used)
      .map((id) => ({ id, name: supplierMap.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (hasOrphan) list.push({ id: NO_SUPPLIER, name: 'Bez dostawcy' })
    return list
  }, [products, supplierMap])

  const categoryFilterOptions = useMemo(() => {
    const used = new Set<string>()
    let hasOrphan = false
    for (const p of products) {
      const c = p.category?.trim()
      if (c) used.add(c)
      else hasOrphan = true
    }
    const list = Array.from(used)
      .sort()
      .map((c) => ({ id: c, name: c }))
    if (hasOrphan) list.push({ id: NO_CATEGORY, name: 'Bez kategorii' })
    return list
  }, [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (q) {
        const inName = p.name.toLowerCase().includes(q)
        const inCat = p.category?.toLowerCase().includes(q) ?? false
        const inEan = p.ean?.includes(search) ?? false
        const inGramatura = p.gramatura?.toLowerCase().includes(q) ?? false
        if (!inName && !inCat && !inEan && !inGramatura) return false
      }
      const supKey = p.supplier_id ?? NO_SUPPLIER
      if (toolbar.hiddenSuppliers.includes(supKey)) return false
      const catKey = p.category?.trim() || NO_CATEGORY
      if (toolbar.hiddenCategories.includes(catKey)) return false
      return true
    })
  }, [products, search, toolbar.hiddenSuppliers, toolbar.hiddenCategories])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => compareProducts(a, b, toolbar.sortColumn, toolbar.sortDirection))
    return arr
  }, [filtered, toolbar.sortColumn, toolbar.sortDirection])

  const handleSort = (col: SortColumn) => {
    setToolbar((prev) => {
      if (prev.sortColumn === col) {
        return {
          ...prev,
          sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc',
        }
      }
      return { ...prev, sortColumn: col, sortDirection: 'asc' }
    })
  }

  const setGroupBy = (g: GroupBy) =>
    setToolbar((prev) => ({ ...prev, groupBy: g }))

  const toggleHidden = (
    list: 'hiddenSuppliers' | 'hiddenCategories',
    id: string,
  ) => {
    setToolbar((prev) => {
      const set = new Set(prev[list])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...prev, [list]: Array.from(set) }
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten produkt?')) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (!error) {
      router.refresh()
    }
  }

  const setGroupOpen = (key: string, open: boolean) => {
    setOpenGroups((prev) => ({ ...prev, [key]: open }))
  }

  // Treat undefined as "open" (default) so first-time visitors see content.
  const isOpen = (key: string) => openGroups[key] !== false

  const totalShown = sorted.length
  const totalAll = products.length

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Toolbar
        search={search}
        onSearch={setSearch}
        groupBy={toolbar.groupBy}
        onGroupByChange={setGroupBy}
        supplierOptions={supplierFilterOptions}
        hiddenSuppliers={toolbar.hiddenSuppliers}
        onToggleSupplier={(id) => toggleHidden('hiddenSuppliers', id)}
        categoryOptions={categoryFilterOptions}
        hiddenCategories={toolbar.hiddenCategories}
        onToggleCategory={(id) => toggleHidden('hiddenCategories', id)}
        totalShown={totalShown}
        totalAll={totalAll}
      />

      {totalAll === 0 ? (
        <EmptyState
          message="Brak produktów. Kliknij 'Dodaj produkt' aby zacząć."
        />
      ) : totalShown === 0 ? (
        <EmptyState message="Brak wyników dla wybranych filtrów. Spróbuj zmienić wyszukiwanie." />
      ) : toolbar.groupBy === 'none' ? (
        <FlatTable
          products={sorted}
          supplierMap={supplierMap}
          showDostawcaCategoryColumns
          sortColumn={toolbar.sortColumn}
          sortDirection={toolbar.sortDirection}
          onSort={handleSort}
          onDelete={handleDelete}
        />
      ) : toolbar.groupBy === 'category' ? (
        <CategoryGroups
          products={sorted}
          openGroups={openGroups}
          isOpen={isOpen}
          setGroupOpen={setGroupOpen}
          sortColumn={toolbar.sortColumn}
          sortDirection={toolbar.sortDirection}
          onSort={handleSort}
          supplierMap={supplierMap}
          onDelete={handleDelete}
        />
      ) : (
        <SupplierGroups
          products={sorted}
          supplierMap={supplierMap}
          isOpen={isOpen}
          setGroupOpen={setGroupOpen}
          sortColumn={toolbar.sortColumn}
          sortDirection={toolbar.sortDirection}
          onSort={handleSort}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

function compareProducts(
  a: Product,
  b: Product,
  col: SortColumn,
  dir: SortDirection,
): number {
  const av = (a as unknown as Record<string, unknown>)[col]
  const bv = (b as unknown as Record<string, unknown>)[col]
  // Nulls always last.
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  let cmp = 0
  if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv)
  else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
  else cmp = String(av).localeCompare(String(bv))
  return dir === 'asc' ? cmp : -cmp
}

interface ToolbarProps {
  search: string
  onSearch: (v: string) => void
  groupBy: GroupBy
  onGroupByChange: (v: GroupBy) => void
  supplierOptions: { id: string; name: string }[]
  hiddenSuppliers: string[]
  onToggleSupplier: (id: string) => void
  categoryOptions: { id: string; name: string }[]
  hiddenCategories: string[]
  onToggleCategory: (id: string) => void
  totalShown: number
  totalAll: number
}

function Toolbar({
  search,
  onSearch,
  groupBy,
  onGroupByChange,
  supplierOptions,
  hiddenSuppliers,
  onToggleSupplier,
  categoryOptions,
  hiddenCategories,
  onToggleCategory,
  totalShown,
  totalAll,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1 max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Szukaj produktu..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Grupuj:</span>
        <RadioGroup
          value={groupBy}
          onValueChange={(v) => onGroupByChange(v as GroupBy)}
          className="flex items-center gap-3"
        >
          <RadioGroupItem value="supplier" id="grp-supplier" className="size-3.5" />
          <Label htmlFor="grp-supplier" className="cursor-pointer text-xs">Dostawca</Label>
          <RadioGroupItem value="category" id="grp-category" className="size-3.5" />
          <Label htmlFor="grp-category" className="cursor-pointer text-xs">Kategoria</Label>
          <RadioGroupItem value="none" id="grp-none" className="size-3.5" />
          <Label htmlFor="grp-none" className="cursor-pointer text-xs">Bez grupowania</Label>
        </RadioGroup>
      </div>

      <FilterMultiSelect
        label="Dostawcy"
        options={supplierOptions}
        hidden={hiddenSuppliers}
        onToggle={onToggleSupplier}
      />
      <FilterMultiSelect
        label="Kategorie"
        options={categoryOptions}
        hidden={hiddenCategories}
        onToggle={onToggleCategory}
      />

      <div className="ml-auto text-xs text-muted-foreground">
        {totalShown === totalAll
          ? `${totalAll} produktów`
          : `${totalShown} z ${totalAll}`}
      </div>
    </div>
  )
}

interface FilterMultiSelectProps {
  label: string
  options: { id: string; name: string }[]
  hidden: string[]
  onToggle: (id: string) => void
}

function FilterMultiSelect({
  label,
  options,
  hidden,
  onToggle,
}: FilterMultiSelectProps) {
  const visibleCount = options.length - options.filter((o) => hidden.includes(o.id)).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          {label}
          <Badge
            variant="secondary"
            className={cn(
              'ml-2 text-[10px] tabular-nums',
              hidden.length > 0 && 'bg-amber-100 text-amber-800',
            )}
          >
            {visibleCount}/{options.length}
          </Badge>
          <ChevronDownIcon className="ml-1 size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        <div className="max-h-[280px] overflow-auto space-y-1">
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">Brak danych.</p>
          )}
          {options.map((opt) => {
            const isVisible = !hidden.includes(opt.id)
            return (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={isVisible}
                  onCheckedChange={() => onToggle(opt.id)}
                />
                <span className="flex-1 truncate">{opt.name}</span>
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface SortableHeadProps {
  label: string
  column: SortColumn
  current: SortColumn
  direction: SortDirection
  onSort: (col: SortColumn) => void
  align?: 'left' | 'right'
  className?: string
}

function SortableHead({
  label,
  column,
  current,
  direction,
  onSort,
  align = 'left',
  className,
}: SortableHeadProps) {
  const active = current === column
  return (
    <TableHead
      className={cn(
        'cursor-pointer select-none hover:bg-muted/50',
        align === 'right' && 'text-right',
        className,
      )}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (direction === 'asc' ? (
            <ArrowUpIcon className="size-3" />
          ) : (
            <ArrowDownIcon className="size-3" />
          ))}
      </span>
    </TableHead>
  )
}

interface FlatTableProps {
  products: Product[]
  supplierMap: Map<string, string>
  showDostawcaCategoryColumns: boolean
  sortColumn: SortColumn
  sortDirection: SortDirection
  onSort: (col: SortColumn) => void
  onDelete: (id: string) => void
}

function FlatTable({
  products,
  supplierMap,
  showDostawcaCategoryColumns,
  sortColumn,
  sortDirection,
  onSort,
  onDelete,
}: FlatTableProps) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead
              label="Lp"
              column="lp"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
              className="w-[60px]"
            />
            <SortableHead
              label="Nazwa"
              column="name"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHead
              label="Gramatura"
              column="gramatura"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHead
              label="EAN"
              column="ean"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
            />
            {showDostawcaCategoryColumns && (
              <>
                <TableHead>Dostawca</TableHead>
                <TableHead>Kategoria</TableHead>
              </>
            )}
            <SortableHead
              label="Koszt EUR"
              column="cost_eur"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
              align="right"
            />
            <SortableHead
              label="Koszt PLN"
              column="cost_pln"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
              align="right"
            />
            <SortableHead
              label="Cena Mały"
              column="price_maly_opt"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
              align="right"
            />
            <SortableHead
              label="Średni"
              column="price_sredni"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
              align="right"
            />
            <SortableHead
              label="Duży"
              column="price_duzy"
              current={sortColumn}
              direction={sortDirection}
              onSort={onSort}
              align="right"
            />
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              supplierMap={supplierMap}
              showDostawcaCategoryColumns={showDostawcaCategoryColumns}
              onDelete={onDelete}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

interface ProductRowProps {
  product: Product
  supplierMap: Map<string, string>
  showDostawcaCategoryColumns: boolean
  onDelete: (id: string) => void
}

function ProductRow({
  product,
  supplierMap,
  showDostawcaCategoryColumns,
  onDelete,
}: ProductRowProps) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {product.lp ?? '—'}
      </TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/products/${product.id}/edit`}
          className="hover:underline"
        >
          {product.name}
          {product.is_hero && (
            <span
              className="ml-1 text-amber-500"
              title="Hero / bestseller"
            >
              ★
            </span>
          )}
        </Link>
      </TableCell>
      <TableCell className="text-sm">{product.gramatura ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs">
        {product.ean ?? '—'}
      </TableCell>
      {showDostawcaCategoryColumns && (
        <>
          <TableCell className="text-sm">
            {product.supplier_id
              ? (supplierMap.get(product.supplier_id) ?? '—')
              : '—'}
          </TableCell>
          <TableCell className="text-sm">{product.category ?? '—'}</TableCell>
        </>
      )}
      <TableCell className="text-right tabular-nums">
        {formatEur(product.cost_eur)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(product.cost_pln)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(product.price_maly_opt)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(product.price_sredni)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(product.price_duzy)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/products/${product.id}/edit`}>
                <PencilIcon className="mr-2 size-4" />
                Edytuj
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(product.id)}
            >
              <TrashIcon className="mr-2 size-4" />
              Usuń
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

interface GroupedProps {
  products: Product[]
  supplierMap: Map<string, string>
  isOpen: (key: string) => boolean
  setGroupOpen: (key: string, open: boolean) => void
  openGroups?: Record<string, boolean>
  sortColumn: SortColumn
  sortDirection: SortDirection
  onSort: (col: SortColumn) => void
  onDelete: (id: string) => void
}

function CategoryGroups(props: GroupedProps) {
  const grouped = useMemo(() => groupByCategory(props.products), [props.products])
  const openValues = grouped
    .map((g) => g.key)
    .filter((k) => props.isOpen(k))

  return (
    <Accordion
      type="multiple"
      value={openValues}
      onValueChange={(vals) => {
        // diff against grouped to know which keys changed
        for (const g of grouped) {
          const wantOpen = vals.includes(g.key)
          if (wantOpen !== props.isOpen(g.key)) {
            props.setGroupOpen(g.key, wantOpen)
          }
        }
      }}
      className="space-y-2"
    >
      {grouped.map((g) => (
        <AccordionItem
          key={g.key}
          value={g.key}
          className="rounded-md border bg-background"
        >
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-medium">
              {g.label}
              <Badge variant="secondary" className="text-[10px]">
                {g.products.length} produktów
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t pt-0">
            <FlatTable
              products={g.products}
              supplierMap={props.supplierMap}
              showDostawcaCategoryColumns={false}
              sortColumn={props.sortColumn}
              sortDirection={props.sortDirection}
              onSort={props.onSort}
              onDelete={props.onDelete}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function SupplierGroups(props: GroupedProps) {
  const supplierGrouped = useMemo(
    () => groupBySupplier(props.products, props.supplierMap),
    [props.products, props.supplierMap],
  )
  const outerOpen = supplierGrouped
    .map((g) => g.key)
    .filter((k) => props.isOpen(k))

  return (
    <Accordion
      type="multiple"
      value={outerOpen}
      onValueChange={(vals) => {
        for (const g of supplierGrouped) {
          const want = vals.includes(g.key)
          if (want !== props.isOpen(g.key)) props.setGroupOpen(g.key, want)
        }
      }}
      className="space-y-2"
    >
      {supplierGrouped.map((sup) => {
        const innerGrouped = groupByCategory(sup.products)
        const innerOpen = innerGrouped
          .map((g) => g.key)
          .filter((k) => props.isOpen(k))
        return (
          <AccordionItem
            key={sup.key}
            value={sup.key}
            className="rounded-md border bg-background"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {sup.label}
                <Badge variant="secondary" className="text-[10px]">
                  {sup.products.length} produktów
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent className="border-t bg-muted/20 p-2">
              <Accordion
                type="multiple"
                value={innerOpen}
                onValueChange={(vals) => {
                  for (const g of innerGrouped) {
                    const want = vals.includes(g.key)
                    if (want !== props.isOpen(g.key))
                      props.setGroupOpen(g.key, want)
                  }
                }}
                className="space-y-1"
              >
                {innerGrouped.map((cat) => (
                  <AccordionItem
                    key={cat.key}
                    value={cat.key}
                    className="rounded-md border bg-background"
                  >
                    <AccordionTrigger className="px-3 py-2 hover:no-underline">
                      <span className="flex items-center gap-2 text-xs">
                        {cat.label}
                        <Badge variant="secondary" className="text-[10px]">
                          {cat.products.length}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="border-t pt-0">
                      <FlatTable
                        products={cat.products}
                        supplierMap={props.supplierMap}
                        showDostawcaCategoryColumns={false}
                        sortColumn={props.sortColumn}
                        sortDirection={props.sortDirection}
                        onSort={props.onSort}
                        onDelete={props.onDelete}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

interface Group {
  key: string
  label: string
  products: Product[]
}

function groupByCategory(products: Product[]): Group[] {
  const m = new Map<string, Product[]>()
  for (const p of products) {
    const key = p.category?.trim() || NO_CATEGORY
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(p)
  }
  return Array.from(m.entries())
    .sort((a, b) => {
      if (a[0] === NO_CATEGORY) return 1
      if (b[0] === NO_CATEGORY) return -1
      return a[0].localeCompare(b[0])
    })
    .map(([cat, prods]) => ({
      key: `cat_${cat}`,
      label: cat === NO_CATEGORY ? 'Bez kategorii' : cat,
      products: prods,
    }))
}

function groupBySupplier(
  products: Product[],
  supplierMap: Map<string, string>,
): Group[] {
  const m = new Map<string, Product[]>()
  for (const p of products) {
    const key = p.supplier_id ?? NO_SUPPLIER
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(p)
  }
  return Array.from(m.entries())
    .sort((a, b) => {
      if (a[0] === NO_SUPPLIER) return 1
      if (b[0] === NO_SUPPLIER) return -1
      const an = supplierMap.get(a[0]) ?? a[0]
      const bn = supplierMap.get(b[0]) ?? b[0]
      return an.localeCompare(bn)
    })
    .map(([id, prods]) => ({
      key: `sup_${id}`,
      label: id === NO_SUPPLIER ? 'Bez dostawcy' : (supplierMap.get(id) ?? id),
      products: prods,
    }))
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
