'use client'

// components/dzis/intelligence-modes-block.tsx
// Sprint S-CORE.1.C — 3 cards modes (A/B/C) для /pulpit/dzisiaj.
// Per мокап sztab-makiety-v2.html секція 1 — Tryb pracy block.
//
// Mode A → POST /api/intelligence/run з {mode:'A'} → toast → /clients
// Mode B → router.push('/pulpit/szukaj?tryb=B') (форма заповнюється user-ом)
// Mode C → router.push('/pulpit/szukaj?tryb=C') (DOMYŚLNE)

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface RunResult {
  sources_completed: string[]
  entities_processed: number
  errors: Array<{ source: string; message: string }>
  duration_ms: number
}

interface RunResponse {
  runId: string
  status: 'completed' | 'partial' | string
  result?: RunResult
  error?: string
  note?: string
}

export function IntelligenceModesBlock() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleModeA() {
    if (busy) return
    setBusy(true)
    const toastId = toast.loading('Opracowanie bazy uruchomione…')
    try {
      const res = await fetch('/api/intelligence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'A' }),
      })
      const json = (await res.json()) as RunResponse

      if (!res.ok) {
        toast.error(json.error ?? `Błąd HTTP ${res.status}`, { id: toastId })
        return
      }

      if (json.status === 'partial') {
        toast.warning(
          json.error ?? 'Opracowanie zakończone z ostrzeżeniami',
          { id: toastId },
        )
      } else {
        const processed = json.result?.entities_processed ?? 0
        toast.success(
          `Opracowanie zakończone (${processed} klientów)`,
          { id: toastId },
        )
      }
      router.push('/clients?sort=updated_at_desc')
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Błąd sieci',
        { id: toastId },
      )
    } finally {
      setBusy(false)
    }
  }

  function handleModeB() {
    router.push('/pulpit/szukaj?tryb=B')
  }

  function handleModeC() {
    router.push('/pulpit/szukaj?tryb=C')
  }

  return (
    <section aria-labelledby="modes-block-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="modes-block-title"
          className="text-[14px] font-medium text-[#222]"
        >
          Tryb pracy
        </h2>
        <span className="text-[11px] text-[#888]">
          Wybierz jak pracujesz dziś
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Mode A — Opracuj bazę */}
        <Card className="border-[#E5E1D8] hover:border-[#10B981]/60 transition-colors">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-[20px]">🔄</span>
                <span className="text-[15px] font-medium">Tryb A</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-[#888]">
                ~52 zł
              </span>
            </div>
            <p className="text-[13px] leading-snug text-[#555]">
              Opracuj istniejącą bazę klientów. Odśwież dane KRS / VAT / kontakty.
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={handleModeA}
              disabled={busy}
              className="mt-1 w-full"
            >
              {busy ? 'Uruchamianie…' : 'Uruchom Tryb A'}
            </Button>
          </CardContent>
        </Card>

        {/* Mode B — Konfiguruj wyszukiwanie WSZYSTKICH */}
        <Card className="border-[#E5E1D8] hover:border-[#10B981]/60 transition-colors">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-[20px]">🌐</span>
                <span className="text-[15px] font-medium">Tryb B</span>
                <Badge
                  variant="outline"
                  className="border-purple-300 bg-purple-50 text-[10px] font-medium text-purple-700"
                >
                  WSZYSTKIE
                </Badge>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-[#888]">
                Konfiguruj
              </span>
            </div>
            <p className="text-[13px] leading-snug text-[#555]">
              Pobierz WSZYSTKIE firmy z rejestrów (CEIDG/KRS) wg filtrów —
              bez VAT/aktywności filter.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleModeB}
              disabled={busy}
              className="mt-1 w-full"
            >
              Otwórz formularz
            </Button>
          </CardContent>
        </Card>

        {/* Mode C — DOMYŚLNE — Combined */}
        <Card className="border-[#10B981]/60 ring-1 ring-[#10B981]/30 hover:border-[#10B981] transition-colors">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-[20px]">⚡</span>
                <span className="text-[15px] font-medium">Tryb C</span>
                <Badge className="bg-[#10B981] text-[10px] font-medium text-white">
                  DOMYŚLNE
                </Badge>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-[#888]">
                Otwórz formularz
              </span>
            </div>
            <p className="text-[13px] leading-snug text-[#555]">
              Wszystko naraz: opracuj bazę + szukaj nowych z rejestrów. Domyślny tryb.
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={handleModeC}
              disabled={busy}
              className="mt-1 w-full bg-[#10B981] hover:bg-[#0EA372]"
            >
              Otwórz formularz
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
