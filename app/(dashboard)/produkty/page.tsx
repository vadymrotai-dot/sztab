// app/(dashboard)/produkty/page.tsx
// Sprint S4 Phase 5A — list+detail layout dla Polish-language produkty.
// Dropped redirect → /products (kept у /products for legacy katalog tabs).

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import { ProduktyShell } from '@/components/produkty/produkty-shell'
import { ImportLauncher } from '@/components/products/import-launcher'
import type { Product, Supplier } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ProduktyPage() {
  const supabase = await createClient()

  const [{ data: products }, { data: suppliers }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .order('lp', { ascending: true, nullsFirst: false }),
    supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true }),
  ])

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Produkty"
        actions={
          <div className="flex gap-2">
            <Button size="sm" asChild>
              <Link href="/products/new">
                <PlusIcon className="mr-1.5 size-3.5" />
                Dodaj produkt
              </Link>
            </Button>
            <ImportLauncher suppliers={(suppliers ?? []) as Supplier[]} />
          </div>
        }
      />
      <div className="flex-1 min-h-0 bg-[#FAFAF7]">
        <ProduktyShell
          products={(products ?? []) as Product[]}
          suppliers={(suppliers ?? []) as Supplier[]}
        />
      </div>
    </div>
  )
}
