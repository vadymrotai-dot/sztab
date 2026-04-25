'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PencilIcon, SearchIcon } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Supplier, SupplierDealType, SupplierType } from '@/lib/types'

const DEAL_TYPE_BADGE: Record<SupplierDealType, string> = {
  reseller: 'bg-green-100 text-green-800 border-transparent',
  agent: 'bg-blue-100 text-blue-800 border-transparent',
  partner: 'bg-purple-100 text-purple-800 border-transparent',
}

const DEAL_TYPE_LABEL: Record<SupplierDealType, string> = {
  reseller: 'Reseller',
  agent: 'Agent',
  partner: 'Partner',
}

const TYPE_BADGE: Record<SupplierType, string> = {
  producent: 'bg-slate-100 text-slate-800 border-transparent',
  trader: 'bg-amber-100 text-amber-800 border-transparent',
  posrednik: 'bg-slate-200 text-slate-700 border-transparent',
  wlasna_marka: 'bg-indigo-100 text-indigo-800 border-transparent',
}

const TYPE_LABEL: Record<SupplierType, string> = {
  producent: 'Producent',
  trader: 'Trader',
  posrednik: 'Pośrednik',
  wlasna_marka: 'Własna marka',
}

interface SuppliersTableProps {
  suppliers: Supplier[]
}

export function SuppliersTable({ suppliers }: SuppliersTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterDealType, setFilterDealType] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return suppliers.filter((sup) => {
      if (s) {
        const inName = sup.name.toLowerCase().includes(s)
        const inLegal = sup.legal_name?.toLowerCase().includes(s) ?? false
        if (!inName && !inLegal) return false
      }
      if (filterDealType !== 'all' && sup.deal_type !== filterDealType) {
        return false
      }
      if (filterType !== 'all' && sup.type !== filterType) {
        return false
      }
      return true
    })
  }, [suppliers, search, filterDealType, filterType])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj po nazwie lub pełnej nazwie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterDealType} onValueChange={setFilterDealType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Typ współpracy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie typy współpracy</SelectItem>
            <SelectItem value="reseller">Reseller</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Rodzaj" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie rodzaje</SelectItem>
            <SelectItem value="producent">Producent</SelectItem>
            <SelectItem value="trader">Trader</SelectItem>
            <SelectItem value="posrednik">Pośrednik</SelectItem>
            <SelectItem value="wlasna_marka">Własna marka</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
          {suppliers.length === 0
            ? "Brak dostawców. Kliknij 'Dodaj dostawcę' aby zacząć."
            : 'Brak dostawców spełniających kryteria filtrowania.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Pełna nazwa</TableHead>
                <TableHead>Rodzaj</TableHead>
                <TableHead>Typ współpracy</TableHead>
                <TableHead>Branże</TableHead>
                <TableHead>Wiarygodność</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sup) => (
                <TableRow
                  key={sup.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/suppliers/${sup.id}/edit`)}
                >
                  <TableCell className="font-medium">{sup.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sup.legal_name ?? '—'}
                  </TableCell>
                  <TableCell>
                    {sup.type ? (
                      <Badge
                        variant="outline"
                        className={cn('text-xs', TYPE_BADGE[sup.type])}
                      >
                        {TYPE_LABEL[sup.type]}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {sup.deal_type ? (
                      <Badge
                        variant="outline"
                        className={cn('text-xs', DEAL_TYPE_BADGE[sup.deal_type])}
                      >
                        {DEAL_TYPE_LABEL[sup.deal_type]}
                        {sup.deal_type === 'agent' &&
                        sup.commission_pct != null
                          ? ` · ${sup.commission_pct}%`
                          : ''}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {sup.verticals && sup.verticals.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {sup.verticals.slice(0, 3).map((v) => (
                          <Badge
                            key={v}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {v}
                          </Badge>
                        ))}
                        {sup.verticals.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{sup.verticals.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {sup.reliability_score != null
                      ? `${sup.reliability_score}/10`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/suppliers/${sup.id}/edit`}>
                        <PencilIcon className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
