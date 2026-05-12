// components/persons/person-edit-panel.tsx
// Inline edit panel: birthday/linkedin/emails/phone + chips + notes.

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2Icon, PencilIcon, SaveIcon, XIcon } from 'lucide-react'

interface PersonInitial {
  id: string
  imie: string
  nazwisko: string
  email_glowny: string | null
  email_prywatny: string | null
  telefon_komorkowy: string | null
  linkedin_url: string | null
  data_urodzenia: string | null
  miesiac_urodzenia: number | null
  dzien_urodzenia: number | null
  zainteresowania: string[]
  mocne_strony: string[]
  notatki_wewnetrzne: string | null
}

export function PersonEditPanel({ person }: { person: PersonInitial }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [emailGlowny, setEmailGlowny] = useState(person.email_glowny ?? '')
  const [emailPrywatny, setEmailPrywatny] = useState(person.email_prywatny ?? '')
  const [phone, setPhone] = useState(person.telefon_komorkowy ?? '')
  const [linkedin, setLinkedin] = useState(person.linkedin_url ?? '')
  const [birthday, setBirthday] = useState(person.data_urodzenia ?? '')
  const [bmonth, setBmonth] = useState(person.miesiac_urodzenia?.toString() ?? '')
  const [bday, setBday] = useState(person.dzien_urodzenia?.toString() ?? '')
  const [interestsInput, setInterestsInput] = useState('')
  const [interests, setInterests] = useState<string[]>(person.zainteresowania ?? [])
  const [strengthsInput, setStrengthsInput] = useState('')
  const [strengths, setStrengths] = useState<string[]>(person.mocne_strony ?? [])
  const [notes, setNotes] = useState(person.notatki_wewnetrzne ?? '')

  function addChip(setter: (v: string[]) => void, current: string[], input: string, setInput: (v: string) => void) {
    const v = input.trim()
    if (!v) return
    setter(Array.from(new Set([...current, v])))
    setInput('')
  }

  function removeChip(setter: (v: string[]) => void, current: string[], v: string) {
    setter(current.filter((x) => x !== v))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        email_glowny: emailGlowny || null,
        email_prywatny: emailPrywatny || null,
        telefon_komorkowy: phone || null,
        linkedin_url: linkedin || null,
        zainteresowania: interests,
        mocne_strony: strengths,
        notatki_wewnetrzne: notes || null,
      }
      if (birthday) {
        body.data_urodzenia = birthday
      } else if (bmonth && bday) {
        body.miesiac_urodzenia = parseInt(bmonth, 10)
        body.dzien_urodzenia = parseInt(bday, 10)
        body.data_urodzenia = null
      }
      const res = await fetch(`/api/persons/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Save failed')
      setEditing(false)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Edycja danych osoby</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon className="size-4 mr-1" />
            Edytuj
          </Button>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Edycja</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            <XIcon className="size-4 mr-1" />
            Anuluj
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2Icon className="size-4 mr-1 animate-spin" /> : <SaveIcon className="size-4 mr-1" />}
            Zapisz
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Email główny</Label>
            <Input value={emailGlowny} onChange={(e) => setEmailGlowny(e.target.value)} placeholder="kontakt@firma.pl" />
          </div>
          <div>
            <Label className="text-xs">Email prywatny</Label>
            <Input value={emailPrywatny} onChange={(e) => setEmailPrywatny(e.target.value)} placeholder="..." />
          </div>
          <div>
            <Label className="text-xs">Telefon komórkowy</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48..." />
          </div>
          <div>
            <Label className="text-xs">LinkedIn URL</Label>
            <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Data urodzenia (jeśli pełna data znana)</Label>
          <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          <p className="text-[10px] text-muted-foreground">Lub tylko miesiąc/dzień (rok nieznany):</p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={12}
              placeholder="MM"
              value={bmonth}
              onChange={(e) => setBmonth(e.target.value)}
              className="w-20"
            />
            <Input
              type="number"
              min={1}
              max={31}
              placeholder="DD"
              value={bday}
              onChange={(e) => setBday(e.target.value)}
              className="w-20"
            />
          </div>
        </div>

        <ChipEditor
          label="Zainteresowania"
          placeholder="np. wędkarstwo, gotowanie..."
          chips={interests}
          input={interestsInput}
          setInput={setInterestsInput}
          onAdd={() => addChip(setInterests, interests, interestsInput, setInterestsInput)}
          onRemove={(v) => removeChip(setInterests, interests, v)}
        />
        <ChipEditor
          label="Mocne strony"
          placeholder="np. otwarty na nowości, decydent..."
          chips={strengths}
          input={strengthsInput}
          setInput={setStrengthsInput}
          onAdd={() => addChip(setStrengths, strengths, strengthsInput, setStrengthsInput)}
          onRemove={(v) => removeChip(setStrengths, strengths, v)}
        />

        <div>
          <Label className="text-xs">Notatka wewnętrzna</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded border px-2 py-1 text-sm"
            placeholder="Notatki o osobie — preferencje, history, kontekst..."
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ChipEditor({
  label,
  placeholder,
  chips,
  input,
  setInput,
  onAdd,
  onRemove,
}: {
  label: string
  placeholder: string
  chips: string[]
  input: string
  setInput: (v: string) => void
  onAdd: () => void
  onRemove: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
        />
        <Button size="sm" variant="outline" onClick={onAdd}>
          Dodaj
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 pt-1">
        {chips.map((c) => (
          <Badge key={c} variant="outline" className="cursor-pointer" onClick={() => onRemove(c)}>
            {c} ✗
          </Badge>
        ))}
      </div>
    </div>
  )
}
