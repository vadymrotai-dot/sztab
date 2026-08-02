'use client'

// components/produkty/marze-editor.tsx
// Faza 1 DAGOLD — KROK C + Część 1 (identyfikacja/grupowanie):
// grupowanie Dostawca → Kategoria (reuse mechanizmu z ProduktyShell),
// gramatura/EAN/jednostka w wierszu, link do pełnej edycji /products/[id]/edit,
// inline marża_bazowa_pct + podgląd ceny segmentu A (cost/(1−marża)).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronRightIcon, PencilIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  updateProductMarza,
  setProductShowInOrders,
} from '@/app/actions/pricing-admin'

export interface MarzaRow {
  id: string
  name: string
  display_name: string | null
  category: string | null
  gramatura: string | null
  ean: string | null
  unit: string | null
  brand: string | null
  supplier_id: string | null
  cost_pln: number | null
  marza_bazowa_pct: number | null // ułamek
  show_in_orders: boolean
}

export interface SupplierLite {
  id: string
  name: string
}

type GroupBy = 'dostawca' | 'kategoria'

const fracToStr = (v: number | null): string => (v == null ? '' : (v * 100).toFixed(1))

function strToFrac(s: string): number | null | typeof NaN {
  const t = s.trim()
  if (t === '') return null
  const n = Number.parseFloat(t.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > 95) return NaN
  return Math.round((n / 100) * 10000) / 10000
}

function segAPrice(cost: number | null, frac: number | null | typeof NaN): number | null {
  if (cost == null || !(cost > 0)) return null
  if (frac == null || Number.isNaN(frac) || !((frac as number) < 1)) return null
  return Math.round((cost / (1 - (frac as number))) * 100) / 100
}

