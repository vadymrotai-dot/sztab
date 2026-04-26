'use client'

import { useRef } from 'react'
import { UploadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ParsedWorkbook } from '@/lib/importers/excel-parser'

interface SupplierOption {
  id: string
  name: string
}

interface StepUploadProps {
  suppliers: SupplierOption[]
  supplierId: string
  onSupplierChange: (id: string) => void
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
  file,
  onFile,
  workbook,
  sheetName,
  onSheetChange,
  parsing,
}: StepUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="supplier-import">Dostawca *</Label>
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
            Przeciągnij plik XLSX tutaj lub kliknij, aby wybrać.
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
