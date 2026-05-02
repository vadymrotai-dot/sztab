# Audit — Sprint S-INTEL.1.2 (Pre-implementation)

**Дата:** 2026-05-02
**Тип:** READ-ONLY pre-implementation audit
**Sprint:** S-INTEL.1.2 — Market intelligence data pipeline (ZSRIR + fresh-market.pl + EU Agri-food + Sunday cron)
**Anchor docs:** sztab-product-intelligence-spec.md (S-INTEL.2 + S-INTEL.3 у оригінальному плані), sztab-state.md (S-INTEL.1.1.5 backfill ship), Protocol 13/14/15
**Locked decisions (Vadym 02.05.2026):** Q1 split на 1.1/1.1.5/1.2/1.3, Q2 budget $20-100/month, Q3 hybrid cadence (weekly cron + on-demand), Q4 food-first з ready-for-extension
**Precondition:** S-INTEL.1.1 + 1.1.5 shipped — products.cn_code populated на 35 SKU (review pending), knowledge_base table створена (порожня)

---

## 1. Executive Summary

- **Spec оригінально розділяв на S-INTEL.2 (ZSRIR + EU Agri-food) + S-INTEL.3 (fresh-market.pl)** = 11-15h. Поточний prompt комбінує у "S-INTEL.1.2" → recommend **3-way split** (1.2.1 / 1.2.2 / 1.2.3) для безпечної доставки.
- **ZSRIR доступний.** Free, public, через `api.dane.gov.pl/1.4/datasets/{id}/resources/...`. Datasets per category (zboża=546, chmiel=619, etc.). **CAVEAT:** дані доставляються як `.xlsx` файли — потрібен парсер (sheetjs). НЕ pure JSON API.
- **fresh-market.pl — НЕ має API.** Тільки HTML scraping. 16 markets з URL pattern `/cenyowocowwarzyw/z-rynkow-hurtowych/{slug}`. Recommend: custom fetch + cheerio (vs Apify actor) — мінімізує cost, повний контроль.
- **EU Agri-food — найкраще зroblene.** REST API + CSV/Excel download через `agridata.ec.europa.eu/extensions/API_Documentation/milk.html` (та інші observatories). Open data, no auth, weekly cadence.
- **Існуюча Vercel Cron infra** — 3 jobs activeні (hygiene-scan, matching-refresh Sunday, bzp-monitor). Pattern для S-INTEL.1.2 = `app/api/cron/market-intelligence/route.ts` з `CRON_SECRET` Bearer auth + `cron_runs` telemetry (existing helper `lib/cron-runs.ts`).
- **Ризик:** broad CN-code-to-data-source mapping не trivial. Один SKU кiszonki kapusty (CN 20055100) — який ZSRIR dataset? ZSRIR groups: warzywa polowe, owoce, мясо, mleko, zboża. Kiszonki — derivative product, не raw commodity. Може потребувати "best-effort match" через category fallback. **Це open question для STEP 0 наступного sprint'у.**

---

## 2. Existing infrastructure findings

### Vercel Cron (already configured у `vercel.json`)

```json
{
  "crons": [
    {"path": "/api/cron/hygiene-scan", "schedule": "0 1 * * *"},     // daily 01:00 UTC
    {"path": "/api/cron/matching-refresh", "schedule": "0 0 * * 0"}, // Sunday 00:00 UTC
    {"path": "/api/cron/bzp-monitor", "schedule": "0 3 * * *"}       // daily 03:00 UTC
  ]
}
```

3 active cron handlers у `app/api/cron/{hygiene-scan, matching-refresh, bzp-monitor}/route.ts`. Pattern reference — `matching-refresh/route.ts`:
- `export const runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 300`
- `CRON_SECRET` Bearer auth check (skip якщо unset для local dev)
- `lib/cron-runs.ts` telemetry: `startCronRun(supabase, jobName)` → work → `finishCronRun(runId, status, options)` (logs до `cron_runs` table)

