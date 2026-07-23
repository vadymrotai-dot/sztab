'use client'

import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

const PKD_LABELS: Record<string, string> = {
  '6201Z': '💻 Programista',
  '6201A': '💻 Programista',
  '6201B': '💻 Programista',
  '6202Z': '🖥️ Konsultant IT',
  '6220B': '🖥️ Konsultant IT',
  '6209Z': '⚙️ IT inne',
  '6311Z': '🗄️ Hosting/DevOps',
  '6312Z': '🌐 Web/Portal',
  '7410Z': '🎨 Designer',
  '7411Z': '🎨 Grafik',
  '7412Z': '📐 Design wizualny',
  '7420Z': '📷 Fotograf',
  '7311Z': '📣 Marketing/SMM',
  '7320Z': '📊 Badania rynku',
  '7430Z': '🌍 Tłumacz',
  '9003Z': '✍️ Copywriter',
  '9011Z': '✍️ Twórca treści',
  '5911Z': '🎬 Video/Film',
  '5912Z': '✂️ Montaż video',
  '5610A': '🍽️ Restauracja',
  '5610B': '🚚 Gastronomia ruchoma',
  '5621Z': '🍱 Catering',
  '5629Z': '🍴 Gastronomia',
  '5630Z': '☕ Napoje/Bar',
  '4711Z': '🛒 Sklep spożywczy',
  '4725Z': '🍷 Napoje hurt',
  '1071Z': '🥖 Pieczywo',
  '1083Z': '☕ Kawa/Herbata',
  '4781Z': '🏪 Handel',
  '9329B': '🎯 Rozrywka',
  '7022Z': '💼 Konsulting biznesowy',
  '8559B': '🎓 Coaching/Szkolenia',
  '1085Z': '🍲 Produkcja dań gotowych',
  '2222Z': '📦 Produkcja opakowań',
  '4332Z': '🔨 Roboty stolarskie',
  '4520Z': '🚗 Naprawa pojazdów',
  '4642Z': '👗 Hurt odzież',
  '4724Z': '🥐 Hurt pieczywo',
  '4799Z': '🛍️ Sprzedaż pozasklepowa',
  '6831Z': '🏠 Pośrednik nieruchomości',
  '8211Z': '📋 Usługi biurowe',
}

const OBYW_FLAG: Record<string, string> = {
  PL: '🇵🇱',
  UA: '🇺🇦',
  BY: '🇧🇾',
  IN: '🇮🇳',
  RU: '🇷🇺',
  GE: '🇬🇪',
  VN: '🇻🇳',
}

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'Nowe' },
  { value: 'SENT', label: 'Wysłane' },
  { value: 'REPLIED', label: 'Odpowiedź' },
  { value: 'CONVERTED', label: 'Konwersja' },
  { value: 'REJECTED', label: 'Odrzucone' },
]

// ── Boczny panel opracowania leida ────────────────────────────────────────

interface LeidPanelProps {
  row: LeidRow | null
  open: boolean
  onClose: () => void
  onStatusChange: (id: string, status: string) => void
  onSendToFba: (id: string) => void
}

