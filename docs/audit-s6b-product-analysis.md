# SZTAB — AUDIT S6B / PRODUCT ANALYSIS (read-only)

**Date:** 01.05.2026
**Auditor:** Claude (Cowork mode, read-only)
**Method:** repo file inventory + повний read 4 ключових файлів + git log
**Scope:** Sprint S6B "Аналіз товару" — поточний стан product analysis pipeline у репо vs Protocol 13 target architecture
**Status:** READ-ONLY audit. Жоден файл не модифіковано.

---

## 1. EXECUTIVE SUMMARY

- **Single "Аналіз товару" button НЕ існує.** На /produkty та /products немає primary action button який запускав би весь pipeline. Тригери розкидані: FastLookup і Deep Discovery — на /products/[id]/edit (legacy English route), product attribute enrich — лише через POST API, без UI кнопки на product profile.
- **Існує 3 паралельні product-related pipelines, не агреговані:** (a) `POST /api/products/[id]/enrich` — OFF + AI fallback для product_attributes; (b) server action `startDeepDiscoveryForProduct` → 4-stage pipeline (AI segmentation → Apify Panorama → KRS verify → AI ranking) у table `discovered_entities`; (c) `lib/matching/engine.ts:computeMatchesForProduct` + `lib/matching/ai-rescore.ts` — algo matching across clients/prospects + L6 AI re-score top-20. Жоден з них не знає про інших.
- **Protocol 13 architecture частково присутня в Deep Discovery pipeline (AI ranking — фінальний stage 4).** Це найближча існуюча implementation паттерну "sources first → AI last". Але Apify+KRS там використовуються для **discovery нових entities** (lead gen), а не для analytics самого товару (pricing, competitor signal, market demand).
- **Brakuje повністю:** Tavily для продукту (brand mentions, reviews), Allegro pricing aggregation per product (scraper існує, але hooked тільки до /api/allegro/test diagnostic endpoint), Ceneo / price comparison, surfaced OpenFoodFacts payload (зараз сидить тільки у `product_external.off_payload`, не показується юзеру). Google Places для продукту irrelevant — це для entities.
- **DB schema готовий частково.** Є `intelligence_runs` (history), `discovered_entities` (Phase 2 results), `product_attributes` + `product_external` (enrichment cache), `matches` з `score_breakdown` + `ai_score`. Немає `product_analytics`, `product_competitors`, `product_pricing_snapshot` — це нові таблиці потрібні для S6B результатів.

---

## 2. ІНВЕНТАР ENDPOINTS

### 2.1 Product API routes
```
app/api/products/
└── [id]/
    ├── attributes/route.ts        # GET — merged attribute view (read-only)
    └── enrich/route.ts            # POST — OFF + AI fallback for product_attributes
```
Branch минулих sprintів: legacy CRUD на `app/(dashboard)/products/{new,[id]/edit}`, новий список на `app/(dashboard)/produkty/page.tsx` (без detail page!). **На /produkty/[id] немає окремої сторінки** — продуктовий profile відкривається в drawer/панелі ProduktyShell або через legacy `/products/[id]/edit`.

### 2.2 Intelligence routes (product context)
```
app/api/intelligence/
├── enrichment-status/route.ts     # polling status (Phase B)
└── lookup/route.ts                # CLIENT-only (NIP lookup), не product
```
`app/(dashboard)/intelligence/deep-discovery/[product_id]/page.tsx` — рендерить результати Deep Discovery для продукту (entities table). Дані pull-аються через server actions `getLatestDeepDiscoveryRun` + `getDiscoveredEntities`. Тригер run — server action `startDeepDiscoveryForProduct`, виклик з компонента FastLookupCard на `/products/[id]/edit`.

### 2.3 Server actions (product context)
```
app/actions/
├── intelligence.ts          # startFastLookupForProduct, startDeepDiscoveryForProduct,
│                            # getLatestDeepDiscoveryRun, getDiscoveredEntities,
│                            # exportEntityToClient, updateDiscoveredEntityStatus
└── products.ts              # CRUD продуктів (без analysis logic)
```

