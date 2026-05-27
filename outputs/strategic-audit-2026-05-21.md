# Sztab — стратегічний аудит станом на 21.05.2026

**Виконав:** Cowork (sandbox bash + Read tools)
**Метод:** read-only синтез docs/sztab-state.md, sztab-protocols.md, sztab-sprints.md, sztab-audit-2026-05-13.md, journal/2026-05-15.md + git log post-15.05
**Принцип:** Protocol 1 — лише те що задокументовано або підтверджено у коді/git, без вигадування з пам'яті

---

## 1. Strategic alignment matrix (L1-L7)

Архітектура з CLAUDE.md — порівняння план vs реальність:

| Шар | План (CLAUDE.md) | Реальність 21.05 | Gap |
|---|---|---|---|
| **L1** DB foundation | Supabase + tables | ✅ DONE — 57 таблиць + 2 views (audit 13.05) | — |
| **L2** CEIDG scoring | horeca_meta_score + chain loyalty | ✅ DONE — 2705 prospects scored | `loyalty_tier=NULL` для всіх chains крім Żabka/Lewiatan/Groszek |
| **L3** Schema hygiene | продукт/клієнт атрибути | ✅ DONE | `Branża` column показує raw `UC_LQE96U` коди у /clients list |
| **L4** Enrichment | Apify + KRS + AI | ⚠️ PARTIAL — 385/2705 enriched ≈14% | Apify Starter $29/mo щойно активований 12.05 (~500-700 NIPs/міс ceiling). Phase 2.8 KRS bulk paginator має TODO у `lib/intelligence-engine/core/modes/registry-mode.ts` |
| **L5** Algo matching | broad sweep | ✅ DONE — 50500 matches у DB | ratio 187:1 vs clients — backlog зростає |
| **L6** AI re-score | TOP-20 non-obvious | ✅ DONE — `/matches [L6 AI bulk]` button працює з cost guard | — |
| **L7** AI sales strategy | NEW capability | ❌ PLACEHOLDER — тільки `lib/matching/sales-snippet.ts` "L7 lite" (cold-opener + value-prop) | повна стратегія per-SKU/kategoria/kanał НЕ shipped |

**Two-track v5 (gastronomia/hurtownia, ACCEPTED 03.05):**

| Track | Стан |
|---|---|
| Gastronomia | ✅ DONE — Sprint S-MENU 15.05 закрив pipeline: brand → website → menu → ingredients → prediction. ~95% auto-discovery projected. |
| Hurtownia | ❌ ONLY classification + filter chips. Workflow (manual asortyment import) **NOT shipped** — planned Day 6+ per audit 13.05. |

**Operational sales tooling (новий шар, 16-21.05, НЕ задокументовано у docs):**

| Sprint | Commit | Дата | Стан |
|---|---|---|---|
| S-ORDER.1.A — migration 068 + seed cennik v9 | ab201c6 | 16-17.05 | ✅ |
| S-ORDER.1.B.1/2 — DB+API foundation + public form UI | e4b48f1, 119ecdb | 17.05 | ✅ |
| S-ORDER.1.C.1/2/3 — admin orders list + detail + inline edit | 850322d, c2b6ed3, 1e2d246 | 19.05 | ✅ |
| S-ORDER.1.D — order link generator | a162cc1 | 19.05 | ✅ |
| S-ORDER.2.A.1 — migration 070 Fakturownia + notification_log | f4ba684 | 19.05 | ✅ |
| S-ORDER.2.A.2 — Fakturownia client + Resend + router | e9c68cb | 19.05 | ✅ |
| S-ORDER.2.A.3 — hook proforma у submit flow | 11d7421 | 19.05 | ✅ |
| S-ORDER.2.A.3.1/2 — hotfix quantity_unit + after() wrap | 4645ac1, 20e3e8f | 20-21.05 | ✅ |
| S-OFFER.1 — sales outreach z cennik xlsx + draft order link | dfcf2bb | 21.05 | ✅ |
| S-ORDER.2.A.4 — кнопка "Wystaw fakturę VAT" + email + KSeF auto | cc5c23b | 21.05 | ✅ shipped, functional smoke test **deferred** (KSeF regulatory) |

**Висновок:** L1-L6 + gastronomia + sales tooling = production-ready. L7 sales strategy + hurtownia workflow + audit cleanup = OPEN.

---

## 2. Open commitments — sprints planned not shipped

### З docs/sztab-sprints.md (статус "PLANNED")

- **S-CORE.3.B** — TOP 25 client matching на /produkty/[id]
  - Source: sztab-sprints.md, секція "S-CORE.3.B (next session)"
  - Estimate: ~1.5-2 год Cowork solo work
  - Scope: read existing `matches` WHERE product_id, `product_match_runs` versioning + "Pokaż наступних 25 без overlap", market intelligence (Allegro/Tavily)
  - Dependency: S-CORE.3.A done (shipped 04.05, commit 67a85a6)