export function MarzeEditor({
  products,
  suppliers,
}: {
  products: MarzaRow[]
  suppliers: SupplierLite[]
}) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('dostawca')
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, fracToStr(p.marza_bazowa_pct)])),
  )
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, fracToStr(p.marza_bazowa_pct)])),
  )
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Task #14 Część 2 — optymistyczny stan widoczności + blokada w trakcie zapisu.
  const [vis, setVis] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p.show_in_orders])),
  )
  const [visBusy, setVisBusy] = useState<Record<string, boolean>>({})

  const supplierById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of suppliers) m.set(s.id, s.name)
    return m
  }, [suppliers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      [p.name, p.display_name, p.category, p.gramatura, p.ean, p.brand]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    )
  }, [products, search])

  // 2-poziomowe drzewo top → sub (reuse wzorca z ProduktyShell).
  const tree = useMemo(() => {
    const t = new Map<string, Map<string, MarzaRow[]>>()
    for (const p of filtered) {
      const supplierName = supplierById.get(p.supplier_id ?? '') ?? 'Bez dostawcy'
      const cat = p.category ?? 'Bez kategorii'
      const topKey = groupBy === 'dostawca' ? supplierName : cat
      const subKey = groupBy === 'dostawca' ? cat : supplierName
      if (!t.has(topKey)) t.set(topKey, new Map())
      const sub = t.get(topKey)!
      if (!sub.has(subKey)) sub.set(subKey, [])
      sub.get(subKey)!.push(p)
    }
    return t
  }, [filtered, groupBy, supplierById])

  async function save(p: MarzaRow) {
    const frac = strToFrac(draft[p.id] ?? '')
    if (Number.isNaN(frac)) {
      toast.error('Marża musi być w zakresie 0–95%')
      return
    }
    setSaving((s) => ({ ...s, [p.id]: true }))
    const res = await updateProductMarza(p.id, frac as number | null)
    setSaving((s) => ({ ...s, [p.id]: false }))
    if (!res.ok) {
      toast.error(`Nie zapisano: ${res.error}`)
      return
    }
    setSaved((s) => ({ ...s, [p.id]: draft[p.id] ?? '' }))
    toast.success(`Zapisano marżę: ${p.name}`)
  }

  // Task #14 Część 2 — natychmiastowy zapis widoczności (bez osobnego „Zapisz").
  async function toggleVis(p: MarzaRow, next: boolean) {
    setVis((v) => ({ ...v, [p.id]: next })) // optymistycznie
    setVisBusy((b) => ({ ...b, [p.id]: true }))
    const res = await setProductShowInOrders(p.id, next)
    setVisBusy((b) => ({ ...b, [p.id]: false }))
    if (!res.ok) {
      setVis((v) => ({ ...v, [p.id]: !next })) // rollback
      toast.error(`Nie zmieniono widoczności: ${res.error}`)
      return
    }
    toast.success(`${p.name}: ${next ? 'w ofercie' : 'ukryty'}`)
  }

  function toggleGroup(key: string) {
    setCollapsed((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj: nazwa / EAN / kategoria / gramatura…"
          className="h-9 max-w-sm"
        />
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-[#E5E1D8] p-0.5 text-[12px]">
            {(['dostawca', 'kategoria'] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`rounded px-2.5 py-1 ${groupBy === g ? 'bg-[#EEEDFE] text-[#3730A3]' : 'text-[#555] hover:bg-[#FAFAF7]'}`}
              >
                {g === 'dostawca' ? 'Dostawca' : 'Kategoria'}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-[#888]">{filtered.length} produktów</span>
        </div>
      </div>

      {tree.size === 0 && (
        <div className="rounded-lg border border-[#E5E1D8] bg-white px-4 py-8 text-center text-[#888]">
          Brak produktów dla „{search}".
        </div>
      )}

      {Array.from(tree.entries()).map(([topKey, sub]) => {
        const isCollapsed = collapsed.has(topKey)
        const topCount = Array.from(sub.values()).reduce((n, arr) => n + arr.length, 0)
        return (
          <div key={topKey} className="overflow-hidden rounded-lg border border-[#E5E1D8] bg-white">
            <button
              onClick={() => toggleGroup(topKey)}
              className="flex w-full items-center gap-2 bg-[#F5F3ED] px-4 py-2 text-left text-[13px] font-semibold hover:bg-[#EFEDE4]"
            >
              <ChevronRightIcon
                className={`size-4 shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
              />
              <span>{topKey}</span>
              <span className="ml-1 text-[11px] font-normal text-[#888]">({topCount})</span>
            </button>

            {!isCollapsed &&
              Array.from(sub.entries()).map(([subKey, rows]) => (
                <div key={subKey}>
                  <div className="border-y border-[#F0EDE5] bg-[#FAFAF7] px-4 py-1.5 text-[11px] uppercase tracking-wider text-[#999]">
                    {subKey} · {rows.length}
                  </div>
                  <table className="w-full text-[13px]">
                    <thead className="border-b border-[#F0EDE5] text-left text-[11px] uppercase tracking-wider text-[#bbb]">
                      <tr>
                        <th className="px-4 py-1.5 font-medium">Produkt</th>
                        <th className="px-3 py-1.5 font-medium">Gramatura</th>
                        <th className="px-3 py-1.5 font-medium">EAN</th>
                        <th className="px-3 py-1.5 font-medium">Jedn.</th>
                        <th className="px-3 py-1.5 text-right font-medium">Koszt PLN</th>
                        <th className="px-3 py-1.5 text-right font-medium">Marża %</th>
                        <th className="px-3 py-1.5 text-right font-medium">Cena A</th>
                        <th className="px-3 py-1.5 text-center font-medium">W ofercie</th>
                        <th className="px-3 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => {
                        const frac = strToFrac(draft[p.id] ?? '')
                        const preview = segAPrice(p.cost_pln, frac)
                        const dirty = (draft[p.id] ?? '') !== (saved[p.id] ?? '')
                        const invalid = Number.isNaN(frac)
                        return (
                          <tr key={p.id} className="border-b border-[#F5F3ED] last:border-b-0 hover:bg-[#FAFAF7]">
                            <td className="px-4 py-2">
                              <div>{p.name}</div>
                              {(p.display_name && p.display_name !== p.name) || p.brand ? (
                                <div className="text-[11px] text-[#999]">
                                  {p.display_name && p.display_name !== p.name ? p.display_name : ''}
                                  {p.display_name && p.display_name !== p.name && p.brand ? ' · ' : ''}
                                  {p.brand ?? ''}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-[#666]">{p.gramatura ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-[12px] text-[#666]">{p.ean ?? '—'}</td>
                            <td className="px-3 py-2 text-[#666]">{p.unit ?? '—'}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {p.cost_pln != null ? p.cost_pln.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                value={draft[p.id] ?? ''}
                                onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                                placeholder="—"
                                inputMode="decimal"
                                className={`h-8 w-20 text-right font-mono ${invalid ? 'border-red-400' : ''}`}
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {preview != null ? (
                                `${preview.toFixed(2)} zł`
                              ) : p.cost_pln == null ? (
                                <span className="text-amber-600" title="Brak cost_pln">brak kosztu</span>
                              ) : (
                                <span className="text-[#bbb]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Switch
                                checked={vis[p.id] ?? false}
                                disabled={visBusy[p.id]}
                                onCheckedChange={(v) => toggleVis(p, v)}
                                aria-label={`Widoczność w ofercie: ${p.name}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant={dirty ? 'default' : 'outline'}
                                  disabled={!dirty || invalid || saving[p.id]}
                                  onClick={() => save(p)}
                                >
                                  {saving[p.id] ? 'Zapis…' : 'Zapisz'}
                                </Button>
                                <Button size="sm" variant="ghost" asChild title="Pełna edycja">
                                  <Link href={`/products/${p.id}/edit`}>
                                    <PencilIcon className="size-3.5" />
                                  </Link>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )
      })}

      <p className="text-[12px] text-[#888]">
        Puste pole marży = produkt korzysta ze starej logiki (fallback). Cena
        segment A = koszt PLN / (1 − marża). „Edytuj" otwiera pełny formularz
        produktu (koszt, EAN, tiery). Przełącznik „W ofercie" = widoczność w
        formularzu zamówień klienta (zapis natychmiastowy). Grupowanie: Dostawca → Kategoria.
      </p>
    </div>
  )
}
