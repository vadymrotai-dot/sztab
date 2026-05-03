'use client'

// app/(dashboard)/pulpit/szukaj/page.tsx
// Sprint S-CORE.1.C — Mode B/C формуляр.
//
// Per мокап sztab-makiety-v2.html секція 2:
//   Radio Tryb A/B/C → filtri (PKD, województwo, forma_prawna, źródła)
//   → prognoza wyników (mocked) → "🚀 Uruchom wyszukiwanie"
//
// Per Strategy Shift 03.05.2026: Tryb B = ВСІ без VAT/wykreślona filter.
// Purple notice появляється коли tryb='B' щоб user розумів що це ВСІ entities.
//
// useSearchParams() обернутий у Suspense щоб не зламати Next.js pre-render.

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

// ─── Hardcoded options (S-CORE.2 wire-up до real PKD / woj data) ───

const PKD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '5610A', label: '5610A — restauracje i stałe placówki gastronomiczne' },
  { value: '5610B', label: '5610B — ruchome placówki gastronomiczne' },
  { value: '5621Z', label: '5621Z — przygotowywanie i dostarczanie żywności (catering)' },
  { value: '5629Z', label: '5629Z — pozostała usługowa działalność gastronomiczna' },
  { value: '5630Z', label: '5630Z — przygotowywanie i podawanie napojów' },
  { value: '4632Z', label: '4632Z — sprzedaż hurtowa mięsa i wyrobów' },
  { value: '4633Z', label: '4633Z — sprzedaż hurtowa mleka, mleczarskich, jaj' },
  { value: '4634Z', label: '4634Z — sprzedaż hurtowa napojów' },
  { value: '4639Z', label: '4639Z — sprzedaż hurtowa niewyspecjalizowana żywności' },
  { value: '4724Z', label: '4724Z — sprzedaż detaliczna pieczywa, ciastek' },
]

const WOJEWODZTWO_OPTIONS = [
  'dolnośląskie',
  'kujawsko-pomorskie',
  'lubelskie',
  'lubuskie',
  'łódzkie',
  'małopolskie',
  'mazowieckie',
  'opolskie',
  'podkarpackie',
  'podlaskie',
  'pomorskie',
  'śląskie',
  'świętokrzyskie',
  'warmińsko-mazurskie',
  'wielkopolskie',
  'zachodniopomorskie',
]

type FormaPrawna = 'sp_zoo' | 'jdg' | 'sa'
const FORMA_OPTIONS: Array<{ value: FormaPrawna; label: string }> = [
  { value: 'sp_zoo', label: 'sp. z o.o.' },
  { value: 'jdg', label: 'JDG (osoba fizyczna)' },
  { value: 'sa', label: 'S.A.' },
]

type Source = 'ceidg' | 'krs' | 'gmaps' | 'tavily'
const SOURCE_OPTIONS: Array<{ value: Source; label: string; defaultOn: boolean }> = [
  { value: 'ceidg', label: 'CEIDG (JDG)', defaultOn: true },
  { value: 'krs', label: 'KRS (sp.z o.o. / S.A.)', defaultOn: true },
  { value: 'gmaps', label: 'Google Maps (Apify)', defaultOn: false },
  { value: 'tavily', label: 'Tavily web search', defaultOn: false },
]

const ALL_PKD = '__all_pkd__'
const ALL_WOJ = '__all_woj__'

type Mode = 'A' | 'B' | 'C'

// ─── Inner content (uses useSearchParams) ─────────────────────────

function SzukajForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTryb = (searchParams.get('tryb') as Mode | null) ?? 'C'

  const [mode, setMode] = useState<Mode>(
    initialTryb === 'A' || initialTryb === 'B' || initialTryb === 'C'
      ? initialTryb
      : 'C',
  )
  const [pkd, setPkd] = useState<string>(ALL_PKD)
  const [voivodeship, setVoivodeship] = useState<string>(ALL_WOJ)
  const [forma, setForma] = useState<Set<FormaPrawna>>(new Set())
  const [sources, setSources] = useState<Set<Source>>(
    new Set(SOURCE_OPTIONS.filter((s) => s.defaultOn).map((s) => s.value)),
  )
  const [busy, setBusy] = useState(false)

  function toggleForma(value: FormaPrawna, checked: boolean) {
    setForma((prev) => {
      const next = new Set(prev)
      if (checked) next.add(value)
      else next.delete(value)
      return next
    })
  }

  function toggleSource(value: Source, checked: boolean) {
    setSources((prev) => {
      const next = new Set(prev)
      if (checked) next.add(value)
      else next.delete(value)
      return next
    })
  }

  // ─── Prognoza wyników (mocked per scope) ─────────
  const prognoza = useMemo(
    () => ({
      firm: 340,
      time_min: 14,
      cost_pln: 28,
      trafien: 120,
    }),
    [],
  )

  async function handleSubmit() {
    if (busy) return
    setBusy(true)
    const toastId = toast.loading(
      `Uruchamianie trybu ${mode}…`,
    )

    const filters =
      mode === 'A'
        ? {} // existing-mode filters not exposed у цьому formie
        : {
            pkd: pkd === ALL_PKD ? undefined : [pkd],
            voivodeship:
              voivodeship === ALL_WOJ ? undefined : [voivodeship],
            forma_prawna: forma.size > 0 ? Array.from(forma) : undefined,
            sources: sources.size > 0 ? Array.from(sources) : undefined,
          }

    const payload =
      mode === 'C'
        ? { mode, filters: { existing: {}, registry: filters } }
        : { mode, filters }

    try {
      const res = await fetch('/api/intelligence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as {
        runId?: string
        status?: string
        error?: string
        result?: { entities_processed?: number }
      }

      if (!res.ok) {
        toast.error(
          json.error ?? `Błąd HTTP ${res.status}`,
          { id: toastId },
        )
        setBusy(false)
        return
      }

      if (json.status === 'partial') {
        toast.warning(
          json.error ?? 'Uruchomienie częściowe — patrz S-CORE.2 wire-up',
          { id: toastId },
        )
      } else {
        const processed = json.result?.entities_processed ?? 0
        toast.success(
          `Wyszukiwanie zakończone (${processed} obiektów)`,
          { id: toastId },
        )
      }
      router.push('/clients?filter=newly-added')
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Błąd sieci',
        { id: toastId },
      )
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col bg-[#FAFAF7] min-h-screen">
      <PageHeader
        title="Szukanie firm"
        breadcrumbs={[
          { label: 'Dziś', href: '/pulpit/dzisiaj' },
          { label: 'Szukanie firm' },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* ─── Tryb pracy radio ─── */}
        <Card className="border-[#E5E1D8]">
          <CardContent className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-[14px] font-medium">Tryb pracy</h2>
              <p className="mt-0.5 text-[12px] text-[#888]">
                Wybierz źródło danych do tego uruchomienia.
              </p>
            </div>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="grid grid-cols-1 gap-3 md:grid-cols-3"
            >
              <Label
                htmlFor="tryb-a"
                className="flex cursor-pointer items-start gap-3 rounded-md border border-[#E5E1D8] p-3 hover:border-[#10B981]/60"
              >
                <RadioGroupItem id="tryb-a" value="A" className="mt-1" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">Tryb A</span>
                    <span aria-hidden>🔄</span>
                  </div>
                  <span className="text-[11px] text-[#666]">
                    Opracuj istniejącą bazę
                  </span>
                </div>
              </Label>
              <Label
                htmlFor="tryb-b"
                className="flex cursor-pointer items-start gap-3 rounded-md border border-[#E5E1D8] p-3 hover:border-[#10B981]/60"
              >
                <RadioGroupItem id="tryb-b" value="B" className="mt-1" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">Tryb B</span>
                    <span aria-hidden>🌐</span>
                    <Badge
                      variant="outline"
                      className="border-purple-300 bg-purple-50 text-[10px] font-medium text-purple-700"
                    >
                      WSZYSTKIE
                    </Badge>
                  </div>
                  <span className="text-[11px] text-[#666]">
                    Pobierz z rejestrów
                  </span>
                </div>
              </Label>
              <Label
                htmlFor="tryb-c"
                className="flex cursor-pointer items-start gap-3 rounded-md border border-[#E5E1D8] p-3 hover:border-[#10B981]/60"
              >
                <RadioGroupItem id="tryb-c" value="C" className="mt-1" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">Tryb C</span>
                    <span aria-hidden>⚡</span>
                    <Badge className="bg-[#10B981] text-[10px] font-medium text-white">
                      DOMYŚLNE
                    </Badge>
                  </div>
                  <span className="text-[11px] text-[#666]">
                    Baza + nowe (kombinowany)
                  </span>
                </div>
              </Label>
            </RadioGroup>

            {mode === 'B' && (
              <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-[12px] leading-snug text-purple-900">
                <strong className="font-medium">Tryb B = WSZYSTKIE.</strong>{' '}
                Dodajemy WSZYSTKIE firmy z rejestrów <em>bez</em> filtra
                aktywności VAT / wykreślenia. Per Strategy Shift 03.05.2026
                — baza to uniwersalny asset, filtr zawęża wartość przyszłą.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Filtry ─── */}
        <Card className="border-[#E5E1D8]">
          <CardContent className="flex flex-col gap-5 p-5">
            <div>
              <h2 className="text-[14px] font-medium">Filtry</h2>
              <p className="mt-0.5 text-[12px] text-[#888]">
                Zawężają zakres wyszukiwania w trybach B i C.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* PKD select */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="pkd-select" className="text-[12px]">
                  Kod PKD (główny)
                </Label>
                <Select value={pkd} onValueChange={setPkd}>
                  <SelectTrigger id="pkd-select">
                    <SelectValue placeholder="Wszystkie PKD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PKD}>Wszystkie PKD</SelectItem>
                    {PKD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Województwo select */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="woj-select" className="text-[12px]">
                  Województwo
                </Label>
                <Select value={voivodeship} onValueChange={setVoivodeship}>
                  <SelectTrigger id="woj-select">
                    <SelectValue placeholder="Wszystkie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_WOJ}>Wszystkie</SelectItem>
                    {WOJEWODZTWO_OPTIONS.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Forma prawna checkboxes */}
            <div className="flex flex-col gap-2">
              <Label className="text-[12px]">Forma prawna</Label>
              <div className="flex flex-wrap gap-4">
                {FORMA_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Checkbox
                      checked={forma.has(opt.value)}
                      onCheckedChange={(c) =>
                        toggleForma(opt.value, c === true)
                      }
                    />
                    <span className="text-[13px]">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Źródła checkboxes */}
            <div className="flex flex-col gap-2">
              <Label className="text-[12px]">Źródła danych</Label>
              <div className="flex flex-wrap gap-4">
                {SOURCE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Checkbox
                      checked={sources.has(opt.value)}
                      onCheckedChange={(c) =>
                        toggleSource(opt.value, c === true)
                      }
                    />
                    <span className="text-[13px]">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Prognoza wyników (mocked) ─── */}
        <Card className="border-[#E5E1D8] bg-[#FBFAF5]">
          <CardContent className="flex flex-col gap-3 p-5">
            <div>
              <h2 className="text-[14px] font-medium">Prognoza wyników</h2>
              <p className="mt-0.5 text-[12px] text-[#888]">
                Szacunki — rzeczywiste wartości po S-CORE.2 wire-up.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-md border border-[#E5E1D8] bg-white p-3">
                <div className="text-[18px] font-medium">~{prognoza.firm}</div>
                <div className="text-[11px] text-[#888]">firm do przetw.</div>
              </div>
              <div className="rounded-md border border-[#E5E1D8] bg-white p-3">
                <div className="text-[18px] font-medium">~{prognoza.time_min} min</div>
                <div className="text-[11px] text-[#888]">czas wykonania</div>
              </div>
              <div className="rounded-md border border-[#E5E1D8] bg-white p-3">
                <div className="text-[18px] font-medium">~{prognoza.cost_pln} zł</div>
                <div className="text-[11px] text-[#888]">koszt API</div>
              </div>
              <div className="rounded-md border border-[#E5E1D8] bg-white p-3">
                <div className="text-[18px] font-medium">~{prognoza.trafien}</div>
                <div className="text-[11px] text-[#888]">spodz. trafień</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Submit ─── */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={busy}
            className="bg-[#10B981] hover:bg-[#0EA372]"
          >
            <span aria-hidden className="mr-2">🚀</span>
            {busy ? 'Uruchamianie…' : 'Uruchom wyszukiwanie'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page export з Suspense (для useSearchParams pre-render safety) ─

export default function PulpitSzukajPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAFAF7]">
          <span className="text-[13px] text-[#888]">Ładowanie formularza…</span>
        </div>
      }
    >
      <SzukajForm />
    </Suspense>
  )
}
