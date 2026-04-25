'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DealModal,
  type DealModalClient,
  type DealModalDefaults,
  type DealModalPerson,
  type DealModalProduct,
  type DealModalSupplier,
} from '@/components/deals/deal-modal'

interface NewDealClientProps {
  defaults?: DealModalDefaults
  clients: DealModalClient[]
  products: DealModalProduct[]
  people: DealModalPerson[]
  suppliers: DealModalSupplier[]
}

export function NewDealClient({
  defaults,
  clients,
  products,
  people,
  suppliers,
}: NewDealClientProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <DealModal
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) router.push('/deals')
      }}
      defaults={defaults}
      clients={clients}
      products={products}
      people={people}
      suppliers={suppliers}
      onSaved={(id) => router.push(`/deals/${id}`)}
    />
  )
}
