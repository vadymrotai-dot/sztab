// lib/intelligence-engine/core/modes/combined-mode.ts
// Sprint S-CORE.1.B — Mode C real implementation.
//
// Mode C (DOMYŚLNE per мокап v2): Promise.allSettled([existing, registry]).
// Одне падіння mode не вбиває інше — partial RunResult merge.
//
// Source-name prefix у sources_completed:
//   existing-mode → "existing:<source>"
//   registry-mode → "registry:<source>"
// Це дозволяє caller розрізняти звідки прийшов кожен successful signal.

import type { ExistingFilters, RegistryFilters, RunResult } from '../../types'
import { runExistingMode } from './existing-mode'
import { runRegistryMode } from './registry-mode'

export interface CombinedFilters {
  existing?: ExistingFilters
  registry?: RegistryFilters
}

export async function runCombinedMode(
  filters?: CombinedFilters,
): Promise<RunResult> {
  const startTime = Date.now()

  // allSettled — не всі сервіси blокують один-одного.
  const [existingResult, registryResult] = await Promise.allSettled([
    runExistingMode(filters?.existing),
    runRegistryMode(filters?.registry),
  ])

  const sources_completed: string[] = []
  const errors: Array<{ source: string; message: string }> = []
  let entities_processed = 0

  if (existingResult.status === 'fulfilled') {
    sources_completed.push(
      ...existingResult.value.sources_completed.map((s) => `existing:${s}`),
    )
    entities_processed += existingResult.value.entities_processed
    errors.push(
      ...existingResult.value.errors.map((e) => ({
        source: `existing:${e.source}`,
        message: e.message,
      })),
    )
  } else {
    errors.push({
      source: 'existing-mode',
      message:
        existingResult.reason instanceof Error
          ? existingResult.reason.message
          : String(existingResult.reason),
    })
  }

  if (registryResult.status === 'fulfilled') {
    sources_completed.push(
      ...registryResult.value.sources_completed.map((s) => `registry:${s}`),
    )
    entities_processed += registryResult.value.entities_processed
    errors.push(
      ...registryResult.value.errors.map((e) => ({
        source: `registry:${e.source}`,
        message: e.message,
      })),
    )
  } else {
    errors.push({
      source: 'registry-mode',
      message:
        registryResult.reason instanceof Error
          ? registryResult.reason.message
          : String(registryResult.reason),
    })
  }

  return {
    sources_completed,
    entities_processed,
    errors,
    duration_ms: Date.now() - startTime,
  }
}
