// Quick-scan badges for VAT + GUS status. Server component (no
// interactivity). Shown inline above Notatki section.

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  vatStatus: string | null
  gusStatus: string | null
  employeeCountRange: string | null
}

export function StatusBadgesRow({ vatStatus, gusStatus, employeeCountRange }: Props) {
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
