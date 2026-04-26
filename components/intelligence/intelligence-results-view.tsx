import { AlertTriangleIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { FastLookupResult } from '@/lib/ai/intelligence'

interface IntelligenceResultsViewProps {
  result: FastLookupResult
}

const priorityVariant = {
  high: 'default',
  medium: 'secondary',
  low: 'outline',
} as const

export function IntelligenceResultsView({
  result,
}: IntelligenceResultsViewProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-md bg-muted/50 p-4">
        <p className="mb-1 text-sm font-medium">Strategia:</p>
        <p className="text-sm">{result.outreach_summary}</p>
      </div>

      <div>
        <h4 className="mb-2 font-medium">
          Segmenty klientów ({result.buyer_segments?.length ?? 0})
        </h4>
        <div className="space-y-2">
          {result.buyer_segments?.map((seg, i) => (
            <div key={i} className="rounded border p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h5 className="font-medium">{seg.segment_name}</h5>
                <Badge variant={priorityVariant[seg.priority] ?? 'outline'}>
                  {seg.priority}
                </Badge>
              </div>
              <p className="mb-2 text-sm text-muted-foreground">
                {seg.rationale}
              </p>
              <p className="text-xs">
                <span className="font-medium">Skala:</span>{' '}
                {seg.estimated_count_in_geo}
              </p>
              {seg.example_companies?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {seg.example_companies.map((c, j) => (
                    <Badge key={j} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-medium">Kanały sprzedaży</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {result.channels?.map((ch, i) => (
            <div key={i} className="rounded border p-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{ch.channel_name}</span>
                <Badge variant="outline">{ch.fit_score}/100</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {ch.rationale}
              </p>
            </div>
          ))}
        </div>
      </div>

      {result.pricing_strategy && (
        <div>
          <h4 className="mb-2 font-medium">Strategia cenowa</h4>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">Pozycjonowanie:</span>{' '}
              {result.pricing_strategy.suggested_tier}
            </p>
            <p>
              <span className="font-medium">Anchor cenowy:</span>{' '}
              {result.pricing_strategy.price_anchor}
            </p>
            <p>
              <span className="font-medium">Wejście:</span>{' '}
              {result.pricing_strategy.sample_strategy}
            </p>
          </div>
        </div>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 flex items-center gap-1 text-sm font-medium text-amber-900">
            <AlertTriangleIcon className="size-4" />
            Uwaga
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {result.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
