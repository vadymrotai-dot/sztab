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
    lp: product?.lp?.toString() || '',
    category: product?.category || '',
    name: product?.name || '',
    weight: product?.weight || '',
    ean: product?.ean || '',
    koszt_eur: product?.koszt_eur?.toString() || '0',
    koszt_pln: product?.koszt_pln?.toString() || '0',
    price_maly: product?.price_maly?.toString() || '0',
    price_sredni: product?.price_sredni?.toString() || '0',
    price_duzy: product?.price_duzy?.toString() || '0',
    price_katalog: product?.price_katalog?.toString() || '0',
    price_docel: product?.price_docel?.toString() || '0',
    zysk_maly: product?.zysk_maly?.toString() || '0',
    zysk_duzy: product?.zysk_duzy?.toString() || '0',
  })

  // Recalculate koszt_pln when koszt_eur changes
  useEffect(() => {
    const kosztEur = parseFloat(formData.koszt_eur) || 0
    const kosztPln = kosztEur * kursEur * overhead
    setFormData((prev) => ({ ...prev, koszt_pln: kosztPln.toFixed(2) }))
  }, [formData.koszt_eur, kursEur, overhead])

  // Recalculate profits when prices change
  useEffect(() => {
    const kosztPln = parseFloat(formData.koszt_pln) || 0
    const priceMaly = parseFloat(formData.price_maly) || 0
    const priceDuzy = parseFloat(formData.price_duzy) || 0

    setFormData((prev) => ({
      ...prev,
      zysk_maly: (priceMaly - kosztPln).toFixed(2),
      zysk_duzy: (priceDuzy - kosztPln).toFixed(2),
    }))
  }, [formData.koszt_pln, formData.price_maly, formData.price_duzy])

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
      weight: formData.weight || null,
      ean: formData.ean || null,
      koszt_eur: parseFloat(formData.koszt_eur) || 0,
      koszt_pln: parseFloat(formData.koszt_pln) || 0,
      price_maly: parseFloat(formData.price_maly) || 0,
      price_sredni: parseFloat(formData.price_sredni) || 0,
      price_duzy: parseFloat(formData.price_duzy) || 0,
      price_katalog: parseFloat(formData.price_katalog) || 0,
      price_docel: parseFloat(formData.price_docel) || 0,
      zysk_maly: parseFloat(formData.zysk_maly) || 0,
      zysk_duzy: parseFloat(formData.zysk_duzy) || 0,
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
                <FieldLabel htmlFor="weight">Waga</FieldLabel>
                <Input
                  id="weight"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
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
                  <FieldLabel htmlFor="koszt_eur">Koszt EUR</FieldLabel>
                  <Input
                    id="koszt_eur"
                    type="number"
                    step="0.01"
                    value={formData.koszt_eur}
                    onChange={(e) => setFormData({ ...formData, koszt_eur: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="koszt_pln">Koszt PLN (obliczony)</FieldLabel>
                  <Input
                    id="koszt_pln"
                    type="number"
                    step="0.01"
                    value={formData.koszt_pln}
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
                  <FieldLabel htmlFor="price_maly">Cena Maly</FieldLabel>
                  <Input
                    id="price_maly"
                    type="number"
                    step="0.01"
                    value={formData.price_maly}
                    onChange={(e) => setFormData({ ...formData, price_maly: e.target.value })}
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
                  <FieldLabel htmlFor="price_katalog">Cena Katalogowa</FieldLabel>
                  <Input
                    id="price_katalog"
                    type="number"
                    step="0.01"
                    value={formData.price_katalog}
                    onChange={(e) => setFormData({ ...formData, price_katalog: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="price_docel">Cena Docelowa</FieldLabel>
                  <Input
                    id="price_docel"
                    type="number"
                    step="0.01"
                    value={formData.price_docel}
                    onChange={(e) => setFormData({ ...formData, price_docel: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-4">Zyski (obliczone)</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="zysk_maly">Zysk Maly</FieldLabel>
                  <Input
                    id="zysk_maly"
                    type="number"
                    step="0.01"
                    value={formData.zysk_maly}
                    readOnly
                    className="bg-muted"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="zysk_duzy">Zysk Duzy</FieldLabel>
                  <Input
                    id="zysk_duzy"
                    type="number"
                    step="0.01"
                    value={formData.zysk_duzy}
                    readOnly
                    className="bg-muted"
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
