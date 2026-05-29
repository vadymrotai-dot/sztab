'use client'

// components/clients/contact-method-form.tsx
// Sprint TYDZIEN2.T2.4.C1 (28.05.2026) — inline add form для ContactSectionV3.
// Sprint TYDZIEN2.T2.4.C2 (28.05.2026) — extended z mode='edit' support.
// Per-kind input (email type / tel / url) + optional label + submit/cancel.
// Client-side basic validation, server action authoritative.

import { useState, useTransition } from 'react'

import {
  addContactMethod,
  updateContactMethod,
} from '@/app/actions/contact-methods'

export type ContactMethodKind =
  | 'email'
  | 'phone'
  | 'website'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'other'

interface Props {
  clientId: string
  kind: ContactMethodKind
  /** Sprint T2.4.C2 — 'add' = create new method, 'edit' = update existing.
   *  Якщо 'edit' → methodId required, initialValue/initialLabel pre-fill form. */
  mode: 'add' | 'edit'
  /** Required gdy mode='edit'. UUID метода до aktualizacji. */
  methodId?: string
  /** Pre-fill values dla edit mode. */
  initialValue?: string
  initialLabel?: string | null
  onSuccess: () => void
  onCancel: () => void
}

const KIND_PLACEHOLDER: Record<ContactMethodKind, string> = {
  email: 'np. biuro@firma.pl',
  phone: 'np. +48 600 700 800',
  website: 'np. firma.pl',
  facebook: 'np. facebook.com/firma',
  instagram: 'np. instagram.com/firma',
  linkedin: 'np. linkedin.com/company/firma',
  other: 'np. WhatsApp: +48...',
}

const KIND_INPUT_TYPE: Record<ContactMethodKind, string> = {
  email: 'email',
  phone: 'tel',
  website: 'url',
  facebook: 'url',
  instagram: 'url',
  linkedin: 'url',
  other: 'text',
}

const KIND_LABEL: Record<ContactMethodKind, string> = {
  email: 'Email',
  phone: 'Telefon',
  website: 'Strona WWW',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  other: 'Inny kontakt',
}

export function ContactMethodForm({
  clientId,
  kind,
  mode,
  methodId,
  initialValue,
  initialLabel,
  onSuccess,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue ?? '')
  const [label, setLabel] = useState(initialLabel ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const v = value.trim()
    if (!v) {
      setError('Wartość pusta')
      return
    }
    startTransition(async () => {
      const labelTrim = label.trim() || null
      const result =
        mode === 'edit'
          ? await updateContactMethod(methodId!, v, labelTrim)
          : await addContactMethod(clientId, kind, v, labelTrim)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Reset тільки в add mode (edit closes form via onSuccess anyway).
      if (mode === 'add') {
        setValue('')
        setLabel('')
      }
      onSuccess()
    })
  }

  const headerText = mode === 'edit' ? `Edytuj: ${KIND_LABEL[kind]}` : `Dodaj: ${KIND_LABEL[kind]}`
  const submitText = mode === 'edit' ? 'Zaktualizuj' : 'Zapisz'
  const submitPending = mode === 'edit' ? 'Aktualizuję...' : 'Zapisuję...'

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded border border-[#D4D0C5] bg-[#FAFAF7] p-3 space-y-2"
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-[#888]">
        {headerText}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          type={KIND_INPUT_TYPE[kind]}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={KIND_PLACEHOLDER[kind]}
          required
          autoFocus
          disabled={isPending}
          className="flex-1 rounded border border-[#E5E1D8] bg-white px-2 py-1 text-sm focus:border-[#888] focus:outline-none"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Etykieta (opt.: biuro, sprzedaż)"
          maxLength={50}
          disabled={isPending}
          className="rounded border border-[#E5E1D8] bg-white px-2 py-1 text-sm sm:w-48 focus:border-[#888] focus:outline-none"
        />
      </div>
      {error && (
        <div className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded border border-[#E5E1D8] bg-white px-3 py-1 text-xs font-medium text-[#555] hover:bg-[#F5F5F5] disabled:opacity-50"
        >
          Anuluj
        </button>
        <button
          type="submit"
          disabled={isPending || !value.trim()}
          className="rounded bg-[#4F46E5] px-3 py-1 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {isPending ? submitPending : submitText}
        </button>
      </div>
    </form>
  )
}
