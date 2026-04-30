'use client'

// components/clients/client-detail-actions.tsx
// Sprint S4 Phase 1B — wired ActionBar dla /clients/[id]. Closes the
// "де кнопка аналізу" gap: primary button "Analizuj AI" wired до
// /api/ai/analyze-profile, no scrolling needed. Replaces old Sprint P
// ClientActionBar (5-action sticky bar dropped у S2B).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SparklesIcon, RefreshCwIcon, PencilIcon, DownloadIcon, RefreshCcwIcon, Trash2Icon } from 'lucide-react'
import { ActionBar } from '@/components/action-bar'
import { deleteClientRecord } from '@/app/actions/clients'

interface Props {
  clientId: string
  nip: string | null
  hasProfile: boolean
}

export function ClientDetailActions({ clientId, nip, hasProfile }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'analyze' | 'krs' | 'delete' | null>(null)
  const [, startTransition] = useTransition()

  async function analyze() {
    setBusy('analyze')
    try {
      const res = await fetch('/api/ai/analyze-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        alert(json.error ?? 'Analiza nie powiodła się')
      } else {
        router.refresh()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function refreshFromKrs() {
    if (!nip) {
      alert('Brak NIP — nie można pobrać z KRS')
      return
    }
    setBusy('krs')
    try {
      const res = await fetch('/api/intelligence/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        alert(json.error ?? 'Pobieranie nie powiodło się')
      } else {
        alert('Pobieranie uruchomione w tle. Odśwież za chwilę.')
        router.refresh()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  function deleteClient() {
    if (!confirm('Czy na pewno usunąć tego klienta? Operacja nieodwracalna.')) return
    setBusy('delete')
    startTransition(async () => {
      const result = await deleteClientRecord(clientId)
      if (!result.ok) {
        alert(result.error ?? 'Usuwanie nie powiodło się')
        setBusy(null)
        return
      }
      router.push('/clients')
    })
  }

  return (
    <ActionBar
      primary={{
        label: hasProfile ? 'Re-analizuj' : '✨ Analizuj AI',
        icon: hasProfile ? <RefreshCwIcon className="size-3.5" /> : <SparklesIcon className="size-3.5" />,
        onClick: analyze,
        loading: busy === 'analyze',
        disabled: busy !== null,
        variant: hasProfile ? 'secondary' : 'primary',
      }}
      actions={[
        {
          label: '+ Zadanie',
          href: `/tasks?client_id=${clientId}&new=1`,
          disabled: busy !== null,
        },
        {
          label: '+ Notatka',
          href: `/clients/${clientId}#aktywnosc`,
          disabled: busy !== null,
        },
        {
          label: '+ Szansa',
          href: `/deals/new?client_id=${clientId}`,
          disabled: busy !== null,
        },
      ]}
      menu={[
        {
          label: 'Edytuj',
          icon: <PencilIcon className="size-3.5" />,
          href: `/clients/${clientId}/edit`,
        },
        {
          label: 'Eksport (Markdown)',
          icon: <DownloadIcon className="size-3.5" />,
          href: `/api/clients/${clientId}/export-markdown`,
        },
        {
          label: busy === 'krs' ? 'Pobieranie…' : 'Pobierz z KRS',
          icon: <RefreshCcwIcon className="size-3.5" />,
          onClick: refreshFromKrs,
          disabled: busy !== null || !nip,
        },
        {
          label: 'Usuń',
          icon: <Trash2Icon className="size-3.5" />,
          onClick: deleteClient,
          disabled: busy !== null,
          variant: 'destructive',
          separatorBefore: true,
        },
      ]}
    />
  )
}
