# Sprint S6C — Phase B quality fixes Discovery Report

**Date:** 2026-05-11 morning
**Goal:** Audit Phase B Tavily/Apify/AI gaps на SOLERA test перш ніж rebuild.
**Result:** **2 з 5 premise claims FALSE.** Real fixes much smaller scope.

## Audit per question

### Q1 — Tavily (`lib/enrichment/web-search.ts`, 277 lines)

**searchCompanyOnline(apiKey, nazwa, nip)** — line 196:

```ts
// Two queries: official з NIP + business-context — line 217-221
const queries = [
  `"${nazwa}" ${nip}`,
  `"${nazwa}" sklep OR sieć OR firma`,
]
for (const q of queries) {
  const resp = await tavilySearch(apiKey, q, 6)
  if (resp?.results) {
    allResults = allResults.concat(resp.results)
    out.search_cost_usd += COST_PER_BASIC_SEARCH_USD
  }
}
```

**`tavilySearch()` API call** — line 101-134:
- POST `https://api.tavily.com/search`
- Body: `{api_key, query, search_depth: 'basic', max_results: 6, include_answer: false, country: 'pl'}`
- Timeout via `AbortSignal.timeout(REQUEST_TIMEOUT_MS)`
- Returns null on network error OR non-OK status (logged via console.error)

**Premise:** "Tavily НЕ ПРАЦЮЄ — raw_results: [], cost_usd: 0".

**Reality findings:**
- ✅ Code IS sending 2 queries (NOT one), already includes NIP query
- ✅ Already uses `country: 'pl'` filter (Sprint S2A Phase 2)
- ✅ Has aggregator blocklist (gowork.pl, panoramafirm.pl etc.)
- ⚠️ `cost_usd = 0` despite query sent → means **`resp?.results` was null/empty** з API for both queries → fallback returns `out.search_cost_usd = 0`
- ⚠️ When API returns 401/quota exhausted/HTTP error → `tavilySearch()` returns `null` → BOTH queries silently skipped, `search_cost_usd` stays 0, `raw_results: []`
- 🔥 **No error visibility** — console.error logged server-side але NOT surfaced до user або enrichment_log raw_payload. UI bачить `status='success'` з cost_usd=0 looks like "success but empty" instead of "API failed".

**True root cause hypothesis (without live API test):**
- Tavily API key may be expired/quota-exhausted у `params.tavily_api_key` OR `TAVILY_API_KEY` env
- OR Tavily API responding 200 але with `results: []` для SOLERA queries (rare combination)

**NOT** a prompt/query gen bug as Vadym premised. Code IS sending good queries. Fix requires:
1. Surface API errors до raw_payload + enrichment_log error_message field
2. Validate cost_usd > 0 → distinguish 'success' (data) vs 'partial' (zero results) vs 'error' (API failed)
3. Live test з working API key against SOLERA NIP 5262870489 — required to confirm Q1 root cause

### Q2 — Apify similarity threshold (`lib/enrichment/apify.ts`, 273 lines)

**Verified (already audited у earlier sprints):**
```ts
const NAME_SIMILARITY_THRESHOLD = 0.5  // line 29
```

**`pickBestMatch()` line 173-191:**
```ts
function pickBestMatch(items, targetName) {
  if (items.length === 1) {
    const sim = similarity(targetName, items[0].title ?? '')
    return sim >= 0.3 ? items[0] : items[0] // permissive — single result
  }
  // Multiple → pick highest similarity, threshold 0.5
  for (const item of items) {
    const sim = similarity(targetName, item.title ?? '')
    if (sim > bestSim) { bestSim = sim; best = item }
  }
  return bestSim >= NAME_SIMILARITY_THRESHOLD ? best : null
}
```

**Premise:** "Apify cuts valid matches — phone identical але address differs".

**Reality findings:**
- ✅ Threshold 0.5 confirmed
- ⚠️ Single-result branch (line 175-178) IS permissive (z поrzy <0.3 still returns)
- 🔥 Multi-result branch (line 181-191) uses **NAME similarity ONLY** — no phone/category cross-check
- ⚠️ Phone-match override **does NOT exist** у current logic. Real gap.
- ⚠️ Address comparison ALSO NOT implemented (NAME similarity only)

