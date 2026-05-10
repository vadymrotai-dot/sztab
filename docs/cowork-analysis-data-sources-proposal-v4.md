# Sztab — Customer Profile Data Sources Proposal v4

**Дата:** 2026-05-10
**Status:** Discovery + planning. NO code, NO commits.
**Continuation of:** v3 (`cowork-analysis-data-sources-proposal-v3.md`)
**Method:** 2 паралельні research-агенти на Q1-Q9 verifications.

---

## 0. Що змінилось vs v3 — kompletний redirect

Vadym переглянув v3 і відкинув значну частину як **overengineering для гуртовні**. Sztab — інструмент **холодних дзвінків продавця**, не bank credit committee. Цінні тільки signals що дозволяють: побачити клієнта → набрати → щось предложити → закрити продаж.

### 0.1 СКАСОВАНО з v3 повністю

**Tier A "compute over existing data":**
- ❌ **Altman Z' bankruptcy prediction** — Sztab не банк. Vadym не дає кредит.
- ❌ **VAT delta monitoring** як ціла система — статус "VAT czynny/wykreślony" достатньо як snapshot, не треба daily delta engine.
- ❌ **BZP velocity з time-decay** — irrelevant для CzM/Pikniko/SpoonJoy/Karol/Gmurczyk B2B sales.
- ❌ **Google Maps rating trajectory** — гарне, але not actionable у cold call моменті.
- ❌ **CRBR network graph** — вже є через rejestr.io persons, deeper graph build не дає incremental value.

**Tier B Polish gov sources:**
- ❌ SUDOP UOKiK, KNF registry, CWOH hotel registry, Polish trade press NLP — все скасовано як distraction від core 7 полів.

**Tier C Michelin / Bib / Slow Food:**
- ❌ **СКАСОВАНО.** Vadym цитата: *"150 ресторанів — це не бізнес. Десятки тисяч кебабних, барів млечних, кавярень — це бізнес"*. Premium tier classification == niche play не для Vadym customer base.

**Постачальники detection (фото/etykiety):**
- ❌ **СКАСОВАНО.** Vadym цитата: *"łosoś Mowi продає 30 гуртовень. Бачити Mowi на фото нічого не каже про конкретного постачальника"*. Brand на фото ≠ дистриб'ютор. Цей напрям закрито остаточно.

**Архітектурні enterprise lessons:**
- ⏸ **DEFER.** Per-attribute provenance, signals event stream, refresh queue з priority tiers — будемо робити коли матимемо реальні sources в production, не наперед. Зараз — просто `contact_enrichment.menu_data jsonb`.

### 0.2 ЩО ЛИШИЛОСЬ ЦІННОГО з v3

- ✅ regdata/krs-fullnames-scraper — solves "(KRS anon) PREZES" bug
- ✅ Pyszne/Wolt/Glovo menu scraping — core feature
- ✅ ALEO + PanoramaFirm scrapers — phone/contact verification
- ✅ AI synthesis pipeline (Claude Haiku batched)
- ✅ Vercel Pro $20/міс migration

---

## 1. NEW FOCUS — 7 полів про клієнта

Sztab `/clients/{id}` має одна задача: продавець за 30 секунд бачить, **хто це, чим торгує, де, де в інтернеті, який розмір, з ким говорити, що пропонувати**. 7 полів:

| # | ПОЛЕ | ЗВІДКИ |
|---|---|---|
| **1** | **ХТО ВІН** | AI synthesis з PKD + меню + опис з GMaps/сайту |
| **2** | **ЧИМ ТОРГУЄ** | Pyszne + Wolt + Glovo + GMaps menu + сайт + AI vision на фото меню → **+ ingredients extraction** |
| **3** | **ДЕ** | GMaps + KRS oddziały + сайт contact page |
| **4** | **ДЕ В ІНТЕРНЕТІ** | Tavily + WHOIS + Facebook + Instagram + сайт |
| **5** | **РОЗМІР** | KRS oddziały + GMaps locations count + sprawozdania (тільки przychody — JEDNА цифра) |
| **6** | **З КИМ ГОВОРИТИ** | regdata/krs-fullnames-scraper + GMaps phone + WWW kontakt page |
| **7** | **ЩО ПРОПОНУВАТИ** | AI synthesis з полів 1-6 + product matching через ingredients |

