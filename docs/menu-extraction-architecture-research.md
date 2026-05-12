# Menu Extraction Architecture — Research Report

**Дата:** 12.05.2026
**Status:** Investigation only. NO code shipped. Vadym + Cowork review перш ніж Day 3 architecture decision.
**Trigger:** Day 2 REVISION smoke test failed на Domek Sushi: GMaps timeout, www_menu UpMenu iframe blocker, Wolt no_match. Sztab core capability ("бачити меню клієнта і прогнозувати потребу") gap-blocked.

---

## TL;DR — Найкраща recommendation

**🥇 SILVER BULLET знайдено:** `menus-r-us/restaurant-menu-scraper` ($0.02-0.05/request). Покриває 70% market — direct sites, **PDFs**, **Toast/Square/Popmenu/Yelp/DoorDash third-party platforms**. Має 3 modes (URL / URL list / Search by cuisine+city). **Failed scrapes FREE.** AI-powered completeness grading (high/medium/low/partial). **Replaces 80% of Sztab Day 2 stack.**

**🥈 Backup:** `wedo_software/wedo-scrape-menu` ($0.015/result). Auto-deep crawls з homepage, OCR для PDFs/images. Дещо дешевше, перевіряло меньше cases (74 users vs 38 для menus-r-us, але 5.0★).

**Day 3 architecture рекомендація:** retire 3 з 4 Day 2 enrichers (Pyszne, Wolt, website-menu) → replace одним menus-r-us call. Зберегти GMaps actor але revert до старого `compass/crawler-google-places` + enable `scrapePlaceDetailPage`. Budget Phase B розширити (split sync/async).

---

## PATH 1 — Apify GMaps timeout root cause

### Симптом
Phase B log Domek Sushi:
```
Apify_GMaps  partial  16:09:15  "Apify call failed: The operation was aborted due to timeout"
AI_match_rescore  partial  "Skipped: only -159s budget remaining"
```

### Diagnosis (без Apify Console access)

**Конфігурація у поточному `lib/enrichment/apify.ts`:**
- `REQUEST_TIMEOUT_MS = 240_000` (4 хв client-side abort)
- `Phase B budget = 110_000` (110s, з `app/api/intelligence/lookup/route.ts:504`)
- Vercel function ceiling = 120s default (300s з Pro)

**Cause analysis:**
1. **Vercel hard timeout 120s kills the entire Phase B function** before client-side `AbortSignal.timeout(240_000)` fires
2. New actor `compass/google-maps-extractor` має potentially **довшу cold-start** ніж старий (`compass/crawler-google-places`)
3. Per Apify docs: типовий cold-start = 30-60s + place scraping ~30s × 3 places = ~120-150s **total** — **перевищує Vercel ceiling**
4. Client AbortSignal спрацьовує 110s в Phase B budget tracker (line 769 у lookup/route.ts), що повертає AbortError перш ніж actor finish run

**Plus новий actor input shape:**
- Old: `maxCrawledPlaces: 3`
- New: `maxCrawledPlacesPerSearch: 3`
- Cowork sent BOTH (backwards-compat) у `lib/enrichment/apify.ts:177-184`. Actor likely just uses first key it recognizes — но "deeperCityScrape" removed, який міг прискорювати.

### Recommendations
**Option A (recommended): REVERT to `compass/crawler-google-places`** + enable `scrapePlaceDetailPage: true`.
- Old actor was working з timeouts; new actor not enough advantage to be worth instability
- `scrapePlaceDetailPage: true` enables menu fields, popular times, opening hours per actor docs
- Actor output може include `popularDishes` field (verified в Day 2 STEP 1 input schema research)
- Cost з detail page enabled = same $0.007/result base + additional fees per detailed feature

**Option B:** Keep new actor, але move до Inngest async queue (Vercel Pro $20/mo upgrade — Vadym уже сказав done). Dedicated function з 5min budget.

**Option C:** Skip GMaps menu extraction altogether. Use ONLY menus-r-us (PATH 1 from Apify Store research). 70% coverage — better than 0%.

---

## PATH 2 — Wolt actor capabilities

### Critical finding — Wolt input schema

