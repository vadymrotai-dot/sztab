# SZTAB — STATE OF PRODUCT (audit revised)

**Date:** 01.05.2026, 11:00 (REVISED після Audit #2)
**Audited by:** Claude (browser MCP, live + repo file structure)
**Method:** живий обхід sztab.vercel.app + ls app/api/ + ls app/(dashboard) pages
**Принцип:** жодного твердження з памяті. Тільки те що особисто побачено.

---

## EXECUTIVE SUMMARY (revised)

**Audit #1 (09:55) був неповний.** Я перевіряв тільки сторінки видимі в sidebar. Audit #2 (11:00) виявив **5 потужних сторінок прихованих в sidebar** — це не feature gaps, це NAVIGATION gap.

### Реальність (REVISED):

Sztab має значно більше функціональності ніж видно з sidebar. Бачимо тільки 7 пунктів (Dziś, Klienci, Sprzedaż, Produkty, Dostawcy, Organizer, Ustawienia), а реально працюють ще:

- /intelligence — AI Discovery (Fast Lookup + Deep Discovery)
- /intelligence/prospects — 99 prospekts з filtrами (sklep/restauracja/kawiarnia/multi/catering, score range, kontakt filter, closed chains filter)
- /intelligence/lookup — 6-source NIP lookup (GUS, GUS_branches, KRS, VAT_BL, matching, Apify_GMaps)
- /matches — 100 dopasowań global з bulk кнопками (L5 algo bulk, L6 AI bulk, Apify TOP-50, Export Pikniko CSV)
- /matches/review — review queue
- /handoff/pikniko — cohort 29 з повними cold openers, decision makers, kontakt info
- /admin/health — Apify spend monitoring + cron jobs status

### Главний інсайт

**Sztab вже працює як value-generating tool — Vadym просто не знає де знайти features бо вони сховані.** 

Sprint S5 = Navigation Fix, НЕ build new features. Це міняє roadmap кардинально.

---

## A. ВСІ СТОРІНКИ — ПОВНИЙ ІНВЕНТАР

### Видимі в sidebar (7):
| URL | Стан | Що робить |
|---|---|---|
| /pulpit/dzisiaj | OK | Dashboard з hot leadами + warningами + calendar |
| /clients | OK | 261 клієнт, фільтри, search, bulk select |
| /clients/[id] | OK | Профіль 8 акордеонів, повний enrichment |
| /clients/new | ? | Manual create (Sprint S1) |
| /clients/[id]/edit | ? | Edit page |
| /sprzedaz | OK | Kanban 7 етапів |
| /produkty | OK | 35 SKU під Czudowa Marka |
| /suppliers | OK | List + detail (Sprint S4 P5) |
| /suppliers/[id]/edit | ? | Edit supplier |
| /organizer | OK | Tasks/Goals/Habits/Calculator |
| /settings | OK | Ogólne / Ceny / Klucze API / Szablony |

### СХОВАНІ в sidebar (КРИТИЧНІ):
| URL | Стан | Що робить |
|---|---|---|
| /intelligence | OK | AI Discovery історія (Fast Lookup, Deep Discovery з timing) |
| /intelligence/lookup | OK | NIP input → 6-source enrichment результат |
| /intelligence/prospects | OK | 99 prospektів з фільтрами (МАГІЯ Sztab) |
| /intelligence/deep-discovery/[product_id] | ? | Деталі Deep Discovery результата |
| /matches | OK | 100 global dopasowań + bulk операції |
| /matches/review | ? | Review queue |
| /handoff/pikniko | OK | Cohort 29 з cold openers + контактами |
| /admin/health | OK | Apify spend + cron status |
| /persons/[id] | ? | Person profile |

### Дублікати / legacy:
| URL | Стан | Що робить |
|---|---|---|
| /dashboard | ? | Окрема старша сторінка (англ.) |
| /products | ? | Старий /produkty (англ.) |
| /products/new, /products/[id]/edit | ? | Старі views |
| /deals | ? | Старий /sprzedaz (англ.) |
| /deals/* | ? | Старі subviews |
| /tasks, /goals, /habits, /calculator | ? | Розклеєні /organizer subviews |
| /kp-generator | ? | Generator KP (там був) |

### 404 sidewy чи hallucination:
| URL | Реальність |
|---|---|
| /admin | 404 — немає index, є тільки /admin/health |
| /matches/global | НЕ ІСНУЄ — моя hallucination з минулих чатів |
| /dzis | 404 — старий URL, новий /pulpit/dzisiaj |

---

## B. /intelligence/prospects — TOWAR Vadym НЕ ЗНАВ

99 prospektів автоматично enriched. Кожен має:
- Nazwa + Właściciel + Miasto
- Kanał (sklep / restauracja / kawiarnia / multi / catering)
- Score (37-90)
- Kontakt (Y / N)
- Sieć detection (Żabka closed automatically tagged)

### Filtri:
- Score range slider (0-100)
- Branża buttons (sklep / restauracja / catering / kawiarnia / multi)
- Tylko z kontaktem toggle
- Ukryj closed chains toggle
- Pokaż wykluczone toggle
- Resetuj filtry

### Топ-3 prospekti:
1. DEKOB — THỊ HỒNG NHUNG NGUYỄN (Warszawa, restauracja, score 90)
2. PJ Rawa Gastro Yurii Nedilskyi (Pruszków, restauracja, score 68)
3. Mateusz Malczewski Cosmo (Warszawa, kawiarnia, score 62)

### Як вони туди потрапляють?
Скоріш за все CEIDG bulk seed scripts + cron-based enrichment з Apify Panorama Firm + GUS. **Але Vadym їх не бачить бо немає sidebar link!**

---

## C. /matches — ГЛОБАЛЬНИЙ MATCH ENGINE

100 dopasowań sortovaních DESC. Кожен match:
- Klient/Prospekt (ясно зазначено)
- Firma name + województwo + NIP
- Top match (продукт)
- Score (~85)
- Sygnał (PKD exact / aktywny_vat / aktywny_gus + інші)
- Kontakt phone якщо є

### Top-3:
1. Domek Sushi Przemysław Kowalski (klient) × Czudowa Marka, score 85, 1231562224
2. Karolina Przybytniak (klient) × Czudowa Marka, score 85, 5243020169, +48 504 125 279
3. LUCKY PING ZHAO (prospekt) × Czudowa Marka, score 85, +48 516 512 388

### Bulk кнопки на header:
- L5 algo bulk — re-run algorithmic matching
- L6 AI bulk — re-run AI re-score (TOP-20)
- Apify (TOP-50) — enrich top 50 з Apify
- Export Pikniko CSV — завантажити cohort

### Filtri header:
- Typ celu (Wszystko / Klient / Prospekt)
- Min score
- Limit
- tylko AI-rescored toggle
- Odśwież button

---

## D. /handoff/pikniko — COHORT 29 З COLD OPENERS

Cohort: "Pierwsza partia HoReCa kiszonki/buraki" (29.04.2026, 12:32:23)
- Liczność: 29
- Z kontaktem: 10/29
- Z osobą decyzyjną: 20/29
- Marynaty: 4 / Sałatki gotowe: 3 / Kiszonki: 22

### Filtri:
- Tylko z kontaktem toggle
- Rodzina filter (Kiszonki / Sałatki gotowe / Marynaty / Buraki)
- Sortowanie: rank (wyższy score wyżej)

### Що видно для кожної firmy:
- # ranking
- Firma · NIP · województwo
- Forma (prospect / client)
- Top match (продукт + категорія)
- Score (75-85)
- Sygnał (PKD exact)
- Kontakt (телефон + email якщо є)
- Decyzyjny (PESEL + посада)
- Cold opener — короткий персоналізований текст для outreach

### Export:
- CSV button
- Markdown button

### Топ-3 cold openers:
1. PING ZHAO (prospekt) — "Ping, zauważyłem że Lucky Ping Zhao to punkt z szybką rotacj…"
2. Radosław Żuchelkowski (RADEKZOOH) — "Radosław — twój asortyment w Józefowie to głównie artykuły d…"
3. KOZAK OLEK (Oleksii Ilchenko, PREZES) — "Widzę, że KOZAK OLEK to established player w handlu detalicz…"

---

## E. /intelligence/lookup — 6-SOURCE NIP LOOKUP

Ключова сторінка яку я виявив у Audit #1.

### Input:
- "Wpisz NIP firmy" (10 cyfr)
- Button "Uruchom intelligence lookup"

### Real-time pipeline:
"Pobieranie danych z 6 źródeł..." → результат:

| Źródło | Status |
|---|---|
| GUS | success |
| GUS_branches | 0 jednostek lokalnych |
| KRS | success (added/updated counts) |
| VAT_BL | success (VAT белая лента check) |
| matching | success (rerun product matching) |
| Apify_GMaps | async — продовжується після lookup, видно банер на /clients/[id] |

### Вихід:
- "Pól wypełniono: N, Osoby utworzone: M, Top matche: K"
- Top 3 matched продукти з score
- Кнопка "Otwórz profil firmy →"

### Bug:
- URL param `?nip=7561993172` НЕ pre-populates input field

---

## F. /admin/health — SYSTEM MONITORING

### Apify spend tracker:
- Soft limit: $10/тиждень
- Last 7 days: $1.36 (19 calls)
- Last 30 days: $1.36 (19 calls)
- TOP-5 most expensive enrichments (з NIP truncated, status, cost)

### Cron jobs status:
- matching-refresh: last run, success/fail, items processed, duration, metadata
- hygiene-scan: last run, items, clean/dirty/unchecked

---

## G. РЕЄСТРИ — REVISED INVENTORY

| Реєстр | API ключ | Endpoint | UI кнопка | End-to-end |
|---|---|---|---|---|
| CEIDG | ? | OK (Import CSV + bulk seed) | через /intelligence/prospects | OK (99 prospekts генеруються) |
| KRS rejestr.io | OK | OK | OK "Pobierz z KRS" + lookup | OK |
| GUS BIR2 | ? | OK | ні (через lookup) | OK |
| GUS_branches | ? | OK | ні (через lookup) | OK |
| CRBR | ? | OK | ні (auto на профілі) | OK |
| BZP | ? | через lookup | OK "Sprawdź BZP" → lookup | OK |
| VAT_BL | ? | OK | ні (через lookup) | OK |
| Apify Panorama | OK | OK | ні | OK (auto background) |
| Apify GMaps | OK | OK | ні (auto-trigger) | OK real-time |
| Apify Allegro | OK | OK scraper.ts | ні | OK verified |
| Allegro API | OK | OK /api/allegro/test | ні | /sale/categories тільки |
| Tavily /extract | НЕМАЄ ключа | НЕМАЄ | НЕМАЄ | НЕМАЄ |
| Google Places окремий | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ (через Apify_GMaps) |
| OpenFoodFacts | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ |
| LinkedIn DM | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ |
| KRD/BIG | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ (low priority) |

### App/api/ структура (зі ls):
- admin/ — admin endpoints
- ai/ — Gemini wrappers (Fast Lookup, Deep Discovery)
- allegro/ — Allegro client + scraper
- clients/ — CRUD + bulk operations
- contact-enrichment/ — single route.ts (для майбутнього Tavily?)
- cron/ — scheduled jobs (matching-refresh, hygiene-scan)
- enrichment/ — Apify Panorama орchestration
- export/ — Pikniko CSV exporter
- handoff/ — cohorts management
- intelligence/ — Discovery + Lookup endpoints
- lookup/ — окремий lookup endpoint
- matches/ — match operations
- nip-lookup/ — basic NIP lookup
- persons/ — person operations
- products/ — products CRUD
- prospects/ — prospekt operations (тут логіка що Vadym не знає!)
- taxonomy/ — PKD taxonomy

---

## H. РЕАЛЬНІ GAPS (post-discovery)

### Critical (блокують Vadym daily):
- NAVIGATION — sidebar НЕ показує /intelligence, /matches, /handoff/pikniko, /admin/health
- "Pobierz z KRS" в Sprawozdania — anchor only #krs-refresh, не working refresh
- ?nip= URL param на /intelligence/lookup НЕ pre-populates input
- Дублікати англ. routes (/dashboard, /products, /deals) — не очевидно що активне

### Quick wins (cosmetic):
- Sidebar grouping (Intelligence section)
- Active nav highlighting

### Real new features (відкладено):
- Tavily integration (contact-enrichment/route.ts є — empty?)
- LinkedIn DM scraper
- KRD/BIG (low priority)
- OpenFoodFacts

---

## I. ВИСНОВКИ

### Що Vadym ПРАВИЛЬНО ідентифікував на 30.04 ввечері:
- Він не бачить функціональності — РЕАЛЬНО Vadym НЕ БАЧИВ її, бо вона прихована від sidebar

### Що Vadym НЕПРАВИЛЬНО думав:
- "Bulk import нових клієнтів немає" — є 99 prospektів автоматично generated на /intelligence/prospects
- "Тонн інформації немає" — є 6-source enrichment + 100 matches + cohort 29 з cold openers

### Mind-shift:
**Sztab — це не "не shipped" продукт. Це "не findable" продукт.** Sprint S5 = unhide existing features через sidebar restructure, не build new features.

### Sprint S5 priority order:
1. **S5A — Sidebar Navigation** (~30-45 хв) — додати 5 пунктів, restructure
2. **S5B — Quick UX fixes** (~45 хв) — anchor button, ?nip= param, /admin index, dublicates
3. **S5C — Tavily contact enrichment** (~1.5h) — заповнити contact-enrichment/route.ts logic, додати key, UI button

---

## J. AUDIT TRAIL

Все вище — на основі:
- Live tab 1823348675 (sztab.vercel.app, vadymrotai@gmail.com)
- Browser MCP get_page_text + screenshots
- Click tests (Pobierz z KRS, Sprawdź BZP, Uruchom lookup)
- ls app/api/ + ls app/(dashboard) pages у локальному репо
- Real lookup для NIP 7561993172 (KOZAK OLEK)

### Що НЕ перевіряв:
- /clients/new, /clients/[id]/edit
- /suppliers/[id]/edit
- /persons/[id]
- /matches/review
- /intelligence/deep-discovery/[product_id]
- Дублікати /dashboard, /products, /deals, /tasks, /goals, /habits, /calculator
- /kp-generator
- API ключі реальні (видно тільки masked)
- Чи cold opener генератор on-demand або pre-generated

---

**END OF AUDIT #2 (revised).**

---

## S5A SHIP STATUS — 01.05.2026 (post-ship verified)

**Commit:** e97c60c
**Verification by:** Claude через browser MCP (4 screenshots: ss_3327eqple, ss_97566nf64, ss_2190x7tbs, ss_4515aifof, ss_2539619in)

### Sidebar новий стан:
- 7 top-level visible always (Dziś, Klienci, Sprzedaż, Produkty, Dostawcy, Organizer, Ustawienia)
- 3 collapsible groups (Klienci, Sprzedaż, Ustawienia) з sub-items
- Auto-expand коли current route є sub-route цієї групи
- Active state: leaf exact match, group title prefix match
- Bonus fix: /products → /produkty (S4 P5 layout)

### 5 раніше прихованих сторінок ТЕПЕР FINDABLE:
- Klienci → Prospekti → /intelligence/prospects (99 prospekts)
- Klienci → Lookup NIP → /intelligence/lookup (6-source enrichment)
- Klienci → AI Discovery → /intelligence
- Sprzedaż → Dopasowania → /matches (100 dopasowań + bulk ops + Pikniko CSV)
- Sprzedaż → Pikniko handoff → /handoff/pikniko (cohort 29)
- Ustawienia → Admin Health → /admin/health (Apify monitoring)

### Mind-shift confirmed:
"Sztab — це не 'не shipped' продукт. Це тепер findable продукт."

### Що залишається в Sprint S5:
- S5B (~45 хв) — Quick UX fixes:
  - "Pobierz z KRS" anchor → working refresh button
  - ?nip= URL param prefill на /intelligence/lookup
  - /admin index page (зараз root /admin = 404, тільки /admin/health works)
  - Legacy duplicate routes (/dashboard, /products, /deals, /tasks, /goals, /habits, /calculator)
- S5C (~1.5h) — Tavily contact enrichment:
  - Settings: Tavily API token field
  - app/api/contact-enrichment/route.ts — заповнити logic
  - UI button "Znajdź kontakt" на /clients/[id] де kontakt empty


---

## Sprint S5B Legacy Routes Audit (2026-05-01)

8 legacy English routes audited — `app/(dashboard)/{dashboard,products,deals,tasks,goals,habits,calculator,kp-generator}/page.tsx`. Sidebar теper points до nowych Polish routes (S5A), але legacy subtrees mogą być wciąż wired через internal references і edit/create sub-pages.

### KEEP (live wiring, do NOT delete)

| Route | Why keep |
|---|---|
| `/dashboard` (135 lines) | Real production sales pipeline dashboard z 10 distinct queries (overdue actions, won/lost MTD, stuck negotiations, closing-soon, tasks today, habits week-grid). NOT duplicate of `/pulpit/dzisiaj` — different scope (pipeline-focused vs daily ops). **Login flow redirects here** (`app/auth/login/page.tsx:35`). Future: consider merging or splitting in S5C+. |
| `/deals` subtree (`/deals`, `/deals/new`, `/deals/[id]`, `/deals/[id]/edit`, `/deals/[id]/margin`) | `deal-modal` navigates `router.push('/deals')` after cancel, `router.push('/deals/${id}')` after create. `new-deal-button` from /clients/[id] navigates `/deals/${id}`. /sprzedaz?tab=umowy renders DealsKanban inside wrapper, але `/deals/new` is LIVE create flow. Heavy coupling — deletion requires refactor. |
| `/products` subtree (`/products`, `/products/new`, `/products/[id]/edit`) | /produkty (S4) zastąpiło main view, але /products top-level wciąż renderuje Katalog + Dopasowania tabs (Dopasowania reachable z MatchesGlobalView). /products/new + /products/[id]/edit are real CRUD pages. /produkty не ma edit forms. |

### CANDIDATES FOR DELETION (orphan, no internal refs)

| Route | Lines | Equivalent | Refs |
|---|---|---|---|
| `/goals` | 19 | /organizer?tab=cele | 0 |
| `/calculator` | 19 | /organizer?tab=kalkulator | 0 |
| `/kp-generator` | 24 | /sprzedaz?tab=kp | 0 |

Each is a thin wrapper rendering shared component already used by Polish replacement. Safe to delete без impact.

### CANDIDATES FOR REDIRECT (1 internal ref each)

| Route | Lines | Used by | Suggested redirect |
|---|---|---|---|
| `/tasks` | 31 | `dashboard-content.tsx:301` `/tasks?focus=${task.id}` | `redirect('/organizer?tab=zadania')` — but loses ?focus param. Better: change dashboard-content link до /organizer?tab=zadania&focus=... + verify TasksContent reads ?focus (currently does NOT — `Grep "focus"` returned 0). Drop deep-link feature OR add focus support до TasksContent. |
| `/habits` | 19 | `dashboard-content.tsx:658` `/habits` | `redirect('/organizer?tab=nawyki')` — lossless redirect. /organizer renders HabitsContent в Nawyki tab. Safe. |

### TODO Sprint S5C+

- [ ] Decide: delete /goals, /calculator, /kp-generator (orphans). Cost: 3 lines × 3 commits or 1 batch commit.
- [ ] Decide: redirect /habits → /organizer?tab=nawyki. Verify dashboard-content link still works.
- [ ] Decide: redirect /tasks → /organizer?tab=zadania (lossy: ?focus param) OR keep /tasks until TasksContent supports ?focus.
- [ ] Audit how /dashboard relates to /pulpit/dzisiaj — merge as Sales tab or keep separate? Update auth/login redirect target.
- [ ] /products top-level: keep як landing для Dopasowania tab чи delete after migrating MatchesGlobalView consumers до /matches?


---

## S5B SHIP STATUS — 01.05.2026 (post-ship verified)

**Commits (5):**
- da4dc90 — KRS-only refresh endpoint + button (toast feedback)
- b356fd7 — /intelligence/lookup ?nip= prefill + auto-trigger
- 894f536 — /admin redirect + sidebar logo /dashboard → /pulpit/dzisiaj
- 7318931 — Legacy routes audit appended до docs/sztab-state.md
- 4765198 — Legacy routes cleanup (3 delete + 2 redirect)

**Verification by:** Claude через browser MCP (9/9 PASS)

### Що тепер працює:
- "Pobierz z KRS" buttons на /clients/[id] — actual KRS-only refresh (~20-40s)
- /intelligence/lookup?nip=XXX — input pre-filled, lookup auto-triggered
- /admin URL — redirect to /admin/health
- Sidebar logo "Sztab CRM" → /pulpit/dzisiaj (не legacy /dashboard)
- /habits, /tasks → redirect /organizer (для bookmarks compat)

### Що delete-нуто:
- /goals, /calculator, /kp-generator — orphan routes (нічого не лінкувало)

### Що залишається в Sprint S5C (preserved для подальшого audit):
- /dashboard subtree (used by old code paths)
- /products + /products/new + /products/[id]/edit (legacy CRUD)
- /deals + /deals/* (legacy CRUD з /deals/[id]/margin)

### Сумарно через Sprint S5 (S5A + S5B):
- 5 раніше прихованих сторінок тепер findable в sidebar
- 4 UX bugs виправлено
- 5 legacy routes обcлужено (3 delete + 2 redirect)
- 0 нових features (sprint був суто навігаційно-cosmetic)

### Залишилось у Sprint S5C (не shipped сьогодні):
- Tavily contact enrichment (Settings + endpoint + UI button)
- Deeper audit /dashboard, /products, /deals



---

## DISCOVERY #2 (01.05.2026 evening) — PHASE A / PHASE B SPLIT

**Discovered during:** Sprint S5C verification — Tavily не з'являвся в response.sources_completed навіть після successful migration to params pattern.

### Architectural finding:

/api/intelligence/lookup/route.ts має split на 2 phases (Sprint M FIX 3):

**PHASE A (sync, returns response, ~10-30s):**
- GUS identity
- VAT_BL status
- KRS basic
- Initial matching (algo only)
- Returns response.sources_completed = [GUS, GUS_branches, VAT_BL, KRS, matching]
- response.phase = 'A_complete', enrichment_pending = true

**PHASE B (async via Next.js after(), runs AFTER response, ~2-3 min):**
- BZP signals
- Comprehensive rejestrio (rozdzialy, sprawozdania, persons, CRBR)
- Apify GMaps
- Tavily web search (STEP 4.5)
- AI business analysis
- Final match recompute з AI re-score

PHASE B має OWN local response object built up but NEVER returned anywhere — 
тільки logs до enrichment_log table.

### Чому це існує:

Sprint M FIX 3 split orchestrator тому що full pipeline ~2-3 min перевищує
Vercel sync 30s timeout. Phase A returns < 30s, Phase B continues у background
з 120s function ceiling.

### Що це міняє в розумінні:

Раніше я думав "lookup robить 6 sources одразу і повертає всі". Реально:
- Користувач бачить тільки Phase A (4-5 sources)
- Phase B працює у тлі, не surface-ується в UI
- Tavily, Apify_GMaps, AI analysis — всі у Phase B
- Дані в БД оновлюються через ~30-60s після response, але UI цього не показує

### Connection до Protocol 13 (Two Fundamental Analysis Buttons):

Це pattern ВЖЕ implement-овано на backend (sources fetch перш ніж AI). Просто
UI його не surface-ує. Sprint S6 (Two Fundamental Buttons) має зробити це 
visible:

PHASE 1 — sources (Phase A + початкова Phase B без AI)
PHASE 2 — AI на основі готових даних (тільки після Phase B sources finished)

UI прогресс має показувати обидва phaseы з indicator "Pobieranie danych
(X/Y źródeł)..." → "Analiza AI..." як описано в Protocol 13.

### Що НЕ виправляємо в S5C:

PHASE A response misleadingly returns sources_completed з 4-5 entries без
indication що PHASE B ще running. Це окрема UX issue, не блокер для Sprint S5C
core goal (Tavily migration).

Fix paths (deferred to Sprint S6):
- Quick: dodaj phase_b_pending: ['tavily', 'apify', 'AI_business_analysis'] 
  do PHASE A response
- Better: client-side polling /api/intelligence/enrichment-status (existing)
  щоб updateować UI gdy PHASE B finishes
- Best: Two Fundamental Analysis Buttons (Sprint S6) з 2-stage progress bar

### Verified evidence (Vadym + Claude live test 01.05.2026):

- enrichment_log table за останні 6h: tavily 5 success runs (cost recorded), 
  AI_business_analysis 5 success, Apify_GMaps 2 partial, BZP 5 success
- params.tavily_api_key: present, length=58, prefix tvly-
- KOZAK profile (NIP 7561993172) Analiza biznesowa (AI) показує:
  * "Źródła analizy: GUS, VAT_BL, WWW, KRS, persons, tavily" — Tavily в списку
  * AI text згадує "brak obecności online" — інтерпретація Tavily empty result
  * Datowana 1.05.2026, model claude-haiku-4-5 — fresh Phase B output

**Tavily ПРАЦЮЄ end-to-end. Просто не visible в Phase A response.**



---

## S5D SHIPPED 01.05.2026 evening — Phase B Status Surface

**Status:** GREEN ✅ — verified live by Claude (browser MCP)
**Commit:** 1 commit (S5D), feat: surface phase_b_pending in lookup response
**Tested NIPs:** 1231562224 (JDG), 7561993172 (sp.z o.o.)

### Що тепер працює:

**1. Button copy fix:**
- Loading state: "Pobieranie danych..." (раніше було "Pobieranie danych z 6 źródeł..." — hardcoded "6" misleading)

**2. Phase B status surface:**
- LookupResponse interface extended з phase_b_pending: string[]
- Phase A response budowane conditionally на основі available API keys + entity type:
  * Always: BZP, persons
  * if (krsNumber): rejestrio_v2
  * if (tavily_api_key OR env fallback): tavily
  * if (apify_api_token): Apify_GMaps
  * if (anthropic_api_key): AI_business_analysis

**3. UI render (lookup-form.tsx):**
- Amber dashed-border card під sources_completed
- Header "🔄 Trwa w tle (~30-60s)"
- Helper text "Te źródła są pobierane w tle. Odśwież profil firmy za minutę aby zobaczyć aktualne dane."
- Outline badges per pending source

### Verified evidence:
- JDG (Domek Sushi 1231562224): 5 pending (BZP, persons, tavily, Apify_GMaps, AI_business_analysis) — без rejestrio_v2 бо JDG не має KRS
- sp.z o.o. (KOZAK 7561993172): 6 pending (з rejestrio_v2) — conditional logic працює правильно

### Що це міняє в UX:

Раніше: користувач бачив 4-5 sources в response, не знав чому "z 6 źródeł" не виконано → frustration
Тепер: користувач бачить готові sources + список того що ще running у тлі + інструкцію "Odśwież profil за хвилину"

Це precursor до Sprint S6 (Two Fundamental Analysis Buttons з 2-stage progress bar).

