'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { parseXlsx, type ParsedWorkbook } from '@/lib/importers/excel-parser'
import { SupplierPriceListImporter } from '@/lib/importers/supplier-price-list'
import type {
  ColumnMapping,
  ImportPreset,
  ImportResult,
  ParsedRow,
} from '@/lib/importers/types'
import type { ImportedProductDraft } from '@/lib/importers/supplier-price-list'

import { getSupplierImportPreset, saveImportPreset } from '@/app/actions/import'

import { StepUpload } from './step-1-upload'
import { StepMapping } from './step-2-mapping'
import { StepPreview } from './step-3-preview'
import { StepConfirm } from './step-4-confirm'

interface SupplierOption {
  id: string
  name: string
}

interface ImporterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: SupplierOption[]
}

type Step = 1 | 2 | 3 | 4

const DEFAULT_PRESET: ImportPreset = {
  columns: {},
  header_row: 18,
  data_start_row: 19,
  has_category_headers: true,
  category_header_pattern: '^\\s*▼\\s*(.+)$',
}

export function ImporterDialog({
  open,
  onOpenChange,
  suppliers,
}: ImporterDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [pending, startTransition] = useTransition()

  const [supplierId, setSupplierId] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>('')
  const [parsing, setParsing] = useState(false)

  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [headerRow, setHeaderRow] = useState<number>(
    DEFAULT_PRESET.header_row,
  )
  const [dataStartRow, setDataStartRow] = useState<number>(
    DEFAULT_PRESET.data_start_row,
  )
  const [hasCategoryHeaders, setHasCategoryHeaders] = useState<boolean>(
    DEFAULT_PRESET.has_category_headers,
  )
  const [saveAsPreset, setSaveAsPreset] = useState<boolean>(true)

  const [rows, setRows] = useState<ParsedRow<ImportedProductDraft>[]>([])
  const [updateExisting, setUpdateExisting] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const importer = useMemo(
    () => (supplierId ? new SupplierPriceListImporter(supplierId) : null),
    [supplierId],
  )

  const reset = () => {
    setStep(1)
    setSupplierId('')
    setFile(null)
    setWorkbook(null)
    setSheetName('')
    setMapping({})
    setHeaderRow(DEFAULT_PRESET.header_row)
    setDataStartRow(DEFAULT_PRESET.data_start_row)
    setHasCategoryHeaders(DEFAULT_PRESET.has_category_headers)
    setSaveAsPreset(true)
    setRows([])
    setUpdateExisting(true)
    setResult(null)
  }

  // When a supplier is selected, try to load a saved preset and remember
  // it for the auto-skip in handleNext.
  const [savedPreset, setSavedPreset] = useState<ImportPreset | null>(null)
  useEffect(() => {
    if (!supplierId) {
      setSavedPreset(null)
      return
    }
    let cancelled = false
    getSupplierImportPreset(supplierId).then((preset) => {
      if (cancelled) return
      setSavedPreset(preset)
      if (preset) {
        setMapping(preset.columns)
        setHeaderRow(preset.header_row)
        setDataStartRow(preset.data_start_row)
        setHasCategoryHeaders(preset.has_category_headers)
      }
    })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  const handleFileChosen = async (f: File) => {
    setFile(f)
    setParsing(true)
    try {
      const wb = await parseXlsx(f)
      setWorkbook(wb)
      setSheetName(wb.defaultSheet)
      toast.success(
        `Plik wczytany — ${Object.keys(wb.sheets).length} arkusz(y), ${
          wb.sheets[wb.defaultSheet]?.length ?? 0
        } wierszy w pierwszym.`,
      )
    } catch (err) {
      toast.error(`Nie udało się odczytać pliku: ${(err as Error).message}`)
    } finally {
      setParsing(false)
    }
  }

  const buildPreset = (): ImportPreset => ({
    columns: mapping,
    header_row: headerRow,
    data_start_row: dataStartRow,
    has_category_headers: hasCategoryHeaders,
    category_header_pattern: DEFAULT_PRESET.category_header_pattern,
    sheet: sheetName || undefined,
  })

  const runParseAndValidate = async (preset: ImportPreset) => {
    if (!importer || !file) return [] as ParsedRow<ImportedProductDraft>[]
    const parsed = await importer.parse(file, preset)
    const validated = await importer.validate(parsed)
    const withDups = await importer.findDuplicates(validated)
    return withDups
  }

  const stats = useMemo(() => {
    let neu = 0
    let dup = 0
    let invalid = 0
    for (const r of rows) {
      if (r.status === 'new') neu++
      else if (r.status === 'duplicate') dup++
      else if (r.status === 'invalid') invalid++
    }
    return { neu, dup, invalid }
  }, [rows])

  const canAdvanceStep1 = !!supplierId && !!workbook
  const requiredFieldsMissing =
    importer?.canonicalSchema
      .filter((f) => f.required && !mapping[f.field])
      .map((f) => f.label) ?? []
  const canAdvanceStep2 = requiredFieldsMissing.length === 0

  const handleNext = async () => {
    if (step === 1) {
      // Auto-skip mapping when the supplier already has a preset.
      if (savedPreset && Object.keys(savedPreset.columns).length > 0) {
        toast.info('Zastosowano zapisane mapowanie dla dostawcy')
        startTransition(async () => {
          const result = await runParseAndValidate(savedPreset)
          setRows(result)
          setStep(3)
        })
      } else {
        setStep(2)
      }
      return
    }
    if (step === 2) {
      if (!canAdvanceStep2) {
        toast.error(
          `Brakuje przypisania wymaganych pól: ${requiredFieldsMissing.join(', ')}`,
        )
        return
      }
      const preset = buildPreset()
      startTransition(async () => {
        const result = await runParseAndValidate(preset)
        setRows(result)
        setStep(3)
      })
      return
    }
    if (step === 3) {
      if (stats.neu === 0 && stats.dup === 0) {
        toast.error('Brak wierszy do zaimportowania.')
        return
      }
      setStep(4)
      return
    }
  }

  const handleBack = () => {
    if (step === 1) return
    if (step === 2) {
      setStep(1)
      return
    }
    if (step === 3) {
      // If we auto-skipped mapping, go back to step 1.
      if (savedPreset) setStep(1)
      else setStep(2)
      return
    }
    if (step === 4) {
      setStep(3)
      setResult(null)
      return
    }
  }

  const handleCommit = () => {
    if (!importer) return
    setCommitting(true)
    startTransition(async () => {
      // Persist the preset before commit so even a failed commit doesn't
      // lose the user's mapping work.
      if (saveAsPreset && supplierId) {
        const preset = buildPreset()
        await saveImportPreset(supplierId, preset)
      }
      const res = await importer.commit(rows, {
        updateExisting,
        supplierId,
      })
      setResult(res)
      setCommitting(false)
      if (res.failed === 0) {
        toast.success(
          `Import OK — ${res.inserted} dodano, ${res.updated} zaktualizowano, ${res.skipped} pominięto.`,
        )
      } else {
        toast.error(
          `Import zakończony z błędami: ${res.failed} wierszy nie powiodło się.`,
        )
      }
      router.refresh()
    })
  }

  const handleClose = () => {
    if (committing) return
    onOpenChange(false)
    setTimeout(reset, 200)
  }

  const totalSteps: Step[] = [1, 2, 3, 4]

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import cennika z Excel</DialogTitle>
          <DialogDescription>
            Krok {step} z 4 —{' '}
            {step === 1 && 'wybór dostawcy i pliku'}
            {step === 2 && 'mapowanie kolumn'}
            {step === 3 && 'podgląd i walidacja'}
            {step === 4 && (result ? 'wynik' : 'potwierdzenie')}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs text-muted-foreground">
          {totalSteps.map((n, i) => (
            <li key={n} className="flex items-center gap-2">
              <span
                className={cn(
                  'size-6 rounded-full border flex items-center justify-center font-medium',
                  step === n &&
                    'border-primary bg-primary text-primary-foreground',
                  step > n && 'border-green-500 bg-green-500 text-white',
                )}
              >
                {n}
              </span>
              {i < totalSteps.length - 1 && (
                <span className="h-px w-8 bg-border" />
              )}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <StepUpload
            suppliers={suppliers}
            supplierId={supplierId}
            onSupplierChange={setSupplierId}
            file={file}
            onFile={handleFileChosen}
            workbook={workbook}
            sheetName={sheetName}
            onSheetChange={setSheetName}
            parsing={parsing}
          />
        )}

        {step === 2 && workbook && (
          <StepMapping
            matrix={workbook.sheets[sheetName] ?? []}
            canonicalSchema={importer?.canonicalSchema ?? []}
            mapping={mapping}
            onMappingChange={setMapping}
            headerRow={headerRow}
            onHeaderRowChange={setHeaderRow}
            dataStartRow={dataStartRow}
            onDataStartRowChange={setDataStartRow}
            hasCategoryHeaders={hasCategoryHeaders}
            onHasCategoryHeadersChange={setHasCategoryHeaders}
            saveAsPreset={saveAsPreset}
            onSaveAsPresetChange={setSaveAsPreset}
          />
        )}

        {step === 3 && (
          <StepPreview
            rows={rows}
            canonicalSchema={importer?.canonicalSchema ?? []}
            updateExisting={updateExisting}
            onUpdateExistingChange={setUpdateExisting}
          />
        )}

        {step === 4 && (
          <StepConfirm
            totalRows={rows.length}
            newCount={stats.neu}
            duplicateCount={stats.dup}
            invalidCount={stats.invalid}
            updateExisting={updateExisting}
            result={result}
          />
        )}

        <DialogFooter>
          {step > 1 && !result && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={pending || committing}
            >
              Wstecz
            </Button>
          )}
          {result ? (
            <Button onClick={handleClose}>Zamknij</Button>
          ) : step === 4 ? (
            <Button onClick={handleCommit} disabled={committing}>
              {committing && <Spinner className="mr-2" />}
              Importuj {stats.neu + (updateExisting ? stats.dup : 0)} pozycji
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={
                pending ||
                (step === 1 && !canAdvanceStep1) ||
                (step === 2 && !canAdvanceStep2)
              }
            >
              {pending && <Spinner className="mr-2" />}
              Dalej
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