### 2.4 lib/matching tree (product-aware)
```
lib/matching/
├── engine.ts                # computeMatchesForProduct(productId) — recompute проти всіх clients+prospects
├── ai-rescore.ts            # L6: top-20 matches WHERE product_id=? → Claude Haiku JSON
├── sales-snippet.ts
├── types.ts                 # MatchProduct, MatchTarget, MatchFamily
└── scoring/
    ├── activity-status.ts
    ├── aggregate.ts         # aggregateMatch(target, product, family)
    ├── geographic.ts
    ├── hygiene-gate.ts      # blocks scoring якщо product hygiene_status='DIRTY'
    ├── loyalty-multiplier.ts
    ├── pkd-fit.ts
    ├── recency-boost.ts
    ├── s2a-signals.ts
    └── size-match.ts
```

### 2.5 lib/* helpers (product-relevant)
```
lib/
├── ai/
│   ├── intelligence.ts            # runFastLookup + runDeepDiscovery (4-stage)
│   ├── sku-attributes.ts          # generateSkuAttributesBulk (Claude Haiku)
│   └── business-analysis.ts       # CLIENT-only AI summary (НЕ для продукту)
├── ai-providers.ts                # callAI wrapper (Claude/Gemini/OpenRouter)
├── allegro/
│   ├── client.ts                  # OAuth client
│   ├── scraper.ts                 # parseforge~allegro-scraper Apify actor wrapper
│   └── types.ts
├── enrichment/
│   ├── apify.ts                   # generic Apify runner
│   ├── apify-batch.ts
│   ├── web-search.ts              # Tavily client (CLIENT-only flow)
│   └── ...                        # bzp/krs/gus/vat/website/msig — все для entities, не products
├── integrations/
│   ├── apify.ts
│   └── krs-rejestr.ts             # lookupKrsByNip — використовується у Deep Discovery Stage 3
├── openfoodfacts.ts               # 🟢 product-specific — getOpenFoodFactsByBarcode + offToAttributes
├── product-attributes.ts          # 🟢 resolveProductAttributes (merge family default + SKU + hygiene)
└── types.ts                       # interface Product
```

### 2.6 Supabase schema (product-related, з scripts/*.sql)
Каталог `supabase/` **відсутній** — migrations лежать у `scripts/` як numbered SQL файли (apply через `scripts/apply-migration.ts`). 045 migrations загалом.

Таблиці які стосуються продукту/аналізу продукту:
| Table | Purpose | Migration |
|---|---|---|
| `products` | основна SKU table | 001 / 003 / 005 / 006 / 008 / 009 / 010 |
| `product_attributes` | per-SKU attribute values, source enum | 023 |
| `product_external` | OFF + Gemini/AI raw payload cache | 023 |
| `family_attribute_defaults` | family-level defaults | 023 |
| `taxonomy_segments` / `taxonomy_families` / `taxonomy_classes` | taxonomy 3-tier | 023 |
| `pkd_2007` / `pkd_2025` / `pkd_mapping` | PKD codes + transition map | 023 |
| `intelligence_runs` | run history (fast_lookup / deep_discovery / partner_analysis) | 011 |
| `discovered_entities` | Deep Discovery Phase 2 entities | 012 / 013 |
| `matches` | algo + AI matches; score_breakdown JSONB | 026 / 027 / 030 / 043 |

### 2.7 UI views (де *може* з'явитись "Аналіз товару" button)
| Route | Стан | Замітка |
|---|---|---|
| `/produkty` (Polish list) | OK | НЕМАЄ detail/profile сторінки `[id]` |
| `/produkty/[id]` | **Не існує** | Critical gap — не маємо product profile сторінку для primary CTA |
| `/products/[id]/edit` | OK (legacy) | Тут зараз FastLookupCard живе |
| `/intelligence/deep-discovery/[product_id]` | OK | Read-only вид results |
| `/intelligence` | OK | History всіх AI runs |

---

## 3. DEEP-READS ФАЙЛІВ

### 3.1 `app/api/products/[id]/enrich/route.ts` (283 рядки)
**Що робить:** POST endpoint для збагачення атрибутів одного SKU. Pipeline: (1) load product → ean + family_id + required_attributes, (2) OFF lookup за EAN з 7-day cache, upsert product_attributes (source='off'), (3) AI fallback (Claude Haiku 4.5 через `generateSkuAttributesBulk`) для ще-не-заповнених required attrs → upsert (source='ai'), (4) re-resolve merged view + update products.hygiene_status. Idempotent, не overwrite manual/override/locked.

