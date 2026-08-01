// app/(dashboard)/produkty/marze/page.tsx
// Faza 1 DAGOLD — KROK C + identyfikacja/grupowanie (Część 1):
// bulk-edycja marża_bazowa_pct per produkt, grupowane Dostawca → Kategoria,
// z gramaturą/EAN/jednostką w wierszu i linkiem do pełnej edycji.

import Link from 'next/link'
import { SlidersHorizontalIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  MarzeEditor,
  type MarzaRow,
  type SupplierLite,
} from '@/components/produkty/marze-editor'

export const dynamic = 'force-dynamic'

export default async function MarzeProduktowPage() {
  const supabase = await createClient()
  const [{ data: products }, { data: suppliers }] = await Promise.all([
    supabase
      .from('products')
      .select(
        'id, name, display_name, category, gramatura, ean, unit, brand, supplier_id, cost_pln, marza_bazowa_pct',
      )
      .order('name', { ascending: true }),
    supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
  ])

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Marże produktów"
        breadcrumbs={[{ label: 'Ceny' }, { label: 'Marże' }]}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/ceny/segmenty">
              <SlidersHorizontalIcon className="mr-1.5 size-3.5" />
              Segmenty cenowe
            </Link>
          </Button>
        }
      />
      <div className="p-4">
        <MarzeEditor
          products={(products ?? []) as MarzaRow[]}
          suppliers={(suppliers ?? []) as SupplierLite[]}
        />
      </div>
    </div>
  )
}
