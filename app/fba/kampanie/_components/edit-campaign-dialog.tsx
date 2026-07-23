'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CampaignRow } from '../page'

const PKD_OPTIONS = [
  { id: '6201Z', label: '💻 Programista' },
  { id: '6202Z', label: '🖥️ Konsultant IT' },
  { id: '6220B', label: '🖥️ Konsultant IT (2025)' },
  { id: '7410Z', label: '🎨 Designer' },
  { id: '7411Z', label: '🎨 Grafik (2025)' },
  { id: '7412Z', label: '📐 Design wizualny (2025)' },
  { id: '7420Z', label: '📷 Fotograf' },
  { id: '7311Z', label: '📣 Marketing/SMM' },
  { id: '7430Z', label: '🌍 Tłumacz' },
  { id: '9003Z', label: '✍️ Copywriter' },
]

const ZUS_OPTIONS = [
  { id: 'PELNY', label: '🔴 Pełny ZUS' },
  { id: 'MALY', label: '🟡 Mały ZUS' },
  { id: 'ULGA', label: '🟢 Ulga' },
]

const OBYW_OPTIONS = [
  { id: 'PL', label: '🇵🇱 PL' },
  { id: 'UA', label: '🇺🇦 UA' },
  { id: 'BY', label: '🇧🇾 BY' },
  { id: 'INNE', label: '🌍 Inne (non-EU)' },
]

const REGION_OPTIONS = [
  { id: 'mazowieckie', label: '🏙️ Mazowieckie (Warszawa)' },
  { id: 'malopolskie', label: '🏔️ Małopolskie (Kraków)' },
  { id: 'dolnoslaskie', label: '⛪ Dolnośląskie (Wrocław)' },
  { id: 'wielkopolskie', label: '🌾 Wielkopolskie (Poznań)' },
  { id: 'pomorskie', label: '⚓ Pomorskie (Gdańsk)' },
  { id: 'slaskie', label: '🏭 Śląskie (Katowice)' },
  { id: 'lodzkie', label: '🧵 Łódzkie (Łódź)' },
  { id: 'lubelskie', label: '🌻 Lubelskie (Lublin)' },
  { id: 'podkarpackie', label: '🏕️ Podkarpackie (Rzeszów)' },
  { id: 'kujawsko-pomorskie', label: '🌊 Kujawsko-Pomorskie (Bydgoszcz)' },
  { id: 'warminsko-mazurskie', label: '🦌 Warmińsko-Mazurskie (Olsztyn)' },
  { id: 'zachodniopomorskie', label: '🌅 Zachodniopomorskie (Szczecin)' },
  { id: 'lubuskie', label: '🌲 Lubuskie (Zielona Góra)' },
  { id: 'swietokrzyskie', label: '⛰️ Świętokrzyskie (Kielce)' },
  { id: 'podlaskie', label: '🦬 Podlaskie (Białystok)' },
  { id: 'opolskie', label: '🌷 Opolskie (Opole)' },
]

function MultiToggle({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => toggle(o.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            selected.includes(o.id)
              ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
              : 'border-border bg-background text-muted-foreground hover:border-emerald-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface EditCampaignDialogProps {
  campaign: CampaignRow | null
  open: boolean
  onClose: () => void
  onSaved: (updated: CampaignRow) => void
}

export function EditCampaignDialog({ campaign, open, onClose, onSaved }: EditCampaignDialogProps) {
  const [name, setName] = useState('')
  const [pkd, setPkd] = useState<string[]>([])
  const [zus, setZus] = useState<string[]>([])
  const [obyw, setObyw] = useState<string[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (campaign) {
      setName(campaign.name)
      setPkd(campaign.filter_pkd ?? [])
      setZus(campaign.filter_zus ?? [])
      setObyw(campaign.filter_obyw ?? [])
      setRegions(campaign.filter_regions ?? [])
      setError(null)
    }
  }, [campaign])

  async function handleSubmit() {
    if (!name.trim()) { setError('Podaj nazwę kampanii'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/fba/kampanie/${campaign!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          filter_pkd: pkd.length > 0 ? pkd : null,
          filter_zus: zus.length > 0 ? zus : null,
          filter_obyw: obyw.length > 0 ? obyw : null,
          filter_regions: regions.length > 0 ? regions : null,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Błąd zapisu')
      }
      onSaved({
        ...campaign!,
        name: name.trim(),
        filter_pkd: pkd.length > 0 ? pkd : null,
        filter_zus: zus.length > 0 ? zus : null,
        filter_obyw: obyw.length > 0 ? obyw : null,
        filter_regions: regions.length > 0 ? regions : null,
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!campaign) return null

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edytuj kampanię</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Nazwa kampanii *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>PKD — branża</Label>
            <MultiToggle options={PKD_OPTIONS} selected={pkd} onChange={setPkd} />
          </div>
          <div className="space-y-1.5">
            <Label>ZUS segment</Label>
            <MultiToggle options={ZUS_OPTIONS} selected={zus} onChange={setZus} />
          </div>
          <div className="space-y-1.5">
            <Label>Kraj / obywatelstwo</Label>
            <MultiToggle options={OBYW_OPTIONS} selected={obyw} onChange={setObyw} />
          </div>
          <div className="space-y-1.5">
            <Label>Region / Województwo</Label>
            <MultiToggle options={REGION_OPTIONS} selected={regions} onChange={setRegions} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Anuluj</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Zapisuję...' : 'Zapisz zmiany'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
