'use client'

import { useState, useTransition } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { updateSupplier } from '@/app/actions/suppliers'
import type {
  Supplier,
  SupplierDealType,
  SupplierType,
} from '@/lib/types'

const VERTICAL_OPTIONS = [
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

interface EditSupplierFormProps {
  supplier: Supplier
}

export function EditSupplierForm({ supplier }: EditSupplierFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(supplier.name)
  const [legalName, setLegalName] = useState(supplier.legal_name ?? '')
  const [type, setType] = useState<SupplierType>(supplier.type)
  const [dealType, setDealType] = useState<SupplierDealType>(
    supplier.deal_type ?? 'reseller',
  )
  const [commissionPct, setCommissionPct] = useState(
    supplier.commission_pct?.toString() ?? '',
  )
  const [verticals, setVerticals] = useState<string[]>(
    supplier.verticals ?? [],
  )
  const [exclusiveTerritory, setExclusiveTerritory] = useState(
    supplier.exclusive_territory ?? '',
  )
  const [exclusivityScope, setExclusivityScope] = useState(
    (supplier.exclusivity_scope ?? []).join('\n'),
  )
  const [exclusiveUntil, setExclusiveUntil] = useState(
    supplier.exclusive_until ?? '',
  )
  const [moqValue, setMoqValue] = useState(
    supplier.moq_value?.toString() ?? '',
  )
  const [leadTimeDays, setLeadTimeDays] = useState(
    supplier.lead_time_days?.toString() ?? '',
  )
  const [paymentTerms, setPaymentTerms] = useState(
    supplier.payment_terms ?? '',
  )
  const [reliabilityScore, setReliabilityScore] = useState(
    supplier.reliability_score ?? 5,
  )
  const [notes, setNotes] = useState(supplier.notes ?? '')

  const toggleVertical = (v: string) => {
    setVerticals((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (dealType === 'agent') {
      const parsed = Number.parseFloat(commissionPct)
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        toast.error('Prowizja musi być w zakresie 0-100% dla agenta')
        return
      }
    }

    const exclusivityScopeArr = exclusivityScope
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const moqParsed = moqValue ? Number.parseFloat(moqValue) : null
    const leadParsed = leadTimeDays
      ? Number.parseInt(leadTimeDays, 10)
      : null
    const commissionParsed =
      dealType === 'agent' && commissionPct
        ? Number.parseFloat(commissionPct)
        : null

    startTransition(async () => {
      const result = await updateSupplier(supplier.id, {
        name,
        legal_name: legalName.trim() || null,
        type,
        deal_type: dealType,
        commission_pct: commissionParsed,
        verticals: verticals.length > 0 ? verticals : null,
        exclusivity_scope:
          exclusivityScopeArr.length > 0 ? exclusivityScopeArr : null,
        exclusive_territory: exclusiveTerritory.trim() || null,
        exclusive_until: exclusiveUntil || null,
        moq_value: moqParsed,
        lead_time_days: leadParsed,
        payment_terms: paymentTerms.trim() || null,
        reliability_score: reliabilityScore,
        notes: notes.trim() || null,
      })

      if (!result.ok) {
        toast.error(`Nie zapisano: ${result.error}`)
        return
      }
      toast.success('Zapisano zmiany')
      router.push('/suppliers')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">Podstawowe</TabsTrigger>
          <TabsTrigger value="branza">Branża i terytorium</TabsTrigger>
          <TabsTrigger value="logistics">Logistyka</TabsTrigger>
          <TabsTrigger value="rating">Ocena</TabsTrigger>
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
              <div className="space-y-2">
                <Label htmlFor="legal_name">Pełna nazwa prawna</Label>
                <Input
                  id="legal_name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="type">Rodzaj *</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => setType(v as SupplierType)}
                  >
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producent">Producent</SelectItem>
                      <SelectItem value="trader">Trader</SelectItem>
                      <SelectItem value="posrednik">Pośrednik</SelectItem>
                      <SelectItem value="wlasna_marka">
                        Własna marka
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deal_type">Typ współpracy *</Label>
                  <Select
                    value={dealType}
                    onValueChange={(v) =>
                      setDealType(v as SupplierDealType)
                    }
                  >
                    <SelectTrigger id="deal_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reseller">Reseller</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {dealType === 'agent' && (
                <div className="space-y-2">
                  <Label htmlFor="commission_pct">Prowizja (%) *</Label>
                  <Input
                    id="commission_pct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(e.target.value)}
                    placeholder="np. 5.00"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="notes">Notatki</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branza">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label>Branże</Label>
                <div className="flex flex-wrap gap-2">
                  {VERTICAL_OPTIONS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleVertical(v)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        verticals.includes(v)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exclusive_territory">
                  Terytorium wyłączności
                </Label>
                <Input
                  id="exclusive_territory"
                  value={exclusiveTerritory}
                  onChange={(e) => setExclusiveTerritory(e.target.value)}
                  placeholder="np. Mazowieckie + Lubelskie"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exclusivity_scope">
                  Zakres wyłączności
                </Label>
                <Textarea
                  id="exclusivity_scope"
                  rows={4}
                  value={exclusivityScope}
                  onChange={(e) => setExclusivityScope(e.target.value)}
                  placeholder="Opis zakresu wyłączności — produkty, kanały, ograniczenia (jedna pozycja na linię)"
                />
                <p className="text-xs text-muted-foreground">
                  Każda linia zostanie zapisana jako osobny element listy.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exclusive_until">Wyłączność do</Label>
                <Input
                  id="exclusive_until"
                  type="date"
                  value={exclusiveUntil}
                  onChange={(e) => setExclusiveUntil(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logistics">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="moq_value">Minimum zamówienia (PLN)</Label>
                <Input
                  id="moq_value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={moqValue}
                  onChange={(e) => setMoqValue(e.target.value)}
                  placeholder="Minimum order value"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead_time_days">
                  Czas realizacji (dni)
                </Label>
                <Input
                  id="lead_time_days"
                  type="number"
                  min="0"
                  max="365"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  placeholder="0-365 dni"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_terms">Warunki płatności</Label>
                <Input
                  id="payment_terms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="np. 14 dni netto, przedpłata 30%"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rating">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <Label>Wiarygodność: {reliabilityScore}/10</Label>
                  <span className="text-xs text-muted-foreground">
                    Słaba ← Bardzo dobra
                  </span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[reliabilityScore]}
                  onValueChange={(arr) =>
                    setReliabilityScore(arr[0] ?? 5)
                  }
                />
              </div>
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
