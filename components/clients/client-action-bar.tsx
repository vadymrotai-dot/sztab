'use client'

// Sprint P FIX 5 — 5-action sticky bar dla /clients/[id].

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  SparklesIcon,
  MailIcon,
  KanbanIcon,
  CalendarPlusIcon,
  DownloadIcon,
  Loader2Icon,
} from 'lucide-react'

interface Props {
  clientId: string
  nip: string | null
  topProductName: string | null
}

export function ClientActionBar({ clientId, nip, topProductName }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function rerunLookup() {
    if (!nip) {
      alert('Brak NIP — nie można uruchomić Intelligence Lookup')
      return
    }
    setBusy('lookup')
    try {
      const res = await fetch('/api/intelligence/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) alert(json.error ?? 'Lookup nie powiódł się')
      else {
        alert('Wzbogacanie uruchomione w tle. Odśwież stronę za chwilę.')
        router.refresh()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function generateOpener() {
    setBusy('opener')
    try {
      const res = await fetch('/api/ai/cold-opener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = (await res.json()) as {
        ok: boolean
        opener?: string
        error?: string
      }
      if (json.ok && json.opener) {
        await navigator.clipboard.writeText(json.opener).catch(() => {})
        alert(`Cold opener:\n\n${json.opener}\n\nSkopiowane do schowka.`)
      } else {
        alert(json.error ?? 'Nie udało się wygenerować openera')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  function exportProfile() {
    setBusy('export')
    try {
      window.location.href = `/api/clients/${clientId}/export-markdown`
    } finally {
      setTimeout(() => setBusy(null), 1500)
    }
  }

  return (
    <div className="sticky top-12 z-30 flex flex-wrap items-center gap-2 border-b bg-background px-6 py-2.5">
      <Button
        size="sm"
        onClick={rerunLookup}
        disabled={busy !== null || !nip}
        title={topProductName ? `Top match: ${topProductName}` : 'Wzbogacanie pełne'}
      >
        {busy === 'lookup' ? (
          <Loader2Icon className="mr-2 size-4 animate-spin" />
        ) : (
          <SparklesIcon className="mr-2 size-4" />
        )}
        Wzbogać profil
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={generateOpener}
        disabled={busy !== null}
      >
        {busy === 'opener' ? (
          <Loader2Icon className="mr-2 size-4 animate-spin" />
        ) : (
          <MailIcon className="mr-2 size-4" />
        )}
        Wygeneruj cold opener
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/deals/new?client_id=${clientId}`)}
        disabled={busy !== null}
      >
        <KanbanIcon className="mr-2 size-4" />
        Dodaj umowę
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/tasks?client_id=${clientId}&new=1`)}
        disabled={busy !== null}
      >
        <CalendarPlusIcon className="mr-2 size-4" />
        Zaplanuj kontakt
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={exportProfile}
        disabled={busy !== null}
      >
        <DownloadIcon className="mr-2 size-4" />
        Eksportuj profil
      </Button>
    </div>
  )
}
