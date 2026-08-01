'use client'

// components/ceny/client-segments-editor.tsx
// Faza 1 DAGOLD — masowe przypisanie segmentu cenowego klientom.
// Reuse wzorca selekcji (Set<string>) + bulk-action z /clients.
// NULL segment renderowany jako "A — standardowa" (świadomy stan, nie brak danych).

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { assignSegmentToClients } from '@/app/actions/pricing-admin'

export interface ClientRow {
  id: string
  title: string
  nip: string | null
  city: string | null
  price_segment_code: string | null
}

export interface SegmentOption {
  code: string
  name: string
}

// Kod domyślny dla NULL (biznes: brak przypisania = segment A / standard).
const DEFAULT_CODE = 'A'
const UNASSIGNED = '__unassigned__'

export function ClientSegmentsEditor({
  clients,
  segments,
}: {
  clients: ClientRow[]
  segments: SegmentOption[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [segFilter, setSegFilter] = useState<string>('all') // all | <code> | __unassigned__
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<string>(
    segments[0]?.code ?? DEFAULT_CODE,
  )
  const [busy, setBusy] = useState(false)

  const nameOf = useMemo(() => {
    const m = new Map(segments.map((s) => [s.code, s.name]))
    return (code: string) => m.get(code) ?? ''
  }, [segments])

  // Liczniki per segment — NULL wpada do A.
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of segments) c[s.code] = 0
    for (const cl of clients) {
      const code = cl.price_segment_code ?? DEFAULT_CODE
      c[code] = (c[code] ?? 0) + 1
    }
    return c
  }, [clients, segments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (q) {
        const hay = `${c.title} ${c.nip ?? ''} ${c.city ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (segFilter === 'all') return true
      if (segFilter === UNASSIGNED) return c.price_segment_code == null
      return (c.price_segment_code ?? DEFAULT_CODE) === segFilter
    })
  }, [clients, search, segFilter])

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered])
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))
  const selectedCount = selected.size

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s)
      if (allFilteredSelected) filteredIds.forEach((id) => n.delete(id))
      else filteredIds.forEach((id) => n.add(id))
      return n
    })
  }

  async function apply(code: string | null) {
    if (selectedCount === 0) return
    setBusy(true)
    const res = await assignSegmentToClients(code, Array.from(selected))
    setBusy(false)
    if (!res.ok) {
      toast.error(`Nie zapisano: ${res.error}`)
      return
    }
    toast.success(
      code
        ? `Przypisano segment ${code} do ${res.updated} klientów`
        : `Wyczyszczono segment u ${res.updated} klientów (→ A / standard)`,
    )
    setSelected(new Set())
    router.refresh()
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Liczniki per segment */}
      <div className="flex flex-wrap gap-2">
        {segments.map((s) => (
          <span
            key={s.code}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E1D8] bg-white px-3 py-1 text-[12px]"
          >
            <span className="font-mono font-semibold">{s.code}</span>
            <span className="text-[#888]">
              {s.code === DEFAULT_CODE ? 'standard' : s.name}
            </span>
            <span className="font-semibold">{counts[s.code] ?? 0}</span>
          </span>
        ))}
      </div>

      {/* Filtry */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj firmy / NIP / miasta…"
          className="h-9 max-w-sm"
        />
        <Select value={segFilter} onValueChange={setSegFilter}>
          <SelectTrigger className="h-9 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie segmenty</SelectItem>
            <SelectItem value={UNASSIGNED}>Nieprzypisane (→ A)</SelectItem>
            {segments.map((s) => (
              <SelectItem key={s.code} value={s.code}>
                Segment {s.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[12px] text-[#888]">{filtered.length} klientów</span>
      </div>

      {/* Tabela */}
      <div className="overflow-auto rounded-lg border border-[#E5E1D8] bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-[#E5E1D8] bg-[#FAFAF7] text-left text-[11px] uppercase tracking-wider text-[#888]">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Zaznacz wszystkich"
                />
              </th>
              <th className="px-3 py-2 font-medium">Firma</th>
              <th className="px-3 py-2 font-medium">NIP / miasto</th>
              <th className="px-3 py-2 font-medium">Segment cenowy</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const isSel = selected.has(c.id)
              const effective = c.price_segment_code ?? DEFAULT_CODE
              return (
                <tr
                  key={c.id}
                  className={`border-b border-[#F0EDE5] last:border-b-0 hover:bg-[#FAFAF7] ${isSel ? 'bg-[#FAF6EC]' : ''}`}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggle(c.id)}
                      aria-label={`Zaznacz ${c.title}`}
                    />
                  </td>
                  <td className="px-3 py-2">{c.title}</td>
                  <td className="px-3 py-2 text-[#888]">
                    {c.nip ? <span className="font-mono">{c.nip}</span> : '—'}
                    {c.city ? ` · ${c.city}` : ''}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded bg-[#F0EDE5] px-1.5 py-0.5 font-mono font-semibold">
                        {effective}
                      </span>
                      <span className="text-[12px] text-[#888]">
                        {c.price_segment_code == null
                          ? 'standardowa (domyślnie)'
                          : nameOf(c.price_segment_code)}
                      </span>
                    </span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[#888]">
                  Brak klientów dla tego filtra.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-[#888]">
        Segment NULL = klient płaci cenę segmentu A (standardowa) — to poprawny,
        domyślny stan. Zniżki B/C liczą się dopiero po ustawieniu realnych % w
        zakładce Segmenty. Indywidualna zniżka pojedynczego klienta pozostaje na
        jego profilu.
      </p>

      {/* Sticky bulk-bar */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#333] bg-[#1F1D1A] px-4 py-3 text-white shadow-lg">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            <span className="text-[13px] font-medium">
              Zaznaczono: {selectedCount}
            </span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-[12px] text-white/60 underline hover:text-white/90"
            >
              wyczyść zaznaczenie
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-8 w-28 border-white/20 bg-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      Segment {s.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => apply(target)}
              >
                {busy ? 'Zapis…' : `Przypisz ${target} zaznaczonym (${selectedCount})`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                onClick={() => apply(null)}
              >
                Wyczyść segment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