**Data sources:**
- DB tables: `products`, `taxonomy_families`, `product_external`, `product_attributes`, `params` (для anthropic_api_key)
- External: OpenFoodFacts `getOpenFoodFactsByBarcode(barcode)`, Anthropic Claude API через `lib/ai/sku-attributes.ts`
- НЕ викликає: Apify, KRS, Tavily, Allegro, Google Places

**TODO/FIXME/MOCK/PLACEHOLDER markers:** **немає.** Comment на line 195 згадує "legacy schema column name 'gemini_payload' зачинено — обмінено провайдер до Claude 2026-04-28" — це не TODO, це історична нотатка.

**Last commit:** `76d4e57 2026-04-28 feat(ai): swap Gemini → Claude Haiku 4.5 for SKU attribute bulk-gen`

---

### 3.2 `app/(dashboard)/intelligence/deep-discovery/[product_id]/page.tsx` (78 рядків)
**Що робить:** Server-rendered сторінка яка показує **результати** Deep Discovery run для продукту. Підвантажує latest run з `intelligence_runs` (run_type='deep_discovery', target_id=product_id) + всі `discovered_entities` цього run. Рендерить через client component `DeepDiscoveryResults` (table з NIP, status, AI rank, KRS verified flag тощо). Кнопка "Wróć do produktu" веде назад на `/products/[product_id]/edit` (legacy). `maxDuration = 800` (дозволяє server actions які стартують з цієї page крутитись до 800s — Pro plan ceiling).

**Data sources:**
- DB tables: `products` (resolve name), `intelligence_runs`, `discovered_entities`
- External: НЕ безпосередньо. Server actions `getLatestDeepDiscoveryRun` + `getDiscoveredEntities` — лише читають з DB
- Тригер discovery: НЕ тут. Кнопка "Uruchom Deep Discovery" знаходиться у `FastLookupCard` на `/products/[id]/edit` → виклик server action `startDeepDiscoveryForProduct(productId)` → який викликає `runDeepDiscovery` з `lib/ai/intelligence.ts`. Той pipeline уже звертається до: AI (Claude) для segmentation + ranking, Apify Panorama Firm для scraping, KRS rejestr.io для NIP verification.

**TODO/FIXME/MOCK/PLACEHOLDER markers:** **немає.** Коментар про `maxDuration=800` — не TODO.

**Last commit:** `9d1c976 2026-04-26 Sprint v2.1 / Hotfix 3: KRS URL pattern fix (/krs/podstawowe/nip{nip}) + maxDuration=800 у server action + adaptKrsResponse з real schema`

---

### 3.3 `lib/matching/engine.ts` (529 рядків)
**Що робить:** High-level matching engine. Три public функції: (a) `computeMatchesForClient(clientId)`, (b) `computeMatchesForProspect(prospectId)`, (c) `computeMatchesForProduct(productId)` — wipe + recompute matches across **всіх** clients + prospects для даного SKU; (d) `bulkRecomputeAll({clientsOnly?, prospectsOnly?})` — batch recompute з HoReCa pre-filter (PKD divisions 10/11/46/47/56) для prospects. Uses delete-then-insert pattern (PostgREST не intercept-ує partial UNIQUE indexes). Після insert викликає RPC `refresh_primary_match_flags`. `EXPIRY_DAYS = 7` — matches stale-нуть і re-computаються через cron `matching-refresh`.

**Data sources:**
- DB tables: `clients`, `ceidg_prospects`, `products`, `taxonomy_families`, `matches`
- External: жодних. Це pure compute (algo scoring) над data що уже у DB. AI re-score окремо у `ai-rescore.ts` (НЕ викликається з engine.ts).
- Залежить від попередніх стадій enrichment (KRS / GUS / VAT) які вже мають бути у `clients` / `ceidg_prospects` rows.

**TODO/FIXME/MOCK/PLACEHOLDER markers:** **немає.** Коментар про `pkd_changed_recently: false` (line 117) — це default value, не placeholder.

