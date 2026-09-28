'use client'

// components/clients/portal-account-panel.tsx
// Panel admina (28.09.2026) — rejestracja klienta w portalu bez czekania na
// self-service NIP-form + generowanie gotowego linku logowania do wysłania
// klientowi ręcznie (WhatsApp/mail) zamiast polegać wyłącznie na mailu
// z Supabase. Widoczne na app/(dashboard)/clients/[id]/page.tsx.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createPortalAccountForClient, getPortalLoginLink } from '@/app/actions/portal-admin'

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
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copyLink = async (l: string) => {
    try {
      await navigator.clipboard.writeText(l)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API może nie działać (uprawnienia) — link i tak jest widoczny do zaznaczenia ręcznie.
    }
  }

  const register = async () => {
    setLoading(true)
    setError(null)
    setLink(null)
    const res = await createPortalAccountForClient(clientId, email)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setLink(res.link)
    router.refresh()
  }

  const fetchLink = async () => {
    setLoading(true)
    setError(null)
    const res = await getPortalLoginLink(clientId)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setLink(res.link)
  }

  return (
    <div className="space-y-2">
      {account ? (
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${statusColor[account.status] ?? 'text-slate-700 bg-slate-50 border-slate-200'}`}
          >
            <span className="font-medium">Portal klienta: {statusLabel[account.status] ?? account.status}</span>
            <span className="text-muted-foreground">({account.email})</span>
          </div>
          {account.status === 'approved' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={loading} onClick={fetchLink}>
              {loading ? 'Generuję…' : 'Pobierz link logowania'}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Klient bez konta w portalu.</span>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@klienta.pl"
            className="h-7 w-56 text-xs"
          />
          <Button size="sm" className="h-7" disabled={loading || !email.trim()} onClick={register}>
            {loading ? 'Rejestruję…' : 'Zarejestruj w portalu'}
          </Button>
        </div>
      )}

      {error && <div className="text-xs text-red-600">{error}</div>}

      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span className="shrink-0 text-muted-foreground">Link do wysłania klientowi (ważny ograniczony czas):</span>
          <code className="min-w-0 flex-1 break-all">{link}</code>
          <Button
            size="sm"
            variant="outline"
            className="h-6 shrink-0 text-xs"
            onClick={() => copyLink(link)}
          >
            {copied ? 'Skopiowano ✓' : 'Kopiuj'}
          </Button>
        </div>
      )}
    </div>
  )
}