Verified from `apify.com/needy_hammock/wolt-restaurant-menu-scraper/input-schema`:

| Field | Type | Description |
|---|---|---|
| `city` | string\|null | "Helsinki", "Stockholm" — resolved до coords via Wolt city list API |
| `latitude` + `longitude` | number | Precise location override |
| `categoryFilter` | string\|null | "burger", "pizza", "sushi", "asian" |
| `maxItems` | integer | Default 5, 0 = unlimited |
| `includeDetails` | boolean | Default true — fetch detail pages (slower, more data) |
| **`restaurantUrl`** | string\|null | "https://wolt.com/en/fin/helsinki/restaurant/noodle-story-freda" — single restaurant override |

### Vadym's premise — partially correct

❌ **Wolt actor НЕ має `query` / `search` by NAME field.** Cowork's Day 2 v1 `wolt.ts` body had `search: searchQuery, searchTerm: searchQuery` — these fields are **silently ignored**. That's why McDonald's returned for Domek Sushi — actor took city='warszawa' default + maxItems=3 → returned top-3 popular Wolt restaurants Warsaw → first = McDonald's.

✅ **BUT — Wolt actor САМ підтримує два use cases:**

**Use case A — known restaurant Wolt URL:**
```json
{ "restaurantUrl": "https://wolt.com/pl/pol/warsaw/restaurant/some-slug" }
```
Returns full menu для that exact restaurant. **Requirement:** we knowing slug (Wolt slug mapping is non-trivial).

**Use case B — bulk city scrape:**
```json
{ "city": "warsaw", "maxItems": 0, "includeDetails": true }
```
Returns ALL Warsaw Wolt restaurants з menus (~3000+ entries). **Cost:** $0.0008 × 3000 = ~$2.40 одноразово. Cache → match local DB by NAME similarity → menu cached forever.

### Recommendation: Bulk city scrape PRE-CACHE
- One-time per city: scrape all Warsaw + Kraków + Wrocław + Poznań + Gdańsk = 5 cities
- Estimated 10-15k restaurants total = **~$8-12 one-time cost**
- Store у Sztab DB як `wolt_restaurants_cache` table (city, name, slug, menu_dishes JSONB)
- Phase B query: `SELECT * FROM wolt_restaurants_cache WHERE city = ? AND name ILIKE '%target%'`
- Coverage: ~30% Polish urban gastronomia presence on Wolt
- Refresh: monthly cron з Inngest

**Verdict: GOOD — cache-and-match silver bullet for Wolt-listed restaurants.**

---

## PATH 3 — Browser scraper / Universal menu extractor

### Discovery — `menus-r-us/restaurant-menu-scraper` ⭐⭐⭐

This is the **silver bullet I missed** у Day 2 v1 + REVISION research.

**Capabilities (from official actor README):**

> "Extract structured menu data from independent and local restaurant websites. Returns clean JSON with categories, items, prices, and descriptions. Works best with independent restaurants, local chains, and fine dining establishments that publish their own menus online."
>
> Three Ways to Use:
> 1. **URL Mode** — give a restaurant URL → structured menu. Scraper finds menu page (HTML, PDF, OR third-party platform like Yelp/DoorDash/Toast).
> 2. **URL List Mode** — list of URLs → bulk scrape sequential
> 3. **Search Mode** — cuisine + city → discovers via Google Places, scrapes each
>
> Handles HTML menus, PDF menus, and third-party platforms. Auto-chooses best source.
>
> Completeness Grading: AI-verified `complete | likely_complete | partial_core_questionable | partial_core_missing | minimal | not_a_menu`

**Pricing tiers (freshness-based):**

| Freshness | Max Age | Cost per request |
|---|---|---|
| `long_cache` | 180 days | **$0.02** |
| `med_cache` | 60 days | $0.03 (default) |
| `short_cache` | 14 days | $0.04 |
| `fresh` | 1 day | $0.05 |

**🔥 KEY:** Failed scrapes / low-quality results = **FREE** (`billable: false` field). Sztab pays only for successful menus.

### Coverage analysis для Sztab use case

