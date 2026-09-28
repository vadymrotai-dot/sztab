'use client'

// components/clients/portal-account-panel.tsx
// Panel admina (28.09.2026) — rejestracja klienta w portalu bez czekania na
// self-service NIP-form. Widoczne na app/(dashboard)/clients/[id]/page.tsx.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createPortalAccountForClient } from '@/app/actions/portal-admin'

interface Props {
  clientId: string
  account: { email: string; status: string } | null
  defaultEmail: string
}

const statusLabel: Record<string, string> = {
  approved: 'Zatwierdzone',
  pending: 'Oczekuje',
  rejected: 'Odrzucone',
}
const statusColor: Record<string, string> = {
  approved: 'text-green-700 bg-green-50 border-green-200',
  pending: 'text-amber-700 bg-amber-50 border-amber-200',
  rejected: 'text-red-700 bg-red-50 border-red-200',
}

export function PortalAccountPanel({ clientId, account, defaultEmail }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState(defaultEmail)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (account) {
    return (
      <div
        className={`inline-flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${statusColor[account.status] ?? 'text-slate-700 bg-slate-50 border-slate-200'}`}
      >
        <span className="font-medium">Portal klienta: {statusLabel[account.status] ?? account.status}</span>
        <span className="text-muted-foreground">({account.email})</span>
      </div>
    )
  }

  const submit = async () => {
    setLoading(true)
    setError(null)
    const res = await createPortalAccountForClient(clientId, email)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs">
      <span className="text-muted-foreground">Klient bez konta w portalu.</span>
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@klienta.pl"
        className="h-7 w-56 text-xs"
      />
      <Button size="sm" className="h-7" disabled={loading || !email.trim()} onClick={submit}>
        {loading ? 'Rejestruję…' : 'Zarejestruj w portalu'}
      </Button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </div>
  )
}