function LeidPanel({ row, open, onClose, onStatusChange, onSendToFba }: LeidPanelProps) {
  if (!row) return null
  const zus = row.zus_segment ?? 'UNKNOWN'
  const st = row.outreach_status ?? 'NEW'
  const flag = OBYW_FLAG[row.obywatelstwo ?? ''] ?? row.obywatelstwo ?? '—'
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base leading-tight">{row.name}</SheetTitle>
          <SheetDescription className="text-xs">{row.owner_name ?? '—'}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {/* Podstawowe dane */}
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Miasto</span>
              <span>{row.miejscowosc ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Branża</span>
              <div className="text-right">
                <div className="text-sm">
                  {(() => {
                    const code = row.source_pkd ?? row.pkd_main ?? null
                    return code ? (PKD_LABELS[code] ?? code) : '—'
                  })()}
                </div>
                {(() => {
                  const code = row.source_pkd ?? row.pkd_main ?? null
                  return code && !PKD_LABELS[code]
                    ? <div className="font-mono text-xs text-muted-foreground">{code}</div>
                    : null
                })()}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Od</span>
              <span>{row.data_rozpoczecia?.slice(0, 7) ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kraj</span>
              <span>{flag}</span>
            </div>
          </div>
          {/* ZUS segment */}
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1">ZUS segment</div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ZUS_COLORS[zus] ?? ZUS_COLORS.UNKNOWN}`}>
              {zus}
            </span>
          </div>
          {/* Kontakty */}
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="text-xs text-muted-foreground mb-1">Kontakt</div>
            {row.email ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Email</span>
                <a href={`mailto:${row.email}`} className="text-emerald-600 hover:underline text-xs truncate">
                  {row.email}
                </a>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Brak emaila</div>
            )}
            {row.telefon && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Tel</span>
                <a href={`tel:${row.telefon}`} className="text-emerald-600 hover:underline text-xs">
                  {row.telefon}
                </a>
              </div>
            )}
          </div>
          {/* Zmiana statusu */}
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-2">Status outreach</div>
            <Select
              defaultValue={st}
              onValueChange={(val) => onStatusChange(row.id, val)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Akcje */}
          <div className="space-y-2">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
              onClick={() => onSendToFba(row.id)}
              disabled={row.outreach_status === 'CONVERTED'}
            >
              📤 Przekaż do FBA
            </Button>
            <Button variant="outline" className="w-full" size="sm" onClick={onClose}>
              Zamknij
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Główna tabela ──────────────────────────────────────────────────────────

interface LeidyTableProps {
  rows: LeidRow[]
  rowCount: number
}

export function LeidyTable({ rows, rowCount }: LeidyTableProps) {
  const [selectedRow, setSelectedRow] = useState<LeidRow | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [localRows, setLocalRows] = useState<LeidRow[]>(rows)

  function handleRowClick(row: LeidRow) {
    setSelectedRow(row)
    setPanelOpen(true)
  }

  function handleClose() {
    setPanelOpen(false)
    setTimeout(() => setSelectedRow(null), 300)
  }

  async function handleStatusChange(id: string, status: string) {
    setLocalRows(prev => prev.map(r => r.id === id ? { ...r, outreach_status: status } : r))
    if (selectedRow?.id === id) {
      setSelectedRow(prev => prev ? { ...prev, outreach_status: status } : prev)
    }
    try {
      await fetch('/api/fba/leidy/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, outreach_status: status }),
      })
    } catch (e) {
      console.error('Status update failed', e)
    }
  }

  async function handleSendToFba(id: string) {
    setLocalRows(prev => prev.map(r => r.id === id ? { ...r, outreach_status: 'CONVERTED' } : r))
    if (selectedRow?.id === id) {
      setSelectedRow(prev => prev ? { ...prev, outreach_status: 'CONVERTED' } : prev)
    }
    try {
      await fetch('/api/fba/leidy/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, outreach_status: 'CONVERTED', sent_to_fba_at: new Date().toISOString() }),
      })
    } catch (e) {
      console.error('Send to FBA failed', e)
    }
    handleClose()
  }

  const columns: ColumnDef<LeidRow>[] = [
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
      cell: ({ row }) => <span className="text-sm">{row.original.miejscowosc ?? '—'}</span>,
    },
    {
      accessorKey: 'source_pkd',
      header: 'Branża',
      cell: ({ row }) => {
        const code = row.original.source_pkd ?? row.original.pkd_main ?? null
        const label = code ? (PKD_LABELS[code] ?? code) : '—'
        return (
          <div>
            <div className="text-sm">{label}</div>
            {code && !PKD_LABELS[code] && (
              <div className="font-mono text-xs text-muted-foreground">{code}</div>
            )}
          </div>
        )
      },
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
        return <span className="text-sm" title={o}>{OBYW_FLAG[o] ?? o}</span>
      },
    },
    {
      accessorKey: 'outreach_status',
      header: 'Status',
      cell: ({ row }) => {
        const r = localRows.find(lr => lr.id === row.original.id) ?? row.original
        const st = r.outreach_status ?? 'NEW'
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
          {row.original.email
            ? <span className="text-emerald-600">✓ email</span>
            : <span className="text-muted-foreground">—</span>
          }
          {row.original.telefon && <span className="ml-1 text-emerald-600">✓ tel</span>}
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        data={localRows}
        rowCount={rowCount}
        onRowClick={handleRowClick}
      />
      <LeidPanel
        row={selectedRow}
        open={panelOpen}
        onClose={handleClose}
        onStatusChange={handleStatusChange}
        onSendToFba={handleSendToFba}
      />
    </>
  )
}
