'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
import { CLIENT_SEGMENTS } from '@/lib/types'
import { SearchIcon, MoreHorizontalIcon, PencilIcon, TrashIcon, EyeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientsContentProps {
  clients: Client[]
}

const segmentColors: Record<string, string> = {
  maly: 'bg-slate-500',
  sredni: 'bg-blue-500',
  duzy: 'bg-green-500',
  niesklasyfikowany: 'bg-gray-400',
}

const statusColors: Record<string, string> = {
  nowy: 'bg-blue-500',
  aktywny: 'bg-green-500',
  nieaktywny: 'bg-gray-400',
}

export function ClientsContent({ clients: initialClients }: ClientsContentProps) {
  const [clients, setClients] = useState(initialClients)
  const [search, setSearch] = useState('')
  const [segmentFilter, setSegmentFilter] = useState<string>('all')
  const router = useRouter()
  const supabase = createClient()

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.title.toLowerCase().includes(search.toLowerCase()) ||
      client.city?.toLowerCase().includes(search.toLowerCase()) ||
      client.nip?.includes(search)
    const matchesSegment = segmentFilter === 'all' || client.segment === segmentFilter
    return matchesSearch && matchesSegment
  })

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac tego klienta?')) return

    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (!error) {
      setClients(clients.filter((c) => c.id !== id))
      router.refresh()
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj klienta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={segmentFilter} onValueChange={setSegmentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Segment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie segmenty</SelectItem>
            {CLIENT_SEGMENTS.map((segment) => (
              <SelectItem key={segment.value} value={segment.value}>
                {segment.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>NIP</TableHead>
              <TableHead>Miasto</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Brak klientow do wyswietlenia
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    <Link href={`/clients/${client.id}`} className="hover:underline">
                      {client.title}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{client.nip || '-'}</TableCell>
                  <TableCell>{client.city || '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn('text-white', segmentColors[client.segment])}
                    >
                      {client.segment}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn('text-white', statusColors[client.status])}
                    >
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/clients/${client.id}`}>
                            <EyeIcon className="mr-2 size-4" />
                            Zobacz
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/clients/${client.id}/edit`}>
                            <PencilIcon className="mr-2 size-4" />
                            Edytuj
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(client.id)}
                        >
                          <TrashIcon className="mr-2 size-4" />
                          Usun
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
