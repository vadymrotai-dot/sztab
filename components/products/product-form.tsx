'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { Product, Params } from '@/lib/types'

interface ProductFormProps {
  product?: Product
  params: Params | null
}

export function ProductForm({ product, params }: ProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const kursEur = params?.kurs_eur_pln || 4.28
  const overhead = params?.overhead || 1.15

  const [formData, setFormData] = useState({
    lp: product?.lp?.toString() ?? '',
    category: product?.category ?? '',
    name: product?.name ?? '',
    gramatura: product?.gramatura ?? '',
    ean: product?.ean ?? '',
    cost_eur: product?.cost_eur?.toString() ?? '0',
    cost_pln: product?.cost_pln?.toString() ?? '0',
    price_maly_opt: product?.price_maly_opt?.toString() ?? '0',
    price_sredni: product?.price_sredni?.toString() ?? '0',
    price_duzy: product?.price_duzy?.toString() ?? '0',
    price_duzi_gracze: product?.price_duzi_gracze?.toString() ?? '0',
    price_min: product?.price_min?.toString() ?? '0',
  })

  // Recalculate cost_pln when cost_eur changes
  useEffect(() => {
    const eur = parseFloat(formData.cost_eur) || 0
    const pln = eur * kursEur * overhead
    setFormData((prev) => ({ ...prev, cost_pln: pln.toFixed(2) }))
  }, [formData.cost_eur, kursEur, overhead])

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
      lp: formData.lp ? parseInt(formData.lp) : null,
      category: formData.category || null,
      name: formData.name,
      gramatura: formData.gramatura || null,
      ean: formData.ean || null,
      cost_eur: parseFloat(formData.cost_eur) || 0,
      cost_pln: parseFloat(formData.cost_pln) || 0,
      price_maly_opt: parseFloat(formData.price_maly_opt) || 0,
      price_sredni: parseFloat(formData.price_sredni) || 0,
      price_duzy: parseFloat(formData.price_duzy) || 0,
      price_duzi_gracze: parseFloat(formData.price_duzi_gracze) || 0,
      price_min: parseFloat(formData.price_min) || 0,
    }

    if (product) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', product.id)

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/products')
        router.refresh()
      }
    } else {
      const { error } = await supabase
        .from('products')
        .insert({ ...payload, owner_id: user.id })

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/products')
        router.refresh()
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{product ? 'Edytuj produkt' : 'Nowy produkt'}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="lp">Lp.</FieldLabel>
                <Input
                  id="lp"
                  type="number"
                  value={formData.lp}
                  onChange={(e) => setFormData({ ...formData, lp: e.target.value })}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="name">Nazwa produktu *</FieldLabel>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="category">Kategoria</FieldLabel>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="gramatura">Gramatura</FieldLabel>
                <Input
                  id="gramatura"
                  placeholder="np. 3000 g / 900 g / 5000g~3000g"
                  value={formData.gramatura}
                  onChange={(e) => setFormData({ ...formData, gramatura: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ean">EAN</FieldLabel>
                <Input
                  id="ean"
                  value={formData.ean}
                  onChange={(e) => setFormData({ ...formData, ean: e.target.value })}
                />
              </Field>
            </div>

            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-4">Koszty</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="cost_eur">Koszt EUR</FieldLabel>
                  <Input
                    id="cost_eur"
                    type="number"
                    step="0.01"
                    value={formData.cost_eur}
                    onChange={(e) => setFormData({ ...formData, cost_eur: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cost_pln">Koszt PLN (obliczony)</FieldLabel>
                  <Input
                    id="cost_pln"
                    type="number"
                    step="0.01"
                    value={formData.cost_pln}
                    readOnly
                    className="bg-muted"
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-4">Ceny sprzedazy</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="price_maly_opt">Cena Mały opt</FieldLabel>
                  <Input
                    id="price_maly_opt"
                    type="number"
                    step="0.01"
                    value={formData.price_maly_opt}
                    onChange={(e) => setFormData({ ...formData, price_maly_opt: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="price_sredni">Cena Sredni</FieldLabel>
                  <Input
                    id="price_sredni"
                    type="number"
                    step="0.01"
                    value={formData.price_sredni}
                    onChange={(e) => setFormData({ ...formData, price_sredni: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="price_duzy">Cena Duzy</FieldLabel>
                  <Input
                    id="price_duzy"
                    type="number"
                    step="0.01"
                    value={formData.price_duzy}
                    onChange={(e) => setFormData({ ...formData, price_duzy: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <Field>
                  <FieldLabel htmlFor="price_duzi_gracze">Cena Duzi gracze (katalog)</FieldLabel>
                  <Input
                    id="price_duzi_gracze"
                    type="number"
                    step="0.01"
                    value={formData.price_duzi_gracze}
                    onChange={(e) => setFormData({ ...formData, price_duzi_gracze: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="price_min">Cena minimalna (Docel)</FieldLabel>
                  <Input
                    id="price_min"
                    type="number"
                    step="0.01"
                    value={formData.price_min}
                    onChange={(e) => setFormData({ ...formData, price_min: e.target.value })}
                  />
                </Field>
              </div>
            </div>

          </FieldGroup>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          <div className="mt-6 flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}
              {product ? 'Zapisz zmiany' : 'Dodaj produkt'}
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
