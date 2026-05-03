// lib/intelligence-engine/core/orchestrator.ts
// Sprint S-CORE.1.B — thin dispatch wrapper над 3 modes (A/B/C).
//
// Per Protocol 13: ОДНА КНОПКА → fan-out до ВСІХ sources → агрегація →
// AI re-score В КІНЦІ. Цей orchestrator робить тільки crude dispatch
// (mode → mode-runner). Реальний fan-out усередині runRegistryMode /
// runCombinedMode (Promise.allSettled для combined). AI re-score буде
// підключений у scoring-pipeline (S-CORE.2/3 wire).

import type {
  Mode,
  RunResult,
  RegistryFilters,
  ExistingFilters,
} from '../types'
import { runExistingMode } from './modes/existing-mode'
import { runRegistryMode } from './modes/registry-mode'
import { runCombinedMode, type CombinedFilters } from './modes/combined-mode'

export type OrchestratorFilters =
  | ExistingFilters
  | RegistryFilters
  | CombinedFilters

export interface IOrchestrator {
  run(mode: Mode, filters?: OrchestratorFilters): Promise<RunResult>
}

export class Orchestrator implements IOrchestrator {
  async run(
    mode: Mode,
    filters?: OrchestratorFilters,
  ): Promise<RunResult> {
    switch (mode) {
      case 'A':
        return runExistingMode(filters as ExistingFilters | undefined)
      case 'B':
        return runRegistryMode(filters as RegistryFilters | undefined)
      case 'C':
        return runCombinedMode(filters as CombinedFilters | undefined)
      default:
        // Exhaustive check — за умови що Mode literal lock-нутий до 'A'|'B'|'C'.
        throw new Error(`Unknown mode: ${String(mode)}`)
    }
  }
}