- **S-CORE.4** — Wire Market Profile `/rynek/[product_id]`
  - Source: sztab-sprints.md
  - Estimate: 3-4 год
  - Scope: TAM/SAM/SOM аналіза + match histogram per товар + external context (ZSRIR, fresh-market, EU Agri-food)
  - Dependency: S-CORE.3.B done

- **S-CORE.5** — Wire Strategy Profile `/strategia`
  - Source: sztab-sprints.md
  - Estimate: 6-8 год (revised after Strategy Shift)
  - Scope: дерево per SKU/kategoria/kanał/brand + 10-секційний long-form raport + edit ручний + versioning + eksport PDF
  - Dependency: S-CORE.4 done

- **Sprint Sztab Pikniko — 5 modułów** (з 06.05.2026, post-pivot)
  - Source: sztab-state.md рядок 2262 "Sztab Pikniko — 5 модулів план"
  - Estimate: 2 тижні з 06.05 — теоретично мав закінчитися 20.05
  - Реальність: shipped Phase 1 Dual-Workspace 08.05 (commit згаданий у state.md ~2337), решта модулів — **не задокументовано** у state.md (entry обривається на Phase 1 wrap). Треба перевірка у Vadym.

### З docs/journal/2026-05-15.md, секція "Next sprint (open questions)"

- DEKOB / OKEH BAKERY re-analiza verification (3rd backfill candidate — awaiting check)
- Mass test 20+ JDG gastronomy re-analyses — виміряти реальний % auto-discovery (гіпотеза ≥95%)
- Sprint S-CORE.3.B (per-product matching) — depends on universal layer DONE ✓

### З docs/sztab-protocols.md, "Sprint S-MENU cleanup backlog"

1. **Consolidate 3 duplicate DishesSource type unions** → `lib/predictions/types.ts`
2. **Factory helper `makeEmptyBrandSearchResult()`** для consistent object literal у `lib/enrichment/web-search.ts`
3. **sp. z o.o. KRS `nazwa_skrocona` brand extraction** (analog CEIDG koncesje для spółek без CEIDG)
4. **City extraction fallback chain expansion** — `clients.city ?? brand_aliases[0].city ?? gus_data.miejscowosc ?? vat_data.subject.residenceAddress`
5. **Apify async mode investigation** для Phase B optimization (>30s budget)

### Implicit з S-ORDER 21.05 (Cowork session today, НЕ задокументовано)

- **S-ORDER.2.B** — admin "Wystaw fakturę proforma" button (mirror VAT, ~30 хв). Сьогодні proforma створюється тільки через public submit auto-flow.
- **S-ORDER.3** — admin manual order creation на `/clients/[id]` з modal SKU picker (~1.5-2 год). Vadym сьогодні згадав "сам створю фактури вручну" — це gap.

---

## 3. Audit findings status — 13.05 → 21.05

27 findings ranked P0-P3 з `docs/sztab-audit-2026-05-13.md`. Cross-reference з git log 16-21.05.

| Tier | Items | Estimate | Shipped 16-21.05 | OPEN |
|---|---|---|---|---|
| **P0** (blocking morning workflow) | 5 | ~7h | 0 | **5/5 OPEN** |
| **P1** (1-week ship) | 8 | ~24h | 0 | **8/8 OPEN** |
| **P2** (2-week polish) | 8 | ~16-20h | 0 | **8/8 OPEN** |
| **P3** (backlog) | 6 | ~10h | 0 | **6/6 OPEN** |

**Висновок:** 27/27 audit findings залишаються OPEN. Sprint S-MENU (15.05) + S-ORDER + S-OFFER chain (16-21.05) shipped ortogonально до audit roadmap — operational sales tooling замість UX/legacy cleanup.

### P0 (high-impact, low-effort) — деталі

1. `/sprzedaz?tab=kohorty` показує застарілу `pikniko_handoff_cohorts` (2h) — Vadym НЕ бачить cohort 29 при morning workflow
2. `Export Pikniko CSV` rename/remove на /matches (30min) — confusing branding після pivot
3. 5 placeholder routes 404 у IntelligenceSidebar (1h) — dead links discovery/dopasowania/analizy
4. Cohort optimistic UI відсутній (2-3h) — Status/Notes потребують F5
5. Score column ambiguity у cohort (1h) — horeca_meta_score vs gmaps_rating без legend

### Audit roadmap vs реальність

