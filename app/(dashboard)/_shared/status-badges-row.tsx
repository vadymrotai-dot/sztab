// Quick-scan badges for VAT + GUS status. Server component (no
// interactivity). Shown inline above Notatki section.

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  vatStatus: string | null
  gusStatus: string | null
  employeeCountRange: string | null
  krsStatus?: string | null
  krsLegalForm?: string | null
}

export function StatusBadgesRow({
  vatStatus,
  gusStatus,
  employeeCountRange,
  krsStatus,
  krsLegalForm,
}: Props) {
  const badges: Array<{ label: string; class: string }> = []

  if (vatStatus === 'Czynny') {
    badges.push({ label: 'VAT czynny', class: 'bg-emerald-100 text-emerald-800' })
  } else if (vatStatus === 'Wykreślony') {
    badges.push({ label: 'VAT wykreślony', class: 'bg-red-100 text-red-800' })
  } else if (vatStatus === 'Zwolniony') {
    badges.push({ label: 'VAT zwolniony', class: 'bg-amber-100 text-amber-800' })
  }

  if (employeeCountRange) {
    badges.push({
      label: `${employeeCountRange} pracowników`,
      class: 'bg-blue-100 text-blue-800',
    })
  }

  if (gusStatus === 'active') {
    badges.push({ label: 'Aktywny GUS', class: 'bg-emerald-100 text-emerald-800' })
  } else if (gusStatus === 'suspended') {
    badges.push({ label: 'Zawieszony', class: 'bg-amber-100 text-amber-800' })
  } else if (gusStatus === 'deregistered') {
    badges.push({ label: 'Wykreślony GUS', class: 'bg-red-100 text-red-800' })
  } else if (gusStatus === 'liquidation') {
    badges.push({ label: 'W likwidacji', class: 'bg-orange-100 text-orange-800' })
  }

  if (krsLegalForm) {
    // Compact legal form badge — strip "SPÓŁKA" prefixes for brevity
    const compact = krsLegalForm
      .replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/i, 'sp. z o.o.')
      .replace(/SPÓŁKA AKCYJNA/i, 'S.A.')
      .replace(/SPÓŁKA KOMANDYTOWA/i, 'sp.k.')
      .replace(/SPÓŁKA JAWNA/i, 'sp.j.')
    badges.push({ label: compact, class: 'bg-purple-100 text-purple-800' })
  }
  if (krsStatus === 'likwidacja') {
    badges.push({ label: 'KRS likwidacja', class: 'bg-amber-100 text-amber-800' })
  } else if (krsStatus === 'upadlosc') {
    badges.push({ label: 'Upadłość', class: 'bg-red-100 text-red-800' })
  } else if (krsStatus === 'wykreslony') {
    badges.push({ label: 'Wykreślony KRS', class: 'bg-slate-200 text-slate-800' })
  }

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((b) => (
        <Badge
          key={b.label}
          variant="outline"
          className={cn('text-xs border-transparent', b.class)}
        >
          {b.label}
        </Badge>
      ))}
    </div>
  )
}
