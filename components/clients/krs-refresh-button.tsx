'use client'

// components/clients/krs-refresh-button.tsx
// Sprint S5B-1 — accordion-section action button що POSTs до
// /api/clients/[id]/krs-refresh + sonner toast feedback. Replaces
// stary anchor link `#krs-refresh` що nic nie robił.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2Icon, RefreshCcwIcon } from 'lucide-react'

interface Props {
  clientId: string
  /** Czy przycisk renderuje się — true gdy NIP+KRS dostępne. */
  enabled: boolean
}

export function KrsRefreshButton({ clientId, enabled }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (!enabled) return null

  async function refresh() {
    setBusy(true)
    const toastId = toast.loading('Aktualizuję dane z KRS…')
    try {
      const res = await fetch(`/api/clients/${clientId}/krs-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = (await res.json()) as {
        ok: boolean
        fields_updated?: number
        sprawozdania_added?: number
        errors?: string[]
        error?: string
      }
      if (!json.ok) {
        toast.error(json.error ?? 'Refresh nie powiódł się', { id: toastId })
        return
      }
      const parts: string[] = []
      if (json.fields_updated) parts.push(`${json.fields_updated} pól`)
      if (json.sprawozdania_added) parts.push(`${json.sprawozdania_added} sprawozdań`)
      const msg = parts.length > 0
        ? `Zaktualizowano: ${parts.join(', ')}`
        : 'Brak nowych danych z KRS'
      if (json.errors && json.errors.length > 0) {
        toast.warning(`${msg} (${json.errors.length} ostrzeżeń)`, { id: toastId })
      } else {
        toast.success(msg, { id: toastId })
      }
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd sieci', { id: toastId })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      className="inline-flex items-center gap-1 text-[12px] text-[#555] hover:text-[#0A0A0A] hover:underline disabled:opacity-50"
    >
      {busy ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : (
        <RefreshCcwIcon className="size-3" />
      )}
      Pobierz z KRS
    </button>
  )
}