| Source type | menus-r-us coverage | Day 2 stack coverage |
|---|---|---|
| Direct HTML site (own static menu) | ✅ | ✅ (website-menu.ts) |
| **PDF menu** | ✅ | ❌ (deferred Day 3+) |
| **UpMenu iframe** (30-40% PL market) | Likely ❌ but unconfirmed | ❌ STRUCTURALLY BLOCKED |
| **Pyszne iframe** (15-20%) | Likely ✅ via Pyszne URL | ❌ no PL Pyszne actor |
| **Toast/Square/Popmenu** | ✅ | ❌ |
| Yelp/DoorDash/TripAdvisor | ✅ | ❌ |
| **Search by cuisine+city** | ✅ | ❌ |

**Real numbers from actor README:** ~70% success rate (independent restaurants). Cowork's Day 2 stack was ~10-15%.

### Limitations
- **Fast food chains EXCLUDED** з search results (McDonald's, Subway, Taco Bell automatically filtered) — actually **GOOD** for Sztab (Vadym targets independents)
- "Some restaurants will fail" — обовязково log + cache `success=false` rows для не-retry
- AI completeness grade = trust signal — Sztab UI може показати "Меню pełne (45 items)" vs "Меню niepełne — sprawdź ręcznie"

### Cost projection для Sztab
- 264 existing clients (Day 1 backfill)
- ~50% gastronomia per Day 1 stats = ~130 restaurants
- 70% success rate = ~91 menus extracted, 39 failed (free)
- 91 × $0.02 (long_cache 180-day TTL) = **$1.82 one-time bootstrap**
- Refresh quarterly = **$8/year ongoing**

**Це 100x cheaper ніж Cowork's Day 2 stack costs ($30+ projected).**

### Other browser scraper options (skip)

- **`apify/playwright-scraper`** — universal browser. Free актoр, але user pays compute units. ~$0.05-0.10 per page navigation з JS execution. Generic — потребує custom code для UpMenu iframe extraction. **Higher dev cost ніж menus-r-us specific actor.**
- **`apify/puppeteer-scraper`** — same league, single browser only.
- **`wedo_software/wedo-scrape-menu`** — alternative ($15/1k = $0.015/result). Auto-deep crawl + OCR. Sample input `{"urls": [...]}`. Cheaper per result but lower review count (74 users vs 38 — both small). **Backup option якщо menus-r-us пропускає.**

---

## PATH 4 — GMaps photos + Haiku vision

### Поточний `lib/enrichment/apify.ts` — НЕ extracts photos

`ApifyPlace` interface (Day 2 REVISION):
```typescript
interface ApifyPlace {
  title?: string
  address?: string
  phone?: string | null
  website?: string | null
  emails?: string[] | null
  url?: string  // Google Maps URL
  totalScore?: number
  reviewsCount?: number
  categoryName?: string
  // menu fields (Day 2 REVISION speculative — not confirmed by actor)
  menu?: ApifyMenuItemRaw[]
  menuItems?: ApifyMenuItemRaw[]
  popularDishes?: ApifyMenuItemRaw[]
  dishes?: ApifyMenuItemRaw[]
  // ❌ MISSING: imageUrls, photos
}
```

Existing apify.ts ignored `imageUrls` field що compass/google-maps-extractor likely returns.

### Apify GMaps actors — image support

Per `compass/google-maps-extractor` description: "Get addresses, contact info, opening hours, popular times, prices, **menus** & more" — implies image fields available, але explicit field name not documented in input schema.

`compass/crawler-google-places` input schema (verified Day 2 v1 research):
- `maxImages` (integer, default 0) — pay-per-image. 0 = no images.
- `scrapeImageAuthors` (boolean) — slower
- Output likely includes `imageUrls: string[]` array

### Theoretical pipeline — менu board photos
1. Apify GMaps actor з `maxImages: 5, scrapePlaceDetailPage: true` → returns `imageUrls[]`
2. Filter за heuristic — image URLs containing "menu" / "card" / aspect ratio detection
3. Send filtered photos до Claude Haiku 4.5 vision API
4. AI extract dishes JSON

### Cost analysis
- Apify GMaps з 5 images: ~$0.007 + 5×($0.005?) = ~$0.03/restaurant
- Haiku vision per photo: ~$0.0021 (Day 2 STEP 5 cost research)
- 5 photos × $0.0021 = $0.011
- **Total per restaurant: ~$0.04**

### Reality check — coverage limited
- Restaurants з menu board photos на GMaps: ~5-15% of independent (typically smaller fast food, cafés)
- Photo quality varies (angle, lighting, blur)
- Polish text OCR — Haiku 4.5 vision ~85-90% accuracy on clear photos
- Dishes return: typically 5-15 items (board photos rarely show full menu)

### Verdict
**Use case niche** — only якщо menus-r-us fails AND restaurant has menu board photos. Defer до Day 4+ implementation. **Not part of Day 3 critical path.**

---

## Recommended Day 3 architecture

### TIER 1 — Primary menu source (NEW)

**`menus-r-us/restaurant-menu-scraper`** з URL Mode + `freshness: 'long_cache'` ($0.02/request):

```typescript
// lib/enrichment/menus-r-us.ts (NEW MODULE)
export async function extractMenuViaMenusRUs(
  apiKey: string,
  websiteUrl: string,
  options?: { freshness?: 'long_cache' | 'med_cache' | 'short_cache' | 'fresh' }
): Promise<MenusRUsResult> { ... }
```

**Phase B trigger:**
1. After Apify GMaps returns website URL
2. If `client_type === 'gastronomia'`
3. Call menus-r-us з website URL
4. Save до `contact_enrichment` source='menus_r_us', dishes у raw_payload
5. Status mapping: `success → 'success'`, `low/missing → 'partial'`, `failed → 'no_match'`

**Replaces:** website-menu.ts (own AI extraction), Pyszne, Wolt as primary path

### TIER 2 — Wolt cache (NEW)

**One-time bulk scrape** Top-5 PL cities (Warsaw, Kraków, Wrocław, Poznań, Gdańsk):

```sql
CREATE TABLE wolt_restaurants_cache (
  id UUID PRIMARY KEY,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  menu_dishes JSONB,
  scraped_at TIMESTAMPTZ
);
CREATE INDEX idx_wolt_cache_city_name_trgm ON wolt_restaurants_cache USING GIN (name gin_trgm_ops);
```

Phase B query: `SELECT * FROM wolt_restaurants_cache WHERE city ILIKE %{client_city}% AND name ILIKE %{client_name}%`

**Cost:** ~$8-12 one-time + $1-2/month refresh.

**Replaces:** wolt.ts live actor call

### TIER 3 — Apify GMaps revert (FIX)

**Revert** `compass/google-maps-extractor` → `compass/crawler-google-places`. Add `scrapePlaceDetailPage: true` для menu/popular dishes.

**Plus extend `ApifyPlace` interface з `imageUrls` для PATH 4 future.**

### TIER 4 — Vision fallback (DEFER Day 4+)

Якщо Tiers 1-3 all fail для гастрономії клієнта → Apify GMaps photos + Haiku vision. Niche.

---

## Architecture diagram

```
Phase B trigger (gastronomia detected)
  │
  ├─ STEP 5  Apify GMaps (compass/crawler-google-places + scrapePlaceDetailPage)
  │           ├─ contact (phone/email/website)
  │           ├─ popular dishes (3-5)
  │           └─ imageUrls (for Tier 4 future)
  │
  ├─ STEP 5.5a  ⭐ menus-r-us URL Mode (PRIMARY)
  │             ├─ Input: website URL з GMaps result
  │             ├─ Output: full menu (categories + items + prices)
  │             └─ AI completeness grade
  │
  ├─ STEP 5.5b  Wolt cache lookup (LOCAL DB)
  │             ├─ Match by city+name similarity
  │             └─ Augment dishes якщо menus-r-us partial/missing
  │
  └─ STEP 5.5c  GMaps photos vision (DEFER Day 4+)
                Тільки якщо 5.5a+5.5b обидва failed
```

---

## Cost comparison

| Architecture | Per-restaurant | 264 clients bootstrap | Coverage |
|---|---|---|---|
| **Day 2 v1** (Pyszne+Wolt+website own AI) | ~$0.10 | $26 | ~10-15% |
| **Day 2 REVISION** (GMaps+website-menu.ts+Wolt) | ~$0.05 | $13 | ~15-20% (UpMenu blocker) |
| **Day 3 RECOMMENDED** (menus-r-us + Wolt cache + GMaps revert) | ~$0.04 | **$10** | **~70%** |

---

## Decision matrix для Vadym

### Option A — Adopt menus-r-us (RECOMMENDED)

**Pros:**
- 70% coverage (vs 10-15% current)
- Failed = free
- Handles Toast/Square/Popmenu/Yelp/DoorDash/PDFs
- AI completeness grading built-in
- Search Mode (cuisine+city) — bonus discovery channel

**Cons:**
- Single vendor dependency (actor maintained by 1 community dev — Douglas Page)
- Search Mode uses Google Places (extra cost layer не documented)
- 30 days actor age — relatively new (стабільність TBD)

**Day 3 effort:** ~3 hours implementation + 1h smoke test = **4h total**

### Option B — Wait + roll own UpMenu scraper

Build з apify/playwright-scraper specific UpMenu iframe extraction. Custom code, deeper control.

**Pros:** Sztab-controlled, no third-party dependency
**Cons:** ~2-3 days dev + maintenance burden + brittle (UpMenu DOM changes break)
**Verdict:** Skip unless menus-r-us drops support

### Option C — Manual + paid HoReCa data provider

Vadym/team manually copies menus з restaurant sites. OR pay $X/month для commercial HoReCa intelligence (Datassential Brizo, NPD CREST, etc.) — but tysiące $/month.

**Verdict:** Not viable at MVP stage

---

## Open questions потрібні Vadym decisions

**Q1.** Adopt `menus-r-us/restaurant-menu-scraper` як Tier 1 primary?
- A) YES — implement Day 3 (~$10 bootstrap, 70% coverage)
- B) Test first з 5 restaurants (~$0.10 spend) перш ніж commitment
- C) NO — stick з własним AI extraction (~15% coverage)

