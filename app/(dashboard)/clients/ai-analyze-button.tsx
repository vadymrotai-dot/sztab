'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Sparkles, Check, X, Copy } from 'lucide-react'

interface AiAnalyzeButtonProps {
  clientId: string
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; analysis: string; tokensUsed?: number; model?: string }
  | { kind: 'err'; message: string }

export function AiAnalyzeButton({ clientId }: AiAnalyzeButtonProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  const handleAnalyze = async () => {
    setStatus({ kind: 'loading' })
    try {
      const res = await fetch('/api/ai/analyze-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!json?.ok) {
        setStatus({
          kind: 'err',
          message: json?.error || 'Nie udalo sie wykonac analizy',
        })
        return
      }
      setStatus({
        kind: 'ok',
        analysis: json.analysis,
        tokensUsed: json.tokensUsed,
        model: json.model,
      })
      // Refresh the page so the new note appears in the main notes section
      router.refresh()
    } catch (e: any) {
      setStatus({
        kind: 'err',
        message: e?.message || 'Blad sieci',
      })
    }
  }

  const handleCopy = async () => {
    if (status.kind !== 'ok') return
    try {
      await navigator.clipboard.writeText(status.analysis)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // noop
    }
  }

  const handleDismiss = () => {
    setStatus({ kind: 'idle' })
  }

  return (
    <div className="space-y-3">
      {status.kind === 'idle' && (
        <Button
          type="button"
          variant="outline"
          onClick={handleAnalyze}
          className="gap-2"
        >
          <Sparkles className="size-4" />
          Analiza AI
        </Button>
      )}

      {status.kind === 'loading' && (
        <Button type="button" variant="outline" disabled className="gap-2">
          <Spinner className="size-4" />
          Analiza w toku...
        </Button>
      )}

      {status.kind === 'err' && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleAnalyze}
            className="gap-2"
          >
            <Sparkles className="size-4" />
            Sprobuj ponownie
          </Button>
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                <X className="mr-2 inline size-4" />
                {status.message}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Sprawdz czy w Ustawieniach dodany jest klucz API Gemini.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {status.kind === 'ok' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">
                <Sparkles className="mr-2 inline size-4" />
                Analiza AI
                {status.model && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({status.model}
                    {status.tokensUsed ? ` · ${status.tokensUsed} tokenow` : ''})
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="size-3" />
                      Skopiowano
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      Kopiuj
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                >
                  <X className="size-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{status.analysis}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Analiza zostala zapisana w notatkach klienta.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
