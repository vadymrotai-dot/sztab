// app/(dashboard)/produkty/marze/page.tsx
// Faza 1 DAGOLD (089) — KROK C: bulk-edycja marża_bazowa_pct per produkt
// + żywy podgląd ceny segmentu A (cost_pln / (1 − marża)).

import Link from 'next/link'
import { SlidersHorizontalIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { MarzeEditor, type MarzaRow } from '@/components/produkty/marze-editor'

export const dynamic = 'force-dynamic'

export default async function MarzeProduktowPage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, name, category, cost_pln, marza_bazowa_pct')
    .order('name', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Marże produktów"
        breadcrumbs={[{ label: 'Produkty', href: '/produkty' }, { label: 'Marże' }]}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/ustawienia/segmenty-cenowe">
              <SlidersHorizontalIcon className="mr-1.5 size-3.5" />
              Segmenty cenowe
            </Link>
          </Button>
        }
      />
      <div className="p-4">
        <MarzeEditor products={(products ?? []) as MarzaRow[]} />
      </div>
    </div>
  )
}
