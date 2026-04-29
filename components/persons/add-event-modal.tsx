// components/persons/add-event-modal.tsx
// Sprint K / Phase 7 — modal для додавання person event.

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2Icon, PlusIcon } from 'lucide-react'

const EVENT_TYPES = [
  { value: 'urodziny', label: 'Urodziny' },
  { value: 'imieniny', label: 'Imieniny' },
  { value: 'rocznica_pracy', label: 'Rocznica pracy' },
  { value: 'rocznica_firmy', label: 'Rocznica firmy' },
  { value: 'nagroda', label: 'Nagroda' },
  { value: 'awans', label: 'Awans' },
  { value: 'wystąpienie', label: 'Wystąpienie' },
  { value: 'inne', label: 'Inne' },
]

export function AddEventModal({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [typ, setTyp] = useState('urodziny')
  const [data, setData] = useState('')
  const [miesiac, setMiesiac] = useState('')
  const [dzien, setDzien] = useState('')
  const [opis, setOpis] = useState('')
  const [repeat, setRepeat] = useState(true)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { typ, opis: opis || null, repeat_yearly: repeat }
      if (data) {
        body.data = data
      } else if (miesiac && dzien) {
        body.miesiac = parseInt(miesiac, 10)
        body.dzien = parseInt(dzien, 10)
      } else {
        throw new Error('Podaj datę lub miesiąc/dzień')
      }
      const res = await fetch(`/api/persons/${personId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Save failed')
      setOpen(false)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon className="size-4 mr-1" />
        Dodaj wydarzenie
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">Dodaj wydarzenie</h3>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Typ</Label>
            <Select value={typ} onValueChange={setTyp}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Pełna data (jeśli znana)</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Lub tylko miesiąc/dzień</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={12}
                placeholder="MM"
                value={miesiac}
                onChange={(e) => setMiesiac(e.target.value)}
                className="w-20"
              />
              <Input
                type="number"
                min={1}
                max={31}
                placeholder="DD"
                value={dzien}
                onChange={(e) => setDzien(e.target.value)}
                className="w-20"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Opis (opcjonalnie)</Label>
            <Input value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="np. 50-te urodziny" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
            />
            Powtarza się co roku (urodziny / imieniny / rocznice)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2Icon className="size-4 mr-1 animate-spin" /> : null}
              Zapisz
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
