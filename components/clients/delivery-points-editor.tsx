'use client'

// components/clients/delivery-points-editor.tsx
// Panel admina (28.09.2026) — "Punkty dostawy" 1:1 z components/portal/dane-editor.tsx
// (ta sama tabela client_delivery_points, te same pola) — żeby admin edytował
// dokładnie to co widzi klient. Dodatkowo "usuń trwale" — portal celowo go nie
// ma (chroni order_delivery_points), tu bezpieczne (ON DELETE SET NULL) i
// potrzebne do sprzątania śmieci testowych.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlusIcon } from 'lucide-react'
import {
  adminUpsertDeliveryPoint,
  adminDeactivateDeliveryPoint,
  adminDeleteDeliveryPoint,
} from '@/app/actions/portal-admin'

interface DeliveryPoint {
  id: string
  nazwa: string
  ulica: string | null
  kod_pocztowy: string | null
  miasto: string | null
  odbiorca_imie: string | null
  odbiorca_telefon: string | null
  typ_punktu: string | null
  is_active: boolean
}

interface Form {
  nazwa: string
  ulica: string
  kod_pocztowy: string
  miasto: string
  odbiorca_imie: string
  odbiorca_telefon: string
  typ_punktu: string
}

const emptyForm: Form = {
  nazwa: '',
  ulica: '',
  kod_pocztowy: '',
  miasto: '',
  odbiorca_imie: '',
  odbiorca_telefon: '',
  typ_punktu: 'sklep',
}

export function DeliveryPointsEditor({
  clientId,
  points,
}: {
  clientId: string
  points: DeliveryPoint[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<Form | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const active = points.filter((p) => p.is_active)
  const inactive = points.filter((p) => !p.is_active)
  const shown = showInactive ? points : active

  const openNew = () => {
    setForm({ ...emptyForm })
    setEditingId(null)
    setError(null)
  }
  const openEdit = (p: DeliveryPoint) => {
    setForm({
      nazwa: p.nazwa,
      ulica: p.ulica ?? '',
      kod_pocztowy: p.kod_pocztowy ?? '',
      miasto: p.miasto ?? '',
      odbiorca_imie: p.odbiorca_imie ?? '',
      odbiorca_telefon: p.odbiorca_telefon ?? '',
      typ_punktu: p.typ_punktu ?? 'sklep',
    })
    setEditingId(p.id)
    setError(null)
  }
  const closeForm = () => {
    setForm(null)
    setEditingId(null)
  }

  const save = async () => {
    if (!form || !form.nazwa.trim()) return
    setLoading(true)
    setError(null)
    const res = await adminUpsertDeliveryPoint(clientId, { id: editingId ?? undefined, ...form })
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    closeForm()
    router.refresh()
  }

  const deactivate = async (p: DeliveryPoint) => {
    if (!confirm(`Dezaktywować punkt "${p.nazwa}"? Zniknie z listy klienta, dane zostają (odwracalne).`)) return
    setLoading(true)
    setError(null)
    const res = await adminDeactivateDeliveryPoint(clientId, p.id)
    setLoading(false)
    if (!res.ok) setError(res.error)
    else router.refresh()
  }

  const hardDelete = async (p: DeliveryPoint) => {
    if (!confirm(`Usunąć punkt "${p.nazwa}" TRWALE? Tego nie da się cofnąć.`)) return
    setLoading(true)
    setError(null)
    const res = await adminDeleteDeliveryPoint(clientId, p.id)
    setLoading(false)
    if (!res.ok) setError(res.error)
    else router.refresh()
  }

  const field = (
    label: string,
    key: keyof Form,
    placeholder?: string,
    span2 = false,
  ) => (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="mb-1 block text-[11px] text-slate-500">{label}</label>
      <input
        value={form?.[key] ?? ''}
        onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
      />
    </div>
  )

  return (
    <div className="space-y-3">
      {error && <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {active.length} aktywnych{inactive.length > 0 ? `, ${inactive.length} nieaktywnych` : ''}
          </span>
          {inactive.length > 0 && (
            <button type="button" onClick={() => setShowInactive((s) => !s)} className="underline">
              {showInactive ? 'Ukryj nieaktywne' : 'Pokaż nieaktywne'}
            </button>
          )}
        </div>
        <Button size="sm" onClick={openNew} disabled={loading}>
          <PlusIcon className="mr-1 size-4" />
          Dodaj punkt
        </Button>
      </div>

      {form && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              {field('Nazwa punktu *', 'nazwa', undefined, true)}
              {field('Ulica i numer', 'ulica', undefined, true)}
              {field('Kod pocztowy', 'kod_pocztowy')}
              {field('Miasto', 'miasto')}
              {field('Osoba kontaktowa', 'odbiorca_imie')}
              {field('Telefon', 'odbiorca_telefon')}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeForm}>
                Anuluj
              </Button>
              <Button size="sm" disabled={loading || !form.nazwa.trim()} onClick={save}>
                {editingId ? 'Zapisz zmiany' : 'Dodaj'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {shown.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Brak punktów dostawy.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => (
            <div
              key={p.id}
              className={`flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm ${p.is_active ? 'border-slate-200' : 'border-slate-200 opacity-50'}`}
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {p.nazwa}
                  {!p.is_active && <span className="ml-2 text-xs text-muted-foreground">(nieaktywny)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[p.ulica, p.kod_pocztowy, p.miasto].filter(Boolean).join(', ') || '—'}
                  {p.odbiorca_imie ? ` · ${p.odbiorca_imie}` : ''}
                  {p.odbiorca_telefon ? ` · ${p.odbiorca_telefon}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                <button type="button" onClick={() => openEdit(p)} className="text-slate-500 hover:text-indigo-600">
                  Edytuj
                </button>
                {p.is_active && (
                  <button type="button" onClick={() => deactivate(p)} className="text-slate-500 hover:text-amber-600">
                    Usuń
                  </button>
                )}
                <button type="button" onClick={() => hardDelete(p)} className="text-slate-400 hover:text-red-600">
                  trwale
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
