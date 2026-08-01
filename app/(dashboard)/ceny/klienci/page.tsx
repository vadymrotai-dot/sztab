// app/(dashboard)/ceny/klienci/page.tsx
// Faza 1 DAGOLD — sekcja "Ceny": masowe przypisywanie klientów do segmentu.
// NULL price_segment_code = domyślnie segment A / cena standardowa (bez zmian
// w logice ceny — to tylko zapis przypisania).

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import {
  ClientSegmentsEditor,
  type ClientRow,
  type SegmentOption,
} from '@/components/ceny/client-segments-editor'

export const dynamic = 'force-dynamic'

export default async function CenyKlienciPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: segments }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, title, nip, city, price_segment_code, entity_type')
      .order('title', { ascending: true }),
    supabase
      .from('price_segments')
      .select('code, name, sort_order')
      .order('sort_order', { ascending: true }),
  ])

  // Tylko klienci (nie prospekci); entity_type NULL traktujemy jak 'client'
  // (spójnie z /clients ClientsHub).
  const clientRows: ClientRow[] = (clients ?? [])
    .filter((c) => ((c.entity_type as string | null) ?? 'client') === 'client')
    .map((c) => ({
      id: c.id as string,
      title: (c.title as string) ?? '(bez nazwy)',
      nip: (c.nip as string | null) ?? null,
      city: (c.city as string | null) ?? null,
      price_segment_code: (c.price_segment_code as string | null) ?? null,
    }))

  const segmentOptions: SegmentOption[] = (segments ?? []).map((s) => ({
    code: s.code as string,
    name: s.name as string,
  }))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Klienci → segmenty"
        breadcrumbs={[{ label: 'Ceny' }, { label: 'Klienci → segmenty' }]}
      />
      <div className="p-4">
        <ClientSegmentsEditor clients={clientRows} segments={segmentOptions} />
      </div>
    </div>
  )
}
