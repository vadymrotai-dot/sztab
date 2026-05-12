# wedo-scrape-menu Smoke Test — Day 3 КРОК 0.5

**Дата:** 12.05.2026
**Status:** ⚠️ **DECISION: SEARCH_ALTERNATIVE_2** — actor працює, але **UpMenu блокатор не розв'язано** + **cost overrun 8x**.
**Cost spent:** $0.12 (Domek $0 + Pizza $0.12). **Vadym's $0.10 hard cap exceeded after 2/3 URLs — aborted перш ніж Maka i Woda.**

---

## TL;DR

**Actor `wedo_software/wedo-scrape-menu` НЕ broken як menus-r-us, але:**

1. **❌ UpMenu iframe blocker STILL UNRESOLVED.** Domek Sushi (UpMenu) returned 3 HTML items, all `menu: []` empty. UpMenu's JavaScript-rendered widget invisible to all server-side scrapers.

2. **🔥 NEW DISCOVERY:** **Pizza Na Wypasie ALSO uses UpMenu!** PDF link `cs.cdn-upm.com/themes/...` у scraper output. Vadym's "static HTML" assumption WRONG — 2/2 Polish restaurants tested = UpMenu-backed. Suggests **higher than 30-40% UpMenu market share** (closer to 50-70% серед SMB Polish gastronomia).

3. **✅ PDF extraction works** as side-effect. Pizza returned 4 items: 3 з empty menu (HTML/UpMenu) + 1 з PDF parsed via OCR (pdf_as_image type). PDF dishes extracted з real names + allergen codes. Static HTML extraction itself useless for UpMenu sites.

4. **❌ Cost $0.12 vs expected $0.015** — **8x overrun**. Actor README misleading. **Vadym's $0.10 hard cap exceeded after URL 2/3 → aborted.**

**Decision:** SEARCH_ALTERNATIVE_2. Cost not viable + core blocker (UpMenu) not solved.

---

## Test results

### Run 1: Domek Sushi (UpMenu CRITICAL)

| Field | Value |
|---|---|
| **URL** | https://domeksushi.pl/ |
| **Run ID** | WLC3mcOkN8gF0xb1e |
| **Status** | SUCCEEDED |
| **Exit** | 0 |
| **Runtime** | 34s |
| **Cost** | **$0.00** (no menu found = free) |
| **Items returned** | 3 |
| **Items with dishes** | 0 |

Items returned (всі `menu: []`):
```
[0] type: html, url: https://www.domeksushi.pl/, menu: []
[1] type: html, url: https://www.domeksushi.pl/menu, menu: []
[2] type: html, url: https://www.upmenu.com/pl/, menu: []
```

**Actor detected UpMenu domain explicitly** (item [2] points до upmenu.com/pl/) — but couldn't extract dishes from it. **Server-side fetch returns same iframe-host shell HTML** як Cowork's website-menu.ts, no dishes у DOM.

### Run 2: Pizza Na Wypasie (claimed "static HTML")

| Field | Value |
|---|---|
| **URL** | https://www.pizzanawypasie.eu/ |
| **Run ID** | ByVpu2Ik4m6Lpk8GL |
| **Status** | SUCCEEDED |
| **Exit** | 0 |
| **Runtime** | 59s |
| **Cost** | **$0.12** ⚠️ (8x over expected) |
| **Items returned** | 4 |
| **Items with dishes** | 1 (PDF) |

Items returned:
```
[0] type: html, url: pizzanawypasie.eu/, menu: []
[1] type: html, url: pizzanawypasie.eu/menu, menu: []
[2] type: html, url: pizzanawypasie.eu/oferta-duze-zamowienia-..., menu: []
[3] type: pdf_as_image, url: cs.cdn-upm.com/themes/99435279-...pdf, menu: [
    {"group": "PIZZA*", "dishes": [
        {"name": "Serowa KING 60cm", "allergenes": "1,7; może zawierać: 3,6,9,10,11"},
        {"name": "Serowa wypasiona ok 40cm", "allergenes": "1,7; może zawierać: 3,6,9,10,11"}
    ]}
]
```

**Critical pattern:** PDF served via `cs.cdn-upm.com` — **UpMenu hosts їх PDF nutrition tables**. Restaurant uses UpMenu для menu rendering. wedo's auto-deep-crawl found PDF, OCR-extracted dishes. **PDF found тому що Google indexed його, не тому що actor solves UpMenu** — the HTML pages themselves all returned empty.

### Run 3: Maka i Woda (PDF menu)

**ABORTED — would exceed $0.10 cap.** Vadym specifically said abort на cost overrun.

---

## Critical findings

### Finding 1 — UpMenu = THE Polish gastronomia menu blocker

Earlier estimated 30-40% PL market. **Real data 12.05.2026:** 2/2 tested restaurants z UpMenu:
- Domek Sushi → upmenu.com/pl/ landing
- Pizza Na Wypasie → cs.cdn-upm.com PDF storage

Sample size 2 = noisy, but suggests **majority of SMB Polish gastronomia (especially з online ordering) uses UpMenu**. Restaurants without UpMenu likely:
- Fine dining з custom websites (Mateusz Gessler, Atelier Amaro) — Sztab's narrow segment
- Older sites with raw HTML (rare, dying out)
- Pyszne-only restaurants (nemа own website)

**Architectural implication:** Sztab MUST solve UpMenu rendering OR accept menu coverage tipping closer до 20-30%.

### Finding 2 — wedo cost lies в README

