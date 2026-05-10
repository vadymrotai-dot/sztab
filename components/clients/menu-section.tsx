'use client'

// components/clients/menu-section.tsx
// Sprint S6D Day 3 (12.05.2026) — menu display section на /clients/{id}.
//
// Conditional render: тільки якщо client_type='gastronomia' (caller decides).
//
// Reads dishes з contact_enrichment WHERE source IN ('www_menu',
// 'wedo_pdf_menu', 'gmaps_menu') — merged by source priority:
//   1. www_menu / wedo_pdf_menu (full menu — dishes_count high)
//   2. gmaps_menu (popular only — 3-5 dishes typical)
//
// Coverage labels:
//   - "Pełne menu" — www_menu або wedo_pdf_menu з > 10 dishes
//   - "Tylko popularne" — gmaps_menu OR (www_menu з ≤ 10 dishes)
//   - "Brak" — no source returned dishes (UpMenu blocked)

import { useState } from 'react'
import { toast } from 'sonner'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface MenuDish {
  name_pl: string
  price_pln: number | null
  category: string | null
  description: string | null
}

export type MenuCoverage = 'full_menu' | 'popular_only' | 'none'
export type MenuDishesSource =
  | 'www_menu'
  | 'wedo_pdf_menu'
  | 'gmaps_menu'
  | 'manual'
  | 'mixed'

interface Props {
  dishes: MenuDish[]
  coverage: MenuCoverage
  source: MenuDishesSource
  /** Optional badge для "ostatnia aktualizacja" */
  lastUpdated?: string | null
  /** Якщо UpMenu detected але no dishes — show explanatory note */
  upMenuDetected?: boolean
}

const COVERAGE_LABELS_PL: Record<MenuCoverage, { label: string; tone: string }> = {
  full_menu: { label: 'Pełne menu', tone: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  popular_only: { label: 'Tylko popularne', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  none: { label: 'Brak menu', tone: 'bg-gray-100 text-gray-700 border-gray-300' },
}

const SOURCE_LABELS_PL: Record<MenuDishesSource, string> = {
  www_menu: 'WWW menu (HTML)',
  wedo_pdf_menu: 'PDF menu (OCR)',
  gmaps_menu: 'Google Maps (popularne)',
  manual: 'Wpisane ręcznie',
  mixed: 'Wiele źródeł',
}

function formatPrice(price: number | null): string {
  if (price == null) return ''
  return `${price.toFixed(2)} zł`
}

export function MenuSection({
  dishes,
  coverage,
  source,
  lastUpdated,
  upMenuDetected,
}: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (dishes.length === 0) return
    const text = dishes
      .map((d) =>
        d.price_pln !== null
          ? `${d.name_pl} — ${formatPrice(d.price_pln)}`
          : d.name_pl,
      )
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`Skopiowano ${dishes.length} pozycji menu`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Nie udało się skopiować')
    }
  }

  // Group by category — dish без category landed у "Inne".
  const grouped = dishes.reduce<Record<string, MenuDish[]>>((acc, d) => {
    const cat = d.category ?? 'Inne'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(d)
    return acc
  }, {})
  const categoryNames = Object.keys(grouped).sort((a, b) => {
    if (a === 'Inne') return 1
    if (b === 'Inne') return -1
    return a.localeCompare(b, 'pl')
  })

  const coverageBadge = COVERAGE_LABELS_PL[coverage]
  const sourceLabel = SOURCE_LABELS_PL[source]

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">🍔 Menu klienta</h3>
        <Badge variant="outline" className={coverageBadge.tone}>
          Pokrycie: {coverageBadge.label}
        </Badge>
        {dishes.length > 0 && (
          <Badge variant="secondary">
            {dishes.length} {dishes.length === 1 ? 'danie' : 'dań'}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Źródło: {sourceLabel}
          {lastUpdated && ` · ${lastUpdated}`}
        </span>
      </div>

      {dishes.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-muted-foreground">
          {upMenuDetected ? (
            <>
              <p className="mb-1 font-medium">Menu na UpMenu (iframe)</p>
              <p className="text-xs">
                Restauracja korzysta z UpMenu — pełne menu nie jest dostępne dla
                automatycznego pobierania. Spróbuj otworzyć stronę restauracji
                ręcznie lub poczekaj na popularne dania z Google Maps.
              </p>
            </>
          ) : (
            <p>Brak menu — uruchom &quot;Pełna re-analiza&quot; aby pobrać dane.</p>
          )}
        </div>
      )}

      {dishes.length > 0 && (
        <>
          <div className="mb-3 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              disabled={copied}
              className="gap-1"
              title="Skopiuj menu do schowka"
            >
              {copied ? (
                <>
                  <CheckIcon className="size-3.5" />
                  Skopiowano
                </>
              ) : (
                <>
                  <CopyIcon className="size-3.5" />
                  Skopiuj menu
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            {categoryNames.map((cat) => {
              const items = grouped[cat]
              if (!items || items.length === 0) return null
              return (
                <div key={cat}>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat}
                  </h4>
                  <ul className="space-y-1">
                    {items.map((dish, i) => (
                      <li
                        key={`${cat}-${i}-${dish.name_pl}`}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="flex-1">
                          {dish.name_pl}
                          {dish.description && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {dish.description}
                            </span>
                          )}
                        </span>
                        {dish.price_pln !== null && (
                          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {formatPrice(dish.price_pln)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
