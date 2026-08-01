'use client'

// components/ustawienia/price-segments-editor.tsx
// Faza 1 DAGOLD (089) — KROK D: edycja segmentów cenowych + dodawanie nowych.
// znizka_pct przechowywane jako ułamek, UI pokazuje %.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { upsertPriceSegment } from '@/app/actions/pricing-admin'

export interface PriceSegment {
  code: string
  name: string
  znizka_pct: number // ułamek
  sort_order: number
}

const pctToStr = (v: number) => (v * 100).toFixed(1)

function parsePct(s: string): number | null {
  const n = Number.parseFloat(s.trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > 95) return null
  return Math.round((n / 100) * 10000) / 10000
}

export function PriceSegmentsEditor({ segments }: { segments: PriceSegment[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(
    segments.map((s) => ({ ...s, nameDraft: s.name, pctDraft: pctToStr(s.znizka_pct) })),
  )
  const [busy, setBusy] = useState<string | null>(null)

  // nowy segment
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newPct, setNewPct] = useState('0')

  async function saveRow(code: string) {
    const row = rows.find((r) => r.code === code)
    if (!row) return
    const frac = parsePct(row.pctDraft)
    if (frac == null) return toast.error('Zniżka 0–95%')
    if (!row.nameDraft.trim()) return toast.error('Nazwa wymagana')
    setBusy(code)
    const res = await upsertPriceSegment({
      code,
      name: row.nameDraft.trim(),
      znizka_pct: frac,
      sort_order: row.sort_order,
    })
    setBusy(null)
    if (!res.ok) return toast.error(`Nie zapisano: ${res.error}`)
    toast.success(`Zapisano segment ${code}`)
    router.refresh()
  }

  async function addSegment() {
    const code = newCode.trim().toUpperCase()
    if (!/^[A-Z0-9_-]+$/.test(code)) return toast.error('Kod: litery/cyfry/-/_')
    if (rows.some((r) => r.code === code)) return toast.error('Segment o tym kodzie już istnieje')
    const frac = parsePct(newPct)
    if (frac == null) return toast.error('Zniżka 0–95%')
    if (!newName.trim()) return toast.error('Nazwa wymagana')
    setBusy('__new__')
    const res = await upsertPriceSegment({
      code,
      name: newName.trim(),
      znizka_pct: frac,
      sort_order: (rows.at(-1)?.sort_order ?? 0) + 1,
    })
    setBusy(null)
    if (!res.ok) return toast.error(`Nie dodano: ${res.error}`)
    toast.success(`Dodano segment ${code}`)
    setNewCode('')
    setNewName('')
    setNewPct('0')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-[#E5E1D8] bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-[#E5E1D8] bg-[#FAFAF7] text-left text-[11px] uppercase tracking-wider text-[#888]">
            <tr>
              <th className="px-4 py-2 font-medium">Kod</th>
              <th className="px-3 py-2 font-medium">Nazwa</th>
              <th className="px-3 py-2 text-right font-medium">Zniżka %</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.code} className="border-b border-[#F0EDE5] last:border-b-0">
                <td className="px-4 py-2 font-mono font-medium">{r.code}</td>
                <td className="px-3 py-2">
                  <Input
                    value={r.nameDraft}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, nameDraft: e.target.value } : x)),
                      )
                    }
                    className="h-8"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Input
                    value={r.pctDraft}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, pctDraft: e.target.value } : x)),
                      )
                    }
                    inputMode="decimal"
                    className="h-8 w-20 text-right font-mono"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" disabled={busy === r.code} onClick={() => saveRow(r.code)}>
                    {busy === r.code ? 'Zapis…' : 'Zapisz'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-dashed border-[#E5E1D8] bg-white p-4">
        <h3 className="mb-3 text-[13px] font-medium">Dodaj nowy segment</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-[#888]">Kod</label>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="D" className="h-8 w-20 font-mono" />
          </div>
          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-[11px] uppercase tracking-wider text-[#888]">Nazwa</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Segment D" className="h-8" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-[#888]">Zniżka %</label>
            <Input value={newPct} onChange={(e) => setNewPct(e.target.value)} inputMode="decimal" className="h-8 w-20 text-right font-mono" />
          </div>
          <Button size="sm" disabled={busy === '__new__'} onClick={addSegment}>
            {busy === '__new__' ? 'Dodawanie…' : 'Dodaj'}
          </Button>
        </div>
      </div>

      <p className="text-[12px] text-[#888]">
        Zniżka liczona od ceny segmentu A (marża bazowa produktu). Segment A = 0%
        (cena referencyjna). Cena klienta = cena_A × (1 − zniżka segmentu), chyba
        że klient ma ustawioną zniżkę indywidualną (nadpisuje segment).
      </p>
    </div>
  )
}
