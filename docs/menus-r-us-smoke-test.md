# menus-r-us Actor Smoke Test — Day 3 КРОК 0

**Дата:** 12.05.2026
**Status:** ❌ **DECISION: SEARCH_ALTERNATIVE** — actor broken (внутрішній expired TLS cert).
**Cost spent:** **$0.00** (Apify failed-runs free policy verified).
**Vadym's budget $0.30 intact.**

---

## TL;DR

**Все 3 URL-и FAILED.** Не Polish-website issue, не Sztab integration bug. **Actor `menus-r-us/restaurant-menu-scraper` має expired TLS cert на своїй internal 3rd-party API endpoint** (likely Google Places resolver або Serper.dev fallback). Actor crash-нув на TLS handshake перш ніж навіть touch Polish websites.

**Recommendation:**
- Вважати ADOPT path для `menus-r-us` **NOT viable** на 12.05.2026
- Try alternative actor: `wedo_software/wedo-scrape-menu` ($0.015/result, OCR built-in, активний maintenance) OR
- Try alternative: `gtgyani206/website-menu-enrichment-scraper` (24 users, designed для GMaps→menu workflow exactly як Sztab)
- Якщо обидва alternatives fail → defer menu extraction до Day 4+, focus Day 3 на Wolt cache + GMaps revert

---

## Test results

### Setup
- **Actor:** `menus-r-us/restaurant-menu-scraper` (38 users, 5.0★)
- **Mode:** URL Mode з `freshness: 'med_cache'` (default)
- **Hard cap:** $0.30 (per Vadym Q1=B)
- **Test URLs (3):**
  1. https://domeksushi.pl/ + `location: Piaseczno, Poland` — UpMenu iframe (CRITICAL)
  2. https://www.pizzanawypasie.eu/ + `location: Warsaw, Poland` — Static HTML
  3. https://www.makaiwoda.pl/ + `location: Warsaw, Poland` — PDF menu

### Run results

| URL | HTTP | Duration | Cost | Status | Completeness |
|---|---|---|---|---|---|
| Domek Sushi | 400 (run-failed) | 3.0s | **$0.00** | FAILED | — |
| Pizza Na Wypasie | 400 (run-failed) | 2.4s | **$0.00** | FAILED | — |
| Maka i Woda | 400 (run-failed) | 3.5s | **$0.00** | FAILED | — |

**Total spent: $0.00** (failed runs are free per Apify business model — verified via `actor-runs/{id}` endpoint `usageTotalUsd: 0.00005`).

### Identical failure trace (всі 3 runs)

```
2026-05-10T17:11:41.398Z Scraping menu for: https://domeksushi.pl/
2026-05-10T17:11:41.400Z Freshness: med_cache (max_age_days: 60)
2026-05-10T17:11:41.401Z Location: Piaseczno, Poland
2026-05-10T17:11:41.401Z   Resolving Place ID: "domeksushi Piaseczno, Poland"
2026-05-10T17:11:41.515Z Could not resolve Google Place for https://domeksushi.pl/
2026-05-10T17:11:41.530Z ERROR fetch failed
2026-05-10T17:11:41.532Z       at handleUrlMode (/usr/src/app/src/main.js:215:22)
2026-05-10T17:11:41.535Z     CAUSE: certificate has expired
2026-05-10T17:11:41.536Z           at TLSSocket.onConnectSecure (node:_tls_wrap:1695:34)
```

---

## Root cause analysis

**Critical finding 1 — Polish websites SSL certs are VALID:**
```
domeksushi.pl    → Let's Encrypt R13 ✓
pizzanawypasie.eu → Let's Encrypt R12 ✓
makaiwoda.pl     → home.pl DV TLS G2 R35 CA ✓
All: verify return:1 (OpenSSL verified)
```

So expired cert is **NOT on Polish websites**.

**Critical finding 2 — Failure point у actor's main.js line 215** (`handleUrlMode`):
- Actor first tries to resolve Google Places API ("domeksushi Piaseczno, Poland")
- Google Places resolver returns no match (expected — actor bug, не PL-specific)
- Actor falls back до some other HTTP fetch (probably SerpAPI або Serper.dev)
- That fallback endpoint has expired SSL cert
- Process exits з code 91

**Critical finding 3 — Same error для всіх 3 URLs.** Repeatable, deterministic. Не intermittent. Actor is **fundamentally broken** at this date (12.05.2026).

### Why actor description over-promises
Per actor README, Sztab use case **should work**:
- "Three Ways to Use: URL Mode (default)... give it a restaurant URL and get back a structured menu"
- "Handles HTML menus, PDF menus, and third-party platforms"
- "~70% success rate"

