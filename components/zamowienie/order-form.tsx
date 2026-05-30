// components/zamowienie/order-form.tsx
// Sprint S-ORDER.1.B.2 (19.05.2026) — public 5-step order wizard.
// Theme: navy #1F2B4A + amber #F59E0B + emerald #10B981 (tier upgraded).
// Mobile-first, max-w-md frame, sticky tier banner on step 2.

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Minus,
  Plus,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

// Sprint S-CENNIK-WH.1 (26.05.2026) — wielki_hurt 4-й tier (locked).
// Sprint S-CENNIK-WH.2 (26.05.2026) — wielki_hurt_entry 5-й tier (Hurt < 10k).
type StandardTier = 'maly' | 'sredni' | 'duzy'
type Tier = StandardTier | 'wielki_hurt' | 'wielki_hurt_entry'
type CennikTier = 'standard' | 'wielki_hurt'
type PriceMode = 'auto' | 'minimum'

const WH_HURT_THRESHOLD = 10000 // PLN netto — mirror lib/orders/tier-config.ts

type Product = {
  id: string
  name: string
  gramatura: string | null
  category: string | null
  // Sprint T-ORDER.4a-UI (30.05.2026) — 2-poziomowa hierarchia + in_stock + jednostka.
  grupa: string | null      // 'czudowa_marka' | 'owoce_morza' | NULL (legacy)
  podgrupa: string | null   // 'kiszonki' | 'surowki' | 'warzywa_gotowane' | 'kalmary' | 'filety_rybne' | NULL
  in_stock: boolean         // FALSE = niedostępny, wygaszony w UI, kontrolki disabled
  unit: string | null       // 'szt' (dziś wszystko); wyświetlane obok qty
  sort: number | null
  prices: {
    maly: number
    sredni: number
    duzy: number
    wielki_hurt: number
    // Sprint S-CENNIK-WH.2 — Hurt entry-tier (NULL if SKU не jest w WH cenniku Hurt)
    hurt_wh: number | null
  }
}

export type OrderInitial = {
  ok: true
  order: {
    id: string
    order_number: string
    contact_person: string | null
    contact_phone: string | null
    contact_email: string | null
    delivery_address: string | null
    preferred_delivery_date: string | null
    customer_notes: string | null
    // Sprint S-CENNIK-WH.1 — tier locked at offer-send.
    cennik_tier: CennikTier
    // Sprint S-CENNIK-WH.2 — price mode locked at offer-send (matrix 2x2)
    price_mode: PriceMode
  }
  client: {
    title: string
    nip: string
    city: string
    address: string
    email: string
    phone: string
  } | null
  products: Product[]
}

type SubmitOk = {
  ok: true
  order_number: string
  tier: Tier
  total_net: number
  total_vat: number
  total_brutto: number
}

const TIER_LABEL: Record<Tier, string> = {
  maly: 'Mały opt',
  sredni: 'Średni',
  duzy: 'Duży gracz',
  wielki_hurt: 'Wielki Hurt',
  wielki_hurt_entry: 'Hurt',
}

const TIER_NEXT_THRESHOLD: Record<StandardTier, number | null> = {
  maly: 2000,
  sredni: 4000,
  duzy: null,
}

// Sprint S-CENNIK-WH.2 — map TierAtSubmit (5 values) → Product.prices key (5 keys).
// Note: 'wielki_hurt_entry' tier reads price з 'hurt_wh' field (different naming).
function tierToPriceKey(t: Tier): keyof Product['prices'] {
  if (t === 'wielki_hurt_entry') return 'hurt_wh'
  return t
}

