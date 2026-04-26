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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  createDealItem,
  deleteDealItem,
  suggestPriceForProduct,
  updateDealItem,
} from '@/app/actions/deals'
import { computePrice, type PricingSettings } from '@/lib/pricing'
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
  pricing: PricingSettings
}

const formatPLN = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
})

type TierKey =
  | 'strategic_katalog'
  | 'standard_maly'
  | 'standard_sredni'
  | 'standard_duzy'

interface TierInfo {
  key: TierKey
  label: string
  margin: number | null // fraction (0..1); null for strategic without contract
}

// Single source of truth for "what tier am I in given this deal total
// and client". Strategic partner with a kontraktowa marża katalog uses
// that; standard clients walk the threshold ladder by total_value.
function resolveTier(
  totalNetto: number,
  clientContext: ClientPricingContext,
  pricing: PricingSettings,
): TierInfo {
  if (clientContext.client_type === 'strategic_partner') {
    const margin =
      clientContext.contracted_margin_katalog_pct ??
      pricing.margin_strategic_katalog
    return {
      key: 'strategic_katalog',
      margin,
      label: clientContext.contracted_margin_katalog_pct != null
        ? `Strategic — katalog ${(clientContext.contracted_margin_katalog_pct * 100).toFixed(0)}% / docel ${((clientContext.contracted_margin_docel_pct ?? 0) * 100).toFixed(0)}%`
        : 'Strategic — bez kontraktu',
    }
  }
  if (totalNetto >= pricing.threshold_duzy_pln) {
    return {
      key: 'standard_duzy',
      margin: pricing.margin_duzy_opt,
      label: `Standard — Duży opt ${(pricing.margin_duzy_opt * 100).toFixed(0)}%`,
    }
  }
  if (totalNetto >= pricing.threshold_sredni_pln) {
    return {
      key: 'standard_sredni',
      margin: pricing.margin_sredni_opt,
      label: `Standard — Średni opt ${(pricing.margin_sredni_opt * 100).toFixed(0)}%`,
    }
  }
  return {
    key: 'standard_maly',
    margin: pricing.margin_maly_opt,
    label: `Standard — Mały opt ${(pricing.margin_maly_opt * 100).toFixed(0)}%`,
  }
}

