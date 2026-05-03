// lib/intelligence-engine/core/modes/registry-mode.ts
// Sprint S-CORE.1.A — stub. Real impl — S-CORE.1.B.
//
// Mode B: bulk fetch CEIDG/KRS by filters (PKD, voivodeship, forma_prawna)
// → insert raw → return count. Per Strategy Shift 03.05.2026: NO
// VAT/wykreślona filter (ВСІ entities, не валідних). Validation бар лише
// на NIP/REGON malformedness.

import type { RegistryFilters, RunResult } from '../../types'

export async function runRegistryMode(
  _filters: RegistryFilters,
): Promise<RunResult> {
  throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
}
