'use client'

// components/clients/predictions-section.tsx
// Sprint S6D Day 4 (12.05.2026) — monthly ingredient prediction UI.
//
// Conditional render — тільки для client_type='gastronomia' (caller decides).
// Position: ПІД MenuSection на /clients/{id}.
//
// 3 coverage tiers determined server-side (lib/predictions/aggregate-ingredients.ts):
//   - 'full_menu' (75% confidence): >15 dishes + AI extract
//   - 'popular_only' (60%): 1-15 dishes + AI extrapolate
//   - 'subtype_only' (50%): no menu — subtype defaults
//
// Has [Skoryguj rzeczywiste dane] button → opens Dialog з per-ingredient
// form. Saves via server action savePredictionCorrection (Protocol 34).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PencilIcon, CheckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { savePredictionCorrection } from '@/app/clients/[id]/actions/save-prediction-correction'

export type CoverageTier = 'full_menu' | 'popular_only' | 'subtype_only'
export type DishesSource = 'www_menu' | 'wedo_pdf_menu' | 'gmaps_menu' | 'subtype_default'

export interface AggregatedIngredient {
  name: string
  name_normalized: string
  kg_low: number
  kg_mid: number
  kg_high: number
  source_dish_count: number
  avg_confidence: number
}

export interface PredictionVolume {
  customers_low: number
  customers_mid: number
  customers_high: number
  visits_mid: number
  monthly_reviews: number
  subtype_used: string
  months_used: number
  formula_params: {
    conversion_mid: number
    subtype_frequency: number
    location_multiplier: number
  }
}

interface Props {
  predictionId: string | null
  coverage: CoverageTier
  predictionConfidence: number
  dishesCount: number
  dishesSource: DishesSource
  volume: PredictionVolume
  ingredients: AggregatedIngredient[]
  reviewsCount: number
}

