# S-DATA.2.A Phase 1 spike test — FAIL closure

**Date:** 22.05.2026 ~07:00 UTC
**Sprint:** S-DATA.2.A wire Panorama+ALEO для B2B contact discovery
**Outcome:** HARD STOP Phase 2 per fail escape hatch. Branch frozen.

---

## Phase 1 results

| Test | Actor | Input | Result | Status |
|---|---|---|---|---|
| #1 | `trev0n/panoramafirm-scraper` | searchTerms=["Ziomek Fish"], searchLocation="Warszawa" | 100 unrelated businesses (hydraulicy, sewers — random Warszawa listings). 0 NIP match, 0 name match. | **FAIL** |
| #2 | `trev0n/panoramafirm-scraper` | searchTerms=["Arctic"], searchLocation="Radziejowice" | 60 unrelated. 0 NIP match, 0 name match. Ground truth ARCTIC NIP 6112171655 не повернено. | **GROUND TRUTH FAIL** |
| #3 | `powerai/aleo-company-scraper` | searchUrl="https://aleo.com/pl/firmy?term=6112171655" | Run застряг RUNNING >36s, 0 items. Field name `searchUrl` можливо неправильний. | **INCONCLUSIVE / TIMEOUT** |

## Cost overrun

- Pre-spike balance: $39.77 used / $50 → $10.23 remaining
- Post-Phase-1 balance: **$40.75 used → $9.25 remaining**
- Spike spent: **~$1.00** (4 actor runs total — 2 Panorama + 1 ALEO running + status checks)
- Per-call average: **~$0.33** (threshold was $0.02 — **16x violation**)
- Diagnose: Panorama bills per-result. 100 results × ~$0.004 ≈ $0.40 — matches actual.

## Decision per fail escape hatch

- **Panorama FAIL ✅ + ALEO PASS** → wire only ALEO — **NOT applicable** (ALEO inconclusive too)
- **Both FAIL/inconclusive** → skip Phase 2 entirely, freeze, return to baseline

**HARD STOP Phase 2 confirmed.**

---

## Cohort baseline restored (post-decisions-1+2+3)

| Metric | Value |
|---|---|
| Cohort size | **55 unique callable** |
| BOTH email+phone | **22/55 (40%)** |
| address | 80% |
| city | 82% |
| Blind (no email AND no phone) | 33 — backlog, не today's outreach |

**Today's universe для obzwon о 14:00: 22 contacts.**

---

## Investigation findings ($0 — API schema lookup)

### Panorama `trev0n/panoramafirm-scraper`

- `exampleRunInput.body`: `{"helloWorld": 123}` ← **STUB, не реальний input contract**
- `inputSchema`: empty (API не повертає formal schema)
- README claims: `searchTerms[]`, `searchLocation`, `startUrls[]`, `extractDetails`, `maxResults`, `deduplicateByNip`
- Stats: 116 total runs, 96 за 30 днів (82 SUCCEEDED, 9 FAILED, 5 ABORTED). 4 users total.
- Pricing: PAY_PER_EVENT — billed per dataset item (`apify-default-dataset-item`)

**Diagnosis:** input schema **не verifiable через Apify API** — actor розробник не публікує formal schema. README claims = only source. Phase 1 calls використали правильні fields per README, але результати показують search semantics broken (return невідповідних listings).

### ALEO `powerai/aleo-company-scraper`

- `exampleRunInput.body`: `{"helloWorld": 123}` ← same STUB pattern
- README claims: `searchUrl` (input field name)
- Pricing models — два паралельних:
  - **FLAT_PRICE_PER_MONTH $19.99/month** з 120 minutes trial
  - PAY_PER_EVENT (start + result)

**Diagnosis:** same schema-not-published problem. Test #3 used `searchUrl` field per README — actor не закінчився за 36s, видав 0 items. Не verified чи це wrong field name чи slow start.

### Спільні висновки

1. **Actor input schemas не публікуються через Apify API** для обох actors. README claims = unverified contracts.
2. **0 reviews/0 ratings** + **STUB exampleRunInput** = high-risk актори, низька довіра.
3. **PAY_PER_EVENT pricing** означає cost залежить від N results — не fixed per-call. Threshold $0.02/call assumed wrong model.

---

## Branch state

**Files modified Day 2 (NOT shipped — frozen):**
- ❌ No production code changes (Phase 2 wire не started — fail closure спрацював перш ніж step 6.8 implementation)

**Files modified Day 2 (DB writes applied):**
- ✅ cohort_members: 12 CONTINENTAL dups DELETE + 1 Intermarche DELETE → 55 unique
- ✅ contact_enrichment: +3 rows (GRUPA MPT, ARCTIC, OLEUM з correction)
- ✅ clients UPDATE 3 records (phone/website для auto-accepts)
- ✅ Audit CSV: `2026-05-21-decisions-1-2-3-20260522-052303.csv`

**No untested wire to revert.** Branch state safe.

---

## Apify GMaps cron pause — finding

🚨 **Немає apify_gmaps cron у vercel.json.**

4 існуючих crons:
- `/api/cron/hygiene-scan` — 0 1 * * *
- `/api/cron/matching-refresh` — 0 0 * * 0
- `/api/cron/bzp-monitor` — 0 3 * * *
- `/api/cron/market-intelligence` — 0 6 * * 0

