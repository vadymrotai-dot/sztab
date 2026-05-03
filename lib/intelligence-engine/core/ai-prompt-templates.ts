// lib/intelligence-engine/core/ai-prompt-templates.ts
// Sprint S-CORE.1.A — type definitions ТІЛЬКИ. Real templates — S-CORE.1.B.
//
// Strategy Shift 03.05.2026 evening: 4 templates у scope —
//   clientQuick      → /clients/[id] Szybki podgląd (~5s, 0,10 zł)
//   clientFull       → /clients/[id] Pełna analiza (~60s, 1,60 zł)
//   productAnalysis  → /produkty/[id] Analiza produktu/rynku
//   strategySection  → /strategia/[id] long-form raport (10 секцій per Strategy Shift)

import type { EntityType } from '../types'

export type AIPromptTemplateId =
  | 'clientQuick'
  | 'clientFull'
  | 'productAnalysis'
  | 'strategySection'

export interface AIPromptTemplate {
  id: AIPromptTemplateId
  entityType: EntityType
  /** System message (role context, output schema). */
  systemMessage: string
  /** User-message template з placeholders типу {nip}, {product_id}. */
  userTemplate: string
  /** Очікуваний output budget — гайд для cost estimation. */
  expectedTokens: number
  /** Оцінена ціна в PLN (per template execution). */
  estimatedCostPln: number
}

/**
 * Registry templates. У S-CORE.1.A — порожня map (тільки тип).
 * S-CORE.1.B заповнить реальними promptamі.
 */
export type AIPromptRegistry = Record<AIPromptTemplateId, AIPromptTemplate>
