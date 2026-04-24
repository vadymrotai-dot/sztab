import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductsContent } from '@/components/products/products-content'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import Link from 'next/link'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('lp', { ascending: true })

  const { data: params } = await supabase
    .from('params')
    .select('*')
    .single()

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Produkty"
        actions={
          <Button asChild>
            <Link href="/products/new">
              <PlusIcon className="mr-2 size-4" />
              Nowy produkt
            </Link>
          </Button>
        }
      />
      <ProductsContent products={products || []} params={params} />
    </div>
  )
}
