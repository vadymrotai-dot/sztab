'use client'

// components/produkty/marze-editor.tsx
// Faza 1 DAGOLD (089) — KROK C: lista produktów z inline marża_bazowa_pct.
// Podgląd ceny segmentu A = cost_pln / (1 − marża). Zapis per-wiersz.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { updateProductMarza } from '@/app/actions/pricing-admin'

export interface MarzaRow {
  id: string
  name: string
  category: string | null
  cost_pln: number | null
  marza_bazowa_pct: number | null // ułamek
}

// ułamek → %-string do wyświetlenia w inpucie
const fracToStr = (v: number | null): string =>
  v == null ? '' : (v * 100).toFixed(1)

// %-string → ułamek (0..0.95) albo null (puste) albo NaN (błąd)
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

export function MarzeEditor({ products }: { products: MarzaRow[] }) {
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, fracToStr(p.marza_bazowa_pct)])),
  )
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, fracToStr(p.marza_bazowa_pct)])),
  )
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q),
    )
  }, [products, search])

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj produktu / kategorii…"
          className="h-9 max-w-sm"
        />
        <span className="text-[12px] text-[#888]">{filtered.length} produktów</span>
      </div>

      <div className="overflow-auto rounded-lg border border-[#E5E1D8] bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-[#E5E1D8] bg-[#FAFAF7] text-left text-[11px] uppercase tracking-wider text-[#888]">
            <tr>
              <th className="px-4 py-2 font-medium">Produkt</th>
              <th className="px-3 py-2 font-medium">Kategoria</th>
              <th className="px-3 py-2 text-right font-medium">Koszt PLN</th>
              <th className="px-3 py-2 text-right font-medium">Marża %</th>
              <th className="px-3 py-2 text-right font-medium">Cena segment A</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const frac = strToFrac(draft[p.id] ?? '')
              const preview = segAPrice(p.cost_pln, frac)
              const dirty = (draft[p.id] ?? '') !== (saved[p.id] ?? '')
              const invalid = Number.isNaN(frac)
              return (
                <tr key={p.id} className="border-b border-[#F0EDE5] last:border-b-0 hover:bg-[#FAFAF7]">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-[#888]">{p.category ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {p.cost_pln != null ? p.cost_pln.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      value={draft[p.id] ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [p.id]: e.target.value }))
                      }
                      placeholder="—"
                      inputMode="decimal"
                      className={`h-8 w-20 text-right font-mono ${invalid ? 'border-red-400' : ''}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {preview != null ? (
                      `${preview.toFixed(2)} zł`
                    ) : p.cost_pln == null ? (
                      <span className="text-amber-600" title="Brak cost_pln — cena nie policzy się">
                        brak kosztu
                      </span>
                    ) : (
                      <span className="text-[#bbb]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant={dirty ? 'default' : 'outline'}
                      disabled={!dirty || invalid || saving[p.id]}
                      onClick={() => save(p)}
                    >
                      {saving[p.id] ? 'Zapis…' : 'Zapisz'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-[#888]">
        Puste pole = brak marży bazowej → produkt korzysta ze starej logiki
        (fallback). Cena segment A = koszt PLN / (1 − marża). Segmenty B/C i
        indywidualna zniżka klienta liczą się od tej ceny.
      </p>
    </div>
  )
}
