'use client'

// components/clients/client-pricing-panel.tsx
// Faza 1 DAGOLD (089) — KROK E: segment cenowy + indywidualna zniżka klienta.
// Priorytet ceny: znizka_indywidualna_pct (jeśli ustawiona) > zniżka segmentu > 0.
// Podgląd liczony od ceny segmentu A produktu przykładowego (cost/(1−marża)).

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateClientPricing } from '@/app/actions/pricing-admin'

export interface PricingSegmentOption {
  code: string
  name: string
  znizka_pct: number // ułamek
}

export interface PricingExample {
  name: string
  segAPrice: number // cena segmentu A (cost/(1−marża)) produktu przykładowego
}

const NONE = '__none__'

// %-string → ułamek (0..0.95) | null (puste) | NaN (błąd)
function strToFrac(s: string): number | null | typeof NaN {
  const t = s.trim()
  if (t === '') return null
  const n = Number.parseFloat(t.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > 95) return NaN
  return Math.round((n / 100) * 10000) / 10000
}

const fracToStr = (v: number | null): string => (v == null ? '' : (v * 100).toFixed(1))

export function ClientPricingPanel({
  clientId,
  initialSegmentCode,
  initialZnizka,
  initialZnizkaKalmar,
  initialRetail,
  segments,
  example,
}: {
  clientId: string
  initialSegmentCode: string | null
  initialZnizka: number | null // ułamek (ogólna)
  initialZnizkaKalmar: number | null // ułamek (kalmary/przekąski)
  initialRetail: boolean // ceny detaliczne (retail) → narzut +15 п.п. AVIS/ЧМ
  segments: PricingSegmentOption[]
  example: PricingExample | null
}) {
  const router = useRouter()
  const [segCode, setSegCode] = useState<string>(initialSegmentCode ?? NONE)
  const [znizkaDraft, setZnizkaDraft] = useState<string>(fracToStr(initialZnizka))
  const [znizkaKalmarDraft, setZnizkaKalmarDraft] = useState<string>(
    fracToStr(initialZnizkaKalmar),
  )
  const [retailChecked, setRetailChecked] = useState<boolean>(initialRetail)
  const [saving, setSaving] = useState(false)

  const znizkaFrac = strToFrac(znizkaDraft)
  const znizkaKalmarFrac = strToFrac(znizkaKalmarDraft)
  const invalid = Number.isNaN(znizkaFrac) || Number.isNaN(znizkaKalmarFrac)

  const selectedSegment = useMemo(
    () => segments.find((s) => s.code === segCode) ?? null,
    [segments, segCode],
  )

  // Efektywna zniżka: indywidualna nadpisuje segment.
  const effectiveZnizka: number =
    znizkaFrac != null && !Number.isNaN(znizkaFrac)
      ? (znizkaFrac as number)
      : (selectedSegment?.znizka_pct ?? 0)

  const znizkaSource =
    znizkaFrac != null && !Number.isNaN(znizkaFrac)
      ? 'indywidualna'
      : selectedSegment
        ? `segment ${selectedSegment.code}`
        : 'brak (0%)'

  const previewPrice =
    example != null ? Math.round(example.segAPrice * (1 - effectiveZnizka) * 100) / 100 : null

  const dirty =
    (segCode === NONE ? null : segCode) !== (initialSegmentCode ?? null) ||
    (znizkaFrac === null || Number.isNaN(znizkaFrac) ? null : (znizkaFrac as number)) !==
      (initialZnizka ?? null) ||
    (znizkaKalmarFrac === null || Number.isNaN(znizkaKalmarFrac)
      ? null
      : (znizkaKalmarFrac as number)) !== (initialZnizkaKalmar ?? null) ||
    retailChecked !== initialRetail

  async function save() {
    if (invalid) {
      toast.error('Zniżka indywidualna musi być w zakresie 0–95%')
      return
    }
    setSaving(true)
    const res = await updateClientPricing({
      clientId,
      price_segment_code: segCode === NONE ? null : segCode,
      znizka_indywidualna_pct: znizkaFrac as number | null,
      znizka_indywidualna_kalmar_pct: znizkaKalmarFrac as number | null,
      retail_pricing: retailChecked,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(`Nie zapisano: ${res.error}`)
      return
    }
    toast.success('Zapisano ustawienia cenowe klienta')
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium">Ceny klienta</h3>
        <Button
          size="sm"
          variant={dirty ? 'default' : 'outline'}
          disabled={!dirty || invalid || saving}
          onClick={save}
        >
          {saving ? 'Zapis…' : 'Zapisz'}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-[#888]">
            Segment cenowy
          </label>
          <Select value={segCode} onValueChange={setSegCode}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="— brak —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— brak —</SelectItem>
              {segments.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.code} · {s.name} ({(s.znizka_pct * 100).toFixed(1)}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-[#888]">
            Zniżka indyw. — ogólna %
          </label>
          <Input
            value={znizkaDraft}
            onChange={(e) => setZnizkaDraft(e.target.value)}
            placeholder="—"
            inputMode="decimal"
            className={`h-9 w-28 text-right font-mono ${Number.isNaN(znizkaFrac) ? 'border-red-400' : ''}`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-[#888]">
            Zniżka indyw. — kalmary/przekąski %
          </label>
          <Input
            value={znizkaKalmarDraft}
            onChange={(e) => setZnizkaKalmarDraft(e.target.value)}
            placeholder="—"
            inputMode="decimal"
            className={`h-9 w-28 text-right font-mono ${Number.isNaN(znizkaKalmarFrac) ? 'border-red-400' : ''}`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-[#888]">
            Ceny detaliczne
          </label>
          <label className="flex h-9 items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={retailChecked}
              onChange={(e) => setRetailChecked(e.target.checked)}
              className="h-4 w-4 accent-[#1F3A5F]"
            />
            <span className="text-sm text-slate-700">+15 p.p. (AVIS/ЧМ)</span>
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-md bg-[#FAFAF7] px-3 py-2 text-[13px]">
        {example ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[#888]">Podgląd —</span>
            <span className="font-medium">{example.name}</span>
            <span className="text-[#888]">
              (cena A {example.segAPrice.toFixed(2)} zł):
            </span>
            <span className="font-mono font-semibold">
              {previewPrice != null ? `${previewPrice.toFixed(2)} zł` : '—'}
            </span>
            <span className="text-[12px] text-[#888]">
              zniżka {(effectiveZnizka * 100).toFixed(1)}% · {znizkaSource}
            </span>
          </div>
        ) : (
          <span className="text-[#888]">
            Brak produktu z ustawioną marżą bazową — dodaj marżę w{' '}
            <span className="font-medium">Produkty → Marże</span>, aby zobaczyć podgląd.
          </span>
        )}
      </div>

      <p className="mt-3 text-[12px] text-[#888]">
        Zniżka <b>ogólna</b> (indywidualna nadpisuje segment) dotyczy kiszonek,
        ryb i reszty. Zniżka na <b>kalmary/przekąski</b> jest osobna — puste pole =
        na kalmary działają progi wolumenowe (4000/8000 zł). Podgląd niżej dotyczy
        zniżki ogólnej.
      </p>
    </div>
  )
}
