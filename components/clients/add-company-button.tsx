'use client'

// Sprint O Phase 5E — placeholder CTA. Phase 6 wires real AddCompanyModal.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import { AddCompanyModal } from './add-company-modal'

export function AddCompanyButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <PlusIcon className="mr-2 size-4" />
        Dodaj firmę
      </Button>
      <AddCompanyModal open={open} onOpenChange={setOpen} />
    </>
  )
}
