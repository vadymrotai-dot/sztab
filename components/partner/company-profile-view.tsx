'use client'

// components/partner/company-profile-view.tsx — wspólny, interaktywny
// widok profilu leadu (bgk_companies), używany i w portalu partnera, i w
// podglądzie admina (/partners/[partnerId]/[companyId]). Zastępuje starą
// "suchą tabelę" polami: karty, zakładki, pełne imiona z KRS, klikalny
// kontakt (tel/mail/www), kopiowanie NIP.

import { useState } from 'react'
import {
  Building2Icon,
  BanknoteIcon,
  ClockIcon,
  CalendarIcon,
  PhoneIcon,
  MailIcon,
  GlobeIcon,
  UsersIcon,
  CrownIcon,
  CopyIcon,
  CheckIcon,
  ShieldCheckIcon,
  MapPinIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  getDecisionMakers,
  getBeneficiaries,
  isMaskedName,
  formatPln,
  formatTenure,
  initialsOf,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  TIER_BADGE_CLASS,
} from '@/lib/partner/company-display'

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard unavailable — silently ignore, not critical
        }
      }}
      className="inline-flex items-center text-slate-400 hover:text-slate-600"
      title="Kopiuj"
    >
      {copied ? <CheckIcon className="size-3.5 text-green-600" /> : <CopyIcon className="size-3.5" />}
    </button>
  )
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="flex items-start gap-2.5 px-4">
        <div className="mt-0.5 shrink-0 rounded-md bg-slate-100 p-1.5 text-slate-500">{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate text-sm font-semibold text-slate-800">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href?: string
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg border bg-background p-2.5">
      <div className="mt-0.5 shrink-0 text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        {href ? (
          <a
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-[#1F3A5F] hover:underline"
          >
            {value}
          </a>
        ) : (
          <div className="truncate text-sm font-medium text-slate-800">{value}</div>
        )}
      </div>
    </li>
  )
}

function PersonChip({ person, emphasize }: { person: { name: string; role?: string }; emphasize?: boolean }) {
  const masked = isMaskedName(person.name)
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border p-2.5',
        emphasize ? 'border-[#1F3A5F]/20 bg-[#1F3A5F]/5' : 'bg-background',
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1F3A5F] text-xs font-semibold text-white">
        {initialsOf(person.name)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-800">
          {person.name}
          {masked && (
            <span className="ml-1.5 text-[10px] font-normal text-amber-600" title="Częściowo zamaskowane w źródle (niepewne dopasowanie)">
              (niepełne dane źródła)
            </span>
          )}
        </div>
        {person.role && <div className="text-xs text-muted-foreground">{person.role}</div>}
      </div>
      {emphasize && (
        <CrownIcon className="ml-auto size-4 shrink-0 text-amber-500" aria-label="Osoba decyzyjna" />
      )}
    </div>
  )
}

export function CompanyProfileView({
  company,
  status,
  interactionPanel,
  note,
}: {
  company: Record<string, unknown>
  status: string
  interactionPanel: React.ReactNode
  note?: React.ReactNode
}) {
  const c = company
  const name = String(c.name ?? '')
  const nip = String(c.nip ?? '—')
  const decisionMakers = getDecisionMakers(c)
  const beneficiaries = getBeneficiaries(c)
  const tier = c.tier as string | null
  const phone = c.phone as string | null
  const email = (c.email ?? c.krs_search_email) as string | null
  const website = c.website as string | null

  return (
    <div className="space-y-6">
      {note}

      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-4 px-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#1F3A5F] text-lg font-semibold text-white">
              {initialsOf(name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-800">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  NIP {nip}
                  <CopyButton value={nip} />
                </span>
                <span>·</span>
                <span>{String(c.legal_form ?? '—')}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tier && (
                  <Badge variant="outline" className={TIER_BADGE_CLASS[tier] ?? ''}>
                    {tier}
                  </Badge>
                )}
                <Badge variant="outline" className={STATUS_BADGE_CLASS[status] ?? ''}>
                  {STATUS_LABELS[status] ?? status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {phone && (
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${phone}`}>
                  <PhoneIcon /> Zadzwoń
                </a>
              </Button>
            )}
            {email && (
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${email}`}>
                  <MailIcon /> Email
                </a>
              </Button>
            )}
            {website && (
              <Button asChild size="sm" variant="outline">
                <a href={website} target="_blank" rel="noopener noreferrer">
                  <GlobeIcon /> Strona
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<BanknoteIcon className="size-4" />} label="Kwota poręczenia" value={formatPln(c.amount_gross_pln)} />
        <StatTile icon={<CalendarIcon className="size-4" />} label="Data poręczenia BGK" value={String(c.bgk_guarantee_date ?? '—')} />
        <StatTile icon={<ClockIcon className="size-4" />} label="Staż na rynku" value={formatTenure(c.tenure_months)} />
        <StatTile icon={<Building2Icon className="size-4" />} label="Wielkość" value={String(c.size_category ?? '—')} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="kontakt">
            <TabsList>
              <TabsTrigger value="kontakt">Kontakt i osoby</TabsTrigger>
              <TabsTrigger value="rejestrowe">Dane rejestrowe</TabsTrigger>
            </TabsList>

            <TabsContent value="kontakt" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Osoby decyzyjne</CardTitle>
                  <CardDescription>
                    Pełne imiona i nazwiska z rejestru KRS (gdy dostępne).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {decisionMakers.length > 0 ? (
                    decisionMakers.map((p, i) => <PersonChip key={i} person={p} emphasize />)
                  ) : (
                    <p className="text-sm text-muted-foreground">Brak danych o osobach decyzyjnych.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dane kontaktowe</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {phone && (
                      <ContactRow icon={<PhoneIcon className="size-4" />} label="Telefon" value={phone} href={`tel:${phone}`} />
                    )}
                    {email && (
                      <ContactRow icon={<MailIcon className="size-4" />} label="E-mail" value={email} href={`mailto:${email}`} />
                    )}
                    {website && (
                      <ContactRow icon={<GlobeIcon className="size-4" />} label="Strona WWW" value={website} href={website} />
                    )}
                    {!phone && !email && !website && (
                      <li className="col-span-full text-sm text-muted-foreground">Brak danych kontaktowych.</li>
                    )}
                  </ul>
                </CardContent>
              </Card>

              {beneficiaries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheckIcon className="size-4 text-slate-500" />
                      Beneficjent rzeczywisty (CRBR)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {beneficiaries.map((b, i) => (
                        <Badge key={i} variant="outline" className="gap-1">
                          <UsersIcon className="size-3" />
                          {b.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="rejestrowe">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dane rejestrowe</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">PKD główne</dt>
                      <dd className="text-sm text-slate-800">{String(c.pkd_main ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-[11px] uppercase text-muted-foreground">
                        <MapPinIcon className="size-3" /> Region (TERYT)
                      </dt>
                      <dd className="text-sm text-slate-800">{String(c.region_teryt ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Data rejestracji</dt>
                      <dd className="text-sm text-slate-800">{String(c.registered_at ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Status VAT</dt>
                      <dd className="text-sm text-slate-800">{String(c.vat_status ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Zgodność zarząd/beneficjent</dt>
                      <dd className="text-sm text-slate-800">{String(c.zgodnosc_zarzad_beneficjent ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Kompletność danych</dt>
                      <dd className="text-sm text-slate-800">{String(c.completeness ?? '—')}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">Interakcja</CardTitle>
              <CardDescription>Status i notatki widoczne dla partnera.</CardDescription>
            </CardHeader>
            <CardContent>{interactionPanel}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