const COVERAGE_LABELS: Record<CoverageTier, { label: string; tone: string }> = {
  full_menu: { label: 'Pełne menu', tone: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  popular_only: { label: 'Tylko popularne', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  subtype_only: { label: 'Bez menu — szacunek po typie', tone: 'bg-orange-100 text-orange-900 border-orange-300' },
}

const SOURCE_LABELS: Record<DishesSource, string> = {
  www_menu: 'WWW menu (HTML)',
  wedo_pdf_menu: 'PDF menu (OCR)',
  gmaps_menu: 'Google Maps (popularne)',
  subtype_default: 'Domyślnie wg podtypu',
}

function formatKg(value: number): string {
  if (value < 1) return `${(value * 1000).toFixed(0)}g`
  if (value < 10) return `${value.toFixed(1)} kg`
  return `${Math.round(value)} kg`
}

export function PredictionsSection({
  predictionId,
  coverage,
  predictionConfidence,
  dishesCount,
  dishesSource,
  volume,
  ingredients,
  reviewsCount,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()
  const [actualKg, setActualKg] = useState<Record<string, string>>({})
  const [source, setSource] = useState<'invoice' | 'client_call' | 'estimate'>('estimate')
  const [notes, setNotes] = useState('')

  const coverageMeta = COVERAGE_LABELS[coverage]
  const sourceLabel = SOURCE_LABELS[dishesSource]
  const confidencePct = Math.round(predictionConfidence * 100)

  const handleSave = () => {
    if (!predictionId || busy) return
    const parsedKg: Record<string, number> = {}
    for (const [name, valStr] of Object.entries(actualKg)) {
      const v = parseFloat(valStr.replace(',', '.'))
      if (Number.isFinite(v) && v >= 0) parsedKg[name] = v
    }
    if (Object.keys(parsedKg).length === 0) {
      toast.error('Wpisz przynajmniej jeden składnik')
      return
    }
    setBusy(true)
    const toastId = toast.loading('Zapisuję korektę...')
    startTransition(async () => {
      const result = await savePredictionCorrection({
        predictionId,
        actualKg: parsedKg,
        source,
        notes: notes.trim() || undefined,
      })
      if (!result.ok) {
        toast.error(result.error ?? 'Nie udało się zapisać', { id: toastId })
        setBusy(false)
        return
      }
      toast.success(
        `Korekta zapisana (współczynnik ${result.correctionFactor?.toFixed(2) ?? '?'})`,
        { id: toastId },
      )
      setOpen(false)
      setBusy(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">📈 Orientacyjna miesięczna potrzeba</h3>
        <Badge variant="outline" className={coverageMeta.tone}>
          {coverageMeta.label} · {confidencePct}%
        </Badge>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Źródło: {sourceLabel}
        </span>
      </div>

      {/* Volume header */}
      <div className="mb-3 rounded border border-blue-100 bg-blue-50 p-3 text-sm">
        <p className="font-medium text-blue-900">
          ~{volume.visits_mid.toLocaleString('pl-PL')} obiadów/mies
        </p>
        <p className="mt-0.5 text-xs text-blue-800">
          Zakres: {volume.customers_low.toLocaleString('pl-PL')} – {volume.customers_high.toLocaleString('pl-PL')} klientów × {volume.formula_params.subtype_frequency} odwiedzin
        </p>
      </div>

      {/* Ingredients table */}
      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak danych — uruchom &quot;Pełna re-analiza&quot;.</p>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-2 border-b pb-1 text-xs font-medium text-muted-foreground">
            <div className="col-span-6">Składnik</div>
            <div className="col-span-2 text-right">Niska</div>
            <div className="col-span-2 text-right">Średnia</div>
            <div className="col-span-2 text-right">Wysoka</div>
          </div>
          {ingredients.map((ing) => (
            <div
              key={ing.name_normalized}
              className="grid grid-cols-12 gap-2 text-sm hover:bg-gray-50"
            >
              <div className="col-span-6 flex items-center gap-1">
                <span>{ing.name}</span>
                {ing.source_dish_count > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    ({ing.source_dish_count} dań)
                  </span>
                )}
              </div>
              <div className="col-span-2 text-right font-mono text-xs text-muted-foreground">
                {formatKg(ing.kg_low)}
              </div>
              <div className="col-span-2 text-right font-mono text-xs font-semibold">
                {formatKg(ing.kg_mid)}
              </div>
              <div className="col-span-2 text-right font-mono text-xs text-muted-foreground">
                {formatKg(ing.kg_high)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer formula explanation */}
      <div className="mt-3 rounded bg-gray-50 p-2 text-[11px] text-muted-foreground">
        <strong>Podstawa:</strong> {reviewsCount} opinii Google × {volume.formula_params.conversion_mid}× konwersji ÷ {volume.months_used} mies = {volume.customers_mid} klientów/mies × {volume.formula_params.subtype_frequency}× ({volume.subtype_used}) × {volume.formula_params.location_multiplier} lok = {volume.visits_mid} obiadów/mies
      </div>

      {/* Correction button + dialog */}
      {predictionId && ingredients.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <PencilIcon className="size-3.5" />
                Skoryguj rzeczywiste dane
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Korekta rzeczywistej potrzeby</DialogTitle>
                <DialogDescription>
                  Wpisz znane Tobie miesięczne wartości (kg) — pomoże skalibrować formułę.
                  Pomiń składniki, których nie znasz.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                {ingredients.slice(0, 15).map((ing) => (
                  <div key={ing.name_normalized} className="grid grid-cols-12 items-center gap-2">
                    <Label className="col-span-6 text-sm">{ing.name}</Label>
                    <div className="col-span-2 text-right text-xs text-muted-foreground">
                      ~{formatKg(ing.kg_mid)}
                    </div>
                    <div className="col-span-4 flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="kg/mies"
                        value={actualKg[ing.name] ?? ''}
                        onChange={(e) =>
                          setActualKg({ ...actualKg, [ing.name]: e.target.value })
                        }
                        className="h-7 text-xs"
                      />
                      <span className="text-[11px] text-muted-foreground">kg</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t pt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Źródło danych</Label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as typeof source)}
                    className="mt-1 w-full rounded border bg-white p-1.5 text-sm"
                  >
                    <option value="estimate">Szacunek własny</option>
                    <option value="client_call">Rozmowa z klientem</option>
                    <option value="invoice">Faktury (potwierdzone)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Notatki (opcjonalnie)</Label>
                  <Input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="np. sezon letni, promocja"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Anuluj
                </Button>
                <Button onClick={handleSave} disabled={busy} className="gap-1">
                  {busy ? (
                    'Zapisuję...'
                  ) : (
                    <>
                      <CheckIcon className="size-3.5" />
                      Zapisz korektę
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  )
}