**Last commit:** `8b2ab45 2026-04-30 Sprint S2A Phase 3: score formula extension з penalties + bonuses`

---

### 3.4 Product attributes schema — `scripts/023_taxonomy_core.sql` (254 рядки)
**Що робить:** Sprint E foundation migration. Створює 3-tier taxonomy (`taxonomy_segments` → `taxonomy_families` → `taxonomy_classes`), `family_attribute_defaults`, **`product_attributes`** (per-SKU values, source enum: `family_default | off | gemini | manual | override`, унікальний ключ `(sku_id, attr_key)`, `override_locked` boolean), **`product_external`** (1:1 з products, поля `off_payload` + `off_fetched_at` + `gemini_payload` + `gemini_fetched_at`), `pkd_2007` / `pkd_2025` / `pkd_mapping`. ALTER TABLE products додає `family_id`, `class_id`, `brand`, `hygiene_status` (CHECK 'CLEAN' | 'DIRTY' | 'UNCHECKED'), `hygiene_issues` JSONB, `hygiene_checked_at`. Resolution rule: SKU override locked > SKU override unlocked > Family default.

**Data sources:**
- Не зовнішні — це DDL.
- RLS: усі 9 нових таблиць мають `authenticated_all` policy крім `pkd_*` (read-only).

**TODO/FIXME/MOCK/PLACEHOLDER markers:** **немає.** Коментар "DROP TABLE statements at bottom (commented out)" — задумана reversibility.

**⚠️ Невідповідність зі сучасним кодом:** source enum дозволяє `'gemini'`, але `app/api/products/[id]/enrich/route.ts` записує `'ai'` (line 205, 271). Це швидше за все працює тільки тому, що Postgres CHECK constraint конкретно `IN ('family_default', 'off', 'gemini', 'manual', 'override')` має блокувати — але запис відбувається. **Підозра що migration була оновлена пізніше або CHECK не активний** — потрібен `\d+ product_attributes` на live DB для verify. Це окремий gap для S6B (consistency check).

**Last commit:** `ef8b95c 2026-04-28 Sprint E / Commit 1/8: 023_taxonomy_core.sql migration`

---

### 3.5 Bonus файли (для повної картини)
- `lib/openfoodfacts.ts` (188 рядків) — OFF API client + `offToAttributes` mapper. Останній commit `6610e22 2026-04-28`. Жодних TODO.
- `lib/product-attributes.ts` (162 рядки) — `resolveProductAttributes(supabase, skuId)` мерджить family defaults + SKU rows + hygiene. Останній commit `318d5b4 2026-04-28`. Жодних TODO.
- `app/api/products/[id]/attributes/route.ts` (49 рядків) — read-only GET endpoint. Останній commit `318d5b4 2026-04-28`.
- `lib/ai/intelligence.ts` (780 рядків) — Fast Lookup + Deep Discovery 4-stage pipeline. Останній commit `611ddb5 2026-04-28 feat(ai): replace Gemini with Anthropic Claude API`. Жодних явних TODO/FIXME у коді.
- `app/actions/intelligence.ts` — server actions wrapper. Останній commit `611ddb5 2026-04-28`.

---

## 4. GAP MATRIX vs PROTOCOL 13

**Цільова архітектура (Protocol 13):**
> ОДНА КНОПКА "Аналіз товару" → fan-out до ВСІХ sources паралельно → агрегація → AI re-score В КІНЦІ.

