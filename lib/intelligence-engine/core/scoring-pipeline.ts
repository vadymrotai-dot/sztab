// lib/intelligence-engine/core/scoring-pipeline.ts
// Sprint S-CORE.1.A — stub. Real scoring — S-CORE.1.B.
//
// Pipeline = algo factors (PKD-fit, geography, size, recency, hygiene gate,
// loyalty multiplier) + AI re-score for TOP-N (per Protocol 13). Existing
// scoring helpers у lib/matching/scoring/ будуть переvикористані як building
// blocks у S-CORE.1.B.

import type { MatchResult } from '../types'

export interface IScoringPipeline {
  score(clientId: string, productId: string): Promise<MatchResult>
}

export class ScoringPipeline implements IScoringPipeline {
  async score(_clientId: string, _productId: string): Promise<MatchResult> {
    throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
  }
}
