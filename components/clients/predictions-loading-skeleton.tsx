// components/clients/predictions-loading-skeleton.tsx
// Sprint TYDZIEN2 PERF (28.05.2026) — Suspense fallback dla PredictionsSectionAsync.
// Pokazany podczas AI calls (Haiku per dish) w background. Server-rendered HTML
// natychmiast — fallback widoczny od razu, real content stremuje gdy AI ready.

import { Loader2Icon } from 'lucide-react'

export function PredictionsLoadingSkeleton() {
  return (
    <div className="space-y-3 rounded border border-dashed border-[#E5E1D8] bg-[#FAFAF7] p-6">
      <div className="flex items-center gap-3 text-sm text-[#666]">
        <Loader2Icon className="size-4 animate-spin text-amber-600" />
        <div>
          <div className="font-medium text-[#333]">Analizuję menu i agreguję składniki…</div>
          <div className="mt-0.5 text-xs text-[#888]">
            AI sprawdza każdą pozycję menu (claude-haiku). Pierwszy raz może zająć kilkanaście sekund;
            kolejne wizyty będą natychmiastowe dzięki cache.
          </div>
        </div>
      </div>
      {/* Placeholder skeleton lines — przybliżona wysokość prawdziwej sekcji */}
      <div className="space-y-2 pt-2">
        <div className="h-3 w-3/4 rounded bg-[#EEE]" />
        <div className="h-3 w-1/2 rounded bg-[#EEE]" />
        <div className="h-3 w-2/3 rounded bg-[#EEE]" />
      </div>
    </div>
  )
}
