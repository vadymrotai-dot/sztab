// components/clients/msig-changes-section.tsx
// Sprint K — MSiG changes timeline.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface MsigChange {
  id: string
  msig_number: string | null
  publication_date: string | null
  change_type: string | null
  description: string | null
}

const TYPE_COLORS: Record<string, string> = {
  zarząd: 'bg-purple-600',
  kapitał: 'bg-emerald-600',
  adres: 'bg-blue-600',
  forma: 'bg-amber-600',
  prokura: 'bg-indigo-600',
  'rada nadzorcza': 'bg-pink-600',
}

export function MsigChangesSection({ changes }: { changes: MsigChange[] }) {
  if (changes.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Monitor Sądowy i Gospodarczy</span>
          <span className="text-xs font-normal text-muted-foreground">{changes.length} zmian</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {changes.slice(0, 10).map((c) => (
            <li key={c.id} className="grid grid-cols-12 items-start gap-2 py-2 text-sm">
              <div className="col-span-2 text-xs font-mono text-muted-foreground pt-0.5">
                {c.publication_date
                  ? new Date(c.publication_date).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })
                  : '—'}
              </div>
              <div className="col-span-2">
                {c.change_type && (
                  <Badge
                    className={`${TYPE_COLORS[c.change_type] ?? 'bg-gray-500'} text-white h-5 text-[10px]`}
                  >
                    {c.change_type}
                  </Badge>
                )}
              </div>
              <div className="col-span-8 text-xs">
                <p>{c.description ?? '—'}</p>
                {c.msig_number && (
                  <p className="font-mono text-[10px] text-muted-foreground">{c.msig_number}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
