'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'

export interface LeidRow {
  id: string
  ceidg_id: string
  name: string
  owner_name: string | null
  miejscowosc: string | null
  pkd_main: string | null
  data_rozpoczecia: string | null
  zus_segment: string | null
  obywatelstwo: string | null
  fba_segment: string | null
  outreach_status: string | null
  email: string | null
  telefon: string | null
  source_pkd: string | null
}

const ZUS_COLORS: Record<string, string> = {
  PELNY: 'bg-red-100 text-red-800',
  MALY: 'bg-yellow-100 text-yellow-800',
  ULGA: 'bg-green-100 text-green-800',
  UNKNOWN: 'bg-gray-100 text-gray-600',
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  SENT: 'bg-purple-100 text-purple-800',
  REPLIED: 'bg-amber-100 text-amber-800',
  CONVERTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const OBYW_FLAG: Record<string, string> = {
  PL: '🇵🇱',
  UA: '🇺🇦',
  BY: '🇧🇾',
  IN: '🇮🇳',
  RU: '🇷🇺',
}

export const LEIDY_COLUMNS: ColumnDef<LeidRow>[] = [
  {
    accessorKey: 'name',
    header: 'Firma',
    cell: ({ row }) => (
      <div>
        <div className="font-medium text-sm">{row.original.name}</div>
        {row.original.owner_name && (
          <div className="text-xs text-muted-foreground">{row.original.owner_name}</div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'miejscowosc',
    header: 'Miasto',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.miejscowosc ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'source_pkd',
    header: 'PKD',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.source_pkd ?? row.original.pkd_main ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'data_rozpoczecia',
    header: 'Od',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.data_rozpoczecia?.slice(0, 7) ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'zus_segment',
    header: 'ZUS',
    cell: ({ row }) => {
      const seg = row.original.zus_segment ?? 'UNKNOWN'
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ZUS_COLORS[seg] ?? ZUS_COLORS.UNKNOWN}`}>
          {seg}
        </span>
      )
    },
  },
  {
    accessorKey: 'obywatelstwo',
    header: 'Kraj',
    cell: ({ row }) => {
      const o = row.original.obywatelstwo ?? 'PL'
      return (
        <span className="text-sm" title={o}>
          {OBYW_FLAG[o] ?? o}
        </span>
      )
    },
  },
  {
    accessorKey: 'outreach_status',
    header: 'Status',
    cell: ({ row }) => {
      const st = row.original.outreach_status ?? 'NEW'
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[st] ?? STATUS_COLORS.NEW}`}>
          {st}
        </span>
      )
    },
  },
  {
    accessorKey: 'email',
    header: 'Kontakt',
    cell: ({ row }) => (
      <div className="text-xs">
        {row.original.email ? (
          <span className="text-emerald-600">✓ email</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {row.original.telefon && (
          <span className="ml-1 text-emerald-600">✓ tel</span>
        )}
      </div>
    ),
  },
]

interface LeidyTableProps {
  rows: LeidRow[]
  rowCount: number
}

export function LeidyTable({ rows, rowCount }: LeidyTableProps) {
  return (
    <DataTable
      columns={LEIDY_COLUMNS}
      data={rows}
      rowCount={rowCount}
    />
  )
}
