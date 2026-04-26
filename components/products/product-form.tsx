'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

import { updateProduct } from '@/app/actions/products'
import {
  computeCostPln,
  computePriceTiers,
  type PricingSettings,
} from '@/lib/pricing'
import type { Product } from '@/lib/types'

interface SupplierOption {
  id: string
  name: string
}

interface ProductFormProps {
  product: Product
  suppliers: SupplierOption[]
  pricing: PricingSettings
  categorySuggestions: string[]
}

const SEASONALITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'available', label: 'Dostępny' },
  { value: 'low_stock', label: 'Niski stan' },
  { value: 'out_of_stock', label: 'Brak na stanie' },
  { value: 'seasonal', label: 'Sezonowy' },
]

const VERTICAL_OPTIONS: string[] = [
  'kiszonki',
  'surowki',
  'sałatki',
  'miod',
  'wedliny',
  'slodycze',
  'protein',
  'krochmal',
  'suszone_owoce',
  'soki',
  'warzywa',
  'inne',
]

const PUSH_TIER_LABELS: Record<number, string> = {
  1: '1 — Aktywny push',
  2: '2 — Drugi rząd',
  3: '3 — Cold storage',
}

const SENTINEL_NONE = '__none__'

const numToStr = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '' : String(v)

const parseNum = (s: string): number | null => {
  if (!s) return null
  const n = Number.parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function ProductForm({
  product,
  suppliers,
  pricing,
  categorySuggestions,
}: ProductFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(product.name)
  const [gramatura, setGramatura] = useState(product.gramatura ?? '')
  const [ean, setEan] = useState(product.ean ?? '')
  const [supplierId, setSupplierId] = useState<string>(
    product.supplier_id ?? '',
  )
  const [category, setCategory] = useState(product.category ?? '')
  const [pushTier, setPushTier] = useState<number>(product.push_tier ?? 2)
  const [isHero, setIsHero] = useState(product.is_hero ?? false)
  const [seasonality, setSeasonality] = useState<string>(
    product.seasonality_status ?? '',
  )
  const [tags, setTags] = useState<string>((product.tags ?? []).join(', '))

  const [costEur, setCostEur] = useState<string>(numToStr(product.cost_eur))
  const [costPln, setCostPln] = useState<string>(numToStr(product.cost_pln))
  const [priceMalyOpt, setPriceMalyOpt] = useState<string>(
    numToStr(product.price_maly_opt),
  )
  const [priceSredni, setPriceSredni] = useState<string>(
    numToStr(product.price_sredni),
  )
  const [priceDuzy, setPriceDuzy] = useState<string>(
    numToStr(product.price_duzy),
  )
  const [priceDuziGracze, setPriceDuziGracze] = useState<string>(
    numToStr(product.price_duzi_gracze),
  )
  const [priceMin, setPriceMin] = useState<string>(numToStr(product.price_min))
  const [vatRate, setVatRate] = useState<string>(numToStr(product.vat_rate))

  const [shelfLifeDays, setShelfLifeDays] = useState<string>(
    numToStr(product.shelf_life_days),
  )
  const [unit, setUnit] = useState(product.unit ?? 'szt')
  const [vertical, setVertical] = useState<string>(product.vertical ?? '')

  // Auto-recompute cost_pln when cost_eur changes (using current settings).
  useEffect(() => {
    const eur = parseNum(costEur)
    if (eur == null) {
      setCostPln('')
      return
    }
    const pln = computeCostPln(
      eur,
      pricing.kurs_eur_pln,
      pricing.overhead_multiplier,
    )
    setCostPln(pln.toFixed(2))
  }, [costEur, pricing.kurs_eur_pln, pricing.overhead_multiplier])

  const recomputePriceTiers = () => {
    const pln = parseNum(costPln)
    if (pln == null || pln <= 0) {
      toast.error('Najpierw uzupełnij Koszt EUR — koszt PLN musi być > 0')
      return
    }
    const tiers = computePriceTiers(pln, pricing)
    setPriceMalyOpt(tiers.price_maly_opt.toFixed(2))
    setPriceSredni(tiers.price_sredni.toFixed(2))
    setPriceDuzy(tiers.price_duzy.toFixed(2))
    setPriceDuziGracze(tiers.price_duzi_gracze.toFixed(2))
    setPriceMin(tiers.price_min.toFixed(2))
    toast.success('Ceny przeliczone z marż w Ustawieniach')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const tagsArr = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    startTransition(async () => {
      const result = await updateProduct(product.id, {
        name: name.trim(),
        gramatura: gramatura.trim() || null,
        ean: ean.trim() || null,
        supplier_id: supplierId || null,
        category: category.trim() || null,
        push_tier: pushTier,
        is_hero: isHero,
        seasonality_status:
          (seasonality as
            | 'available'
            | 'low_stock'
            | 'out_of_stock'
            | 'seasonal') || null,
        tags: tagsArr,
        cost_eur: parseNum(costEur),
        cost_pln: parseNum(costPln),
        price_maly_opt: parseNum(priceMalyOpt),
        price_sredni: parseNum(priceSredni),
        price_duzy: parseNum(priceDuzy),
        price_duzi_gracze: parseNum(priceDuziGracze),
        price_min: parseNum(priceMin),
        vat_rate: parseNum(vatRate),
        shelf_life_days: shelfLifeDays
          ? Number.parseInt(shelfLifeDays, 10)
          : null,
        unit: unit.trim() || null,
        vertical: vertical || null,
      })
      if (!result.ok) {
        toast.error(`Nie zapisano: ${result.error}`)
        return
      }
      toast.success('Zapisano zmiany')
      router.push('/products')
      router.refresh()
    })
  }

  const supplierLabel = useMemo(() => {
    return suppliers.find((s) => s.id === supplierId)?.name ?? '—'
  }, [suppliers, supplierId])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">Podstawowe</TabsTrigger>
          <TabsTrigger value="pricing">Ceny</TabsTrigger>
          <TabsTrigger value="logistics">Logistyka</TabsTrigger>
          <TabsTrigger value="meta">Meta</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nazwa *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gramatura">Gramatura</Label>
                  <Input
                    id="gramatura"
                    value={gramatura}
                    onChange={(e) => setGramatura(e.target.value)}
                    placeholder="np. 3000 g"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ean">EAN</Label>
                  <Input
                    id="ean"
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supplier_id">Dostawca</Label>
                  <Select
                    value={supplierId || SENTINEL_NONE}
                    onValueChange={(v) =>
                      setSupplierId(v === SENTINEL_NONE ? '' : v)
                    }
                  >
                    <SelectTrigger id="supplier_id">
                      <SelectValue placeholder="Wybierz dostawcę">
                        {supplierLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SENTINEL_NONE}>— Brak —</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Kategoria</Label>
                  <Input
                    id="category"
                    list="category-suggestions"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                  <datalist id="category-suggestions">
                    {categorySuggestions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="seasonality">Status sezonowy</Label>
                  <Select
                    value={seasonality || SENTINEL_NONE}
                    onValueChange={(v) =>
                      setSeasonality(v === SENTINEL_NONE ? '' : v)
                    }
                  >
                    <SelectTrigger id="seasonality">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SENTINEL_NONE}>— Brak —</SelectItem>
                      {SEASONALITY_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Push tier: {PUSH_TIER_LABELS[pushTier]}</Label>
                  <Slider
                    min={1}
                    max={3}
                    step={1}
                    value={[pushTier]}
                    onValueChange={(arr) => setPushTier(arr[0] ?? 2)}
                    className="py-2"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="is_hero">Hero / bestseller</Label>
                  <p className="text-xs text-muted-foreground">
                    Oznaczony gwiazdką w kanban deal-ach.
                  </p>
                </div>
                <Switch
                  id="is_hero"
                  checked={isHero}
                  onCheckedChange={setIsHero}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tagi</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="bestseller, clean_label, sezon (oddziel przecinkiem)"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cost_eur">Koszt EUR</Label>
                  <Input
                    id="cost_eur"
                    type="number"
                    step="0.01"
                    min="0"
                    value={costEur}
                    onChange={(e) => setCostEur(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost_pln">Koszt PLN (auto)</Label>
                  <Input
                    id="cost_pln"
                    type="number"
                    step="0.01"
                    value={costPln}
                    readOnly
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    EUR × {pricing.kurs_eur_pln} (kurs) ×{' '}
                    {pricing.overhead_multiplier} (narzut)
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Ceny obliczane z marż w Ustawieniach. Możesz nadpisać
                  pojedyncze wartości.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={recomputePriceTiers}
                >
                  Przelicz wszystkie
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <PriceField
                  id="price_maly_opt"
                  label="Mały opt"
                  margin={pricing.margin_maly_opt}
                  value={priceMalyOpt}
                  onChange={setPriceMalyOpt}
                />
                <PriceField
                  id="price_sredni"
                  label="Średni opt"
                  margin={pricing.margin_sredni_opt}
                  value={priceSredni}
                  onChange={setPriceSredni}
                />
                <PriceField
                  id="price_duzy"
                  label="Duży opt"
                  margin={pricing.margin_duzy_opt}
                  value={priceDuzy}
                  onChange={setPriceDuzy}
                />
                <PriceField
                  id="price_duzi_gracze"
                  label="Duzi gracze (katalog)"
                  margin={pricing.margin_strategic_katalog}
                  value={priceDuziGracze}
                  onChange={setPriceDuziGracze}
                />
                <PriceField
                  id="price_min"
                  label="Cena minimalna (Docel)"
                  margin={pricing.margin_strategic_docel}
                  value={priceMin}
                  onChange={setPriceMin}
                />
                <div className="space-y-2">
                  <Label htmlFor="vat_rate">Stawka VAT</Label>
                  <Input
                    id="vat_rate"
                    type="number"
                    step="0.001"
                    min="0"
                    max="1"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    0.05 = 5% (food). 0.08 = 8% (deli). 0.23 = 23% (non-food).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logistics">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shelf_life_days">
                    Termin przydatności (dni)
                  </Label>
                  <Input
                    id="shelf_life_days"
                    type="number"
                    min="0"
                    value={shelfLifeDays}
                    onChange={(e) => setShelfLifeDays(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Jednostka</Label>
                  <Input
                    id="unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="szt / kg / paleta"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meta">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="vertical">Wertykał</Label>
                <Select
                  value={vertical || SENTINEL_NONE}
                  onValueChange={(v) =>
                    setVertical(v === SENTINEL_NONE ? '' : v)
                  }
                >
                  <SelectTrigger id="vertical">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENTINEL_NONE}>— Brak —</SelectItem>
                    {VERTICAL_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder="Notes (TODO: dedicated notes column on products if Vadym wants it)."
                disabled
                className="bg-muted/50"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner className="mr-2" />}
          Zapisz zmiany
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Anuluj
        </Button>
      </div>
    </form>
  )
}

function PriceField({
  id,
  label,
  margin,
  value,
  onChange,
}: {
  id: string
  label: string
  margin: number
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          marża {(margin * 100).toFixed(0)}%
        </span>
      </Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
