'use client'

// components/clients/website-override-card.tsx
// Sprint S-MENU Day 3 (15.05.2026) — Manual website override UI.
//
// 3 stany:
//   1. Empty (websiteUrl=null) — URL input + "Dodaj"
//   2. Present (websiteUrl set) — display з source badge + "Zmień"
//   3. Edit mode — input + "Zapisz" + "Zapisz i przeanalizuj" + "Anuluj"
//
// Workflow:
//   - "Zapisz" → POST /api/clients/[id]/website (saves з source='manual_override')
//   - "Zapisz i przeanalizuj" → save + POST /api/clients/[id]/full-analysis
//   - Toast progress for kроки
//   - router.refresh() after — re-renders page з updated website
//
// Why це critical: Tavily picks aggregator domains (monitorfirm.pb.pl, yelp.com)
// для many JDG-gastronomy clients. Vadym manual override = pragmatic escape.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GlobeIcon, PencilIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeUrl } from '@/lib/utils/url'

interface Props {
  clientId: string
  currentWebsite: string | null
  currentSource: string | null
}

// Source badge styling — keep consistent з contact-section-v2.tsx pattern
function sourceBadgeClass(source: string | null): string {
  if (!source) return 'bg-[#F5F5F5] text-[#555]'
  if (source === 'manual_override' || source === 'manual') {
    return 'bg-[#DBEAFE] text-[#1E40AF]' // blue — user-set
  }
  if (source === 'KRS' || source === 'sprawozdania_KRS') {
    return 'bg-[#DCFCE7] text-[#15803D]' // green — official
  }
  if (source === 'Apify_GMaps' || source === 'apify_gmaps') {
    return 'bg-[#FEF3C7] text-[#92400E]' // amber — Apify
  }
  if (source === 'tavily_brand') {
    return 'bg-[#E0E7FF] text-[#3730A3]' // indigo — brand-aware (good)
  }
  // Plain tavily — neutral / slightly cautious (often aggregator)
  return 'bg-[#F5F5F5] text-[#555]'
}

function sourceLabel(source: string | null): string {
  if (!source) return 'brak'
  if (source === 'manual_override') return 'manual ✏'
  if (source === 'manual') return 'manual (import)'
  if (source === 'tavily_brand') return 'tavily (brand)'
  if (source === 'apify_gmaps' || source === 'Apify_GMaps') return 'Google Maps'
  return source
}

export function WebsiteOverrideCard({ clientId, currentWebsite, currentSource }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentWebsite ?? '')
  const [busy, setBusy] = useState<'save' | 'save-analyze' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function saveWebsite(): Promise<boolean> {
    setError(null)
    if (!value.trim()) {
      setError('URL nie może być pusty')
      return false
    }
    const res = await fetch(`/api/clients/${clientId}/website`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: value.trim() }),
    })
    const json = (await res.json()) as { ok: boolean; error?: string; website_url?: string }
    if (!json.ok) {
      setError(json.error ?? 'Zapis nie powiódł się')
      return false
    }
    toast.success(`URL zapisany: ${json.website_url}`)
    return true
  }

  async function handleSave() {
    setBusy('save')
    try {
      const ok = await saveWebsite()
      if (ok) {
        setEditing(false)
        router.refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveAndAnalyze() {
    setBusy('save-analyze')
    try {
      const saveOk = await saveWebsite()
      if (!saveOk) return
      toast.info('Uruchamiam re-analizę…')
      const res = await fetch(`/api/clients/${clientId}/full-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        toast.error(`Re-analiza nie wystartowała: ${json.error ?? 'nieznany błąd'}`)
        return
      }
      toast.success('Pełna re-analiza w toku. Strona odświeży się automatycznie.')
      setEditing(false)
      // Phase A returns у ~10-30s; refresh page once Phase A done, Phase B
      // continues async і UI poll'ує menu_predictions/enrichment_log changes
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Błąd: ${msg}`)
    } finally {
      setBusy(null)
    }
  }

  function handleCancel() {
    setEditing(false)
    setError(null)
    setValue(currentWebsite ?? '')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GlobeIcon className="size-4 text-[#888]" />
          Strona WWW
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!editing ? (
          // STATES 1 & 2 — display mode
          <div className="space-y-3">
            {currentWebsite ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <a
                  className="font-medium hover:underline truncate max-w-[400px]"
                  href={normalizeUrl(currentWebsite)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {currentWebsite}
                </a>
                <ExternalLinkIcon className="size-3 text-[#888]" />
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sourceBadgeClass(currentSource)}`}
                  title={`Źródło: ${currentSource ?? 'brak'}`}
                >
                  {sourceLabel(currentSource)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Brak strony WWW. Dodaj URL aby uruchomić ekstrakcję menu (Restaumatic / Apify GMaps).
              </p>
            )}
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <PencilIcon className="size-3.5 mr-1.5" />
                {currentWebsite ? 'Zmień' : 'Dodaj'}
              </Button>
            </div>
            {currentWebsite && currentSource && currentSource !== 'manual_override' && currentSource !== 'manual' && (
              <p className="text-xs text-muted-foreground">
                URL ustawiony automatycznie ({sourceLabel(currentSource)}). Jeśli to nieprawidłowa strona —
                wprowadź właściwy adres ręcznie (priorytet wyższy niż automatyczne źródła).
              </p>
            )}
          </div>
        ) : (
          // STATE 3 — edit mode
          <div className="space-y-3">
            <Input
              type="url"
              placeholder="https://kemerkebab.pl"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              disabled={busy !== null}
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Pełny adres lub samą domenę (https:// dodamy automatycznie). Po zapisaniu
              możesz uruchomić re-analizę — Sztab spróbuje wyciągnąć menu z nowego URL.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={busy !== null || !value.trim()}
              >
                {busy === 'save' ? (
                  <>
                    <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />
                    Zapisuję…
                  </>
                ) : (
                  'Zapisz'
                )}
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleSaveAndAnalyze}
                disabled={busy !== null || !value.trim()}
              >
                {busy === 'save-analyze' ? (
                  <>
                    <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />
                    Zapisuję + uruchamiam…
                  </>
                ) : (
                  'Zapisz i przeanalizuj'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={busy !== null}
              >
                Anuluj
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