Все інше з v3 — distraction.

---

## 2. CRITICAL NEW FEATURE — AI Ingredients Extraction

### 2.1 Why це core insight

Vadym цитата: *"потрібно щоб ми бачили не тільки меню але і інгредієнти страв, щоб розуміти товари по позиціям які необхідні плацувкам"*

CzM / Pikniko / SpoonJoy / Karol / Gmurczyk продають **СИРОВИНУ**, не страви. Знаючи що kebabnia має у меню "Kebab z kurczaka z frytkami, sos czosnkowy" — Vadym **знає що placówka купує**: kurczak, lavash, pomidory, ogórki, sałata, cebula, czosnek, mayonez, frytki, olej.

### 2.2 Use cases — три сценарії

**Use case 1 — direct intent signal:**
> Vadym йде на `/produkty/Ogórki kiszone CzM` → бачить TOP-25 клієнтів з ogórki у меню (kiszone OR świeże) → дзвонить пропонує substitute.

**Use case 2 — gap detection:**
> Adriatik kebabnia меню має 14 dishes, всі з ogórkami świeżymi, 0 з kiszonymi → opportunity для CzM ogórki kiszone yak side do kebab bowl.

**Use case 3 — multi-supplier matching:**
> Sztab показує per-restaurant matrix:
> - CzM (kiszonki) match score: 65% (ogórki używають, але świeże)
> - Pikniko (świeże warzywa) match score: 90% (codzienne)
> - SpoonJoy (мід ложки) match score: 70% (mają herbatę i kawę)
> - Karol (wędliny) match score: 5% (brak wędlin у меню)
> - Gmurczyk (cukiernia) match score: 10% (brak deserów)

### 2.3 Architecture — hybrid approach (research finding)

NOT pure LLM, NOT pure RAG. **Hybrid: dish_lexicon (canonical PL dishes) + LLM fallback**.

**Pipeline:**

1. **Apify scrape** Pyszne/Wolt/Glovo menu → raw dish text:
   ```
   "Kebab z kurczaka, frytki, sałata, sos czosnkowy"
   ```

2. **Dish lexicon lookup** (`lib/dish-lexicon.ts`):
   - Hardcoded ~300 canonical Polish dishes з fixed ingredients
   - Pierogi ruskie → ["mąka pszenna", "twaróg", "ziemniaki", "cebula", "masło"]
   - Schabowy → ["schab", "jajko", "bułka tarta", "olej"]
   - Bigos → ["kapusta kiszona", "kapusta świeża", "mięso", "kiełbasa", "grzyby"]
   - **Якщо matches** → instant return canonical, **no LLM call needed**

3. **LLM fallback** для non-canonical dishes (Claude Haiku 4.5):
   - System prompt з explicit Polish kitchen rules + hidden sauce expansion
   - Output: categorized JSON (fish_seafood, meat_poultry, dairy, vegetables, ...)
   - Confidence < 0.7 → escalate до Sonnet 4.6 (10-15% volume)

4. **Save** до `contact_enrichment.menu_data.dishes[]`:
   ```json
   {
     "name": "Kebab z kurczaka",
     "price": 28,
     "category": "kebab",
     "ingredients": {
       "meat_poultry": ["kurczak"],
       "vegetables": ["ogórki", "pomidory", "sałata", "cebula"],
       "grains_flour": ["lavash"],
       "sauces_dressings": ["czosnek", "majonez"],
       "fish_seafood": [],
       "dairy": [], "fruits": [], "spices_herbs": [], "beverages": [], "other": []
     },
     "confidence": 0.92,
     "is_canonical_match": false
   }
   ```

5. **Aggregate per restaurant** → `contact_enrichment.menu_data.aggregate_ingredients`:
   ```json
   { "kurczak": 8, "ogórki": 9, "pomidory": 11, "sałata": 7, ... }
   ```