But actor's actual code path:
1. Try Google Places lookup (US-centric default Miami,FL was first issue, fixed з explicit `location`)
2. Якщо Google Places fails → fallback fetch до broken endpoint
3. Crash

For Polish restaurants, Google Places API often **doesn't resolve** because:
- Polish names є transliterated inconsistently
- Restaurant addresses in Polish vs Latin-aware Google Places
- Smaller restaurants не індексовані Google Places API

So Polish use case **dependent on broken fallback path** → 100% fail rate at 12.05.2026.

---

## Cost verification (для skeptical Vadym)

```
Run V4O6vZfAcE2c5itBv (Domek):     usageTotalUsd: 0.00005  ($0.00005)
Run 6vVjE2xOn7BvTbLvG (Pizza):     usageTotalUsd: 0.00005
Run 5Pjd7PXJwuox4ibUY (Maka):      usageTotalUsd: 0.00005
Total real cost: $0.00015 ≈ $0.00
```

`menus-r-us` README: "**Failed extraction (site blocked, no menu found, etc.) → free**". **Verified true** на real failed runs.

---

## Decision: SEARCH_ALTERNATIVE

### Why NOT retry menus-r-us

- Bug is server-side (actor's container has expired cert у its dependencies)
- Author "Issues response: 46 days" — slow turnaround на bug reports (per actor stats)
- Even якщо fixed Polish coverage uncertain (Google Places resolver miss rate unknown)

### Recommended alternatives (in order)

**Alt 1 — `wedo_software/wedo-scrape-menu`** ($0.015/result):
- 67 users, recently updated (14 days ago)
- AI OCR built-in для PDF + image menus
- Auto-deep crawl з homepage (similar UX до menus-r-us URL Mode)
- README sample input simpler: `{"urls": ["https://restaurant.com"]}`
- Risk: меньше users (67 vs 38) means less battle-testing — but maintained

**Alt 2 — `gtgyani206/website-menu-enrichment-scraper`** (24 users):
- Description: "designed for Apify workflows that start with Google Maps or local business discovery and then enrich each restaurant record з website-only menu coverage"
- **Це exactly Sztab use case** (Apify_GMaps → website → menu enrichment)
- Risk: smaller actor, less proven

**Alt 3 — Build custom із `apify/playwright-scraper`** ($0.05-0.10/restaurant):
- Universal browser scraper, manual JS DOM extraction code
- Higher dev cost (3-4 days)
- Sztab-controlled, no third-party dependency
- **Defer** unless Alt 1+2 also fail

### Day 3 architecture revision (якщо Vadym approves)

```
Phase B (gastronomia):
  STEP 5    Apify GMaps (compass/crawler-google-places + scrapePlaceDetailPage)
            ├─ contact info
            └─ popular dishes (3-5 from Google profile)

  STEP 5.5a Apify alternative menu actor (NEW — pending Vadym selection)
            ├─ Try wedo_software OR gtgyani206
            └─ Smoke test 3 URLs ($0.045-0.05) перш ніж Phase B integration

  STEP 5.5b Wolt cache (lookup local DB)
            └─ Match by city+name, return cached menu якщо exists

  STEP 5.5c Pyszne/Glovo/UpMenu — DEFER Day 4+
            └─ No PL-specific actors known. Browser scraper expensive.
```

---

## Open questions Vadym

**Q1.** Test alternative actor `wedo_software/wedo-scrape-menu` ($0.015 × 3 = $0.045)?
- A) YES — same 3 URLs, retry pattern
- B) NO — defer menu extraction, focus Day 3 на GMaps revert + Wolt cache only
- C) Test `gtgyani206/website-menu-enrichment-scraper` instead (only 24 users — risk higher)

**Q2.** Якщо all alternatives fail today — Day 3 scope:
- A) Ship тільки GMaps revert + Wolt cache (skip menu extraction)
- B) Defer entire Day 3 — wait for menu actor solution
- C) Build custom playwright scraper (3-4 days dev cost, blocks Day 4 prediction engine)

---

## Sources

- [menus-r-us/restaurant-menu-scraper · Apify](https://apify.com/menus-r-us/restaurant-menu-scraper)
- [wedo_software/wedo-scrape-menu · Apify](https://apify.com/wedo_software/wedo-scrape-menu)
- [gtgyani206/website-menu-enrichment-scraper · Apify](https://apify.com/gtgyani206/website-menu-enrichment-scraper)
- Run V4O6vZfAcE2c5itBv (Domek failed) — [Apify Console link not surfaced via API]
- Run 6vVjE2xOn7BvTbLvG (Pizza failed)
- Run 5Pjd7PXJwuox4ibUY (Maka failed)

---

**Status:** Investigation complete. NO code shipped. Чекаю Vadym Q1+Q2 decisions.
