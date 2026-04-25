'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DealModal,
  type DealModalClient,
  type DealModalPerson,
  type DealModalProduct,
  type DealModalSupplier,
} from '@/components/deals/deal-modal'

interface NewDealButtonProps {
  clientId: string
  clients: DealModalClient[]
  products: DealModalProduct[]
  people: DealModalPerson[]
  suppliers: DealModalSupplier[]
}

export function NewDealButton({
  clientId,
  clients,
  products,
  people,
  suppliers,
}: NewDealButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <PlusIcon className="mr-2 size-4" />
        Nowa szansa sprzedaży
      </Button>
      {open && (
        <DealModal
          open={open}
          onOpenChange={setOpen}
          defaults={{ client_id: clientId }}
          clients={clients}
          products={products}
          people={people}
          suppliers={suppliers}
          onSaved={(id) => {
            router.refresh()
            router.push(`/deals/${id}`)
          }}
        />
      )}
    </>
  )
}
