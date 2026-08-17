// components/zamowienie/order-form.tsx
// Przejście 1B (T-ORDER.5-UI, 31.05.2026) — przepisany formularz pod prototyp A1.
//   Ekran startowy (Powtórz / Szablon / Nowe) → 3 kroki (Dostawa → Produkty →
//   Podsumowanie). Multipoint (jeden/kilka punktów), koszyk per punkt, profil
//   zapisanych punktów (initial.saved_delivery_points), szablony pełny snapshot.
// CENY: UI nie liczy — wysyła product_id + qty + delivery_point_index. Serwer
//   liczy tier z cennik_tier×price_mode (na orderze). computeOrderTotals tu jest
//   front-mirror serwera 2A (mieszane CM+owoce morza, VAT per-stawka) — podgląd.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
// Krok 3 DAGOLD — rabaty wolumenowe per grupa (ta sama logika co submit → parity).
import {
  groupDiscounts,
  groupNetTotals,
  effectiveLineDiscount,
  nextTierGap,
  GLOBAL_FOOD_SUPPLIER_ID,
  AVIS_D_SUPPLIER_ID,
  normalizeQty,
} from '@/lib/orders/discount-tiers'
import {
  Minus,
  Plus,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Star,
  RotateCcw,
  FilePlus,
} from 'lucide-react'

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
  grupa: string | null
  podgrupa: string | null
  in_stock: boolean
  // Faza 1 DAGOLD — dostępność (display-only): badge „od ręki" / „na zamówienie".
  dostepnosc?: 'w_magazynie' | 'na_zamowienie'
  unit: string | null
  sort: number | null
  vat_rate: number
  // Task #14 — new-price-path z serwera (marża bazowa). Gdy != null, to jest
  // CENA STAŁA tego produktu (parity z submit); stara matryca prices tylko
  // fallback dla produktów bez marży.
  new_unit_price?: number | null
  // Krok 3 DAGOLD — rabaty wolumenowe per grupa. base_unit_price = cena A BEZ
  // rabatu; supplier_id = klucz grupy. Rabat liczony live z całego koszyka.
  base_unit_price?: number | null
  supplier_id?: string | null
  prices: {
    maly: number
    sredni: number
    duzy: number
    wielki_hurt: number
    hurt_wh: number | null
  }
}

