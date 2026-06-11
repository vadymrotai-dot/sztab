'use client'

// components/clients/predictions-compute-card.tsx
// Fix 12.06 — jawne wyzwalanie liczenia prognozy (render nigdy nie liczy).
// POST /api/clients/[id]/compute-prediction → silnik w paczkach (~30 dań/Haiku),
// zapis przyrostowy. Twardy timeout po stronie klienta, stan błędu + retry,
// po sukcesie router.refresh() → render z gotowego cache.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const CLIENT_TIMEOUT_MS = 120_000 // twardy timeout — koniec wiecznego spinnera

interface Props {
  clientId: string
  hasCache?: boolean
  compact?: boolean
}

export function PredictionsComputeCard({ clientId, hasCache, compact }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function compute() {
    setError(null)
    setRunning(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS)
    try {
      const res = await fetch(`/api/clients/${clientId}/compute-prediction`, {
        method: 'POST',
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Błąd serwera (${res.status})`)
      }
      setRunning(false)
      startTransition(() => router.refresh())
    } catch (e) {
      clearTimeout(timer)
      setRunning(false)
      const msg =
        e instanceof Error && e.name === 'AbortError'
          ? 'Przekroczono limit czasu (120s). Spróbuj ponownie — postęp jest zapisywany, kolejne próby będą szybsze.'
          : e instanceof Error
            ? e.message
            : 'Nieznany błąd'
      setError(msg)
    }
  }

  const busy = running || isPending

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#888]">
        <Button size="sm" variant="ghost" onClick={compute} disabled={busy} className="h-7 px-2">
          {busy ? 'Przeliczam…' : '↻ Przelicz prognozę'}
        </Button>
        {error && <span className="text-rose-700">{error}</span>}
      </div>
    )
  }

  return (
    <div className="rounded border border-dashed border-[#E5E1D8] bg-white p-4 text-sm">
      <p className="font-medium text-[#333]">Prognoza miesięcznej potrzeby</p>
      <p className="mt-1 text-xs text-[#888]">
        {hasCache
          ? 'Brak aktualnego wyniku. Kliknij, aby przeliczyć (analiza menu w paczkach, wynik zapisuje się przyrostowo).'
          : 'Jeszcze nie policzona. Liczenie analizuje menu po ~30 dań na raz i zapisuje wynik w tle — strona pozostaje responsywna.'}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={compute} disabled={busy}>
          {busy ? 'Liczę prognozę…' : 'Policz prognozę'}
        </Button>
        {busy && (
          <span className="text-xs text-[#888]">
            Analizuję menu w paczkach (claude-haiku). To może potrwać ~15–60s.
          </span>
        )}
      </div>
      {error && (
        <div className="mt-3 rounded bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
          {error}{' '}
          <button onClick={compute} className="underline font-medium" disabled={busy}>
            Spróbuj ponownie
          </button>
        </div>
      )}
    </div>
  )
}
