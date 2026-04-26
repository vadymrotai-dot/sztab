'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  createDealItem,
  deleteDealItem,
  suggestPriceForProduct,
  updateDealItem,
} from '@/app/actions/deals'
import type { DealItem } from '@/lib/types'

export interface ProductOption {
  id: string
  name: string
  gramatura: string | null
  ean: string | null
  cost_pln: number | null
  vat_rate: number | null
  unit: string | null
  supplier_id: string | null
  supplier_name: string | null
  category: string | null
}

export interface ClientPricingContext {
  client_id: string | null
  client_type: 'standard' | 'strategic_partner' | null
  contracted_margin_katalog_pct: number | null
  contracted_margin_docel_pct: number | null
}

interface DealItemsEditorProps {
  dealId: string
  initialItems: DealItem[]
  products: ProductOption[]
  clientContext: ClientPricingContext
}

const formatPLN = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
})

export function DealItemsEditor({
  dealId,
  initialItems,
  products,
  clientContext,
}: DealItemsEditorProps) {
  const router = useRouter()
  const [items, setItems] = useState<DealItem[]>(initialItems)
  const [pending, startTransition] = useTransition()
  const [productPickerOpen, setProductPickerOpen] = useState(false)

  // Sync from server when initialItems changes (e.g. after revalidate)
  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  const totalNetto = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.line_total ?? 0), 0),
    [items],
  )

  const totalVat = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + Number(i.line_total ?? 0) * Number(i.vat_rate ?? 0),
        0,
      ),
    [items],
  )

  const totalBrutto = totalNetto + totalVat

  const tierLabel = useMemo(() => {
    if (clientContext.client_type === 'strategic_partner') {
      const k = clientContext.contracted_margin_katalog_pct
      const d = clientContext.contracted_margin_docel_pct
      if (k != null && d != null) {
        return `Strategic — katalog ${(k * 100).toFixed(0)}% / docel ${(d * 100).toFixed(0)}%`
      }
      return 'Strategic — bez kontraktu'
    }
    if (totalNetto >= 2500) return 'Standard — Duży opt 35%'
    if (totalNetto >= 1000) return 'Standard — Średni opt 40%'
    return 'Standard — Mały opt 50%'
  }, [clientContext, totalNetto])

  const handleAddProduct = (product: ProductOption) => {
    setProductPickerOpen(false)
    startTransition(async () => {
      const suggestion = await suggestPriceForProduct(
        product.id,
        clientContext.client_id,
        totalNetto,
      )
      const result = await createDealItem(dealId, {
        product_id: product.id,
        product_name_snapshot: product.name,
        product_gramatura_snapshot: product.gramatura,
        product_ean_snapshot: product.ean,
        quantity: 1,
        unit: product.unit ?? 'szt',
        unit_price_buy: product.cost_pln,
        unit_price_sell: suggestion?.unit_price_sell ?? product.cost_pln ?? 0,
        unit_price_override: false,
        vat_rate: product.vat_rate ?? 0.05,
      })
      if (!result.ok) {
        toast.error(`Nie dodano: ${result.error}`)
        return
      }
      toast.success('Pozycja dodana')
      router.refresh()
    })
  }

  const handleQuantity = (item: DealItem, value: string) => {
    const q = Number.parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0) return
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, quantity: q, line_total: q * Number(it.unit_price_sell) }
          : it,
      ),
    )
    startTransition(async () => {
      await updateDealItem(item.id, {
        quantity: q,
        unit_price_sell: Number(item.unit_price_sell),
        unit_price_buy: item.unit_price_buy ?? undefined,
      })
      router.refresh()
    })
  }

  const handlePrice = (item: DealItem, value: string) => {
    const p = Number.parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(p) || p < 0) return
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? {
              ...it,
              unit_price_sell: p,
              unit_price_override: true,
              line_total: p * Number(it.quantity),
            }
          : it,
      ),
    )
    startTransition(async () => {
      await updateDealItem(item.id, {
        unit_price_sell: p,
        unit_price_override: true,
        quantity: Number(item.quantity),
        unit_price_buy: item.unit_price_buy ?? undefined,
      })
      router.refresh()
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Usunąć tę pozycję?')) return
    startTransition(async () => {
      const result = await deleteDealItem(id)
      if (!result.ok) {
        toast.error(`Nie usunięto: ${result.error}`)
        return
      }
      setItems((prev) => prev.filter((i) => i.id !== id))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-xs">
        <span className="text-muted-foreground">Reżim cenowy:</span>
        <Badge
          variant="outline"
          className={cn(
            clientContext.client_type === 'strategic_partner'
              ? 'bg-purple-100 text-purple-800 border-transparent'
              : 'bg-blue-100 text-blue-800 border-transparent',
          )}
        >
          {tierLabel}
        </Badge>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Brak pozycji. Dodaj pierwszy produkt.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead className="w-[120px]">Ilość</TableHead>
                <TableHead className="w-[140px] text-right">
                  Cena jedn.
                </TableHead>
                <TableHead className="w-[130px] text-right">
                  Wartość
                </TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">
                      {item.product_name_snapshot ?? '(usunięty produkt)'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.product_gramatura_snapshot ?? ''}
                      {item.product_ean_snapshot && (
                        <span className="ml-2 font-mono">
                          {item.product_ean_snapshot}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      defaultValue={String(item.quantity)}
                      onBlur={(e) => handleQuantity(item, e.target.value)}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={String(item.unit_price_sell)}
                        onBlur={(e) => handlePrice(item, e.target.value)}
                        className="h-8 text-right"
                      />
                      {item.unit_price_override && (
                        <span
                          className="text-[9px] text-amber-600"
                          title="Cena nadpisana ręcznie"
                        >
                          ✎
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPLN.format(Number(item.line_total ?? 0))}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" disabled={pending}>
              <PlusIcon className="mr-2 size-4" />
              Dodaj pozycję
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[480px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Szukaj produktu (nazwa / gramatura / EAN)..." />
              <CommandList>
                <CommandEmpty>Brak produktów.</CommandEmpty>
                <CommandGroup>
                  {products.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.gramatura ?? ''} ${p.ean ?? ''} ${p.supplier_name ?? ''}`}
                      onSelect={() => handleAddProduct(p)}
                    >
                      <CheckIcon className="mr-2 size-4 opacity-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {p.gramatura ?? '—'}
                          {p.supplier_name && ` · ${p.supplier_name}`}
                          {p.cost_pln != null && (
                            <>
                              {' · koszt '}
                              {formatPLN.format(p.cost_pln)}
                            </>
                          )}
                        </span>
                      </div>
                      <ChevronsUpDownIcon className="ml-auto size-3 opacity-30" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {pending && <Spinner className="size-4 text-muted-foreground" />}

        <div className="ml-auto rounded-md border bg-muted/30 p-3 text-sm tabular-nums">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Subtotal netto:</span>
            <span className="font-medium">{formatPLN.format(totalNetto)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">VAT:</span>
            <span>{formatPLN.format(totalVat)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-6 border-t pt-1 text-base font-semibold">
            <span>Total brutto:</span>
            <span>{formatPLN.format(totalBrutto)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
