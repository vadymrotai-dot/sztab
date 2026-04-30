// app/(dashboard)/suppliers/page.tsx
// Sprint S4 Phase 5B — list+detail layout (50/50) replacing old table.

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { NewSupplierModal } from './new-supplier-modal'
import { SuppliersShell } from '@/components/suppliers/suppliers-shell'
import type { Supplier, Product } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  const supabase = await createClient()

  const [{ data: suppliers }, { data: products }] = await Promise.all([
    supabase.from('suppliers').select('*').order('name', { ascending: true }),
    supabase.from('products').select('*').order('name', { ascending: true }),
  ])

  const productCounts: Record<string, number> = {}
  const productsBySupplier: Record<string, Product[]> = {}
  for (const p of (products ?? []) as Product[]) {
    if (!p.supplier_id) continue
    productCounts[p.supplier_id] = (productCounts[p.supplier_id] ?? 0) + 1
    if (!productsBySupplier[p.supplier_id]) productsBySupplier[p.supplier_id] = []
    productsBySupplier[p.supplier_id].push(p)
  }

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="Dostawcy" actions={<NewSupplierModal />} />
      <div className="flex-1 min-h-0 bg-[#FAFAF7]">
        <SuppliersShell
          suppliers={(suppliers ?? []) as Supplier[]}
          productCounts={productCounts}
          productsBySupplier={productsBySupplier}
        />
      </div>
    </div>
  )
}