| Тиждень | План з audit 13.05 | Реально shipped |
|---|---|---|
| 1 (13-17.05) | P0 cleanup ~7h | Sprint S-MENU (gastronomy auto-discovery, ~25 commits) |
| 2 (20-24.05) | P1 functional gaps ~24h | S-ORDER ecosystem + S-OFFER + S-ORDER.2.A.4 (поточний тиждень) |
| 3 (27-31.05) | P2 polish ~16-20h | **TBD** |
| 4 (3-7.06) | L7 sales strategy + hurtownia + окрема strategy session | **TBD** |

---

## 4. Backlog explicit list

### Tech-debt (з audit + protocols)

| Item | Source | Effort |
|---|---|---|
| 25 baseline tsc errors (cleanup-sprint) | sztab-sprints.md "Backlog tech-debt" | post-S-CORE.5 |
| CEIDG resume page 22+ (HTML response error, JSON.parse без graceful fallback) | sztab-sprints.md | unknown |
| middleware → proxy migration (Next.js 16 deprecation) | sztab-sprints.md | unknown |
| 33 TODO markers triage → `docs/tech-debt-2026-05.md` | audit P3 #27 | 2h |
| Helper extraction shared AI patterns (product-analysis + business-analysis convergence) | sztab-sprints.md | unknown |
| TODO у `lib/intelligence/zsrir.ts` (6 markers) | audit findings | S-INTEL.1.2 follow-up |
| TODO у `app/api/cron/market-intelligence/route.ts` (4 markers) | audit findings | S-INTEL.1.2.2/3 |
| TODO у `lib/intelligence-engine/core/modes/registry-mode.ts` (4 markers, bulk paginators) | audit | S-CORE.2 |
| TODO у `lib/ceidg/scoring.ts` (2 markers, V2 chain loyalty multiplier) | audit | unknown |

### Data quality

| Item | Effort | Note |
|---|---|---|
| chains `loyalty_tier=NULL` для більшості мереж | manual Vadym verification | НЕ екстраполювати з імен |
| CEIDG coverage 14% → треба KRS bulk через rejestr.io для sp.z o.o. | Phase 2.8 (partially shipped 04.05) | not fully wired |
| `pikniko_handoff_cohorts` → `cohorts` data migration + route deprecation | ~6h | audit P1 #8 |

### Discovery / observation

| Item | Source | Status |
|---|---|---|
| Pikniko 5-day observation (Protocol 28) | sztab-protocols.md рядки 1100-1149 | unknown — Vadym має confirm чи виконано |
| Pikniko owner розмова 06.05.2026 (Protocol 29) | sztab-protocols.md | already happened |

---

## 5. Risks / dependencies

### Регуляторні

- **KSeF (новий, post 21.05)** — VAT button з нашого endpoint = real Krajowy System e-Faktur submission. Functional smoke test S-ORDER.2.A.4 заблокований до перший real customer order. Будь-який наступний fiscal-touching feature потребує продуманий test strategy (sandbox Fakturownia, dry_run flag, або тільки real customer).

### Фінансові

- **Apify Starter $29/mo** активований 12.05 — ~500-700 NIPs/міс ceiling. Per Protocol 40: fully-enriched NIP ≈ $0.06, cohort 50 NIPs = $3/batch. Якщо outreach scale >700 NIPs/міс → upgrade або prepaid add-ons.
- **Inne external API costs:** Tavily basic $0.005/call, Anthropic Haiku $1/$5 per 1M tokens, Gemini free tier.

### Технічні

- **Cowork sandbox virtiofs phantom errors** (Protocol 16, 37) — sandbox bash іноді показує файл коротшим або обірваним. Real file на диску цілий. Native PowerShell verify через `(Get-Content).Count`. Жодних `cp/mv/rm` на existing files через bash.
- **Sandbox node_modules I/O errors** (today 21.05 — Protocol 31/37) — tsc у Cowork sandbox unreliable. Vadym має tsc на хості.
- **CEIDG ≠ sp. z o.o.** — Phase 2.8 KRS bulk paginator має TODO. Coverage 14% залишається ceiling до Phase 2.8 ship.

### Стратегічні

- **L7 sales strategy empty** — це найбільший strategic gap. Без L7 Sztab залишається "intelligence + matching" tool, не "sales strategy" tool який обіцяє CLAUDE.md.
- **Hurtownia track майже не покритий** — тільки classification + filter chips. Без manual asortyment import (planned Day 6+) Vadym не може повністю обслуговувати non-gastronomia сегмент.
- **Pikniko COI transparency (Protocol 29)** — Vadym is Operations Director у Pikniko, Sztab is власний tool. Розмежування критичне для довгострокової legitимності.

### Робочі

- **Protocol 7 — energy management:** не починати новий sprint якщо попередній має open FAIL/WARN. Не робити parallel sprints. Decision matrix: усі попередні sprints OK post-ship verification?
- **Protocol 14 — git operations boundary:** Cowork edits files, Vadym commits + push з PowerShell.

