// components/intelligence/lookup-form.tsx
// NIP input → /api/intelligence/lookup → 6-step progress + redirect.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2Icon, SearchIcon } from 'lucide-react'

interface StepResult {
  source: string
  status: 'success' | 'partial' | 'error' | 'skipped'
  fields_added?: number
  fields_updated?: number
  error?: string
  note?: string
}
interface LookupResponse {
  client_id: string | null
  entity_type: string
  sources_completed: StepResult[]
  fields_filled: number
  persons_created: number
  top_matches: Array<{ product_id: string; product_name: string; combined_score: number }>
  errors: string[]
}

// Polish NIP checksum
function isValidNip(raw: string): boolean {
  const nip = raw.replace(/\D/g, '')
  if (nip.length !== 10) return false
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  let sum = 0
  for (let i = 0; i < 9; i += 1) {
    sum += parseInt(nip[i] ?? '0', 10) * (weights[i] ?? 0)
  }
  const checksum = sum % 11
  if (checksum === 10) return false
  return checksum === parseInt(nip[9] ?? '-1', 10)
}

export function LookupForm() {
  const router = useRouter()
  const [nip, setNip] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LookupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nipValid = isValidNip(nip)

  async function handleSubmit() {
    if (!nipValid) {
      setError('Niepoprawny NIP')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/intelligence/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: nip.replace(/\D/g, '') }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error ?? 'Lookup failed')
        if (json.response) setResult(json.response as LookupResponse)
      } else {
        setResult(json.response as LookupResponse)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wpisz NIP firmy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">NIP (10 cyfr)</Label>
            <Input
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              placeholder="5252800123"
              maxLength={13}
              className="font-mono"
            />
            {nip && !nipValid && (
              <p className="text-xs text-red-600">Niepoprawny NIP (checksum)</p>
            )}
          </div>
          <Button onClick={handleSubmit} disabled={!nipValid || loading} className="w-full">
            {loading ? (
              <>
                <Loader2Icon className="size-4 mr-2 animate-spin" />
                Pobieranie danych z 6 źródeł...
              </>
            ) : (
              <>
                <SearchIcon className="size-4 mr-2" />
                Uruchom intelligence lookup
              </>
            )}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Wynik lookup</span>
              <Badge className="bg-blue-600 text-white">{result.entity_type}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Pól wypełniono</div>
                <div className="text-2xl font-semibold">{result.fields_filled}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Osoby utworzone</div>
                <div className="text-2xl font-semibold">{result.persons_created}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Top matche</div>
                <div className="text-2xl font-semibold">{result.top_matches.length}</div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Źródła:</div>
              <ul className="space-y-1 text-xs">
                {result.sources_completed.map((s, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <Badge
                      className={
                        s.status === 'success'
                          ? 'bg-green-600 text-white'
                          : s.status === 'partial'
                            ? 'bg-amber-500 text-white'
                            : s.status === 'skipped'
                              ? 'bg-gray-300 text-gray-800'
                              : 'bg-red-600 text-white'
                      }
                    >
                      {s.source}
                    </Badge>
                    <span className="text-muted-foreground">
                      {s.note ?? `${s.status} (added: ${s.fields_added ?? 0}, updated: ${s.fields_updated ?? 0})`}
                    </span>
                    {s.error && <span className="text-red-600 text-[10px]">{s.error.slice(0, 80)}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {result.top_matches.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Top dopasowane produkty:</div>
                <ul className="text-xs">
                  {result.top_matches.map((m, idx) => (
                    <li key={m.product_id} className="flex items-center gap-2 py-0.5">
                      <span className="inline-block w-6 text-right font-mono">#{idx + 1}</span>
                      <Badge className="bg-amber-500 text-white">{m.combined_score}</Badge>
                      <span>{m.product_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.client_id && (
              <Button onClick={() => router.push(`/clients/${result.client_id}`)} className="w-full">
                Otwórz profil firmy →
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