### Apify integration (existing)

`lib/integrations/apify.ts` — generic `runApifyActor(token, spec)` wrapper з `run-sync-get-dataset-items` API. Used для Aleo + Panorama Firm. Pattern доступний для fresh-market.pl actor якщо вирішимо via Apify route.

**Recommendation:** для fresh-market.pl — **direct fetch + cheerio** замість Apify (custom actor cost не виправданий для 16 simple HTML pages з price tables; cheerio dependency lightweight; full control over parsing).

### Existing scheduled scripts (NOT cron, manual run)

`scripts/manual-trigger-crons.ts`, `scripts/sprint-n-*.ts` — adhoc batch scripts pattern. НЕ relevant для recurring jobs, але корисні для **initial seed** + manual re-run якщо cron failed.

### Library structure

- `lib/integrations/` (apify, krs-rejestr) — external API clients
- `lib/external/` — НЕ існує
- `lib/cron-runs.ts` — telemetry helper
- `lib/ai/` — AI clients (business-analysis, cn-code-suggester, sku-attributes)

**Recommended new namespace:** `lib/intelligence/` — для market data clients (zsrir, fresh-market, eu-agri). НЕ `lib/integrations/` бо ці не "integrations" з reactive APIs (це data fetchers).

### Schema dependencies

Migration 048 встановила `cn_code TEXT` на products. S-INTEL.1.2 використовує цей column як bridge. Без 048 applied — pipeline блокується.

---

## 3. ZSRIR API analysis

### URL pattern

```
https://api.dane.gov.pl/1.4/datasets/{dataset_id}/resources
https://api.dane.gov.pl/1.4/datasets/{dataset_id}/resources/{resource_id}/file
https://api.dane.gov.pl/1.4/datasets/{dataset_id}/resources/metadata.csv?lang=pl
```

### Authentication
**None.** Public open data. No API key, no registration.

### Rate limits
Не documented explicitly. Спостережувано: standard Cloudflare-protected throttling (~100 req/min є safe). Для weekly cron — completely irrelevant.

### Response format
**Не pure JSON.** Datasets публікуються як `.xlsx` / `.xls` files (Excel bulletyny). Resources mеtadata через JSON, але data — Excel.

**Implication:** потрібен XLSX parser. **xlsx (SheetJS)** — popular, MIT license, npm pkg. Або **exceljs**. Recommend SheetJS — lighter weight для read-only.

### Datasets relevant для Sztab (з search results)

| Dataset ID | Topic |
|---|---|
| 546 | rynek zbóż (grain) |
| 619 | rynek chmielu (hops) |
| 830 | (uncertain — потребує live verification на dane.gov.pl) |
| 4324 | (uncertain) |

**Action для S-INTEL.1.2.1 STEP 0:** Vadym або Claude переглянути на https://dane.gov.pl/pl/dataset → search "ZSRIR" → list of all datasets. Ймовірні categories: zboża, mleko, drób, wieprzowina, wołowina, owoce-warzywa, jaja, ryby, miód.

### Update cadence
**Weekly bulletyny.** Confirmed via search.

### Mapping до CN codes — **OPEN QUESTION**

ZSRIR data structured per Polish agricultural categories (PL: "zboża", "owoce-warzywa"), не per CN code. Kiszonki kapusty (CN 20055100) НЕ має direct ZSRIR analogue — closest = raw kapusta white head (own ZSRIR row у warzywa polowe).

**Strategies:**
- **A — direct CN match.** Тільки primary ingredients. Miss derivatives.
- **B — category fallback.** product.category 'kiszonki_kapusty' → ZSRIR "kapusta biała" → bridge таблиця.
- **C — AI-assisted.** При ingestion ZSRIR row, AI proposes "цей price relevant до яких CN codes у нашому каталозі?".

