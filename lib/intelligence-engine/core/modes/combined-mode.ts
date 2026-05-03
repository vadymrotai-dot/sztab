// lib/intelligence-engine/core/modes/combined-mode.ts
// Sprint S-CORE.1.A — stub. Real impl — S-CORE.1.B.
//
// Mode C (DOMYŚLNE per мокап v2): Promise.allSettled([existing, registry])
// → merge → dedupe by NIP → unified RunResult. Default mode на /pulpit/dzisiaj.

import type {
  ExistingFilters,
  RegistryFilters,
  RunResult,
} from '../../types'

export async function runCombinedMode(
  _existingFilters?: ExistingFilters,
  _registryFilters?: RegistryFilters,
): Promise<RunResult> {
  throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
}