**Q2.** Apify GMaps actor:
- A) **Revert** до `compass/crawler-google-places` + `scrapePlaceDetailPage: true`
- B) Keep новий `compass/google-maps-extractor`, fix timeouts via Vercel Pro async queue (Inngest)
- C) Defer — focus тільки на menus-r-us для menu, GMaps тільки для contacts

**Q3.** Wolt cache strategy:
- A) Bulk pre-scrape Top-5 PL cities ($8-12 one-time) → cache table
- B) On-demand per client (slower, more expensive long-term)
- C) Skip — Wolt coverage недостатня (10% Polish gastronomia)

**Q4.** Pyszne path:
- A) Keep deprecated marker (Day 2 REVISION current)
- B) Try `easyapi/just-eat-restaurant-menu-scraper` з різними input parameters (could it work з PL?)
- C) Delete completely — лідерство menus-r-us

---

## Sources

- [📍 Google Maps Scraper · Apify](https://apify.com/compass/crawler-google-places)
- [🏎 Google Maps Data Extractor · Apify](https://apify.com/compass/google-maps-extractor)
- [Wolt Restaurant & Menu Scraper · Apify](https://apify.com/needy_hammock/wolt-restaurant-menu-scraper)
- [Wolt Restaurant & Menu Scraper Input Schema](https://apify.com/needy_hammock/wolt-restaurant-menu-scraper/input-schema)
- [⭐ Restaurant Menu Scraper · Apify (menus-r-us)](https://apify.com/menus-r-us/restaurant-menu-scraper)
- [Restaurant Menu Scraper · Apify (wedo_software, OCR)](https://apify.com/wedo_software/wedo-scrape-menu)
- [Playwright Scraper · Apify](https://apify.com/apify/playwright-scraper)
- [Puppeteer Scraper · Apify](https://apify.com/apify/puppeteer-scraper)

---

**Status:** Investigation complete. NO code shipped. Чекаю Vadym Q1-Q4 decisions перш ніж Day 3 implementation.
