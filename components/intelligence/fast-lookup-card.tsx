'use client'

import { useState, useTransition } from 'react'
import { Loader2Icon, SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { startFastLookupForProduct } from '@/app/actions/intelligence'
import type { FastLookupResult } from '@/lib/ai/intelligence'
import { IntelligenceResultsView } from './intelligence-results-view'

interface FastLookupCardProps {
  productId: string
  initialResult: FastLookupResult | null
  initialRunDate: string | null
}

export function FastLookupCard({
  productId,
  initialResult,
  initialRunDate,
}: FastLookupCardProps) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<FastLookupResult | null>(initialResult)
  const [lastRunDate, setLastRunDate] = useState<string | null>(initialRunDate)

  const handleRun = () => {
    startTransition(async () => {
      try {
        const { result: newResult } = await startFastLookupForProduct(productId)
        setResult(newResult)
        setLastRunDate(new Date().toISOString())
        toast.success('Analiza zakończona')
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Błąd analizy'
        toast.error(message)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-purple-500" />
            AI Discovery — potencjalni klienci
          </CardTitle>
          {lastRunDate && (
            <p className="mt-1 text-xs text-muted-foreground">
              Ostatnia analiza:{' '}
              {/*
                Eksplicytna timeZone='Europe/Warsaw' eliminuje hydration
                mismatch (#418): bez niej server SSR na Vercel używa UTC
                a klient lokalnej strefy → różny string → React errors.
                Z explicit timezone obie strony produkują ten sam output.
              */}
              {new Date(lastRunDate).toLocaleString('pl-PL', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'Europe/Warsaw',
              })}
            </p>
          )}
        </div>
        <Button onClick={handleRun} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Analizuję... (~30s)
            </>
          ) : (
            <>
              <SparklesIcon className="mr-2 size-4" />
              {result ? 'Przeanalizuj ponownie' : 'Znajdź potencjalnych klientów'}
            </>
          )}
        </Button>
      </CardHeader>

      {result ? (
        <CardContent>
          <IntelligenceResultsView result={result} />
        </CardContent>
      ) : (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Kliknij „Znajdź potencjalnych klientów", żeby uruchomić Gemini z
            Google Search. Analiza zwróci segmenty klientów, kanały, strategię
            cenową i ostrzeżenia konkurencyjne. Trwa ~30s.
          </p>
        </CardContent>
      )}
    </Card>
  )
}
