import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LeidyTable, type LeidRow } from './_components/leidy-table'

export const dynamic = 'force-dynamic'

const ZUS_OPTIONS = [
  { id: 'PELNY', label: '🔴 Pełny ZUS' },
  { id: 'MALY', label: '🟡 Mały ZUS' },
  { id: 'ULGA', label: '🟢 Ulga' },
]

const EU_COUNTRIES = ['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PT','RO','SE','SI','SK']
const KNOWN_COUNTRIES = ['PL','UA','BY', ...EU_COUNTRIES]

const OBYW_OPTIONS = [
  { id: 'PL', label: '🇵🇱 PL' },
  { id: 'UA', label: '🇺🇦 UA' },
  { id: 'BY', label: '🇧🇾 BY' },
  { id: 'INNE', label: '🌍 Inne (non-EU)' },
]

const STATUS_OPTIONS = [
  { id: 'NEW', label: 'Nowe' },
  { id: 'SENT', label: 'Wysłane' },
  { id: 'REPLIED', label: 'Odpowiedź' },
  { id: 'CONVERTED', label: 'Konwersja' },
  { id: 'REJECTED', label: 'Odrzucone' },
]

const PAGE_SIZES = [50, 100, 200] as const
type PageSize = (typeof PAGE_SIZES)[number]
const DEFAULT_SIZE: PageSize = 50

function parseMulti(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function toggleMulti(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
}

export default async function FbaLeidyPage({
  searchParams,
}: {
  searchParams: Promise<{
    zus?: string
    obyw?: string
    status?: string
    pkd?: string
    page?: string
    size?: string
    q?: string
  }>
}) {
  const sp = await searchParams
  const zusSelected = parseMulti(sp.zus)
  const obywSelected = parseMulti(sp.obyw)
  const statusSelected = parseMulti(sp.status)
  const pkd = sp.pkd ?? null
  const q = (sp.q ?? '').trim()
  const size: PageSize = (PAGE_SIZES as readonly number[]).includes(Number(sp.size))
    ? (Number(sp.size) as PageSize)
    : DEFAULT_SIZE
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))

  const supabase = await createClient()
  let query = supabase
    .from('ceidg_prospects')
    .select(
      'id, ceidg_id, name, owner_name, miejscowosc, pkd_main, data_rozpoczecia, zus_segment, obywatelstwo, fba_segment, outreach_status, email, telefon, source_pkd',
      { count: 'exact' },
    )
    .eq('status', 'AKTYWNY')
    .order('data_rozpoczecia', { ascending: true, nullsFirst: false })

  if (zusSelected.length > 0) {
    query = query.in('zus_segment', zusSelected)
  }

  const hasInne = obywSelected.includes('INNE')
  const knownSelected = obywSelected.filter(o => o !== 'INNE')
  if (obywSelected.length > 0) {
    if (hasInne && knownSelected.length === 0) {
      query = query.not('obywatelstwo', 'in', `(${KNOWN_COUNTRIES.join(',')})`)
    } else if (hasInne && knownSelected.length > 0) {
      query = query.or(
        `obywatelstwo.in.(${knownSelected.join(',')}),obywatelstwo.not.in.(${KNOWN_COUNTRIES.join(',')})`
      )
    } else {
      query = query.in('obywatelstwo', knownSelected)
    }
  }

  if (statusSelected.length > 0) {
    query = query.in('outreach_status', statusSelected)
  }
  if (pkd) query = query.eq('source_pkd', pkd)
  if (q.length > 0) {
    query = query.or(`name.ilike.*${q}*,owner_name.ilike.*${q}*`)
  }

  const { data, count, error } = await query.range(
    (page - 1) * size,
    page * size - 1,
  )

  const totalCount = count ?? 0
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * size + 1
  const rangeEnd = totalCount === 0 ? 0 : (page - 1) * size + (data?.length ?? 0)

  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams()
    const current: Record<string, string | null> = {
      zus: zusSelected.length > 0 ? zusSelected.join(',') : null,
      obyw: obywSelected.length > 0 ? obywSelected.join(',') : null,
      status: statusSelected.length > 0 ? statusSelected.join(',') : null,
      pkd,
      q: q || null,
      page: page > 1 ? String(page) : null,
      size: size !== DEFAULT_SIZE ? String(size) : null,
    }
    const merged = { ...current, ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v)
    }
    const s = params.toString()
    return s ? `/fba/leidy?${s}` : '/fba/leidy'
  }

  function zusToggleHref(id: string) {
    const next = toggleMulti(zusSelected, id)
    return buildHref({ zus: next.length > 0 ? next.join(',') : null, page: null })
  }

  function obywToggleHref(id: string) {
    const next = toggleMulti(obywSelected, id)
    return buildHref({ obyw: next.length > 0 ? next.join(',') : null, page: null })
  }

  function statusToggleHref(id: string) {
    const next = toggleMulti(statusSelected, id)
    return buildHref({ status: next.length > 0 ? next.join(',') : null, page: null })
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Leidy"
        breadcrumbs={[{ label: 'FBA' }, { label: 'Leidy' }]}
      />
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <span className="text-sm text-muted-foreground">ZUS:</span>
        <Button size="sm" variant={zusSelected.length === 0 ? 'default' : 'outline'} asChild>
          <Link href={buildHref({ zus: null, page: null })}>Wszyscy</Link>
        </Button>
        {ZUS_OPTIONS.map((o) => (
          <Button key={o.id} size="sm" variant={zusSelected.includes(o.id) ? 'default' : 'outline'} asChild>
            <Link href={zusToggleHref(o.id)}>{o.label}</Link>
          </Button>
        ))}
        <span className="ml-2 border-l pl-2 text-sm text-muted-foreground">Kraj:</span>
        <Button size="sm" variant={obywSelected.length === 0 ? 'default' : 'outline'} asChild>
          <Link href={buildHref({ obyw: null, page: null })}>Wszyscy</Link>
        </Button>
        {OBYW_OPTIONS.map((o) => (
          <Button key={o.id} size="sm" variant={obywSelected.includes(o.id) ? 'default' : 'outline'} asChild>
            <Link href={obywToggleHref(o.id)}>{o.label}</Link>
          </Button>
        ))}
        <span className="ml-2 border-l pl-2 text-sm text-muted-foreground">Status:</span>
        <Button size="sm" variant={statusSelected.length === 0 ? 'default' : 'outline'} asChild>
          <Link href={buildHref({ status: null, page: null })}>Wszystkie</Link>
        </Button>
        {STATUS_OPTIONS.map((o) => (
          <Button key={o.id} size="sm" variant={statusSelected.includes(o.id) ? 'default' : 'outline'} asChild>
            <Link href={statusToggleHref(o.id)}>{o.label}</Link>
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {rangeStart}–{rangeEnd} z {totalCount}
        </span>
      </div>
      {error ? (
        <div className="p-6">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Błąd ładowania leidów</p>
            <p className="mt-1 text-xs opacity-80">{error.message}</p>
          </div>
        </div>
      ) : (
        <LeidyTable
          rows={(data ?? []) as LeidRow[]}
          rowCount={totalCount}
        />
      )}
    </div>
  )
}
