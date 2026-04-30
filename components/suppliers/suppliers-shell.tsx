'use client'

// components/suppliers/suppliers-shell.tsx
// Sprint S4 Phase 5B — list+detail layout dla /suppliers (50/50).
// Left: lista dostawców z search + meta. Right: detail panel.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { AccordionSection } from '@/components/clients/accordion-section'
import type { Supplier, Product } from '@/lib/types'

interface Props {
  suppliers: Supplier[]
  productCounts: Record<string, number>
  productsBySupplier: Record<string, Product[]>
}

const TYPE_LABEL: Record<string, string> = {
  producent: 'Producent',
  trader: 'Trader',
  posrednik: 'Pośrednik',
  wlasna_marka: 'Własna marka',
}

const DEAL_TYPE_LABEL: Record<string, string> = {
  reseller: 'Reseller',
  agent: 'Agent',
  partner: 'Partner',
}

export function SuppliersShell({ suppliers, productCounts, productsBySupplier }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const selectedId = params.get('id')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers
    const q = search.trim().toLowerCase()
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.legal_name ?? '').toLowerCase().includes(q) ||
        (s.nip ?? '').includes(q),
    )
  }, [suppliers, search])

  const selected = selectedId ? suppliers.find((s) => s.id === selectedId) ?? null : null

  function selectSupplier(id: string) {
    const next = new URLSearchParams(params)
    next.set('id', id)
    router.replace(`/suppliers?${next.toString()}`, { scroll: false })
  }

  return (
    <ResizablePanelGroup direction="horizontal" autoSaveId="sztab_suppliers_split">
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#888]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj dostawcy, NIP…"
              className="h-9 pl-9"
            />
          </div>

          <div className="flex-1 overflow-auto rounded-lg border border-[#E5E1D8] bg-white">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#888]">
                Brak dostawców{search ? ` dla "${search}"` : ''}.
              </div>
            ) : (
              <ul className="divide-y divide-[#F0EDE5]">
                {filtered.map((s) => {
                  const isSel = s.id === selectedId
                  const count = productCounts[s.id] ?? 0
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => selectSupplier(s.id)}
                        className={`flex w-full flex-col gap-1 border-l-2 px-4 py-3 text-left hover:bg-[#FAFAF7] ${
                          isSel ? 'border-l-[#4F46E5] bg-[#EEEDFE]' : 'border-l-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[14px] font-medium">{s.name}</span>
                          <span className="font-mono text-[11px] text-[#888]">{count} SKU</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                          {s.type && (
                            <Badge variant="outline" className="border-[#E5E1D8] bg-[#FAFAF7] text-[10px]">
                              {TYPE_LABEL[s.type] ?? s.type}
                            </Badge>
                          )}
                          {s.deal_type && (
                            <Badge variant="outline" className="border-[#E5E1D8] bg-[#FAFAF7] text-[10px]">
                              {DEAL_TYPE_LABEL[s.deal_type] ?? s.deal_type}
                            </Badge>
                          )}
                          {(s.verticals ?? []).slice(0, 2).map((v) => (
                            <Badge key={v} variant="outline" className="border-[#E5E1D8] bg-white text-[10px]">
                              {v}
                            </Badge>
                          ))}
                          {(s.verticals?.length ?? 0) > 2 && (
                            <span className="text-[10px] text-[#888]">+{(s.verticals?.length ?? 0) - 2}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="flex h-full flex-col gap-3 overflow-auto p-4">
          {selected ? (
            <SupplierDetail
              supplier={selected}
              products={productsBySupplier[selected.id] ?? []}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#E5E1D8] bg-white p-8 text-center">
              <p className="text-[13px] text-[#888]">Wybierz dostawcę z listy</p>
            </div>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function SupplierDetail({ supplier, products }: { supplier: Supplier; products: Product[] }) {
  const updatedAt = supplier.updated_at
    ? new Date(supplier.updated_at).toLocaleDateString('pl-PL')
    : '—'
  return (
    <>
      <div className="rounded-lg border border-[#E5E1D8] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-medium leading-tight">{supplier.name}</h2>
            {supplier.legal_name && (
              <div className="mt-0.5 text-[12px] text-[#888]">{supplier.legal_name}</div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {supplier.type && (
                <Badge variant="outline" className="border-[#E5E1D8] bg-[#FAFAF7] text-[11px]">
                  {TYPE_LABEL[supplier.type] ?? supplier.type}
                </Badge>
              )}
              {supplier.deal_type && (
                <Badge variant="outline" className="border-[#4F46E5]/30 bg-[#EEEDFE] text-[11px] text-[#3730A3]">
                  {DEAL_TYPE_LABEL[supplier.deal_type] ?? supplier.deal_type}
                </Badge>
              )}
              {(supplier.verticals ?? []).map((v) => (
                <Badge key={v} variant="outline" className="border-[#E5E1D8] bg-white text-[11px]">
                  {v}
                </Badge>
              ))}
              {supplier.nip && (
                <span className="font-mono text-[11px] text-[#888]">NIP {supplier.nip}</span>
              )}
            </div>
          </div>
          <Link
            href={`/suppliers/${supplier.id}/edit`}
            className="text-[12px] text-[#4F46E5] hover:underline whitespace-nowrap"
          >
            Edytuj →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="Produkty" value={String(products.length)} />
        <MetricCard
          label="Commission"
          value={supplier.commission_pct !== null ? `${supplier.commission_pct}%` : '—'}
        />
        <MetricCard
          label="Lead time"
          value={supplier.lead_time_days !== null ? `${supplier.lead_time_days} dni` : '—'}
        />
        <MetricCard label="Ostatnia aktualizacja" value={updatedAt} />
      </div>

      <AccordionSection
        title="Linked produkty"
        meta={`${products.length} SKU`}
        defaultOpen
      >
        {products.length === 0 ? (
          <p className="text-[12px] text-[#888]">Brak produktów dla tego dostawcy.</p>
        ) : (
          <ul className="divide-y divide-[#F0EDE5]">
            {products.slice(0, 20).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <Link href={`/produkty?sku=${p.id}`} className="flex-1 truncate hover:underline">
                  {p.name}
                </Link>
                {p.cost_eur !== null && (
                  <span className="font-mono text-[11px] text-[#888]">
                    {p.cost_eur?.toFixed(2)} €
                  </span>
                )}
              </li>
            ))}
            {products.length > 20 && (
              <li className="py-2 text-center text-[11px] text-[#888]">
                +{products.length - 20} więcej…
              </li>
            )}
          </ul>
        )}
      </AccordionSection>

      <AccordionSection
        title="Historia współpracy"
        meta={supplier.payment_terms ?? 'Brak danych'}
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Payment terms</dt>
            <dd>{supplier.payment_terms ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">MOQ value</dt>
            <dd>{supplier.moq_value !== null ? `${supplier.moq_value}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Reliability</dt>
            <dd>{supplier.reliability_score !== null ? `${supplier.reliability_score}/100` : '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Exclusive until</dt>
            <dd>{supplier.exclusive_until ?? '—'}</dd>
          </div>
        </dl>
      </AccordionSection>

      <AccordionSection
        title="Notatki"
        meta={supplier.notes ? `${supplier.notes.slice(0, 40)}…` : 'Brak'}
      >
        <p className="whitespace-pre-line text-[13px] text-[#555]">
          {supplier.notes ?? 'Brak notatek dla tego dostawcy.'}
        </p>
      </AccordionSection>
    </>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[#888]">{label}</div>
      <div className="mt-1 text-[14px] font-medium">{value}</div>
    </div>
  )
}