**Recommendation:** Phase 1 = B (category fallback з manually curated mapping для 35 SKU). Phase 2 (S-INTEL.2+) = C після collected data.

### Cost
**$0** (public free). +1.5h dev для xlsx parser + dataset ID discovery + initial mapping.

---

## 4. fresh-market.pl analysis

### Site structure

URL pattern: `https://www.fresh-market.pl/cenyowocowwarzyw/z-rynkow-hurtowych/{slug}`

Confirmed slugs (з search results):
- `bronisze` — Warszawski Rolno-Spożywczy Rynek Hurtowy SA
- `poznan` — WGRO
- `lublin` — Elizówka (LRH)
- `khrybitwykrakow` — Kraków Rybitwy
- `zjazdowa` — Łódź
- `praska-gielda-spozywcza` — Praska Giełda Warszawa
- `innegieldy` — інші ринки

**Інші 9-10 markets** (per spec — 16 total): потребують live exploration на самому site. Може бути index page `https://www.fresh-market.pl/cenyowocowwarzyw/z-rynkow-hurtowych` з links.

### API
**ВІДСУТНІЙ.** Тільки HTML pages.

### Scraping approach

**Recommendation: custom direct fetch + cheerio.**
- Pros: 0 third-party cost, повний control, дзвонити cron daily не проблема
- Cons: треба підтримувати селектори якщо site refactor

Vs Apify:
- Pros Apify: managed, auto-update якщо selectors change
- Cons Apify: $0.05-0.20/run × 16 markets × 7 days/week × 4 weeks = $50-100+/month — це fits budget tier ($20-100/month per Q2), але "wasteful" коли можна 0$

**Verdict для S-INTEL.1.2.2:** custom fetch. Shedule daily для top 5 markets per spec section S-INTEL.3 (Bronisze + WGRO + Lublin + Kraków + Wrocław) → 5 fetches/day × 7 = 35/week.

### Cheerio dependency
`pnpm add cheerio` — already check у package.json existing? **Need verify у STEP 0 наступного sprint.** Може бути existing з allegro/scraper.ts.

### Data volume estimate

5 top markets × ~50-200 products per market per day × 30 days = 7,500-30,000 rows/month. Schema:
- `commodity_prices` table має витримати — proper indexes (cn_code, observation_date, market) + partition (postgres native чи logical) якщо grow → 100K+ rows.

### CN code mapping — same problem as ZSRIR

fresh-market.pl categories: "Warzywa świeże", "Owoce", "Зеленина" — НЕ CN codes. Recommend Phase 1 = curated bridge table `commodity_to_cn_map` з ~50-100 entries для top SKU.

### Cost
**$0** для custom fetch (тільки Vercel function time, ~5-10s per market). **$50-100/month** якщо Apify route. Recommend custom.

---

## 5. EU Agri-food data portal analysis

### URL structure

- **Main portal:** `https://agridata.ec.europa.eu/extensions/dataportal/agricultural_markets.html`
- **Milk dashboard:** `/extensions/DataPortal/milk.html`
- **Milk API doc:** `/extensions/API_Documentation/milk.html`
- **Prices section:** `/extensions/DataPortal/prices.html`
- **API доступ:** `/extensions/API_Documentation/{commodity}.html` (per observatory)

### Available observatories (per spec section B6)
- Milk Market Observatory (weekly raw milk + dairy products)
- Meat Market Observatory
- Sugar / Olive oil / Wine / Crops / Fruit & Veg observatories

### Authentication
**Open data, no auth.**

### Format
- **REST API** для machine-to-machine (per portal docs)
- **CSV/Excel download** для offline processing
- Recommend: REST API де доступне, fallback CSV.

### Update cadence
**Weekly** для dairy. Confirmed.

### Mapping до CN codes — **EASIEST**

EU portal використовує **CN codes natively** (це EU framework, де CN — стандарт). Mapping тривіальний — Sztab products.cn_code → EU API query parameter.