| Source | Підключений? | Де? | Gap до Protocol 13 |
|---|---|---|---|
| **Apify Panorama Firm (entity discovery)** | ✅ TAK | `lib/ai/intelligence.ts` Stage 2 (runStage2Scraping) у Deep Discovery pipeline; trigger через `startDeepDiscoveryForProduct` у `app/actions/intelligence.ts` | Працює, але **не як generic source layer**. Запускається тільки якщо натиснути Deep Discovery на `/products/[id]/edit`. Не агрегований з іншими sources як паралельна гілка. |
| **Apify Allegro scraper (product pricing)** | ⚠️ ЧАСТКОВО | `lib/allegro/scraper.ts` exists, parseforge~allegro-scraper actor verified working. Hooked тільки до `/api/allegro/test` diagnostic endpoint. | **Не викликається з product analysis flow.** Ціни не зберігаються per-product — нема таблиці `product_pricing_snapshot` чи подібного. Немає UI що показує конкуренцію. |
| **KRS rejestr.io** | ⚠️ ЧАСТКОВО | `lib/integrations/krs-rejestr.ts:lookupKrsByNip` — Stage 3 у Deep Discovery верифікує NIP **discovered_entities** (lead gen). | **Не для самого продукту.** Продукт не має NIP, KRS for product не релевантний у direct sense. Релевантний — KRS для discovered entities (вже працює). Gap: коли потім Phase 2 буде "які клієнти з нашої бази підходять" — їхні KRS дані вже у `clients` (S2A). |
| **Tavily extract / web-search** | ❌ НІ | Tavily key + client є (`lib/enrichment/web-search.ts`), використовується тільки у CLIENT lookup (`/api/intelligence/lookup` Phase B + `lib/ai/business-analysis.ts`). | **Жодного product-context Tavily call.** Brand mentions, reviews, market signals для товару — повністю відсутні. Найбільш low-hanging fruit для S6B. |
| **Google Places** | ❌ N/A | Не використовується для продуктів. Apify GMaps actor — тільки для entity verification. | **Не релевантно** для product analysis. Залишається N/A. |
| **OpenFoodFacts** | ✅ TAK | `lib/openfoodfacts.ts` + `app/api/products/[id]/enrich/route.ts` Stage 2 | Працює, але **результати не surface-ються юзеру.** OFF payload sits у `product_external.off_payload`, mapped attrs у `product_attributes`. Юзер не бачить "OFF showed: nutriscore=B, ingredients={...}" panel. |
| **Internal DB matching (algo, L5)** | ✅ TAK | `lib/matching/engine.ts:computeMatchesForProduct` + `aggregateMatch` + 8 sub-scorers | Працює, окремий тригер. Не агрегований під 1 button. |
| **AI re-score (L6) — final pass** | ✅ TAK | `lib/matching/ai-rescore.ts` — top-20 matches WHERE product_id=? → Claude Haiku JSON output → UPDATE matches.ai_score | Працює, але запускається **окремою кнопкою "L6 AI bulk"** на /matches. **Не serially запускається після Phase 1 sources.** Для Protocol 13 треба orchestrator який чекає завершення Phase 1 → потім викликає AI re-score. |
| **AI sales strategy (L7)** | ⚠️ ЧАСТКОВО | `lib/matching/sales-snippet.ts` (cold opener generation для cohort handoff). `lib/ai/business-analysis.ts` — CLIENT-only. | Для product не існує "що робити з цими top-20 matches" AI summary. Gap: product-level sales strategy snippet (можливо overkill для S6B v1). |
| **Ceneo / price comparison** | ❌ НІ | Жоден файл не згадує Ceneo. | **Open question** для S6B Discovery: чи потрібен Ceneo. Якщо так — новий integration. |
| **Single button orchestrator** | ❌ НІ | Не існує. | **Це серце Protocol 13.** Треба новий endpoint (наприклад `POST /api/products/[id]/full-analysis`) що оркеструє Phase 1 (паралельні fetchers) → Phase 2 (AI re-score + summary) і повертає progress. |
| **2-stage progress UI** | ❌ НІ | Lookup form має phase_b_pending badges (S5D), але це для clients. | Треба адаптувати pattern на product profile. |
| **Persistent product analytics tables** | ❌ НІ | Тільки `intelligence_runs` (history) + `discovered_entities` (Phase 2 entities) + `product_attributes` + `product_external` | Gap: `product_pricing_snapshot`, `product_competitor_listings`, `product_market_signals` — нічого з цього не існує. |

---

## 5. РЕКОМЕНДОВАНИЙ SPRINT S6B SCOPE

> **Принципова позиція:** S6B не повинен будувати "усе одразу". Спочатку Discovery session з Vadymом (як вже зазначено у `sztab-state.md` блок "DISCOVERY #3 NEEDED") — щоб закрити business questions перш ніж писати код. Audit нижче — це інженерний readiness draft, не остаточний scope.

### 5.1 BUILD (нове, що однозначно треба)

