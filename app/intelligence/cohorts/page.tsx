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
  cohort_members: { count: number }[] | null
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default async function CohortsListPage() {
  const supabase = await createClient()

  // Embedded count via PostgREST: cohort_members(count) returns
  // [{ count: N }] per parent row. Standard idiom.
  const { data, error } = await supabase
    .from('cohorts')
    .select('id, name, description, created_at, cohort_members(count)')
    .order('created_at', { ascending: false })

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
                  const memberCount = c.cohort_members?.[0]?.count ?? 0
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
                        {memberCount}
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