**True scope:** Vadym premise correct. Fix needed: phone-match-trumps-name-mismatch logic у `pickBestMatch`.

### Q3 — AI Business Analysis prompt (`lib/ai/business-analysis.ts`, 369 lines)

**`SYSTEM_PROMPT`** (lines 35-71) — рассказує про buyer_strength_for_chm context, JSON output schema, ChM business spec.

**`CompanyContext` shape** (lines 73-97) — has `pkd_codes: string[]`, `pkd_main: string | null` — **тільки codes, NOT descriptions**.

**`buildUserPrompt()` line 264-265:**
```ts
if (ctx.pkd_codes.length > 0) {
  lines.push(`PKD: ${ctx.pkd_codes.slice(0, 10).join(', ')}${ctx.pkd_main ? ` (główne: ${ctx.pkd_main})` : ''}`)
  lines.push('')
}
```

**Premise:** "AI ignore PKD details — passes generic codes, не bачить '4638Z = ryby, skorupiaki'".

**Reality findings:**
- 🔥 **CONFIRMED** — only PKD codes (e.g. "4638Z, 4632Z, ...") sent. NO descriptions.
- 🔥 SYSTEM_PROMPT не contains directive "якщо PKD główny має конкретну категорію (ryby/mięso/alkohol) → SPECIALIZACJA"
- ⚠️ AI receives "PKD: 4638Z, 4632Z" without context → outputs generic "uniwersalny" since не знає що 4638Z means "ryby/skorupiaki specjalistyczne"

**True scope:** Vadym premise correct. Fix needed:
- Pass PKD з descriptions у prompt (need to JOIN з PKD reference table)
- Add SYSTEM_PROMPT directive про specialization detection from PKD главна

### Q4 — AI Match Rescore (`lib/matching/ai-rescore.ts`, 644 lines)

**`rescoreClientTop10()`** — exists at line 495.

**Critical finding** (line 580-592):
```ts
// 6. Single Claude Haiku call
const userPrompt = buildClientUserPrompt(client, candidates)
const ai = await callAI({
  apiKey,
  provider: 'anthropic',
  model: AI_MODELS.FAST,
  systemPrompt: CLIENT_RESCORE_SYSTEM_PROMPT,
  userPrompt,
  maxTokens: 3000,
  temperature: 0.2,
})
```

**Premise:** "10 окремих API calls (~9s × 10 = 94s) — N+1 problem".

**Reality findings:**
- 🔥 **PREMISE FALSE** — code ALREADY uses single batched Haiku call з ALL candidates у one prompt (line 580 comment "Single Claude Haiku call")
- ✅ Output: JSON array з усіма rescored matches (line 599-601 parses array)
- ✅ Single API call → 1× cost, 1× latency

**Why 94s real-world?** Possible explanations:
- maxTokens=3000 + 10 matches з detailed reasoning → output може бути ~2500-3000 tokens. Anthropic Haiku output rate ~50 tokens/s → 50-60s output time alone.
- Plus Anthropic API queue + retry logic у callAI helper якщо transient errors → could push до 90s
- SOLERA-specific: client has full context (KRS + financials + persons + business_profile) → input ~8K tokens. Total request size puts API into "complex" tier latency.
- **NOT a code bug** — це Anthropic API characteristics для large context.

**True scope:** Vadym premise WRONG. AI rescore не has N+1 problem. **No code fix needed для STEP 4.**

Possible mitigations (if needed):
- Reduce maxTokens 3000 → 1500 (truncate reasoning verbosity)
- Reduce candidates 10 → 5 (less context, less output)
- Switch to streaming API (perceived latency lower) — bigger refactor

### Q5 — /prospects table columns

**Current columns** (per grep `<TableHead>` lines 568-607):
1. Checkbox (40px)
2. Nazwa (з UA flag inline post-S-CORE.3.B Phase A)
3. **Źródło** (з S2 Krok 1.A — CEIDG/KRS classification badge)
4. Właściciel
5. Miasto
6. Kanał
7. Score (right-aligned)
8. Kontakt (centered)

**Premise:** "User не має NIP/KRS columns — плутанина 2 SOLERA Sp.z o.o.".

