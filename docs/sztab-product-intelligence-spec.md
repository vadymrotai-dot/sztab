# Sztab Product Intelligence Specification

**Status:** Foundation document. Created 02.05.2026 після Discovery #5.
**Purpose:** єдина reference для всіх sources, data dimensions, priorities для product matching engine. Розкривається by sprint (S-INTEL.* + S6B.*).
**Anchor protocols:** Protocol 13 (UX), Protocol 15 (Hybrid Matching Philosophy)
**Anchor doc:** docs/sztab-matching-philosophy.md

---

## North Star

"Якісний матчінг = відповідь на 6 питань про конкретного клієнта vs конкретний товар:
- Чи потребує? (relevance)
- Чи може дозволити? (affordability)
- Чи купить у нас vs конкурента? (probability)
- Скільки купить? (volume)
- Чи варто продавати? (profitability)
- Коли купить? (timing)

Кожне з 6 питань потребує окремих типів data."

---

## 12 Data Dimensions для Product

### B1 — Identity

EAN/GTIN, producer GLN, brand, family, country of origin, year introduced, HS/CN code (8-digit), supplier PKD codes.

**Status 02.05.2026:** ~70% (EAN/brand/family OK, CN code MISSING — critical gap що блокує access до EU/GUS data).

### B2 — Physical Specs

Weight (unit/case), dimensions, volume, packaging type, units per case, cases per pallet, pallet config.

**Чому matching:** великі мережі мають pallet requirements, ресторани — small package, catering — bulk.

**Status:** ~40% (fragments в product_attributes, неструктуровано).

### B3 — Composition

Ingredients, nutrition facts, allergens, certifications (BIO/halal/kosher/gluten-free/vegan/MSC/ASC), quality class (fresh/frozen/canned/etc), production method, shelf life, storage conditions, origin claims.

**Чому matching:** halal cert → muslim catering, vegan → vegan kafe, fresh chilled → ресторани близько до hub.

**Status:** ~30% (OFF lookup для consumer brands, structure messy).

### B4 — Price Economics

Retail price (наша), wholesale price (наша), volume discounts, MSRP, production cost (CONFIDENTIAL), margin %, price tier (premium/mid/budget), VAT rate.

**Status:** ~30% (ціни є, без tier benchmarking).

### B5 — Market Positioning

Direct competitors, substitutes, market share estimate, price vs market median, brand recognition, value proposition USP.

**Status:** 0%.

### B6 — Market Prices (CRITICAL — це foundation)

**Layers:**
1. **TGE (Towarowa Giełda Energii):** regulated commodity exchange, agri-commodities з 2020. Поки не критично для finished food, релевантно для bulk grains/sugar/dairy futures.
2. **Wholesale rynki hurtowe (16 markets):** Bronisze (Warszawa, 1.2 млн ton/рік), WGRO (Poznań), Lublin (LRH), Łódź (Zjazdowa), Kraków (Rybitwy), Wrocław (Targpiast), Białystok (PCRT), Gdańsk (Renk), Rzeszów (Agrohurt), etc. Daily quotes через **fresh-market.pl** aggregator.
3. **ZSRIR (Zintegrowany System Rolniczej Informacji Rynkowej):** Ministerstwa Rolnictwa weekly notowania:
   - Zboża (pszenica/żyto/jęczmień/owies/rzepak)
   - Żywiec (klasy EUROP S-P, bydło, drób)
   - Mleko + dairy (masło Extra, OMP/WMP, sery, mozzarella, cheddar)
   - Owoce/warzywa (skup prices)

   **Доступно через dane.gov.pl як OPEN DATA. БЕЗКОШТОВНО через API.**
4. **GUS BDL (Bank Danych Lokalnych):** monthly procurement prices, історія з 1990-х. Lag 30-45 днів.
5. **EU Agri-food Data Portal (agridata.ec.europa.eu):**
   - Milk Market Observatory (weekly prices)
   - Meat Market Observatory
   - Sugar / Olive oil / Wine / Crops / Fruit & Veg observatories
   - API + CSV export.
6. **KOWR (Krajowy Ośrodek Wsparcia Rolnictwa):** specific commodity reports.
7. **IERiGŻ-PIB (Інститут економіки рільничого):** deep market analyses.

**Чому це game-changer:** real wholesale market context робить AI pricing positioning чесним замість здогадки. Без цього шару AI re-score не має реальних orientиrів.

**Status:** 0%.

### B7 — Competitor Intelligence

Список конкурентів-виробників, ціни на segmencie, де продаються (Allegro/Ceneo/retail), price changes, promotional activity, reviews/sentiment.

**Status:** ~30% (Allegro scraper для своїх SKU, не для конкурентів).

### B8 — Demand Signals

Google Trends, social media mentions/sentiment, recipe/cooking blogs, news articles, seasonality, geographic demand by województwo.

**Status:** 0%.

### B9 — Regulatory & Compliance

VAT rate, import/export restrictions, EU food safety regulations, HACCP, special licensing, BIO cert expiration.

**Status:** ~10% (VAT rate в params).

### B10 — Logistics

Cold chain, transport requirements, MOQ, lead time, geographic reach, preferred logistics partner.

**Status:** ~20%.

### B11 — Supplier Specifics (reseller business)

Producent, importer, wholesale supplier, backup suppliers, reliability score, credit terms.

**Status:** ~40% (suppliers table existing).

### B12 — Customer Fit Characteristics

Ideal channel (HoReCa/FMCG retail/specialty/online), ideal customer size, target PKD codes, geographic concentration, seasonality of buying activity.

**Status:** ~60% (family_attribute_defaults).

---

## Sources Map by Tier

### Tier 1 — Backbone (free/cheap, MUST for S-INTEL Phase 1)

