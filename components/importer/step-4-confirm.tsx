'use client'

import { CheckCircle2Icon, XCircleIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import type { ImportResult } from '@/lib/importers/types'

interface StepConfirmProps {
  totalRows: number
  newCount: number
  duplicateCount: number
  invalidCount: number
  updateExisting: boolean
  result: ImportResult | null
}

export function StepConfirm({
  totalRows,
  newCount,
  duplicateCount,
  invalidCount,
  updateExisting,
  result,
}: StepConfirmProps) {
  if (result) {
    const success = result.failed === 0
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-3">
              {success ? (
                <CheckCircle2Icon className="size-8 text-green-600" />
              ) : (
                <XCircleIcon className="size-8 text-destructive" />
              )}
              <div>
                <p className="font-semibold">
                  {success ? 'Import zakończony' : 'Import zakończony z błędami'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.inserted} dodano · {result.updated} zaktualizowano
                  · {result.skipped} pominięto · {result.failed} błędów
                </p>
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">
                  Pierwsze błędy:
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <li key={i} className="font-mono">
                      Wiersz {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const willInsert = newCount
  const willUpdate = updateExisting ? duplicateCount : 0
  const willSkip =
    invalidCount + (updateExisting ? 0 : duplicateCount)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <p className="text-sm font-medium">Podsumowanie operacji</p>
            <p className="text-sm text-muted-foreground">
              Wczytano {totalRows} wierszy z pliku.
            </p>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-2 shrink-0 rounded-full bg-green-500" />
              <span>
                <strong>{willInsert}</strong> nowych SKU zostanie dodanych do
                bazy.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-2 shrink-0 rounded-full bg-amber-500" />
              <span>
                <strong>{willUpdate}</strong>{' '}
                {updateExisting
                  ? 'istniejących SKU zostanie zaktualizowanych (cena, nazwa, kategoria, status).'
                  : 'duplikatów zostanie pominiętych (toggle „Oświeżać ceny" jest OFF).'}
              </span>
            </li>
            {willSkip > 0 && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5 size-2 shrink-0 rounded-full bg-slate-400" />
                <span>
                  <strong>{willSkip}</strong> wierszy zostanie pominiętych
                  (błędy walidacji lub duplikaty bez aktualizacji).
                </span>
              </li>
            )}
          </ul>
          {invalidCount > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              Wykryto {invalidCount} wierszy z błędami walidacji.
              Zostaną pominięte. Wróć do kroku 3, aby zobaczyć szczegóły.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
