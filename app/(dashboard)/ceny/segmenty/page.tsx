// app/(dashboard)/ceny/segmenty/page.tsx
// Faza 1 DAGOLD — sekcja "Ceny": definicje segmentów A/B/C.
// Przeniesione z /ustawienia/segmenty-cenowe (stary adres → redirect).

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import {
  PriceSegmentsEditor,
  type PriceSegment,
} from '@/components/ustawienia/price-segments-editor'

export const dynamic = 'force-dynamic'

export default async function SegmentyCenowePage() {
  const supabase = await createClient()
  const { data: segments } = await supabase
    .from('price_segments')
    .select('code, name, znizka_pct, sort_order')
    .order('sort_order', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Segmenty cenowe"
        breadcrumbs={[{ label: 'Ceny' }, { label: 'Segmenty' }]}
      />
      <div className="max-w-2xl p-4">
        <PriceSegmentsEditor segments={(segments ?? []) as PriceSegment[]} />
      </div>
    </div>
  )
}
