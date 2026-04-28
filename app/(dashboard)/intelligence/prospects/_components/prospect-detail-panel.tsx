'use client'

// Side panel z prospect details + score breakdown.

import { useState } from 'react'
import { toast } from 'sonner'
import {
  CopyIcon,
  ExternalLinkIcon,
  CheckIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { VatSection } from '@/app/(dashboard)/_shared/vat-section'
import { GusSection } from '@/app/(dashboard)/_shared/gus-section'
import { KrsSection } from '@/app/(dashboard)/_shared/krs-section'
import { StatusBadgesRow } from '@/app/(dashboard)/_shared/status-badges-row'

import type { ProspectRow } from './prospects-table'

interface Breakdown {
  sklep?: LayerScores
  restaurant?: LayerScores
  catering?: LayerScores
  cafe?: LayerScores
  meta?: {
    max_channel?: string
    max_score?: number
    multi_bonus?: number
    final?: number
  }
  filter?: { passed?: boolean; reason?: string | null }
  chain?: {
    detected?: boolean
    brand?: string | null
    loyalty_tier?: 'closed' | 'hybrid' | 'open' | null
    tier_status?: 'verified' | 'unverified' | null
  }
}

interface LayerScores {
  pkd?: number
  brand?: number
  owner?: number
  contact?: number
  breadth?: number
  recency?: number
  total?: number
}

const CHANNEL_LABEL: Record<string, string> = {
  sklep: 'sklep',
  restaurant: 'restauracja',
  catering: 'catering',
  cafe: 'kawiarnia',
  multi: 'multi',
}

const CHANNEL_PROGRESS_COLOR: Record<string, string> = {
  sklep: '[&>div]:bg-blue-500',
  restaurant: '[&>div]:bg-teal-500',
  catering: '[&>div]:bg-amber-500',
  cafe: '[&>div]:bg-rose-500',
}

const CHAIN_BADGE_CLASS: Record<string, string> = {
  closed: 'bg-red-100 text-red-800 border-transparent',
  hybrid: 'bg-amber-100 text-amber-800 border-transparent',
  open: 'bg-emerald-100 text-emerald-800 border-transparent',
  unverified: 'bg-slate-100 text-slate-700 border-transparent',
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const parsed = Number.parseFloat(v)
  return Number.isFinite(parsed) ? parsed : 0
}

interface CopyButtonProps {
  value: string
  label?: string
}

function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`Skopiowano${label ? ` ${label}` : ''}`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Nie udało się skopiować')
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      onClick={handle}
      type="button"
    >
      {copied ? (
        <CheckIcon className="size-3 text-emerald-600" />
      ) : (
        <CopyIcon className="size-3" />
      )}
    </Button>
  )
}

export interface ProspectDetailPanelProps {
  prospect: ProspectRow | null
  open: boolean
  onClose: () => void
}