### Polish relevance

EU data робить sense для multi-country comparison ("як Polski producent wyceniają vs EU avg"). Weekly milk avg для всіх MS — useful benchmark коли buying decisions made.

### Cost
**$0**. +1.5h dev для wrapper + CSV/REST adapter.

---

## 6. Recommended schema (commodity_prices + market_signals)

### Migration 051 — `commodity_prices`

```sql
-- Sprint S-INTEL.1.2 — wholesale + commodity prices з external sources.
-- Bridge до products через cn_code. category column food-first
-- ready-for-extension (per Decision Framework 02.05.2026).

CREATE TABLE IF NOT EXISTS commodity_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cn_code TEXT,                            -- bridge до products.cn_code
                                           -- NULL якщо source row не mapped
  source TEXT NOT NULL CHECK (
    source IN ('zsrir', 'fresh_market_pl', 'eu_agri', 'manual')
  ),
  market TEXT,                             -- 'Bronisze', 'WGRO Poznań',
                                           -- 'EU avg', 'PL national', NULL
  product_label TEXT NOT NULL,             -- raw label з source
                                           -- (e.g. 'Kapusta biała głowiasta')
  price_pln NUMERIC(10,2),                 -- nullable якщо source у EUR only
  price_eur NUMERIC(10,2),                 -- nullable якщо source у PLN only
  currency_native TEXT NOT NULL,           -- 'PLN', 'EUR' — primary currency
                                           -- з якої перерахунок робився
  unit TEXT NOT NULL,                      -- 'kg', 'ton', '100kg', 'liter',
                                           -- 'piece' — нормалізовано
  observation_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'food',   -- food / cosmetics / electronics
                                           -- (ready-for-extension)
  raw_payload JSONB,                       -- original source row для debug
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commodity_prices_cn_code_idx
  ON commodity_prices(cn_code) WHERE cn_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS commodity_prices_observation_date_idx
  ON commodity_prices(observation_date DESC);
CREATE INDEX IF NOT EXISTS commodity_prices_source_market_idx
  ON commodity_prices(source, market, observation_date DESC);
CREATE INDEX IF NOT EXISTS commodity_prices_category_idx
  ON commodity_prices(category);

-- Idempotency: same source × same product × same date = 1 row
CREATE UNIQUE INDEX IF NOT EXISTS commodity_prices_uniq_observation
  ON commodity_prices(source, COALESCE(market, ''), product_label, observation_date);

ALTER TABLE commodity_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "commodity_prices_authenticated_read" ON commodity_prices
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role write (cron jobs run з service role key)
DO $$ BEGIN
  CREATE POLICY "commodity_prices_service_write" ON commodity_prices
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE commodity_prices IS
  'External wholesale + commodity prices (ZSRIR / fresh-market.pl / EU Agri-food). Bridge до products через cn_code. Populated via Sunday cron + on-demand. Source row NULL cn_code дозволяє "intake first, map later" — knowledge_base seed (S-INTEL.1.3) допоможе AI map post-hoc.';
COMMENT ON COLUMN commodity_prices.cn_code IS
  'NULLABLE bridge до products.cn_code. NULL коли source row category не direct match (e.g. ZSRIR "kapusta biała" → потрібен mapping table до 20059990).';
COMMENT ON COLUMN commodity_prices.source IS
  'zsrir = dane.gov.pl ZSRIR datasets, fresh_market_pl = scraped wholesale markets, eu_agri = agridata.ec.europa.eu observatories, manual = Vadym manual entry.';
```

### Migration 052 — `market_signals`