Жоден з них не викликає apify_gmaps (grep підтверджено).

apify_gmaps викликається **manually-triggered**:
- `app/api/clients/[id]/enrich-apify` — Vadym clicks "Аналіз клієнта"
- `app/api/intelligence/lookup` — Vadym lookup NIP
- `app/api/prospects/[id]/enrich-apify`
- Cohort bulk operations через UI

**Pause cron = no-op** (нічого паузити).

**$40/cycle жере user-triggered runs.** Це behavior question, не infrastructure pause.

**Recommendation:** реальний skip-logic для `client_type ∈ hurtownia/sklep_detal` живе у Phase B step 6.8 spec який НЕ shipped. Поки що:
- Vadym manually НЕ click "Аналіз клієнта" для hurtownia/sklep_detal до Phase 2 wire
- OR add simple guard у lookup/route.ts (~10 LOC) що skip apify_gmaps якщо `client.client_type` ∈ blocklist. Зараз окремо НЕ робимо — пов'язано з Day 2 sprint який frozen.

---

## Lessons learned

1. **STARTER plan $50/mo з $9.25 залишок = too thin для exploration sprints.** Rule: verify monthly budget headroom ≥ $20 перш ніж wire untested actors. Future: pre-spike budget gate check.

2. **0 reviews/0 ratings actors = high risk.** Actor input schemas повинні бути verified через `/v2/acts/{id}` API endpoint перш ніж first paid call. Якщо `exampleRunInput.body = {"helloWorld": 123}` або `inputSchema` empty — це **red flag**, skip або use на free trial only.

3. **README claims ≠ actual behavior.** Spike test обов'язковий перед bulk — rule, не optional. Це **rule**, не optional. Sprint S-DATA.2.A фактично failed на spike — system worked correctly (caught before bulk waste).

4. **Cost threshold $0.02/call breach 16x не expected.** Actors можуть PAY_PER_EVENT billed per-result (Panorama returns 100 items = $0.40). Future cost guard: **HARD STOP first call якщо cost > $0.10**.

5. **Apify GMaps cron — assumption був неправильний.** Не cron, а user-triggered runs. Future audit: підтвердити cron existence ДО pause-decision.

6. **Schema не публікується via API ≠ broken actor.** Це developer choice — частина PAY_PER_EVENT актoрів не публікують. README залишається авторитетним джерелом.

---

## Backlog items (з цього sprint)

| Item | Source | Estimate |
|---|---|---|
| S-DATA.2.B "actor evaluation" — try alwaysprimedev/panoramafirm-scraper ($5/1k) як альтернатива Panorama | S-DATA.2.A Phase 1 fail | ~1 год |
| S-DATA.2.B "контакт-info APIs" — Hunter.io, Snov.io evaluation для B2B email lookup за NIP/website | альтернативи Apify актoрам | ~2 год research |
| S-DATA.2.B "KRS scrape" — board members + website через KRS API (rejestrio extended) | альтернатива через registry data | ~2 год |
| Phase B step 6.8 skip-logic — skip apify_gmaps для client_type ∈ hurtownia/sklep_detal | окрема micro-task, ~10 LOC | ~30 хв |
| Apify monthly budget alert — notify Vadym коли usage > 80% cycle | Protocol 40 extension | ~30 хв |
| S-DATA.3 dedupe sprint — `merge_clients_by_nip(canonical_id, duplicates[])` | 13 CONTINENTAL incident | ~3-4 год |
| NIP unique constraint check на cohort_members insert | data quality | ~30 хв |

---

## Next decision points для Vadym

1. Чи продовжувати S-DATA.2.B (try alternative actor) сьогодні чи перенести на наступний sprint?
2. Чи додати Phase B step 6.8 skip-logic зараз (~30 хв, no Apify cost) щоб уникнути додаткового GMaps spend на hurtownia клієнтах?
3. Чи pivot strategy: замість Apify scrapers — Hunter.io/Snov.io APIs (transparent per-call pricing, лідогенераційні B2B контакти)?

---

## Commit message (Vadym виконує)

```
docs(audit): S-DATA.2.A Phase 1 fail closure + investigation findings

Phase 1 spike test:
- Panorama trev0n: search semantics broken (returns random businesses
  замість target NIP/name) — 2/2 tests FAIL
- ALEO powerai: input field schema unverified, run timeout 0 items —
  INCONCLUSIVE
- Cost: $1.00 spent / $0.05 expected (16x threshold breach — PAY_PER_EVENT)

HARD STOP Phase 2 per fail escape hatch. Cohort baseline 55 unique
restored з 22 BOTH email+phone (40%) для obzwon о 14:00.

Investigation $0 finding:
- exampleRunInput у обох actors = {"helloWorld":123} stub — actor input
  schemas не публікуються через Apify API. README — only source.
- Apify GMaps cron не існує — викликається через user actions.
  Pause cron = no-op.

Lessons → docs/sztab-audit-log/2026-05-22-phase1-spike-fail.md
Backlog items added для S-DATA.2.B + Phase B step 6.8 skip-logic.
```

---

**Status:** Branch frozen. Vadym committs audit log + dispatches obzwon з 22 contacts. Чекаю decisions для S-DATA.2.B / step 6.8 skip-logic / pivot.