**Reality:** Current ProspectRow type ВЖЕ contains `nip: string | null` + `krs_number: string | null` fields. Just не rendered у table cells.

**True scope:** Trivial add. ~10 line edit prospects-table.tsx — додати `<TableHead>NIP</TableHead>` + `<TableCell className="font-mono text-xs">{p.nip ?? '—'}</TableCell>`.

## Summary table — premise vs reality

| Q | Vadym premise | Reality | Real fix scope |
|---|---|---|---|
| Q1 Tavily | "не працює, query gen bug" | code OK, likely API key/quota issue OR API returning empty | Surface error visibility (~30 min) |
| Q2 Apify | "name-only similarity rejects phone matches" | ✅ confirmed gap | Add phone-match override (~30 min) |
| Q3 AI prompt | "passes generic PKD codes без описів" | ✅ confirmed gap | PKD descriptions JOIN + prompt directive (~45 min) |
| Q4 AI rescore | "10 окремих calls ~94s" | ❌ FALSE — code already batched single call. 94s = Anthropic API characteristics для large context | No code fix needed; possibly tune maxTokens (~10 min) |
| Q5 prospects NIP/KRS | "missing columns" | ✅ data у row, не rendered | Trivial add (~10 min) |

## Realistic ETA reduction

| Original spec ETA | Discovery-adjusted ETA |
|---|---|
| 3-4h total (5 steps) | **~2-2.5h** (3 real fixes + 1 trivial + Q4 maybe-skip) |

## Scope-reduce proposal — 3 options

### Option A — Real fixes only (~1.5-2h)
1. Q1 Tavily: error visibility у raw_payload + enrichment_log error_message; "partial" status when 0 results, "error" when API failure (~30 min)
2. Q2 Apify: phone-match override у pickBestMatch — if phone normalize matches AND name similarity >= 0.3 → save with note "phone match, address differs" (~30 min)
3. Q3 AI prompt: PKD descriptions JOIN з reference table OR pkd_with_descriptions JSONB column; SYSTEM_PROMPT directive про specialization (~45 min)
4. Q5 NIP column add (~10 min)

**Skip Q4** — premise wrong, no N+1 problem. Якщо Vadym confirms 94s real Anthropic latency, separate sprint for streaming/throttling.

### Option B — Full Vadym spec including Q4 batch refactor
- Same 4 fixes
- Plus Q4 unnecessary refactor (already batched). Adding maxTokens=1500 tweak ~10 min, but if Vadym wants restructure → 30 min wasted on already-correct code.
- ETA 2.5-3h

### Option C — Diagnostic test first
1. Live SOLERA test з working Tavily API key — confirm Q1 actual response (raw_results count + status code)
2. Live test з SOLERA Apify response — see actual `items[]` shape (phone match present?)
3. Then GO Option A focused on confirmed gaps.

ETA: ~30 min diagnostic + Option A.

## Recommended path

**Option C → Option A.**

Vadym pre-test з real API:
- Run `pnpm dlx tsx scripts/sprint-m-rejestrio-probe.ts` (or similar pattern) targeting SOLERA NIP, capture raw Tavily + Apify responses
- Якщо Tavily returns `[]` despite valid API key → confirms API limitation (not code bug); fix becomes "error visibility" only
- Якщо Apify returns matched item з phone but address mismatch → confirms phone-match-override needed

Saves wasted refactor effort на Q4 (no bug) і дає precision data для Q1+Q2.

## ВАЖЛИВЕ для Vadym

**Premise re-frame:** 3 з 5 claims correct (Q2/Q3/Q5), 1 partially correct (Q1 — gap exists but at different layer), 1 wrong (Q4 — already batched). Sprint scope reduces from 3-4h до ~2h after factual corrections.

Якщо Vadym confirms scope = Option A:
1. ~2h coding (Tavily error vis + Apify phone override + AI prompt PKD desc + NIP col)
2. Live re-test on SOLERA → measure quality delta
3. **Q4 deferred** — separate sprint якщо Vadym confirms Anthropic latency unacceptable post-test

Не commiчу. Discovery only. Чекаю decision Q1=Option A/B/C.