🟢 **OpenFoodFacts** (existing) — EAN-driven, B3 coverage
🟢 **GS1 Polska** — registry GLN/EAN holders, public lookup, B1 coverage
🟢 **CEIDG/KRS/REGON** (existing) — manufacturer/distributor by PKD, B1+B11
🟢 **TARIC + CN codes (EU)** — public DB free API, **B1 critical** — bridge до всіх EU statistical sources
🟢 **dane.gov.pl (ZSRIR)** — Polish open data, weekly cattle/dairy/grain/fruit, B6 coverage, FREE API
🟢 **EU Agri-food data portal** — milk/meat/crop observatories, weekly dashboards, CSV/API, B6 coverage
🟢 **Eurostat Comext** — EU foreign trade by CN code, B6+B7 coverage

### Tier 2 — Wholesale market intelligence (paid scraping)

🟢 **fresh-market.pl** — daily wholesale prices, 16 PL markets, scrape via Apify (~$0.05/scrape, 1x daily), B6
🟡 **wiescirolnicze.pl** — daily skup, alternative validation
🟡 **agronews.com.pl, agronomist.pl, tygodnik-rolniczy.pl** — news + price commentary, Tavily extract

### Tier 3 — Wholesale distribution channels (B2B competitors-distributors)

🟢 **Eurocash B2B** — каталог + prices gastronomia, B7 coverage
🟢 **Makro online catalog** — те ж
🟢 **Selgros online catalog** — те ж
🟢 **Allegro Business** (existing scraper) — B7
🟡 **Ceneo, Skapiec, Nokaut** — price comparison aggregators

### Tier 4 — Demand & Sentiment

🟡 **Google Trends** — search volume, FREE API, B8
🟡 **Tavily product extract** (existing for clients) — articles/blogs/recipes, B7+B8
🟡 **Pyszne.pl Economic Index** — monthly benchmark, B6
⚪ **Social media APIs** — rate-limited, often paid

### Tier 5 — Industry intelligence

🟢 **horecanet.pl, dlahandlu.pl, wiadomoscihandlowe.pl** — galuzowi портали з Tavily extract
🟡 **PMR HoReCa Market Report** — paid annual ~5000 PLN, foundation context
🟡 **GUS BDL API** — monthly retail/wholesale stats, FREE, B6
⚪ **NielsenIQ, GlobalData, Euromonitor** — paid intelligence ($5000+)

### Tier 6 — Specialized (deferred)

⚪ **TGE** — bulk commodities тільки
⚪ **MATIF Paris, CME Chicago** — global futures
⚪ **GS1 GDSN** — paid B2B catalog ($1000s/year)

---

## Priorities для S-INTEL sprints

### S-INTEL.1 (foundation, ~6-8h)
- CN code добавлення до products schema (migration 046)
- EU TARIC API integration для CN code lookup helper
- Initial population CN codes для existing 35 SKU (manual + AI assist)
- knowledge_base table migration з category column

### S-INTEL.2 (commodity prices core, ~6-8h)
- commodity_prices table з category column (food initial, ready for extension)
- ZSRIR weekly fetcher (dane.gov.pl API)
- EU Agri-food observatory weekly fetcher
- Sunday cron job для refresh

### S-INTEL.3 (wholesale spot prices, ~5-7h)
- fresh-market.pl scraper (Apify actor or custom)
- Daily fetch для top 5 markets (Bronisze + WGRO + Lublin + Kraków + Wrocław)
- market_signals table populating

### S-INTEL.4 (distribution channels, ~6-8h)
- Eurocash + Makro + Selgros catalog scrapers (on-demand при product analysis)
- product_competitor_listings table extension

### S-INTEL.5 (knowledge base seeding, ~4-6h + Vadym time)
- knowledge_base ingestion pipeline (manual upload UI)
- Embedding generation (OpenAI ada або Anthropic)
- Seeding Phase 1 priorities (price history, competitor analyses, HoReCa business models)

---

## Sprint Plan Reorder (locked 02.05.2026)

Originally planned: S6A → S6B (3 sub-sprintі).

Revised after Discovery #5:

1. **S6A** "Аналіз клієнта" — НЕ блокується intelligence layer (клієнт data sources вже існують: KRS/GUS/Tavily/Apify_GMaps). Ship першим.
2. **S-INTEL.1-5** — Market intelligence foundation. Тиждень розробки.
3. **S6B.0** — Allegro 1-SKU smoke test (existing scraper validation)
4. **S6B.1-3** — Product analysis з повним intelligence layer:
   - Backend orchestrator (тепер враховує commodity_prices + market_signals + competitor_listings)
   - AI engine з повним market context block
   - UI hybrid card + dedicated page
5. **S-FEEDBACK.1** (after S6B ship) — Vadym manual rating UI + tuning suggestion display (Phase 1 of Layer 2 у Protocol 15)

---

## Open Questions (defer to specific sprints)

- Який AI model для embedding knowledge_base? (OpenAI ada-002 vs Anthropic Claude embeddings vs voyage)
- knowledge_base ingestion — manual upload only чи URL fetcher?
- A/B testing infrastructure для Phase 2 tuning
- Як версіонувати algorithm параметри (history of weight changes)
- Synthetic scoring sandbox для calibration period perşi launch

---

## Anti-patterns (blocked principles)

- AI scoring без external market context → це поверхневий guess
- Pre-scraping всіх SKU daily на всіх sources → cost explosion
- Generic-from-day-one architecture → передчасна generalization
- Skipping CN code field → блокує доступ до EU statistical sources
- AI без knowledge_base context → cold-start endless

---

**END OF SPEC. Розкриваємо by section коли стартуємо S-INTEL sprints.**
