'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
import { Switch } from '@/components/ui/switch'
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
import type { Client } from '@/lib/types'

type GroupBy = 'industry' | 'channel_type' | 'size_tier' | 'none'

const TOOLBAR_KEY = 'clients_toolbar_state'
const NO_INDUSTRY = '__no_industry__'
const NO_CHANNEL = '__no_channel__'
const NO_TIER = '__no_tier__'

interface ToolbarState {
  groupBy: GroupBy
  hiddenIndustries: string[]
  hiddenChannels: string[]
  onlyStrategic: boolean
  page: number
}

const DEFAULT_TOOLBAR: ToolbarState = {
  groupBy: 'none',
  hiddenIndustries: [],
  hiddenChannels: [],
  onlyStrategic: false,
  page: 0,
}

const PAGE_SIZE = 50

interface ClientsTableProps {
  clients: Client[]
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [toolbar, setToolbar] = useState<ToolbarState>(DEFAULT_TOOLBAR)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const t = localStorage.getItem(TOOLBAR_KEY)
      if (t) setToolbar({ ...DEFAULT_TOOLBAR, ...JSON.parse(t) })
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(TOOLBAR_KEY, JSON.stringify(toolbar))
    } catch {}
  }, [hydrated, toolbar])

  const industryOptions = useMemo(() => {
    const set = new Set<string>()
    let hasOrphan = false
    for (const c of clients) {
      const i = c.industry?.trim()
      if (i) set.add(i)
      else hasOrphan = true
    }
    const list = Array.from(set)
      .sort()
      .map((i) => ({ id: i, name: i }))
    if (hasOrphan) list.push({ id: NO_INDUSTRY, name: 'Bez branży' })
    return list
  }, [clients])

  const channelOptions = useMemo(() => {
    const set = new Set<string>()
    let hasOrphan = false
    for (const c of clients) {
      const ch = c.channel_type?.trim()
      if (ch) set.add(ch)
      else hasOrphan = true
    }
    const list = Array.from(set)
      .sort()
      .map((c) => ({ id: c, name: c }))
    if (hasOrphan) list.push({ id: NO_CHANNEL, name: 'Bez kanału' })
    return list
  }, [clients])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (q) {
        const hits =
          c.title.toLowerCase().includes(q) ||
          (c.nip ?? '').includes(search) ||
          (c.city ?? '').toLowerCase().includes(q) ||
          (c.industry ?? '').toLowerCase().includes(q)
        if (!hits) return false
      }
      if (toolbar.onlyStrategic && c.client_type !== 'strategic_partner')
        return false
      const indKey = c.industry?.trim() || NO_INDUSTRY
      if (toolbar.hiddenIndustries.includes(indKey)) return false
      const chKey = c.channel_type?.trim() || NO_CHANNEL
      if (toolbar.hiddenChannels.includes(chKey)) return false
      return true
    })
  }, [clients, search, toolbar])

  const totalShown = filtered.length
  const totalAll = clients.length
  const pageCount = Math.max(1, Math.ceil(totalShown / PAGE_SIZE))
  const currentPage = Math.min(toolbar.page, pageCount - 1)
  const visibleSlice = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  )

  const setGroupBy = (g: GroupBy) =>
    setToolbar((prev) => ({ ...prev, groupBy: g, page: 0 }))

  const toggleHidden = (
    list: 'hiddenIndustries' | 'hiddenChannels',
    id: string,
  ) =>
    setToolbar((prev) => {
      const set = new Set(prev[list])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...prev, [list]: Array.from(set), page: 0 }
    })

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno usunąć tego klienta?')) return
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (!error) router.refresh()
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj po nazwie, NIP, mieście, branży..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Grupuj:</span>
          <RadioGroup
            value={toolbar.groupBy}
            onValueChange={(v) => setGroupBy(v as GroupBy)}
            className="flex items-center gap-3"
          >
            <RadioGroupItem value="none" id="cg-none" className="size-3.5" />
            <Label htmlFor="cg-none" className="cursor-pointer text-xs">
              Brak
            </Label>
            <RadioGroupItem value="industry" id="cg-ind" className="size-3.5" />
            <Label htmlFor="cg-ind" className="cursor-pointer text-xs">
              Branża
            </Label>
            <RadioGroupItem value="channel_type" id="cg-ch" className="size-3.5" />
            <Label htmlFor="cg-ch" className="cursor-pointer text-xs">
              Kanał
            </Label>
            <RadioGroupItem value="size_tier" id="cg-tier" className="size-3.5" />
            <Label htmlFor="cg-tier" className="cursor-pointer text-xs">
              Tier
            </Label>
          </RadioGroup>
        </div>

        <FilterMultiSelect
          label="Branże"
          options={industryOptions}
          hidden={toolbar.hiddenIndustries}
          onToggle={(id) => toggleHidden('hiddenIndustries', id)}
        />
        <FilterMultiSelect
          label="Kanały"
          options={channelOptions}
          hidden={toolbar.hiddenChannels}
          onToggle={(id) => toggleHidden('hiddenChannels', id)}
        />

        <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
          <Switch
            id="only-strategic"
            checked={toolbar.onlyStrategic}
            onCheckedChange={(v) =>
              setToolbar((prev) => ({ ...prev, onlyStrategic: v, page: 0 }))
            }
          />
          <Label htmlFor="only-strategic" className="cursor-pointer text-xs">
            Tylko strategic partners
          </Label>
        </div>

        <div className="ml-auto text-xs text-muted-foreground">
          {totalShown === totalAll
            ? `${totalAll} klientów`
            : `${totalShown} z ${totalAll}`}
        </div>
      </div>

      {totalShown === 0 ? (
        <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
          {totalAll === 0
            ? "Brak klientów. Kliknij 'Dodaj klienta' aby zacząć."
            : 'Brak wyników dla wybranych filtrów.'}
        </div>
      ) : toolbar.groupBy === 'none' ? (
        <>
          <FlatTable clients={visibleSlice} onDelete={handleDelete} />
          {pageCount > 1 && (
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onPage={(p) =>
                setToolbar((prev) => ({ ...prev, page: p }))
              }
              total={totalShown}
            />
          )}
        </>
      ) : (
        <Grouped
          clients={filtered}
          groupBy={toolbar.groupBy}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

interface FilterOption {
  id: string
  name: string
}

function FilterMultiSelect({
  label,
  options,
  hidden,
  onToggle,
}: {
  label: string
  options: FilterOption[]
  hidden: string[]
  onToggle: (id: string) => void
}) {
  const visibleCount =
    options.length - options.filter((o) => hidden.includes(o.id)).length
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
        <div className="max-h-[280px] space-y-1 overflow-auto">
          {options.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Brak danych.</p>
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

function FlatTable({
  clients,
  onDelete,
}: {
  clients: Client[]
  onDelete: (id: string) => void
}) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nazwa</TableHead>
            <TableHead>NIP</TableHead>
            <TableHead>Miasto</TableHead>
            <TableHead>Branża</TableHead>
            <TableHead>Kanał</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <ClientRow key={c.id} client={c} onDelete={onDelete} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ClientRow({
  client,
  onDelete,
}: {
  client: Client
  onDelete: (id: string) => void
}) {
  const router = useRouter()
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => router.push(`/clients/${client.id}/edit`)}
    >
      <TableCell className="font-medium">
        <Link
          href={`/clients/${client.id}/edit`}
          className="hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {client.title}
        </Link>
      </TableCell>
      <TableCell className="font-mono text-xs">{client.nip ?? '—'}</TableCell>
      <TableCell className="text-sm">{client.city ?? '—'}</TableCell>
      <TableCell className="text-sm">{client.industry ?? '—'}</TableCell>
      <TableCell className="text-sm">{client.channel_type ?? '—'}</TableCell>
      <TableCell className="text-sm">{client.size_tier ?? '—'}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            client.client_type === 'strategic_partner'
              ? 'bg-purple-100 text-purple-800 border-transparent'
              : 'bg-slate-100 text-slate-700 border-transparent',
          )}
        >
          {client.client_type === 'strategic_partner'
            ? 'Strategic'
            : 'Standard'}
        </Badge>
      </TableCell>
      <TableCell className="text-sm">{client.status}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}/edit`}>
                <PencilIcon className="mr-2 size-4" />
                Edytuj
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(client.id)
              }}
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

function Grouped({
  clients,
  groupBy,
  onDelete,
}: {
  clients: Client[]
  groupBy: 'industry' | 'channel_type' | 'size_tier'
  onDelete: (id: string) => void
}) {
  const groups = useMemo(() => {
    const m = new Map<string, Client[]>()
    for (const c of clients) {
      let raw: string | null | undefined
      if (groupBy === 'industry') raw = c.industry
      else if (groupBy === 'channel_type') raw = c.channel_type
      else raw = c.size_tier
      const key = raw?.trim() || '__no__'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(c)
    }
    return Array.from(m.entries())
      .sort((a, b) => {
        if (a[0] === '__no__') return 1
        if (b[0] === '__no__') return -1
        return a[0].localeCompare(b[0])
      })
      .map(([k, list]) => ({
        key: k,
        label:
          k === '__no__'
            ? groupBy === 'industry'
              ? 'Bez branży'
              : groupBy === 'channel_type'
                ? 'Bez kanału'
                : 'Bez tier-u'
            : k,
        clients: list,
      }))
  }, [clients, groupBy])

  return (
    <Accordion
      type="multiple"
      defaultValue={groups.map((g) => g.key)}
      className="space-y-2"
    >
      {groups.map((g) => (
        <AccordionItem
          key={g.key}
          value={g.key}
          className="rounded-md border bg-background"
        >
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-medium">
              {g.label}
              <Badge variant="secondary" className="text-[10px]">
                {g.clients.length} klientów
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t pt-0">
            <FlatTable clients={g.clients} onDelete={onDelete} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function Pagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
  total: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-2">
      <span className="text-xs text-muted-foreground">
        Strona {page + 1} z {pageCount} · {total} klientów
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
