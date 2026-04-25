'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'

import { createClient } from '@/lib/supabase/client'
import type { Deal, DealStage } from '@/lib/types'
import { DEAL_STAGES } from '@/lib/types'
import { cn } from '@/lib/utils'
import { revalidateDealRoutes } from '@/app/actions/revalidate'

const stageLabel: Record<DealStage, string> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.value, s.label]),
) as Record<DealStage, string>

export interface DealModalClient {
  id: string
  title: string
}

export interface DealModalProduct {
  id: string
  name: string
}

export interface DealModalPerson {
  id: string
  name: string
  client_id?: string | null
}

export interface DealModalSupplier {
  id: string
  name: string
}

export interface DealModalDefaults {
  client_id?: string
  product_id?: string
  stage?: DealStage
}

export interface DealModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deal?: Deal
  defaults?: DealModalDefaults
  clients: DealModalClient[]
  products: DealModalProduct[]
  people: DealModalPerson[]
  suppliers: DealModalSupplier[]
  onSaved?: (id: string) => void
}

const dealStageValues = DEAL_STAGES.map((s) => s.value) as [
  DealStage,
  ...DealStage[],
]

const dealSchema = z.object({
  client_id: z.string().min(1, 'Klient jest wymagany'),
  product_id: z.string().optional(),
  person_id: z.string().optional(),
  supplier_id: z.string().optional(),
  stage: z.enum(dealStageValues),
  probability: z.number().min(0).max(100),
  quantity: z.number().min(0).nullable(),
  unit: z.string().optional(),
  unit_price_buy: z.number().min(0).nullable(),
  unit_price_sell: z.number().min(0).nullable(),
  total_value: z.number().min(0).nullable(),
  margin_amount: z.number().nullable(),
  margin_pct: z.number().nullable(),
  currency: z.string().min(3).max(3),
  delivery_terms: z.string().optional(),
  expected_close_date: z.string().optional(),
  next_action_date: z.string().optional(),
  next_action_note: z.string().optional(),
  notes: z.string().optional(),
  title: z.string().optional(),
})

type DealFormValues = z.infer<typeof dealSchema>

const todayISO = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