export function DealItemsEditor({
  dealId,
  initialItems,
  products,
  clientContext,
  pricing,
}: DealItemsEditorProps) {
  const router = useRouter()
  const [items, setItems] = useState<DealItem[]>(initialItems)
  const [pending, startTransition] = useTransition()
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [negativeMarginPending, setNegativeMarginPending] = useState<{
    item: DealItem
    newPrice: number
  } | null>(null)

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

  const currentTier = useMemo(
    () => resolveTier(totalNetto, clientContext, pricing),
    [totalNetto, clientContext, pricing],
  )

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

  // Recompute non-override items' unit_price_sell after a change shifts
  // the standard-tier ladder. Strategic clients are exempt — their margin
  // is contracted and total_value doesn't move it. Returns the items
  // after shift + the list of rows that need a server update + a label
  // for the toast (null when no tier change happened).
  const applyTierShift = (
    itemsAfterChange: DealItem[],
    sourceItemId: string,
  ): {
    items: DealItem[]
    extraUpdates: { id: string; unit_price_sell: number; quantity: number; unit_price_buy: number | null }[]
    shiftedTo: string | null
  } => {
    const prevTotalNetto = items.reduce(
      (sum, i) => sum + Number(i.line_total ?? 0),
      0,
    )
    const newTotalNetto = itemsAfterChange.reduce(
      (sum, i) => sum + Number(i.line_total ?? 0),
      0,
    )
    const prevTier = resolveTier(prevTotalNetto, clientContext, pricing)
    const newTier = resolveTier(newTotalNetto, clientContext, pricing)
    if (prevTier.key === newTier.key) {
      return { items: itemsAfterChange, extraUpdates: [], shiftedTo: null }
    }
    if (
      clientContext.client_type === 'strategic_partner' ||
      newTier.margin == null
    ) {
      return { items: itemsAfterChange, extraUpdates: [], shiftedTo: null }
    }
    const margin = newTier.margin
    const extraUpdates: { id: string; unit_price_sell: number; quantity: number; unit_price_buy: number | null }[] = []
    const shifted = itemsAfterChange.map((it) => {
      // Don't touch the row that triggered this change (user just typed
      // there) and don't touch user-overridden prices.
      if (it.id === sourceItemId) return it
      if (it.unit_price_override) return it
      const cost = it.unit_price_buy != null ? Number(it.unit_price_buy) : null
      if (cost == null || cost <= 0) return it
      const newSell = computePrice(cost, margin)
      if (newSell <= 0 || newSell === Number(it.unit_price_sell)) return it
      const qty = Number(it.quantity)
      extraUpdates.push({
        id: it.id,
        unit_price_sell: newSell,
        quantity: qty,
        unit_price_buy: cost,
      })
      return {
        ...it,
        unit_price_sell: newSell,
        line_total: newSell * qty,
      }
    })
    return { items: shifted, extraUpdates, shiftedTo: newTier.label }
  }

  const handleQuantity = (item: DealItem, value: string) => {
    const q = Number.parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0) return
    const optimistic = items.map((it) =>
      it.id === item.id
        ? { ...it, quantity: q, line_total: q * Number(it.unit_price_sell) }
        : it,
    )
    const { items: finalItems, extraUpdates, shiftedTo } = applyTierShift(
      optimistic,
      item.id,
    )
    setItems(finalItems)
    if (shiftedTo) {
      toast.info(`Tier zmienił się: ${shiftedTo}`)
    }
    startTransition(async () => {
      await Promise.all([
        updateDealItem(item.id, {
          quantity: q,
          unit_price_sell: Number(item.unit_price_sell),
          unit_price_buy: item.unit_price_buy ?? undefined,
        }),
        ...extraUpdates.map((u) =>
          updateDealItem(u.id, {
            quantity: u.quantity,
            unit_price_sell: u.unit_price_sell,
            unit_price_buy: u.unit_price_buy ?? undefined,
          }),
        ),
      ])
      router.refresh()
    })
  }

  const persistPrice = (item: DealItem, p: number) => {
    const optimistic = items.map((it) =>
      it.id === item.id
        ? {
            ...it,
            unit_price_sell: p,
            unit_price_override: true,
            line_total: p * Number(it.quantity),
          }
        : it,
    )
    const { items: finalItems, extraUpdates, shiftedTo } = applyTierShift(
      optimistic,
      item.id,
    )
    setItems(finalItems)
    if (shiftedTo) {
      toast.info(`Tier zmienił się: ${shiftedTo}`)
    }
    startTransition(async () => {
      await Promise.all([
        updateDealItem(item.id, {
          unit_price_sell: p,
          unit_price_override: true,
          quantity: Number(item.quantity),
          unit_price_buy: item.unit_price_buy ?? undefined,
        }),
        ...extraUpdates.map((u) =>
          updateDealItem(u.id, {
            quantity: u.quantity,
            unit_price_sell: u.unit_price_sell,
            unit_price_buy: u.unit_price_buy ?? undefined,
          }),
        ),
      ])
      router.refresh()
    })
  }

  const handlePrice = (item: DealItem, value: string) => {
    const p = Number.parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(p) || p < 0) return
    // Gate na sprzedaż pod cost — czerwona linia. AlertDialog pozwala
    // świadomie pominąć (np. promocja, sample), ale wymaga kliknięcia.
    const cost = item.unit_price_buy != null ? Number(item.unit_price_buy) : null
    if (cost != null && cost > 0 && p < cost) {
      setNegativeMarginPending({ item, newPrice: p })
      return
    }
    persistPrice(item, p)
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
          {currentTier.label}
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
                    <div className="flex flex-col items-end gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={String(item.unit_price_sell)}
                        onBlur={(e) => handlePrice(item, e.target.value)}
                        className="h-8 text-right"
                      />
                      {item.unit_price_override && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="bg-amber-100 text-amber-800 border-transparent text-[10px] px-1 py-0 h-4 leading-none cursor-help"
                            >
                              Manualne
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Cena ręcznie ustawiona — nie odpowiada cenniku tier
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {(() => {
                        const sell = Number(item.unit_price_sell ?? 0)
                        const cost =
                          item.unit_price_buy != null
                            ? Number(item.unit_price_buy)
                            : null
                        if (cost == null || cost <= 0 || sell <= 0) return null
                        const marginPct = ((sell - cost) / sell) * 100
                        if (marginPct < 0) {
                          return (
                            <Badge
                              variant="outline"
                              className="bg-red-100 text-red-800 border-transparent text-[10px] px-1 py-0 h-4 leading-none whitespace-nowrap"
                            >
                              ⚠ Marża ujemna! Cena pod kosztem
                            </Badge>
                          )
                        }
                        const docelFr =
                          clientContext.contracted_margin_docel_pct
                        if (
                          clientContext.client_type === 'strategic_partner' &&
                          docelFr != null &&
                          marginPct < docelFr * 100
                        ) {
                          return (
                            <Badge
                              variant="outline"
                              className="bg-amber-100 text-amber-800 border-transparent text-[10px] px-1 py-0 h-4 leading-none whitespace-nowrap"
                            >
                              ⚠ Marża {marginPct.toFixed(1)}% poniżej docel{' '}
                              {(docelFr * 100).toFixed(0)}%
                            </Badge>
                          )
                        }
                        return null
                      })()}
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

      <AlertDialog
        open={negativeMarginPending != null}
        onOpenChange={(open) => {
          if (!open) setNegativeMarginPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠ UWAGA: marża ujemna</AlertDialogTitle>
            <AlertDialogDescription>
              {negativeMarginPending && (
                <>
                  Cena {formatPLN.format(negativeMarginPending.newPrice)} jest
                  niższa od kosztu zakupu{' '}
                  {formatPLN.format(
                    Number(negativeMarginPending.item.unit_price_buy ?? 0),
                  )}
                  . Pozycja: <strong>
                    {negativeMarginPending.item.product_name_snapshot ??
                      '(usunięty produkt)'}
                  </strong>
                  . Marża ujemna —{' '}
                  {(
                    ((negativeMarginPending.newPrice -
                      Number(negativeMarginPending.item.unit_price_buy ?? 0)) /
                      negativeMarginPending.newPrice) *
                    100
                  ).toFixed(1)}
                  %.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zmień</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!negativeMarginPending) return
                persistPrice(
                  negativeMarginPending.item,
                  negativeMarginPending.newPrice,
                )
                setNegativeMarginPending(null)
              }}
            >
              Zapisz mimo to
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
