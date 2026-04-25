'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DealModal,
  type DealModalClient,
  type DealModalDefaults,
  type DealModalPerson,
  type DealModalProduct,
  type DealModalSupplier,
} from '@/components/deals/deal-modal'
import type { DealStage } from '@/lib/types'
import { DEAL_STAGES } from '@/lib/types'

interface NewDealClientProps {
  defaults?: DealModalDefaults
  clients: DealModalClient[]
  products: DealModalProduct[]
  people: DealModalPerson[]
  suppliers: DealModalSupplier[]
}

function NewDealClientInner({
  defaults,
  clients,
  products,
  people,
  suppliers,
}: NewDealClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(true)

  // Belt-and-suspenders: also read URL params on the client. If the
  // server-side defaults somehow arrived empty (RSC edge case, cached
  // shell, etc.), this still picks up the values the kanban link put
  // in the URL — `/deals/new?stage=oferta&client=<uuid>`.
  const mergedDefaults = useMemo<DealModalDefaults>(() => {
    const stageRaw = searchParams.get('stage')
    const validStage = DEAL_STAGES.some((s) => s.value === stageRaw)
      ? (stageRaw as DealStage)
      : undefined
    return {
      client_id: defaults?.client_id ?? searchParams.get('client') ?? undefined,
      product_id:
        defaults?.product_id ?? searchParams.get('product') ?? undefined,
      stage: defaults?.stage ?? validStage,
    }
  }, [defaults, searchParams])

  return (
    <DealModal
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) router.push('/deals')
      }}
      defaults={mergedDefaults}
      clients={clients}
      products={products}
      people={people}
      suppliers={suppliers}
      onSaved={(id) => router.push(`/deals/${id}`)}
    />
  )
}

export function NewDealClient(props: NewDealClientProps) {
  // useSearchParams must be inside a Suspense boundary so the route
  // can fall back to streaming if the params hook needs to wait for
  // anything — Next.js will otherwise force the whole subtree dynamic
  // and warn at build time.
  return (
    <Suspense fallback={null}>
      <NewDealClientInner {...props} />
    </Suspense>
  )
}
