'use client'

import { useState, useRef } from 'react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { Client, Product } from '@/lib/types'
import { PlusIcon, TrashIcon, PrinterIcon, DownloadIcon } from 'lucide-react'

interface KPGeneratorContentProps {
  clients: Pick<Client, 'id' | 'title' | 'nip' | 'city' | 'address'>[]
  products: Product[]
}

interface LineItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  total: number
}

export function KPGeneratorContent({ clients, products }: KPGeneratorContentProps) {
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [kpNumber, setKpNumber] = useState('')
  const [kpDate, setKpDate] = useState(new Date().toISOString().split('T')[0])
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState('1')
  const printRef = useRef<HTMLDivElement>(null)

  const client = clients.find((c) => c.id === selectedClient)

  const addLineItem = () => {
    const product = products.find((p) => p.id === selectedProduct)
    if (!product) return

    const qty = parseFloat(quantity) || 1
    const unitPrice = product.price_duzi_gracze ?? product.price_maly_opt ?? 0

    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: unitPrice,
        total: qty * unitPrice,
      },
    ])

    setSelectedProduct('')
    setQuantity('1')
  }

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id))
  }

  const updateLineItem = (id: string, field: 'quantity' | 'unit_price', value: number) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value }
          updated.total = updated.quantity * updated.unit_price
          return updated
        }
        return item
      })
    )
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.total, 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>KP ${kpNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 30px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .client { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f5f5f5; }
            .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
            .text-right { text-align: right; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dane dokumentu</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="kpNumber">Numer KP</FieldLabel>
                  <Input
                    id="kpNumber"
                    value={kpNumber}
                    onChange={(e) => setKpNumber(e.target.value)}
                    placeholder="np. KP/001/2024"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="kpDate">Data</FieldLabel>
                  <Input
                    id="kpDate"
                    type="date"
                    value={kpDate}
                    onChange={(e) => setKpDate(e.target.value)}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="client">Klient</FieldLabel>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger id="client">
                    <SelectValue placeholder="Wybierz klienta" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {client && (
                <div className="rounded-md bg-muted p-4 text-sm">
                  <p className="font-medium">{client.title}</p>
                  {client.nip && <p>NIP: {client.nip}</p>}
                  {(client.address || client.city) && (
                    <p>{[client.address, client.city].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dodaj produkt</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="product">Produkt</FieldLabel>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger id="product">
                    <SelectValue placeholder="Wybierz produkt" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} - {formatCurrency(p.price_duzi_gracze ?? p.price_maly_opt ?? 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="quantity">Ilosc</FieldLabel>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                onClick={addLineItem}
                disabled={!selectedProduct}
                className="w-full"
              >
                <PlusIcon className="mr-2 size-4" />
                Dodaj do listy
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pozycje dokumentu</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint} disabled={lineItems.length === 0}>
              <PrinterIcon className="mr-2 size-4" />
              Drukuj
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Dodaj produkty do dokumentu
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">Lp.</TableHead>
                    <TableHead>Nazwa produktu</TableHead>
                    <TableHead className="w-[100px]">Ilosc</TableHead>
                    <TableHead className="w-[150px]">Cena jedn.</TableHead>
                    <TableHead className="w-[150px] text-right">Wartosc</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)
                          }
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) =>
                            updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)
                          }
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.total)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLineItem(item.id)}
                          className="size-8"
                        >
                          <TrashIcon className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex justify-end">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Suma</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Hidden print content */}
      <div ref={printRef} className="hidden">
        <h1>Kalkulacja Produktowa {kpNumber}</h1>
        <div className="header">
          <div>Data: {new Date(kpDate).toLocaleDateString('pl-PL')}</div>
        </div>
        {client && (
          <div className="client">
            <strong>Klient:</strong><br />
            {client.title}<br />
            {client.nip && <>NIP: {client.nip}<br /></>}
            {[client.address, client.city].filter(Boolean).join(', ')}
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>Lp.</th>
              <th>Nazwa produktu</th>
              <th>Ilosc</th>
              <th>Cena jedn.</th>
              <th className="text-right">Wartosc</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{item.product_name}</td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.unit_price)}</td>
                <td className="text-right">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="total">
          Suma: {formatCurrency(totalAmount)}
        </div>
      </div>
    </div>
  )
}
