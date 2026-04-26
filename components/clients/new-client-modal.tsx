'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlusIcon, RefreshCwIcon } from 'lucide-react'

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
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'

import { createClientRecord } from '@/app/actions/clients'

export function NewClientModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [lookingUp, setLookingUp] = useState(false)

  const [title, setTitle] = useState('')
  const [nip, setNip] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [region, setRegion] = useState('')
  const [isStrategic, setIsStrategic] = useState(false)
  const [marginKatalog, setMarginKatalog] = useState('32')
  const [marginDocel, setMarginDocel] = useState('23')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const reset = () => {
    setTitle('')
    setNip('')
    setCity('')
    setAddress('')
    setRegion('')
    setIsStrategic(false)
    setMarginKatalog('32')
    setMarginDocel('23')
    setErrors({})
  }

  // Existing /api/nip-lookup integrates with Polish MF/REGON registry.
  const handleNipLookup = async () => {
    const cleanNip = nip.replace(/\D/g, '')
    if (cleanNip.length !== 10) {
      toast.error('NIP musi mieć 10 cyfr')
      return
    }
    setLookingUp(true)
    try {
      const res = await fetch('/api/nip-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: cleanNip }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Nie udało się pobrać danych z rejestru')
        return
      }
      const data = await res.json()
      const r = data.result ?? data
      if (r.title || r.name) setTitle(r.title ?? r.name ?? title)
      if (r.city) setCity(r.city)
      if (r.address) setAddress(r.address)
      if (r.region) setRegion(r.region)
      toast.success('Dane z rejestru wczytane')
    } catch (err) {
      toast.error(`Błąd lookup: ${(err as Error).message}`)
    } finally {
      setLookingUp(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (title.trim().length < 2) errs.title = 'Nazwa wymagana (min 2 znaki)'
    const cleanNip = nip.replace(/\D/g, '')
    if (cleanNip && cleanNip.length !== 10)
      errs.nip = 'NIP musi mieć 10 cyfr (lub zostaw puste)'

    let mk: number | null = null
    let md: number | null = null
    if (isStrategic) {
      mk = Number.parseFloat(marginKatalog) / 100
      md = Number.parseFloat(marginDocel) / 100
      if (!Number.isFinite(mk) || mk < 0 || mk > 1)
        errs.marginKatalog = 'Marża 0-100%'
      if (!Number.isFinite(md) || md < 0 || md > 1)
        errs.marginDocel = 'Marża 0-100%'
      if (Number.isFinite(mk) && Number.isFinite(md) && md > mk)
        errs.marginDocel = 'Marża docel musi być ≤ marża katalog'
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})

    startTransition(async () => {
      const result = await createClientRecord({
        title: title.trim(),
        nip: cleanNip || null,
        city: city.trim() || null,
        address: address.trim() || null,
        region: region.trim() || null,
        client_type: isStrategic ? 'strategic_partner' : 'standard',
        contracted_margin_katalog_pct: isStrategic ? mk : null,
        contracted_margin_docel_pct: isStrategic ? md : null,
      })
      if (!result.ok) {
        toast.error(`Nie udało się dodać: ${result.error}`)
        return
      }
      toast.success('Klient dodany')
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
          Dodaj klienta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowy klient</DialogTitle>
          <DialogDescription>
            Wpisz NIP i kliknij „Pobierz z rejestru" — title/adres uzupełnią
            się z REGON. Resztę uzupełnisz na stronie edycji.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nip">NIP</Label>
            <div className="flex gap-2">
              <Input
                id="nip"
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                placeholder="1234567890"
                maxLength={13}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleNipLookup}
                disabled={lookingUp || !nip.trim()}
              >
                {lookingUp ? (
                  <Spinner className="mr-2 size-3" />
                ) : (
                  <RefreshCwIcon className="mr-2 size-3" />
                )}
                Pobierz
              </Button>
            </div>
            {errors.nip && (
              <p className="text-xs text-destructive">{errors.nip}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Nazwa *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">Miasto</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="np. Mazowieckie"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adres</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_strategic">Strategic partner</Label>
                <p className="text-xs text-muted-foreground">
                  „Duzi gracze" — kontraktowane marże katalog/docel.
                </p>
              </div>
              <Switch
                id="is_strategic"
                checked={isStrategic}
                onCheckedChange={setIsStrategic}
              />
            </div>
            {isStrategic && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="margin_katalog" className="text-xs">
                    Marża katalog (%)
                  </Label>
                  <Input
                    id="margin_katalog"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={marginKatalog}
                    onChange={(e) => setMarginKatalog(e.target.value)}
                  />
                  {errors.marginKatalog && (
                    <p className="text-xs text-destructive">
                      {errors.marginKatalog}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="margin_docel" className="text-xs">
                    Marża docel (%)
                  </Label>
                  <Input
                    id="margin_docel"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={marginDocel}
                    onChange={(e) => setMarginDocel(e.target.value)}
                  />
                  {errors.marginDocel && (
                    <p className="text-xs text-destructive">
                      {errors.marginDocel}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

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
              Dodaj klienta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
