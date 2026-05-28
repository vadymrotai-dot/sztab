// app/intelligence/cohorts/page.tsx
// Phase 2 Krok 1.C1 (08.05.2026) — Cohorts list view.
// Per Vadym Q1: dedicated route + inline dropdown оба.
// Per Vadym Q2: visible to всем authenticated users (current RLS policy).
// Per Vadym Q4: status mutation = Krok 1.D, тут тільки read-only display.

import Link from 'next/link'
import { ArrowRightIcon, PlusIcon } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { DeleteCohortButton } from './_components/delete-cohort-button'

export const dynamic = 'force-dynamic'

interface CohortListRow {
  id: string
  name: string
  description: string | null
  created_at: string
}

interface SplitCount {
  prospect: number
  client: number
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Warsaw',
    })
  } catch {
    return iso
  }
}

export default async function CohortsListPage() {
  const supabase = await createClient()

  // Phase 2 Krok 1.C2 — split count by subject_type. PostgREST embedded
  // count не distinguishes types; parallel aggregation query (cohort_id +
  // subject_type) і JS bucket. ~few hundred rows expected — cheap.
  const [{ data, error }, { data: allMembers }] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('cohort_members').select('cohort_id, subject_type'),
  ])

  // Aggregate split counts per cohort_id
  const splitMap = new Map<string, SplitCount>()
  for (const m of (allMembers ?? []) as Array<{
    cohort_id: string
    subject_type: 'prospect' | 'client'
  }>) {
    if (!splitMap.has(m.cohort_id)) {
      splitMap.set(m.cohort_id, { prospect: 0, client: 0 })
    }
    const bucket = splitMap.get(m.cohort_id)!
    if (m.subject_type === 'prospect') bucket.prospect++
    else if (m.subject_type === 'client') bucket.client++
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <PageHeader
          title="Cohorts"
          breadcrumbs={[
            { label: 'AI Discovery', href: '/intelligence' },
            { label: 'Cohorts' },
          ]}
        />
        <div className="p-6">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Błąd ładowania cohortów</p>
            <p className="mt-1 text-xs opacity-80">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  const cohorts = (data ?? []) as CohortListRow[]

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Cohorts"
        breadcrumbs={[
          { label: 'AI Discovery', href: '/intelligence' },
          { label: 'Cohorts' },
        ]}
      />

      <div className="flex items-center justify-between px-6 pt-4">
        <p className="text-sm text-muted-foreground">
          Curated grupy prospekтów/klientów dla outreach campaigns.
        </p>
        <Button asChild size="sm">
          <Link href="/intelligence/cohorts/new">
            <PlusIcon className="mr-1 size-4" />
            Nowa cohort
          </Link>
        </Button>
      </div>

      <div className="px-6 pb-6 pt-4">
        {cohorts.length === 0 ? (
          <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
            <p>Brak cohortów.</p>
            <p className="mt-2">
              <Link
                href="/intelligence/cohorts/new"
                className="text-primary underline"
              >
                Stwórz pierwszą →
              </Link>
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead>Utworzono</TableHead>
                  <TableHead className="w-[120px] text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((c) => {
                  const split = splitMap.get(c.id) ?? { prospect: 0, client: 0 }
                  const memberCount = split.prospect + split.client
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/intelligence/cohorts/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.name}
                        </Link>
                        {c.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {c.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {memberCount === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : (
                          <span className="text-xs">
                            <span className="font-medium">{split.prospect}</span>
                            <span className="text-muted-foreground"> prospektów</span>
                            <span className="mx-1 text-muted-foreground">+</span>
                            <span className="font-medium">{split.client}</span>
                            <span className="text-muted-foreground"> klientów</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                          >
                            <Link href={`/intelligence/cohorts/${c.id}`}>
                              <ArrowRightIcon className="size-4" />
                              <span className="sr-only">Otwórz {c.name}</span>
                            </Link>
                          </Button>
                          <DeleteCohortButton
                            cohortId={c.id}
                            cohortName={c.name}
                            memberCount={memberCount}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
