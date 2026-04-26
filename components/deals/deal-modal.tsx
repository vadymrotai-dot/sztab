'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckIcon, ChevronsUpDownIcon, TrashIcon, ListIcon } from 'lucide-react'

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
  products: DealModalProduct[] // kept for API compat with Phase 1 wrappers; unused in v2 shell
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
  person_id: z.string().optional(),
  supplier_id: z.string().optional(),
  stage: z.enum(dealStageValues),
  probability: z.number().min(0).max(100),
  currency: z.string().min(3).max(3),
  deal_type: z.enum(['reseller', 'agent', 'partner']).optional().nullable(),
  commission_pct: z.number().min(0).max(100).nullable().optional(),
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

const buildInitialValues = (
  deal: Deal | undefined,
  defaults: DealModalDefaults | undefined,
): DealFormValues => ({
  client_id: deal?.client_id ?? defaults?.client_id ?? '',
  person_id: deal?.person_id ?? undefined,
  supplier_id: deal?.supplier_id ?? undefined,
  stage: deal?.stage ?? defaults?.stage ?? 'lead',
  probability: deal?.probability ?? 30,
  currency: deal?.currency ?? 'PLN',
  deal_type: deal?.deal_type ?? null,
  commission_pct: deal?.commission_pct ?? null,
  delivery_terms: deal?.delivery_terms ?? '',
  expected_close_date:
    deal?.expected_close_date ?? deal?.close_date ?? '',
  next_action_date: deal?.next_action_date ?? '',
  next_action_note: deal?.next_action_note ?? '',
  notes: deal?.notes ?? '',
  title: deal?.title ?? '',
})

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
  searchPlaceholder = 'Szukaj...',
}: {
  options: ComboOption[]
  value?: string
  onChange: (id: string | undefined) => void
  placeholder: string
  required?: boolean
  searchPlaceholder?: string
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
            <CommandEmpty>Nie znaleziono.</CommandEmpty>
            <CommandGroup>
              {!required && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                >
                  <span className="text-muted-foreground italic">— Brak —</span>
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
  people,
  suppliers,
  onSaved,
}: DealModalProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const mergedDefaults: DealModalDefaults = (() => {
    const url = readUrlDefaults()
    return {
      client_id: defaults?.client_id ?? url.client_id,
      stage: defaults?.stage ?? url.stage,
    }
  })()

  const [values, setValues] = useState<DealFormValues>(() =>
    buildInitialValues(deal, mergedDefaults),
  )
  const [errors, setErrors] = useState<
    Partial<Record<keyof DealFormValues, string>>
  >({})
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const clientOptions: ComboOption[] = useMemo(
    () => clients.map((c) => ({ id: c.id, label: c.title })),
    [clients],
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
      if (key === 'client_id') {
        // Clear person if it doesn't belong to the new client.
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

  const buildAutoTitle = (): string => {
    const clientTitle = clients.find((c) => c.id === values.client_id)?.title
    return clientTitle ? `Szansa: ${clientTitle}` : 'Nowa szansa'
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
      toast.error('Sprawdź pola formularza')
      return
    }

    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Sesja wygasła. Zaloguj się ponownie.')
      setSubmitting(false)
      return
    }

    const data = parsed.data
    const titleToSave = data.title?.trim() || buildAutoTitle()

    // v2 shell payload: no single-product fields. total_value is computed
    // by the recompute_deal_total trigger from deal_items, so we don't
    // touch it here. amount column kept at 0 as a legacy mirror — old
    // dashboards that still read it will see total_value via the
    // refreshed row.
    const payload = {
      title: titleToSave,
      client_id: data.client_id,
      person_id: data.person_id ?? null,
      supplier_id: data.supplier_id ?? null,
      stage: data.stage,
      probability: data.probability,
      currency: data.currency,
      deal_type: data.deal_type ?? null,
      commission_pct:
        data.deal_type === 'agent' ? (data.commission_pct ?? null) : null,
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
      toast.success('Szansa zaktualizowana')
      onSaved?.(deal.id)
      router.refresh()
      onOpenChange(false)
      setSubmitting(false)
      return
    }

    // Create — leaves user on /deals/[id] so they can add Pozycje there.
    const { data: created, error } = await supabase
      .from('deals')
      .insert({ ...payload, owner_id: user.id, amount: 0 })
      .select('id')
      .single()

    if (error || !created) {
      toast.error(
        `Nie udało się utworzyć szansy: ${error?.message ?? 'nieznany błąd'}`,
      )
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
    toast.success('Szansa utworzona — dodaj pozycje na stronie szansy')
    onSaved?.(created.id)
    onOpenChange(false)
    router.push(`/deals/${created.id}`)
    setSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deal) return
    setDeleting(true)
    setDeleteConfirmOpen(false)
    const { error } = await supabase.from('deals').delete().eq('id', deal.id)
    if (error) {
      toast.error(`Nie udało się usunąć: ${error.message}`)
      setDeleting(false)
      return
    }
    await revalidateDealRoutes()
    toast.success('Szansa usunięta')
    setDeleting(false)
    onOpenChange(false)
    router.push('/deals')
  }

  const error = (key: keyof DealFormValues) =>
    errors[key] ? (
      <p className="text-xs text-destructive mt-1">{errors[key]}</p>
    ) : null

  const nextActionInPast =
    values.next_action_date && values.next_action_date < todayISO()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {deal
              ? `Edycja szansy · ${stageLabel[values.stage]}`
              : 'Nowa szansa'}
          </DialogTitle>
          <DialogDescription>
            {deal
              ? 'Edytuj dane szansy. Pozycje (produkty) edytujesz na stronie szczegółów szansy.'
              : 'Wypełnij dane szansy. Po zapisaniu zostaniesz przeniesiony na stronę szansy, gdzie dodasz pozycje (produkty).'}
          </DialogDescription>
        </DialogHeader>

        {!deal && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <ListIcon className="mb-1 inline size-3.5" /> Multi-product:
            wartość szansy obliczy się z pozycji (line items). Zapisz dane
            podstawowe — następnie dodawaj produkty na stronie szczegółów.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Osoba kontaktowa</Label>
                <FieldCombobox
                  options={peopleOptions}
                  value={values.person_id}
                  onChange={(id) => updateField('person_id', id)}
                  placeholder="Wybierz osobę"
                  searchPlaceholder="Szukaj osoby..."
                />
              </div>
              <div className="space-y-2">
                <Label>Dostawca (główny)</Label>
                <FieldCombobox
                  options={supplierOptions}
                  value={values.supplier_id}
                  onChange={(id) => updateField('supplier_id', id)}
                  placeholder="Pomocniczo — auto z pozycji"
                  searchPlaceholder="Szukaj dostawcy..."
                />
              </div>
            </div>
          </section>

          <Separator />

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

          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deal_type">Typ szansy</Label>
                <Select
                  value={values.deal_type ?? '__none__'}
                  onValueChange={(v) =>
                    updateField(
                      'deal_type',
                      v === '__none__' ? null : (v as 'reseller' | 'agent' | 'partner'),
                    )
                  }
                >
                  <SelectTrigger id="deal_type">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Brak —</SelectItem>
                    <SelectItem value="reseller">Reseller</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {values.deal_type === 'agent' && (
                <div className="space-y-2">
                  <Label htmlFor="commission_pct">Prowizja (%)</Label>
                  <Input
                    id="commission_pct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={values.commission_pct ?? ''}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value)
                      updateField(
                        'commission_pct',
                        Number.isFinite(v) ? v : null,
                      )
                    }}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery_terms">Warunki dostawy</Label>
              <Input
                id="delivery_terms"
                placeholder="EXW magazyn / FCA Poznań / DDP Warszawa..."
                value={values.delivery_terms ?? ''}
                onChange={(e) => updateField('delivery_terms', e.target.value)}
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="next_action_date">
                  Następna akcja — data
                </Label>
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
              <div className="space-y-2">
                <Label htmlFor="title">
                  Tytuł szansy
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (opcjonalnie)
                  </span>
                </Label>
                <Input
                  id="title"
                  placeholder={buildAutoTitle()}
                  value={values.title ?? ''}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_action_note">
                Następna akcja — notatka
              </Label>
              <Textarea
                id="next_action_note"
                rows={2}
                placeholder="Zadzwonić do dyrektora zakupów..."
                value={values.next_action_note ?? ''}
                onChange={(e) =>
                  updateField('next_action_note', e.target.value)
                }
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
            {deal && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={submitting || deleting}
                className="mr-auto"
              >
                <TrashIcon className="mr-2 size-4" />
                Usuń szansę
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting || deleting}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={submitting || deleting}>
              {submitting && <Spinner className="mr-2" />}
              {deal ? 'Zapisz zmiany' : 'Dodaj szansę i przejdź do pozycji'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {deal && (
        <AlertDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usunąć szansę?</AlertDialogTitle>
              <AlertDialogDescription>
                Usuwasz „{deal.title}". Wszystkie pozycje (deal_items) zostaną
                również usunięte (CASCADE). Tej akcji nie można cofnąć.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Spinner className="mr-2" />}
                Usuń szansę
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  )
}
