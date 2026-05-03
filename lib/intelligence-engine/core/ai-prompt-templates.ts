// lib/intelligence-engine/core/ai-prompt-templates.ts
// Sprint S-CORE.1.B — 4 real prompt templates.
//
// Per Strategy Shift 03.05.2026 evening:
//   client-quick      → /clients/[id] Szybki podgląd AI (~5s, 0,10 zł)
//   client-full       → /clients/[id] Pełna analiza klienta (~60s, 1,60 zł)
//   product-analysis  → /produkty/[id] Analiza produktu/rynku per segment
//   strategy-section  → /strategia/[id] long-form raport (10 секцій)
//
// Per Q5 = (a) — types визначаються inline у цьому файлі (без імпорту з
// types.ts). Стара shape з S-CORE.1.A overwritten — нові поля per Vadym
// прийнятий промпт (model, system, user_template, max_tokens, est_cost_pln,
// est_duration_s).
//
// Real Anthropic API calling — у S-CORE.2 (clientQuick/clientFull) і
// S-CORE.3 (productAnalysis) і S-CORE.5 (strategySection).

// ─── Types ──────────────────────────────────────────────────────────

export type AIPromptTemplateId =
  | 'client-quick'
  | 'client-full'
  | 'product-analysis'
  | 'strategy-section'

export type AIModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-6'

export interface AIPromptTemplate {
  id: AIPromptTemplateId
  model: AIModel
  /** System message (role + output schema). */
  system: string
  /** User-message template з {{placeholders}}. */
  user_template: string
  max_tokens: number
  est_cost_pln: number
  est_duration_s: number
}

export type AIPromptRegistry = Record<AIPromptTemplateId, AIPromptTemplate>

// ─── 1. CLIENT QUICK — Szybki podgląd AI (~5s, 0,10 zł) ─────────────

export const clientQuickTemplate: AIPromptTemplate = {
  id: 'client-quick',
  model: 'claude-haiku-4-5-20251001',
  system: `Jesteś analitykiem B2B HoReCa. Generuj zwięzłe profile firm po polsku. Odpowiedź ZAWSZE struktura: 1 paragraf opisowy + 5 mikropól (co sprzedają, skala obrotów, kanały dystrybucji, lat na rynku, zdolność zakupu). Bez wstępów, bez podsumowań — od razu treść.`,
  user_template: `Firma: {{name}} (NIP {{nip}})
PKD: {{pkd}}
Forma: {{forma_prawna}}
Lokalizacja: {{location}}
Dane GUS: {{gus_data}}

Wygeneruj profil biznesowy.`,
  max_tokens: 500,
  est_cost_pln: 0.1,
  est_duration_s: 5,
}

// ─── 2. CLIENT FULL — Pełna analiza klienta (~60s, 1,60 zł) ─────────

export const clientFullTemplate: AIPromptTemplate = {
  id: 'client-full',
  model: 'claude-sonnet-4-6',
  system: `Jesteś senior analitykiem B2B HoReCa. Generuj głęboki profil firmy z 8 warstw CIL (Identity / Profile / Locations / People / Buying / Risk / Geo / Industry). Output: structured JSON. Po polsku. Każda warstwa = osobne pole z 3-5 sub-keyami i krótkim insight-paragrafem.`,
  user_template: `Wszystkie 8 warstw raw data per CIL:

CIL-1 Identity: {{cil_1_raw}}
CIL-2 Profile: {{cil_2_raw}}
CIL-3 Locations: {{cil_3_raw}}
CIL-4 People: {{cil_4_raw}}
CIL-5 Buying: {{cil_5_raw}}
CIL-6 Risk: {{cil_6_raw}}
CIL-7 Geo: {{cil_7_raw}}
CIL-8 Industry: {{cil_8_raw}}

Wygeneruj structured profile + insights per warstwa.`,
  max_tokens: 3000,
  est_cost_pln: 1.6,
  est_duration_s: 60,
}

// ─── 3. PRODUCT ANALYSIS — Analiza produktu (~60s, 0,80 zł) ─────────

export const productAnalysisTemplate: AIPromptTemplate = {
  id: 'product-analysis',
  model: 'claude-sonnet-4-6',
  system: `Jesteś sales strategist B2B. Dla podanego produktu wygeneruj strategię sprzedaży per segment (hot/warm/cold). Po polsku. Struktura: segmentacja klientów + pitch (1 paragraf) per segment + sugerowane następne kroki (3 bullets).`,
  user_template: `Produkt: {{product_name}} ({{sku}})
Cena: {{price_pln}} zł
Kategoria: {{category}}
Klientów w bazie: {{total_clients}}
TOP-3 dopasowania algo: {{top_matches}}

Wygeneruj segmentację + pitch per segment + następne kroki.`,
  max_tokens: 1500,
  est_cost_pln: 0.8,
  est_duration_s: 60,
}

// ─── 4. STRATEGY SECTION — long-form raport (per section) ───────────

export const strategySectionTemplate: AIPromptTemplate = {
  id: 'strategy-section',
  model: 'claude-sonnet-4-6',
  system: `Jesteś strategic consultant B2B HoReCa. Generujesz JEDNĄ sekcję raportu strategii po polsku. Struktura: 2-3 paragrafy + bullety. 10 możliwych sekcji: sytuacja / cele / segmentacja / rekomendacja / argumentacja / konkurencja / plan / ryzyka / kpi / założenia. Trzymaj sekcję spójną z poprzednimi (przekazane w kontekście).`,
  user_template: `Sekcja: {{section_id}}
Kontekst danych: {{context_data}}
Streszczenie poprzednich sekcji: {{previous_sections_summary}}

Wygeneruj sekcję {{section_id}} (2-3 paragrafy + bullety).`,
  max_tokens: 800,
  est_cost_pln: 0.32,
  est_duration_s: 30,
}

// ─── Registry ──────────────────────────────────────────────────────

export const promptRegistry: AIPromptRegistry = {
  'client-quick': clientQuickTemplate,
  'client-full': clientFullTemplate,
  'product-analysis': productAnalysisTemplate,
  'strategy-section': strategySectionTemplate,
}
