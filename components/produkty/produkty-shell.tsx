'use client'

// components/produkty/produkty-shell.tsx
// Sprint S4 Phase 5A — list+detail layout dla /produkty.
// Left: hierarchical accordion (Dostawca → Kategoria → SKU) z search.
// Right: detail panel з header + metric strip + accordion sections.
// Resizable handle persists wybrany split via autoSaveId localStorage.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  SearchIcon,
  PlusIcon,
  UploadIcon,
  SparklesIcon,
  Loader2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { AccordionSection } from '@/components/clients/accordion-section'
import {
  ProductAnalysisSection,
  type ProductBusinessProfile,
} from '@/components/produkty/product-analysis-section'
import { ProductMatchesSection } from '@/components/produkty/product-matches-section'
import { formatCnCode } from '@/lib/format/cn-code'
import type { Product, Supplier } from '@/lib/types'

interface Props {
  products: Product[]
  suppliers: Supplier[]
}

type GroupBy = 'dostawca' | 'kategoria'

function fmtPrice(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toFixed(2)} ${currency}`
}

export function ProduktyShell({ products, suppliers }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const selectedId = params.get('sku')
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('dostawca')

  const supplierById = useMemo(() => {
    const m = new Map<string, Supplier>()
    for (const s of suppliers) m.set(s.id, s)
    return m
  }, [suppliers])

  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.trim().toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.ean ?? '').toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q),
    )
  }, [products, search])

  // Group hierarchically
  const groups = useMemo(() => {
    const tree = new Map<string, Map<string, Product[]>>()
    for (const p of filtered) {
      const topKey =
        groupBy === 'dostawca'
          ? supplierById.get(p.supplier_id ?? '')?.name ?? 'Bez dostawcy'
          : p.category ?? 'Bez kategorii'
      const subKey =
        groupBy === 'dostawca'
          ? p.category ?? 'Bez kategorii'
          : supplierById.get(p.supplier_id ?? '')?.name ?? 'Bez dostawcy'
      if (!tree.has(topKey)) tree.set(topKey, new Map())
      const sub = tree.get(topKey)!
      if (!sub.has(subKey)) sub.set(subKey, [])
      sub.get(subKey)!.push(p)
    }
    return tree
  }, [filtered, groupBy, supplierById])

  const selected = selectedId ? products.find((p) => p.id === selectedId) ?? null : null
  const selectedSupplier = selected?.supplier_id ? supplierById.get(selected.supplier_id) ?? null : null

  function selectSku(id: string) {
    const next = new URLSearchParams(params)
    next.set('sku', id)
    router.replace(`/produkty?${next.toString()}`, { scroll: false })
  }

  return (
    <ResizablePanelGroup direction="horizontal" autoSaveId="sztab_produkty_split">
      <ResizablePanel defaultSize={60} minSize={30}>
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#888]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj SKU, EAN, kategorii…"
                className="h-9 pl-9"
              />
            </div>
            <div className="inline-flex rounded-md border border-[#E5E1D8] bg-white p-0.5">
              {(['dostawca', 'kategoria'] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g)}
                  className={`rounded px-2.5 py-1 text-[12px] capitalize ${
                    groupBy === g ? 'bg-[#EEEDFE] text-[#3730A3]' : 'text-[#555] hover:bg-[#FAFAF7]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto rounded-lg border border-[#E5E1D8] bg-white">
            {groups.size === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#888]">
                Brak wyników{search ? ` dla "${search}"` : ''}.
              </div>
            ) : (
              Array.from(groups.entries()).map(([topKey, sub]) => {
                const topCount = Array.from(sub.values()).reduce((a, arr) => a + arr.length, 0)
                return (
                  <details key={topKey} open className="group border-b border-[#F0EDE5] last:border-b-0">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 hover:bg-[#FAFAF7]">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="size-3.5 text-[#888] transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="truncate text-[14px] font-medium">{topKey}</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#888]">{topCount}</span>
                    </summary>
                    <div className="border-t border-[#F0EDE5]">
                      {Array.from(sub.entries()).map(([subKey, items]) => (
                        <details key={subKey} open className="group/sub border-b border-[#F0EDE5] last:border-b-0">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-[#FAFAF7] px-6 py-1.5 hover:bg-[#F4F2EB]">
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className="size-3 text-[#888] transition-transform group-open/sub:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span className="truncate text-[12px] text-[#555]">{subKey}</span>
                            </div>
                            <span className="font-mono text-[10px] text-[#888]">{items.length}</span>
                          </summary>
                          <ul>
                            {items.map((p) => {
                              const isSel = p.id === selectedId
                              return (
                                <li key={p.id}>
                                  <button
                                    type="button"
                                    onClick={() => selectSku(p.id)}
                                    className={`flex w-full items-center gap-3 border-l-2 px-8 py-2 text-left text-[13px] hover:bg-[#FAFAF7] ${
                                      isSel
                                        ? 'border-l-[#4F46E5] bg-[#EEEDFE]'
                                        : 'border-l-transparent'
                                    }`}
                                  >
                                    <span className="flex-1 truncate">{p.name}</span>
                                    {p.hygiene_status === 'CLEAN' && (
                                      <Badge variant="outline" className="border-[#00A656]/30 bg-[#F0FDF4] text-[10px] text-[#065F46]">
                                        CLEAN
                                      </Badge>
                                    )}
                                    {p.cn_code_review_pending && (
                                      <Badge
                                        variant="outline"
                                        title="AI-suggested CN code, потрібен manual review"
                                        className="border-amber-300 bg-amber-50 text-[10px] text-amber-700"
                                      >
                                        🔍 Review CN
                                      </Badge>
                                    )}
                                    {p.cost_eur !== null && (
                                      <span className="font-mono text-[11px] text-[#888]">
                                        {p.cost_eur?.toFixed(2)} €
                                      </span>
                                    )}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </details>
                      ))}
                    </div>
                  </details>
                )
              })
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={40} minSize={25}>
        <div className="flex h-full flex-col gap-3 overflow-auto p-4">
          {selected ? (
            <ProductDetail product={selected} supplier={selectedSupplier} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#E5E1D8] bg-white p-8 text-center">
              <p className="text-[13px] text-[#888]">Wybierz produkt z listy</p>
            </div>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function ProductDetail({ product, supplier }: { product: Product; supplier: Supplier | null }) {
  // Sprint S-CORE.3.A α' — "Analiza produktu" CTA + ProductAnalysisSection.
  const router = useRouter()
  const [analyzing, setAnalyzing] = useState(false)

  // products.business_profile JSONB (per migration 057) — read-only тут.
  // Product type у lib/types ще може не мати поля — cast щоб уникнути TS error.
  const businessProfile =
    (product as Product & { business_profile?: ProductBusinessProfile | null })
      .business_profile ?? null

  async function handleAnalyzeProduct() {
    if (analyzing) return
    setAnalyzing(true)
    const toastId = toast.loading('Trwa analiza produktu (~30-60s)…')
    try {
      const res = await fetch(`/api/products/${product.id}/full-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = (await res.json()) as {
        ok: boolean
        error?: string
        cost_usd?: number
      }
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? `Błąd HTTP ${res.status}`, { id: toastId })
        return
      }
      const costMsg = json.cost_usd
        ? ` (cost $${json.cost_usd.toFixed(4)})`
        : ''
      toast.success(`Analiza zakończona${costMsg}`, { id: toastId })
      router.refresh()
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Błąd sieci',
        { id: toastId },
      )
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="rounded-lg border border-[#E5E1D8] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-medium leading-tight">{product.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
              {product.hygiene_status === 'CLEAN' && (
                <Badge variant="outline" className="border-[#00A656]/30 bg-[#F0FDF4] text-[#065F46]">
                  CLEAN
                </Badge>
              )}
              {product.category && <span className="text-[#888]">{product.category}</span>}
              {product.ean && <span className="font-mono text-[#888]">EAN {product.ean}</span>}
              {product.cn_code && (
                <span
                  className="font-mono text-[#888]"
                  title={
                    product.cn_code_review_pending
                      ? 'AI-suggested, потрібен review'
                      : 'CN code (Combined Nomenclature)'
                  }
                >
                  CN {formatCnCode(product.cn_code)}
                  {product.cn_code_review_pending && (
                    <span className="ml-1 text-amber-600">🔍</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              size="sm"
              onClick={handleAnalyzeProduct}
              disabled={analyzing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {analyzing ? (
                <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="mr-1.5 size-3.5" />
              )}
              {analyzing ? 'Analiza w toku…' : 'Analiza produktu'}
            </Button>
            {supplier && (
              <Link
                href={`/suppliers?id=${supplier.id}`}
                className="text-[12px] text-[#4F46E5] hover:underline whitespace-nowrap"
              >
                Dostawca: {supplier.name} →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Pending banner — shows during analyzing run */}
      {analyzing && (
        <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-[12px] leading-snug text-purple-900">
          <strong className="font-medium">Trwa w tle (~30-60s).</strong>{' '}
          Claude Sonnet 4.6 generuje strategię sprzedaży per segment + pitch
          + następne kroki. Strona odświeży się po zakończeniu.
        </div>
      )}

      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="Koszt EUR" value={fmtPrice(product.cost_eur, 'EUR')} />
        <MetricCard label="Koszt PLN" value={fmtPrice(product.cost_pln, 'PLN')} />
        <MetricCard label="Cena mały" value={fmtPrice(product.price_maly_opt, 'PLN')} />
        <MetricCard label="Cena duży" value={fmtPrice(product.price_duzy, 'PLN')} />
      </div>

      <AccordionSection title="Atrybuty" defaultOpen meta={`${[product.gramatura, product.unit, product.brand].filter(Boolean).length} pól`}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Gramatura</dt>
            <dd>{product.gramatura ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Jednostka</dt>
            <dd>{product.unit ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">EAN</dt>
            <dd className="font-mono text-[12px]">{product.ean ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Marka</dt>
            <dd>{product.brand ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">VAT</dt>
            <dd>{product.vat_rate}%</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Push tier</dt>
            <dd>{product.push_tier ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Vertical</dt>
            <dd>{product.vertical ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[#888]">Hygiene</dt>
            <dd>{product.hygiene_status ?? '—'}</dd>
          </div>
        </dl>
      </AccordionSection>

      <AccordionSection
        title="Analiza biznesowa (AI)"
        meta={
          businessProfile?.analyzed_at
            ? `${new Date(businessProfile.analyzed_at).toLocaleDateString('pl-PL')} · ${businessProfile.model_used ?? ''}`
            : 'Brak analizy'
        }
        defaultOpen={Boolean(businessProfile)}
      >
        <ProductAnalysisSection productId={product.id} profile={businessProfile} />
      </AccordionSection>

      <AccordionSection title="Pozycje katalogu" meta="0 pozycji" detailHref={`/products`}>
        <p className="text-[12px] text-[#888]">
          Powiązanie SKU ze stronami katalogu — Sprint S5.
        </p>
      </AccordionSection>

      <AccordionSection title="Historia cen" meta="—">
        <p className="text-[12px] text-[#888]">
          Audit trail zmian cen — Sprint S5.
        </p>
      </AccordionSection>

      <AccordionSection
        title="TOP 25 dopasowanych klientów (algo + AI)"
        defaultOpen
        meta="Iteracyjne — Zkontaktowano wyklucza z następnej listy"
        detailHref={`/matches?product_id=${product.id}`}
      >
        <ProductMatchesSection productId={product.id} />
      </AccordionSection>
    </>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[#888]">{label}</div>
      <div className="mt-1 font-mono text-[14px] font-medium">{value}</div>
    </div>
  )
}

export function ProduktyTopBar({ onAddProduct, onImportPricelist }: { onAddProduct?: () => void; onImportPricelist?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={onAddProduct}>
        <PlusIcon className="mr-1.5 size-3.5" />
        Dodaj produkt
      </Button>
      <Button size="sm" variant="outline" onClick={onImportPricelist}>
        <UploadIcon className="mr-1.5 size-3.5" />
        Importuj cennik
      </Button>
    </div>
  )
}
