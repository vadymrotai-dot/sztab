'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { Deal } from '@/lib/types'
import { DEAL_STAGES } from '@/lib/types'

interface DealFormProps {
  deal?: Deal
  clients: { id: string; title: string }[]
  defaultClientId?: string
}

export function DealForm({ deal, clients, defaultClientId }: DealFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const [formData, setFormData] = useState({
    title: deal?.title || '',
    client_id: deal?.client_id || defaultClientId || '',
    stage: deal?.stage || 'lead',
    amount: deal?.amount?.toString() || '0',
    close_date: deal?.close_date || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Musisz byc zalogowany')
      setLoading(false)
      return
    }

    const payload = {
      title: formData.title,
      client_id: formData.client_id || null,
      stage: formData.stage,
      amount: parseFloat(formData.amount) || 0,
      close_date: formData.close_date || null,
    }

    if (deal) {
      const { error } = await supabase
        .from('deals')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', deal.id)

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/deals')
        router.refresh()
      }
    } else {
      const { error } = await supabase
        .from('deals')
        .insert({ ...payload, owner_id: user.id })

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/deals')
        router.refresh()
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{deal ? 'Edytuj umowe' : 'Nowa umowa'}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="title">Tytul umowy *</FieldLabel>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="np. Dostawa produktow Q4 2024"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="client">Klient</FieldLabel>
              <Select
                value={formData.client_id}
                onValueChange={(value) => setFormData({ ...formData, client_id: value })}
              >
                <SelectTrigger id="client">
                  <SelectValue placeholder="Wybierz klienta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Brak klienta</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="stage">Etap</FieldLabel>
                <Select
                  value={formData.stage}
                  onValueChange={(value) => setFormData({ ...formData, stage: value as Deal['stage'] })}
                >
                  <SelectTrigger id="stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="amount">Wartosc (PLN)</FieldLabel>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="close_date">Planowana data zamkniecia</FieldLabel>
              <Input
                id="close_date"
                type="date"
                value={formData.close_date}
                onChange={(e) => setFormData({ ...formData, close_date: e.target.value })}
              />
            </Field>
          </FieldGroup>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          <div className="mt-6 flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}
              {deal ? 'Zapisz zmiany' : 'Dodaj umowe'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Anuluj
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