1. **`/produkty/[id]` server-rendered detail page.** Без неї немає де ставити primary CTA "Аналіз товару". Зараз profile тільки в drawer на `/produkty` або в legacy `/products/[id]/edit`. Це precondition.
2. **`POST /api/products/[id]/full-analysis` orchestrator endpoint.** Аналогічно до `lookup/route.ts` Phase A/B split:
   - Phase A (sync ≤30s, returns response): запускає в parallel Promise.allSettled-ом — OFF lookup (через існуючий enrich logic), L5 algo recompute (`computeMatchesForProduct`), Allegro scraper top-N listings (нове).
   - Phase B (Next.js after(), ≤120s): Tavily web search для brand mentions, AI re-score top-20 (`runAiRescore` from `lib/matching/ai-rescore.ts`), AI product analysis summary (нова функція `lib/ai/product-analysis.ts`).
   - Response: `phase_b_pending: ['tavily', 'ai_rescore', 'ai_summary']` як у S5D pattern.
3. **Action bar primary button "Аналіз товару"** на `/produkty/[id]` (золотий accent як для "Аналіз клієнта" S6A). One click → POST orchestrator → toast progress → 2-stage progress bar.
4. **Tavily integration для продукту** — нова функція `searchProductMentions(productName, brand, ean)` у `lib/enrichment/web-search.ts` (extension), upsert results до нової таблиці `product_market_signals`.
5. **Allegro scraper hook у orchestrator** — wrap `lib/allegro/scraper.ts:searchOffers` під product context (top-N offers за nazwą + EAN), upsert до нової `product_competitor_listings` (price_min, price_median, listings_count, scraped_at).
6. **Migration 046:** нові таблиці `product_market_signals` (SKU 1:N tavily snippets) + `product_competitor_listings` (SKU 1:N Allegro listings + computed pricing stats), обидві з 7-day staleness pattern як `matches.expires_at`.
7. **Product analysis AI summary** — нова `lib/ai/product-analysis.ts:generateProductSummary` що бере на вхід product + OFF attrs + competitor listings + market signals + top-20 AI-rescored matches → Claude Haiku JSON: `demand_signal`, `pricing_opportunity`, `best_fit_segments`, `competitive_position`. Записує до `intelligence_runs` (run_type='product_analysis' — додати до enum CHECK у migration 046).

### 5.2 REFACTOR (привести існуюче до Protocol 13 shape)

8. **Винести trigger Deep Discovery з FastLookupCard на `/products/[id]/edit`** і прив'язати до нової action bar на `/produkty/[id]`. Існуючий 4-stage Deep Discovery pipeline залишити **як окремий "режим" lead-gen exploration**, не зливати з "Аналіз товару" v1 — це різні business questions (lead gen vs product analytics). Але обидва мають жити на новій product profile сторінці.
9. **`product_attributes.source` enum vs runtime mismatch** — migration 046 має extend CHECK constraint `IN ('family_default', 'off', 'ai', 'gemini', 'manual', 'override')` (додати `'ai'` бо `enrich/route.ts` пише його). АБО назад `'ai' → 'gemini'` у route. Перевірити на live що зараз пише — підозра що CHECK мовчки accept-ує бо `'ai'` спершу пройшов лише після пізнішої migration. Дослідити перш ніж писати 046.
10. **Standardize phase_b_pending pattern** — спільний helper `lib/orchestrator/phase-b-status.ts` (новий), і `/api/intelligence/lookup` (S5D) і `/api/products/[id]/full-analysis` (S6B) використовують його. DRY.

### 5.3 LEAVE AS IS (нічого не чіпати)

11. **`lib/matching/engine.ts`** і **`lib/matching/scoring/*`** — стабільні, working, тестовані Sprint S2A. Не торкатися.
12. **`/api/products/[id]/enrich`** — працює, тримає OFF + AI fallback. Orchestrator має його викликати internally, а не дублювати.
13. **`lib/openfoodfacts.ts`** — стабільний.
14. **Migrations 023-045** — historical, не міняти.
15. **`/intelligence/deep-discovery/[product_id]` page** — read-only view, працює. Можна refactor посилання breadcrumb пізніше.

### 5.4 OPEN QUESTIONS (для Discovery session з Vadymом — НЕ scope для написання коду в S6B)

