'use client'

import { useState } from 'react'
import { FileSpreadsheetIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ImporterDialog } from '@/components/importer/importer-dialog'

interface SupplierOption {
  id: string
  name: string
}

export function ImportLauncher({ suppliers }: { suppliers: SupplierOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheetIcon className="mr-2 size-4" />
        Importuj cennik z Excel
      </Button>
      <ImporterDialog open={open} onOpenChange={setOpen} suppliers={suppliers} />
    </>
  )
}