```sql
-- Sprint S-INTEL.1.2 — derived signals з commodity_prices.
-- Generated weekly через Sunday cron AFTER price ingestion (separate step).

CREATE TABLE IF NOT EXISTS market_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cn_code TEXT,                            -- nullable
  signal_type TEXT NOT NULL CHECK (
    signal_type IN ('price_trend', 'volatility', 'seasonality', 'shortage', 'spread')
  ),
  direction TEXT CHECK (
    direction IS NULL OR direction IN ('up', 'down', 'stable')
  ),
  magnitude NUMERIC(8,4),                  -- e.g. 0.15 = 15% change
  period_days INT NOT NULL,                -- 7 / 30 / 90
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation_period_end DATE NOT NULL,    -- last day у calculation window
  description_pl TEXT,                     -- human-readable
                                           -- "Cena kapusty +15% w 30d"
  confidence NUMERIC(3,2)                  -- 0..1
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source_count INT,                        -- скільки rows commodity_prices
                                           -- агрегувалося
  category TEXT NOT NULL DEFAULT 'food',
  raw_data JSONB                           -- input window summary
);

CREATE INDEX IF NOT EXISTS market_signals_cn_code_idx
  ON market_signals(cn_code) WHERE cn_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS market_signals_detected_at_idx
  ON market_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS market_signals_signal_type_idx
  ON market_signals(signal_type);

ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "market_signals_authenticated_read" ON market_signals
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "market_signals_service_write" ON market_signals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE market_signals IS
  'Derived signals з commodity_prices — price trends, volatility, seasonality, shortages, spreads. Generated weekly cron job AFTER ingestion. Used by AI re-score (Protocol 15 Layer 2) для market context.';
COMMENT ON COLUMN market_signals.signal_type IS
  'price_trend = directional move; volatility = stddev/mean ratio; seasonality = recurring pattern; shortage = unusually low supply; spread = wholesale vs retail gap.';
COMMENT ON COLUMN market_signals.confidence IS
  '0..1 — алгоритмічний confidence (sample size, fit quality). Вище = більше доверяти.';
```

### Optional: `commodity_to_cn_map` mapping table (Phase 1 curated)

```sql
-- Sprint S-INTEL.1.2 — manually curated bridge між source category strings
-- та CN codes. Заміняє AI inference у Phase 1 (швидше, безкоштовно).

CREATE TABLE IF NOT EXISTS commodity_to_cn_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (
    source IN ('zsrir', 'fresh_market_pl', 'eu_agri')
  ),
  source_label TEXT NOT NULL,              -- exact match string з source
  cn_code TEXT NOT NULL CHECK (cn_code ~ '^[0-9]{8}$'),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_label)
);

CREATE INDEX IF NOT EXISTS commodity_to_cn_map_source_idx
  ON commodity_to_cn_map(source, source_label);
CREATE INDEX IF NOT EXISTS commodity_to_cn_map_cn_code_idx
  ON commodity_to_cn_map(cn_code);
```

Seed manually (Vadym) для top 20 commodities у Phase 1. Defer до Phase 2 — AI auto-map нові labels.

---

## 7. Cron architecture

### Endpoint design

`app/api/cron/market-intelligence/route.ts`:

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 min — fits всі 3 sources sequential

