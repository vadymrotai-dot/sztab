'use client'

import { useState, useTransition } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { updateParamsKeys } from '@/app/actions/params'

export interface ApiKeysFormProps {
  // Pre-formatted "AIza...4Xy7" or null when not set. Server never
  // sends pełny klucz do klienta.
  geminiMasked: string | null
  apifyMasked: string | null
  krsMasked: string | null
}

interface KeyField {
  id: 'gemini_key' | 'apify_api_token' | 'krs_rejestr_api_token'
  label: string
  placeholder: string
  helpText: string
  helpUrl: string
}

const FIELDS: KeyField[] = [
  {
    id: 'gemini_key',
    label: 'Gemini API key',
    placeholder: 'AIza...',
    helpText: 'Wymagane dla Fast Lookup i Deep Discovery (Gemini 2.5 Flash + Google Search).',
    helpUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'apify_api_token',
    label: 'Apify API token',
    placeholder: 'apify_api_...',
    helpText: 'Wymagane dla Deep Discovery (Panorama Firm scraper).',
    helpUrl: 'https://console.apify.com/account/integrations',
  },
  {
    id: 'krs_rejestr_api_token',
    label: 'KRS Rejestr.io API token',
    placeholder: 'rejestr_...',
    helpText: 'Wymagane dla Deep Discovery (NIP/KRS verification).',
    helpUrl: 'https://rejestr.io/',
  },
]

export function ApiKeysForm({
  geminiMasked,
  apifyMasked,
  krsMasked,
}: ApiKeysFormProps) {
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<KeyField['id'], string>>({
    gemini_key: '',
    apify_api_token: '',
    krs_rejestr_api_token: '',
  })
  const [show, setShow] = useState<Record<KeyField['id'], boolean>>({
    gemini_key: false,
    apify_api_token: false,
    krs_rejestr_api_token: false,
  })
  const [maskedState, setMaskedState] = useState({
    gemini_key: geminiMasked,
    apify_api_token: apifyMasked,
    krs_rejestr_api_token: krsMasked,
  })

  const handleSave = () => {
    // Tylko zmienione (non-empty) wartości lecą do server action.
    // Pusty input = nie zmieniaj. Żeby skasować klucz, user musi
    // wpisać "clear" w przyszłej iteracji — na razie skupiamy się
    // na set/update.
    const update: Record<string, string> = {}
    for (const f of FIELDS) {
      const v = values[f.id].trim()
      if (v) update[f.id] = v
    }
    if (Object.keys(update).length === 0) {
      toast.error('Wpisz co najmniej jeden klucz')
      return
    }

    startTransition(async () => {
      const result = await updateParamsKeys(update)
      if (!result.ok) {
        toast.error(`Nie zapisano: ${result.error}`)
        return
      }
      // Optymistyczna aktualizacja masked preview — pokazujemy
      // first4...last4 ze świeżego inputu user-a, bez round-tripa.
      const newMasked = { ...maskedState }
      for (const key of result.updated) {
        const fresh = update[key]
        if (fresh && fresh.length >= 12) {
          newMasked[key as KeyField['id']] =
            `${fresh.slice(0, 4)}...${fresh.slice(-4)}`
        }
      }
      setMaskedState(newMasked)
      setValues({
        gemini_key: '',
        apify_api_token: '',
        krs_rejestr_api_token: '',
      })
      toast.success(`Zapisano klucze: ${result.updated.join(', ')}`)
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Klucze API zapisane są w tabeli params (RLS owner-only). Pełny
        klucz nigdy nie wraca do przeglądarki — pokazujemy tylko 4
        pierwsze i 4 ostatnie znaki. Zostaw pole puste, żeby NIE
        zmieniać istniejącego klucza.
      </p>

      {FIELDS.map((f) => (
        <div key={f.id} className="space-y-2">
          <Label htmlFor={f.id}>
            {f.label}
            {maskedState[f.id] && (
              <span className="ml-2 text-xs font-mono text-muted-foreground">
                Aktualnie: {maskedState[f.id]}
              </span>
            )}
            {!maskedState[f.id] && (
              <span className="ml-2 text-xs text-amber-600">
                Nie ustawiony
              </span>
            )}
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                id={f.id}
                type={show[f.id] ? 'text' : 'password'}
                placeholder={f.placeholder}
                value={values[f.id]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                }
                autoComplete="off"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() =>
                  setShow((prev) => ({ ...prev, [f.id]: !prev[f.id] }))
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={show[f.id] ? 'Ukryj' : 'Pokaż'}
              >
                {show[f.id] ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {f.helpText}{' '}
            <a
              href={f.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Pobierz klucz →
            </a>
          </p>
        </div>
      ))}

      <Button onClick={handleSave} disabled={pending}>
        {pending && <Spinner className="mr-2" />}
        Zapisz klucze
      </Button>
    </div>
  )
}