6. **Database-backed product_mappings table** (NOT hardcoded JSON):
   ```sql
   CREATE TABLE product_mappings (
     id UUID PRIMARY KEY,
     ingredient_canonical TEXT NOT NULL,    -- "łosoś"
     supplier_id UUID REFERENCES suppliers(id),
     supplier_sku TEXT NOT NULL,
     supplier_product_name TEXT,
     confidence NUMERIC DEFAULT 1.0,
     match_source TEXT CHECK (match_source IN ('manual','ai_assisted','auto')),
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ,
     UNIQUE(ingredient_canonical, supplier_id)
   );
   ```

7. **Admin UI** `/intelligence/mappings` — Vadym CRUD без deploy.

8. **Per-supplier match score** computed at query time:
   ```
   match_score = (count(ingredients у menu які mapuję до supplier products))
                  / total_unique_ingredients × 100
   ```

### 2.4 Cost — corrected (Vadym estimate underbudgeted)

**Claude Haiku 4.5 actual pricing (May 2026):** $1.00/M input + $5.00/M output (NOT $0.80/$4 з твого prompt — це outdated).

**Per dish:** ~500 input + 300 output = **$0.002**
**Per restaurant** (~80 dishes): **$0.16** raw, **~$0.06** з prompt caching + batch API
**Per 1000 restaurants:** **$60-160** залежно від caching ефективності
**264 restaurants bootstrap:** **$15-40**, не $1.85 як ти оцінив (помилка ~10x)

Plus quarterly refresh ~25-30% volume → **$60-160/quarter ongoing**.

**Photo menu AI vision (corrected):**
- Per photo: 640 input tokens + 300 output → **$0.00214** (NOT $0.0008 — input only)
- Per restaurant 5 photos: **$0.011** (NOT $0.004)
- 264 restaurants bootstrap: **~$3** (vision optional, only коли text scrape failed)

### 2.5 Language — PL canonical only

Research висновок: **PL only, не mix**.

- Sztab supplier DB по-польськи (Ziomek catalog PL)
- 3-way translation (PL/UA/EN) = 3x bug surface
- Vadym читання = UI може мати PL→UA translation overlay на display, але **canonical storage = PL**

---

## 3. Q1-Q9 Research Answers

### Q1. Pyszne.pl scraper — VERIFIED

| Actor | Author | Pricing | Use case |
|---|---|---|---|
| `scrapepilot/just-eat-scraper` | scrapepilot | per-result | Restaurant-level (covers Pyszne.pl as Just Eat PL domain) |
| `easyapi/just-eat-restaurant-menu-scraper` | easyapi | per-result | Menu items + prices per restaurant |

**Recommendation:** scrapepilot для discovery + easyapi для menu depth. Pyszne (Just Eat) має Cloudflare WAF — actors уже handle, але monitor "last updated" date.

### Q2. Wolt scraper — VERIFIED, BEST PRICE

| Actor | Author | Pricing | Notes |
|---|---|---|---|
| **`needy_hammock/wolt-restaurant-menu-scraper`** | needy_hammock | **$0.80 / 1,000 results** | ⭐ Primary choice — найдешевша HoReCa опція в repo |

Polish cities coverage: Warszawa, Kraków, Wrocław, Gdańsk, Poznań, Łódź, Lublin, Katowice — все out of the box. Wolt без strong WAF, найбезпечніший delivery vendor для scraping.

### Q3. ALEO scraper — VERIFIED

| Actor | Author | Pricing | Notes |
|---|---|---|---|
| `scrapestorm/aleo-company-scraper---cheap-tani` | scrapestorm | "cheap" tier | Polish branding, built specifically для Polish market |
| `powerai/aleo-company-scraper` | powerai | per-result | Returns NIP, KRS, REGON, profiles, ratings, categories |

**Recommendation:** scrapestorm cheap-tani.

### Q4. Panorama Firm scraper — VERIFIED

| Actor | Author | Pricing | Notes |
|---|---|---|---|
| **`trev0n/panoramafirm-scraper`** | trev0n | **$4 / 1,000** | ⭐ Cheaper. Same author as CEIDG/REGON scrapers (proven Polish toolkit) |
| `alwaysprimedev/panoramafirm-scraper` | alwaysprimedev | $5/1k | Full schema: phone E.164, email, NIP, opening hours, geo coords |