const parseNumOrNull = (v: string): number | null => {
  if (v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

const formatNum = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '' : String(v)

// Reads ?stage=, ?client=, ?product= directly from the browser URL.
// Bypasses useSearchParams (which has been unreliable for our case)
// and reads window.location synchronously. SSR-safe via the typeof
// window guard — on the server we return an empty object and rely
// on server-passed defaults instead.
const readUrlDefaults = (): DealModalDefaults => {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const stageRaw = params.get('stage')
  const validStage = DEAL_STAGES.some((s) => s.value === stageRaw)
    ? (stageRaw as DealStage)
    : undefined
  return {
    stage: validStage,
    client_id: params.get('client') ?? undefined,
    product_id: params.get('product') ?? undefined,
  }
}

const buildInitialValues = (
  deal: Deal | undefined,
  defaults: DealModalDefaults | undefined,
): DealFormValues => ({
  client_id: deal?.client_id ?? defaults?.client_id ?? '',
  product_id: deal?.product_id ?? defaults?.product_id ?? undefined,
  person_id: deal?.person_id ?? undefined,
  supplier_id: deal?.supplier_id ?? undefined,
  stage: deal?.stage ?? defaults?.stage ?? 'lead',
  probability: deal?.probability ?? 30,
  quantity: deal?.quantity ?? null,
  unit: deal?.unit ?? '',
  unit_price_buy: deal?.unit_price_buy ?? null,
  unit_price_sell: deal?.unit_price_sell ?? null,
  total_value: deal?.total_value ?? deal?.amount ?? null,
  margin_amount: deal?.margin_amount ?? null,
  margin_pct: deal?.margin_pct ?? null,
  currency: deal?.currency ?? 'PLN',
  delivery_terms: deal?.delivery_terms ?? '',
  expected_close_date:
    deal?.expected_close_date ?? deal?.close_date ?? '',
  next_action_date: deal?.next_action_date ?? '',
  next_action_note: deal?.next_action_note ?? '',
  notes: deal?.notes ?? '',
  title: deal?.title ?? '',
})

const recomputeDerived = (
  values: DealFormValues,
  overridden: boolean,
): DealFormValues => {
  const qty = values.quantity ?? 0
  const sell = values.unit_price_sell ?? 0
  const buy = values.unit_price_buy ?? 0
  const autoTotal = qty * sell

  let total: number | null
  if (overridden) {
    total = values.total_value
  } else {
    total = qty > 0 || sell > 0 ? autoTotal : null
  }

  const cost = qty * buy
  const margin = total != null ? total - cost : null
  const pct =
    total != null && total > 0 && margin != null ? (margin / total) * 100 : null

  return {
    ...values,
    total_value: total,
    margin_amount: margin,
    margin_pct: pct,
  }
}

interface ComboOption {
  id: string
  label: string
  hint?: string
}

function FieldCombobox({
  options,
  value,
  onChange,
  placeholder,
  required = false,
  emptyText = 'Nie znaleziono.',
  searchPlaceholder = 'Szukaj...',
  disabled = false,
}: {
  options: ComboOption[]
  value?: string
  onChange: (id: string | undefined) => void
  placeholder: string
  required?: boolean
  emptyText?: string
  searchPlaceholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {!required && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                >
                  <span className="text-muted-foreground italic">
                    — Brak —
                  </span>
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.hint ?? ''}`}
                  onSelect={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                >
                  <CheckIcon
                    className={cn(
                      'mr-2 size-4',
                      value === option.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{option.label}</span>
                    {option.hint && (
                      <span className="text-xs text-muted-foreground truncate">
                        {option.hint}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DealModal({
  open,
  onOpenChange,
  deal,
  defaults,
  clients,
  products,
  people,
  suppliers,
  onSaved,
}: DealModalProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Merge defaults from three sources, in priority order:
  //   1. Existing deal (edit mode) — handled inside buildInitialValues
  //   2. Server-passed defaults prop
  //   3. URL params read directly from window.location (client only)
  const mergedDefaults: DealModalDefaults = (() => {
    const url = readUrlDefaults()
    return {
      client_id: defaults?.client_id ?? url.client_id,
      product_id: defaults?.product_id ?? url.product_id,
      stage: defaults?.stage ?? url.stage,
    }
  })()

  const [values, setValues] = useState<DealFormValues>(() =>
    buildInitialValues(deal, mergedDefaults),
  )
  const [errors, setErrors] = useState<Partial<Record<keyof DealFormValues, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  const [totalOverridden, setTotalOverridden] = useState<boolean>(() => {
    const init = buildInitialValues(deal, mergedDefaults)
    const autoTotal = (init.quantity ?? 0) * (init.unit_price_sell ?? 0)
    return Boolean(
      deal &&
        init.total_value != null &&
        Math.abs(autoTotal - init.total_value) > 0.005,
    )
  })

  const clientOptions: ComboOption[] = useMemo(
    () => clients.map((c) => ({ id: c.id, label: c.title })),
    [clients],
  )

  const productOptions: ComboOption[] = useMemo(
    () => products.map((p) => ({ id: p.id, label: p.name })),
    [products],
  )

  const filteredPeople = useMemo(() => {
    if (!values.client_id) return people
    return people.filter(
      (p) => !p.client_id || p.client_id === values.client_id,
    )
  }, [people, values.client_id])

  const peopleOptions: ComboOption[] = useMemo(
    () =>
      filteredPeople.map((p) => ({
        id: p.id,
        label: p.name,
        hint: p.client_id
          ? clients.find((c) => c.id === p.client_id)?.title
          : undefined,
      })),
    [filteredPeople, clients],
  )

  const supplierOptions: ComboOption[] = useMemo(
    () => suppliers.map((s) => ({ id: s.id, label: s.name })),
    [suppliers],
  )

  const updateField = <K extends keyof DealFormValues>(
    key: K,
    raw: DealFormValues[K],
  ) => {
    setValues((prev) => {
      const next = { ...prev, [key]: raw }

      if (key === 'total_value') {
        setTotalOverridden(true)
        return recomputeDerived(next, true)
      }

      if (
        key === 'quantity' ||
        key === 'unit_price_sell' ||
        key === 'unit_price_buy'
      ) {
        return recomputeDerived(next, totalOverridden)
      }

      if (key === 'client_id') {
        // Reset person if it doesn't belong to the new client
        const personStillValid = next.person_id
          ? people.some(
              (p) =>
                p.id === next.person_id &&
                (!p.client_id || p.client_id === next.client_id),
            )
          : true
        if (!personStillValid) {
          next.person_id = undefined
        }
      }

      return next
    })
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const resetTotalOverride = () => {
    setTotalOverridden(false)
    setValues((prev) => recomputeDerived(prev, false))
  }

  const buildAutoTitle = (): string => {
    const clientTitle = clients.find((c) => c.id === values.client_id)?.title
    const productName = values.product_id
      ? products.find((p) => p.id === values.product_id)?.name
      : undefined
    if (clientTitle && productName) return `${clientTitle} — ${productName}`
    if (clientTitle) return clientTitle
    if (productName) return productName
    return 'Umowa'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const parsed = dealSchema.safeParse(values)
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof DealFormValues, string>> = {}
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof DealFormValues
        if (k && !fieldErrors[k]) fieldErrors[k] = issue.message
      }
      setErrors(fieldErrors)
      toast.error('Sprawdz pola formularza')
      return
    }

    setSubmitting(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Sesja wygasła. Zaloguj się ponownie.')
      setSubmitting(false)
      return
    }

    const data = parsed.data
    const titleToSave = data.title?.trim() || buildAutoTitle()

    const payload = {
      title: titleToSave,
      client_id: data.client_id,
      product_id: data.product_id ?? null,
      person_id: data.person_id ?? null,
      supplier_id: data.supplier_id ?? null,
      stage: data.stage,
      probability: data.probability,
      quantity: data.quantity,
      unit: data.unit?.trim() || null,
      unit_price_buy: data.unit_price_buy,
      unit_price_sell: data.unit_price_sell,
      total_value: data.total_value,
      // Mirror total_value into legacy amount column so old code paths
      // (Bitrix-imported listings, dashboard sums) keep working.
      amount: data.total_value ?? deal?.amount ?? 0,
      margin_amount: data.margin_amount,
      margin_pct: data.margin_pct,
      currency: data.currency,
      delivery_terms: data.delivery_terms?.trim() || null,
      expected_close_date: data.expected_close_date || null,
      next_action_date: data.next_action_date || null,
      next_action_note: data.next_action_note?.trim() || null,
      notes: data.notes?.trim() || null,
    }

    if (deal) {
      const { error } = await supabase
        .from('deals')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', deal.id)

      if (error) {
        toast.error(`Nie udało się zapisać: ${error.message}`)
        setSubmitting(false)
        return
      }

      if (deal.stage !== data.stage) {
        await supabase.from('deal_events').insert({
          deal_id: deal.id,
          event_type: 'stage_change',
          from_stage: deal.stage,
          to_stage: data.stage,
          owner_id: user.id,
        })
      }

      await revalidateDealRoutes()
      toast.success('Umowa zaktualizowana')
      onSaved?.(deal.id)
      router.refresh()
      onOpenChange(false)
      setSubmitting(false)
      return
    }

    const { data: created, error } = await supabase
      .from('deals')
      .insert({ ...payload, owner_id: user.id })
      .select('id')
      .single()

    if (error || !created) {
      toast.error(`Nie udało się utworzyć umowy: ${error?.message ?? 'nieznany błąd'}`)
      setSubmitting(false)
      return
    }

    await supabase.from('deal_events').insert({
      deal_id: created.id,
      event_type: 'created',
      to_stage: data.stage,
      owner_id: user.id,
    })

    await revalidateDealRoutes()
    toast.success('Umowa utworzona')
    onSaved?.(created.id)
    router.refresh()
    onOpenChange(false)
    setSubmitting(false)
  }

  const error = (key: keyof DealFormValues) =>
    errors[key] ? (
      <p className="text-xs text-destructive mt-1">{errors[key]}</p>
    ) : null

  const nextActionInPast =
    values.next_action_date && values.next_action_date < todayISO()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {deal
              ? `Edycja umowy · ${stageLabel[values.stage]}`
              : 'Nowa umowa'}
          </DialogTitle>
          <DialogDescription>
            {deal
              ? 'Zmień dowolne pole — łącznie z etapem (Etap *). Zapisz, żeby utrwalić.'
              : 'Wypełnij dane sprzedaży. Etap możesz zmieniać później przeciągając kartę na tablicy.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Klient + produkt */}
          <section className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client_id">Klient *</Label>
              <FieldCombobox
                options={clientOptions}
                value={values.client_id || undefined}
                onChange={(id) => updateField('client_id', id ?? '')}
                placeholder="Wybierz klienta"
                required
                searchPlaceholder="Szukaj klienta..."
              />
              {error('client_id')}
            </div>

            <div className="space-y-2">
              <Label htmlFor="product_id">Produkt</Label>
              <FieldCombobox
                options={productOptions}
                value={values.product_id}
                onChange={(id) => updateField('product_id', id)}
                placeholder="Wybierz produkt (opcjonalnie)"
                searchPlaceholder="Szukaj produktu..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="person_id">Osoba kontaktowa</Label>
                <FieldCombobox
                  options={peopleOptions}
                  value={values.person_id}
                  onChange={(id) => updateField('person_id', id)}
                  placeholder="Wybierz osobę"
                  searchPlaceholder="Szukaj osoby..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier_id">Dostawca</Label>
                <FieldCombobox
                  options={supplierOptions}
                  value={values.supplier_id}
                  onChange={(id) => updateField('supplier_id', id)}
                  placeholder="Wybierz dostawcę"
                  searchPlaceholder="Szukaj dostawcy..."
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Etap + probability */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stage">Etap *</Label>
              <Select
                value={values.stage}
                onValueChange={(v) => updateField('stage', v as DealStage)}
              >
                <SelectTrigger id="stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error('stage')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="probability">
                Prawdopodobieństwo: {values.probability}%
              </Label>
              <Slider
                id="probability"
                min={0}
                max={100}
                step={5}
                value={[values.probability]}
                onValueChange={(arr) => updateField('probability', arr[0] ?? 0)}
                className="py-2"
              />
            </div>
          </section>

          <Separator />

          {/* Wartość */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Ilość</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={formatNum(values.quantity)}
                  onChange={(e) =>
                    updateField('quantity', parseNumOrNull(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Jednostka</Label>
                <Input
                  id="unit"
                  placeholder="kg / szt / paleta..."
                  value={values.unit ?? ''}
                  onChange={(e) => updateField('unit', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_price_buy">Cena zakupu (jednostkowa)</Label>
                <Input
                  id="unit_price_buy"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={formatNum(values.unit_price_buy)}
                  onChange={(e) =>
                    updateField('unit_price_buy', parseNumOrNull(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit_price_sell">
                  Cena sprzedaży (jednostkowa)
                </Label>
                <Input
                  id="unit_price_sell"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={formatNum(values.unit_price_sell)}
                  onChange={(e) =>
                    updateField('unit_price_sell', parseNumOrNull(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="total_value">
                    Wartość całkowita
                    {!totalOverridden && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (auto)
                      </span>
                    )}
                  </Label>
                  {totalOverridden && (
                    <button
                      type="button"
                      onClick={resetTotalOverride}
                      className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    >
                      Wylicz auto
                    </button>
                  )}
                </div>
                <Input
                  id="total_value"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={formatNum(values.total_value)}
                  onChange={(e) =>
                    updateField('total_value', parseNumOrNull(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Waluta</Label>
                <Select
                  value={values.currency}
                  onValueChange={(v) => updateField('currency', v)}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="UAH">UAH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Marża (kwotowa)</Label>
                <Input
                  readOnly
                  value={
                    values.margin_amount != null
                      ? values.margin_amount.toFixed(2)
                      : ''
                  }
                  className="bg-muted/50"
                  placeholder="—"
                />
              </div>
              <div className="space-y-2">
                <Label>Marża (%)</Label>
                <Input
                  readOnly
                  value={
                    values.margin_pct != null
                      ? `${values.margin_pct.toFixed(1)}%`
                      : ''
                  }
                  className="bg-muted/50"
                  placeholder="—"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Termin + akcje */}
          <section className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delivery_terms">Warunki dostawy</Label>
              <Input
                id="delivery_terms"
                placeholder="EXW magazyn / FCA Poznań / DDP Warszawa..."
                value={values.delivery_terms ?? ''}
                onChange={(e) => updateField('delivery_terms', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expected_close_date">
                  Planowana data zamknięcia
                </Label>
                <Input
                  id="expected_close_date"
                  type="date"
                  value={values.expected_close_date ?? ''}
                  onChange={(e) =>
                    updateField('expected_close_date', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next_action_date">Następna akcja — data</Label>
                <Input
                  id="next_action_date"
                  type="date"
                  value={values.next_action_date ?? ''}
                  onChange={(e) =>
                    updateField('next_action_date', e.target.value)
                  }
                />
                {nextActionInPast && (
                  <p className="text-xs text-amber-600">
                    Data akcji jest w przeszłości — pokaże się jako zaległa.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="next_action_note">Następna akcja — notatka</Label>
              <Textarea
                id="next_action_note"
                rows={2}
                placeholder="Zadzwonić do dyrektora zakupów, omówić warunki..."
                value={values.next_action_note ?? ''}
                onChange={(e) =>
                  updateField('next_action_note', e.target.value)
                }
              />
            </div>
          </section>

          <Separator />

          {/* Inne */}
          <section className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Tytuł umowy
                <span className="ml-2 text-xs text-muted-foreground">
                  (opcjonalnie — wyliczy się automatycznie)
                </span>
              </Label>
              <Input
                id="title"
                placeholder={buildAutoTitle()}
                value={values.title ?? ''}
                onChange={(e) => updateField('title', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notatki</Label>
              <Textarea
                id="notes"
                rows={3}
                value={values.notes ?? ''}
                onChange={(e) => updateField('notes', e.target.value)}
              />
            </div>
          </section>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner className="mr-2" />}
              {deal ? 'Zapisz zmiany' : 'Dodaj umowę'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
