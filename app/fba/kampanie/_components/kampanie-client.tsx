'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import { CreateCampaignDialog } from './create-campaign-dialog'
import type { CampaignRow } from '../page'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Szkic',
  ACTIVE: 'Aktywna',
  PAUSED: 'Wstrzymana',
  COMPLETED: 'Zakończona',
}

interface KampanieClientProps {
  campaigns: CampaignRow[]
  error: string | null
}

export function KampanieClient({ campaigns, error }: KampanieClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [localCampaigns, setLocalCampaigns] = useState<CampaignRow[]>(campaigns)

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Usunąć kampanię "${name}"?`)) return
    setLocalCampaigns(prev => prev.filter(c => c.id !== id))
    try {
      await fetch(`/api/fba/kampanie/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Delete failed', e)
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Błąd ładowania kampanii</p>
          <p className="mt-1 text-xs opacity-80">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {campaigns.length === 0
            ? 'Brak kampanii — utwórz pierwszą'
            : `${campaigns.length} kampanii`}
        </p>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setDialogOpen(true)}
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          Nowa kampania
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">Nie masz jeszcze żadnej kampanii.</p>
          <Button
            size="sm"
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon className="mr-1 h-4 w-4" />
            Utwórz pierwszą kampanię
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {localCampaigns.map(c => (
            <div key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-sm truncate">{c.name}</h3>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? STATUS_COLORS.DRAFT}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.filter_pkd?.map(p => (
                      <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">{p}</span>
                    ))}
                    {c.filter_zus?.map(z => (
                      <span key={z} className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">{z}</span>
                    ))}
                    {c.filter_obyw?.map(o => (
                      <span key={o} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{o}</span>
                    ))}
                    {c.filter_regions?.map(r => (
                      <span key={r} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">{r}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-3 text-center shrink-0">
                  {[
                    { label: 'Leidy', val: c.leads_count },
                    { label: 'Apollo', val: c.enriched_count },
                    { label: 'Wysłane', val: c.sent_count },
                    { label: 'Odpow.', val: c.replied_count },
                    { label: 'FBA', val: c.converted_count },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="text-base font-bold">{s.val}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Utworzona: {new Date(c.created_at).toLocaleDateString('pl-PL')}
                  {c.started_at && ` · Start: ${new Date(c.started_at).toLocaleDateString('pl-PL')}`}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    🗑️ Usuń
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateCampaignDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
