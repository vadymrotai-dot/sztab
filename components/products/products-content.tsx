'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import type { Product, Params } from '@/lib/types'
import { SearchIcon, MoreHorizontalIcon, PencilIcon, TrashIcon } from 'lucide-react'

interface ProductsContentProps {
  products: Product[]
  params: Params | null
}

export function ProductsContent({ products: initialProducts, params }: ProductsContentProps) {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    product.category?.toLowerCase().includes(search.toLowerCase()) ||
    product.ean?.includes(search)
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac ten produkt?')) return

    const { error } = await supabase.from('products').delete().eq('id', id)
    if (!error) {
      setProducts(products.filter((p) => p.id !== id))
      router.refresh()
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 2,
    }).format(value)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj produktu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {params && (
          <p className="text-sm text-muted-foreground">
            Kurs EUR/PLN: {params.kurs_eur_pln} | Narzut: {params.overhead}
          </p>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Lp</TableHead>
              <TableHead>Nazwa</TableHead>
              <TableHead>Kategoria</TableHead>
              <TableHead>EAN</TableHead>
              <TableHead className="text-right">Koszt EUR</TableHead>
              <TableHead className="text-right">Koszt PLN</TableHead>
              <TableHead className="text-right">Cena Maly</TableHead>
              <TableHead className="text-right">Cena Sredni</TableHead>
              <TableHead className="text-right">Cena Duzy</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Brak produktow do wyswietlenia
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">{product.lp || '-'}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/products/${product.id}/edit`} className="hover:underline">
                      {product.name}
                    </Link>
                  </TableCell>
                  <TableCell>{product.category || '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{product.ean || '-'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.cost_eur ?? 0)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.cost_pln ?? 0)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.price_maly_opt ?? 0)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.price_sredni)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.price_duzy)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/products/${product.id}/edit`}>
                            <PencilIcon className="mr-2 size-4" />
                            Edytuj
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(product.id)}
                        >
                          <TrashIcon className="mr-2 size-4" />
                          Usun
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
