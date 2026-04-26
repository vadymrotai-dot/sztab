export type ClientType = 'standard' | 'strategic_partner'

export interface Client {
  id: string
  title: string
  nip?: string
  city?: string
  address?: string
  region?: string
  industry?: string
  email?: string
  phone?: string
  website?: string
  notes?: string
  segment: 'maly' | 'sredni' | 'duzy' | 'duzi_gracze' | 'niesklasyfikowany'
  status: 'nowy' | 'aktywny' | 'nieaktywny'
  channel_type: string | null
  size_tier: string | null
  client_type: ClientType
  contracted_margin_katalog_pct: number | null
  contracted_margin_docel_pct: number | null
  business_data?: unknown
  potential_analysis?: unknown
  created_at: string
  updated_at: string
  owner_id: string
}

export interface Contact {
  id: string
  client_id?: string
  name: string
  phone?: string
  email?: string
  notes?: string
  created_at: string
  owner_id: string
  client?: Client
}

export interface Deal {
  id: string
  title: string
  client_id?: string
  person_id?: string
  supplier_id?: string
  stage: DealStage
  /** Legacy field from Bitrix import. Kept for backward compatibility — new code should use total_value. */
  amount: number
  total_value?: number
  probability?: number
  currency?: string
  deal_type?: 'reseller' | 'agent' | 'partner' | null
  commission_pct?: number | null
  commission_income_pln?: number | null
  delivery_terms?: string
  expected_close_date?: string
  next_action_date?: string
  next_action_note?: string
  notes?: string
  /** Legacy date field — superseded by expected_close_date. */
  close_date?: string
  created_at: string
  updated_at: string
  owner_id: string
  client?: Client | null
  person?: Person | null
  supplier?: Supplier | null
}

export interface DealItem {
  id: string
  deal_id: string
  product_id: string | null
  product_name_snapshot: string | null
  product_gramatura_snapshot: string | null
  product_ean_snapshot: string | null
  quantity: number
  unit: string | null
  unit_price_buy: number | null
  unit_price_sell: number
  unit_price_override: boolean
  line_total: number
  line_margin_pln: number | null
  line_margin_pct: number | null
  vat_rate: number
  notes: string | null
  position: number
  created_at: string
  updated_at: string
}

export type SupplierType =
  | 'producent'
  | 'trader'
  | 'posrednik'
  | 'wlasna_marka'

export type SupplierDealType = 'reseller' | 'agent' | 'partner'

export type Currency = 'PLN' | 'EUR'

export interface Supplier {
  id: string
  owner_id: string
  name: string
  legal_name: string | null
  nip: string | null
  country: string | null
  type: SupplierType
  deal_type: SupplierDealType | null
  commission_pct: number | null
  default_currency: Currency
  verticals: string[] | null
  exclusivity_scope: string[] | null
  exclusive_territory: string | null
  exclusive_until: string | null
  payment_terms: string | null
  moq_value: number | null
  lead_time_days: number | null
  reliability_score: number | null
  notes: string | null
  contract_files: unknown
  created_at: string
  updated_at: string
}

export interface Person {
  id: string
  client_id?: string
  name: string
  role?: string
  email?: string
  phone?: string
  is_primary?: boolean
  notes?: string
  created_at: string
  owner_id: string
  client?: Client
}

export type DealEventType =
  | 'created'
  | 'updated'
  | 'stage_change'
  | 'note'
  | 'call'
  | 'email'
  | 'meeting'

export interface DealEvent {
  id: string
  deal_id: string
  event_type: DealEventType
  from_stage?: DealStage | null
  to_stage?: DealStage | null
  comment?: string | null
  created_at: string
  owner_id: string
}

export interface Product {
  id: string
  lp: number | null
  name: string
  ean?: string
  category: string | null
  gramatura: string | null
  unit: string | null
  cost_eur: number | null
  cost_pln: number | null
  price_maly_opt: number | null
  price_sredni: number
  price_duzy: number
  price_duzi_gracze: number | null
  price_min: number | null
  vat_rate: number
  push_tier: 1 | 2 | 3 | null
  vertical: string | null
  is_hero: boolean | null
  seasonality_status: string | null
  shelf_life_days: number | null
  supplier_id: string | null
  tags: string[] | null
  created_at: string
  owner_id: string
}

export interface Task {
  id: string
  title: string
  due?: string
  time?: string
  sphere: 'praca' | 'zdrowie' | 'relacje' | 'rozwoj' | 'finanse'
  priority: 'low' | 'normal' | 'high'
  client_id?: string
  goal_id?: string
  done: boolean
  completed_at?: string | null
  created_at: string
  owner_id: string
  client?: Client
  goal?: Goal
}

export interface Goal {
  id: string
  title: string
  description?: string
  sphere?: string
  deadline?: string
  target: number
  current: number
  unit?: string
  created_at: string
  owner_id: string
}

export interface Habit {
  id: string
  name: string
  log: Record<string, boolean>
  created_at: string
  owner_id: string
}

export interface Params {
  id: string
  kurs_eur_pln: number
  overhead: number
  anthropic_key?: string
  gemini_key?: string
  openrouter_key?: string
  created_at: string
  owner_id: string
}

export type DealStage =
  | 'lead'
  | 'oferta'
  | 'negocjacje'
  | 'sample'
  | 'kontrakt'
  | 'wygrana'
  | 'przegrana'

export type ClientSegment = Client['segment']
export type TaskSphere = Task['sphere']
export type TaskPriority = Task['priority']

export const DEAL_STAGES: { value: DealStage; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'oferta', label: 'Oferta' },
  { value: 'negocjacje', label: 'Negocjacje' },
  { value: 'sample', label: 'Sample / Próbka' },
  { value: 'kontrakt', label: 'Kontrakt' },
  { value: 'wygrana', label: 'Wygrana' },
  { value: 'przegrana', label: 'Przegrana' },
]

export const OPEN_DEAL_STAGES: DealStage[] = [
  'lead',
  'oferta',
  'negocjacje',
  'sample',
  'kontrakt',
]

export const CLOSED_DEAL_STAGES: DealStage[] = ['wygrana', 'przegrana']

export const CLIENT_SEGMENTS: { value: ClientSegment; label: string }[] = [
  { value: 'maly', label: 'Maly' },
  { value: 'sredni', label: 'Sredni' },
  { value: 'duzy', label: 'Duzy' },
  { value: 'niesklasyfikowany', label: 'Niesklasyfikowany' },
]

export const TASK_SPHERES: { value: TaskSphere; label: string; color: string }[] = [
  { value: 'praca', label: 'Praca', color: 'bg-blue-500' },
  { value: 'zdrowie', label: 'Zdrowie', color: 'bg-green-500' },
  { value: 'relacje', label: 'Relacje', color: 'bg-pink-500' },
  { value: 'rozwoj', label: 'Rozwoj', color: 'bg-amber-500' },
  { value: 'finanse', label: 'Finanse', color: 'bg-emerald-500' },
]

export const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Niski' },
  { value: 'normal', label: 'Normalny' },
  { value: 'high', label: 'Wysoki' },
]
