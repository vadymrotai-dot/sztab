'use client'

// components/clients/enrichment-progress-banner.tsx
// Sprint M FIX 3 — visual indicator коли PHASE B enrichment активне.
// Sprint S6A Step 3 — refactored до S5D amber dashed pattern (mirror
// components/intelligence/lookup-form.tsx). Polling logic preserved:
// 10s interval, useRouter.refresh() once Phase B завершується.
//
// Defer (S6A Step 4): consume initial `phase_b_pending` from full-analysis
// response через React state/context щоб render full pending list (not just
// running rows). Зараз показуємо whatever polling endpoint повертає.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface RunStatus {
  source: string
  status: string
  run_started_at: string
  run_completed_at: string | null
}

export function EnrichmentProgressBanner({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [running, setRunning] = useState<RunStatus[]>([])

  useEffect(() => {
    let cancelled = false
    let pollHandle: ReturnType<typeof setTimeout> | null = null

    async function checkStatus() {
      try {
        const res = await fetch(
          `/api/intelligence/enrichment-status?clientId=${clientId}`,
          { cache: 'no-store' },
        )
        if (!res.ok) return
        const data = (await res.json()) as { running: RunStatus[] }
        if (cancelled) return
        const next = data.running ?? []
        setRunning((prev) => {
          // Якщо щось завершилось — refresh page once
          if (prev.length > 0 && next.length === 0) {
            router.refresh()
          }
          return next
        })
      } catch {
        /* silent */
      }
      if (!cancelled) {
        pollHandle = setTimeout(checkStatus, 10_000)
      }
    }

    checkStatus()
    return () => {
      cancelled = true
      if (pollHandle) clearTimeout(pollHandle)
    }
  }, [clientId, router])

  if (running.length === 0) return null

  return (
    <div className="space-y-1 rounded border border-dashed border-amber-300 bg-amber-50/40 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
        <Loader2Icon className="size-3.5 animate-spin text-amber-700" />
        <span>Trwa w tle (~30-60s)</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Te źródła są pobierane w tle. Strona odświeży się automatycznie.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {running.map((r) => (
          <Badge
            key={r.source}
            variant="outline"
            className="border-amber-400 text-amber-800"
          >
            {r.source}
          </Badge>
        ))}
      </div>
    </div>
  )
}
