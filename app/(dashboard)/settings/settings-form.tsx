'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { PageHeader } from '@/components/page-header'

import { updateSettings } from '@/app/actions/settings'

import { TemplateButton } from './template-button'
import { ApiKeysForm, type ApiKeysFormProps } from './api-keys-form'

export interface SettingsRow {
  key: string
  value: string
  description: string | null
}

interface SettingsFormProps {
  settings: SettingsRow[]
  maskedKeys: ApiKeysFormProps
}

const KEY_ORDER_GENERAL = ['kurs_eur_pln', 'overhead_multiplier']
const KEY_ORDER_MARGINS = [
  'margin_maly_opt',
  'margin_sredni_opt',
  'margin_duzy_opt',
  'margin_strategic_katalog',
  'margin_strategic_docel',
]
const KEY_ORDER_THRESHOLDS = ['threshold_sredni_pln', 'threshold_duzy_pln']

const PRETTY_LABEL: Record<string, string> = {
  kurs_eur_pln: 'Kurs EUR / PLN',
  overhead_multiplier: 'Mnożnik narzutów',
  margin_maly_opt: 'Marża — Mały opt',
  margin_sredni_opt: 'Marża — Średni opt',
  margin_duzy_opt: 'Marża — Duży opt',
  margin_strategic_katalog: 'Marża startowa Duzi Gracze (Katalog)',
  margin_strategic_docel: 'Marża minimalna Duzi Gracze (Docel)',
  threshold_sredni_pln: 'Próg Średni opt',
  threshold_duzy_pln: 'Próg Duży opt',
}

const isMargin = (key: string) => KEY_ORDER_MARGINS.includes(key)
const isThreshold = (key: string) => KEY_ORDER_THRESHOLDS.includes(key)

// margin_*=0.50 → display "50.00"; user types "50" → save "0.50"
const toDisplay = (key: string, value: string): string => {
  if (isMargin(key)) {
    const n = Number.parseFloat(value)
    if (!Number.isFinite(n)) return value
    return (n * 100).toFixed(2)
  }
  return value
}

const fromDisplay = (key: string, display: string): string => {
  if (isMargin(key)) {
    const n = Number.parseFloat(display.replace(',', '.'))
    if (!Number.isFinite(n)) return display
    return (n / 100).toFixed(4)
  }
  // others: trim + normalize comma
  return display.trim().replace(',', '.')
}

const suffixFor = (key: string): string => {
  if (isMargin(key)) return '%'
  if (isThreshold(key)) return 'PLN'
  return ''
}

export function SettingsForm({ settings, maskedKeys }: SettingsFormProps) {
  const [pending, startTransition] = useTransition()

  const initialMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of settings) map[s.key] = s.value
    return map
  }, [settings])

  const [values, setValues] = useState<Record<string, string>>(() => {
    const display: Record<string, string> = {}
    for (const [k, v] of Object.entries(initialMap)) {
      display[k] = toDisplay(k, v)
    }
    return display
  })

  const descriptionFor = (key: string) =>
    settings.find((s) => s.key === key)?.description ?? ''

  const renderField = (key: string) => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={key}>
        {PRETTY_LABEL[key] ?? key}
        {descriptionFor(key) && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {descriptionFor(key)}
          </span>
        )}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={key}
          type="number"
          step="0.01"
          value={values[key] ?? ''}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, [key]: e.target.value }))
          }
        />
        {suffixFor(key) && (
          <span className="text-sm text-muted-foreground tabular-nums w-10">
            {suffixFor(key)}
          </span>
        )}
      </div>
    </div>
  )

  // Sprint S4 Phase 6A — dirty state derived from comparison vs initial.
  const isDirty = useMemo(() => {
    for (const key of [
      ...KEY_ORDER_GENERAL,
      ...KEY_ORDER_MARGINS,
      ...KEY_ORDER_THRESHOLDS,
    ]) {
      const display = values[key]
      if (display == null) continue
      const normalized = fromDisplay(key, display)
      if (normalized !== initialMap[key]) return true
    }
    return false
  }, [values, initialMap])

  const handleSave = () => {
    const updates: Record<string, string> = {}
    for (const key of [
      ...KEY_ORDER_GENERAL,
      ...KEY_ORDER_MARGINS,
      ...KEY_ORDER_THRESHOLDS,
    ]) {
      const display = values[key]
      if (display == null) continue
      updates[key] = fromDisplay(key, display)
    }

    const kursChanged =
      updates.kurs_eur_pln !== undefined &&
      updates.kurs_eur_pln !== initialMap.kurs_eur_pln

    startTransition(async () => {
      const result = await updateSettings(updates)
      if (!result.ok) {
        toast.error(`Nie zapisano: ${result.error}`)
        return
      }
      toast.success('Ustawienia zapisane')
      if (kursChanged) {
        toast.warning(
          'Zmiana kursu wpłynie na nowe importy. Istniejące produkty NIE są przeliczane automatycznie — ceny zapisane w bazie zostają jak były.',
          { duration: 8000 },
        )
      }
    })
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Ustawienia"
        actions={
          <Button
            size="sm"
            onClick={handleSave}
            disabled={pending || !isDirty}
            title={isDirty ? 'Zapisz zmiany' : 'Brak zmian do zapisania'}
          >
            {pending && <Spinner className="mr-2" />}
            Zapisz
          </Button>
        }
      />
      <div className="p-6 max-w-2xl space-y-6">
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">Ogólne</TabsTrigger>
            <TabsTrigger value="pricing">Ceny i marże</TabsTrigger>
            <TabsTrigger value="api">Klucze API</TabsTrigger>
            <TabsTrigger value="templates">Szablony</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card className="rounded-lg border-[var(--sztab-border,#E5E1D8)]">
              <CardContent className="space-y-4 pt-6">
                {KEY_ORDER_GENERAL.map(renderField)}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing">
            <Card className="rounded-lg border-[var(--sztab-border,#E5E1D8)]">
              <CardContent className="space-y-6 pt-6">
                <section className="space-y-4">
                  <h3 className="text-[10px] font-medium uppercase tracking-wider text-[var(--sztab-text-muted,#888)]">
                    Marże
                  </h3>
                  {KEY_ORDER_MARGINS.map(renderField)}
                </section>
                <section className="space-y-4">
                  <h3 className="text-[10px] font-medium uppercase tracking-wider text-[var(--sztab-text-muted,#888)]">
                    Progi wartości zamówienia
                  </h3>
                  {KEY_ORDER_THRESHOLDS.map(renderField)}
                </section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api">
            <Card className="rounded-lg border-[var(--sztab-border,#E5E1D8)]">
              <CardContent className="pt-6">
                <ApiKeysForm {...maskedKeys} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates">
            <Card className="rounded-lg border-[var(--sztab-border,#E5E1D8)]">
              <CardContent className="space-y-4 pt-6">
                <p className="text-sm text-[var(--sztab-text-secondary,#555)]">
                  Szablon Excel z gotowymi nagłówkami i przykładowymi pozycjami.
                  Wyślij dostawcy do wypełnienia, potem zaimportuj na stronie
                  /products → „Importuj cennik z Excel".
                </p>
                <TemplateButton />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