function fmt(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Sprint S-CENNIK-WH.2 — Matrix 2x2 (cennikTier × priceMode):
//   standard + auto    → iterate maly/sredni/duzy (calcTier z 2k/4k thresholds)
//   standard + minimum → locked 'duzy'
//   wielki_hurt + auto → 10k hurt nominal threshold: <10k 'wielki_hurt_entry', >=10k 'wielki_hurt'
//   wielki_hurt + min  → locked 'wielki_hurt'
function computeTierAndTotal(
  cart: Record<string, number>,
  products: Product[],
  cennikTier: CennikTier,
  priceMode: PriceMode,
): { tier: Tier; total: number; hurtNominal?: number } {
  const sumWith = (selector: (p: Product) => number | null): number =>
    Object.entries(cart).reduce((sum, [id, qty]) => {
      if (qty <= 0) return sum
      const p = products.find((pp) => pp.id === id)
      if (!p) return sum
      const price = selector(p)
      if (price == null) return sum
      return sum + qty * price
    }, 0)

  if (cennikTier === 'wielki_hurt' && priceMode === 'auto') {
    const hurtNominal = sumWith((p) => p.prices.hurt_wh)
    if (hurtNominal >= WH_HURT_THRESHOLD) {
      return { tier: 'wielki_hurt', total: sumWith((p) => p.prices.wielki_hurt), hurtNominal }
    }
    return { tier: 'wielki_hurt_entry', total: hurtNominal, hurtNominal }
  }
  if (cennikTier === 'wielki_hurt') {
    return { tier: 'wielki_hurt', total: sumWith((p) => p.prices.wielki_hurt) }
  }
  if (priceMode === 'minimum') {
    return { tier: 'duzy', total: sumWith((p) => p.prices.duzy) }
  }
  // standard + auto
  let tier: StandardTier = 'maly'
  let total = 0
  for (let i = 0; i < 4; i++) {
    total = sumWith((p) => p.prices[tier])
    const newTier: StandardTier =
      total < 2000 ? 'maly' : total <= 4000 ? 'sredni' : 'duzy'
    if (newTier === tier) return { tier, total }
    tier = newTier
  }
  return { tier, total }
}

export function OrderForm({
  token,
  initial,
}: {
  token: string
  initial: OrderInitial
}) {
  const { client, products } = initial
  // Sprint S-CENNIK-WH.1 — cennik_tier locked at offer-send.
  const cennikTier: CennikTier = initial.order.cennik_tier ?? 'standard'
  // Sprint S-CENNIK-WH.2 — price_mode locked at offer-send (matrix 2x2)
  const priceMode: PriceMode = initial.order.price_mode ?? 'auto'
  const isWielkiHurt = cennikTier === 'wielki_hurt'
  const isMinimum = priceMode === 'minimum'
  const isAutoStandard = cennikTier === 'standard' && priceMode === 'auto'
  const isAutoWH = cennikTier === 'wielki_hurt' && priceMode === 'auto'
  const clientName = client?.title ?? ''
  const firstWord = clientName.split(' ')[0] || 'Kliencie'

  // Sprint T-ORDER.4a-SHELL (30.05.2026) — przebudowa szkieletu pod wariant-A-final:
  // dwa stany zamiast 5-krokowego linearnego wizard.
  //   showWelcome=true (initial) → ekran Witaj z onboardingiem, po kliknięciu
  //     "Rozpocznij zamówienie" przechodzi do tabs.
  //   activeTab → po welcome, przełączanie "produkty"|"dostawa" tabs.
  //   submitResult !== null → ekran potwierdzenia (terminal state, zastępuje tabs).
  // Logika cen / submitOrder / cart / setQty BEZ ZMIAN.
  const [showWelcome, setShowWelcome] = useState(true)
  const [activeTab, setActiveTab] = useState<'produkty' | 'dostawa'>('produkty')
  const [cart, setCart] = useState<Record<string, number>>({})
  // Sprint T-ORDER.4a-SHELL — search query filtruje akordeon na żywo.
  const [searchQuery, setSearchQuery] = useState('')
  // Sprint T-ORDER.4a-SHELL — szablony klienta (lazy load on click).
  type Template = {
    id: string
    nazwa: string
    pozycje: Array<{ product_id: string; qty: number }>
    utworzyl: string
    created_at: string
  }
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [contactPerson, setContactPerson] = useState(initial.order.contact_person ?? '')
  const [contactPhone, setContactPhone] = useState(initial.order.contact_phone ?? client?.phone ?? '')
  const [contactEmail, setContactEmail] = useState(initial.order.contact_email ?? client?.email ?? '')
  const [deliveryAddress, setDeliveryAddress] = useState(
    initial.order.delivery_address ??
      [client?.address, client?.city].filter(Boolean).join(', '),
  )
  const [preferredDate, setPreferredDate] = useState<string>(initial.order.preferred_delivery_date ?? '')
  const [notes, setNotes] = useState(initial.order.customer_notes ?? '')
  const [termsAccepted, setTermsAccepted] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitOk | null>(null)

  const { tier, total, hurtNominal } = useMemo(
    () => computeTierAndTotal(cart, products, cennikTier, priceMode),
    [cart, products, cennikTier, priceMode],
  )
  const itemsCount = useMemo(
    () => Object.values(cart).reduce((s, q) => s + (q > 0 ? 1 : 0), 0),
    [cart],
  )
  const cartNotEmpty = itemsCount > 0
  // Sprint T-ORDER.4a-UI-FIX (30.05.2026) — suma kg w koszyku dla paska na dole.
  // gramatura jest TEXT free-form ("3000 g", "5000g / ~3000g", "1 kg") — bierzemy
  // PIERWSZĄ liczbę z stringa + heurystycznie zakładamy że gramy chyba że jest "kg".
  // Bezpieczny fallback dla NULL/parse fail → 0.
  const totalKg = useMemo(() => {
    let grams = 0
    for (const [pid, qty] of Object.entries(cart)) {
      if (qty <= 0) continue
      const p = products.find((pp) => pp.id === pid)
      if (!p || !p.gramatura) continue
      const m = p.gramatura.match(/(\d+(?:[.,]\d+)?)/)
      if (!m) continue
      const num = Number(m[1]!.replace(',', '.'))
      if (!Number.isFinite(num)) continue
      const isKg = /\bkg\b/i.test(p.gramatura)
      grams += qty * (isKg ? num * 1000 : num)
    }
    return grams / 1000
  }, [cart, products])

  // Sprint T-ORDER.4a-SHELL-FIX (30.05.2026) — przeniesione PRZED groupedHierarchy
  // bo TDZ: deps array [filteredProducts] w groupedHierarchy odwoływał się do
  // const filteredProducts deklarowanej dopiero ~L368 → ReferenceError runtime 500.
  // Sprint T-ORDER.4a-SHELL — filter products przez searchQuery (case-insensitive
  // match na p.name + p.gramatura). Pusty query → zwraca wszystkie products.
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      if (p.gramatura && p.gramatura.toLowerCase().includes(q)) return true
      return false
    })
  }, [products, searchQuery])

  // Sprint T-ORDER.4a-UI (30.05.2026) — 2-poziomowe grupowanie grupa → podgrupa.
  // Kolejność grup: czudowa_marka, owoce_morza, inne/null na końcu.
  // W obrębie podgrupy sort wg `sort` (= order_form_sort).
  const groupedHierarchy = useMemo(() => {
    type GroupedSub = { key: string; items: Product[] }
    type GroupedTop = { key: string; subs: GroupedSub[] }

    const tmp = new Map<string, Map<string, Product[]>>()
    // Sprint T-ORDER.4a-SHELL — używamy filteredProducts (po search) zamiast products,
    // żeby akordeon na żywo pokazywał tylko pasujące.
    for (const p of filteredProducts) {
      const g = p.grupa ?? '__inne__'
      const s = p.podgrupa ?? '__inne__'
      if (!tmp.has(g)) tmp.set(g, new Map())
      const subMap = tmp.get(g)!
      if (!subMap.has(s)) subMap.set(s, [])
      subMap.get(s)!.push(p)
    }
    // Sort items in each subgroup by `sort` then name
    for (const subMap of tmp.values()) {
      for (const arr of subMap.values()) {
        arr.sort((a, b) => {
          const sa = a.sort ?? 9999
          const sb = b.sort ?? 9999
          return sa - sb || a.name.localeCompare(b.name, 'pl')
        })
      }
    }

    const TOP_ORDER = ['czudowa_marka', 'owoce_morza']
    const result: GroupedTop[] = []
    // Najpierw grupy w fixed order
    for (const g of TOP_ORDER) {
      if (tmp.has(g)) {
        result.push({
          key: g,
          subs: [...tmp.get(g)!.entries()].map(([key, items]) => ({ key, items })),
        })
        tmp.delete(g)
      }
    }
    // Reszta (włącznie z __inne__) na końcu, posortowane alfabetycznie
    const rest = [...tmp.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    for (const [g, subMap] of rest) {
      result.push({
        key: g,
        subs: [...subMap.entries()].map(([key, items]) => ({ key, items })),
      })
    }
    return result
  }, [filteredProducts])

  // Sprint T-ORDER.4a-UI — etykiety PL dla grupa/podgrupa.
  const GRUPA_LABEL: Record<string, string> = {
    czudowa_marka: 'Czudowa Marka',
    owoce_morza: 'Owoce morza',
    __inne__: 'Inne',
  }
  const PODGRUPA_LABEL: Record<string, string> = {
    kiszonki: 'Kiszonki',
    surowki: 'Surówki',
    warzywa_gotowane: 'Warzywa gotowane',
    kalmary: 'Kalmary',
    filety_rybne: 'Filety rybne',
    __inne__: 'Inne',
  }
  // Sprint T-ORDER.4a-UI-FIX (30.05.2026) — badge marki obok nazwy grupy
  // w prototypowym wyglądzie. Czudowa Marka = partnerska, Owoce morza = Ziomek Fish własna.
  const BRAND_BADGE: Record<string, string> = {
    czudowa_marka: 'marka partnerska',
    owoce_morza: 'Ziomek Fish',
  }

  // Sprint T-ORDER.4a-UI — collapse state dla akordeonu (grupy + podgrupy).
  // Klucze: 'g:<grupa>' dla grupy, 's:<grupa>:<podgrupa>' dla podgrupy.
  // Domyślnie: wszystkie grupy rozwinięte + PIERWSZA podgrupa w każdej grupie
  // rozwinięta, reszta podgrup zwinięte (wariant-A-final z prototypu).
  const initialOpen = useMemo(() => {
    const open = new Set<string>()
    const isSearching = searchQuery.trim().length > 0
    for (const grp of groupedHierarchy) {
      open.add(`g:${grp.key}`)
      if (isSearching) {
        // Sprint T-ORDER.4a-SHELL — przy aktywnym search rozwijamy WSZYSTKIE
        // pasujące podgrupy żeby użytkownik widział trafienia bez klikania.
        for (const sub of grp.subs) {
          open.add(`s:${grp.key}:${sub.key}`)
        }
      } else if (grp.subs.length > 0) {
        open.add(`s:${grp.key}:${grp.subs[0]!.key}`)
      }
    }
    return open
  }, [groupedHierarchy, searchQuery])
  const [openKeys, setOpenKeys] = useState<Set<string>>(initialOpen)
  // Sync openKeys gdy hierarchia się zmieni (np. po pierwszym fetch albo po
  // zmianie tier który ukryje/odsłoni SKU). Pattern: trzymamy "initialized"
  // flag — pierwsza hydracja z initialOpen, po tym user-driven toggles
  // mają pierwszeństwo i nie nadpisujemy ich. Re-hydracja TYLKO gdy
  // openKeys stało się puste (np. SSR fallback).
  useEffect(() => {
    // Sprint T-ORDER.4a-SHELL — hydracja PRZY zmianie searchQuery (search → expand all,
    // wyczyść search → przywróć default expand). Bez search → tylko initial mount.
    if (searchQuery.trim().length > 0) {
      setOpenKeys(initialOpen)
    } else if (openKeys.size === 0 && initialOpen.size > 0) {
      setOpenKeys(initialOpen)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen])

  function toggleKey(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Sprint T-ORDER.4a-SHELL — wczytaj cart z listy {product_id, qty}.
  // Używane przez Powtórz zamówienie + Szablony. Pomija qty<=0.
  function fillCartFromList(list: Array<{ product_id: string; qty: number }>) {
    const next: Record<string, number> = {}
    for (const item of list) {
      if (item.qty <= 0) continue
      // Validate że product istnieje (filter list już to robi server-side,
      // ale defense-in-depth — jeśli admin usunął SKU między fetch i klik).
      const p = products.find((pp) => pp.id === item.product_id)
      if (!p) continue
      if (p.in_stock === false) continue
      next[item.product_id] = Math.min(9999, Math.max(1, Math.floor(item.qty)))
    }
    setCart(next)
  }

  // Sprint T-ORDER.4a-SHELL — Powtórz zamówienie: GET /api/orders/[token]/last
  async function handleRepeatOrder() {
    setActionError(null)
    setActionNotice(null)
    try {
      const res = await fetch(`/api/orders/${token}/last`, { method: 'GET' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? 'Nie udało się pobrać poprzedniego zamówienia.')
        return
      }
      if (!data.has_history) {
        setActionError('Brak wcześniejszych zamówień.')
        return
      }
      if (!data.items || data.items.length === 0) {
        setActionError('Wszystkie pozycje z poprzedniego zamówienia są obecnie niedostępne.')
        return
      }
      fillCartFromList(data.items)
      const msg =
        data.skipped > 0
          ? `Wypełniono z zamówienia ${data.source_order_number} (część pozycji niedostępna, pominięto ${data.skipped}).`
          : `Wypełniono z zamówienia ${data.source_order_number}.`
      setActionNotice(msg)
    } catch (e) {
      setActionError('Błąd sieci przy pobieraniu zamówienia.')
    }
  }

  // Sprint T-ORDER.4a-SHELL — Moje szablony: GET /api/orders/[token]/templates
  async function loadTemplates() {
    setTemplatesLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/orders/${token}/templates`, { method: 'GET' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? 'Nie udało się załadować szablonów.')
        setTemplatesLoading(false)
        return
      }
      setTemplates(data.templates ?? [])
      setShowTemplatesPanel(true)
    } catch (e) {
      setActionError('Błąd sieci przy ładowaniu szablonów.')
    } finally {
      setTemplatesLoading(false)
    }
  }

  function applyTemplate(t: Template) {
    fillCartFromList(t.pozycje)
    setShowTemplatesPanel(false)
    setActionNotice(`Wczytano szablon: ${t.nazwa}`)
  }

  // Sprint T-ORDER.4a-SHELL — Zapisz aktualny cart jako szablon (POST).
  async function handleSaveTemplate() {
    const list = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([product_id, qty]) => ({ product_id, qty }))
    if (list.length === 0) {
      setActionError('Koszyk jest pusty — nie można zapisać szablonu.')
      return
    }
    const nazwa = prompt('Podaj nazwę szablonu (min. 2 znaki):', '')
    if (nazwa === null) return
    const trimmed = nazwa.trim()
    if (trimmed.length < 2) {
      setActionError('Nazwa musi mieć min. 2 znaki.')
      return
    }
    setActionError(null)
    setActionNotice(null)
    try {
      const res = await fetch(`/api/orders/${token}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nazwa: trimmed, pozycje: list }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? 'Nie udało się zapisać szablonu.')
        return
      }
      // Invalidate cache — kolejny klik "Moje szablony" pobierze świeże.
      setTemplates(null)
      setActionNotice(`Szablon "${trimmed}" zapisany.`)
    } catch (e) {
      setActionError('Błąd sieci przy zapisie szablonu.')
    }
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => {
        const { [productId]: _omit, ...rest } = prev
        return rest
      })
    } else {
      setCart((prev) => ({ ...prev, [productId]: Math.min(9999, Math.max(1, Math.floor(qty))) }))
    }
  }

  const step3Valid =
    contactPerson.trim().length >= 2 &&
    contactPhone.trim().length >= 9 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()) &&
    deliveryAddress.trim().length >= 5

  async function submitOrder() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const items = Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([product_id, qty]) => ({ product_id, qty }))
      const res = await fetch(`/api/orders/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_person: contactPerson.trim(),
          contact_phone: contactPhone.trim(),
          contact_email: contactEmail.trim(),
          delivery_address: deliveryAddress.trim(),
          preferred_delivery_date: preferredDate || null,
          customer_notes: notes.trim() || null,
          items,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? 'Wystąpił błąd przy zapisie zamówienia.')
        setSubmitting(false)
        return
      }
      // Sprint T-ORDER.4a-SHELL — setStep(5) usunięte; ekran potwierdzenia
      // renderowany gdy submitResult !== null (terminal state zastępuje tabs).
      setSubmitResult(data as SubmitOk)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setSubmitting(false)
    }
  }

  // Sprint T-ORDER.4a-SHELL (30.05.2026) — stary stepLabels usunięty,
  // navigacja przez showWelcome + activeTab + submitResult (terminal).

  return (
    <div className="mx-auto max-w-5xl bg-white shadow-sm">
      {/* Sprint T-ORDER.4a-SHELL (30.05.2026) — szeroki nagłówek z tytułem zamówienia. */}
      <div className="bg-[#1F3A5F] text-white px-6 py-5">
        <h1 className="text-[22px] font-bold leading-tight">
          Zamówienie — {client?.title ?? 'klient'}
        </h1>
        {initial.order.order_number && (
          <div className="text-[12px] text-white/70 mt-1 font-mono">
            {initial.order.order_number}
          </div>
        )}
      </div>

      {/* Action notice/error toast — nad zakładkami */}
      {(actionNotice || actionError) && (
        <div
          className={`px-6 py-2.5 text-sm border-b ${
            actionError
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {actionError || actionNotice}
          <button
            type="button"
            onClick={() => {
              setActionError(null)
              setActionNotice(null)
            }}
            className="ml-3 text-xs underline opacity-70 hover:opacity-100"
          >
            zamknij
          </button>
        </div>
      )}

      {/* ─── Welcome screen (overlay przed zakładkami) ──────────────────── */}
      {showWelcome && !submitResult && (
        <div className="p-5">
          {client && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                Oferta przygotowana dla
              </div>
              <div className="font-semibold text-slate-900 leading-tight">{client.title}</div>
              <div className="text-xs text-slate-500 mt-1">NIP {client.nip}</div>
            </div>
          )}

          <h2 className="text-2xl font-bold text-slate-900 mb-2">Witaj, {firstWord}!</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            Cieszymy się, że jesteś zainteresowany asortymentem Czudowa Marka. Złożenie zamówienia
            zajmie ok. 5 minut.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <div className="text-xs font-semibold text-amber-900 mb-2">Co warto wiedzieć:</div>
            <ul className="text-xs text-amber-900/80 space-y-1.5">
              <li>• 17 SKU kiszonek, sałatek, surówek</li>
              {isAutoWH && (
                <li>
                  • <strong>Cennik Wielki Hurt</strong> — Hurt do{' '}
                  {fmt(WH_HURT_THRESHOLD)} PLN, powyżej Wielki Hurt (najniższe ceny)
                </li>
              )}
              {isWielkiHurt && isMinimum && (
                <li>
                  • <strong>Cennik Wielki Hurt</strong> — locked, najniższy poziom
                </li>
              )}
              {isAutoStandard && (
                <li>• 3 progi cenowe (mały / średni / duży gracz)</li>
              )}
              {!isWielkiHurt && isMinimum && (
                <li>
                  • <strong>Cena duży opt</strong> — locked dla całego zamówienia
                </li>
              )}
              <li>• Pierwsze zamówienie bez przedpłaty</li>
              <li>• Dostawa 3-5 dni roboczych</li>
            </ul>
          </div>

          <button
            onClick={() => setShowWelcome(false)}
            className="w-full bg-[#1F3A5F] hover:bg-[#264a76] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            Rozpocznij zamówienie
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Po welcome + przed submit: zakładki ───────────────────────── */}
      {!showWelcome && !submitResult && (
        <>
          {/* Tab bar (segmented control) */}
          <div className="bg-white border-b border-slate-200 px-6 pt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('produkty')}
                className={`flex-1 px-4 py-3 rounded-t-lg font-semibold text-[14px] transition border-b-2 ${
                  activeTab === 'produkty'
                    ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                    : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
                }`}
              >
                1 · Produkty
              </button>
              <button
                type="button"
                onClick={() => {
                  if (cartNotEmpty) setActiveTab('dostawa')
                }}
                disabled={!cartNotEmpty}
                className={`flex-1 px-4 py-3 rounded-t-lg font-semibold text-[14px] transition border-b-2 ${
                  activeTab === 'dostawa'
                    ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                    : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                2 · Dostawa i dokumenty
              </button>
            </div>
          </div>

          {/* Sprint T-ORDER.4a-SHELL — górny pasek (search + Powtórz + szablony)
              tylko gdy aktywna zakładka Produkty. */}
          {activeTab === 'produkty' && (
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Szukaj produktu lub SKU..."
                className="flex-1 min-w-[180px] px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#1F3A5F] bg-white"
              />
              <button
                type="button"
                onClick={handleRepeatOrder}
                className="px-3 py-2 rounded-lg bg-white border border-[#1F3A5F] text-[#1F3A5F] text-[13px] font-semibold hover:bg-[#1F3A5F] hover:text-white transition shrink-0"
              >
                ↻ Powtórz zamówienie
              </button>
              <button
                type="button"
                onClick={loadTemplates}
                disabled={templatesLoading}
                className="px-3 py-2 rounded-lg bg-white border border-[#1F3A5F] text-[#1F3A5F] text-[13px] font-semibold hover:bg-[#1F3A5F] hover:text-white transition shrink-0 disabled:opacity-50"
              >
                {templatesLoading ? '...' : '★ Moje szablony'}
              </button>
            </div>
          )}

          {/* Lista szablonów (rozwijana) */}
          {activeTab === 'produkty' && showTemplatesPanel && templates && (
            <div className="bg-white border-b border-slate-200 px-6 py-3 max-h-[260px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-semibold text-slate-700">
                  Twoje szablony ({templates.length})
                </div>
                <button
                  type="button"
                  onClick={() => setShowTemplatesPanel(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  zamknij
                </button>
              </div>
              {templates.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2">
                  Brak zapisanych szablonów. Dodaj produkty do koszyka i kliknij &quot;★ Zapisz jako szablon&quot;.
                </div>
              ) : (
                <div className="space-y-1">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 rounded border border-slate-200 hover:border-[#1F3A5F] hover:bg-slate-50 transition"
                    >
                      <div className="text-[14px] font-semibold text-[#15202e]">{t.nazwa}</div>
                      <div className="text-[11px] text-slate-500">
                        {t.pozycje.length} {t.pozycje.length === 1 ? 'pozycja' : 'pozycji'}
                        {' · '}
                        {t.utworzyl === 'vadym' ? 'od Vadyma' : 'mój'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── Zakładka 1: Produkty ───────────────────────────────────────── */}
      {!showWelcome && !submitResult && activeTab === 'produkty' && (
        <>
          {/* Sticky tier banner — Sprint S-CENNIK-WH.2 matrix 2x2 */}
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  {isMinimum
                    ? 'Cennik (zablokowany)'
                    : isAutoWH
                      ? 'Cennik Wielki Hurt'
                      : 'Próg cenowy'}
                </div>
                <div
                  className={`text-sm font-bold ${
                    isWielkiHurt
                      ? 'text-violet-700'
                      : tier === 'duzy'
                        ? 'text-emerald-600'
                        : tier === 'sredni'
                          ? 'text-amber-600'
                          : 'text-slate-700'
                  }`}
                >
                  {TIER_LABEL[tier]}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Suma netto</div>
                <div className="text-base font-bold text-slate-900">{fmt(total)} zł</div>
              </div>
            </div>
            {/* Branch by matrix cell */}
            {isAutoStandard && (
              <>
                <TierProgressBar tier={tier as StandardTier} total={total} />
                <TierHint tier={tier as StandardTier} total={total} />
              </>
            )}
            {isAutoWH && (
              <WHHurtProgressBar tier={tier} hurtNominal={hurtNominal ?? 0} />
            )}
            {isMinimum && isWielkiHurt && (
              <div className="text-[10px] text-violet-700 mt-1">
                Ceny zablokowane na poziomie <strong>Wielki Hurt</strong> — niezależnie od wielkości zamówienia.
              </div>
            )}
            {isMinimum && !isWielkiHurt && (
              <div className="text-[10px] text-emerald-700 mt-1">
                Ceny zablokowane na poziomie <strong>Duży opt</strong> — niezależnie od wielkości zamówienia.
              </div>
            )}
          </div>

          {/* Sprint T-ORDER.4a-UI-FIX (30.05.2026) — wygląd 1:1 z zatwierdzonym prototypem.
              GRUPA = pełna granatowa plansza #1F3A5F + badge marki (marka partnerska / Ziomek Fish).
              PODGRUPA = jasny pasek #e9edf2 + UPPERCASE 13px font-700 #2d4364.
              SKU = nazwa 16px font-600 #15202e + cena "X zł/szt" 15px font-700 #1F3A5F.
              Przyciski qty = 38px square border 1.5px #1F3A5F rounded-8px hover:bg-granat.
              Pusta grupa (brak SKU) pomijana — Owoce morza nie wyświetli się dopóki nie ma SKU. */}
          <div className="p-4 space-y-3 max-h-[55vh] overflow-y-auto">
            {groupedHierarchy
              .filter((grp) => grp.subs.some((sub) => sub.items.length > 0))
              .map((grp) => {
                const grpKey = `g:${grp.key}`
                const grpOpen = openKeys.has(grpKey)
                const grpLabel = GRUPA_LABEL[grp.key] ?? grp.key
                const grpBadge = BRAND_BADGE[grp.key] ?? null
                const grpCount = grp.subs.reduce((s, sub) => s + sub.items.length, 0)
                return (
                  <div
                    key={grp.key}
                    className="rounded-lg overflow-hidden border border-[#dde3ea]"
                  >
                    {/* GRUPA header — pełna granatowa plansza #1F3A5F */}
                    <button
                      type="button"
                      onClick={() => toggleKey(grpKey)}
                      className="w-full bg-[#1F3A5F] text-white px-4 py-[15px] flex items-center justify-between gap-3 hover:bg-[#264a76] transition"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        {grpOpen ? (
                          <ChevronDown className="w-5 h-5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 shrink-0" />
                        )}
                        <span
                          className="text-[17px] font-extrabold text-white truncate"
                          style={{ letterSpacing: '0.3px' }}
                        >
                          {grpLabel}
                        </span>
                        {grpBadge && (
                          <span className="ml-2.5 shrink-0 text-[12px] bg-[#2d4d73] text-white px-[9px] py-[2px] rounded-[5px] font-medium">
                            {grpBadge}
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] text-white/85 font-medium shrink-0">
                        {grpCount} produktów
                      </span>
                    </button>

                    {grpOpen &&
                      grp.subs
                        .filter((sub) => sub.items.length > 0)
                        .map((sub) => {
                          const subKey = `s:${grp.key}:${sub.key}`
                          const subOpen = openKeys.has(subKey)
                          const subLabel = PODGRUPA_LABEL[sub.key] ?? sub.key
                          return (
                            <div key={sub.key}>
                              {/* PODGRUPA header — jasny pasek #e9edf2 */}
                              <button
                                type="button"
                                onClick={() => toggleKey(subKey)}
                                className="w-full bg-[#e9edf2] border-t border-[#dde3ea] px-4 py-[11px] flex items-center justify-between gap-2 hover:bg-[#dde4ec] transition"
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  {subOpen ? (
                                    <ChevronDown className="w-4 h-4 shrink-0 text-[#2d4364]" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 shrink-0 text-[#2d4364]" />
                                  )}
                                  <span
                                    className="text-[13px] font-bold uppercase text-[#2d4364] truncate"
                                    style={{ letterSpacing: '0.6px' }}
                                  >
                                    {subLabel}
                                  </span>
                                </span>
                                <span className="text-[12px] text-[#2d4364]/70 font-medium shrink-0">
                                  {sub.items.length}
                                </span>
                              </button>

                              {subOpen && (
                                <div>
                                  {sub.items.map((p) => {
                                    const isPomidor = /pomidor/i.test(p.name)
                                    // Sprint S-CENNIK-WH.2 — tier→priceKey map (handles 'wielki_hurt_entry' → 'hurt_wh').
                                    const price = p.prices[tierToPriceKey(tier)] ?? 0
                                    // Sprint S-CENNIK-WH.1 — line-through pokazujemy vs maly (retail anchor).
                                    const originalPrice = p.prices.maly
                                    const qty = cart[p.id] ?? 0
                                    // Sprint S-CENNIK-WH.2 — WH+auto: disable jeśli SKU не ma price_hurt_wh
                                    const whAutoUnavailable =
                                      isAutoWH && p.prices.hurt_wh == null
                                    // Sprint T-ORDER.4a-UI — in_stock=false → wygaszone +
                                    // disabled. Łączymy z whAutoUnavailable (legacy reason).
                                    const unavailable =
                                      !p.in_stock || whAutoUnavailable
                                    const unit = p.unit ?? 'szt'
                                    return (
                                      <div
                                        key={p.id}
                                        className={`bg-white px-4 py-[14px] border-t border-[#e4e9ef] flex items-start gap-3 ${
                                          unavailable ? 'opacity-50' : ''
                                        }`}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start gap-2 mb-1 flex-wrap">
                                            {/* Nazwa SKU 16px font-600 #15202e */}
                                            <div className="text-[16px] font-semibold text-[#15202e] leading-snug">
                                              {p.name}
                                            </div>
                                            {!p.in_stock && (
                                              <span
                                                className="shrink-0 text-[11px] bg-[#f3d6d6] text-[#9a3434] px-[7px] py-[2px] rounded font-bold"
                                              >
                                                niedostępny
                                              </span>
                                            )}
                                            {isPomidor && p.in_stock && (
                                              <span className="shrink-0 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                                                Ostatnie
                                              </span>
                                            )}
                                            {whAutoUnavailable && p.in_stock && (
                                              <span className="shrink-0 text-[10px] bg-slate-300 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                                                Brak w Hurcie
                                              </span>
                                            )}
                                          </div>
                                          {p.gramatura && (
                                            <div className="text-[13px] text-slate-500 mb-1">
                                              {p.gramatura}
                                            </div>
                                          )}
                                          {/* Cena 15px font-700 #1F3A5F — format "X zł/szt" gdy unit znany. */}
                                          {unavailable ? (
                                            <div className="text-[13px] text-slate-400 italic">
                                              —
                                            </div>
                                          ) : isAutoWH ? (
                                            <div className="flex items-baseline gap-2 flex-wrap">
                                              <span
                                                className={`text-[15px] font-bold ${tier === 'wielki_hurt' ? 'text-violet-700' : 'text-[#1F3A5F]'}`}
                                              >
                                                {tier === 'wielki_hurt'
                                                  ? fmt(p.prices.wielki_hurt)
                                                  : fmt(p.prices.hurt_wh ?? 0)}{' '}
                                                zł/{unit}
                                              </span>
                                              <span className="text-[11px] text-slate-500">
                                                {tier === 'wielki_hurt'
                                                  ? `(Hurt: ${fmt(p.prices.hurt_wh ?? 0)} zł)`
                                                  : `(Wielki Hurt: ${fmt(p.prices.wielki_hurt)} zł)`}
                                              </span>
                                            </div>
                                          ) : (
                                            <div className="flex items-baseline gap-2">
                                              <span className="text-[15px] font-bold text-[#1F3A5F]">
                                                {fmt(price)} zł/{unit}
                                              </span>
                                              {tier !== 'maly' && price < originalPrice && (
                                                <span className="text-[11px] text-slate-400 line-through">
                                                  {fmt(originalPrice)} zł
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        {/* Sprint T-ORDER.4a-UI-FIX — 38px square buttons, border 1.5px #1F3A5F. */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => setQty(p.id, qty - 1)}
                                            disabled={qty <= 0 || unavailable}
                                            className="w-[38px] h-[38px] rounded-lg bg-white flex items-center justify-center text-[#1F3A5F] text-[20px] font-bold disabled:opacity-30 disabled:hover:bg-white hover:bg-[#1F3A5F] hover:text-white transition"
                                            style={{
                                              border: '1.5px solid #1F3A5F',
                                            }}
                                            aria-label="Zmniejsz"
                                          >
                                            <Minus className="w-4 h-4" strokeWidth={2.5} />
                                          </button>
                                          <input
                                            type="number"
                                            min={0}
                                            max={9999}
                                            value={qty}
                                            disabled={unavailable}
                                            onChange={(e) =>
                                              setQty(p.id, Number(e.target.value) || 0)
                                            }
                                            className="w-[62px] h-[38px] text-center text-[16px] font-semibold rounded-lg outline-none focus:border-[#1F3A5F] disabled:opacity-30 disabled:bg-slate-50"
                                            style={{
                                              border: '1.5px solid #9fb0c4',
                                            }}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => setQty(p.id, qty + 1)}
                                            disabled={unavailable}
                                            className="w-[38px] h-[38px] rounded-lg bg-white flex items-center justify-center text-[#1F3A5F] text-[20px] font-bold disabled:opacity-30 disabled:hover:bg-white hover:bg-[#1F3A5F] hover:text-white transition"
                                            style={{
                                              border: '1.5px solid #1F3A5F',
                                            }}
                                            aria-label="Zwiększ"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                      <span className="text-[11px] text-slate-500 ml-0.5 self-center">
                                        {unit}
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>

          {/* Sprint T-ORDER.4a-UI-FIX (30.05.2026) — dolny pasek koszyka:
              sticky granat #1F3A5F + statystyki (pozycje + kg) + buttons
              (Szablon placeholder T-ORDER.4b + Dalej). Wstecz jako mniejszy
              link po lewej. */}
          <div
            className="sticky bottom-0 bg-[#1F3A5F] text-white px-4 py-4 flex items-center gap-3 flex-wrap"
            style={{ boxShadow: '0 -4px 12px rgba(0,0,0,0.12)', borderRadius: '10px 10px 0 0' }}
          >
            <button
              type="button"
              onClick={() => setShowWelcome(true)}
              className="text-[13px] text-white/80 hover:text-white flex items-center gap-1 shrink-0"
              aria-label="Wstecz"
            >
              <ChevronLeft className="w-4 h-4" />
              Wstecz
            </button>
            <div className="flex-1 min-w-0 text-[16px] font-bold leading-tight">
              <span className="text-white">
                Koszyk: {itemsCount} {itemsCount === 1 ? 'pozycja' : itemsCount >= 2 && itemsCount <= 4 ? 'pozycje' : 'pozycji'}
              </span>
              {totalKg > 0 && (
                <span className="text-white/85 font-medium">
                  {' · '}
                  {totalKg.toFixed(1)} kg
                </span>
              )}
              <div className="text-[13px] font-medium text-white/85 mt-0.5">
                Razem: {fmt(total)} zł
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!cartNotEmpty}
              className="px-3 py-2 rounded-lg bg-[#eef3f9] text-[#1F3A5F] text-[13px] font-semibold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white shrink-0"
            >
              ★ Zapisz jako szablon
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dostawa')}
              disabled={!cartNotEmpty}
              className="px-4 py-2 rounded-lg bg-white text-[#1F3A5F] font-bold text-[14px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#eef3f9] shrink-0"
            >
              Dalej
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* ─── Zakładka 2: Dostawa i dokumenty (łączy stare step 3 + 4) ──── */}
      {!showWelcome && !submitResult && activeTab === 'dostawa' && (
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Firma</div>
              <div className="text-sm font-semibold text-slate-900">{client?.title}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">NIP</div>
              <div className="text-sm text-slate-700 font-mono">{client?.nip}</div>
            </div>
          </div>

          <Field label="Osoba kontaktowa *" hint="Imię i nazwisko">
            <input
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="np. Anna Kowalska"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon *">
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+48 ..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-500"
              />
            </Field>
            <Field label="E-mail *">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="firma@..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-500"
              />
            </Field>
          </div>

          <Field label="Adres dostawy *" hint="Ulica, kod pocztowy, miasto">
            <textarea
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              rows={2}
              placeholder="ul. ..., 00-000 Miasto"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-500 resize-none"
            />
          </Field>

          <Field label="Preferowana data dostawy" hint="Opcjonalnie">
            <input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-500"
            />
          </Field>

          <Field label="Uwagi" hint="Opcjonalnie">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="np. preferowane godziny dostawy, brama tylna..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-500 resize-none"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setActiveTab('produkty')}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm flex items-center gap-1 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" /> Wstecz do produktów
            </button>
          </div>
        </div>
      )}

      {/* ─── Łączone: Podsumowanie + Zgoda + Submit (stary step 4) ──────── */}
      {!showWelcome && !submitResult && activeTab === 'dostawa' && step3Valid && (
        <div className="p-5 space-y-4">
          {/* Firma + kontakt */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
            <div className="font-semibold text-slate-900 mb-1">{client?.title}</div>
            <div className="text-slate-500">NIP {client?.nip}</div>
            <div className="mt-2 space-y-0.5">
              <div className="text-slate-700">{contactPerson}</div>
              <div className="text-slate-500">
                {contactPhone} · {contactEmail}
              </div>
              <div className="text-slate-500">{deliveryAddress}</div>
              {preferredDate && <div className="text-slate-500">Dostawa: {preferredDate}</div>}
            </div>
          </div>

          {/* Items summary */}
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {Object.entries(cart)
              .filter(([, qty]) => qty > 0)
              .map(([id, qty]) => {
                const p = products.find((pp) => pp.id === id)
                if (!p) return null
                // Sprint S-CENNIK-WH.2 — tier→priceKey map (handles 'wielki_hurt_entry' → 'hurt_wh')
                const price = p.prices[tierToPriceKey(tier)] ?? 0
                const subtotal = qty * price
                return (
                  <div key={id} className="px-3 py-2 flex items-baseline gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 leading-tight">{p.name}</div>
                      <div className="text-slate-500">{p.gramatura}</div>
                    </div>
                    <div className="text-slate-700 whitespace-nowrap">
                      {qty} × {fmt(price)}
                    </div>
                    <div className="font-semibold text-slate-900 whitespace-nowrap min-w-[60px] text-right">
                      {fmt(subtotal)} zł
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Totals */}
          <div className="bg-[#1F2B4A] text-white rounded-lg p-4 space-y-1.5">
            <div className="flex justify-between text-xs opacity-80">
              <span>
                {isMinimum ? 'Cennik (zablokowany)' : isWielkiHurt ? 'Cennik' : 'Próg końcowy'}
              </span>
              <span className="font-bold">{TIER_LABEL[tier]}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="opacity-80">Suma netto</span>
              <span>{fmt(total)} zł</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="opacity-80">VAT 5%</span>
              <span>{fmt(total * 0.05)} zł</span>
            </div>
            <div className="border-t border-white/20 pt-1.5 flex justify-between text-base font-bold">
              <span>Razem brutto</span>
              <span>{fmt(total * 1.05)} zł</span>
            </div>
          </div>

          {/* Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <strong>Pierwsze zamówienie?</strong> Przyjmiemy bez przedpłaty. Po dostawie wystawimy
            fakturę VAT z terminem 14 dni.
          </div>

          {/* Terms */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500"
            />
            <span className="text-xs text-slate-700">
              Zapoznałem się z warunkami współpracy i akceptuję je.
            </span>
          </label>

          {submitError && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900">
              {submitError}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setActiveTab('produkty')}
              disabled={submitting}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm flex items-center gap-1 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Wstecz do produktów
            </button>
            <button
              onClick={submitOrder}
              disabled={!termsAccepted || submitting}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wysyłanie…
                </>
              ) : (
                'Złóż zamówienie'
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Ekran potwierdzenia (terminal: submitResult !== null) ────────── */}
      {submitResult && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Zamówienie złożone!</h2>
          <p className="text-sm text-slate-600 mb-4">
            Vadym skontaktuje się w ciągu 24h aby potwierdzić szczegóły dostawy.
          </p>
          <div className="inline-block bg-slate-100 px-4 py-2 rounded-lg font-mono text-base font-bold text-slate-900 mb-5">
            {submitResult.order_number}
          </div>

          {contactEmail && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-left mb-4">
              <div className="text-sm text-emerald-900">
                📧 Vadym potwierdzi zamówienie i wyśle fakturę proforma na adres{' '}
                <strong className="break-all">{contactEmail}</strong>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left mb-4">
            <div className="text-xs font-semibold text-slate-900 mb-2">Co dalej?</div>
            <ul className="text-xs text-slate-600 space-y-1.5">
              <li>1. Potwierdzenie telefoniczne (24h)</li>
              <li>2. Wysyłka 3-5 dni roboczych</li>
              <li>3. Faktura VAT z terminem 14 dni</li>
            </ul>
          </div>

          <div className="bg-[#1F2B4A] text-white rounded-lg p-3">
            <div className="text-xs opacity-80">Razem brutto</div>
            <div className="text-2xl font-bold">{fmt(submitResult.total_brutto)} zł</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

function TierProgressBar({ tier, total }: { tier: StandardTier; total: number }) {
  // Progress within current tier window
  const thresholds = [0, 2000, 4000]
  const idx = tier === 'maly' ? 0 : tier === 'sredni' ? 1 : 2
  const tierMin = thresholds[idx]
  const tierMax = tier === 'duzy' ? Math.max(8000, total) : thresholds[idx + 1]
  const pct = Math.min(100, Math.max(0, ((total - tierMin) / (tierMax - tierMin)) * 100))

  return (
    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${
          tier === 'duzy'
            ? 'bg-emerald-500'
            : tier === 'sredni'
              ? 'bg-amber-500'
              : 'bg-slate-400'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function TierHint({ tier, total }: { tier: StandardTier; total: number }) {
  const nextThreshold = TIER_NEXT_THRESHOLD[tier]
  if (nextThreshold === null) {
    return <div className="text-[10px] text-emerald-700 mt-1.5">Najlepsza cena · Duży gracz</div>
  }
  const diff = nextThreshold - total
  if (diff <= 0) return null
  const nextLabel = tier === 'maly' ? 'Średni' : 'Duży gracz'
  return (
    <div className="text-[10px] text-slate-500 mt-1.5">
      Brakuje <span className="font-semibold text-slate-700">{fmt(diff)} zł</span> do progu{' '}
      <span className="font-semibold text-amber-600">{nextLabel}</span> (lepsze ceny)
    </div>
  )
}

// Sprint S-CENNIK-WH.2 — Hurt → Wielki Hurt progress (10k threshold, hurt nominal trigger)
function WHHurtProgressBar({ tier, hurtNominal }: { tier: Tier; hurtNominal: number }) {
  const isCrossed = tier === 'wielki_hurt'
  const pct = Math.min(100, Math.max(0, (hurtNominal / WH_HURT_THRESHOLD) * 100))
  const diff = WH_HURT_THRESHOLD - hurtNominal
  return (
    <>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isCrossed ? 'bg-violet-600' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] mt-1.5">
        {isCrossed ? (
          <span className="text-violet-700">
            Najlepsza cena · <strong>Wielki Hurt</strong>
          </span>
        ) : (
          <span className="text-slate-500">
            Brakuje <span className="font-semibold text-slate-700">{fmt(diff)} zł</span> (Hurt) do progu{' '}
            <span className="font-semibold text-violet-700">Wielki Hurt</span> (lepsze ceny)
          </span>
        )}
      </div>
    </>
  )
}
