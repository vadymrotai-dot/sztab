'use client'

// components/clients/client-type-badge.tsx
// Sprint S6D Day 1 (11.05.2026) — type badge з manual override dropdown.
//
// Display:
//   - Badge з emoji + polish label
//   - ⚠ warning icon якщо classification_confidence < 70
//   - Pencil icon → opens DropdownMenu з 9 type options
//
// Polish UI labels (per CLAUDE.md polish UI rule). Українські code comments.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDownIcon, AlertTriangleIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { overrideClassification } from '@/app/clients/[id]/actions/override-classification'
import type { ClientType } from '@/lib/ai/business-analysis'
import { CLIENT_TYPE_META, CLIENT_TYPE_ORDER } from '@/lib/clients/client-type-meta'

// Re-export для backwards compat — old importers were using
// `import { CLIENT_TYPE_META } from '@/components/clients/client-type-badge'`.
// New canonical source: `@/lib/clients/client-type-meta`.
export { CLIENT_TYPE_META } from '@/lib/clients/client-type-meta'

interface Props {
  clientId: string
  /** undefined → not yet classified; render dim "Nieznany typ" badge */
  clientType: ClientType | undefined
  /** 0-100 AI confidence; <70 → ⚠ warning icon */
  classificationConfidence: number | undefined
  /** Manual override permission gate — currently все zalogowani users */
  canEdit?: boolean
}

export function ClientTypeBadge({
  clientId,
  clientType,
  classificationConfidence,
  canEdit = true,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  // Якщо classification ще не зроблена — show neutral placeholder
  const meta = clientType ? CLIENT_TYPE_META[clientType] : null
  const lowConfidence =
    typeof classificationConfidence === 'number' && classificationConfidence < 70

  function handleOverride(newType: ClientType) {
    if (busy) return
    setBusy(true)
    const toastId = toast.loading(`Zmieniam typ na "${CLIENT_TYPE_META[newType].label_pl}"...`)
    startTransition(async () => {
      const result = await overrideClassification({ clientId, newType })
      if (!result.ok) {
        toast.error(result.error ?? 'Nadpisanie się nie powiodło', { id: toastId })
        setBusy(false)
        return
      }
      toast.success('Typ klienta zaktualizowany', { id: toastId })
      router.refresh()
      setBusy(false)
    })
  }

  const badgeContent = meta ? (
    <span className="inline-flex items-center gap-1">
      <span>{meta.emoji}</span>
      <span>{meta.label_pl}</span>
      {lowConfidence && (
        <AlertTriangleIcon
          className="ml-1 size-3.5 text-yellow-600"
          aria-label={`Niska pewność klasyfikacji (${classificationConfidence ?? '?'}%)`}
        />
      )}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span>❓</span>
      <span>Nieznany typ</span>
    </span>
  )

  if (!canEdit) {
    return (
      <Badge variant="outline" className={meta?.bgClass}>
        {badgeContent}
      </Badge>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          className={`h-7 gap-1 px-2 text-xs ${meta?.bgClass ?? ''}`}
          title="Kliknij aby zmienić typ klienta"
        >
          {badgeContent}
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          Zmień typ klienta:
          {lowConfidence && (
            <p className="mt-1 text-[10px] text-yellow-700">
              ⚠ AI mało pewny ({classificationConfidence}%) — sprawdź ręcznie
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        {CLIENT_TYPE_ORDER.map((t) => {
          const tMeta = CLIENT_TYPE_META[t]
          const active = clientType === t
          return (
            <DropdownMenuItem
              key={t}
              onClick={() => handleOverride(t)}
              disabled={active || busy}
              className={active ? 'bg-muted font-semibold' : ''}
            >
              <span className="mr-2">{tMeta.emoji}</span>
              <span>{tMeta.label_pl}</span>
              {active && <span className="ml-auto text-xs text-muted-foreground">obecny</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
