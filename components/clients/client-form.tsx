'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import type { Client } from '@/lib/types'
import { CLIENT_SEGMENTS } from '@/lib/types'

interface ClientFormProps {
  client?: Client
}

const statusOptions = [
  { value: 'nowy', label: 'Nowy' },
  { value: 'aktywny', label: 'Aktywny' },
  { value: 'nieaktywny', label: 'Nieaktywny' },
]

export function ClientForm({ client }: ClientFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const [formData, setFormData] = useState({
    title: client?.title || '',
    nip: client?.nip || '',
    city: client?.city || '',
    address: client?.address || '',
    region: client?.region || '',
    industry: client?.industry || '',
    email: client?.email || '',
    phone: client?.phone || '',
    notes: client?.notes || '',
    segment: client?.segment || 'niesklasyfikowany',
    status: client?.status || 'nowy',
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

    if (client) {
      const { error } = await supabase
        .from('clients')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', client.id)

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push(`/clients/${client.id}`)
        router.refresh()
      }
    } else {
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...formData, owner_id: user.id })
        .select()
        .single()

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push(`/clients/${data.id}`)
        router.refresh()
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{client ? 'Edytuj klienta' : 'Nowy klient'}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="title">Nazwa firmy *</FieldLabel>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nip">NIP</FieldLabel>
                <Input
                  id="nip"
                  value={formData.nip}
                  onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                  placeholder="0000000000"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="industry">Branza</FieldLabel>
                <Input
                  id="industry"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="city">Miasto</FieldLabel>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="region">Region</FieldLabel>
                <Input
                  id="region"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="address">Adres</FieldLabel>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Telefon</FieldLabel>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="segment">Segment</FieldLabel>
                <Select
                  value={formData.segment}
                  onValueChange={(value) => setFormData({ ...formData, segment: value as Client['segment'] })}
                >
                  <SelectTrigger id="segment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_SEGMENTS.map((seg) => (
                      <SelectItem key={seg.value} value={seg.value}>
                        {seg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="status">Status</FieldLabel>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as Client['status'] })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="notes">Notatki</FieldLabel>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
              />
            </Field>
          </FieldGroup>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          <div className="mt-6 flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}
              {client ? 'Zapisz zmiany' : 'Dodaj klienta'}
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
