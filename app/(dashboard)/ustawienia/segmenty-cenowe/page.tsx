// app/(dashboard)/ustawienia/segmenty-cenowe/page.tsx
// Faza 1 DAGOLD (089) — KROK D: zarządzanie segmentami cenowymi A/B/C.
// Uwaga: reszta ustawień żyje pod /settings; ten route wg nazwy z brief-u.

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
      <PageHeader title="Segmenty cenowe" />
      <div className="max-w-2xl p-4">
        <PriceSegmentsEditor segments={(segments ?? []) as PriceSegment[]} />
      </div>
    </div>
  )
}
