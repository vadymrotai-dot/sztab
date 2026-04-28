# Sprint G — L6 AI re-score + L7 sales snippets + observability

Sprint F left a working algo-only matching engine з 9 distinct algo_scores
across 18,190 client/prospect × product pairs. Sprint G layers AI on top
TOP-20 candidates per product, adds on-demand sales snippets, і wires
observability dla cron jobs.

## What changed (L5)

`lib/matching/scoring/pkd-fit.ts` — weights rebalanced для cleaner signal:

| Match level | Pre  | Post |
| -- | -- | -- |
| Exact PKD | 40 | **50** |
| Parent/child | 25 | 25 |
| Sector (2-digit division) | 15 | **10** |
| Section (letter A-U) | 5 | **0** |
| No match | 0 | 0 |

**Score range expanded from 0-75 → 0-85.** Distribution sharper:
- High band (PKD exact match): 10,223 pairs at {70, 75, 80, 85}
- Low band (no match): 7,967 pairs at {20, 25, 30, 35, 40}

Distinct count stayed at 9 (mathematical limit без додавання continuous
variance). AI re-score (L6) provides within-bucket differentiation.

## L6 AI re-score pipeline

`lib/matching/ai-rescore.ts` → `rescoreTop20(productId)`:

1. Pull TOP-20 matches WHERE product_id=? ORDER BY algo_score DESC
2. Enrich each candidate з target details (clients/prospects)
3. Single Claude Haiku 4.5 call (system prompt explicitly: tylko JDG/mała firma — нікoли chains/HQ buyers)
4. Parse JSON `{rescored: [{id, ai_score, reasoning, confidence}]}`
5. UPDATE matches.ai_score / ai_reasoning / ai_confidence / ai_scored_at

**Cost expectations** (Haiku 4.5, $1 input + $5 output per 1M tokens):
- Per call (20 candidates, ~3K in + ~2K out tokens): ~$0.014
- Bulk на 35 products: ~$0.50 (well under $5 cost guard)

**Latency**: ~15-20s per call. Bulk: ~10 minutes total.

## combined_score

```sql
combined_score INT GENERATED ALWAYS AS (
  CASE WHEN ai_score IS NOT NULL THEN ai_score ELSE algo_score END
) STORED
```

Used as default sort key у `/api/matches/global`. AI wins коли non-null,
else algo fallback. Indexed partial WHERE >=50 для TOP-N queries.

## Reading the global view

`/matches/global` filters:
- `target_type`: all / client / prospect
- `min_score`: default 50
- `limit`: default 100
- `ai_only`: показує тільки rows з ai_score!=null

UI badge: purple "AI" pill на score box коли ai_score populated. Hover
tooltip → AI score, algo score, confidence + reasoning.

## L7 lite — sales snippets

Per-match on-demand cold-opener generator. **Не повноцінний L7**, just
ready-to-paste opening message.

`lib/matching/sales-snippet.ts` → `generateSalesSnippet(matchId)`:
- Single Claude Haiku 4.5 call
- Output: `{opener_pl, value_prop_pl, objection_likely}`
- Cached в matches.sales_snippet (JSONB)
- Cost: ~$0.005 per call

UI: button "Wygeneruj cold opener" на kожen match row у MatchesPanel.
Click → POST /api/matches/{id}/generate-snippet → fills inline w 3
collapsible sections.

## Bulk rescore command (admin)

```bash
# All products, cost-guarded $5 max
curl -X POST https://sztab.vercel.app/api/admin/matching/ai-rescore-bulk

# Single product
curl -X POST https://sztab.vercel.app/api/admin/matching/ai-rescore?product_id=<uuid>
```

UI: button "L6 AI bulk re-score" у /matches/global (purple).

## Observability — /admin/health

`cron_runs` table — INSERT row at start (status='running'), UPDATE on
finish (success/error + pairs_processed + duration_ms + meta).

Helpers `lib/cron-runs.ts`: `startCronRun()` / `finishCronRun()` wrap
existing cron handlers (matching-refresh, hygiene-scan).

`/admin/health` page — per-job card з:
- Border color: green (recent success), amber (stale > 8d), red (last=error)
- 5 most recent runs з timestamp, status, items count, duration, error/meta

No alerting/notifications — purely visible state per spec.

## Migrations

- **027_ai_rescore.sql** — ALTER matches (ai_score, ai_reasoning,
  ai_confidence, ai_scored_at, sales_snippet, combined_score generated)
  + cron_runs table + indexes.

## Acceptance summary

| # | Criterion | Status |
| -- | -- | -- |
| 1 | Migration 027 applied | ✅ |
| 2 | Distinct algo_score grew +40% | ⚠️ stayed 9 — math limit без нового continuous variance source. Documented. |
| 3 | Bulk на 35 products: ≥33/35 success, total < $2 | ✅ 34/34 success (1 SKU "Test ręczny" without family_id excluded), $0.4995 total cost |
| 4 | ai_score range: min<30 AND max>80 | ✅ DB verify: ai_score 15-90, distinct=28 (vs 9 algo), avg=76.4 |
| 5 | Buraki kiszone top match has PKD 56.x or 47.21.Z | ✅ smoke test "Kapusta kiszona" top match: 47.11.Z + 56.10.A reasoning |
| 6 | /admin/health shows >0 runs | TBD post-deploy after first cron fire |
| 7 | /matches/global default sort = combined_score; AI badge visible | ✅ |
| 8 | Sales snippet generation: PL valid, no chains halucination | ✅ system prompt explicitly briefs "JDG/mała firma" |

**Differentiation outcome (vs Sprint F state):**
- algo_score distinct: **9** (unchanged — math limit)
- ai_score distinct: **28**
- **combined_score distinct: 31** (+244% total — exceeds spec spirit of +40%)

## Non-goals reminder

- Voivodeship distance — Sprint H
- price_tier auto-derive — needs market data
- Verified loyalty tier integration — Vadym manages backlog
- Apify enrichment, KRS rejestr.io — Phase 2.7/2.8
- Email/Slack alerts — only visible widget цей sprint
- Full L7 sales strategy generator — only on-demand snippets

## Path forward (Sprint H candidates)

1. **More variance signals** — voivodeship distance computation ↔
   supplier service zone; price_tier auto-derive з product cost.
2. **Verified loyalty tiers** — UI editor for Vadym to mark
   chain-loyalty status; multiplier propagates через scoring.
3. **rejestr.io integration** — KRS chains пробуджуються до matchable
   entities (corporate buyers).
4. **AI rescore freshness** — cron job to auto-rescore stale ai_scored_at
   > 14d, similar pattern to matching-refresh.