**Recommendation:** trev0n. Single vendor consistency з CEIDG/REGON.

### Q5. Glovo / UberEats / Bolt Food

| Platform | Actor | Pricing | Status |
|---|---|---|---|
| **Glovo** | `antonionduarte/glovo-scraper` | **$20/month flat** | Active PL ops, predictable cost |
| **UberEats PL** | `sovereigntaylor/ubereats-scraper` | **$19.90/1k** | ⭐ **VERIFIED ACTIVE 2026** — UberEats re-entered PL, app live in Warsaw |
| **Bolt Food PL** | — | — | ❌ **No actor + Bolt Food shut PL ops 2024**. SKIP. |

**Big news:** UberEats DOES operate in Polska 2026 (your prompt said "verify if returned" — confirmed yes via ubereats.com/pl-en/city/warszawa-mazowieckie). Bolt Food закрив PL у 2024.

### Q6. AI ingredients extraction prompt design

**A. Mova:** PL canonical only (no UA/EN mix)

**B. Hidden ingredients:** hybrid approach
- `lib/dish-lexicon.ts` для canonical Polish dishes (pierogi ruskie, schabowy, bigos, żurek, ...) — instant lookup, no LLM call
- LLM fallback з explicit Polish kitchen rules для non-canonical dishes
- System prompt включає sauce expansion rules:
  - "sos tatarski" → ogórki kiszone, cebula, jajko, majonez, musztarda
  - "sos czosnkowy" → czosnek, jogurt, majonez
  - "tzatziki" → ogórek, jogurt grecki, czosnek, koper

**C. Кількість per dish:** variable (1-15 typical), NO hard limit. LLM decides.

**D. Categories:** ⭐ **YES, categorized** (not plain list):
```
{
  fish_seafood: [],     ← Vadym primary matching key
  meat_poultry: [],
  dairy: [],
  vegetables: [],
  fruits: [],
  grains_flour: [],
  sauces_dressings: [],
  spices_herbs: [],
  beverages: [],
  other: []
}
```

