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
  notes?: string
  segment: 'maly' | 'sredni' | 'duzy' | 'niesklasyfikowany'
  status: 'nowy' | 'aktywny' | 'nieaktywny'
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
  stage: 'lead' | 'oferta' | 'negocjacje' | 'wygrana' | 'przegrana'
  amount: number
  close_date?: string
  created_at: string
  updated_at: string
  owner_id: string
  client?: Client
}

export interface Product {
  id: string
  lp?: number
  category?: string
  name: string
  weight?: string
  ean?: string
  koszt_eur: number
  koszt_pln: number
  price_maly: number
  price_sredni: number
  price_duzy: number
  price_katalog: number
  price_docel: number
  zysk_maly: number
  zysk_duzy: number
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
  completed_at?: string
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

export type DealStage = Deal['stage']
export type ClientSegment = Client['segment']
export type TaskSphere = Task['sphere']
export type TaskPriority = Task['priority']

export const DEAL_STAGES: { value: DealStage; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'oferta', label: 'Oferta' },
  { value: 'negocjacje', label: 'Negocjacje' },
  { value: 'wygrana', label: 'Wygrana' },
  { value: 'przegrana', label: 'Przegrana' },
]

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