export async function GET(req: Request) {
  // 1. CRON_SECRET Bearer auth (mirror matching-refresh pattern)
  // 2. startCronRun(supabase, 'market-intelligence')
  // 3. Sequential:
  //    a. Fetch ZSRIR (xlsx → parsed rows → INSERT commodity_prices ON CONFLICT DO NOTHING)
  //    b. Fetch fresh-market.pl top 5 markets (cheerio parse)
  //    c. Fetch EU Agri-food (REST/CSV)
  // 4. After all sources success → generate market_signals (separate step)
  // 5. finishCronRun з summary
}
```

### Schedule

`vercel.json` add:
```json
{"path": "/api/cron/market-intelligence", "schedule": "0 6 * * 0"}
```
Sunday 06:00 UTC = 07:00 Warsaw winter / 08:00 summer. Після `matching-refresh` (00:00 UTC) — щоб freshly ingested data була доступна для weekly Algorithm tuning якщо потрібно (Protocol 15 Layer 2).

### Concurrency / time budget

**maxDuration = 300s** (Vercel Pro tier limit). Estimated:
- ZSRIR fetch: ~30s (3-5 datasets × xlsx download + parse + insert)
- fresh-market.pl: ~60s (5 markets × ~10s parse)
- EU Agri-food: ~30s (3-4 observatories REST)
- Signals generation: ~30s (SQL aggregations + AI calls якщо Layer 2 enabled)
- **Total: ~2.5 min — well under 300s**

### Manual trigger

Add CLI script `scripts/manual-trigger-market-intelligence.ts` (mirror `manual-trigger-crons.ts` pattern) для adhoc Vadym run без чекати Sunday.

### Observability

Re-use `lib/cron-runs.ts` — `cron_runs` table вже tracks success/error/duration/meta для всіх cron handlers. Existing `/admin/health` page рендерить cron status (per state.md "Cron jobs status: matching-refresh, hygiene-scan").

**Add у /admin/health:** `market-intelligence` job — same UI structure.

---

## 8. Recommended scope + split decision

### Sumарний effort (single 1.2)

| Item | Effort |
|---|---|
| Migration 051 (commodity_prices) + 052 (market_signals) + optional commodity_to_cn_map | 1h |
| `lib/intelligence/zsrir.ts` (xlsx parse + dataset discovery) | 2h |
| `lib/intelligence/fresh-market.ts` (cheerio scraper, 5 markets) | 3h |
| `lib/intelligence/eu-agri.ts` (REST/CSV) | 2h |
| `app/api/cron/market-intelligence/route.ts` orchestrator | 1.5h |
| `lib/intelligence/signals.ts` (signal generators — price_trend, volatility, seasonality, shortage) | 2h |
| `scripts/manual-trigger-market-intelligence.ts` | 0.5h |
| `vercel.json` cron entry + `/admin/health` rendering update | 0.5h |
| Initial seed `commodity_to_cn_map` (manual з Vadym) | 0.5h |
| Static review + verification | 0.5h |
| **Total** | **13.5h** |

### Decision: **3-WAY SPLIT** recommended

13.5h > 10h threshold per prompt STEP 8 rule. Spec original теж splits на S-INTEL.2 + S-INTEL.3.

**Recommended split:**

#### S-INTEL.1.2.1 — ZSRIR + commodity_prices schema + cron skeleton (~4.5h)
- Migration 051 (commodity_prices) + 052 (market_signals) skeleton без data
- `lib/intelligence/zsrir.ts` — xlsx parser + 3-5 prioritized datasets (zboża + warzywa-owoce + nabiał)
- `app/api/cron/market-intelligence/route.ts` — skeleton з ZSRIR step тільки
- `vercel.json` cron entry "0 6 * * 0"
- `scripts/manual-trigger-market-intelligence.ts`
- Initial seed `commodity_to_cn_map` для top 10 ZSRIR labels → CN codes (Vadym + Claude)
- /admin/health render status

#### S-INTEL.1.2.2 — fresh-market.pl scraper (~4h)
- `lib/intelligence/fresh-market.ts` — cheerio scraper для top 5 markets
- Extend `commodity_to_cn_map` для fresh-market labels
- Wire cron handler з добавленням fresh-market step
- Verification — test scrape поки cron не запущено через Vercel

#### S-INTEL.1.2.3 — EU Agri-food + market_signals generation (~5h)
- `lib/intelligence/eu-agri.ts` — REST/CSV adapter для milk + meat + crops observatories
- `lib/intelligence/signals.ts` — algorithm для 4 signal types (price_trend SMA-based; volatility stddev; seasonality ACF-light; shortage relative-deviation)
- Wire cron handler з кінцевим signals generation step
- Static review + verification PASS

### Why split (vs single sprint)?

1. **Smaller blast radius per ship.** Якщо ZSRIR xlsx parse breaks — caught early, не блокує fresh-market і EU.
2. **Per-sprint live verification (Protocol 4)** — Vadym може Apply 051 + run cron + observe rows у DB перш ніж рухатись далі.
3. **Cron schedule already running** після 1.2.1 — kожен наступний sub-sprint просто додає step до existing endpoint.
4. **Spec original confirmed.** S-INTEL.2 + S-INTEL.3 splits мали той самий intent.

### BUILD / REFACTOR / LEAVE / DEFER (single 1.2 view, для context)

#### BUILD (нове, distributed по 1.2.1-1.2.3)
- 2 migrations (051, 052) + optional `commodity_to_cn_map`
- 4 lib files: zsrir.ts / fresh-market.ts / eu-agri.ts / signals.ts
- 1 cron endpoint orchestrator
- 1 manual trigger script
- vercel.json schedule entry
- `/admin/health` row для market-intelligence job

#### REFACTOR (existing — minimal)
- `vercel.json` (add 1 cron line)
- `app/(dashboard)/admin/health/page.tsx` (add 1 cron row у render — pattern existing для matching-refresh)

#### LEAVE AS IS
- All other cron handlers
- `lib/integrations/apify.ts` (Apify route не вибрано для fresh-market)
- `lib/cron-runs.ts` telemetry (re-used)
- products schema (cn_code already populated)

#### DEFER до S-INTEL.1.3
- knowledge_base seeding 10 foundation тем
- Eurocash/Makro/Selgros distribution channel scrapers
- pgvector + embedding column

#### DEFER до S-INTEL.2+ або post-MVP
- TARIC API validator для CN codes
- AI auto-mapping `commodity_to_cn_map` (Phase 2)
- Signal-to-product UI surfacing (S6B integrates this)
- Multi-currency normalization edge cases (FX rate cache)

---

## 9. Risks & Open Questions

### Technical risks

| Risk | Severity | Mitigation |
|---|---|---|
| ZSRIR xlsx files структура змінюється season-to-season | Medium | Parser обробляє per-dataset; row-level errors — log + continue. Add `raw_payload JSONB` дозволяє post-mortem без re-fetch. |
| fresh-market.pl HTML refactor breaks selectors | Medium | Custom fetch + cheerio means we own selectors. Daily cron — швидко viявиться regression. Fallback: alert у cron_runs `error_message`. Якщо стане проблемою → switch на Apify managed actor. |
| EU Agri-food REST API not as documented | Low | Spec docs comprehensive. Якщо REST не працює — CSV download fallback. |
| commodity_to_cn_map manual curation bottleneck | Medium | Phase 1 = top 20 labels (Vadym 30 хв). Phase 2 (S-INTEL.2+) — AI proposes new mappings. Не блокер для S-INTEL.1.2.1. |
| Vercel cron 300s timeout exceeded на large weeks | Low | Sequential design + per-source try/catch + per-step timeout. Якщо stale data одна week — наступна week recovers. |
| Duplicate ingestion при re-run cron | Negligible | UNIQUE INDEX `commodity_prices_uniq_observation` + ON CONFLICT DO NOTHING. Idempotent. |
| FX rate (PLN ↔ EUR) — який source, який lag? | Low | Read existing `params.kurs_eur_pln` (Sztab pricing settings вже там — products.ts use). Snapshot at ingestion time у `commodity_prices.price_pln` AND `price_eur` обидві populated через cross-multiply. |

### Open questions (для STEP 0 наступного sprint'у — НЕ блокери цього audit)

1. **ZSRIR dataset IDs.** Які саме dataset ID для нашого 35-SKU portfolio? Live exploration на dane.gov.pl потрібна.
2. **Cheerio vs Apify для fresh-market.** Recommendation = cheerio. Vadym confirms?
3. **commodity_to_cn_map seeding.** Vadym + Claude session 30 хв для top 20 labels manual?
4. **Signal generation algorithm depth.** Phase 1 = simple SMA / stddev (algorithmic, no AI). Phase 2 = AI re-score над raw signals. ОК?
5. **`/admin/health` render layout.** Просто додати row, чи варто перебудувати на job categories? Recommend: row only (consistency).
6. **`commodity_prices` retention policy.** 1 year? 5 years? Default unlimited — реальний обсяг 30K rows/month × 12 = 360K/year. Postgres handle no problem.
7. **EU Agri-food multi-MS — фільтрувати тільки Polska чи зберегти всі MS?** Recommend: всі (cross-country comparison корисна для Tier 5 industry intelligence).

### Out of scope для S-INTEL.1.2 (зафіксовано)

- knowledge_base seeding (S-INTEL.1.3)
- Distribution channels (Eurocash/Makro/Selgros) — defer до S-INTEL.4 у spec
- TARIC API validator
- AI signal generators (Phase 1 = algorithmic only)
- UI surfacing на /produkty/[id] (S6B)
- Real-time alerts на shortage events
- Multi-currency dynamic FX (snapshot from params sufficient)

---

## 10. Audit Trail

### Що перевірено
- `docs/sztab-state.md` last entry "S-INTEL.1.1.5 Backfill Script SHIP" (line 1258-1320)
- `docs/sztab-product-intelligence-spec.md` — 12 dimensions B1-B12, S-INTEL.1-5 priorities (line 173-198 explicit плани для S-INTEL.2 + S-INTEL.3)
- `docs/sztab-protocols.md` — Protocol 13/14/15
- `vercel.json` (cron entries, function maxDuration overrides) — 3 active cron jobs
- `app/api/cron/{hygiene-scan, matching-refresh, bzp-monitor}/route.ts` — pattern reference
- `lib/cron-runs.ts` — telemetry helper
- `lib/integrations/apify.ts` — generic Apify wrapper (existing інfra)
- WebSearch — ZSRIR (dane.gov.pl), fresh-market.pl markets list, EU Agri-food data portal API doc

### Що НЕ перевірено (gaps в audit)
- **Live ZSRIR datasets browsing** на dane.gov.pl/pl/dataset → search "ZSRIR". Потребує browser або WebFetch (deferred). Recommendation: STEP 0 наступного sprint Vadym + Claude session 15 хв.
- **fresh-market.pl всі 16 markets list.** Confirmed 6-7 з search results, ще 9-10 unknown slugs. Live exploration потрібна.
- **EU Agri-food API actual response shape.** Search показало docs URL але не sample response. STEP 0 наступного sprint test fetch для одного observatory.
- **Existing cheerio dependency** у package.json. STEP 0 grep `pnpm list cheerio`.
- **Cron Pro tier limits live confirmation.** Spec 40 cron jobs Pro tier — нам потрібен 4-й (з market-intelligence) — well under.

### Що цей audit НЕ робить
- НЕ модифікує жодного code файлу
- НЕ запускає pnpm dev/build/test
- НЕ робить git operations
- НЕ створює migration/script/seed файлів
- НЕ робить WebFetch для actual data fetch (тільки search для documentation references)
- НЕ робить decision за Vadym — тільки recommendations з trade-offs

### Готовність до Sprint S-INTEL.1.2.1 (first sub-sprint)

**Audit complete.** Перш ніж стартувати implementation наступного sub-sprint:
1. Vadym confirms: 3-way split (1.2.1 / 1.2.2 / 1.2.3) vs single 1.2?
2. Vadym confirms: 1.2.1 starts з ZSRIR (як рекомендовано) чи з EU Agri-food (легший)?
3. Vadym confirms: cheerio vs Apify для fresh-market.pl?
4. Vadym confirms: commodity_to_cn_map approach OK (curated bridge table Phase 1)?
5. Open question STEP 0 наступного sprint — live ZSRIR dataset IDs + cheerio dep verification.

---

**END OF AUDIT.**
