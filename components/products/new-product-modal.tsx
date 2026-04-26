'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlusIcon } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'

import { createProduct } from '@/app/actions/products'
import type { Currency } from '@/lib/pricing'

export interface SupplierOption {
  id: string
  name: string
  default_currency: Currency
}

interface NewProductModalProps {
  suppliers: SupplierOption[]
  categorySuggestions: string[]
}

export function NewProductModal({
  suppliers,
  categorySuggestions,
}: NewProductModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [gramatura, setGramatura] = useState('')
  const [ean, setEan] = useState('')
  const [supplierId, setSupplierId] = useState<string>('')
  const [category, setCategory] = useState('')
  const [currency, setCurrency] = useState<Currency>('PLN')
  const [costEur, setCostEur] = useState('')
  const [costPln, setCostPln] = useState('')
  const [isHero, setIsHero] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // When supplier changes, switch the currency hint to whatever that
  // supplier defaults to. Doesn't touch the already-typed cost values
  // because changing supplier mid-edit usually means swapping a single
  // dropdown, not invalidating the whole row.
  useEffect(() => {
    if (!supplierId) return
    const sup = suppliers.find((s) => s.id === supplierId)
    if (sup) setCurrency(sup.default_currency)
  }, [supplierId, suppliers])

  const reset = () => {
    setName('')
    setGramatura('')
    setEan('')
    setSupplierId('')
    setCategory('')
    setCurrency('PLN')
    setCostEur('')
    setCostPln('')
    setIsHero(false)
    setErrors({})
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (name.trim().length < 2) errs.name = 'Nazwa wymagana (min 2 znaki)'
    if (!gramatura.trim()) errs.gramatura = 'Gramatura wymagana'
    if (!supplierId) errs.supplier_id = 'Wybierz dostawcę'

    let costEurVal: number | null = null
    let costPlnVal: number | null = null
    if (currency === 'EUR') {
      const v = Number.parseFloat(costEur.replace(',', '.'))
      if (!Number.isFinite(v) || v <= 0) errs.cost = 'Koszt EUR wymagany i > 0'
      else costEurVal = v
    } else {
      const v = Number.parseFloat(costPln.replace(',', '.'))
      if (!Number.isFinite(v) || v <= 0) errs.cost = 'Koszt PLN wymagany i > 0'
      else costPlnVal = v
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})

    startTransition(async () => {
      const result = await createProduct({
        name: name.trim(),
        gramatura: gramatura.trim(),
        ean: ean.trim() || null,
        supplier_id: supplierId,
        category: category.trim() || null,
        cost_eur: costEurVal,
        cost_pln: costPlnVal,
        is_hero: isHero,
      })
      if (!result.ok) {
        toast.error(`Nie udało się dodać: ${result.error}`)
        return
      }
      toast.success(
        'Produkt dodany — ceny obliczone automatycznie z marż w ustawieniach.',
      )
      reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 size-4" />
          Dodaj produkt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowy produkt</DialogTitle>
          <DialogDescription>
            Wpisz koszt — ceny w 5 progach policzą się automatycznie z marż w
            Ustawieniach. Pełną edycję zrobisz po dodaniu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nazwa *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Kapusta kiszona"
              required
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gramatura">Gramatura *</Label>
              <Input
                id="gramatura"
                value={gramatura}
                onChange={(e) => setGramatura(e.target.value)}
                placeholder="np. 3000 g"
                required
              />
              {errors.gramatura && (
                <p className="text-xs text-destructive">{errors.gramatura}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ean">EAN</Label>
              <Input
                id="ean"
                value={ean}
                onChange={(e) => setEan(e.target.value)}
                placeholder="opcjonalnie"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier_id">Dostawca *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="supplier_id">
                <SelectValue placeholder="Wybierz dostawcę" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{' '}
                    <span className="ml-2 text-xs text-muted-foreground">
                      · domyślnie {s.default_currency}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.supplier_id && (
              <p className="text-xs text-destructive">{errors.supplier_id}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Kategoria</Label>
              <Input
                id="category"
                list="category-suggestions"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="np. kiszonki_kapusty"
              />
              <datalist id="category-suggestions">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Waluta kosztu</Label>
              <RadioGroup
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                className="flex gap-4 pt-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="PLN" id="curr-pln" />
                  <Label htmlFor="curr-pln" className="cursor-pointer">PLN</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="EUR" id="curr-eur" />
                  <Label htmlFor="curr-eur" className="cursor-pointer">EUR</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <div className="space-y-2">
            {currency === 'EUR' ? (
              <>
                <Label htmlFor="cost_eur">Koszt EUR *</Label>
                <Input
                  id="cost_eur"
                  type="number"
                  min="0"
                  step="0.01"
                  value={costEur}
                  onChange={(e) => setCostEur(e.target.value)}
                  placeholder="np. 1.60"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Koszt PLN obliczy się automatycznie z kursu × narzut.
                </p>
              </>
            ) : (
              <>
                <Label htmlFor="cost_pln">Koszt PLN *</Label>
                <Input
                  id="cost_pln"
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPln}
                  onChange={(e) => setCostPln(e.target.value)}
                  placeholder="np. 7.50"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Cena bezpośrednio od polskiego dostawcy. Bez przeliczeń.
                </p>
              </>
            )}
            {errors.cost && (
              <p className="text-xs text-destructive">{errors.cost}</p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="is_hero">Hero / bestseller</Label>
              <p className="text-xs text-muted-foreground">
                Hero pozycje są oznaczone gwiazdką i wskakują na push_tier=1.
              </p>
            </div>
            <Switch
              id="is_hero"
              checked={isHero}
              onCheckedChange={setIsHero}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                reset()
              }}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner className="mr-2" />}
              Dodaj produkt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
