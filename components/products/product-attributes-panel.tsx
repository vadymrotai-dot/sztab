// components/products/product-attributes-panel.tsx
// Sprint E — read-only attributes panel for product detail/edit page.
// Tabs: Atrybuty (z Family) / Atrybuty SKU (overrides) / Dane OFF.
// + button "Wzbogać teraz" → POST /api/products/[id]/enrich.

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HygieneBadge } from '@/components/products/hygiene-badge'
import { LeafIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MergedAttribute {
  attr_key: string
  attr_type: string
  value: unknown
  source: 'family_default' | 'off' | 'gemini' | 'manual' | 'override'
  locked: boolean
  required: boolean
  missing_required: boolean
}

interface ResolvedAttributes {
  product_id: string
  family_id: string | null
  family_name_pl: string | null
  required_attributes: string[]
  attributes: MergedAttribute[]
  hygiene: {
    status: 'CLEAN' | 'DIRTY' | 'UNCHECKED'
    issues: { key: string; issue: string }[]
  }
}

interface ProductExternalRow {
  off_payload: Record<string, unknown> | null
  off_fetched_at: string | null
  gemini_payload: Record<string, unknown> | null
  gemini_fetched_at: string | null
}

export function ProductAttributesPanel({
  productId,
  externalData,
}: {
  productId: string
  externalData: ProductExternalRow | null
}) {
  const [data, setData] = useState<ResolvedAttributes | null>(null)
  const [loading, setLoading] = useState(true)
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchAttributes() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/products/${productId}/attributes`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Błąd ładowania')
      setData(json.data as ResolvedAttributes)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleEnrich() {
    setEnriching(true)
    setError(null)
    try {
      const res = await fetch(`/api/products/${productId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Wzbogacanie nieudane')
      setData(json.data as ResolvedAttributes)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setEnriching(false)
    }
  }

  useEffect(() => {
    fetchAttributes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 inline animate-spin" /> Ładowanie atrybutów…
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">
          {error ?? 'Brak danych'}
        </CardContent>
      </Card>
    )
  }

  const fromFamily = data.attributes.filter(
    (a) => a.source === 'family_default' || (!a.locked && a.source !== 'manual' && a.source !== 'override'),
  )
  const overrides = data.attributes.filter(
    (a) => a.source === 'manual' || a.source === 'override' || a.locked,
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <LeafIcon className="size-5 text-emerald-600" />
            Atrybuty produktu
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Family: {data.family_name_pl ?? '— niesklasyfikowany —'}</span>
            <HygieneBadge status={data.hygiene.status} issues={data.hygiene.issues} />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleEnrich}
          disabled={enriching || !data.family_id}
        >
          {enriching ? (
            <Loader2Icon className="size-4 mr-1 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4 mr-1" />
          )}
          {enriching ? 'Wzbogacanie…' : 'Wzbogać teraz'}
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="family">
          <TabsList>
            <TabsTrigger value="family">
              Atrybuty (z Family) ({fromFamily.length})
            </TabsTrigger>
            <TabsTrigger value="overrides">
              Atrybuty SKU (overrides) ({overrides.length})
            </TabsTrigger>
            <TabsTrigger value="external">Dane zewnętrzne (OFF)</TabsTrigger>
          </TabsList>

          <TabsContent value="family" className="mt-4">
            <AttributeList items={fromFamily} />
          </TabsContent>
          <TabsContent value="overrides" className="mt-4">
            {overrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Brak ręcznych overrides. Wartości pochodzą z Family defaults / OFF / Gemini.
              </p>
            ) : (
              <AttributeList items={overrides} />
            )}
          </TabsContent>
          <TabsContent value="external" className="mt-4">
            <OFFPanel external={externalData} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function AttributeList({ items }: { items: MergedAttribute[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak.</p>
  }
  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li
          key={a.attr_key}
          className="flex items-start justify-between gap-4 py-2"
        >
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{a.attr_key}</span>
              {a.required && (
                <Badge variant="outline" className="h-5 text-[10px]">
                  required
                </Badge>
              )}
              {a.locked && (
                <Badge className="h-5 bg-purple-600 text-[10px] text-white">
                  locked
                </Badge>
              )}
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                  sourceClasses(a.source),
                )}
              >
                {a.source}
              </span>
            </div>
            <div className="text-sm">
              {a.value === null || a.value === undefined ? (
                <span className="text-muted-foreground italic">
                  {a.missing_required ? '⚠️ wymagany — brak' : '—'}
                </span>
              ) : (
                <span>{formatValue(a.value)}</span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function OFFPanel({ external }: { external: ProductExternalRow | null }) {
  if (!external?.off_payload) {
    return (
      <p className="text-sm text-muted-foreground">
        Brak danych z Open Food Facts. Kliknij &quot;Wzbogać teraz&quot; aby pobrać.
      </p>
    )
  }
  const fetchedAt = external.off_fetched_at
    ? new Date(external.off_fetched_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })
    : '—'
  const product = (external.off_payload as { product?: Record<string, unknown> }).product ?? {}

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Pobrano: {fetchedAt}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {(['brands', 'categories', 'quantity', 'packaging', 'allergens', 'ingredients_text', 'image_front_url'] as const).map((k) => {
          const v = product[k]
          if (!v) return null
          return (
            <div key={k} className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="break-words">
                {String(v).length > 200 ? `${String(v).slice(0, 200)}…` : String(v)}
              </dd>
            </div>
          )
        })}
      </dl>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:underline">
          Raw OFF payload (JSON)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-2 text-[10px]">
          {JSON.stringify(external.off_payload, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object' && v !== null) return JSON.stringify(v)
  return String(v)
}

function sourceClasses(source: string): string {
  switch (source) {
    case 'family_default':
      return 'bg-slate-200 text-slate-800'
    case 'off':
      return 'bg-emerald-100 text-emerald-800'
    case 'gemini':
      return 'bg-blue-100 text-blue-800'
    case 'manual':
      return 'bg-amber-100 text-amber-800'
    case 'override':
      return 'bg-purple-100 text-purple-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
