// components/clients/people-section.tsx
// Sprint K — Osoby decyzyjne (z person_company_links).

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserIcon, MailIcon, PhoneIcon, LinkedinIcon, CrownIcon } from 'lucide-react'

interface PersonLink {
  id: string
  rola: string
  jest_decyzyjny: boolean
  sila_relacji: number
  zrodlo: string
  data_od: string | null
  data_do: string | null
  person: {
    id: string
    imie: string
    nazwisko: string
    email_glowny: string | null
    telefon_komorkowy: string | null
    linkedin_url: string | null
  }
}

export function PeopleSection({
  links,
  title = 'Osoby decyzyjne',
}: {
  links: PersonLink[]
  title?: string
}) {
  if (links.length === 0) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brak osób w bazie. Uruchom Intelligence Lookup żeby auto-pobrać zarząd z KRS lub
            właściciela z CEIDG.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-4 border-l-orange-400">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">{links.length} osób</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {links.map((l) => {
            const initials = `${l.person.imie[0] ?? '?'}${l.person.nazwisko[0] ?? ''}`.toUpperCase()
            return (
              <li key={l.id} className="flex items-start gap-3 py-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold">
                  {initials}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/persons/${l.person.id}`}
                      className="font-medium hover:underline"
                    >
                      {l.person.imie} {l.person.nazwisko}
                    </Link>
                    {l.jest_decyzyjny && (
                      <Badge className="bg-amber-500 text-white h-5 text-[10px]">
                        <CrownIcon className="size-3 mr-1" />
                        Decyzyjny
                      </Badge>
                    )}
                    <Badge variant="outline" className="h-5 text-[10px] font-mono">
                      {l.zrodlo}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{l.rola}</p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {l.person.email_glowny && (
                      <a
                        href={`mailto:${l.person.email_glowny}`}
                        className="flex items-center gap-1 text-emerald-700 hover:underline"
                      >
                        <MailIcon className="size-3" />
                        {l.person.email_glowny}
                      </a>
                    )}
                    {l.person.telefon_komorkowy && (
                      <a
                        href={`tel:${l.person.telefon_komorkowy}`}
                        className="flex items-center gap-1 text-emerald-700 hover:underline"
                      >
                        <PhoneIcon className="size-3" />
                        {l.person.telefon_komorkowy}
                      </a>
                    )}
                    {l.person.linkedin_url && (
                      <a
                        href={l.person.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-700 hover:underline"
                      >
                        <LinkedinIcon className="size-3" />
                        LinkedIn
                      </a>
                    )}
                  </div>
                  {l.sila_relacji > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-muted-foreground">Siła relacji:</span>
                      <div className="h-1.5 w-24 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${l.sila_relacji}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono">{l.sila_relacji}/100</span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
