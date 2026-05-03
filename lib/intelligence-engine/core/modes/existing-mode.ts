// lib/intelligence-engine/core/modes/existing-mode.ts
// Sprint S-CORE.1.A — stub. Real impl — S-CORE.1.B.
//
// Mode A: iterate existing DB clients, sequentially call enrichment sources
// (KRS, VAT, GMaps, Tavily, MSiG, BZP, etc.) щоб update stale records.

import type { ExistingFilters, RunResult } from '../../types'

export async function runExistingMode(
  _filters?: ExistingFilters,
): Promise<RunResult> {
  throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
}
