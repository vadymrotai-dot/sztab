# TYDZIEN1.A.2 Step 0 — Apify / Sprawozdania / Budget audit

_generated 2026-05-27_

## A. APIFY DEEP DIVE

### Actor + endpoint

- **Actor:** `compass~crawler-google-places` (Apify Compass team's Google Maps scraper)
- **Endpoint:** `POST https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token={APIFY_API_TOKEN}&memory=1024`
- **Type:** SYNCHRONOUS — actor starts on Apify, Sztab waits for full dataset response w jednym HTTP request

### Payload

```json
{
  "searchStringsArray": ["{name} {city|voivodeship} Polska"],
  "maxCrawledPlaces": 3,
  "language": "pl",
  "countryCode": "pl",
  "deeperCityScrape": false,
  "skipClosedPlaces": false,
  "scrapePlaceDetailPage": true   ← expensive: enables reviews+popularTimes+menu+...
}
```

### Timeouts (lib/enrichment/apify.ts)

| Layer | Value | Mechanism |
|---|---|---|
| `REQUEST_TIMEOUT_MS` | **25_000ms** (25s) | `AbortSignal.timeout()` na fetch |
| `APIFY_HARD_TIMEOUT_MS` | **30_000ms** (30s) | Promise.race outer guard |
| Retry on 5xx | 3 attempts | exp backoff 1s/2s/4s |
| Retry on timeout | **NONE** (line 257-261 — AbortError skips backoff continue, breaks) | — |

### 5 last partial runs (Sztab DB)

| # | client_id | started | duration | Sztab error |
|---|---|---|---|---|
| 1 | 116db898 (FRESH MEALS) | 2026-05-27 11:16:56 | **25.3s** | timeout aborted |
| 2 | 116db898 | 2026-05-27 10:38:58 | **25.5s** | timeout aborted |
| 3 | 00563d4d | 2026-05-27 09:50:01 | **25.3s** | timeout aborted |
| 4 | ca823e34 | 2026-05-27 09:01:24 | **25.4s** | timeout aborted |
| 5 | 82e7c293 (GUSTO VERO) | 2026-05-27 08:55:28 | **25.3s** | timeout aborted |

→ wszystkie 24 runs hit *exactly* `REQUEST_TIMEOUT_MS=25s` inner abort. raw_payload **NULL** dla всіх (logging on error path nie persistuje).

### Apify-side reality (live API `GET /v2/acts/.../runs`)

| # | apify run id | started | finished | duration | Apify cost |
|---|---|---|---|---|---|
| 1 | Wyr0TXherNWP | 11:16:56 | 11:19:46 | **~170s** | $0.174 |
| 2 | UwXQMGTMOjfJ | 10:38:59 | 10:40:49 | **~110s** | $0.180 |
| 3 | a7vYgTJuq5kT | 09:50:02 | 09:51:38 | **~96s** | $0.060 |
| 4 | SPMBnbRMrQdl | 09:01:24 | 09:04:53 | **~210s** | $0.060 |
| 5 | GgljrubuMpEN | 08:55:28 | 08:59:13 | **~225s** | $0.018 |

→ All 5 status **`SUCCEEDED` on Apify side**. Actor finished 95-225s pisle Sztab już aborted. Suma 5 = $0.49 USD ≈ 2 zł. 24 timeouts × avg $0.09 USD ≈ **$2.16** з 26-27.05 cohort — $47 dashboard може include earlier sprints (Sztab uruchamiał reanalysis batches 12-13 maja).

### Account status

- Plan: **STARTER**
- User: vadym_rotai
- Token: present у .env.local (length 46)

### Hypothesis (why 24/24 timeout)

1. **`scrapePlaceDetailPage=true` heavy:** actor crawls 3 places × full detail page (reviews + popular times + popular dishes + opening hours + ...). Apify docs cite typical 30-45s; з detail enabled → 90-225s in practice.
2. **Sztab inner timeout 25s** undercut actor by 70-200s. Each run starts → Apify runs to completion (charges full cost) → Sztab silent abort → no result captured → 24/24 partial з raw_payload=NULL.
3. **No retry on timeout** — line 257-261 explicitly breaks loop on AbortError. Means even if first request is slow, no 2nd chance.
4. **Comment у kodzie (line 31-32):** *"Sprint S-CEIDG-DETAILS Day 1 PATCH: was 240_000 (4 хв)... Lower до 25s"* — Vadym wcześniej miał 240s timeout, obniżono dla Vercel function ceiling 120s. **Over-corrected:** Vercel ceiling 120s, ale Sztab cut na 25s czyni Apify praktycznie nieużywalnym.

### Recommended fix

**Option A (recommended):** raise inner+outer timeouts:
```
REQUEST_TIMEOUT_MS = 80_000   (80s)
APIFY_HARD_TIMEOUT_MS = 90_000  (90s)
```
Vercel function budget = 120s. Other steps po Apify (CEIDG_details ~5s + AI_business_analysis ~10s + AI_match_rescore ~5s + after()/finishEnrichmentRun) ≈ 25s. 90s Apify + 25s rest = 115s ≤ 120s ceiling z 5s margin.

**Option B (cost-safer):** keep 25s but ALSO disable `scrapePlaceDetailPage`:
- Actor returns rating/reviews_count/website/phone (basic) without full detail
- Typical 15-30s → fits w 25s budget
- Trade-off: lose menu_dishes + popularTimes + opening hours (rzadko ueed dla B2B clients anyway)

**Option C:** switch to async pattern:
- POST `/runs` → get runId immediately
- Background polling via /runs/{runId} every 5s until status='SUCCEEDED' OR timeout
- Persist runId — if Vercel function dies, next Phase B run can pick up the cached result
- More complex; tylko if A+B nie wystarczą

**Recommendation: Option A + per-firm budget guard** (Step 0C). Most B2B clients (cohort UC_PROD_GOTOWE_MAZ) nie wymagають detail page — gastronomy clients do (menu_dishes). Conditional Option B = disable detail page IF client_type ∈ {production, hurtownia, sklep_detal, sieci_handlowe, instytucja}, keep TRUE для gastronomia/hotel/catering.

---

## B. JSON SPRAWOZDANIA AUDIT

### Confirmation

`lib/rejestrio/sprawozdania.ts`:
- Line 65: `await rejestrioGet(apiKey, /org/{krs}/krs-dokumenty/{rzisDoc.id}?format=json)` — RZiS XBRL fetch
- Line 81: `await rejestrioGet(apiKey, /org/{krs}/krs-dokumenty/{bilansDoc.id}?format=json)` — Bilans XBRL fetch
- Cost per call: **0.50 zł** rejestr.io rate

Per firma z N years financials: **2 × N JSON calls** = 1-3 zł per firma + list call (0.05 zł). For UC_PROD_GOTOWE_MAZ 29 firm × 2.5 zł ≈ **70+ zł** (vs 50 zł budget Vadym refilled → exactly why credit drained at 9 firmach).

### Caller

`app/api/intelligence/lookup/route.ts:1964-1989` — `runRejestrioStep` Step 6:
```ts
try {
  // 6. sprawozdania (XBRL JSON) → financial_statements rows
  const fins = await fetchAllFinancials(apiKey, krs)
  // ... upsert financial_statements per year
}
```

### Recommended ENV flag location

**Easy fix at caller** (`lookup/route.ts:1965`) — pre-call gate:
```ts
const SKIP_FINANCIALS = process.env.REJESTRIO_FETCH_JSON_FINANCIALS !== 'true'
if (SKIP_FINANCIALS) {
  // log skip → continue
  summary.financial_years = 0
  summary.financial_skipped = 'env_flag'
} else {
  const fins = await fetchAllFinancials(apiKey, krs)
  // ... existing logic
}
```

Default `REJESTRIO_FETCH_JSON_FINANCIALS=false` (omitted in env) → step skipped permanently. Vadym może opt-in via `=true` jeśli wykupi rejestr.io plan z budgetem na JSON quota.

**Alternative — flag at sprawozdania.ts top of `fetchAllFinancials()`** — sam helper bails return [] early. Cleaner separation ale less visible w runtime path.

Recommend caller-level — explicit summary tag plus 1 grep-line gates everything.

---

## C. BUDGET GUARD AUDIT

### Existing cost tracking

- Per-step `enrichment_log.cost_usd` is written by `finishEnrichmentRun()`. ALE NIE aggregated.
- `response` object у lookup/route.ts ma `fields_filled` (count) ale **NO** `total_cost_usd` field.
- Single `COST_GUARD_USD=0.10` constant on line 762 — applies ONLY to **single Apify_GMaps call result** (post-call check, blocks promotion if individual call cost > 0.10). Per Step 6.8 b2b skip-logic.
- `PHASE_B_BUDGET_MS=110_000` — time budget. Used to skip rescore step if remaining < 15s.

### Recommended budget guard location

Add accumulator at start of POST handler (around line 152-153, before STEP 1):
```ts
// TYDZIEN1.A.2 (27.05.2026) — per-firm running budget. Caps total enrichment
// spend per analiza. Default 0.50 zł = ~$0.13 USD. Configurable via env.
const PER_FIRM_BUDGET_USD = Number(process.env.PER_FIRM_BUDGET_USD ?? '0.13')
let cumulativeCostUsd = 0
const budgetExceeded = () => cumulativeCostUsd >= PER_FIRM_BUDGET_USD
```

Increment after each expensive step's cost:
```ts
// Po finishEnrichmentRun з cost_usd
cumulativeCostUsd += result.cost_usd ?? 0
```

Skip remaining expensive steps if guard tripped:
```ts
// Before STEP 5 (Apify), STEP 6 (sprawozdania), STEP 5.5 (www_menu), STEP 5.6 (wolt/pyszne)
if (budgetExceeded()) {
  response.sources_completed.push({
    source: 'Apify_GMaps', status: 'skipped',
    note: `budget_exceeded: spent $${cumulativeCostUsd.toFixed(4)} ≥ $${PER_FIRM_BUDGET_USD}`,
  })
  // log enrichment_log row з status='skipped'
  continue
}
```

### Expensive steps inventory

| Step | Per-call cost (typical) | Per-firm max | Block at budget? |
|---|---:|---:|---|
| Apify_GMaps | $0.018-$0.18 (Apify side) | $0.18 | **YES** |
| **sprawozdania JSON** | **0.50 zł × 2 × N years** | **0.50-3 zł** | **YES (priority)** |
| www_menu (Apify website-menu) | $0.06 | $0.06 | YES |
| wolt_menu | $0.0008 | $0.001 | low — keep |
| pyszne | $0.02 | $0.02 | YES |
| regdata_krs_fullnames | $0.005 | $0.005 | low — keep |
| AI_business_analysis | $0.015 | $0.015 | low — keep |
| AI_match_rescore | $0.010 | $0.010 | low — keep |
| tavily | $0.015 (3 queries × $0.005) | $0.015 | low — keep |
| rejestrio_v2 (8 endpoints × 0.05 zł) | 0.40 zł | 0.40 zł | YES |
| KRS / GUS / VAT / BZP | $0.00 | $0.00 | never |

**Critical:** sprawozdania JSON = 90%+ rejestr.io drain. Disabling that single step ↓ per-firm cost ~3 zł → 0.40 zł.

---

## Summary recommendations dla STEP 1

1. **Apify timeout fix** (Option A): raise `REQUEST_TIMEOUT_MS` 25s → 80s; `APIFY_HARD_TIMEOUT_MS` 30s → 90s. Single number change w 2 lokacjach `lib/enrichment/apify.ts:31, 48`.
2. **Sprawozdania JSON gate**: ENV flag `REJESTRIO_FETCH_JSON_FINANCIALS` (default false). Wrap caller w `lookup/route.ts:1964-1989`.
3. **Per-firm budget guard**: `PER_FIRM_BUDGET_USD=0.13` (≈0.50 zł) accumulator. Initialize at handler top + check before each expensive step + log 'skipped' z note 'budget_exceeded' if tripped.
4. **Optional (out of A.2 scope):** Apify conditional detail-page disable based on client_type — defer to A.3 IF A.2 timeout+budget already shows >80% Apify success rate.

ZERO writes, ZERO commits. Czekam Vadym GO na STEP 1.
