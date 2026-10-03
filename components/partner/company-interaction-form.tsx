'use client'

// components/partner/company-interaction-form.tsx — partner zmienia status
// i notatki dla przypisanej firmy. Server action (updatePartnerCompanyLink)
// + RLS to realna granica bezpieczeństwa; ten formularz to tylko UI.

import { useState } from 'react'
import { updatePartnerCompanyLink } from '@/app/partner-portal/actions'

const STATUS_OPTIONS = [
  { value: 'new', label: 'Nowa' },
  { value: 'in_progress', label: 'W trakcie' },
  { value: 'contacted', label: 'Skontaktowano' },
  { value: 'qualified', label: 'Zakwalifikowana' },
  { value: 'rejected', label: 'Odrzucona' },
  { value: 'converted', label: 'Zamknięta (deal)' },
]

export function CompanyInteractionForm({
  companyId,
  initialStatus,
  initialNotes,
}: {
  companyId: string
  initialStatus: string
  initialNotes: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await updatePartnerCompanyLink(companyId, { status, notes })
    setSaving(false)
    if (!res.ok) setError(res.error)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Notatki
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Notatki wewnętrzne partnera..."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none"
        />
      </label>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
      >
        {saving ? 'Zapisywanie…' : saved ? 'Zapisano ✓' : 'Zapisz'}
      </button>
    </div>
  )
}
