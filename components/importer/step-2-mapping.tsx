'use client'

import { useMemo } from 'react'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  indexToLetter,
  type SheetMatrix,
} from '@/lib/importers/excel-parser'
import type { CanonicalField, ColumnMapping } from '@/lib/importers/types'

const SENTINEL_NONE = '__none__'

interface StepMappingProps {
  matrix: SheetMatrix
  canonicalSchema: CanonicalField[]
  mapping: ColumnMapping
  onMappingChange: (next: ColumnMapping) => void
  headerRow: number
  onHeaderRowChange: (n: number) => void
  dataStartRow: number
  onDataStartRowChange: (n: number) => void
  hasCategoryHeaders: boolean
  onHasCategoryHeadersChange: (v: boolean) => void
  saveAsPreset: boolean
  onSaveAsPresetChange: (v: boolean) => void
}

interface ColumnInfo {
  letter: string
  header: string
  samples: string[]
}

function buildColumnInfo(
  matrix: SheetMatrix,
  headerRow: number,
): ColumnInfo[] {
  const headerArray = matrix[headerRow - 1] ?? []
  const numCols = Math.max(
    headerArray.length,
    ...matrix
      .slice(headerRow - 1, headerRow + 5)
      .map((r) => (r?.length ?? 0)),
  )
  const out: ColumnInfo[] = []
  for (let i = 0; i < numCols; i++) {
    const headerVal = headerArray[i]
    const headerStr =
      typeof headerVal === 'string'
        ? headerVal.trim()
        : headerVal != null
          ? String(headerVal)
          : ''
    const samples: string[] = []
    for (let r = headerRow; r < headerRow + 4 && r < matrix.length; r++) {
      const cell = matrix[r]?.[i]
      if (cell != null && cell !== '') samples.push(String(cell).slice(0, 40))
    }
    out.push({ letter: indexToLetter(i), header: headerStr, samples })
  }
  return out
}

export function StepMapping({
  matrix,
  canonicalSchema,
  mapping,
  onMappingChange,
  headerRow,
  onHeaderRowChange,
  dataStartRow,
  onDataStartRowChange,
  hasCategoryHeaders,
  onHasCategoryHeadersChange,
  saveAsPreset,
  onSaveAsPresetChange,
}: StepMappingProps) {
  const columns = useMemo(
    () => buildColumnInfo(matrix, headerRow),
    [matrix, headerRow],
  )

  const handleSet = (field: string, letter: string | null) => {
    const next = { ...mapping }
    if (letter == null) delete next[field]
    else next[field] = letter
    onMappingChange(next)
  }

  const requiredMissing = canonicalSchema
    .filter((f) => f.required && !mapping[f.field])
    .map((f) => f.label)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="header_row">Wiersz nagłówków</Label>
          <Input
            id="header_row"
            type="number"
            min="1"
            value={headerRow}
            onChange={(e) =>
              onHeaderRowChange(
                Math.max(1, Number.parseInt(e.target.value, 10) || 1),
              )
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="data_start_row">Pierwszy wiersz danych</Label>
          <Input
            id="data_start_row"
            type="number"
            min="1"
            value={dataStartRow}
            onChange={(e) =>
              onDataStartRowChange(
                Math.max(1, Number.parseInt(e.target.value, 10) || 1),
              )
            }
          />
        </div>
        <div className="flex items-end">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3 w-full">
            <div className="space-y-0.5">
              <Label htmlFor="has_categories" className="text-xs">
                ▼ Nagłówki kategorii
              </Label>
              <p className="text-[10px] text-muted-foreground">
                np. „▼ KISZONKI"
              </p>
            </div>
            <Switch
              id="has_categories"
              checked={hasCategoryHeaders}
              onCheckedChange={onHasCategoryHeadersChange}
            />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-xs text-muted-foreground">
            Przypisz kolumny z arkusza do pól produktu. Wymagane oznaczone
            gwiazdką.
          </p>
          <div className="grid gap-2">
            {canonicalSchema.map((field) => (
              <div
                key={field.field}
                className="grid grid-cols-[200px_1fr] items-center gap-3"
              >
                <Label className="text-sm">
                  {field.label}
                  {field.required && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                  {field.hint && (
                    <p className="text-[10px] font-normal text-muted-foreground">
                      {field.hint}
                    </p>
                  )}
                </Label>
                <Select
                  value={mapping[field.field] ?? SENTINEL_NONE}
                  onValueChange={(v) =>
                    handleSet(field.field, v === SENTINEL_NONE ? null : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— wybierz kolumnę —" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    <SelectItem value={SENTINEL_NONE}>— Brak —</SelectItem>
                    {columns.map((col) => (
                      <SelectItem key={col.letter} value={col.letter}>
                        <span className="font-mono mr-2">{col.letter}</span>
                        <span className="font-medium">
                          {col.header || '(pusty nagłówek)'}
                        </span>
                        {col.samples.length > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            np. {col.samples[0]}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {requiredMissing.length > 0 && (
        <p className="text-xs text-destructive">
          Brakuje przypisania dla wymaganych pól:{' '}
          {requiredMissing.join(', ')}
        </p>
      )}

      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="save_preset">
            Zapisz to mapowanie dla tego dostawcy
          </Label>
          <p className="text-xs text-muted-foreground">
            Następny import z tym samym dostawcą pominie ten krok.
          </p>
        </div>
        <Switch
          id="save_preset"
          checked={saveAsPreset}
          onCheckedChange={onSaveAsPresetChange}
        />
      </div>
    </div>
  )
}