- Чи Ceneo додаємо до Phase 1 sources? Якщо так — окремий Apify actor research + integration cost.
- Allegro pricing для FREE tier hard-cap 10 results — чи цього достатньо для product analytics, чи треба paid plan?
- Які саме AI output fields релевантні для Vadym sales workflow? `demand_signal` як шкала 1-10? Текстове summary? Bullet recommendations?
- Чи "Аналіз товару" має одразу update все, чи лише per-product on-demand? (Cost: Tavily ~$0.005/call × 35 SKU = $0.18, Allegro ~$0.038/call × 35 = $1.33 — acceptable для weekly refresh.)
- Чи treba окрема таблиця `product_analysis_summary` або достатньо `intelligence_runs.parsed_results`?
- LinkedIn DM (Sprint S7) — напевно не для S6B.

### 5.5 Ship criteria для S6B (proposed)

- /produkty/[id] page існує + primary "Аналіз товару" button видно
- POST /api/products/[id]/full-analysis повертає Phase A response < 30s з sources_completed list + phase_b_pending list
- Allegro scraper hooked + records у product_competitor_listings для тестового SKU
- Tavily search hooked + records у product_market_signals для тестового SKU
- AI summary видимий на /produkty/[id] після refresh
- Browser MCP verification: 1 SKU full pipeline test → screen + Vadym OK

### 5.6 Орієнтовний effort

Без Discovery session — 4-6 годин роботи Claude Code (1 нова page, 1 orchestrator, 1 migration, 2 нові integrations, 1 AI summary, refactor existing trigger). З Discovery — додати 30-45 хв на pre-S6B session.

### 5.7 Залежності

- Sprint S5D shipped ✅
- Sprint S6A shipped (бажано перш ніж S6B щоб переvикористати orchestrator pattern)
- Vadym Discovery session (open questions section 5.4)

---

## 6. FOLLOW-UP TASK (поза S6B scope)

**Project-level CLAUDE.md відсутній у корені репо.** Існують тільки global instructions у `C:\Users\vadym\AppData\Roaming\Claude\local-agent-mode-sessions\...\.claude\CLAUDE.md`. 

**Рекомендація:** створити `C:\Users\vadym\Projects\sztab\CLAUDE.md` з:
- посиланнями на `docs/sztab-state.md`, `docs/sztab-protocols.md`, `docs/sztab-sprints.md`,
- посиланням на `docs/audit-s6b-product-analysis.md` (цей файл),
- short summary стеку + протоколів,

щоб **будь-який Claude instance** (Cowork / Code / chat з repo context / новий сесія Claude Code) мав anchor до канонічних docs одразу, не покладаючись на global AppData (який існує тільки на цій машині Vadymа).

Це окремий follow-up task, **НЕ частина S6B scope.**

---

## 7. AUDIT TRAIL

- Read: `docs/sztab-state.md` (611 рядків) — поточний state продукту, включно з DISCOVERY #3 спеком який триггерив цей аудит
- Read: `docs/sztab-protocols.md` (380 рядків) — 13 протоколів (Protocol 13 — основа цього аудиту)
- Read: `docs/sztab-sprints.md` (338 рядків) — sprint history + S6 backlog (sztab-architecture.md не існує — заміна docs/sztab-sprints.md)
- Read: `app/api/products/[id]/enrich/route.ts` (283 рядки)
- Read: `app/(dashboard)/intelligence/deep-discovery/[product_id]/page.tsx` (78 рядків)
- Read: `lib/matching/engine.ts` (529 рядків)
- Read: `scripts/023_taxonomy_core.sql` (254 рядки)
- Browse: `app/api/products/`, `app/(dashboard)/intelligence/`, `app/(dashboard)/produkty/`, `app/(dashboard)/products/`, `lib/matching/`, `lib/ai/`, `lib/enrichment/`, `lib/allegro/`, `scripts/`
- Grep: TODO/FIXME/MOCK/PLACEHOLDER markers in 9 ключових files — **0 markers знайдено**
- Git log: останній commit per file для всіх 4 deep-read targets + 5 supporting files
- Файли НЕ модифіковано (read-only audit)

**END OF AUDIT.**
