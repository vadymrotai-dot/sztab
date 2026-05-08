'use client'

// app/intelligence/cohorts/new/page.tsx
// Phase 2 Krok 1.C1 — create cohort form.
// 'use client' для inline validation + toast UX.
// On submit → createCohort() → redirect /intelligence/cohorts/[id].

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { createCohort } from '@/lib/actions/cohorts'

const NAME_MAX = 100
const DESC_MAX = 500

export default function NewCohortPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<{ name?: string; description?: string }>(
    {},
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const newErrors: typeof errors = {}
    if (!trimmedName) newErrors.name = 'Nazwa wymagana'
    else if (trimmedName.length > NAME_MAX)
      newErrors.name = `Max ${NAME_MAX} znaków`
    if (description.length > DESC_MAX)
      newErrors.description = `Max ${DESC_MAX} znaków`
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    startTransition(async () => {
      try {
        const res = await createCohort(trimmedName, description.trim() || undefined)
        toast.success(`Cohort "${res.name}" utworzony`)
        router.push(`/intelligence/cohorts/${res.id}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error(`Błąd: ${msg}`)
      }
    })
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nowa cohort"
        breadcrumbs={[
          { label: 'AI Discovery', href: '/intelligence' },
          { label: 'Cohorts', href: '/intelligence/cohorts' },
          { label: 'Nowa' },
        ]}
      />

      <div className="px-6 pb-6 pt-4">
        <form
          onSubmit={handleSubmit}
          className="max-w-xl space-y-4 rounded-md border p-6"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cohort-name">
              Nazwa <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cohort-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. CzM-12-05 — Czudowа Marka 12.05.2026"
              maxLength={NAME_MAX}
              disabled={pending}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {name.length} / {NAME_MAX}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cohort-description">Opis (opcjonalnie)</Label>
            <Textarea
              id="cohort-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kontekst, cel, kto kogo dzwoni…"
              rows={3}
              maxLength={DESC_MAX}
              disabled={pending}
              aria-invalid={!!errors.description}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {description.length} / {DESC_MAX}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? 'Tworzenie…' : 'Stwórz cohort'}
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              disabled={pending}
            >
              <Link href="/intelligence/cohorts">Anuluj</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