---

## 6. Recommended next sprint — top 3 candidates

### Кандидат A — Audit P0 cleanup (~7 год, найвищий short-term ROI)

**Pros:**
- 5 items × 30min-3h = ~7h total. Один день роботи.
- Розблоковує morning workflow: cohort 29 visible у `/sprzedaz`, sidebar без 404, /matches без Pikniko branding, cohort UI optimistic.
- Закриває debt який накопичується з 13.05 (вже 8 днів).
- Низький ризик — UI cleanup, не торкається data layer.

**Cons:**
- НЕ закриває strategic gap (L7, hurtownia).
- Vadym може відчути що "не shipped нову value" — це cosmetic.

**Argument:** Audit 13.05 saw morning workflow gaps blocking Vadym daily. 8 днів пройшло, gaps залишилися.

---

### Кандидат B — S-ORDER.3 admin manual order create (~1.5-2 год, immediate operational ROI)

**Pros:**
- Vadym сьогодні згадав "поки сам створю фактури вручну, це не пріоритет" — це gap signal. Реально 2 замовлення зараз чекають, наступні (~3-5 на тиждень) теж.
- Швидкий ship — modal SKU picker pattern уже існує (AddItemModal у order-detail.tsx). Reuse-able.
- Closes operational gap у нещодавно shipped S-ORDER chain — сильна cohesion.

**Cons:**
- Не закриває audit findings.
- Не strategic, операційний.

**Argument:** Якщо direct sales = revenue driver, кожне friction-point у Vadym order flow коштує час і energy. Admin manual order створення замикає production loop.

---

### Кандидат C — Mass test S-MENU гіпотези (~30 хв, data-driven decision input)

**Pros:**
- Без коду — тільки re-analyze 20+ JDG gastronomy + measurement.
- Дає data чи Sprint S-MENU реально досяг ≥95% auto-discovery як гіпотеза.
- Якщо <95% — знаєш де gaps до того як scale outreach.
- Якщо ≥95% — confident move до Sprint S-CORE.3.B (per-product matching) знаючи universal layer OK.

**Cons:**
- Може показати regression що потребує hotfix.
- "Тільки" measurement — для деяких відчуття "не shipped value".

**Argument:** Per journal 15.05 "Next sprint (open questions)" — це explicit next-step з S-MENU lessons. Без measurement strategic decisions L7/hurtownia робляться без ground truth.

---

### Моя думка (одна, не "I'll let you decide" wash)

Якщо я мав би вибрати — **B (S-ORDER.3) + C (mass test S-MENU)** комбо на наступний 1-2 дні.

**Чому:**
- B (~2h) закриває щойно знайдений operational gap (Vadym сам зазначив сьогодні)
- C (~30min) дає data для C-level decision: L7 strategy чи hurtownia track наступний quarter
- Разом ~2.5 год — fits у Protocol 7 energy budget (не parallel sprints, послідовно)
- Audit P0 cleanup (A) може чекати наступного тижня — Vadym уже 8 днів живе з тим friction, не critical

**Чого НЕ робив би зараз:**
- S-CORE.4/.5 (Market/Strategy profile) — занадто великі (3-8 год), L7 sales strategy потребує окремої strategy session з Vadym перш ніж кодити (per audit 13.05 Тиждень 4 note)
- Sprint S-MENU cleanup backlog (5 items) — це tech debt, не feature, низький priority поки нема regression

---

## 7. Що НЕ задокументовано у docs (вимагає Vadym verification)

1. **Sprint Sztab Pikniko 5 модулів** — план з 06.05 (state.md 2262). Тільки Phase 1 Dual-Workspace task wrap задокументовано (state.md 2337). Решта 4 модулів — status unknown.
2. **Cohort 29 outreach reality** — сьогодні sent emails? Response rate? Pikniko handoff status? Audit 13.05 згадує cohort 29 як CzM outreach, але реальних numbers немає у docs.
3. **DEKOB / OKEH BAKERY** — у journal 15.05 згадано як "awaiting re-analiza verification". 6 днів пройшло — verification виконано чи ні?
4. **S-ORDER + S-OFFER docs entries** — state.md, sprints.md, protocols.md ВСІ закінчуються 15.05. Sprints 16-21.05 живуть тільки у git log. Це Protocol 9/10 violation (Discovery Log) — accumulating doc-debt.
5. **L7 strategy session** — audit 13.05 каже "потребує окремого strategy session з Vadym" для Тиждень 4 (3-7.06). Сьогодні 21.05 — strategy session планується?

---

**END OF AUDIT.**

Готовий заглибитись у будь-який кандидат (A/B/C), будь-яку секцію (1-7), чи перевірити items з "не задокументовано" (#7) на live data.
