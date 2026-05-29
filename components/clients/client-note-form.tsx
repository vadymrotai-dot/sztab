'use client'

// components/clients/client-note-form.tsx
// Sprint TYDZIEN2.T2.5 (29.05.2026) — inline add/edit form для client_notes.
// Mirror pattern z contact-method-form.tsx, ale textarea zamiast input
// (notatka multi-line) + char counter (5000 limit).

import { useState, useTransition } from 'react'

import { addClientNote, updateClientNote } from '@/app/actions/client-notes'

const MAX_BODY = 5000

interface Props {
  clientId: string
  /** 'add' = create new, 'edit' = update existing. */
  mode: 'add' | 'edit'
  /** Required gdy mode='edit'. UUID notatki do aktualizacji. */
  noteId?: string
  /** Pre-fill dla edit mode. */
  initialBody?: string
  onSuccess: () => void
  onCancel: () => void
}

export function ClientNoteForm({
  clientId,
  mode,
  noteId,
  initialBody,
  onSuccess,
  onCancel,
}: Props) {
  const [body, setBody] = useState(initialBody ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const trimmedLen = body.trim().length
  const isOverLimit = body.length > MAX_BODY
  const canSubmit = trimmedLen > 0 && !isOverLimit && !isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const v = body.trim()
    if (!v) {
      setError('Treść wymagana')
      return
    }
    if (v.length > MAX_BODY) {
      setError(`Notatka za długa (max ${MAX_BODY} znaków)`)
      return
    }
    startTransition(async () => {
      const result =
        mode === 'edit'
          ? await updateClientNote(noteId!, v)
          : await addClientNote(clientId, v)
      if (!result.ok) {
        // НЕ закриваємо форму на error — Vadym widzi banner i może retry
        // bez recovering z lost state.
        setError(result.error)
        return
      }
      // Reset тільки в add mode (edit closes form via onSuccess anyway).
      if (mode === 'add') {
        setBody('')
      }
      onSuccess()
    })
  }

  const headerText = mode === 'edit' ? 'Edytuj notatkę' : 'Dodaj notatkę'
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
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Telefon, oferta, obietnica, callback..."
        rows={3}
        maxLength={MAX_BODY}
        required
        autoFocus
        disabled={isPending}
        className="w-full resize-y min-h-[80px] max-h-[400px] rounded border border-[#E5E1D8] bg-white px-2 py-1 text-sm focus:border-[#888] focus:outline-none disabled:opacity-60"
      />
      {error && (
        <div className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div
          className={`text-[10px] ${
            isOverLimit
              ? 'text-rose-600 font-medium'
              : trimmedLen > MAX_BODY * 0.9
                ? 'text-amber-600'
                : 'text-[#888]'
          }`}
        >
          {body.length} / {MAX_BODY}
        </div>
        <div className="flex items-center gap-2">
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
            disabled={!canSubmit}
            className="rounded bg-[#4F46E5] px-3 py-1 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {isPending ? submitPending : submitText}
          </button>
        </div>
      </div>
    </form>
  )
}