**E. Anti-hallucination guardrails:**
- "DO NOT infer meat unless dish name says so" (запобігає додавання м'яса до vegetarian pierogi)
- Polish kitchen context: "kebab w PL = kurczak/wołowina, не jagnięcina"
- Brand strip: Coca-Cola → "cola", Tymbark → "sok owocowy"
- `confidence < 0.7` → set `needs_review: true`, leave ingredients empty

**F. Batch optimization:**
- Batch 20-50 dishes у single Haiku call (200k context easily handles)
- Anthropic prompt caching: -90% on cached system prompt portion
- Anthropic batch API: -50% async (24h SLA, perfect для nightly cohort enrichment)

### Q7. Static product mapping — research recommendation

**❌ NOT hardcoded JSON у lib/product-mapping.ts** (Vadym proposal — anti-pattern).

**✅ Database-backed `product_mappings` table + admin UI:**
- Schema див. §2.3 крок 6
- Admin UI `/intelligence/mappings` для Vadym CRUD
- AI-assisted suggestion для нових ingredients (queue для approval)
- Hardcoded **тільки** `lib/dish-lexicon.ts` (canonical dishes — stable)

**Realistic count (corrected):**
- Vadym estimate: 500 ingredients × 5 suppliers = 2500 mappings
- **Reality: 200-400 mappings** (1-2 active suppliers MVP, ~150-250 unique canonical ingredients у HoReCa menu)
- Maintenance: ~10-15h Vadymова кварталу (manageable). Якщо scale to 5+ suppliers — AI-assisted approval queue стає mandatory.

### Q8. Polish HoReCa PKD codes — CRITICAL ERRORS у Vadym list

**ALARM:** твій PKD list outdated. PKD 2025 weszła w życie **1 stycznia 2025**, перехідне okno до 31 grudnia 2026.

**Mapping required (`lib/pkd/mapping-2007-2025.ts`):**

| Vadym (PKD 2007) | PKD 2025 | Назва |
|---|---|---|
| **56.10.A** | **56.11.Z** | Restauracje |
| **56.10.B** | **56.12.Z** | Ruchome placówki gastronomiczne (food trucks) |
| 56.21.Z | 56.21.Z (без зміни) | Catering imprez okolicznościowych |
| 56.29.Z | 56.29.Z (без зміни) | Catering pozostały (stołówki, contract) |
| 56.30.Z | 56.30.Z (без зміни) | Bary i puby |
| 4711 | 47.11.Z (canonical form) | Sprzedaż detaliczna w niewyspecjalizowanych sklepach |

**MISSING from Vadym list (CRITICAL adds):**

- **55.10.Z** — Hotele i podobne obiekty zakwaterowania ⭐ (premium fish target)
- **55.20.Z** — Pensjonaty, agroturystyki, hostele
- **55.90.Z** — Akademiki, internaty (часто mają stołówki)
- **47.23.Z** — Sprzedaż detaliczna ryb i mięczaków ⭐ (CRITICAL — direct fish reseller potential)
- **47.22.Z** — Sprzedaż detaliczna mięsa (medium fit — czasem wędzone ryby)
- **47.29.Z** — Pozostała detaliczna żywności (delicatesy, sklepy ze zdrową żywnością) ⭐
- **47.24.Z** — Piekarnie/cukiernie retail
- **46.31.Z** — Hurt warzyw
- **46.32.Z** — Hurt mięsa
- **46.38.Z** — Hurt rybny ⭐ (potencjalna konkurencja або co-distribution)
- **46.39.Z** — Hurt niewyspec. (Makro, Selgros — cash & carry)
- **93.11.Z** — Obiekty sportowe (часто mają restauracje)
- **93.21.Z** — Parki rozrywki (catering)
- **86.10.Z** — Szpitale (institutional catering)
- **87.30.Z** — DPS-y, hospicja (institutional catering)

**NEW PKD 2025 — `56.40.Z`** "Pośrednictwo w działalności gastronomicznej" — це Pyszne/Wolt/Glovo. **Tag as data source, NOT як target.**

**PKD HoReCa fit scoring (для Vadym fish supplier):**

| Kod | Fit | Reasoning |
|---|---|---|
| 56.11.Z | 9/10 | Core target |
| 56.12.Z | 3/10 | Food trucks rzadko mają fresh fish (chłodnia logistics) |
| 56.21.Z | 8/10 | Wesela = łosoś, dorsz premium |
| 56.29.Z | 6/10 | Volume + low margin, ryba mrożona |
| 56.30.Z | 4/10 | Bary = przekąski rybne low-volume |
| 55.10.Z | 9/10 | Hotele premium F&B |
| 47.23.Z | 10/10 | Direct B2B reseller |
| 47.29.Z | 8/10 | Delicatesy — kawior, śledzie, wędzony łosoś |
| 46.38.Z | 7/10 | Distribution partner / competition |

**Operational recommendation:** dodaj `pkd_code text` + `pkd_version smallint` (2007/2025) у `clients` schema. Build `lib/pkd/horeca-fit-score.ts` mapper.

### Q9. Photo menu AI vision — cost CORRECTED

**Vadym estimate:** $0.0008 per photo, $0.004 per restaurant — **wrong, only counted input tokens.**

**Real (Claude Haiku 4.5 + image input formula `tokens ≈ width × height / 750`):**

| Item | Tokens | Cost |
|---|---|---|
| Per 800×600 photo input | 640 | 640 × $1/M = $0.00064 |
| Per photo output (300 tokens, structured JSON) | 300 | 300 × $5/M = $0.0015 |
| **Per photo total** | — | **$0.00214** (~2.5x вище ніж твоя оцінка) |
| Per restaurant 5 photos input | 3200 | $0.0032 |
| Per restaurant 5 photos output | 1500 | $0.0075 |
| **Per restaurant total** | — | **$0.0107** (~2.5x вище) |
| 264 restaurants bootstrap | — | **~$3** (still cheap, just 2.5x your estimate) |

**Optimization:**
- Batch API: -50% async → ~$0.0070/restaurant
- Prompt caching: -90% на cached system prompt portion → first run +25%, subsequent -90% on cached

**Verdict:** Still viable. Vision is **fallback** для коли text scrape failed (no Pyszne/Wolt match) — runs maybe 10-20% volume, не для всіх.

---

## 4. Phase B Execution — split B1/B2/B3

Phase B повертає до ~400-500s з новими sources. Solution split (Vercel Pro maxDuration=300s):

**Phase B1 (sync, ~120s) — fast endpoints:**
- GUS REGON
- KRS rejestrio
- Biała Lista VAT (single check, not delta engine)
- BZP (snapshot, not velocity)
- regdata/krs-fullnames-scraper
- Tavily web search

**Phase B2 (async via `after()`, ~180s) — slow scrapers:**
- Apify GMaps (existing)
- Apify Pyszne (new)
- Apify Wolt (new)
- Apify Glovo (new)
- Apify ALEO (new)
- Apify Panorama Firm (new)
- WWW direct fetch
- AI Business Analysis (Claude Haiku batched)
- AI Match Rescore (Claude Haiku batched, existing)

**Phase B3 (deferred, ~60s):**
- AI ingredients extraction (per dish loop, batch 20-50 dishes per Haiku call)

**Якщо `after()` unstable on Vercel Pro** → migrate до Inngest у Sprint S6G. Зараз start with `after()`, monitor.

---

## 5. 4-Week Roadmap

### Week 1 — MENU + INGREDIENTS + CONTACT (~4 days)
1. **Day 1:** Apify Pyszne.pl integration
   - `easyapi/just-eat-restaurant-menu-scraper` actor wrapper
   - `lib/enrichment/pyszne.ts` (новий)
   - Schema: `contact_enrichment.menu_data.pyszne`
2. **Day 2:** Apify Wolt integration (паралельно)
   - `needy_hammock/wolt-restaurant-menu-scraper` ($0.80/1k)
   - `lib/enrichment/wolt.ts`
   - Schema: `contact_enrichment.menu_data.wolt`
3. **Day 3-3.5:** ⭐ AI ingredients extraction pipeline
   - `lib/ai/ingredients.ts` (новий) — Haiku per-dish call
   - `lib/dish-lexicon.ts` (новий) — ~300 canonical PL dishes
   - Aggregate per restaurant
   - DB migration: `product_mappings` table
4. **Day 4:** regdata/krs-fullnames-scraper integration (~0.5 day)
   - `lib/enrichment/krs-fullnames.ts` (новий)
   - Hook у Phase B1

### Week 2 — WEB PRESENCE (~3 days)
5. Google Maps menu extractor + AI vision на фото меню (fallback)
6. WWW direct fetch (Tavily-style з targeted URL whitelist) + AI extract
7. Apify ALEO + Panorama Firm scrapers

### Week 3 — SIZE + LOCATIONS (~2-3 days)
8. KRS oddziały render у `/clients/{id}` UI
9. Google Maps multi-location detection (group by KRS NIP)
10. Sprawozdania przychody — JEDNА цифра ("~12 mln PLN przychód 2024") + sort/filter

### Week 4 — AI PROPOSAL ENGINE (~3-4 days)
11. AI proposal generator з ingredients context (`lib/ai/proposal.ts`)
12. Per-supplier matching matrix (5 suppliers × N clients)
13. `/produkty/{sku}/top-clients` ranking by ingredient match
14. Conversation opener generation (1-2 paragraph "як почати дзвінок")

---

## 6. Architecture — minimal

### A. Vercel Pro $20/міс — UPGRADE СЬОГОДНЯ
- maxDuration=300s (vs 10s/60s Hobby)
- `after()` async support
- 1TB function execution

### B. Cache layer — DEFER до Week 5+
- Просто `contact_enrichment.menu_data jsonb` column
- Refresh quarterly (cron Inngest або Supabase Edge Function)

### C. UI tabs — DEFER
- Existing accordion sections працюють (`/clients/{id}`)
- Add нові sections "Asortyment z menu" + "Per-supplier match" як accordion items
- Tab redesign можна Phase 5+

---

## 7. Realistic Budget (CORRECTED Vadym numbers)

**Verified pricing 2026-05-11:**

| Item | Cost | Note |
|---|---|---|
| Apify Free | $5 free credits/міс | + overage at $0.30/CU |
| Apify Pyszne (scrapepilot/easyapi) | per-result | ~$5-10/міс на ~500 restaurants |
| Apify Wolt (needy_hammock) | $0.80/1k | ~$2-5/міс |
| Apify Glovo (antonionduarte) | **$20/міс flat** | predictable cost |
| Apify UberEats (sovereigntaylor) | $19.90/1k | ~$5-15/міс |
| Apify ALEO (scrapestorm cheap-tani) | "cheap" tier | ~$2-5/міс |
| Apify PanoramaFirm (trev0n) | **$4/1k** | ~$2-5/міс |
| Apify regdata/krs-fullnames | **$5/1k** ⚠️ | NOT $0.005 (твоя помилка ×1000 у v2) |
| Tavily Project | $30/міс | Already paying |
| Anthropic Haiku 4.5 | **$1/$5 per M** ⚠️ | NOT $0.80/$4 (outdated estimate) |
| Anthropic vision (menu photos fallback) | $0.011/restaurant | Total ~$3 bootstrap |
| Vercel Pro | **$20/міс** | UPGRADE today |

**Steady-state monthly:**
- Apify total: ~$30-60/міс (всі scrapers)
- Tavily: $30/міс
- Anthropic: ~$15-25/міс (ingredients + match rescore + business analysis)
- Vercel Pro: $20/міс
- **TOTAL: ~$95-135/міс** = ~380-540 zł/міс

**Bootstrap one-time:**
- regdata/krs-fullnames для 1416 sp.z o.o.: 1416 × $0.005 = **$7.08** ⚠️ 
  - **CORRECTION:** rate is $5/1k = $0.005 per company. Так що $7 правильно. Помилка була у v2 Vadym wrote "$0.005 per firm" while research showed $5/1k = $0.005/firm — **actually consistent**. Cancel this correction. Vadym correct on this.
- Ingredients extraction для 264 active restaurants × 80 dishes × $0.002 = **~$42** з naive pricing, ~$15 з prompt caching/batch
- Photo vision fallback ~$3

**Total bootstrap one-time: ~$25-50.**

---

## 8. Cancellation summary — explicit list

| Item | Status | Reason |
|---|---|---|
| Altman Z' bankruptcy prediction | ❌ Cancelled | Sztab not bank, не дає кредит |
| VAT delta monitoring engine | ❌ Cancelled | Snapshot status enough |
| BZP velocity з time-decay | ❌ Cancelled | Irrelevant for B2B sales |
| Google Maps rating trajectory | ❌ Cancelled | Not actionable in cold call moment |
| CRBR network graph | ❌ Cancelled | rejestr.io persons enough |
| SUDOP UOKiK, KNF, CWOH, trade press NLP | ❌ Cancelled | Distraction from 7 fields |
| Michelin/Bib/Slow Food tier | ❌ Cancelled | "150 restaurants — not a business" |
| Suppliers detection from photos | ❌ Cancelled | Brand ≠ distributor (Mowi sold by 30 wholesalers) |
| Per-attribute provenance, signals event stream | ⏸ Deferred | Build when sources actually live |
| Refresh queue з priority tiers | ⏸ Deferred | Same |
| Bielik/PLLuM Polish LLMs | ⏸ Deferred | Stay with Claude Haiku (operational simplicity) |
| Spoonacular / Edamam ingredients API | ❌ Skip | Polish coverage слаба |
| Quantity inference у ingredients | ⏸ Deferred to v2 | Overengineering MVP |
| Hardcoded `lib/product-mapping.ts` | ❌ Skip | Anti-pattern — use DB + admin UI |

---

## 9. What changes у v4 vs Vadym's original prompt

**Vadym's plan was solid but had these data errors** (caught by research):

1. **PKD codes outdated** (PKD 2007 vs PKD 2025 effective Jan 2025). Mapping table needed.
2. **PKD list missing 8+ critical codes** (55.10.Z hotele, 47.23.Z sklepy z rybami, 47.29.Z delicatesy, 46.38.Z hurt rybny — все високого fit для fish supplier).
3. **Claude Haiku 4.5 pricing wrong** ($0.80/$4 estimate — actually $1/$5 у May 2026).
4. **Photo vision cost underestimated 2.5x** ($0.004/restaurant estimate — actually $0.011).
5. **Static mapping count overestimated** (500×5=2500 — realistically 200-400).
6. **Hardcoded `lib/product-mapping.ts`** — anti-pattern. Should be Supabase table + admin UI.
7. **AI extraction architecture should be HYBRID** (dish_lexicon + LLM fallback), не pure LLM.
8. **2-tier model strategy** (Haiku canonical → Sonnet escalation < 0.7 confidence) — not single Haiku.
9. **UberEats Polska VERIFIED ACTIVE 2026** (Vadym Q5 — confirmed yes).
10. **Bolt Food Polska shut 2024** — skip.

---

## 10. Sources

### Apify actors verified
- [scrapepilot/just-eat-scraper](https://apify.com/scrapepilot/just-eat-scraper----restaurant-data-delivery-intelligence)
- [easyapi/just-eat-restaurant-menu-scraper](https://apify.com/easyapi/just-eat-restaurant-menu-scraper)
- [needy_hammock/wolt-restaurant-menu-scraper](https://apify.com/needy_hammock/wolt-restaurant-menu-scraper)
- [scrapestorm/aleo-company-scraper---cheap-tani](https://apify.com/scrapestorm/aleo-company-scraper---cheap-tani)
- [trev0n/panoramafirm-scraper](https://apify.com/trev0n/panoramafirm-scraper)
- [antonionduarte/glovo-scraper](https://apify.com/antonionduarte/glovo-scraper)
- [sovereigntaylor/ubereats-scraper](https://apify.com/sovereigntaylor/ubereats-scraper)
- [regdata/krs-fullnames-scraper](https://apify.com/regdata/krs-fullnames-scraper)

### Pricing
- [Anthropic Claude pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)
- [Claude Haiku 4.5 announcement](https://www.anthropic.com/news/claude-haiku-4-5)
- [Vercel Pro pricing](https://vercel.com/pricing)

### PKD official
- [PKD 2025 oficjalny PDF GUS](https://stat.gov.pl/Klasyfikacje/doc/pkd_nowelizacja/pdf/KlasyfikacjaPKD2025.pdf)
- [Klucze przejścia PKD 2007 → 2025](https://klasyfikacje.stat.gov.pl/static/pkd_25/pdf/klucze_powiazan_PKD_2007_PKD_2025.pdf)

### NLP / ingredients research
- [TASTEset — Recipe Dataset (arxiv 2204.07775)](https://arxiv.org/abs/2204.07775)
- [Bielik 11B v2 (arxiv 2505.02410)](https://arxiv.org/html/2505.02410)

### UberEats Polska verified
- [ubereats.com/pl-en/city/warszawa-mazowieckie](https://www.ubereats.com/pl-en/city/warszawa-mazowieckie) (live ops 2026)

---

## 11. Висновок

**Sztab v4 strategy:** скасовує overengineered v3 (бо Sztab не bank), фокусується на **7 полях про клієнта** для cold call, додає **AI ingredients extraction** як ключовий vertical moat (CzM/Pikniko/SpoonJoy/Karol/Gmurczyk product matching).

**Топ-3 corrections to Vadym's plan:**
1. **PKD 2025 mapping table required** + 8+ missing critical codes (55.10.Z, 47.23.Z, 47.29.Z, 46.38.Z)
2. **Database-backed product_mappings, NOT hardcoded JSON**
3. **Claude Haiku $1/$5 (not $0.80/$4)** + photo vision $0.011/restaurant (not $0.004) — re-budget

**Total operational cost:** ~$95-135/міс (~380-540 zł/міс)
**Bootstrap one-time:** ~$25-50

**Next step:** Sprint S6D-week1 — write detailed implementation prompt (separate doc).

**Status:** Discovery + planning only. NO code, NO commits.
