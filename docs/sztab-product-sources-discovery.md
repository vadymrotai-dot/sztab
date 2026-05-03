# Sztab Product Intelligence Sources — Discovery Document

**Дата створення:** 03.05.2026
**Останнє оновлення:** 03.05.2026 v3 — після Vadym matrix scoring re-think
**Автор:** Claude (Sonnet 4.7), strategic discovery session
**Запит від Vadym:** Глибокий ретельний аналіз джерел інформації про товари — як побудувати hybrid algo+AI систему для Product Intelligence в Sztab. Не лише під поточну категорію (kiszonki/surówki Czudowa Marka), а під повний food spectrum (raw / processed / semi-finished / ingredients) з можливістю розширення на майбутні товари.

**Vertical scope:** Food only (всі підкатегорії — сировина, готова продукція, напівфабрикати, інгредієнти, спеції, beverages, dairy, meat, seafood, frozen, dry, sweets, protein).
**Geography:** Polska only.
**Architectural principle:** Hybrid algo+AI на ВСІХ рівнях (Vadym принцип, locked у memory + sztab-protocols.md).
**Engine architecture:** Unified Intelligence Engine з 3 modes (existing / registry / combined) — locked Vadym 03.05.

---

## CHANGELOG

### v3 (03.05.2026 evening) — Matrix Scoring переосмислення

🔴 **ФУНДАМЕНТАЛЬНА ЗМІНА після Vadym re-think:**

- **Score прив'язаний до пари клієнт×товар, НЕ до клієнта окремо** — один клієнт має різні матчі для різних товарів
- **Логіка скорингу ЦЕНТРАЛІЗОВАНА у `product/scoring-rules.ts`** — це ядро Sztab, головний "продаючий" інструмент. Клієнтський профіль скоринг не виконує.
- **"Аналіз товару" — головний use case Sztab** — бере конкретний товар → скорить ВСІХ клієнтів у базі → ranked топ-100 → стратегія продажів за сегментами
- **"Аналіз клієнта" — БЕЗ єдиного скору** — показує профіль + матрицю матчів з усіма нашими товарами
- **Mode B додає ВСІХ кого знаходимо** — БЕЗ фільтру по скорингу. Вся база = універсальний asset (можливі майбутні товари можуть підійти існуючим клієнтам)
- **TAM/SAM/SOM аналіз** — це властивість товару, не клієнта. Реалізується через "Аналіз ринку" Sprint S-CORE.4
- Додано Section 11 — Matrix Scoring Model (детальна архітектура)
- Додано Protocol 22 — Matrix Scoring Model

### v2 (03.05.2026)

