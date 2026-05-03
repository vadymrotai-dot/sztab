// lib/intelligence-engine/core/orchestrator.ts
// Sprint S-CORE.1.A — stub. Real fan-out logic — S-CORE.1.B.
//
// Orchestrator coordinates 3 modes (A/B/C) per Protocol 13:
//   ОДНА КНОПКА → fan-out до ВСІХ sources паралельно → агрегація → AI re-score.
// AI ніколи не перший layer; AI завжди фінальний re-score.

import type {
  Mode,
  RunResult,
  RegistryFilters,
  ExistingFilters,
} from '../types'

export interface IOrchestrator {
  run(
    mode: Mode,
    filters?: RegistryFilters | ExistingFilters,
  ): Promise<RunResult>
}

export class Orchestrator implements IOrchestrator {
  async run(
    _mode: Mode,
    _filters?: RegistryFilters | ExistingFilters,
  ): Promise<RunResult> {
    throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
  }
}
