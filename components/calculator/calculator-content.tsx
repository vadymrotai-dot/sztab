'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { Params } from '@/lib/types'

interface CalculatorContentProps {
  params: Params | null
}

export function CalculatorContent({ params }: CalculatorContentProps) {
  const defaultKurs = params?.kurs_eur_pln || 4.28
  const defaultOverhead = params?.overhead || 1.15

  const [kursEur, setKursEur] = useState(defaultKurs.toString())
  const [overhead, setOverhead] = useState(defaultOverhead.toString())
  const [kosztEur, setKosztEur] = useState('0')
  const [marza, setMarza] = useState('30')

  const kurs = parseFloat(kursEur) || 0
  const over = parseFloat(overhead) || 1
  const koszt = parseFloat(kosztEur) || 0
  const marzaPercent = parseFloat(marza) || 0

  const kosztPln = koszt * kurs * over
  const cenaSprzedazy = kosztPln * (1 + marzaPercent / 100)
  const zysk = cenaSprzedazy - kosztPln

  const formatCurrency = (value: number, currency: string = 'PLN') => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Parametry kalkulacji</CardTitle>
            <CardDescription>Ustaw parametry do obliczen</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="kurs">Kurs EUR/PLN</FieldLabel>
                  <Input
                    id="kurs"
                    type="number"
                    step="0.01"
                    value={kursEur}
                    onChange={(e) => setKursEur(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="overhead">Narzut (mnoznik)</FieldLabel>
                  <Input
                    id="overhead"
                    type="number"
                    step="0.01"
                    value={overhead}
                    onChange={(e) => setOverhead(e.target.value)}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="koszt">Koszt zakupu (EUR)</FieldLabel>
                <Input
                  id="koszt"
                  type="number"
                  step="0.01"
                  value={kosztEur}
                  onChange={(e) => setKosztEur(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="marza">Marza (%)</FieldLabel>
                <Input
                  id="marza"
                  type="number"
                  step="1"
                  value={marza}
                  onChange={(e) => setMarza(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wyniki kalkulacji</CardTitle>
            <CardDescription>Obliczone wartosci</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-muted-foreground">Koszt zakupu</span>
                <span className="font-medium">{formatCurrency(koszt, 'EUR')}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-muted-foreground">Koszt PLN (z narzutem)</span>
                <span className="font-medium">{formatCurrency(kosztPln)}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-muted-foreground">Marza</span>
                <span className="font-medium">{marzaPercent}%</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-muted-foreground">Cena sprzedazy</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(cenaSprzedazy)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Zysk</span>
                <span className={`text-lg font-bold ${zysk >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(zysk)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tabela marzezy</CardTitle>
          <CardDescription>Ceny sprzedazy dla roznych poziomow marzy</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            {[10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80].map((m) => {
              const price = kosztPln * (1 + m / 100)
              const profit = price - kosztPln
              return (
                <div
                  key={m}
                  className="rounded-lg border p-4 text-center hover:bg-muted/50 transition-colors"
                >
                  <p className="text-sm text-muted-foreground mb-1">{m}% marzy</p>
                  <p className="font-bold">{formatCurrency(price)}</p>
                  <p className="text-xs text-green-600 mt-1">+{formatCurrency(profit)}</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
