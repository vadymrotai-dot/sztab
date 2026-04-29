'use client'

// Sprint O Phase 5/6 — multi-input dispatcher modal. Phase 5 ships
// stub з input + hint chips + button (no API call yet). Phase 6 wires
// /api/lookup/dispatcher and disambiguation list.

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2Icon, SearchIcon } from 'lucide-react'

const HINT_EXAMPLES = [
  'NIP 7561993172',
  'Kowalski Jan',
  'kontakt@firma.pl',
  '+48 600 123 456',
  'sklep-warszawa.pl',
  'Bistro Mazovia',
]

interface DispatcherCandidate {
  source: string
  name: string
  nip: string | null
  city: string | null
  legal_form: string | null
  payload: unknown
}

export function AddCompanyModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [input, setInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<DispatcherCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setInput('')
    setSearching(false)
    setStatusText(null)
    setCandidates(null)
    setError(null)
  }

  async function search() {
    if (!input.trim()) return
    setSearching(true)
    setStatusText('Wyszukuję w GUS / VAT / CEIDG…')
    setError(null)
    setCandidates(null)
    try {
      const res = await fetch('/api/lookup/dispatcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      })
      const json = (await res.json()) as {
        ok: boolean
        type?: string
        results?: DispatcherCandidate[]
        message?: string
        error?: string
        redirect?: string
      }
      if (!json.ok) {
        setError(json.error ?? 'Nie znaleziono')
        return
      }
      if (json.redirect) {
        window.location.href = json.redirect
        return
      }
      setCandidates(json.results ?? [])
      if (json.message) setStatusText(json.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setSearching(false)
    }
  }

  async function adopt(candidate: DispatcherCandidate) {
    setSearching(true)
    setStatusText('Tworzę profil…')
    try {
      const res = await fetch('/api/lookup/dispatcher/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate }),
      })
      const json = (await res.json()) as { ok: boolean; redirect?: string; error?: string }
      if (json.ok && json.redirect) {
        window.location.href = json.redirect
      } else {
        setError(json.error ?? 'Nie udało się utworzyć klienta')
        setSearching(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd sieci')
      setSearching(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Dodaj firmę do bazy</DialogTitle>
          <DialogDescription>
            Wpisz dowolną informację o firmie — Sztab automatycznie znajdzie i
            wzbogaci profil.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="NIP / nazwa firmy / imię i nazwisko właściciela / e-mail / telefon / strona www"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !searching) search()
            }}
            disabled={searching}
            autoFocus
          />
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-muted-foreground self-center mr-1">Przykłady:</span>
            {HINT_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex.replace(/^NIP\s/, ''))}
                className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                {ex}
              </button>
            ))}
          </div>

          {statusText && searching && (
            <div className="flex items-center gap-2 rounded bg-blue-50 p-2 text-sm text-blue-800">
              <Loader2Icon className="size-4 animate-spin" />
              {statusText}
            </div>
          )}
          {error && (
            <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>
          )}

          {candidates && candidates.length > 0 && (
            <div className="rounded border">
              <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">
                Znaleziono {candidates.length}{' '}
                {candidates.length === 1 ? 'wynik' : 'wyników'}. Wybierz właściwy:
              </div>
              <ul className="max-h-[280px] divide-y overflow-auto">
                {candidates.map((c, i) => (
                  <li
                    key={`${c.nip ?? c.name}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/20"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.nip ? `NIP ${c.nip}` : '(NIP brak)'}
                        {c.city && <span> · {c.city}</span>}
                        {c.legal_form && <span> · {c.legal_form}</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {c.source}
                    </Badge>
                    <Button size="sm" onClick={() => adopt(c)} disabled={searching}>
                      Wybierz
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {candidates && candidates.length === 0 && !searching && (
            <div className="rounded border bg-muted/30 p-4 text-sm">
              Nie znaleziono firmy z tymi danymi w publicznych źródłach. Wprowadź
              ręcznie:
              <Button
                variant="link"
                className="ml-1 h-auto p-0 text-sm"
                onClick={() => {
                  window.location.href = `/clients/new?prefill=${encodeURIComponent(input)}`
                }}
              >
                otwórz formularz manualny
              </Button>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={searching}>
            Anuluj
          </Button>
          <Button onClick={search} disabled={!input.trim() || searching}>
            {searching ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <SearchIcon className="mr-2 size-4" />
            )}
            Wyszukaj i dodaj
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
