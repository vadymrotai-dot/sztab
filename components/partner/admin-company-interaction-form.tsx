'use client'

// components/partner/admin-company-interaction-form.tsx — admin (staff)
// edytuje status/notatki tak jak widzi je partner, z panelu /partners.
// Server action (adminUpdatePartnerCompanyLink) wymaga requireAdmin() —
// to jest realna granica bezpieczeństwa, nie ten formularz.

import { useState } from 'react'
import { adminUpdatePartnerCompanyLink } from '@/app/actions/partner-admin'

const STATUS_OPTIONS = [
  { value: 'new', label: 'Nowa' },
  { value: 'in_progress', label: 'W trakcie' },
  { value: 'contacted', label: 'Skontaktowano' },
  { value: 'qualified', label: 'Zakwalifikowana' },
  { value: 'rejected', label: 'Odrzucona' },
  { value: 'converted', label: 'Zamknięta (deal)' },
]

export function AdminCompanyInteractionForm({
  partnerId,
  companyId,
  initialStatus,
  initialNotes,
}: {
  partnerId: string
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
    const res = await adminUpdatePartnerCompanyLink(partnerId, companyId, { status, notes })
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
          placeholder="Notatki partnera (widoczne i edytowalne przez admina)..."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none"
        />
      </label>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
      >
        {saving ? 'Zapisywanie…' : saved ? 'Zapisano ✓' : 'Zapisz (jako admin)'}
      </button>
    </div>
  )
}