Зміни після Vadym feedback session:
- **NEW: PIL-2d Outreach Pricing** — email/телефон до гуртовень з запитом oferty. Vadym pointed out що це фундаментальний шар який ми проґавили.
- **CORRECTED: Pricing details** — Apify, Tavily, Anthropic — точні цифри з квітня 2026 verified.
- **CORRECTED: Budget realistic** — $5-20/міс start (Free tiers + Anthropic pay-per-token), $120-210/міс scale. Раніше було неправильно ($80-200 start).
- **NEW: Unified Engine architecture** — Sprint S6A/S6B SCRAPPED. Заміна — S-CORE.1-5 з shared core + entity profiles.
- **NEW: 3 engine modes** — existing / registry / combined. Engine handles обидва discovery і enrichment.
- **NEW: Allegro як hybrid pricing tier** — між роздрібом і гуртом. Vadym pointed: ціна на Allegro дешевша за роздріб але не гуртова. Plus: Allegro sellers самі часто hurtownie → можемо запитати oferty.

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Architectural Framework — Як використовуємо джерела](#2-architectural-framework)
3. [Use-Case Layers — 5 шарів Product Intelligence](#3-use-case-layers)
4. [Source Catalog — Повний матрикс з detail](#4-source-catalog)
5. [Source × Use-Case Matrix](#5-source-use-case-matrix)
6. [Hybrid Algo+AI Integration Plan — як кожне джерело wires в L4-L7](#6-hybrid-integration-plan)
7. [Budget Analysis — за/проти premium tiers (точні цифри)](#7-budget-analysis)
8. [Phased Roadmap (S-CORE.1-5 architecture)](#8-phased-roadmap)
9. [Anti-patterns & Common Mistakes](#9-anti-patterns)
10. [Decision Log — що з пам'яті, що нове](#10-decision-log)

---

## 1. EXECUTIVE SUMMARY

### Що таке Product Intelligence в контексті Sztab

**НЕ "тест товару"** (це робить виробник перед launch або retailer перед listing).
**А lead generation з product context** — для будь-якого товару Sztab знаходить:
- Хто це може купити (B2B buyers)
- За яку ціну (pricing intelligence — retail, wholesale, raw, hybrid Allegro)
- Через які канали (distribution)
- З яким positioning (competitive context)
- Які тренди підкріплюють (demand signals)

Це **унікальна перевага Sztab** vs CRMs з generic enrichment. Buyer Fit Vector не має жоден конкурент.

### Ключові знахідки цього discovery

**До цього discovery я (Claude) пропустив 5 категорій джерел які закривають критичні gaps:**

1. **Gazetki aggregators (Blix, Gazetkonosz, Mojagazetka, Dlahandlu)** — це **goldmine** для retail price monitoring готових продуктів у мережах. Закриває "де подивитись скільки коштує kiszonki в Biedronka/Lidl/Auchan" — питання яке Vadym ставив про processed food.

2. **Tavily для product search** — Vadym правильно це підняв. Tavily вже wired у клієнтів, але НЕ wired у products. Це elementary Google search alternative який ми проґавили у плані.

3. **Apify Ceneo scraper** — `studio-amba/ceneo-scraper` + `trev0n/ceneo-product-review-scraper`. Ceneo = 30M monthly visitors, дефолтна порівнялка цін у Польщі. Покриває electronics + food + beauty + automotive — універсальний для multi-vertical roadmap.

4. **HoReCa wholesale catalog scraping (Selgros + Makro + Eurocash + Bidfood)** — окремий шар джерел для **B2B prices** (не retail). Vadym має JDG access до Selgros + Makro як firmę — можемо log in scrape. Це їх real wholesale pricing list. **CAVEAT:** Vadym уточнив що Selgros/Makro **не показують гуртові ціни на сайтах** — їх потрібно запитувати індивідуально через email + телефонний follow-up.

5. **🆕 PIL-2d: Outreach to wholesalers** — Vadym pointed out що половина гуртовень вишле oferty по email automatically, друга половина — після телефонного follow-up. Це **легальний legitimate** шлях отримати real wholesale prices. Це не просто доповнення — це **окремий шар pricing intelligence** який ми не могли отримати інакше.

### Запропонована архітектура — 5 layers Product Intelligence

| Layer | Що дає | Sources | Cost |
|---|---|---|---|
| **PIL-1: Identity & Attributes** | EAN, склад, allergeny, certyfikaty, photos | Open Food Facts, Haiku AI extract, dane.gov.pl GIS, GS1 (future) | $0.02/SKU |
| **PIL-2a: Retail Pricing** | retail prices у sieciach + Allegro hybrid | Allegro (Apify+API), Ceneo, gazetki aggregators | $0-50/міс |
| **PIL-2b: Wholesale Pricing (catalog)** | scraping Selgros/Makro з JDG | Selgros JDG, Makro JDG, Eurocash | $0 (scraping) |
| **PIL-2c: Raw Commodity** | сировинні ціни weekly | ZSRIR, fresh-market, EU Agri-food | $0 |
| **🆕 PIL-2d: Outreach Pricing** | email + телефон до гуртовень → oferty | direct outreach з AI-generated emails | $0 |
| **PIL-3: Demand Signals** | search trends, social listening, listings count | Google Trends, Tavily web/news, Apify Allegro listings | $0-30/міс |
| **PIL-4: Distribution Mapping** | хто де продає, retail chains, marketplaces, B2B catalogs | Apify e-commerce scrapers, gazetki aggregators, Tavily extract | $20-50/міс |
| **PIL-5: Brand & Industry Context** | competitor brands, reviews, industry reports, trends | Ceneo reviews, Tavily news, Wiadomościhandlowe, Pyszne.pl | $0-25/міс |

**Total realistic monthly cost при moderate use:** $5-20/міс (Free tiers + Anthropic pay-per-token). При активному scale: $120-210/міс.

### Top 4 рекомендації після Vadym feedback

1. **Wire Tavily для products IMMEDIATELY** — Free tier 1000 credits/міс достатньо. Effort: 2-3 години. Закриває elementary Google search gap.

2. **Apify Ceneo + Allegro scrapers для food category** — закриває gap що Vadym підняв. Apify Free tier $5 credits/міс → достатньо для test runs. Effort: 4-6 годин.

3. **🆕 Outreach Pricing module (PIL-2d)** — кнопка "Wygeneruj prośbę o ofertę" на /produkty/[id] → AI Haiku генерує personalized email до hurtowni → review + send. Effort: 4-5 годин. **HIGHEST ROI** бо створює власну proprietary базу wholesale цен.

4. **Gazetki aggregator scraping (Blix.pl)** — це УНІКАЛЬНА Polish data shell яку конкуренти не використовують. Effort: 6-8 годин.

### Що відкладаємо

- **Premium APIs** (Nielsen $20K+/рік, Mintel $5K+/report, Euromonitor $5K+/рік) — non-justifiable. Аргументи у Section 7.
- **GS1 Polska** — потребує membership (~5K PLN/рік), low ROI для broker-багатопрофільного бізнесу.
- **Edamam ($99/міс)** — duplikat того що OpenFoodFacts + Haiku AI вже дає free.

---

## 2. ARCHITECTURAL FRAMEWORK

### Hybrid algo+AI principle (locked Vadym 28.04.2026)

Архітектура L1-L7 (з sztab memory):
```
L1 — DB foundation                    (algo only)
L2 — CEIDG/KRS discovery + scoring    (algo only)
L3 — Schema hygiene                   (algo only)
L4 — Enrichment                       (algo + AI extract)
L5 — Algorithmic matching broad sweep (algo only)
L6 — AI re-score TOP-20               (AI primary)
L7 — AI sales strategy                (AI primary)
```

**Vadym принцип:** Hybrid на ВСІХ рівнях, не тільки L7.

### 🆕 Unified Intelligence Engine — locked 03.05.2026

**Vadym decision:** Один core engine для всіх 4 entity types (client/product/market/strategy), НЕ окремі engines.

```
sztab-intelligence-engine/
├── core/
│   ├── orchestrator.ts          ← shared source coordination
│   ├── scoring-pipeline.ts      ← shared L5/L6/L7 pattern
│   ├── ai-prompt-templates.ts   ← shared prompt patterns
│   ├── cache-layer.ts           ← shared dedup/cache
│   └── modes/
│       ├── existing-mode.ts     ← scope=existing (process DB)
│       ├── registry-mode.ts     ← scope=registry (CEIDG/KRS bulk)
│       └── combined-mode.ts     ← scope=both (smart merge)
├── entities/
│   ├── client/
│   │   ├── sources.ts           ← discovery + enrichment matrix
│   │   ├── scoring-rules.ts
│   │   └── ai-context.ts
│   ├── product/
│   │   ├── sources.ts
│   │   ├── scoring-rules.ts
│   │   └── ai-context.ts
│   ├── market/
│   └── strategy/                ← cross-entity composition
└── api/
    └── analyze.ts               ← single endpoint, params determine mode + entity
```

### 🆕 3 Engine Modes (locked Vadym 03.05.2026)

Engine handles 3 modes — всі доступні одночасно, можна викликати окремо або разом:

**Mode A — Existing (швидкий цикл):**
- Process entities ВЖЕ у DB
- AI re-score
- Used: щоденно для outreach planning, daily insights
- UI: Кнопка "Опрацюй мою базу" на /pulpit

**Mode B — Registry (bulk discovery):**
- Filter CEIDG/KRS by criteria
- Bulk score (algorithmic, fast)
- Auto-add high-score (>70) до DB як prospects
- AI re-score TOP-100
- Used: раз на тиждень для new pipeline filling
- UI: Кнопка "Знайти нових в реєстрах"

**Mode C — Combined (default smart merge):**
- Both existing entities + new high-score prospects
- Unified ranked output
- Used: regular intelligence cycle, head-to-head pulpit
- UI: Default "Пошук фірм" з filter form

**Plus: Sequential pipeline (cron job):** opracujе existing → pull новий top-50 з реєстрів → re-rank всі разом. Overnight batch.

### Як цей принцип застосовуємо до Product Intelligence

Те саме — на КОЖНОМУ layer (PIL-1..PIL-5) має бути комбінація algo data collection + AI structuring/inference.

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 7 — AI Sales Strategy для товару                           │
│ AI: Claude Haiku → "які 5 типів клієнтів best fit + чому         │
│      + cold opener template + угол розмови                        │
│      + 🆕 generated email до hurtowni для oferty"                 │
├──────────────────────────────────────────────────────────────────┤
│ LAYER 6 — AI Re-score Buyer Fit Vector                           │
│ AI: Take TOP-20 candidate clients + product attrs →              │
│      re-score з context того що ВЖЕ продають у даній категорії    │
│      + знайти non-obvious matches                                 │
├──────────────────────────────────────────────────────────────────┤
│ LAYER 5 — Algo Matching + Pricing Algo                           │
│ Algo: PKD score + size match + activity + new signals:           │
│       pricing tier match, brand similarity,                       │
│       category demand signal, hybrid pricing benchmark            │
├──────────────────────────────────────────────────────────────────┤
│ LAYER 4 — Enrichment Pipeline                                    │
│ Algo + AI:                                                        │
│  • EAN/GTIN lookup (algo: OFF API)                                │
│  • Attribute extraction (AI: Haiku)                               │
│  • Competitor pricing pull (Apify Allegro/Ceneo)                  │
│  • Gazetki promo prices (Blix scraper + AI parse)                 │
│  • 🆕 Outreach Pricing (AI generated email → hurtownia → oferta)  │
│  • Industry context (Tavily search + AI summarize)                │
│  • Demand signal (Google Trends API)                              │
├──────────────────────────────────────────────────────────────────┤
│ LAYER 3 — Product Schema                                         │
│ Algo only. Tables:                                                │
│  • products (existing)                                            │
│  • product_attributes (existing з Sprint H)                       │
│  • product_market_intel (NEW — pricing per source per date)       │
│  • product_competitors (NEW — конкуренти + brands)                │
│  • product_demand_signals (NEW — Trends, Allegro listings)        │
│  • 🆕 product_outreach_log (email/call history per hurtownia)     │
│  • commodity_prices (existing — ZSRIR, fresh-market)              │
└──────────────────────────────────────────────────────────────────┘
```

### Key insight для розширення на нові верtikали

Schema повинна бути **vertical-agnostic** з самого початку:
- `product_market_intel.source` — enum extensible
- `product_market_intel.product_segment` — `food/preserves/fermented`, але legko додати `cosmetics/skincare`, `electronics/audio` etc.
- `product_demand_signals.signal_type` — `google_trends`, `allegro_listing_count`, `social_mention`
- 🆕 `product_outreach_log.outreach_type` — `email_offer_request`, `phone_followup`, `meeting_followup`

Тобто додавати нову вертикаль = додати enum value + новий scraper, не переробляти DB schema.

---

## 3. USE-CASE LAYERS — 5 шарів Product Intelligence

### PIL-1: IDENTITY & ATTRIBUTES

**Що дає:** "Що це за продукт?" — фізичні характеристики, склад, certifications.

**Поля:** ean/gtin, weight_g, volume_ml, ingredients[], allergens[], dietary_labels[], country_of_origin, production_method, storage_class, shelf_life_days, certifications[].

**Sources:**
- **Open Food Facts** (active, free) — EAN→data, ingredients, photos, nutritional. Coverage ~30% PL.
- **Anthropic Haiku AI** (active, $0.02/SKU) — extract з product name + description.
- **dane.gov.pl GIS** (free, planned S6) — Rejestr produktów zgłoszonych do GIS.
- **GS1 Polska** (members only, future S6+) — Authoritative barcode→producent.

**AI roles:**
- Extract structured attrs з нестандартизованих descriptions
- Inference категорій коли barcode unknown
- Translation Pol↔Ukr↔Eng product names

### PIL-2: PRICING INTELLIGENCE — 4 sub-layers

**🆕 Розширено до 4 sub-layers після Vadym feedback:**

**PIL-2a: Retail prices (готовий продукт у мережах)**
- **Allegro Apify scraper** (active) — ринкові ціни конкурентних готових продуктів. **Vadym caveat:** ціни на Allegro дешевші за магазини але не гуртові — це "hybrid pricing tier". Плюс: Allegro sellers самі часто hurtownie → треба надсилати їм запити oferty (зв'язок з PIL-2d).
- **Ceneo Apify scraper** (planned) — 30M monthly visitors, multi-retailer offers per product.
- **Blix.pl + Gazetkonosz.pl + Mojagazetka.com + Dlahandlu.pl** (planned) — promo prices у gazetkach всіх top retail chains. Coverage 60+ chains.
- **Allegro Open API** (waiting verification issue #13352, free після approval).

**PIL-2b: Wholesale prices (B2B catalog scraping) — обмежено**
- **Selgros JDG login scraping** — Vadym має firmowe konto, online catalog visible після login. **🆕 CAVEAT після Vadym feedback:** Selgros/Makro **НЕ показують повний гуртовий каталог з цінами на сайті**. Online dostępne — обмежений range. Real wholesale prices даються індивідуально менеджерами після контакту.
- **Makro JDG login scraping** — same logic як Selgros.
- **Eurocash Cash&Carry** — 160 wholesalers, leading distributor.
- **Bidfood, Transgourmet** — secondary HoReCa players.

**PIL-2c: Raw commodity prices (сировина)**
- **ZSRIR** (active, free, shipped Sprint S-INTEL.1.1).
- **fresh-market.pl** (planned, free, cheerio scraper).
- **EU Agri-food Data Portal** (planned, free).
- **GUS Ceny detaliczne** (planned, free).

**🆕 PIL-2d: Outreach Pricing — Direct request to wholesalers**

**Це новий шар який Vadym pointed out — фундаментальна знахідка цього discovery.**

**Workflow:**
```
Algorithm:
1. Identify list relevant hurtowni для категорії товару
   Sources: PKD-based filter з KRS (PKD 46.31, 46.33, 46.34, 46.36, 46.37, 46.38, 46.39 — hurt food)
   + Tavily search "{kategoria товару} hurtownia Polska"
   + Apify Google Maps search by category
   + branżowe katalogi (PKT.pl)

2. Pre-filter:
   - Geographic relevance (Mazowieckie focus, ti wider regions)
   - Size proxy (employees > 5, GUS data)
   - Active VAT
   - Has email contact

AI Haiku:
3. Generate personalized email request — segment-aware
   Format:
   - Subject: "Zapytanie ofertowe — {kategoria}"
   - Body: introduction Ziomek Fish sp. z o.o., specific category interest,
     volume estimate, decision timeline, ask for full price list

User action:
4. Review + send (Gmail integration або copy-paste)

Algorithm + AI:
5. Track responses
   - Separate inbox label "oferty cenowe"
   - AI parse коли приходить (Haiku extract: prices, terms, MOQ, valid_until)
   - Store у product_market_intel з source='wholesale_outreach'

6. Telefon follow-up mode (для тих хто не відповів за 7 днів)
   - AI генерує conversation script
   - Vadym робить дзвінок
   - After call: AI Haiku transcribes notes → structured pricing data
```

**Outcome:** Через 2-3 місяці у Vadym **власна proprietary база wholesale цін** не від scraping а від **direct relationships**. Це Sztab moat який ніхто не повторить.

**Cost:** $0 (тільки Anthropic API tokens на email generation + AI parsing).
**Effort to ship MVP:** ~4-5 годин.
**ROI:** Найвищий з усіх PIL-2 sub-layers бо unique data + relationship-building side effect.

### PIL-3: DEMAND SIGNALS

**Що дає:** "Чи ринок цього хоче? Куди тренд?"

**Sources:**
- **Google Trends** (planned, free через Apify actor АБО official alpha API) — search interest, related queries.
- **Allegro listing count** (active через scraper) — кількість active offers per category — proxy popytu.
- **Tavily news search** (active для clients, потрібно wire для products).
- **Pyszne.pl Raport Trendów 2026** (manual, free PDF) — food trends.
- **Wiadomościhandlowe.pl + Hurtidetal.pl** (manual reading) — industry news.

### PIL-4: DISTRIBUTION MAPPING

**Sources:**
- **Apify Allegro Seller Scraper** (`klevio/allegro-seller-scraper`) — full catalog of any seller з EAN/SKU.
- **Allegro listings analysis**.
- **Ceneo aggregation**.
- **Gazetki aggregators**.
- **Tavily search** "kiszonki dystrybucja Polska".
- **Industry reports**.

### PIL-5: BRAND & INDUSTRY CONTEXT

**Sources:**
- **Ceneo Product Review Scraper** — verified customer reviews.
- **Tavily news** — brand mentions.
- **Open Food Facts brands**.
- **Industry magazines** (Wiadomościhandlowe, Hurt&Detal, Handel).
- **Pyszne.pl + McKinsey/EuroCommerce reports**.

---

## 4. SOURCE CATALOG — Повний матрикс з detail

### Format: Кожне джерело має 9 полів — Назва, URL, Що дає, Cost, Coverage food spectrum, API чи scrape, Status в Sztab, Real example, Risk/Notes.

### 4.1 Open Food Facts
- **URL:** https://world.openfoodfacts.org/api/v2
- **Що дає:** EAN→full product profile.
- **Cost:** Free.
- **Coverage:** Все food. PL ~30% для popular brands.
- **API/scrape:** REST API.
- **Status:** ✅ ACTIVE Sprint H. lib/enrichment/openfoodfacts.ts.

### 4.2 Anthropic Haiku AI
- **Cost:** $1/MTok input, $5/MTok output. Bulk SKU attribute extraction ≈ $0.02/SKU.
- **Status:** ✅ ACTIVE.

### 4.3 Allegro Apify Scraper (parseforge)
- **URL:** https://apify.com/parseforge/allegro-scraper
- **Cost:** Pay-per-event ~$0.038/5 results. Free tier 10 items/run.
- **Status:** ✅ SHIPPED 30.04.

### 4.4 Allegro Seller Scraper (klevio)
- **Cost:** ~$0.10 per seller catalog.
- **Status:** ⚠️ PLANNED.

### 4.5 Allegro Open API
- **Cost:** Free після verification.
- **Status:** ⏸ WAITING issue #13352.

### 4.6 Ceneo Scraper (studio-amba)
- **Cost:** Pay-per-event ~$0.05/10 results.
- **Status:** ⚠️ PLANNED.

### 4.7 Ceneo Reviews Scraper (trev0n)
- **Cost:** Pay-per-event.
- **Status:** ⚠️ PLANNED PIL-5.

### 4.8 Blix.pl gazetka aggregator
- **URL:** https://blix.pl
- **Coverage:** 60+ retail chains.
- **API/scrape:** Scrape (cheerio/playwright).
- **Status:** ⚠️ PLANNED — CRITICAL discovery з цього session.

### 4.9-4.11 Gazetkonosz/Mojagazetka/Dlahandlu — backup aggregators.

### 4.12 Selgros JDG login scraping
- **🆕 CAVEAT v2:** Selgros не показує повний гуртовий каталог з цінами online. Часткова видимість.
- **Real wholesale через PIL-2d outreach.**
- **Status:** ⚠️ PLANNED — limited use case.

### 4.13 Makro Polska JDG — same caveat як Selgros.

### 4.14 Eurocash Cash&Carry — future, складна franchisee structure.

### 4.15 ZSRIR
- **Status:** ✅ SHIPPED Sprint S-INTEL.1.1. 87 rows. 2 datasets active.

### 4.16 fresh-market.pl
- **Status:** 📋 AUDIT DONE. Sprint S-INTEL.1.2.2 planned.

### 4.17 EU Agri-food Data Portal
- **Status:** 📋 AUDIT DONE. Sprint S-INTEL.1.2.3 planned.

### 4.18 Tavily AI web search
- **Cost:** Free tier 1000 credits/міс. PAYG $0.008/credit. Researcher $30/міс (4000 credits, $0.0075/credit). Startup $100/міс (15000 credits).
- **🆕 IMPORTANT for budget:** Sztab usage typically 100-200 credits/міс → **Free tier sufficient indefinitely** на поточному scale.
- **Status:** ✅ ACTIVE для clients. **NEEDS WIRING для products** — gap.

### 4.19 Tavily /extract endpoint — same pricing.

### 4.20 Google Trends — Apify actor + official alpha API.

### 4.21 dane.gov.pl — 43,000+ datasets.

### 4.22 GUS Ceny detaliczne — free.

### 4.23 GS1 Polska — members only ~5K PLN/рік.

### 4.24 Pyszne.pl Raport Trendów — manual annual.

### 4.25 Industry magazines — Wiadomościhandlowe, Hurtidetal.

### 4.26 PKT.pl business directory — Polish Yellow Pages.

### 4.27 Producenci websites (Kraszkiewicz, Vegepol, Witpol, Słoneczne Pole, Orzeł, Artman, Kiszone Specjały, Matyjaszczyk).

### 4.28 EU Open Food Facts Pro — future producer-facing.

### 4.29 Apify website-content-crawler — generic fallback.

### 🆕 4.30 Outreach module (PIL-2d) — direct email + телефон до hurtowni
- **Components:**
  - AI Haiku email generator (system prompt + product/category context)
  - Outreach target list builder (KRS PKD filter + Tavily + Apify Maps)
  - Inbox monitoring (Gmail integration або manual paste)
  - AI Haiku response parser (extract prices, terms, MOQ)
  - Phone follow-up script generator
- **Cost:** $0 інфраструктура + Anthropic tokens (~$0.005 per email + parse).
- **Status:** 🆕 NEW — proposed Sprint S-CORE.3 (product profile).

### 4.31 Skip-list (НЕ варто інтегровувати):
- TradeMap, Edamam ($99/міс), Nielsen ($20K/рік), Mintel ($5K/report), Euromonitor ($5K/рік), Amazon.pl, YouTube/TikTok social, Visualping/Skuuudle/Competera/Omnia.

---

## 5. SOURCE × USE-CASE MATRIX

| Source | PIL-1 Identity | PIL-2a Retail | PIL-2b Wholesale | PIL-2c Raw | 🆕 PIL-2d Outreach | PIL-3 Demand | PIL-4 Distribution | PIL-5 Brand |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Open Food Facts | ⭐⭐⭐ | — | — | — | — | — | — | ⭐ |
| Anthropic Haiku | ⭐⭐⭐ | — | — | — | ⭐⭐⭐ | — | — | — |
| Allegro Apify | ⭐ | ⭐⭐⭐ | — | — | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ |
| Allegro Seller | ⭐⭐ | ⭐⭐ | — | — | ⭐⭐ | — | ⭐⭐⭐ | ⭐⭐ |
| Allegro Open API | ⭐⭐ | ⭐⭐⭐ | — | — | — | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Ceneo | ⭐ | ⭐⭐⭐ | — | — | — | ⭐ | ⭐⭐ | ⭐ |
| Ceneo Reviews | — | — | — | — | — | — | — | ⭐⭐⭐ |
| Blix.pl gazetki | — | ⭐⭐⭐ | — | — | — | ⭐ | ⭐⭐⭐ | — |
| Selgros JDG | — | — | ⭐⭐ (limited) | — | ⭐⭐ (target list) | — | ⭐ | — |
| Makro JDG | — | — | ⭐⭐ (limited) | — | ⭐⭐ (target list) | — | ⭐ | — |
| 🆕 Outreach module | — | — | ⭐⭐⭐ | — | ⭐⭐⭐ | — | ⭐⭐ | ⭐ |
| ZSRIR | — | — | — | ⭐⭐⭐ | — | — | — | — |
| fresh-market | — | — | — | ⭐⭐⭐ | — | — | — | — |
| EU Agri-food | — | — | — | ⭐⭐ | — | — | — | — |
| Tavily search | ⭐ | ⭐ | ⭐ | — | ⭐⭐ (target list) | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Tavily /extract | ⭐⭐ | ⭐ | ⭐ | — | — | — | ⭐⭐⭐ | ⭐⭐ |
| Google Trends | — | — | — | — | — | ⭐⭐⭐ | — | ⭐ |
| dane.gov.pl GIS | ⭐⭐ | — | — | — | — | — | — | ⭐ |
| GUS Ceny | — | ⭐ | — | ⭐⭐ | — | ⭐ | — | ⭐ |
| GS1 (future) | ⭐⭐⭐ | — | — | — | — | — | — | — |
| Pyszne.pl Raport | — | — | — | — | — | ⭐⭐⭐ | — | ⭐⭐ |
| Wiadomościhandlowe | — | ⭐ | ⭐ | — | — | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| PKT.pl | — | — | — | — | ⭐⭐ (target list) | — | ⭐⭐ | ⭐ |
| Producenci websites | ⭐ | ⭐⭐ | ⭐ | — | ⭐ | — | ⭐⭐⭐ | ⭐⭐⭐ |
| website-crawler | ⭐ | ⭐ | ⭐ | — | — | — | ⭐⭐ | ⭐⭐ |

⭐⭐⭐ = primary, ⭐⭐ = secondary, ⭐ = nice-to-have.

---

## 6. HYBRID ALGO+AI INTEGRATION PLAN

### Як кожне джерело wires в L4-L7

**L4 — Enrichment Pipeline (Algo + AI):**

Trigger: User clicks "Аналіз товару" на /produkty/[id] (Sprint S-CORE.3).

Phase 1 (parallel sources, ~30-60s):
- Algo: Allegro Apify scraper search by product+brand → top 50 listings
- Algo: Ceneo scraper → multi-retailer offers
- Algo: Blix.pl scrape current gazetki
- Algo: Selgros + Makro JDG check (якщо session active) — limited
- Algo: ZSRIR fetch related raw commodity (mapping product→raw)
- Algo: Tavily search "{product_name} Polska kategoria producent" — news + brands
- Algo: Tavily /extract на known competitor websites
- Algo: Google Trends → 12-month interest, related queries
- 🆕 Algo: Build outreach target list (KRS PKD filter + Tavily + Apify Maps)

Phase 2 (sequential AI, ~10-20s):
- AI: Haiku — extract attributes
- AI: Haiku — competitor analysis з Allegro+Ceneo+gazetki
- AI: Haiku — demand summary з Trends + Tavily
- AI: Haiku — pricing tier classification
- AI: Haiku — buyer fit vector
- 🆕 AI: Haiku — generate email templates до 5-10 hurtowni

**L5 — Algo matching:** existing engine + новий signals (pricing tier, demand score, competitor density, allegro presence).

**L6 — AI re-score TOP-20:** existing + product market intel context.

**L7 — AI sales strategy:** final cold opener + 🆕 generated email до hurtowni.

---

## 7. BUDGET ANALYSIS — точні цифри (verified квітень 2026)

### 7.1 Apify — pricing structure (CORRECTED v2)

**Hybrid model — є і базова підписка І pay-per-usage.**

| Plan | Monthly fee | Що включено |
|---|---|---|
| **Free** | $0 | $5 prepaid credits (не rollover), 8 GB RAM, 25 concurrent runs, community support |
| **Starter** | $39 | $39 prepaid credits + chat support + $200 overage cap + 14-day data retention |
| **Scale** | $199 | $199 prepaid credits + priority chat + silver discount (CU $0.25 замість $0.30) + 21-day retention |
| **Business** | $999 | $999 prepaid credits + account manager + gold discount (CU $0.20) |

**Як рахується usage:**
- **Compute Units** — 1 GB RAM × 1 година = 1 CU. Lightweight Cheerio scraper ≈ 0.01 CU per 100 records.
- **Pay-per-result actors** (як parseforge/allegro-scraper) — actor розробник встановлює свою ціну. Це окремо від CU.
- **Proxy bandwidth** — residential proxy $8/GB pay-as-you-go.
- **Data transfer** — $0.20/GB на Free/Starter.

**Реальна вартість для нас:**
- Free $0/міс — $5 credits → ~50-100 product analyses/міс (pay-per-event scrapers).
- **Стартуємо на Free $0/міс. Upgrade до Starter $39 коли regularly burn $5 у 3 послідовних місяцях.**

⚠️ Apify retire-ить rental model 1 жовтня 2026. Все актори переходять на pay-per-usage. Наші scrapers вже pay-per-event — нас не торкається.

### 7.2 Tavily — pricing structure (CORRECTED v2)

**Credit-based, не subscription з фіксованою кількістю searches.**

| Plan | Monthly fee | Credits/місяць | Per-credit cost |
|---|---|---|---|
| **Free Researcher** | $0 | 1,000 credits | — |
| **Pay As You Go** | $0 + usage | unlimited | $0.008/credit |
| **Researcher** | $30/міс ($25 annual) | 4,000 credits | $0.0075/credit |
| **Startup** | $100/міс ($83 annual) | 15,000 credits | $0.006/credit |
| **Project** | custom | 38,000+ credits | $0.005/credit |

**Що з'їдає credits:**
- Basic search = **1 credit**
- Advanced search = **2 credits**
- Extract URL = **1 credit за 5 URLs** (basic)
- Map website = **10 credits per 100 pages**
- Crawl = mapping + extraction stacked

**Credits НЕ rollover.**

**Реальний use case Sztab:**
- Currently wired для clients, ~50-100 searches/міс
- Wire products: +50-100 searches/міс
- Total ~100-200 searches/міс → **Free 1000 credits ДОСТАТНЬО з великим margin**.

### 7.3 Anthropic API — pricing structure (CORRECTED v2)

**Pure pay-per-token. NO subscription. NO monthly fee.**

| Model | Input ($/MTok) | Output ($/MTok) | Use case |
|---|---|---|---|
| **Haiku 4.5** | $1 | $5 | Bulk attribute extraction, classification |
| **Sonnet 4.6** | $3 | $15 | Production reasoning, sales strategy |
| **Opus 4.7** | $5 | $25 | Maximum quality (rarely needed) |

**Optimizations:**
- **Batch API:** 50% off (24h delay async). Haiku → $0.50/$2.50.
- **Prompt caching:** 90% off cached input.

**Реальна вартість Sztab:**
- 35 SKU bulk attribute generation = $0.03-0.05
- Cold opener generation per client = ~$0.001-0.005
- Re-score TOP-20 matches = ~$0.05 per cohort run
- Outreach email generation = ~$0.005 per email
- Monthly typical Sztab usage: ~$5-20/міс moderate, $50-100 aggressive.

### 7.4 Виправлений Budget Total (CORRECTED v2)

**Поточний тier (start):**

| Source | Type | Realistic monthly cost |
|---|---|---|
| Apify | Free tier $0 ($5 credits/міс) | **$0** |
| Tavily | Free tier $0 (1000 credits/міс) | **$0** |
| Anthropic | Pay-per-token | **$5-20** |
| **TOTAL CURRENT** | | **$5-20/міс** |

**При active scale через 3-6 місяців:**

| Source | Type | Cost |
|---|---|---|
| Apify Starter | $39 prepaid + overage | **$39-80** |
| Tavily Researcher | $30 (4k credits) | **$30** |
| Anthropic | Pay-per-token aggressive | **$50-100** |
| **TOTAL SCALE** | | **$120-210/міс** |

⚠️ **CORRECTION з v1:** Раніше було неправильно "$80-200 start, $200+ scale". **Правильно: $5-20 start, $120-210 scale.** Apify і Tavily Free tiers покривають Sztab при поточному usage.

### 7.5 Skip-list з аргументами

- **Edamam ($99-499/міс)** — duplicate OFF + Haiku free. ❌ NEVER.
- **Nielsen / Mintel / Euromonitor ($5K-20K+/рік)** — budget incompatibility. 80% insights через Tavily news + Wiadomościhandlowe + AI summarize. ❌ NEVER (для bootstrap).
- **Wiadomościhandlowe Pro (~300 PLN/рік)** — manual reading, Tavily news + free articles покриває. ⏸ POSTPONE.
- **GS1 Polska (5K PLN/рік)** — workaround вже OFF + Haiku 80% accurate. ⏸ TRIGGERED EVENT — register тільки коли Vadym launches own brand SKU at retail.
- **Visualping / Skuuudle / Competera / Omnia ($500-$5K/міс)** — built for SaaS/retail, не broker. Apify scrapers do same. ❌ NEVER.
- **SerpApi for Google Trends ($50-300/міс)** — Apify actor дешевший. ⏸ Use Apify first.

---

## 8. PHASED ROADMAP (Updated v2)

### Sprint S-CORE.1-5 — Unified Engine (REPLACES old S6A/S6B)

**Sprint S-CORE.1 — Build core engine (5-7h)**
- core/orchestrator.ts — source coordination
- core/scoring-pipeline.ts — L5/L6/L7 pattern shared
- core/ai-prompt-templates.ts — prompt patterns
- core/cache-layer.ts — dedup/cache
- core/modes/{existing,registry,combined}.ts — 3 modes
- entities/registry.ts — entity profile loader

**Sprint S-CORE.2 — Wire client profile (3-4h)**
- entities/client/sources.ts — discovery + enrichment matrix
- entities/client/scoring-rules.ts — port існуючої логіки
- entities/client/ai-context.ts — cold opener prompts
- Port intelligence/lookup → engine call
- UI: Кнопка "Аналіз клієнта" на /clients/[id]

**Sprint S-CORE.3 — Wire product profile (4-6h)** — extended due до PIL-2d
- entities/product/sources.ts — всі PIL-1..PIL-5 sources
- entities/product/scoring-rules.ts — pricing tier, demand, competitor signals
- entities/product/ai-context.ts — buyer fit vector
- 🆕 Outreach module (PIL-2d) — email generator + inbox parser
- UI: Кнопка "Аналіз товару" на /produkty/[id]

**Sprint S-CORE.4 — Wire market profile (3-4h)**
- entities/market/sources.ts — category-level analysis
- AI synthesis ринковий звіт

**Sprint S-CORE.5 — Wire strategy profile (4-5h)**
- entities/strategy/* — cross-entity composition
- "Знайди 5 best client × product combinations + дай sales plan"

**Total: ~19-26h** (трохи більше через PIL-2d).

### Pre-S-CORE — Pending tasks

**🆕 Sprint S-INTEL.GAZETKI** (~6-8h)
- Blix.pl + Gazetkonosz.pl scraping
- AI parse гazetek
- Daily cron updates
- НЕ блокує S-CORE — paralel track

**Sprint S-INTEL.TRENDS** (~3-4h) — Google Trends Apify actor.

**Sprint S-INTEL.WHOLESALE-OUTREACH** (~4-5h) — це і є PIL-2d основна частина.
- Tightly coupled з S-CORE.3 — фактично частина його.

### Beyond S-CORE

- **Sprint S-INTEL.REVIEWS** — Apify Ceneo Reviews + AI sentiment.
- **Sprint S-INTEL.COMPETITOR-CATALOGS** — Tavily /extract на конкурентські сайти.
- **Sprint S-INTEL.GUS-CENY** — macro pricing trends.
- **Sprint S-INTEL.DANEGOVPL-GIS** — sanitary registry.
- **Sprint S-INTEL.ALLEGRO-OPENAPI** — після Allegro verification approval.

---

## 9. ANTI-PATTERNS

### 9.1 НЕ робимо "тест продукту" — це not the goal

Sztab не nutrition analysis. Goal — **lead generation з product context**.

### 9.2 НЕ будуємо infrastructure для верtikал яких немає

Schema vertical-agnostic, sources додаємо лазно.

### 9.3 НЕ ignoruємo basic tools

Tavily для clients ВЖЕ є. Поширити на products = trivial. Lesson: перед budowaniem complex, перевір чи basic tool вже не closed gap.

### 9.4 НЕ робимо paralelnie sources без AI checkpoint

Phase 1 ALL sources fetch parallel → AI starts ONLY after all done (Protocol 13).

### 9.5 НЕ storing duplicate data per source

product_market_intel.source enum — кожен source свій rekord.

### 9.6 НЕ scraping коли API available

Allegro Open API > Apify scraper. Tavily extract > Apify website-content-crawler.

### 9.7 НЕ assume premium tier reduce work

Nielsen $20K дає авторитативні reports — Sztab не сказала про authority. Tavily news + AI summarize дає 80% за 1% cost.

### 9.8 НЕ ignoruємо Polish-specific sources

Local sources (Blix, Ceneo, dane.gov.pl, Wiadomościhandlowe) > generic premium. Це Sztab moat.

### 🆕 9.9 НЕ ігноруємо relationship-based sources

Vadym pointed out: Selgros/Makro не показують прайси online — вони дають через relationships. Outreach Pricing (PIL-2d) — це і є цей шар. Ignoring це = пропускаємо найцінніший data source.

### 🆕 9.10 НЕ змішуємо Allegro з retail

Vadym: ціни на Allegro — hybrid tier (між retail і wholesale). Treat as окрема pricing layer, не "як магазин".

---

## 10. DECISION LOG

### Що locked у пам'яті (verified):

- 7-layer architecture L1-L7 (28.04.2026 Vadym)
- Hybrid algo+AI на ВСІХ рівнях (Vadym принцип)
- L5 algo broad sweep + L6 AI re-score TOP-20
- 12 dimensions B1-B12 product spec
- 3 layers product attributes (technical / commercial / buyer fit vector)
- Buyer Fit Vector — moat для Sztab
- НЕ "тест товару" — lead generation з product context
- НЕ universal "будь-який товар" — focus food spectrum
- Multi-channel HoReCa + catering + retail + przetwórstwo + sklepy (5 каналів)
- Allegro = data source + sales channel split
- Tavily wired ONLY для clients (memory recall, потрібно wire products)

### Що NEW з discovery v1 (03.05 ранок):

- Gazetki aggregators (Blix/Gazetkonosz/Mojagazetka/Dlahandlu) = goldmine
- Selgros/Makro JDG scraping — limited через website
- PKT.pl directory — bootstrapping competitor list
- Apify Allegro Seller scraper (klevio) — full catalog of competitor
- Apify Ceneo Reviews scraper — sentiment analysis
- 5-layer PIL framework
- Vertical-agnostic schema
- Budget tier breakdown — SKIP Nielsen/Mintel/Euromonitor

### 🆕 Що NEW з v2 (03.05 після Vadym feedback):

- **PIL-2d Outreach Pricing** — email/телефон до hurtowni як окремий шар
- **Selgros/Makro online catalog limited** — real prices через relationships only
- **Allegro = hybrid pricing tier** — між retail і wholesale, plus sellers самі hurtownie
- **Pricing details corrected** — Apify/Tavily credit-based, Anthropic pay-per-token
- **Budget corrected** — $5-20 start, $120-210 scale
- **Unified Engine architecture** — ONE core, 4 entity profiles, 3 modes (existing/registry/combined)
- **Sprint S6A/S6B SCRAPPED** — replaced з S-CORE.1-5

### 🔴 Що NEW з v3 (03.05 evening — fundamental matrix scoring re-think):

- **Score прив'язаний до пари клієнт×товар, НЕ клієнта** — детально у Section 11
- **"Аналіз товару" — головний "продаючий" інструмент Sztab** — все ranking логіка живе тут
- **"Аналіз клієнта" — без скору** — профіль + матриця матчів, скоринг переходить у товарний engine
- **Mode B додає всіх клієнтів** — без фільтру по скорингу при додаванні
- **TAM/SAM/SOM = властивість товару** — реалізується через "Аналіз ринку"

### Що відкладено до подальшого discovery з Vadym:

- Чи Sztab register own brand SKU у GS1?
- Чи Selgros/Makro scraping legal-risk-aware або чекаємо на legitimate API?
- Чи Vadym має list нових verticals на горизонті (cosmetics? electronics?)?
- Конкретні PKD codes для PIL-2d outreach target list — будемо tuning з Vadym

---

## 11. MATRIX SCORING MODEL (NEW v3)

### 🔴 Фундаментальний концепт

**Скор — це властивість пари клієнт×товар, НЕ клієнта окремо.**

Раніше Sztab мав логіку "клієнт KOZAK = score 95 → tier A → у когорту". Ця логіка скасована.

Тепер: **матриця матчів**.

```
            ЧМ kiszone    Wędliny    Surówki    Olej    Miód
            ogórki        premium    klasyczne  rzepak  łyżeczka
─────────────────────────────────────────────────────────────────
KOZAK         85%          72%        68%        42%      18%
SMAKI         78%          88%        75%        35%      22%
LEWIATAN      65%          70%        60%        80%      55%
─────────────────────────────────────────────────────────────────
```

Один клієнт має N різних скорів — по одному на кожен товар у нашому асортименті.

### Чому матричний підхід (Vadym's reasoning)

> "Один клієнт може мати 80 на ЧМ, 20 для ложки з медом і 70 для wędlin і так далі. Скоринг потрібен не для аналізу клієнта а для аналізу товара та його стратегії продажів."

Sztab — це **посередницький бізнес з ширшим асортиментом**. Те що клієнт зараз не підходить ні для чого, не означає що через 6 місяців нам не з'явиться товар який ідеально для нього. Тому:

1. **База клієнтів = універсальний asset** — тримаємо ВСІХ кого знайдемо
2. **Скоринг = функція товару** — оцінюємо клієнтів **відносно конкретного товару**
3. **Стратегія продажів = функція товару** — групуємо клієнтів по match strength для **цього товару**

### Архітектурна реалізація

**Центральна функція скорингу живе у товарному engine:**

```typescript
// entities/product/scoring-rules.ts
export function computeMatchScore(
  product: Product,
  client: Client,
  context: ScoringContext
): MatchResult {
  // Algo signals (0-100 base):
  const pkdMatch = computePkdAffinity(product.targetPkds, client.pkds);
  const sizeMatch = computeSizeAffinity(product.targetSize, client.size);
  const channelMatch = computeChannelAffinity(product.channels, client.channel);
  const pricingMatch = computePricingTierMatch(product.pricingTier, client.priceTier);
  const geoMatch = computeGeoAffinity(product.distribution, client.locations);
  const marketplaceMatch = computeMarketplaceFit(product, client.allegroProfile);
  
  // Bonuses:
  const bonuses = [
    client.bzpHistory.matchesProduct(product) ? +15 : 0,
    client.allegroProfile.brandsDistributed.includes(product.brand) ? +10 : 0,
    client.industryNews.recentExpansion ? +5 : 0,
  ].filter(Boolean);
  
  // Penalties:
  const penalties = [
    client.vatStatus !== 'czynny' ? -50 : 0,
    client.msig.recentBankruptcy ? -100 : 0,
  ].filter(Boolean);
  
  const total = pkdMatch + sizeMatch + channelMatch + pricingMatch +
                geoMatch + marketplaceMatch + sumOf(bonuses) + sumOf(penalties);
  
  return {
    score: Math.max(0, Math.min(100, total)),
    breakdown: { pkdMatch, sizeMatch, ..., bonuses, penalties },
    confidence: computeConfidence(client.dataCompleteness)
  };
}
```

**Клієнтський engine викликає товарний для матриці:**

```typescript
// entities/client/engine.ts (Sprint S-CORE.2)
async function analyzeClient(clientId: string): ClientAnalysisResult {
  const client = await fetchClientWithEnrichment(clientId);  // 8 layers CIL
  const allProducts = await fetchAllProducts();              // 35+ SKU
  
  // Compute matrix
  const matrix = await Promise.all(
    allProducts.map(product =>
      productScoring.computeMatchScore(product, client, context)
    )
  );
  
  // Sort + filter
  const ranked = matrix.sort((a, b) => b.score - a.score);
  const topMatch = ranked[0];
  const topMatchReasoning = await aiHaiku.explainMatch(
    topMatch.product,
    client,
    topMatch.breakdown
  );
  
  return {
    profile: client,           // Layer 1: 8 CIL layers
    matrix: ranked,            // Layer 2: per-product scores
    topRecommendation: topMatch,
    aiReasoning: topMatchReasoning
  };
}
```

### "Аналіз товару" — головний use case (Sprint S-CORE.3)

Це **головний "продаючий" інструмент Sztab**.

**Workflow:**

1. **Input:** Product ID (наприклад "ЧМ kiszone ogórki")
2. **Engine викликає:**
   ```typescript
   const allClients = await fetchAllClients();  // вся база
   const matrix = await Promise.all(
     allClients.map(client => 
       productScoring.computeMatchScore(product, client, context)
     )
   );
   ```
3. **Filter + sort:**
   - Top 100 by score
   - Сегментація: Hot (>70), Warm (50-70), Cold (<50)
4. **AI генерує стратегію продажів:**
   - Hot segment: cold call, личний візит, premium pitch
   - Warm segment: телефон з прайсом, follow-up email
   - Cold segment: skip або резерв на майбутнє
5. **UI на /produkty/[id]:**
   - Top recommendation hero
   - Hot list (5-15 фірм з кнопками "підготувати pitch")
   - Warm list (15-30 фірм)
   - Cold (зі згорткою)
   - Загальний market potential summary

### "Аналіз ринку" — TAM/SAM/SOM (Sprint S-CORE.4)

Агрегація match scores товару по всій базі:

```
ЧМ kiszone ogórki — Аналіз ринку Mazowieckie

База: 8000 потенційних клієнтів (CEIDG + KRS у регіоні)

Match distribution:
- Hot (>70):    250 фірм (3.1%) — TOP, у пріоритеті
- Warm (50-70): 1200 фірм (15%) — secondary outreach
- Cold (<50):   6550 фірм (82%) — skip або future products

Market sizing (estimates):
- TAM (всі 8000):    96 mln zł/рік потенціал
- SAM (warm+):       22 mln zł/рік realistic
- SOM (hot only):    5 mln zł/рік short-term targetable

Concentrazione: TOP 250 = 60% market potential

External market context:
- Google Trends: kiszonki +15% YoY
- Allegro listings: 1200 active offers (стабільно)
- Pyszne.pl Raport: traditional cuisine trending

Recommended pricing tier: medium
Primary channel: HoReCa restauracje + sklepy spożywcze
Secondary: catering institutional
```

### "Аналіз стратегії" — крос-аналіз (Sprint S-CORE.5)

Композиція **товар × клієнт × ринок**:

```
Як продати ЧМ kiszone ogórki компанії KOZAK OLEK?

Match: 85% (hot segment)

Strategic brief:
- Pitch angle: traditional cuisine + Allegro distribution
- Reference points: KOZAK уже носить Krakus (similar segment)
- Pricing approach: medium tier (їх average price)
- Channel: cold call → in-person meeting (Warszawa proximity)
- Timing: market trend kiszonki +15% — використати у pitch
- Risks: молода фірма (2022), невеликі обсяги
- Decision-maker: Jan Kowalski (CEO, founder) — не CFO
- Cold opener template: [згенерований AI]
- Conversation script: [згенерований AI]
- Follow-up plan: 3-step sequence
```

### Implications для Mode B (registry discovery)

Раніше думали: алгоритм скорить candidates → high-score auto-add → low-score skip.

Тепер: **додаємо ВСІХ кого знаходимо у реєстрах** з тільки validation фільтром (active VAT + non-wykreślona).

Чому: скор без контексту товару не має сенсу. **База = універсальний asset.**

При запуску "Аналіз товару" — engine скорить всю базу проти конкретного товару. Топ виходить автоматично.

### UI implications

**На сторінці клієнта /clients/[id]:**
- НЕМАЄ "Score 95" одного числа
- Є матриця матчів (15+ рядків товар × match%)
- Є top recommendation card
- Є кнопка "🔍 Глибокий аналіз" → запускає engine

**На сторінці товару /produkty/[id]:**
- Є кнопка "🎯 Знайти клієнтів для цього товару" → запускає Аналіз товару
- Результат: ranked топ-100 клієнтів з % match
- Сегментація hot/warm/cold з різними стратегіями

**На сторінці ринку /rynek/[product_id]:**
- TAM/SAM/SOM візуалізація
- Розподіл match strength
- External context (Google Trends, Allegro listings, news)

### Як ця логіка відображається у protocols

Додаємо **Protocol 22 — Matrix Scoring Model** до sztab-protocols.md (окремий патч).

---

## END OF DOCUMENT v3

**Файл:** docs/sztab-product-sources-discovery.md
**Status:** v3 — ready for review після client v3 + Protocol 22
**Next step:** UI макети S-CORE.0 → review → S-CORE.1 implementation
