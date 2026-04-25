'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DealModal,
  type DealModalClient,
  type DealModalPerson,
  type DealModalProduct,
  type DealModalSupplier,
} from '@/components/deals/deal-modal'
import type { Deal } from '@/lib/types'

interface EditDealClientProps {
  deal: Deal
  clients: DealModalClient[]
  products: DealModalProduct[]
  people: DealModalPerson[]
  suppliers: DealModalSupplier[]
}

export function EditDealClient({
  deal,
  clients,
  products,
  people,
  suppliers,
}: EditDealClientProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <DealModal
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) router.push(`/deals/${deal.id}`)
      }}
      deal={deal}
      clients={clients}
      products={products}
      people={people}
      suppliers={suppliers}
      onSaved={(id) => router.push(`/deals/${id}`)}
    />
  )
}
