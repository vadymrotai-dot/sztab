// components/matches/sales-snippet-button.tsx
// On-demand sales-snippet generator + display.
// Stage A: jeszcze nie generowany → button "Wygeneruj cold opener".
// Stage B: snippet exists → expandable з opener / value-prop / objection.

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2Icon, MailIcon, RefreshCwIcon } from 'lucide-react'

export interface SalesSnippetData {
  opener_pl?: string
  value_prop_pl?: string
  objection_likely?: string
  generated_at?: string
}

interface Props {
  matchId: string
  initialSnippet: SalesSnippetData | null
  size?: 'xs' | 'sm'
}

export function SalesSnippetButton({ matchId, initialSnippet, size = 'sm' }: Props) {
  const [snippet, setSnippet] = useState<SalesSnippetData | null>(initialSnippet)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${matchId}/generate-snippet`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Generation failed')
      setSnippet(json.snippet as SalesSnippetData)
      setExpanded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (!snippet) {
    return (
      <Button
        size={size === 'xs' ? 'sm' : 'sm'}
        variant="outline"
        onClick={handleGenerate}
        disabled={loading}
        className={size === 'xs' ? 'h-6 text-[10px] px-2' : ''}
      >
        {loading ? (
          <Loader2Icon className="size-3 mr-1 animate-spin" />
        ) : (
          <MailIcon className="size-3 mr-1" />
        )}
        {loading ? 'Generuję…' : 'Wygeneruj cold opener'}
        {error && <span className="ml-2 text-red-600">⚠️</span>}
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded border border-purple-200 bg-purple-50/30 p-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left text-xs font-medium hover:underline"
      >
        <span className="flex items-center gap-1">
          <MailIcon className="size-3 text-purple-600" />
          Cold-opener
          <Badge variant="outline" className="ml-1 h-4 text-[9px]">
            {snippet.generated_at ? new Date(snippet.generated_at).toLocaleDateString('pl-PL') : ''}
          </Badge>
        </span>
        <span className="text-muted-foreground">{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="space-y-2 text-xs">
          {snippet.opener_pl && (
            <div>
              <div className="font-semibold text-purple-700">Opener:</div>
              <p className="whitespace-pre-wrap">{snippet.opener_pl}</p>
            </div>
          )}
          {snippet.value_prop_pl && (
            <div>
              <div className="font-semibold text-purple-700">Value-prop:</div>
              <p className="whitespace-pre-wrap">{snippet.value_prop_pl}</p>
            </div>
          )}
          {snippet.objection_likely && (
            <div>
              <div className="font-semibold text-purple-700">Likely objection:</div>
              <p className="whitespace-pre-wrap italic">{snippet.objection_likely}</p>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleGenerate}
            disabled={loading}
            className="h-6 text-[10px]"
          >
            {loading ? (
              <Loader2Icon className="size-3 mr-1 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3 mr-1" />
            )}
            Regenerate
          </Button>
          {error && <p className="text-[10px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
