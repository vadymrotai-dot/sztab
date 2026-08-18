// components/clients/order-link-button.tsx
// Sprint S-ORDER.1.D (19.05.2026) — standalone CTA "Wyślij link do zamówienia".
//
// Idempotent: backend returns existing draft access_token if present.
// Modal з URL + Skopiuj + WhatsApp pre-filled.

'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

interface Props {
  clientId: string
  clientName: string
  cohortId?: string | null
}

interface LinkData {
  url: string
  is_existing: boolean
}

export function OrderLinkButton({ clientId, clientName, cohortId }: Props) {
  const [linkData, setLinkData] = useState<LinkData | null>(null)
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  const generateLink = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/orders/admin/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            cohort_id: cohortId || null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || `Błąd generowania linku (HTTP ${res.status})`)
          return
        }
        if (!data.access_token) {
          toast.error('Serwer nie zwrócił tokenu zamówienia')
          return
        }
        const url = `${window.location.origin}/zamowienie/${data.access_token}`
        setLinkData({ url, is_existing: data.is_existing })
      } catch (e) {
        toast.error(
          e instanceof Error ? `Błąd sieci: ${e.message}` : 'Błąd sieci',
        )
      }
    })
  }

  const copyToClipboard = () => {
    if (!linkData) return
    navigator.clipboard.writeText(linkData.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const whatsappUrl = linkData
    ? `https://wa.me/?text=${encodeURIComponent(
        `Oferta DAGOLD — złóż zamówienie online: ${linkData.url}`,
      )}`
    : ''

  return (
    <>
      <button
        type="button"
        onClick={generateLink}
        disabled={isPending}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition"
      >
        {isPending ? 'Generowanie...' : '🛒 Wyślij link do zamówienia'}
      </button>

      {linkData && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setLinkData(null)}
        >
          <div
            className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {linkData.is_existing ? 'Link już istnieje' : 'Link wygenerowany'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Klient: {clientName}
                </p>
              </div>
              <button
                onClick={() => setLinkData(null)}
                className="text-slate-400 hover:text-slate-900 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {linkData.is_existing && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                Klient ma już aktywny szkic zamówienia. Wyślij ten sam link.
              </p>
            )}

            <div className="bg-slate-50 border border-slate-300 rounded p-3 font-mono text-sm break-all mb-4 text-slate-900">
              {linkData.url}
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-800 transition"
              >
                {copied ? '✓ Skopiowano' : '📋 Skopiuj link'}
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-semibold text-sm hover:bg-emerald-600 transition text-center"
              >
                💬 WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
