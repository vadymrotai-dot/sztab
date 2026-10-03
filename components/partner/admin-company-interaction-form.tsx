'use client'

// components/partner/admin-company-interaction-form.tsx — admin (staff)
// edytuje status/notatki tak jak widzi je partner, z panelu /partners.
// Server action (adminUpdatePartnerCompanyLink) wymaga requireAdmin() —
// to jest realna granica bezpieczeństwa, nie ten formularz.

import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { adminUpdatePartnerCompanyLink } from '@/app/actions/partner-admin'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_LABELS } from '@/lib/partner/company-display'

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))

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
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Notatki</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Notatki partnera (widoczne i edytowalne przez admina)..."
        />
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? 'Zapisywanie…' : saved ? (
          <>
            <CheckIcon /> Zapisano (jako admin)
          </>
        ) : (
          'Zapisz (jako admin)'
        )}
      </Button>
    </div>
  )
}