export function ProspectDetailPanel({
  prospect,
  open,
  onClose,
}: ProspectDetailPanelProps) {
  if (!prospect) return null

  const breakdown = (prospect.score_breakdown ?? {}) as Breakdown
  const meta = num(prospect.horeca_meta_score)
  const dominant = prospect.dominant_channel ?? 'sklep'
  const dominantBd =
    dominant === 'multi'
      ? null
      : (breakdown[dominant as 'sklep' | 'restaurant' | 'catering' | 'cafe'] ?? null)
  const chainTier =
    breakdown.chain?.loyalty_tier ??
    (breakdown.chain?.tier_status === 'unverified' ? 'unverified' : null)

  const ceidgUrl = `https://aplikacja.ceidg.gov.pl/CEIDG/CEIDG.Public.UI/SearchDetails.aspx?Id=${encodeURIComponent(prospect.ceidg_id)}`

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md md:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-8 text-base">{prospect.name}</SheetTitle>
          {prospect.owner_name && (
            <SheetDescription>{prospect.owner_name}</SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {/* Filter exclusion banner */}
          {prospect.filter_passed === false && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Wykluczony przez filtr</p>
              <p className="mt-1 text-xs opacity-80">
                {prospect.filter_exclusion_reason ?? 'unknown'}
              </p>
            </div>
          )}

          {/* Quick-scan badges row */}
          <StatusBadgesRow
            vatStatus={prospect.vat_status ?? null}
            gusStatus={prospect.gus_status ?? null}
            employeeCountRange={prospect.employee_count_range ?? null}
            krsStatus={prospect.krs_status ?? null}
            krsLegalForm={prospect.krs_legal_form ?? null}
          />

          {/* VAT + GUS + KRS enrichment sections */}
          <VatSection
            targetType="prospect"
            targetId={prospect.id}
            hasNip={Boolean(prospect.nip)}
            initial={{
              vat_status: prospect.vat_status ?? null,
              vat_registered_date: prospect.vat_registered_date ?? null,
              vat_bank_accounts: prospect.vat_bank_accounts ?? null,
              vat_last_checked: prospect.vat_last_checked ?? null,
            }}
          />
          <GusSection
            targetType="prospect"
            targetId={prospect.id}
            hasNip={Boolean(prospect.nip)}
            initial={{
              gus_legal_name: prospect.gus_legal_name ?? null,
              gus_regon: prospect.gus_regon ?? null,
              gus_status: prospect.gus_status ?? null,
              registered_date: prospect.registered_date ?? null,
              employee_count_range: prospect.employee_count_range ?? null,
              pkd_codes: prospect.pkd_codes ?? null,
              gus_last_checked: prospect.gus_last_checked ?? null,
            }}
          />
          <KrsSection
            targetType="prospect"
            targetId={prospect.id}
            initial={{
              krs_number: prospect.krs_number ?? null,
              krs_full_name: prospect.krs_full_name ?? null,
              krs_legal_form: prospect.krs_legal_form ?? null,
              krs_registration_date: prospect.krs_registration_date ?? null,
              krs_status: prospect.krs_status ?? null,
              krs_management_board: prospect.krs_management_board ?? null,
              krs_pkd_with_descriptions: prospect.krs_pkd_with_descriptions ?? null,
              krs_last_checked: prospect.krs_last_checked ?? null,
            }}
          />

          {/* Basic info */}
          <Section title="Podstawowe">
            <KV label="NIP" value={prospect.nip} mono />
            <KV label="REGON" value={prospect.regon} mono />
            <KV label="Status" value={prospect.status} />
            <KV label="Data rozpoczęcia" value={prospect.data_rozpoczecia} />
            <KV label="CEIDG ID" value={prospect.ceidg_id} mono small />
          </Section>

          {/* Address */}
          <Section title="Adres">
            <p className="text-sm">{prospect.adres_full ?? '—'}</p>
            {prospect.miejscowosc && prospect.wojewodztwo && (
              <p className="mt-1 text-xs text-muted-foreground">
                {prospect.miejscowosc}, woj. {prospect.wojewodztwo.toLowerCase()}
              </p>
            )}
          </Section>

          {/* Contact */}
          <Section title="Kontakt">
            {!prospect.email && !prospect.telefon && !prospect.www ? (
              <p className="text-xs text-muted-foreground">
                Brak danych kontaktowych z CEIDG.
              </p>
            ) : (
              <div className="space-y-1.5">
                {prospect.email && (
                  <div className="flex items-center gap-1 text-sm">
                    <span className="font-mono">{prospect.email}</span>
                    <CopyButton value={prospect.email} label="email" />
                  </div>
                )}
                {prospect.telefon && (
                  <div className="flex items-center gap-1 text-sm">
                    <span className="font-mono">{prospect.telefon}</span>
                    <CopyButton value={prospect.telefon} label="telefon" />
                  </div>
                )}
                {prospect.www && (
                  <div className="flex items-center gap-1 text-sm">
                    <a
                      href={prospect.www}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:underline"
                    >
                      {prospect.www}
                    </a>
                    <CopyButton value={prospect.www} label="www" />
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* PKD */}
          <Section title="PKD">
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Główny:</span>{' '}
                <span className="font-mono font-semibold">
                  {prospect.pkd_main ?? '—'}
                </span>
              </div>
              {prospect.pkd_all && prospect.pkd_all.length > 0 && (
                <div>
                  <span className="text-muted-foreground">
                    Wszystkie ({prospect.pkd_all.length}):
                  </span>{' '}
                  <span className="font-mono text-xs">
                    {prospect.pkd_all.slice(0, 5).join(', ')}
                    {prospect.pkd_all.length > 5 &&
                      ` … +${prospect.pkd_all.length - 5}`}
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* Score breakdown — only if scored */}
          {prospect.horeca_meta_score !== null && prospect.filter_passed && (
            <Section title="Score breakdown">
              {/* Big meta + progress */}
              <div className="mb-4 rounded-md bg-muted p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    HoReCa Meta-Score
                  </span>
                  <span className="text-3xl font-bold tabular-nums">
                    {meta.toFixed(0)}
                    <span className="text-sm text-muted-foreground">/100</span>
                  </span>
                </div>
                <Progress value={meta} className="mt-2 h-2" />
                {dominant && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Dominujący kanał:{' '}
                    <span className="font-medium text-foreground">
                      {CHANNEL_LABEL[dominant] ?? dominant}
                    </span>
                  </p>
                )}
              </div>

              {/* Per-channel mini bars */}
              <div className="space-y-2">
                {(['sklep', 'restaurant', 'catering', 'cafe'] as const).map(
                  (ch) => {
                    const score = num(prospect[`${ch}_score`])
                    return (
                      <div key={ch}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="capitalize">
                            {CHANNEL_LABEL[ch]}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {score.toFixed(0)}
                          </span>
                        </div>
                        <Progress
                          value={score}
                          className={cn('h-1.5', CHANNEL_PROGRESS_COLOR[ch])}
                        />
                      </div>
                    )
                  },
                )}
              </div>

              {/* Layer breakdown for dominant channel */}
              {dominantBd && (
                <div className="mt-4 rounded-md border p-3">
                  <p className="mb-2 text-xs font-medium">
                    Warstwy (kanał: {CHANNEL_LABEL[dominant] ?? dominant})
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <LayerLine label="PKD fit" value={dominantBd.pkd} max={30} />
                    <LayerLine label="Brand" value={dominantBd.brand} max={15} />
                    <LayerLine label="Owner" value={dominantBd.owner} max={15} />
                    <LayerLine
                      label="Contact"
                      value={dominantBd.contact}
                      max={10}
                    />
                    <LayerLine
                      label="Breadth"
                      value={dominantBd.breadth}
                      max={15}
                    />
                    <LayerLine
                      label="Recency"
                      value={dominantBd.recency}
                      max={15}
                    />
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Chain info */}
          {breakdown.chain?.detected && (
            <Section title="Sieć">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    chainTier && CHAIN_BADGE_CLASS[chainTier],
                  )}
                >
                  {breakdown.chain.brand}
                </Badge>
                {chainTier && (
                  <span className="text-xs text-muted-foreground">
                    tier:{' '}
                    <span className="font-medium text-foreground">
                      {chainTier}
                    </span>
                    {breakdown.chain.tier_status && (
                      <> · {breakdown.chain.tier_status}</>
                    )}
                  </span>
                )}
              </div>
            </Section>
          )}

          {/* Raw data toggle */}
          <details className="rounded-md border bg-muted/30 p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Raw CEIDG response (raw_data JSONB)
            </summary>
            <pre className="mt-2 max-h-[300px] overflow-auto rounded bg-background p-2 text-[10px] leading-tight">
              {JSON.stringify(prospect.raw_data, null, 2)}
            </pre>
          </details>

          {/* Footer actions */}
          <div className="flex items-center gap-2 border-t pt-4">
            <Button variant="outline" size="sm" asChild>
              <a href={ceidgUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="mr-1 size-3" />
                Otwórz w CEIDG
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  )
}

function KV({
  label,
  value,
  mono,
  small,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
  small?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'truncate text-right',
          small ? 'text-[10px]' : 'text-sm',
          mono && 'font-mono',
        )}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

function LayerLine({
  label,
  value,
  max,
}: {
  label: string
  value: number | undefined
  max: number
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {value ?? 0}
        <span className="text-muted-foreground">/{max}</span>
      </span>
    </div>
  )
}