type SavedPoint = {
  id: string
  nazwa: string | null
  ulica: string | null
  kod_pocztowy: string | null
  miasto: string | null
  typ_punktu: string | null
  odbiorca_imie: string | null
  odbiorca_telefon: string | null
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
    cennik_tier: CennikTier
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
  // Przejście 1B — zapisane punkty dostawy klienta (z loadera, profil).
  saved_delivery_points?: SavedPoint[]
  // Poprawki 1B — czy klient ma już zgodę marketingową.
  has_marketing_consent?: boolean
  // Krok DAGOLD — rozdzielony rabat indywidualny: ogólny + osobny na kalmary/przekąski.
  individual_discount?: number
  individual_discount_kalmar?: number
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

// Krok DAGOLD — stare etykiety poziomów/podgrup (HURT_LEVEL_LABEL, PODGRUPA_LABEL,
// PODGRUPA_ORDER) usunięte: zakładki idą teraz per grupa oferty (supplier),
// a wskaźnik pokazuje rabat wolumenowy zamiast tierów.

const MARKETING_CONSENT_TEXT =
  'Zgadzam się na otrzymywanie ofert handlowych i informacji marketingowych od Ziomek Fish sp. z o.o. drogą elektroniczną (e-mail). Zgodę mogę wycofać w każdej chwili.'

function tierToPriceKey(t: Tier): keyof Product['prices'] {
  if (t === 'wielki_hurt_entry') return 'hurt_wh'
  return t
}

function fmt(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Przejście 2C — front liczy DOKŁADNIE jak serwer 2A: mieszane CM + owoce morza,
// poziom CM po ZŁ (matryca 2x2), poziom owoców morza po SZTUKACH, VAT per-stawka.
function computeOrderTotals(
  cart: Record<string, number>,
  products: Product[],
  cennikTier: CennikTier,
  priceMode: PriceMode,
  individual: { ogolna: number; kalmar: number },
): {
  tier: Tier
  cmTier: Tier | null
  seafoodTier: StandardTier | null
  seafoodSzt: number
  cmTotal: number
  seafoodTotal: number
  totalNet: number
  totalVat: number
  totalBrutto: number
} {
  const entries = Object.entries(cart).filter(([, q]) => q > 0)
  const prodOf = (id: string): Product | undefined => products.find((p) => p.id === id)
  const isSeafood = (id: string): boolean => prodOf(id)?.grupa === 'owoce_morza'
  // Task #14 — produkty z new_unit_price (marża bazowa) mają cenę STAŁĄ i są
  // wykluczone z matrycy tierowej — dokładnie jak `oldItems` w submit/route.ts.
  const hasNew = (id: string): boolean =>
    (prodOf(id)?.base_unit_price ?? prodOf(id)?.new_unit_price ?? null) != null
  const oldEntries = entries.filter(([id]) => !hasNew(id))
  const cmEntries = oldEntries.filter(([id]) => !isSeafood(id))
  const seafoodEntries = oldEntries.filter(([id]) => isSeafood(id))

  const sumSubset = (
    subset: Array<[string, number]>,
    selector: (p: Product) => number | null,
  ): number =>
    subset.reduce((sum, [id, qty]) => {
      const p = prodOf(id)
      if (!p) return sum
      const price = selector(p)
      if (price == null) return sum
      return sum + qty * price
    }, 0)

  // ── CM (Czudowa Marka / nie-seafood) — istniejąca matryca, na podzbiorze CM ──
  let cmTier: Tier | null = null
  let cmTotal = 0
  if (cmEntries.length > 0) {
    if (cennikTier === 'wielki_hurt' && priceMode === 'auto') {
      const hurtNominal = sumSubset(cmEntries, (p) => p.prices.hurt_wh)
      if (hurtNominal >= WH_HURT_THRESHOLD) {
        cmTier = 'wielki_hurt'
        cmTotal = sumSubset(cmEntries, (p) => p.prices.wielki_hurt)
      } else {
        cmTier = 'wielki_hurt_entry'
        cmTotal = hurtNominal
      }
    } else if (cennikTier === 'wielki_hurt') {
      cmTier = 'wielki_hurt'
      cmTotal = sumSubset(cmEntries, (p) => p.prices.wielki_hurt)
    } else if (priceMode === 'minimum') {
      cmTier = 'duzy'
      cmTotal = sumSubset(cmEntries, (p) => p.prices.duzy)
    } else {
      let t: StandardTier = 'maly'
      for (let i = 0; i < 4; i++) {
        cmTotal = sumSubset(cmEntries, (p) => p.prices[t])
        const nt: StandardTier = cmTotal < 2000 ? 'maly' : cmTotal <= 4000 ? 'sredni' : 'duzy'
        if (nt === t) break
        t = nt
      }
      cmTier = t
    }
  }

  // ── Owoce morza — tylko standard, poziom wg SUMY SZTUK (1 szt = 1 kg) ──
  let seafoodTier: StandardTier | null = null
  let seafoodSzt = 0
  let seafoodTotal = 0
  if (seafoodEntries.length > 0) {
    seafoodSzt = seafoodEntries.reduce((sum, [, q]) => sum + q, 0)
    const sfTier: StandardTier =
      priceMode === 'minimum'
        ? 'duzy'
        : seafoodSzt < 100
          ? 'maly'
          : seafoodSzt <= 300
            ? 'sredni'
            : 'duzy'
    seafoodTier = sfTier
    seafoodTotal = sumSubset(seafoodEntries, (p) => p.prices[sfTier])
  }

  // Krok 3 DAGOLD — rabaty wolumenowe per grupa (base × qty), override indywidualnym.
  const volLines = entries
    .map(([id, qty]) => {
      const p = prodOf(id)
      const b = p?.base_unit_price ?? null
      if (!p || b == null) return null
      return { supplierId: p.supplier_id ?? null, baseUnitPrice: b, qty }
    })
    .filter(
      (x): x is { supplierId: string | null; baseUnitPrice: number; qty: number } =>
        x != null,
    )
  const grpDisc = groupDiscounts(volLines)

  // Cena jednostkowa per-produkt (do VAT i wyświetlania).
  // Krok 3 — new-path (base_unit_price) → cena A × (1 − rabat efektywny), gdzie
  // rabat = override indywidualny albo wolumenowy grupy (ta sama logika co submit).
  // Inaczej: new_unit_price legacy / stara matryca wg gałęzi/tieru.
  const unitPriceOf = (p: Product): number => {
    if (p.base_unit_price != null) {
      const eff = effectiveLineDiscount(p.supplier_id ?? null, individual, grpDisc)
      return Math.round(p.base_unit_price * (1 - eff) * 100) / 100
    }
    if (p.new_unit_price != null) return p.new_unit_price
    if (p.grupa === 'owoce_morza') return seafoodTier ? p.prices[seafoodTier] ?? 0 : 0
    return cmTier ? p.prices[tierToPriceKey(cmTier)] ?? 0 : 0
  }

  // Task #14 — totalNet z sumy per-pozycja przez unitPriceOf po WSZYSTKICH
  // pozycjach (new-price + legacy), lustro submit. cmTotal/seafoodTotal niżej
  // zostają jako sumy legacy (do plansz tierów).
  const totalNet =
    Math.round(
      entries.reduce((sum, [id, qty]) => {
        const p = prodOf(id)
        return p ? sum + qty * unitPriceOf(p) : sum
      }, 0) * 100,
    ) / 100

  // VAT MIESZANY — lustro serwera 2A: netto per stawka, round do grosza per stawka, suma.
  const netByVat = new Map<number, number>()
  for (const [id, qty] of entries) {
    const p = prodOf(id)
    if (!p) continue
    const net = qty * unitPriceOf(p)
    const rate = p.vat_rate ?? 0
    netByVat.set(rate, (netByVat.get(rate) ?? 0) + net)
  }
  let totalVat = 0
  netByVat.forEach((net, rate) => {
    totalVat += Math.round(net * rate * 100) / 100
  })
  totalVat = Math.round(totalVat * 100) / 100
  const totalBrutto = Math.round((totalNet + totalVat) * 100) / 100

  const tier: Tier = cmTier ?? seafoodTier ?? 'maly'
  return { tier, cmTier, seafoodTier, seafoodSzt, cmTotal, seafoodTotal, totalNet, totalVat, totalBrutto }
}

// ─── Local form types ─────────────────────────────────────────────────────────
type FormPoint = {
  localId: string
  label: string
  ulica: string
  miasto: string
  kod_pocztowy: string
  typ: 'dostawa' | 'odbior'
  termin_typ: 'najblizszy' | 'data'
  preferred_date: string
  odbiorca_imie: string
  odbiorca_telefon: string
  prefilled: boolean
  // Poprawka 2 — id zapisanego punktu (profil) z którego wypełniono; czyszczone przy edycji adresu.
  sourceSavedId?: string
}

type TemplatePoint = {
  label?: string | null
  ulica?: string | null
  miasto?: string | null
  kod_pocztowy?: string | null
  typ?: string | null
  termin_typ?: string | null
  preferred_date?: string | null
  odbiorca_imie?: string | null
  odbiorca_telefon?: string | null
}
type Template = {
  id: string
  nazwa: string
  pozycje: Array<{ product_id: string; qty: number; delivery_point_index?: number }>
  delivery_mode?: 'jeden' | 'kilka'
  documents_mode?: 'wspolna' | 'osobne'
  delivery_points?: TemplatePoint[]
  wspolna_data?: boolean
  wspolny_termin_typ?: 'najblizszy' | 'data' | null
  wspolny_preferred_date?: string | null
  utworzyl: string
  created_at: string
}

let _idc = 0
function newId(): string {
  _idc += 1
  return 'p' + _idc + '_' + Math.random().toString(36).slice(2, 7)
}
function emptyPoint(over: Partial<FormPoint> = {}): FormPoint {
  return {
    localId: newId(),
    label: '',
    ulica: '',
    miasto: '',
    kod_pocztowy: '',
    typ: 'dostawa',
    termin_typ: 'najblizszy',
    preferred_date: '',
    odbiorca_imie: '',
    odbiorca_telefon: '',
    prefilled: false,
    ...over,
  }
}

export function OrderForm({
  token,
  initial,
}: {
  token: string
  initial: OrderInitial
}) {
  const { client, products } = initial
  const savedPoints = initial.saved_delivery_points ?? []
  const cennikTier: CennikTier = initial.order.cennik_tier ?? 'standard'
  const priceMode: PriceMode = initial.order.price_mode ?? 'auto'
  // Krok DAGOLD — rozdzielony rabat indywidualny: ogólny (ЧМ/ryby/reszta) i osobny
  // na kalmary/przekąski (GLOBAL FOOD). effectiveLineDiscount wybiera wg grupy.
  const individualDiscounts = {
    ogolna: initial.individual_discount ?? 0,
    kalmar: initial.individual_discount_kalmar ?? 0,
  }
  const isWielkiHurt = cennikTier === 'wielki_hurt'
  const isMinimum = priceMode === 'minimum'
  const isAutoWH = cennikTier === 'wielki_hurt' && priceMode === 'auto'
  const firstWord = (client?.title ?? '').split(' ')[0] || 'Kliencie'

  const [screen, setScreen] = useState<'start' | 'form'>('start')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [deliveryMode, setDeliveryMode] = useState<'jeden' | 'kilka'>('jeden')
  const [documentsMode, setDocumentsMode] = useState<'wspolna' | 'osobne'>('wspolna')
  const [points, setPoints] = useState<FormPoint[]>([emptyPoint()])
  const [wspolnaData, setWspolnaData] = useState(false)
  const [wspolnyTerminTyp, setWspolnyTerminTyp] = useState<'najblizszy' | 'data'>('najblizszy')
  const [wspolnyPreferredDate, setWspolnyPreferredDate] = useState('')

  const [carts, setCarts] = useState<Record<string, Record<string, number>>>({})
  const [activePointId, setActivePointId] = useState<string>('')
  const [activePodgrupa, setActivePodgrupa] = useState<string>('')

  const [contactPerson, setContactPerson] = useState(initial.order.contact_person ?? '')
  const [contactPhone, setContactPhone] = useState(initial.order.contact_phone ?? client?.phone ?? '')
  const [contactEmail, setContactEmail] = useState(initial.order.contact_email ?? client?.email ?? '')
  const [contactPrefilled, setContactPrefilled] = useState(false)
  const [notes, setNotes] = useState(initial.order.customer_notes ?? '')
  // Poprawki 1B — źródło wypełnienia (banner profilu tylko dla 'new').
  const [source, setSource] = useState<'new' | 'repeat' | 'template'>('new')
  // Poprawki 1B — dobrowolna zgoda marketingowa (galochka, nie blokuje submitu).
  const [marketingConsent, setMarketingConsent] = useState(false)

  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [lastHasHistory, setLastHasHistory] = useState(false)
  const lastDataRef = useRef<any>(null)


  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitOk | null>(null)

  // /last fetch on mount — żeby wiedzieć czy pokazać "Powtórz".
  useEffect(() => {
    let active = true
    fetch(`/api/orders/${token}/last`, { method: 'GET' })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return
        lastDataRef.current = d
        if (d && d.ok && d.has_history) setLastHasHistory(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [token])

  // ─── Pochodne ───────────────────────────────────────────────────────────────
  const mergedCart = useMemo(() => {
    const m: Record<string, number> = {}
    for (const pc of Object.values(carts)) {
      for (const [pid, q] of Object.entries(pc)) {
        if (q > 0) m[pid] = (m[pid] ?? 0) + q
      }
    }
    return m
  }, [carts])

  const { tier, cmTier, seafoodTier, totalNet, totalVat, totalBrutto } =
    useMemo(
      () =>
        computeOrderTotals(mergedCart, products, cennikTier, priceMode, individualDiscounts),
      [
        mergedCart,
        products,
        cennikTier,
        priceMode,
        individualDiscounts.ogolna,
        individualDiscounts.kalmar,
      ],
    )
  // Poprawka 2 — startowy display-tier gdy koszyk pusty (cmTier/seafoodTier null):
  //   auto → 'maly' (najdroższy, mały obrót), minimum → 'duzy' (cena minimalna).
  const startTier: StandardTier = isMinimum ? 'duzy' : 'maly'
  const cmDisplayTier: Tier = cmTier ?? startTier
  const seafoodDisplayTier: StandardTier = seafoodTier ?? startTier
  // Krok 3 DAGOLD — rabaty wolumenowe per grupa, liczone LIVE z całego koszyka
  // (base × qty per supplier). Ta sama logika co computeOrderTotals i submit.
  const groupDisc = useMemo(() => {
    const lines = Object.entries(mergedCart)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => {
        const p = products.find((pp) => pp.id === id)
        const b = p?.base_unit_price ?? null
        if (!p || b == null) return null
        return { supplierId: p.supplier_id ?? null, baseUnitPrice: b, qty }
      })
      .filter(
        (x): x is { supplierId: string | null; baseUnitPrice: number; qty: number } =>
          x != null,
      )
    return groupDiscounts(lines)
  }, [mergedCart, products])

  // Krok DAGOLD — sumy netto per grupa (supplier) do wskaźnika rabatu NA GÓRZE
  // (per aktywna zakładka). Ta sama baza co groupDisc.
  const groupNets = useMemo(() => {
    const lines = Object.entries(mergedCart)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => {
        const p = products.find((pp) => pp.id === id)
        const b = p?.base_unit_price ?? null
        if (!p || b == null) return null
        return { supplierId: p.supplier_id ?? null, baseUnitPrice: b, qty }
      })
      .filter(
        (x): x is { supplierId: string | null; baseUnitPrice: number; qty: number } =>
          x != null,
      )
    return groupNetTotals(lines)
  }, [mergedCart, products])

  // Cena jednostkowa per-produkt do WYŚWIETLANIA.
  // Krok 3 — new-path (base_unit_price) → cena A × (1 − rabat efektywny) live;
  // inaczej new_unit_price legacy / stara matryca z fallbackiem startowym.
  const productUnitPrice = (p: Product): number => {
    if (p.base_unit_price != null) {
      const eff = effectiveLineDiscount(p.supplier_id ?? null, individualDiscounts, groupDisc)
      return Math.round(p.base_unit_price * (1 - eff) * 100) / 100
    }
    if (p.new_unit_price != null) return p.new_unit_price
    if (p.grupa === 'owoce_morza') return p.prices[seafoodDisplayTier] ?? 0
    return p.prices[tierToPriceKey(cmDisplayTier)] ?? 0
  }
  const totalItems = useMemo(
    () => Object.values(mergedCart).filter((q) => q > 0).length,
    [mergedCart],
  )

  // Krok DAGOLD — zakładki = grupy z OFERTY (po supplier), nie po podgrupie —
  // żeby forma odpowiadała plikowi oferty (Kiszonki / Ryby / Kalmary), a nie
  // mieszała pozycji. Rabaty wolumenowe liczą się per ta sama grupa.
  const podgrupy = useMemo(() => {
    const GROUPS = [
      { key: 'czm', sid: 'a75927f4-eb9b-426e-b901-4a106c33e7e6', label: 'Kiszonki i surówki' },
      { key: 'ryby', sid: '0f27ad77-a8be-431f-bb1a-1ca537424307', label: 'Ryby i owoce morza' },
      { key: 'kalmar', sid: 'd7a780ec-22cd-4013-960c-80884c342d5d', label: 'Kalmary i przekąski' },
      { key: 'karol', sid: '7741f8dd-d957-474a-9b11-99d6d43e764b', label: 'Wędliny' },
    ]
    const groupOf = (sid: string | null | undefined) =>
      GROUPS.find((g) => g.sid === sid) ?? { key: 'inne', sid: null, label: 'Pozostałe' }
    const map = new Map<string, Product[]>()
    const meta = new Map<string, { sid: string | null; label: string }>()
    for (const p of products) {
      const g = groupOf(p.supplier_id)
      if (!map.has(g.key)) {
        map.set(g.key, [])
        meta.set(g.key, { sid: g.sid, label: g.label })
      }
      map.get(g.key)!.push(p)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || a.name.localeCompare(b.name, 'pl'))
    }
    const order = ['czm', 'ryby', 'kalmar', 'inne']
    const keys = [...map.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    return keys.map((k) => ({
      key: k,
      sid: meta.get(k)!.sid,
      label: meta.get(k)!.label,
      items: map.get(k)!,
    }))
  }, [products])

  // ─── Cart ops ────────────────────────────────────────────────────────────────
  function getQty(pointId: string, productId: string): number {
    return carts[pointId]?.[productId] ?? 0
  }
  function setQty(pointId: string, productId: string, qty: number) {
    // Krok DAGOLD — ryby AVIS-D dziesiętne (0.1), reszta całkowite.
    const prod = products.find((pp) => pp.id === productId)
    const norm = normalizeQty(prod?.supplier_id ?? null, qty)
    setCarts((prev) => {
      const pc = { ...(prev[pointId] ?? {}) }
      if (!(norm > 0)) delete pc[productId]
      else pc[productId] = Math.min(9999, norm)
      return { ...prev, [pointId]: pc }
    })
  }
  function pointItemCount(pointId: string): number {
    const pc = carts[pointId]
    if (!pc) return 0
    return Object.values(pc).filter((q) => q > 0).length
  }

  // ─── Punkty ──────────────────────────────────────────────────────────────────
  function updatePoint(localId: string, patch: Partial<FormPoint>) {
    setPoints((prev) =>
      prev.map((p) => {
        if (p.localId !== localId) return p
        const next = { ...p, ...patch, prefilled: false }
        // Poprawka 2 — edycja adresu odłącza punkt od zapisanego (znów dostępny w pickerze).
        if ('ulica' in patch || 'miasto' in patch) next.sourceSavedId = undefined
        return next
      }),
    )
  }
  function addPoint() {
    const np = emptyPoint()
    setPoints((prev) => [...prev, np])
    setCarts((c) => ({ ...c, [np.localId]: {} }))
  }
  function removePoint(localId: string) {
    if (points.length <= 2) return
    const remaining = points.filter((p) => p.localId !== localId)
    setPoints(remaining)
    setCarts((c) => {
      const n = { ...c }
      delete n[localId]
      return n
    })
    if (activePointId === localId) setActivePointId(remaining[0]?.localId ?? '')
  }
  // Poprawka — Wyczyść: czyści pola adresu TEGO punktu + odłącza zapisany punkt
  // (sourceSavedId → undefined → wraca do pickera). Koszyk (carts po localId) ZOSTAJE.
  function clearPoint(localId: string) {
    setPoints((prev) =>
      prev.map((p) =>
        p.localId === localId
          ? {
              ...p,
              label: '',
              ulica: '',
              miasto: '',
              kod_pocztowy: '',
              odbiorca_imie: '',
              odbiorca_telefon: '',
              prefilled: false,
              sourceSavedId: undefined,
            }
          : p,
      ),
    )
  }
  function setMode(mode: 'jeden' | 'kilka') {
    if (mode === deliveryMode) return
    if (mode === 'kilka') {
      setDeliveryMode('kilka')
      if (points.length < 2) {
        const np = emptyPoint()
        setPoints([...points, np])
        setCarts({ ...carts, [np.localId]: {} })
      }
      setActivePointId(points[0]?.localId ?? '')
    } else {
      const first = points[0]
      setDeliveryMode('jeden')
      setWspolnaData(false)
      setDocumentsMode('wspolna')
      setPoints([first])
      setCarts({ [first.localId]: carts[first.localId] ?? {} })
      setActivePointId(first.localId)
    }
  }

  // ─── Picker zapisanych punktów (profil) ───────────────────────────────────────
  // Poprawka 1 — klik karty wypełnia NASTĘPNY WOLNY punkt (jeden — ten jedyny;
  // kilka — pierwszy pusty albo wybrany numer, a gdy wszystkie pełne → nowy punkt).
  function applySavedPoint(sp: SavedPoint, explicitIdx?: number) {
    // Poprawka 2 — nie pozwól użyć tego samego zapisanego punktu dwa razy (UI też go dim-uje).
    if (points.some((p) => p.sourceSavedId === sp.id)) return
    const fill = (p: FormPoint): FormPoint => ({
      ...p,
      label: sp.nazwa ?? '',
      ulica: sp.ulica ?? '',
      miasto: sp.miasto ?? '',
      kod_pocztowy: sp.kod_pocztowy ?? '',
      odbiorca_imie: sp.odbiorca_imie ?? '',
      odbiorca_telefon: sp.odbiorca_telefon ?? '',
      prefilled: true,
      sourceSavedId: sp.id,
    })
    const isEmpty = (p: FormPoint) => p.ulica.trim() === '' && p.miasto.trim() === ''

    let targetId: string | undefined
    if (deliveryMode === 'jeden') {
      targetId = points[0]?.localId
    } else if (typeof explicitIdx === 'number' && points[explicitIdx]) {
      targetId = points[explicitIdx].localId
    } else {
      targetId = points.find(isEmpty)?.localId
    }

    if (targetId) {
      const tId = targetId
      setPoints((prev) => prev.map((p) => (p.localId === tId ? fill(p) : p)))
      if (deliveryMode === 'kilka') setActivePointId(tId)
    } else {
      // kilka + wszystkie punkty wypełnione → dodaj nowy i wypełnij go.
      const np = fill(emptyPoint())
      setPoints((prev) => [...prev, np])
      setCarts((c) => ({ ...c, [np.localId]: {} }))
      setActivePointId(np.localId)
    }
    setSource('new')
    setActionNotice(`Wczytano punkt "${sp.nazwa || sp.miasto || 'z profilu'}" — sprawdź i popraw.`)
  }

  // ─── Akcje ekranu startowego ──────────────────────────────────────────────────
  function startNew() {
    const p = emptyPoint()
    setDeliveryMode('jeden')
    setDocumentsMode('wspolna')
    setPoints([p])
    setCarts({ [p.localId]: {} })
    setActivePointId(p.localId)
    setWspolnaData(false)
    setContactPrefilled(Boolean(client && (client.phone || client.email)))
    if (podgrupy[0]) setActivePodgrupa(podgrupy[0].key)
    setSource('new')
    setActionNotice(null)
    setActionError(null)
    setScreen('form')
    setStep(1)
  }

  function hydrateFromDelivery(
    dps: TemplatePoint[],
    mode: string | undefined,
    docs: string | undefined,
    legacyAddr: string | null,
    legacyDate: string | null,
    items: Array<{ product_id: string; qty: number; delivery_point_index?: number }>,
  ) {
    let np: FormPoint[]
    if (dps.length > 0) {
      np = dps.map((dp) =>
        emptyPoint({
          label: dp.label ?? '',
          ulica: dp.ulica ?? '',
          miasto: dp.miasto ?? '',
          kod_pocztowy: dp.kod_pocztowy ?? '',
          typ: dp.typ === 'odbior' ? 'odbior' : 'dostawa',
          termin_typ: dp.termin_typ === 'data' ? 'data' : 'najblizszy',
          preferred_date: dp.preferred_date ?? '',
          odbiorca_imie: dp.odbiorca_imie ?? '',
          odbiorca_telefon: dp.odbiorca_telefon ?? '',
          prefilled: true,
        }),
      )
    } else {
      np = [
        emptyPoint({
          ulica: legacyAddr ?? '',
          preferred_date: legacyDate ?? '',
          termin_typ: legacyDate ? 'data' : 'najblizszy',
          prefilled: true,
        }),
      ]
    }
    const finalMode = mode === 'kilka' && np.length >= 2 ? 'kilka' : 'jeden'
    setDeliveryMode(finalMode)
    setDocumentsMode(docs === 'osobne' ? 'osobne' : 'wspolna')
    setPoints(np)
    const c: Record<string, Record<string, number>> = {}
    np.forEach((p) => (c[p.localId] = {}))
    for (const it of items) {
      if (!it || it.qty <= 0) continue
      const prod = products.find((pp) => pp.id === it.product_id)
      if (!prod || prod.in_stock === false) continue
      const idx =
        typeof it.delivery_point_index === 'number' && it.delivery_point_index < np.length
          ? it.delivery_point_index
          : 0
      const nq = normalizeQty(prod.supplier_id ?? null, it.qty)
      if (nq > 0) c[np[idx].localId][it.product_id] = Math.min(9999, nq)
    }
    setCarts(c)
    setActivePointId(np[0].localId)
    if (podgrupy[0]) setActivePodgrupa(podgrupy[0].key)
    setContactPrefilled(Boolean(client && (client.phone || client.email)))
  }

  function doRepeat() {
    const d = lastDataRef.current
    if (!d || !d.ok || !d.has_history) {
      setActionError('Brak wcześniejszych zamówień.')
      return
    }
    if (!d.items || d.items.length === 0) {
      setActionError('Wszystkie pozycje z poprzedniego zamówienia są obecnie niedostępne.')
      return
    }
    hydrateFromDelivery(
      Array.isArray(d.delivery_points) ? d.delivery_points : [],
      d.delivery_mode,
      d.documents_mode,
      d.delivery_address ?? null,
      d.preferred_delivery_date ?? null,
      d.items,
    )
    setSource('repeat')
    setWspolnaData(false)
    setActionNotice(
      d.skipped > 0
        ? `Wczytano ostatnie zamówienie (pominięto ${d.skipped} niedostępnych pozycji). Sprawdź i popraw.`
        : 'Wczytano ostatnie zamówienie. Sprawdź i popraw.',
    )
    setActionError(null)
    setScreen('form')
    setStep(1)
  }

  async function loadTemplates() {
    setTemplatesLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/orders/${token}/templates`, { method: 'GET' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? 'Nie udało się załadować szablonów.')
        return
      }
      setTemplates(data.templates ?? [])
      setShowTemplates(true)
    } catch (e) {
      setActionError('Błąd sieci przy ładowaniu szablonów.')
    } finally {
      setTemplatesLoading(false)
    }
  }

  function applyTemplate(t: Template) {
    hydrateFromDelivery(
      Array.isArray(t.delivery_points) ? t.delivery_points : [],
      t.delivery_mode,
      t.documents_mode,
      null,
      null,
      t.pozycje ?? [],
    )
    setWspolnaData(Boolean(t.wspolna_data))
    setWspolnyTerminTyp(t.wspolny_termin_typ === 'data' ? 'data' : 'najblizszy')
    setWspolnyPreferredDate(t.wspolny_preferred_date ?? '')
    setSource('template')
    setShowTemplates(false)
    setActionNotice(`Wczytano szablon: ${t.nazwa}. Sprawdź i popraw.`)
    setActionError(null)
    setScreen('form')
    setStep(1)
  }

  // ─── Payload builders ──────────────────────────────────────────────────────────
  function buildPointsPayload() {
    return points.map((p) => {
      const useWspolny = deliveryMode === 'kilka' && wspolnaData
      const tt = useWspolny ? wspolnyTerminTyp : p.termin_typ
      const pd = tt === 'data' ? (useWspolny ? wspolnyPreferredDate : p.preferred_date) || null : null
      return {
        label: p.label.trim() || null,
        ulica: p.ulica.trim(),
        miasto: p.miasto.trim(),
        kod_pocztowy: p.kod_pocztowy.trim() || null,
        typ: p.typ,
        termin_typ: tt,
        preferred_date: pd,
        odbiorca_imie: p.odbiorca_imie.trim() || null,
        odbiorca_telefon: p.odbiorca_telefon.trim() || null,
      }
    })
  }
  function buildItemsPayload() {
    const items: Array<{ product_id: string; qty: number; delivery_point_index: number }> = []
    points.forEach((p, idx) => {
      const pc = carts[p.localId] ?? {}
      for (const [pid, q] of Object.entries(pc)) {
        if (q > 0) items.push({ product_id: pid, qty: q, delivery_point_index: idx })
      }
    })
    return items
  }

  // ─── Walidacja ─────────────────────────────────────────────────────────────────
  const contactValid =
    contactPerson.trim().length >= 2 &&
    contactPhone.trim().length >= 9 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())
  const pointsAddrValid =
    points.length >= 1 &&
    // Bug B — odbiór własny (typ='odbior') NIE wymaga adresu; dostawa wymaga ulica+miasto.
    points.every(
      (p) => p.typ === 'odbior' || (p.ulica.trim().length >= 2 && p.miasto.trim().length >= 2),
    ) &&
    (deliveryMode === 'jeden' || points.length >= 2)
  const terminValid =
    deliveryMode === 'kilka' && wspolnaData
      ? wspolnyTerminTyp !== 'data' || wspolnyPreferredDate.length > 0
      : points.every((p) => p.termin_typ !== 'data' || p.preferred_date.length > 0)
  const itemsValid = points.every((p) => pointItemCount(p.localId) > 0) && totalItems > 0
  const canGoStep2 = pointsAddrValid && terminValid
  const canSubmit = contactValid && pointsAddrValid && terminValid && itemsValid && !submitting

  // ─── Submit ──────────────────────────────────────────────────────────────────
  async function submitOrder() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/orders/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_person: contactPerson.trim(),
          contact_phone: contactPhone.trim(),
          contact_email: contactEmail.trim(),
          customer_notes: notes.trim() || null,
          delivery_mode: deliveryMode,
          documents_mode: deliveryMode === 'kilka' ? documentsMode : 'wspolna',
          delivery_points: buildPointsPayload(),
          marketing_consent: marketingConsent,
          items: buildItemsPayload(),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? 'Wystąpił błąd przy zapisie zamówienia.')
        setSubmitting(false)
        return
      }
      setSubmitResult(data as SubmitOk)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveTemplate() {
    const items = buildItemsPayload()
    if (items.length === 0) {
      setActionError('Brak pozycji — nie można zapisać szablonu.')
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
        body: JSON.stringify({
          nazwa: trimmed,
          pozycje: items,
          delivery_mode: deliveryMode,
          documents_mode: deliveryMode === 'kilka' ? documentsMode : 'wspolna',
          delivery_points: buildPointsPayload(),
          wspolna_data: deliveryMode === 'kilka' ? wspolnaData : false,
          wspolny_termin_typ: deliveryMode === 'kilka' && wspolnaData ? wspolnyTerminTyp : null,
          wspolny_preferred_date:
            deliveryMode === 'kilka' && wspolnaData && wspolnyTerminTyp === 'data'
              ? wspolnyPreferredDate || null
              : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? 'Nie udało się zapisać szablonu.')
        return
      }
      setTemplates(null)
      setActionNotice(`Szablon "${trimmed}" zapisany.`)
    } catch (e) {
      setActionError('Błąd sieci przy zapisie szablonu.')
    }
  }

  // ─── Style helpers ─────────────────────────────────────────────────────────────
  const inputCls = (prefilled: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-[#1F3A5F] ${
      prefilled ? 'bg-emerald-50 border-emerald-300' : 'border-slate-300'
    }`
  const anyPrefilled = points.some((p) => p.prefilled) || contactPrefilled
  const pointName = (p: FormPoint, idx: number) =>
    p.label.trim() || p.miasto.trim() || `Punkt ${idx + 1}`

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl bg-white shadow-sm min-h-screen">
      {/* Nagłówek */}
      <div className="bg-[#1F3A5F] text-white px-6 py-5">
        <h1 className="text-[22px] font-bold leading-tight">Zamówienie — {client?.title ?? 'klient'}</h1>
        {initial.order.order_number && (
          <div className="text-[12px] text-white/70 mt-1 font-mono">{initial.order.order_number}</div>
        )}
      </div>

      {/* Toast */}
      {(actionNotice || actionError) && (
        <div
          className={`px-6 py-2.5 text-sm border-b ${
            actionError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
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

      {/* ═══ Ekran potwierdzenia (terminal) ═══ */}
      {submitResult ? (
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
      ) : screen === 'start' ? (
        /* ═══ Ekran startowy A1 ═══ */
        <div className="p-5">
          {client && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Oferta przygotowana dla</div>
              <div className="font-semibold text-slate-900 leading-tight">{client.title}</div>
              <div className="text-xs text-slate-500 mt-1">NIP {client.nip}</div>
            </div>
          )}
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Witaj, {firstWord}!</h2>
          <p className="text-sm text-slate-600 mb-5">Jak chcesz złożyć zamówienie?</p>

          <div className="space-y-3">
            {lastHasHistory && (
              <button
                type="button"
                onClick={doRepeat}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-[#1F3A5F] text-left hover:bg-[#1F3A5F] hover:text-white transition group"
              >
                <RotateCcw className="w-6 h-6 shrink-0 text-[#1F3A5F] group-hover:text-white" />
                <div>
                  <div className="font-bold text-[15px]">Powtórz ostatnie zamówienie</div>
                  <div className="text-xs opacity-70">Wczytaj produkty i dostawę z poprzedniego zamówienia</div>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={loadTemplates}
              disabled={templatesLoading}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-[#1F3A5F] text-left hover:bg-[#1F3A5F] hover:text-white transition group disabled:opacity-50"
            >
              {templatesLoading ? (
                <Loader2 className="w-6 h-6 shrink-0 animate-spin text-[#1F3A5F] group-hover:text-white" />
              ) : (
                <Star className="w-6 h-6 shrink-0 text-[#1F3A5F] group-hover:text-white" />
              )}
              <div>
                <div className="font-bold text-[15px]">Użyj szablonu</div>
                <div className="text-xs opacity-70">Gotowy zestaw produktów i punktów dostawy</div>
              </div>
            </button>

            {showTemplates && templates && (
              <div className="bg-white border border-slate-200 rounded-xl p-3 max-h-[280px] overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-slate-700">Twoje szablony ({templates.length})</div>
                  <button
                    type="button"
                    onClick={() => setShowTemplates(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    zamknij
                  </button>
                </div>
                {templates.length === 0 ? (
                  <div className="text-xs text-slate-500 italic py-2">
                    Brak zapisanych szablonów. Złóż zamówienie i zapisz je jako szablon w podsumowaniu.
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
                          {(t.pozycje?.length ?? 0)} {(t.pozycje?.length ?? 0) === 1 ? 'pozycja' : 'pozycji'}
                          {t.delivery_mode === 'kilka' && t.delivery_points
                            ? ` · ${t.delivery_points.length} punktów`
                            : ''}
                          {' · '}
                          {t.utworzyl === 'vadym' ? 'od Vadyma' : 'mój'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={startNew}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-[#1F3A5F] text-white text-left hover:bg-[#264a76] transition"
            >
              <FilePlus className="w-6 h-6 shrink-0" />
              <div>
                <div className="font-bold text-[15px]">Nowe zamówienie</div>
                <div className="text-xs opacity-80">Wybierz produkty i punkty dostawy od początku</div>
              </div>
            </button>
          </div>
        </div>
      ) : (
        /* ═══ Formularz: stepper + kroki ═══ */
        <>
          {/* Stepper */}
          <div className="px-6 pt-4 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              {[
                { n: 1 as const, label: 'Dostawa' },
                { n: 2 as const, label: 'Produkty' },
                { n: 3 as const, label: 'Podsumowanie' },
              ].map((s, i) => {
                const reachable =
                  s.n === 1 || (s.n === 2 && canGoStep2) || (s.n === 3 && canGoStep2 && itemsValid)
                return (
                  <div key={s.n} className="flex items-center gap-2 flex-1">
                    <button
                      type="button"
                      disabled={!reachable && s.n > step}
                      onClick={() => reachable && setStep(s.n)}
                      className={`flex items-center gap-2 ${reachable ? '' : 'opacity-40 cursor-not-allowed'}`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold ${
                          step === s.n
                            ? 'bg-[#1F3A5F] text-white'
                            : step > s.n
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {step > s.n ? '✓' : s.n}
                      </span>
                      <span
                        className={`text-[13px] font-semibold ${step === s.n ? 'text-[#1F3A5F]' : 'text-slate-500'}`}
                      >
                        {s.label}
                      </span>
                    </button>
                    {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── KROK 1: DOSTAWA ─── */}
          {step === 1 && (
            <div className="p-5 space-y-4">
              {source === 'new' && anyPrefilled && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-900">
                  Dane z profilu — sprawdź i popraw przed wysłaniem.
                </div>
              )}

              {/* Picker zapisanych punktów — Poprawka 1: ONE-CLICK (klik karty = zastosuj) */}
              {savedPoints.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#1F3A5F]" /> Twoje zapisane punkty — kliknij aby użyć
                  </div>
                  <div className="space-y-1.5">
                    {savedPoints.map((sp) => {
                      const usedIdx = points.findIndex((p) => p.sourceSavedId === sp.id)
                      const used = usedIdx >= 0
                      return (
                        <div
                          key={sp.id}
                          className={`rounded-lg border transition overflow-hidden ${
                            used
                              ? 'border-emerald-300 opacity-80'
                              : 'border-slate-200 hover:border-[#1F3A5F]'
                          }`}
                          style={used ? { background: '#ECFDF5' } : undefined}
                        >
                          <button
                            type="button"
                            onClick={() => applySavedPoint(sp)}
                            disabled={used}
                            className={`w-full text-left flex items-start gap-2 px-3 py-2 ${
                              used ? 'cursor-default' : 'hover:bg-[#eef3f9] cursor-pointer'
                            }`}
                          >
                            <MapPin className="w-4 h-4 text-[#1F3A5F] mt-0.5 shrink-0" />
                            <span className="text-xs flex-1 min-w-0">
                              <span className="font-semibold text-slate-800">{sp.nazwa || sp.miasto || 'Punkt'}</span>
                              <span className="text-slate-500">
                                {' — '}
                                {[sp.ulica, [sp.kod_pocztowy, sp.miasto].filter(Boolean).join(' ')]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                              {used && (
                                <span className="block text-[11px] font-semibold text-emerald-700 mt-0.5">
                                  ✓ użyty w Punkcie {usedIdx + 1}
                                </span>
                              )}
                            </span>
                          </button>
                          {deliveryMode === 'kilka' && (
                            <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
                              <span className="text-[10px] text-slate-400 mr-0.5">wstaw do:</span>
                              {points.map((p, i) => {
                                const isHere = p.sourceSavedId === sp.id
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => applySavedPoint(sp, i)}
                                    disabled={used}
                                    className={`px-2 h-7 rounded border text-[11px] font-semibold transition ${
                                      isHere
                                        ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                                        : used
                                          ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                                          : 'border-[#1F3A5F] text-[#1F3A5F] hover:bg-[#1F3A5F] hover:text-white'
                                    }`}
                                  >
                                    → Punkt {i + 1}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1.5">
                    {deliveryMode === 'kilka'
                      ? 'Klik wypełni następny wolny punkt — lub wybierz numer punktu. Możesz potem poprawić.'
                      : 'Klik wypełni adres dostawy danymi z profilu — możesz potem poprawić.'}
                  </div>
                </div>
              )}

              {/* Radio jeden/kilka */}
              <div>
                <div className="text-[13px] font-semibold text-slate-700 mb-2">Ile punktów dostawy?</div>
                <div className="flex gap-2">
                  {(['jeden', 'kilka'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition ${
                        deliveryMode === m
                          ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white'
                          : 'border-slate-300 text-slate-600 hover:border-[#1F3A5F]'
                      }`}
                    >
                      {m === 'jeden' ? 'Jeden punkt' : 'Kilka punktów'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wspólna data (kilka) */}
              {deliveryMode === 'kilka' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wspolnaData}
                      onChange={(e) => setWspolnaData(e.target.checked)}
                      className="w-4 h-4 accent-[#1F3A5F]"
                    />
                    <span className="text-[13px] font-semibold text-slate-700">Wspólna data dostawy dla wszystkich punktów</span>
                  </label>
                  {wspolnaData && (
                    <div className="mt-2 pl-6 space-y-2">
                      <div className="flex gap-2">
                        {(['najblizszy', 'data'] as const).map((tt) => (
                          <button
                            key={tt}
                            type="button"
                            onClick={() => setWspolnyTerminTyp(tt)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                              wspolnyTerminTyp === tt ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white' : 'border-slate-300 text-slate-600'
                            }`}
                          >
                            {tt === 'najblizszy' ? 'Najbliższy możliwy' : 'Konkretna data'}
                          </button>
                        ))}
                      </div>
                      {wspolnyTerminTyp === 'data' && (
                        <div>
                          <input
                            type="date"
                            value={wspolnyPreferredDate}
                            onChange={(e) => setWspolnyPreferredDate(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#1F3A5F]"
                          />
                          <div className="text-[10px] text-slate-400 mt-1">
                            Datę potwierdzimy mailowo — to preferencja, nie gwarancja.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Karty punktów */}
              <div className="space-y-4">
                {points.map((p, idx) => (
                  <div
                    key={p.localId}
                    className={`rounded-lg overflow-hidden ${
                      deliveryMode === 'kilka' ? 'border-2 border-[#1F3A5F] shadow-md' : 'border border-slate-200'
                    }`}
                  >
                    {/* Nagłówek punktu — pasek navy (kilka) / slate (jeden), spójnie z krokiem 3 */}
                    <div
                      className={`flex items-center justify-between ${
                        deliveryMode === 'kilka'
                          ? 'bg-[#1F3A5F] px-4 py-2.5'
                          : 'bg-slate-50 px-3 py-2 border-b border-slate-200'
                      }`}
                    >
                      <div className={`text-[13px] font-bold ${deliveryMode === 'kilka' ? 'text-white' : 'text-[#1F3A5F]'}`}>
                        {deliveryMode === 'kilka' ? `Punkt ${idx + 1}` : 'Adres dostawy'}
                        {p.prefilled && (
                          <span
                            className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              deliveryMode === 'kilka' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            z profilu
                          </span>
                        )}
                      </div>
                      {/* Wyczyść / Usuń punkt — przyciski pod polami karty (footer) */}
                    </div>

                    {/* Pola punktu */}
                    <div className="p-3 space-y-2 bg-white">

                    {deliveryMode === 'kilka' && (
                      <Field label="Nazwa punktu" hint="np. Magazyn główny, Sklep Centrum">
                        <input
                          type="text"
                          value={p.label}
                          onChange={(e) => updatePoint(p.localId, { label: e.target.value })}
                          placeholder="Nazwa (opcjonalnie)"
                          className={inputCls(p.prefilled)}
                        />
                      </Field>
                    )}

                    <Field label="Ulica i numer *">
                      <input
                        type="text"
                        value={p.ulica}
                        onChange={(e) => updatePoint(p.localId, { ulica: e.target.value })}
                        placeholder="ul. ..."
                        className={inputCls(p.prefilled)}
                      />
                    </Field>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Kod pocztowy">
                        <input
                          type="text"
                          value={p.kod_pocztowy}
                          onChange={(e) => updatePoint(p.localId, { kod_pocztowy: e.target.value })}
                          placeholder="00-000"
                          className={inputCls(p.prefilled)}
                        />
                      </Field>
                      <div className="col-span-2">
                        <Field label="Miasto *">
                          <input
                            type="text"
                            value={p.miasto}
                            onChange={(e) => updatePoint(p.localId, { miasto: e.target.value })}
                            placeholder="Miasto"
                            className={inputCls(p.prefilled)}
                          />
                        </Field>
                      </div>
                    </div>

                    <Field label="Typ punktu">
                      <div className="flex gap-2">
                        {(['dostawa', 'odbior'] as const).map((tp) => (
                          <button
                            key={tp}
                            type="button"
                            onClick={() => updatePoint(p.localId, { typ: tp })}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                              p.typ === tp ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white' : 'border-slate-300 text-slate-600'
                            }`}
                          >
                            {tp === 'dostawa' ? 'Dostawa' : 'Odbiór własny'}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Termin per-punkt (ukryty gdy wspólna data) */}
                    {!(deliveryMode === 'kilka' && wspolnaData) && (
                      <Field label="Termin">
                        <div className="flex gap-2 mb-2">
                          {(['najblizszy', 'data'] as const).map((tt) => (
                            <button
                              key={tt}
                              type="button"
                              onClick={() => updatePoint(p.localId, { termin_typ: tt })}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                                p.termin_typ === tt ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white' : 'border-slate-300 text-slate-600'
                              }`}
                            >
                              {tt === 'najblizszy' ? 'Najbliższy możliwy' : 'Konkretna data'}
                            </button>
                          ))}
                        </div>
                        {p.termin_typ === 'data' && (
                          <>
                            <input
                              type="date"
                              value={p.preferred_date}
                              onChange={(e) => updatePoint(p.localId, { preferred_date: e.target.value })}
                              className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#1F3A5F]"
                            />
                            <div className="text-[10px] text-slate-400 mt-1">
                              Datę potwierdzimy mailowo — to preferencja, nie gwarancja.
                            </div>
                          </>
                        )}
                      </Field>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Odbiorca — imię">
                        <input
                          type="text"
                          value={p.odbiorca_imie}
                          onChange={(e) => updatePoint(p.localId, { odbiorca_imie: e.target.value })}
                          placeholder="Imię i nazwisko"
                          className={inputCls(p.prefilled)}
                        />
                      </Field>
                      <Field label="Odbiorca — telefon">
                        <input
                          type="tel"
                          value={p.odbiorca_telefon}
                          onChange={(e) => updatePoint(p.localId, { odbiorca_telefon: e.target.value })}
                          placeholder="+48 ..."
                          className={inputCls(p.prefilled)}
                        />
                      </Field>
                    </div>

                      {/* Poprawka — przyciski Wyczyść / Usuń punkt */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => clearPoint(p.localId)}
                          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition"
                        >
                          Wyczyść
                        </button>
                        {deliveryMode === 'kilka' && points.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removePoint(p.localId)}
                            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition hover:bg-rose-50"
                            style={{ borderColor: '#FCA5A5', color: '#DC2626' }}
                          >
                            Usuń punkt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {deliveryMode === 'kilka' && (
                  <button
                    type="button"
                    onClick={addPoint}
                    className="w-full px-4 py-2.5 rounded-lg border-2 border-dashed border-[#1F3A5F] text-[#1F3A5F] text-sm font-semibold hover:bg-[#1F3A5F]/5"
                  >
                    + Dodaj kolejny punkt
                  </button>
                )}
              </div>

              {/* Nawigacja */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScreen('start')}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm flex items-center gap-1 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Wstecz
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canGoStep2}
                  className="flex-1 bg-[#1F3A5F] hover:bg-[#264a76] text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Dalej — produkty <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {!canGoStep2 && (
                <div className="text-[11px] text-slate-400 text-center">
                  Uzupełnij ulicę i miasto w każdym punkcie{deliveryMode === 'kilka' ? ' (min. 2 punkty)' : ''}.
                </div>
              )}
            </div>
          )}

          {/* ─── KROK 2: PRODUKTY ─── */}
          {step === 2 && (
            <div className="flex flex-col">
              {/* Zakładki punktów (kilka) */}
              {deliveryMode === 'kilka' && (
                <div className="px-4 pt-3 flex gap-2 overflow-x-auto border-b border-slate-200">
                  {points.map((p, idx) => (
                    <button
                      key={p.localId}
                      type="button"
                      onClick={() => setActivePointId(p.localId)}
                      className={`shrink-0 px-3 py-2 rounded-t-lg text-[13px] font-semibold border-b-2 ${
                        activePointId === p.localId
                          ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                          : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      {pointName(p, idx)}
                      <span className="ml-1.5 opacity-80">({pointItemCount(p.localId)})</span>
                    </button>
                  ))}
                </div>
              )}

              {deliveryMode === 'kilka' && (
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 text-[13px] text-slate-600">
                  Towary dla:{' '}
                  <span className="font-semibold text-[#1F3A5F]">
                    {pointName(points.find((p) => p.localId === activePointId) ?? points[0], Math.max(0, points.findIndex((p) => p.localId === activePointId)))}
                  </span>
                </div>
              )}

              {/* Zakładki podgrup */}
              <div className="px-4 pt-3 flex gap-2 flex-wrap">
                {podgrupy.map((pg) => {
                  const apId = deliveryMode === 'kilka' ? activePointId : points[0].localId
                  const cnt = pg.items.filter((it) => (carts[apId]?.[it.id] ?? 0) > 0).length
                  return (
                    <button
                      key={pg.key}
                      type="button"
                      onClick={() => setActivePodgrupa(pg.key)}
                      className={`px-3 py-2 rounded-lg text-[13px] font-bold transition ${
                        activePodgrupa === pg.key
                          ? 'bg-[#1F3A5F] text-white'
                          : 'bg-[#ccd6e3] text-[#1F3A5F] hover:bg-[#bfcbdb]'
                      }`}
                      style={activePodgrupa === pg.key ? {} : { borderLeft: '3px solid #1F3A5F' }}
                    >
                      {pg.label}
                      {cnt > 0 && <span className="ml-1.5 opacity-90">· {cnt}</span>}
                    </button>
                  )
                })}
              </div>
              {/* Krok DAGOLD — wskaźnik rabatu wolumenowego dla AKTYWNEJ grupy (na górze). */}
              {(() => {
                const pg = podgrupy.find((g) => g.key === activePodgrupa)
                if (!pg || !pg.sid) return null
                const activeInd =
                  pg.sid === GLOBAL_FOOD_SUPPLIER_ID
                    ? individualDiscounts.kalmar
                    : individualDiscounts.ogolna
                if (activeInd > 0) {
                  return (
                    <div className="mx-4 mt-2">
                      <div
                        className="rounded-lg px-3 py-2.5"
                        style={{ background: '#eef3f9', border: '1px solid #c7d5e6' }}
                      >
                        <div className="text-[13px] font-bold text-[#1F3A5F]">
                          Rabat indywidualny: −{Math.round(activeInd * 100)}% (cena stała dla tej grupy)
                        </div>
                      </div>
                    </div>
                  )
                }
                const net = groupNets[pg.sid] ?? 0
                const pct = groupDisc[pg.sid] ?? 0
                const gap = nextTierGap(pg.sid, net)
                return (
                  <div className="mx-4 mt-2">
                    <div
                      className="rounded-lg px-3 py-2.5"
                      style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}
                    >
                      <div className="text-[11px] font-semibold text-amber-900/80">
                        {pg.label}: {fmt(net)} zł ·{' '}
                        {pct > 0 ? `rabat −${Math.round(pct * 100)}%` : 'bez rabatu'}
                      </div>
                      {gap ? (
                        <div className="mt-1 text-[13px] text-slate-700 leading-snug">
                          Jeszcze{' '}
                          <span className="text-[19px] font-extrabold text-[#1F3A5F] align-middle">
                            {fmt(gap.gap)} zł
                          </span>{' '}
                          do rabatu{' '}
                          <span className="font-bold text-[#1F3A5F]">
                            −{Math.round(gap.toPct * 100)}%
                          </span>{' '}
                          — <span className="font-bold text-emerald-700">ceny spadną</span>.
                        </div>
                      ) : (
                        <div className="mt-1 text-[13px] font-bold text-emerald-700">
                          ✓ Masz najwyższy rabat w tej grupie.
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Lista produktów aktywnej podgrupy */}
              <div className="p-4 space-y-2 max-h-[52vh] overflow-y-auto">
                {(() => {
                  const apId = deliveryMode === 'kilka' ? activePointId : points[0].localId
                  const pg = podgrupy.find((g) => g.key === activePodgrupa) ?? podgrupy[0]
                  if (!pg) return <div className="text-sm text-slate-400">Brak produktów.</div>
                  return pg.items.map((p) => {
                    const isPomidor = /pomidor/i.test(p.name)
                    const price = productUnitPrice(p)
                    const originalPrice = p.prices.maly
                    const qty = getQty(apId, p.id)
                    // Przejście 2C — seafood nigdy nie jest "Brak w Hurcie" (zawsze standard).
                    const whAutoUnavailable =
                      isAutoWH && p.grupa !== 'owoce_morza' && p.prices.hurt_wh == null
                    const unavailable = !p.in_stock || whAutoUnavailable
                    const unit = p.unit ?? 'szt'
                    return (
                      <div
                        key={p.id}
                        className={`bg-white px-3 py-3 border border-[#e4e9ef] rounded-lg flex items-start gap-3 ${
                          unavailable ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 mb-1 flex-wrap">
                            <div className="text-[15px] font-semibold text-[#15202e] leading-snug">{p.name}</div>
                            {!p.in_stock && (
                              <span className="shrink-0 text-[11px] bg-[#f3d6d6] text-[#9a3434] px-[7px] py-[2px] rounded font-bold">
                                niedostępny
                              </span>
                            )}
                            {isPomidor && p.in_stock && (
                              <span className="shrink-0 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                                Ostatnie
                              </span>
                            )}
                            {/* Faza 1 DAGOLD — badge dostępności (display-only, nie wpływa na cenę). */}
                            {p.in_stock && p.dostepnosc === 'na_zamowienie' && (
                              <span className="shrink-0 text-[10px] bg-[#dbeafe] text-[#1e40af] px-1.5 py-0.5 rounded font-bold uppercase">
                                Na zamówienie
                              </span>
                            )}
                            {p.in_stock && p.dostepnosc !== 'na_zamowienie' && (
                              <span className="shrink-0 text-[10px] bg-[#dcfce7] text-[#166534] px-1.5 py-0.5 rounded font-bold uppercase">
                                Od ręki
                              </span>
                            )}
                          </div>
                          {p.gramatura && <div className="text-[13px] text-slate-500 mb-1">{p.gramatura}</div>}
                          {unavailable ? (
                            <div className="text-[13px] text-slate-400 italic">—</div>
                          ) : (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[15px] font-bold text-[#1F3A5F]">
                                {fmt(price)} zł/{unit}
                              </span>
                              {price < originalPrice && (
                                <span className="text-[11px] text-slate-400 line-through">{fmt(originalPrice)} zł</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setQty(apId, p.id, qty - 1)}
                            disabled={qty <= 0 || unavailable}
                            className="w-[38px] h-[38px] rounded-lg bg-white flex items-center justify-center text-[#1F3A5F] disabled:opacity-30 hover:bg-[#1F3A5F] hover:text-white transition"
                            style={{ border: '1.5px solid #1F3A5F' }}
                            aria-label="Zmniejsz"
                          >
                            <Minus className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            step={p.supplier_id === AVIS_D_SUPPLIER_ID ? 0.1 : 1}
                            inputMode={
                              p.supplier_id === AVIS_D_SUPPLIER_ID ? 'decimal' : 'numeric'
                            }
                            value={qty === 0 ? '' : qty}
                            disabled={unavailable}
                            placeholder="0"
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const v = e.target.value
                              setQty(apId, p.id, v === '' ? 0 : Number(v.replace(',', '.')) || 0)
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '') setQty(apId, p.id, 0)
                            }}
                            className="w-[58px] h-[38px] text-center text-[16px] font-semibold rounded-lg outline-none focus:border-[#1F3A5F] disabled:opacity-30 disabled:bg-slate-50"
                            style={{ border: '1.5px solid #9fb0c4' }}
                          />
                          <button
                            type="button"
                            onClick={() => setQty(apId, p.id, qty + 1)}
                            disabled={unavailable}
                            className="w-[38px] h-[38px] rounded-lg bg-white flex items-center justify-center text-[#1F3A5F] disabled:opacity-30 hover:bg-[#1F3A5F] hover:text-white transition"
                            style={{ border: '1.5px solid #1F3A5F' }}
                            aria-label="Zwiększ"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>

              {/* Pasek dół */}
              <div
                className="sticky bottom-0 bg-[#1F3A5F] text-white px-4 py-3 flex items-center gap-3 flex-wrap"
                style={{ boxShadow: '0 -4px 12px rgba(0,0,0,0.12)' }}
              >
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[13px] text-white/80 hover:text-white flex items-center gap-1 shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" /> Dostawa
                </button>
                <div className="flex-1 min-w-0 text-[14px] font-bold leading-tight">
                  Koszyk: {totalItems} {totalItems === 1 ? 'pozycja' : 'pozycji'}
                  <span className="block text-[12px] font-medium text-white/80">Suma netto: {fmt(totalNet)} zł</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!itemsValid}
                  className="px-4 py-2 rounded-lg bg-white text-[#1F3A5F] font-bold text-[14px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#eef3f9] shrink-0"
                >
                  Dalej <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {!itemsValid && (
                <div className="px-5 py-2 text-[11px] text-slate-400 text-center">
                  {deliveryMode === 'kilka'
                    ? 'Każdy punkt musi mieć przynajmniej jeden produkt.'
                    : 'Dodaj przynajmniej jeden produkt.'}
                </div>
              )}
            </div>
          )}

          {/* ─── KROK 3: PODSUMOWANIE ─── */}
          {step === 3 && (
            <div className="p-5 space-y-4">
              {/* Pozycje pogrupowane po punktach — osobne karty per punkt */}
              <div className={deliveryMode === 'kilka' ? 'space-y-5' : 'space-y-4'}>
              {points.map((p, idx) => {
                const pc = carts[p.localId] ?? {}
                const lines = Object.entries(pc).filter(([, q]) => q > 0)
                const useWspolny = deliveryMode === 'kilka' && wspolnaData
                const tt = useWspolny ? wspolnyTerminTyp : p.termin_typ
                const pd = useWspolny ? wspolnyPreferredDate : p.preferred_date
                const multi = deliveryMode === 'kilka'
                return (
                  <div
                    key={p.localId}
                    className={`rounded-lg overflow-hidden ${
                      multi ? 'border-2 border-[#1F3A5F] shadow-md' : 'border border-slate-200'
                    }`}
                  >
                    <div className={multi ? 'bg-[#1F3A5F] px-4 py-3' : 'bg-slate-50 px-3 py-2 border-b border-slate-200'}>
                      <div className={`text-[13px] font-bold ${multi ? 'text-white' : 'text-[#1F3A5F]'}`}>
                        {multi ? `Punkt ${idx + 1} — ${pointName(p, idx)}` : 'Dostawa'}
                      </div>
                      <div className={`text-[12px] ${multi ? 'text-white/90' : 'text-slate-600'}`}>
                        {[p.ulica, [p.kod_pocztowy, p.miasto].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${multi ? 'text-white/70' : 'text-slate-500'}`}>
                        {p.typ === 'odbior' ? 'Odbiór własny' : 'Dostawa'}
                        {' · '}
                        {tt === 'data' && pd ? `Termin: ${pd}` : 'Termin: najbliższy możliwy'}
                        {p.odbiorca_imie ? ` · Odbiorca: ${p.odbiorca_imie}` : ''}
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100 bg-white">
                      {lines.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-rose-500 italic">Brak pozycji w tym punkcie</div>
                      ) : (
                        lines.map(([pid, q]) => {
                          const prod = products.find((pp) => pp.id === pid)
                          if (!prod) return null
                          const price = productUnitPrice(prod)
                          return (
                            <div key={pid} className="px-3 py-2 flex items-baseline gap-3 text-xs">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-900 leading-tight">{prod.name}</div>
                                <div className="text-slate-500">{prod.gramatura}</div>
                              </div>
                              <div className="text-slate-700 whitespace-nowrap">
                                {q} × {fmt(price)}
                              </div>
                              <div className="font-semibold text-slate-900 whitespace-nowrap min-w-[60px] text-right">
                                {fmt(q * price)} zł
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
              </div>

              {/* Totals */}
              <div className="bg-[#1F2B4A] text-white rounded-lg p-4 space-y-1.5">
                <div className="flex justify-between text-xs opacity-80">
                  <span>{isMinimum ? 'Cennik (zablokowany)' : isWielkiHurt ? 'Cennik' : 'Poziom'}</span>
                  <span className="font-bold">{TIER_LABEL[tier]}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">Suma netto</span>
                  <span>{fmt(totalNet)} zł</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">VAT</span>
                  <span>{fmt(totalVat)} zł</span>
                </div>
                <div className="border-t border-white/20 pt-1.5 flex justify-between text-base font-bold">
                  <span>Razem brutto</span>
                  <span>{fmt(totalBrutto)} zł</span>
                </div>
                <div className="text-[10px] text-white/60 pt-1">
                  Ostateczne ceny potwierdza system po złożeniu zamówienia.
                </div>
              </div>

              {/* Dokumenty (kilka) */}
              {deliveryMode === 'kilka' && (
                <div>
                  <div className="text-[13px] font-semibold text-slate-700 mb-2">Dokumenty (proforma / VAT)</div>
                  <div className="flex gap-2">
                    {(['wspolna', 'osobne'] as const).map((dm) => (
                      <button
                        key={dm}
                        type="button"
                        onClick={() => setDocumentsMode(dm)}
                        className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold ${
                          documentsMode === dm ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white' : 'border-slate-300 text-slate-600'
                        }`}
                      >
                        {dm === 'wspolna' ? 'Wspólne na całość' : 'Osobne per punkt'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Kontakt */}
              <div className="space-y-2">
                <div className="text-[13px] font-semibold text-slate-700">Kontakt</div>
                <Field label="Osoba kontaktowa *">
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => {
                      setContactPerson(e.target.value)
                      setContactPrefilled(false)
                    }}
                    placeholder="Imię i nazwisko"
                    className={inputCls(contactPrefilled)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Telefon *">
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => {
                        setContactPhone(e.target.value)
                        setContactPrefilled(false)
                      }}
                      placeholder="+48 ..."
                      className={inputCls(contactPrefilled)}
                    />
                  </Field>
                  <Field label="E-mail *">
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => {
                        setContactEmail(e.target.value)
                        setContactPrefilled(false)
                      }}
                      placeholder="firma@..."
                      className={inputCls(contactPrefilled)}
                    />
                  </Field>
                </div>
                <Field label="Uwagi" hint="Opcjonalnie">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="np. preferowane godziny dostawy, brama tylna..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#1F3A5F] resize-none"
                  />
                </Field>
              </div>

              {/* Klauzula RODO (tekst, NIE checkbox) */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-500 leading-relaxed">
                Twoje dane (imię, telefon, adres dostawy odbiorcy) przetwarzamy w celu realizacji zamówienia —
                podstawa: art. 6 ust. 1 lit. b RODO. Administrator: Ziomek Fish sp. z o.o., NIP 5223239864, ul.
                Marywilska 26, Warszawa. Dane przechowujemy przez okres współpracy handlowej. Masz prawo dostępu,
                sprostowania i usunięcia danych oraz wniesienia skargi do PUODO. Szczegóły:{' '}
                <a href="/polityka-prywatnosci" className="underline text-[#1F3A5F]">
                  Polityka prywatności
                </a>
                .
              </div>

              {/* Poprawki 1B — zgoda marketingowa: OSOBNA od klauzuli, dobrowolna, NIE blokuje */}
              {initial.has_marketing_consent ? (
                <div className="text-[11px] text-emerald-700 px-1">Zgoda marketingowa: udzielona ✓</div>
              ) : (
                <label
                  className="flex items-start gap-3 cursor-pointer rounded-lg p-4 mt-2"
                  style={{ background: '#FEF3C7', border: '2px solid #FCD34D' }}
                >
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="mt-0.5 w-5 h-5 shrink-0"
                    style={{ accentColor: '#1F3A5F' }}
                  />
                  <span className="text-[12px] text-slate-800 leading-relaxed">
                    {MARKETING_CONSENT_TEXT}
                    <span className="block text-[10px] text-slate-500 mt-1">
                      Dobrowolne — nie wpływa na złożenie zamówienia.
                    </span>
                  </span>
                </label>
              )}

              {submitError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900">{submitError}</div>
              )}

              {/* Zapisz jako szablon */}
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="w-full px-3 py-2 rounded-lg bg-[#eef3f9] text-[#1F3A5F] text-[13px] font-semibold flex items-center justify-center gap-1 hover:bg-[#dde7f3]"
              >
                <Star className="w-4 h-4" /> Zapisz to zamówienie jako szablon
              </button>

              {/* Nawigacja */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm flex items-center gap-1 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" /> Produkty
                </button>
                <button
                  type="button"
                  onClick={submitOrder}
                  disabled={!canSubmit}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-extrabold py-4 rounded-xl shadow-md flex items-center justify-center gap-2 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Wysyłanie…
                    </>
                  ) : (
                    'Złóż zamówienie'
                  )}
                </button>
              </div>
              {!canSubmit && !submitting && (
                <div className="text-[11px] text-slate-400 text-center">
                  {!contactValid
                    ? 'Uzupełnij dane kontaktowe (imię, telefon, e-mail).'
                    : !pointsAddrValid
                      ? 'Uzupełnij adresy punktów dostawy.'
                      : !itemsValid
                        ? 'Każdy punkt musi mieć przynajmniej jeden produkt.'
                        : !terminValid
                          ? 'Wybierz datę dla punktów z konkretnym terminem.'
                          : ''}
                </div>
              )}
            </div>
          )}
        </>
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
