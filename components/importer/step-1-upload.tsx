'use client'

import { useRef, useState } from 'react'
import { UploadIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ParsedWorkbook } from '@/lib/importers/excel-parser'
import { createSupplier } from '@/app/actions/suppliers'

interface SupplierOption {
  id: string
  name: string
}

interface StepUploadProps {
  suppliers: SupplierOption[]
  supplierId: string
  onSupplierChange: (id: string) => void
  currency: 'EUR' | 'PLN'
  onCurrencyChange: (c: 'EUR' | 'PLN') => void
  onSupplierCreated: (s: SupplierOption) => void
  file: File | null
  onFile: (file: File) => void
  workbook: ParsedWorkbook | null
  sheetName: string
  onSheetChange: (name: string) => void
  parsing: boolean
}

export function StepUpload({
  suppliers,
  supplierId,
  onSupplierChange,
  currency,
  onCurrencyChange,
  onSupplierCreated,
  file,
  onFile,
  workbook,
  sheetName,
  onSheetChange,
  parsing,
}: StepUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('trader')
  const [newDeal, setNewDeal] = useState('reseller')
  const [creating, setCreating] = useState(false)

  async function handleCreateSupplier() {
    if (newName.trim().length < 2) {
      toast.error('Nazwa dostawcy — min 2 znaki')
      return
    }
    setCreating(true)
    const res = await createSupplier({
      name: newName.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: newType as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deal_type: newDeal as any,
    })
    setCreating(false)
    if (!res.ok) {
      toast.error(`Nie utworzono dostawcy: ${res.error}`)
      return
    }
    toast.success(`Dodano dostawcę: ${newName.trim()}`)
    onSupplierCreated({ id: res.id, name: newName.trim() })
    setNewName('')
    setShowNew(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="supplier-import">Dostawca *</Label>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <PlusIcon className="size-3" />
            Nowy dostawca
          </button>
        </div>
        <Select value={supplierId} onValueChange={onSupplierChange}>
          <SelectTrigger id="supplier-import">
            <SelectValue placeholder="Wybierz dostawcę cennika" />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showNew && (
          <div className="rounded-md border border-dashed p-3 space-y-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nazwa nowego dostawcy (np. Karol, AVIS-D)"
              className="h-9"
            />
            <div className="flex flex-wrap gap-2">
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producent">Producent</SelectItem>
                  <SelectItem value="trader">Trader</SelectItem>
                  <SelectItem value="posrednik">Pośrednik</SelectItem>
                  <SelectItem value="wlasna_marka">Własna marka</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newDeal} onValueChange={setNewDeal}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reseller">Reseller</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleCreateSupplier} disabled={creating}>
                {creating ? 'Tworzenie…' : 'Utwórz'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="currency-import">Waluta kosztu *</Label>
        <Select value={currency} onValueChange={(v) => onCurrencyChange(v as 'EUR' | 'PLN')}>
          <SelectTrigger id="currency-import" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EUR">EUR (→ przelicz na PLN)</SelectItem>
            <SelectItem value="PLN">PLN (koszt wprost)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          EUR → koszt PLN liczony kursem i narzutem z ustawień. PLN → koszt brany
          wprost z pliku (dostawcy PLN, np. Karol/AVIS-D).
        </p>
      </div>

      <div className="space-y-2">
        <Label>Plik XLSX *</Label>
        <div
          className="rounded-md border-2 border-dashed p-8 text-center transition-colors hover:border-primary hover:bg-muted/30"
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) onFile(f)
          }}
        >
          <UploadIcon className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Przeciągnij plik XLSX/CSV tutaj lub kliknij, aby wybrać.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => inputRef.current?.click()}
            disabled={parsing}
          >
            Wybierz plik
          </Button>
          {file && (
            <p className="mt-3 text-xs text-muted-foreground">
              Wybrano: <span className="font-medium">{file.name}</span> (
              {(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>
      </div>

      {workbook && Object.keys(workbook.sheets).length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="sheet-select">Arkusz</Label>
          <Select value={sheetName} onValueChange={onSheetChange}>
            <SelectTrigger id="sheet-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(workbook.sheets).map((name) => (
                <SelectItem key={name} value={name}>
                  {name} ({workbook.sheets[name]?.length ?? 0} wierszy)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