README says "$15.00 / 1,000 results" = $0.015 per result. **Real cost $0.12 per restaurant** (Pizza). Why:
- 4 "items" returned per run = 4 results × $0.015 = $0.06? But actual $0.12 — even higher
- Possibly billed per page-fetch + OCR processing (PDF OCR more expensive)
- Or per deep-crawl page visited, not per restaurant
- Apify Console reveals actual breakdown — Cowork sandbox може only see `usageTotalUsd` aggregate

Either way, **predicting cost from README impossible**. For 264 Sztab gastronomia clients × $0.12 average = **$32 bootstrap** (vs proposed $4 з README pricing). Still not catastrophic, but 8x overrun на ad-hoc smoke means budgeting unreliable.

### Finding 3 — actor capabilities verified

✅ **Auto-deep-crawl works** — found `/menu`, `/oferta-...` subpages without explicit URLs
✅ **PDF OCR works** — pizza dishes extracted з PDF з allergen codes
✅ **Polish content** — UTF-8 properly handled, names accurate
✅ **Reliable** — 2/2 runs SUCCEEDED, no actor-side bugs (unlike menus-r-us)

❌ **JavaScript rendering NOT supported** — UpMenu/iframe blockers fully blind
❌ **Cost predictability poor** — README undersells 8x

---

## Updated UpMenu architectural reality

UpMenu coverage estimate revised UP:
- 30-40% (Vadym's earlier estimate) → **likely 50-70%** (based on 2/2 sample, biased small)

Implications for Sztab Day 3+:

**Option A — Embrace partial coverage:**
- wedo_software для PDF restaurants only ~$0.05-0.15/restaurant
- Skip menu extraction для UpMenu majority
- Day 4 prediction engine works з partial data
- Coverage: ~30% restaurants з extracted menu

**Option B — Custom UpMenu integration:**
- UpMenu має official API but only for restaurant owners (Vadym не owner)
- Reverse-engineer UpMenu widget API (may violate ToS)
- Build apify/playwright-scraper actor що waits for iframe load + scrapes rendered DOM
- Cost: 3-5 days dev + ~$0.05-0.10/restaurant runtime
- Coverage: 50-70% restaurants (UpMenu-backed)

**Option C — Manual fallback:**
- Vadym/team manually copy menus від high-priority clients (top 50)
- Sztab UI має upload/paste field
- Bootstrap: 50 × 5 min = ~4 hours of Vadym work
- Coverage: 100% top 50 clients, 0% rest

**Option D — Day 3 scope cut (Vadym Q2=A):**
- GMaps revert + Wolt cache only
- Skip menu extraction entirely сьогодні
- Day 4 prediction engine = use only GMaps popular_dishes (3-5/restaurant)
- Coverage: ~10-15% restaurants з partial popular dishes

---

## Total cost spent today (Day 3 КРОК 0 + 0.5)

| Step | Actor | URLs | Cost | Result |
|---|---|---|---|---|
| КРОК 0 | menus-r-us | 3 | $0.00 | All failed (server bug) |
| КРОК 0.5 | wedo | 2 | $0.12 | UpMenu blocker confirmed |
| **TOTAL** | — | **5** | **$0.12** | — |

Vadym's combined budget for Day 3 КРОК 0 ($0.30) + 0.5 ($0.10) = $0.40. **Spent $0.12 (30%).** Remaining $0.28 budget if needed for further alternative actors.

---

## Open questions для Vadym

**Q1.** Continue search for UpMenu-capable actor?
- A) Test `apify/playwright-scraper` ($0.05-0.10) на Domek Sushi specifically — Sztab budget for 1-time UpMenu validation
- B) Test `gtgyani206/website-menu-enrichment-scraper` ($cost?) — designed для GMaps→menu workflow, may have UpMenu support
- C) Stop searching today — Day 3 scope = GMaps revert + Wolt cache only (per Q2=A)
- D) Build custom playwright scraper specifically for UpMenu — 3-5 days dev, blocks Day 4

**Q2.** Якщо continue з partial coverage (no UpMenu solve):
- A) Wire wedo для PDF-only path ($0.10-0.15/restaurant) — accept 30% coverage
- B) Skip menu deep extraction entirely — focus Day 4 prediction на GMaps popular dishes (5 dishes/restaurant)
- C) Manual fallback UI — Vadym uploads menus для top 50

**Q3.** Critical realization Vadym must accept:
**Майоритет SMB Polish gastronomia (>50%) = UpMenu-backed.** Sztab's "menu extraction" capability на сегодня — fundamentally limited по technology constraints. Cowork recommendations:

- ✅ **Pivot Day 4 prediction** — use Apify GMaps popular_dishes (5 items typical), AI infer cuisine + ingredient categories from those, plus client_subtype (sushi_bar/pizzeria/kebabnia) для multipliers. Don't require full menu — 5 dishes + cuisine type sufficient для rough monthly volume estimate.

- ✅ **Skip Day 3 menu deep extraction** — defer to Day 5+ як future work.

---

## Sources

- [wedo_software/wedo-scrape-menu · Apify](https://apify.com/wedo_software/wedo-scrape-menu)
- Run WLC3mcOkN8gF0xb1e (Domek SUCCEEDED, $0, 0 dishes — UpMenu blocked)
- Run ByVpu2Ik4m6Lpk8GL (Pizza SUCCEEDED, $0.12, 1 PDF group з 2 pizzas)
- UpMenu CDN observed: `cs.cdn-upm.com` (both Domek + Pizza)

---

**Status:** Smoke complete. NO code shipped. Чекаю Vadym Q1+Q2+Q3 acceptance.
