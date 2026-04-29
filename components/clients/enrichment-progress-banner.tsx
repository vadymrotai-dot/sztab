'use client'

// components/clients/enrichment-progress-banner.tsx
// Sprint M FIX 3 — visual indicator коли PHASE B enrichment активне.
// Polls window.location every 10s через router.refresh() while running.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon } from 'lucide-react'

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
    <div className="flex items-center gap-3 rounded border-l-4 border-l-blue-500 bg-blue-50/40 p-3 text-sm">
      <Loader2Icon className="size-4 animate-spin text-blue-600" />
      <div className="flex-1">
        <span className="font-medium">Wzbogacanie w toku…</span>
        <span className="ml-2 text-muted-foreground">
          {running.map((r) => r.source).join(', ')}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        Strona odświeży się automatycznie
      </span>
    </div>
  )
}
