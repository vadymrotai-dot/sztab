'use client'

import { useState, useTransition } from 'react'
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
import { Spinner } from '@/components/ui/spinner'

import { createProduct } from '@/app/actions/products'

interface SupplierOption {
  id: string
  name: string
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
  const [costEur, setCostEur] = useState('')
  const [isHero, setIsHero] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const reset = () => {
    setName('')
    setGramatura('')
    setEan('')
    setSupplierId('')
    setCategory('')
    setCostEur('')
    setIsHero(false)
    setErrors({})
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (name.trim().length < 2) errs.name = 'Nazwa wymagana (min 2 znaki)'
    if (!gramatura.trim()) errs.gramatura = 'Gramatura wymagana'
    if (!supplierId) errs.supplier_id = 'Wybierz dostawcę'
    const cost = Number.parseFloat(costEur.replace(',', '.'))
    if (!Number.isFinite(cost) || cost <= 0)
      errs.cost_eur = 'Koszt EUR wymagany i > 0'
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
        cost_eur: cost,
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
            Wpisz koszt EUR — ceny w 5 progach policzą się automatycznie z
            marż w Ustawieniach. Pełną edycję zrobisz po dodaniu.
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
                <p className="text-xs text-destructive">
                  {errors.gramatura}
                </p>
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
                    {s.name}
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
              {errors.cost_eur && (
                <p className="text-xs text-destructive">{errors.cost_eur}</p>
              )}
            </div>
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
