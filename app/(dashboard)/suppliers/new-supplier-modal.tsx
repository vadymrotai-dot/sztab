'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { z } from 'zod'
import { PlusIcon } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Spinner } from '@/components/ui/spinner'

import { createSupplier } from '@/app/actions/suppliers'
import type { SupplierDealType, SupplierType } from '@/lib/types'

const formSchema = z.object({
  name: z.string().min(2, 'Nazwa wymagana (min 2 znaki)'),
  legal_name: z.string().optional(),
  type: z.enum(['producent', 'trader', 'posrednik', 'wlasna_marka']),
  deal_type: z.enum(['reseller', 'agent', 'partner']),
  commission_pct: z
    .number()
    .min(0)
    .max(100, 'Prowizja musi być w zakresie 0-100')
    .nullable()
    .optional(),
})

export function NewSupplierModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [type, setType] = useState<SupplierType | ''>('')
  const [dealType, setDealType] = useState<SupplierDealType | ''>('')
  const [commissionPct, setCommissionPct] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const reset = () => {
    setName('')
    setLegalName('')
    setType('')
    setDealType('')
    setCommissionPct('')
    setErrors({})
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const commissionParsed =
      dealType === 'agent' && commissionPct
        ? Number.parseFloat(commissionPct)
        : null

    const parsed = formSchema.safeParse({
      name,
      legal_name: legalName || undefined,
      type: type || undefined,
      deal_type: dealType || undefined,
      commission_pct: commissionParsed,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0])
        if (k && !fieldErrors[k]) fieldErrors[k] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (parsed.data.deal_type === 'agent') {
      if (
        parsed.data.commission_pct == null ||
        Number.isNaN(parsed.data.commission_pct)
      ) {
        setErrors({ commission_pct: 'Wymagane dla agenta (0-100%)' })
        return
      }
    }

    setErrors({})
    startTransition(async () => {
      const result = await createSupplier({
        name: parsed.data.name,
        legal_name: parsed.data.legal_name ?? null,
        type: parsed.data.type,
        deal_type: parsed.data.deal_type,
        commission_pct: parsed.data.commission_pct ?? null,
      })
      if (!result.ok) {
        toast.error(`Nie udało się dodać: ${result.error}`)
        return
      }
      toast.success('Dostawca dodany')
      reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 size-4" />
          Dodaj dostawcę
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowy dostawca</DialogTitle>
          <DialogDescription>
            Wprowadź podstawowe dane. Resztę uzupełnisz na stronie edycji.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nazwa *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Czudowa Marka"
              required
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="legal_name">Pełna nazwa prawna</Label>
            <Input
              id="legal_name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="opcjonalnie"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Rodzaj *</Label>
              <Select
                value={type || undefined}
                onValueChange={(v) => setType(v as SupplierType)}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Wybierz" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producent">Producent</SelectItem>
                  <SelectItem value="trader">Trader</SelectItem>
                  <SelectItem value="posrednik">Pośrednik</SelectItem>
                  <SelectItem value="wlasna_marka">Własna marka</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-xs text-destructive">{errors.type}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="deal_type">Typ współpracy *</Label>
              <Select
                value={dealType || undefined}
                onValueChange={(v) => setDealType(v as SupplierDealType)}
              >
                <SelectTrigger id="deal_type">
                  <SelectValue placeholder="Wybierz" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reseller">Reseller</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
              {errors.deal_type && (
                <p className="text-xs text-destructive">{errors.deal_type}</p>
              )}
            </div>
          </div>
          {dealType === 'agent' && (
            <div className="space-y-2">
              <Label htmlFor="commission_pct">Prowizja (%) *</Label>
              <Input
                id="commission_pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="np. 5.00"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
              />
              {errors.commission_pct && (
                <p className="text-xs text-destructive">
                  {errors.commission_pct}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                reset()
              }}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner className="mr-2" />}
              Dodaj dostawcę
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
