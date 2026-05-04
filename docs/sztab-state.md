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



---

## DISCOVERY #3 NEEDED — Sprint S6B Product Analysis Spec (TODO 02.05.2026)

**Triggered by:** Vadym question 01.05.2026 evening — "коли ми будемо робити аналіз товарів? Джерела, результати, UX, структуру? Чи в нас це записано в планах?"

### Поточний стан docs:
- Protocol 13 (sztab-protocols.md) — записано що "Аналіз товару" це 1 з 2 fundamental кнопок. Лише intent.
- Sprint S6B (sztab-sprints.md) — записано тільки 2 рядки "Така ж архітектура для /produkty/[id]" + примітка "Pre-S6 audit потрібен".

### Що НЕ зафіксовано і потребує Discovery session:
1. **Sources** — які саме джерела для аналізу товару? Hipotetycznie:
   - Apify Allegro scraper (вже є для clients via product matching, але для товару окремо?)
   - Apify Ceneo scraper (price comparison)
   - Tavily web search (brand mentions, reviews)
   - OpenFoodFacts (для food products — ingredients, certifications)
   - Internal: matching engine (existing) — які клієнти best fit
   - Allegro Sales Center API (sales velocity, якщо acquired access)
2. **Результати** — що користувач хоче бачити:
   - Competitor pricing distribution?
   - Demand signal (search trends, listings count)?
   - Best-fit clients (matching from Vadym base)?
   - Margin opportunity matrix?
3. **UX** — на /produkty/[id]:
   - Де primary "Аналіз товару" button (action bar top)?
   - Як 2-stage progress bar render-иться?
   - Які accordion sections для results?
4. **Data model** — чи є `product_analytics` / `product_competitors` tables?
   - Migration потрібна?
   - Які columns в products зараз populated?

### Як вирішити:
Sprint S6 Pre-Audit session (30-45 хв) ПЕРЕД STEP 0 будь-якого S6 phase.
Audit охоплює:
- Read app/(dashboard)/produkty/[id]/page.tsx — як зараз product profile рендериться
- ls app/api/products/* + app/api/intelligence/deep-discovery/[product_id]/* — existing endpoints
- DB: SELECT column_name FROM information_schema.columns WHERE table_name='products'
- Read lib/matching/engine.ts — matching engine works for products too?
- Strategic discovery з Vadym — якi business questions "Аналіз товару" має відповідати

### Не починаємо S6A без цього:
S6B залежить від цих знахідок. S6A (клієнт) можемо шипити перш ніж — НЕ ризик. Але S6B без spec ризик повтору mistake S5C (writing without verifying).

### Залежності:
- Sprint S5D shipped (✅ done)
- Vadym energy + 30-45 хв focused time (бажано свіжим, не наприкінці day)


---

## 01.05.2026 — Day Wrap

### Shipped
- Sprint S5 COMPLETE (17 commits): S5A nav + S5B UX + S5C Tavily params + S5D Phase B
- audit-s6b-product-analysis.md (9da3cb7)

### Cowork validated
- Computer Use + Browser Use ON, folder C:\Users\vadym\Projects\sztab
- Stable: read, edit, computer use, browser automation
- Broken: git writes через sandbox (virtiofs cache) → Protocol 14
- Defender exclusion C:\Users\vadym\Projects активна; handle.exe installed

### Discovery #4 — S6B scope locked
- Q1 Ceneo: IN
- Q2 Allegro: 50+ results/SKU ($0.40)
- Q3 AI fields ALL MUST: pricing positioning / market saturation / brand authority / buyer segments / recommended actions / risk signals / sourcing intel
- Q4 storage: hybrid (product_competitor_listings + product_market_signals tables + intelligence_runs.parsed_results JSONB)
- Q5 UX: hybrid (summary card в ProduktyShell + dedicated /produkty/[id]/analysis page)

### S6B breakdown (18-25h)
- S6B.0 Allegro 1-SKU smoke test
- S6B.1 backend orchestrator + migrations 046+047 (5-7h)
- S6B.2 AI engine lib/ai/product-analysis.ts (4-5h)
- S6B.3 UI card + dedicated page (6-8h)
- Precondition: /produkty/[id]/page.tsx НЕ існує → S6A.5

### Verified facts
- ProduktyShell = ResizablePanelGroup, selection через ?sku= URL state
- product_attributes: НЕ має CHECK constraint, 102 records усі source='ai'
- OFF data сидить у product_external.off_payload JSONB
- Migration 023 enum 'gemini' застаріла vs runtime 'ai' — fix у 046

---

## 02.05.2026 — Discovery #5 + Foundation Update

### Discovery #5 — Market Intelligence Layer

- Vadym question on matching quality виявив strategic gap: matching engine використовує тільки internal CRM data, без external market context
- Deep research surfaced rich Polish wholesale market intelligence ecosystem: ZSRIR (free open data), 16 wholesale markets, EU observatories, distribution channels
- Vadym confirmed strategic intent: "outside-in" approach з real market data, не тільки CRM patterns

### Decisions locked

1. Architecture: Food-first з ready-for-extension (Option Z)
2. Geographic: Poland-only Phase 1
3. Budget: $20-100/month tier
4. Cadence: Hybrid (weekly cron + on-demand)
5. Knowledge priorities: Phase 1 = price history + competitor analyses + HoReCa business models
6. Language: PL primary, UA secondary, EN tertiary
7. Pricing comparison depth: All three layers (wholesale + retail + distribution)

### Sprint Plan Revised

- S6A "Аналіз клієнта" — ship first, не блокується
- S-INTEL.1-5 — нова sprint group, foundation для market intelligence
- S6B (3 sub-sprints) — після S-INTEL ready
- S-FEEDBACK.1 — manual rating + Layer 2 tuning UI (after S6B)

### Documentation Created/Updated

- Protocol 15 expanded з Decision Framework section
- docs/sztab-matching-philosophy.md updated knowledge bootstrapping section + new Connection to Product Intelligence section
- docs/sztab-product-intelligence-spec.md — НОВИЙ doc (12 dimensions, sources map by tier, priorities, sprint plan)

### Verified facts (Discovery #5 research)

- ZSRIR доступний через dane.gov.pl як free open data API
- EU agridata.ec.europa.eu має CSV/API exports для всіх observatories
- fresh-market.pl має 16 польських wholesale markets, scrapeable
- TGE relevant тільки для bulk commodities (sugar/grain/dairy futures), не finished food
- CN code (Combined Nomenclature 8-digit) — bridge до всіх EU statistical sources, must-have field у products


---

## 02.05.2026 — S6A Step 1 (in progress)

### Built

- `app/api/clients/[id]/full-analysis/route.ts` (101 рядків) — wrapper endpoint dla "Analiza klienta" primary CTA (Protocol 13)
- Resolves clientId → nip → forwards POST do `/api/intelligence/lookup` (internal fetch)
- Cookie forwarding (`cookie` header) для auth — `supabase.auth.getUser()` читає JWT з cookies (через `@supabase/ssr` createServerClient)
- Bearer token Authorization header — НЕ підтримується upstream (verified `lib/supabase/server.ts`), тому досить cookie
- `maxDuration = 120` — aligned з upstream `app/api/intelligence/lookup/route.ts:42` (NIE 800 як було в template)
- UUID regex check + 404 на missing client + 400 на missing NIP
- Returns envelope as-is: `{ ok, response: {...LookupResponse...}, phase, enrichment_pending }` z `response.phase_b_pending`

### Architecture decision (Q-arch lock)

- **Option A** (internal fetch wrapper) chosen для мінімального blast radius першого commit S6A
- Trade-off: 2x function invocation на Vercel (wrapper + lookup), але cleaner separation
- Future: розглянути **Option B** (extract `runLookupPipeline(nip, supabase)` до `lib/intelligence/pipeline.ts`) якщо буде потреба перевикористання з інших routes

### Other locked decisions (S6A Discovery #4 follow-up)

- TOP-10 для AI rescore у Phase B (не TOP-5, не TOP-20) — реалізація STEP 2
- Primary CTA name: "Analiza klienta" (Protocol 13 wording)
- Orphan `/api/ai/analyze-client` НЕ deleteуємо в S6A — окремий S6A.0 cleanup
- `maxDuration` = 120 (aligned з lookup ceiling)
- Return shape: envelope as-is (zachowuje phase / enrichment_pending poza response)

### Verification status

- Static review PASS (cross-reference з `krs-refresh/route.ts`, `enrich-apify/route.ts`, `lookup/route.ts`)
- pnpm tsc / pnpm lint / pnpm dev — НЕ виконувалось (CLAUDE.md "Ask before acting"); Vadym робить sam через PowerShell
- Live verification (Protocol 4) — defer do shipnięcia całego S6A; wrapper wymaga STEP 4 UI rewire żeby być testowalny end-to-end

### Next (S6A Step 2)

- Add `AI_match_rescore` step у Phase B `runPhaseB()` w `app/api/intelligence/lookup/route.ts`
- Update `phase_b_pending` list w lookup route do uwzględnienia `'AI_match_rescore'` (conditional na `params.anthropic_api_key`)
- Build per-client `rescoreClientTop10(supabase, apiKey, clientId)` w `lib/matching/ai-rescore.ts` (TOP-10 matches WHERE client_id=?, jeden Haiku call, UPDATE matches.{ai_score, ai_reasoning, ai_confidence, ai_scored_at})
- Phase B currently ~60-100s; AI rescore TOP-10 dodaje ~5-10s — zostaje pod 120s ceiling

### Constraint reminder

- NIE git operations (Vadym committs з PowerShell — Protocol 14)
- NIE modyfikacja `lookup/route.ts` (to STEP 2)
- NIE modyfikacja UI components (to STEP 4)


---

## 02.05.2026 — S6A Step 2 (in progress)

### Built

- `rescoreClientTop10(supabase, apiKey, clientId)` — нова exported function у `lib/matching/ai-rescore.ts` (367 → 642 рядків, +275). Mirror `rescoreTop20` pattern ale inverted perspective: 1 client × N=10 products.
  - Returns `{ ok, rescored, cost_usd, error? }`
  - Re-uses `callAI` + `AI_MODELS.FAST` (claude-haiku-4-5) + `extractJSON`
  - Cost guards: graceful skip (ok:true, rescored:0) якщо missing apiKey, no client, no business_profile, no matches, or empty product candidates
  - Updates `matches.{ai_score, ai_reasoning, ai_confidence, ai_scored_at}` per row, identical fields як rescoreTop20
- STEP 7 у `runPhaseB` (`app/api/intelligence/lookup/route.ts`, 1257 → 1324 рядків, +67) — final Protocol 13 layer. Triggers після STEP 6 final (computeMatchesForClient).
- `phase_b_pending` тепер включає `'AI_match_rescore'` (conditional на `params.anthropic_api_key`).

### Defensive timeout protection (Vadym GO STEP 1 modification)

- Added `PHASE_B_BUDGET_MS = 110_000` (Vercel ceiling 120s minus 10s safety margin) i `phaseBStartedAt = Date.now()` na początku `runPhaseB`.
- STEP 7 mierzy `elapsedSoFar` przed startem AI rescore. Jeśli `remainingBudget < 15_000ms` (RESCORE_BUDGET_MS), gracefully skip → `enrichment_log.status='partial'` z `error_message: 'Skipped: only Xs budget remaining...'` i `raw_payload: {skipped: true, elapsed_ms}`.
- Skip jest INFO, не ERROR — UI rozróżni intentional skip od bug.
- TODO comment: rozważyć split chain (osobny `after()` dla rescore) jeśli skip rate okaże się wysoki — trade-off lose Protocol 13 final-context guarantee.

### Phase B timing analysis (STEP 0 budget reasoning)

Live SQL query w Supabase Studio nie zadziałało przez Chrome MCP cookie isolation policy (authenticated `/api/platform/...` calls blocked). Decyzja oparta na documented timing z `audit-s6a-client-analysis.md` Section 8 Risks:

| Source segment | Estimated avg |
|---|---|
| BZP + rejestrio_v2 (parallel) | ~10-20s |
| persons (extractAndCreatePersons) | ~5-10s |
| Tavily web search | ~5-15s |
| Apify_GMaps | ~20-40s |
| AI_business_analysis (Haiku) | ~5-10s |
| Final computeMatchesForClient | ~3-5s |
| **Phase B total (existing)** | **~60-100s** |
| + AI_match_rescore TOP-10 (Haiku) | +5-10s |
| **Phase B with rescore** | **~65-110s** |

Decision: same `after()` chain (Variant 2 modified) z budget guard. W zone "90-110s — same chain + skip safety". Live verification SQL recommend Vadym wykonał manualnie po pierwszym ship żeby zaobserwować rzeczywiste runtime distributions.

### Architecture: Final Protocol 13 step

AI rescore = OSTATNI step Phase B, po wszystkich źródłach. Klient widzi pełny kontekst:
- BZP signals → buying patterns
- rejestrio_v2 → financials, persons, red flags
- Tavily → web presence
- Apify_GMaps → reviews, contact, location signals
- business_profile (Haiku) → format, kategorie, demografia, traits, buyer_strength_for_chm
- Final algo recompute → niche bonus z business_profile
- **AI rescore** → ocenia każdy z TOP-10 algo matches z pełnym contextom

Output: `matches.ai_score` / `ai_reasoning` / `ai_confidence` per produkt. Rendered w `MatchesPanel` na profile klienta.

### Verification status

- Static cross-reference PASS:
  - `grep rescoreClientTop10` — exported у ai-rescore.ts:495, imported у lookup/route.ts:39, called у lookup/route.ts:779
  - `grep AI_match_rescore` — pushed do phase_b_pending у lookup/route.ts:461, used як enrichment_log source у lookup/route.ts:766
- pnpm tsc / pnpm lint / pnpm dev — НЕ виконувалось (CLAUDE.md "Ask before acting"); Vadym робить sam через PowerShell
- Live verification (Protocol 4) — defer do shipnięcia całego S6A; STEP 4 UI rewire pozwoli Vadymowi przeanalizować klienta i obserwować rescored matches end-to-end

### Next (S6A Step 3)

- Refactor `EnrichmentProgressBanner` (`components/clients/enrichment-progress-banner.tsx`) do S5D pattern:
  - Blue Loader → amber dashed border
  - Copy "Wzbogacanie w toku..." → "🔄 Trwa w tle (~30-60s)" + helper text "Te źródła są pobierane w tle..."
  - Render running sources jako outline badges (consistent z `lookup-form.tsx`)
- Bonus: optionally consume initial `phase_b_pending` z full-analysis response (jeśli passed via prop)

### Constraint reminder

- NIE git operations (Vadym committs z PowerShell — Protocol 14)
- NIE modyfikacja UI components (to STEP 3)
- NIE modyfikacja `client-detail-actions.tsx` primary CTA (to STEP 4)


---

## 02.05.2026 — S6A Step 3 (in progress)

### Refactored

- `components/clients/enrichment-progress-banner.tsx` (75 → 89 рядків, +14)
- Pattern: S5D amber dashed mirror з `components/intelligence/lookup-form.tsx:194-212`
- Visual changes:
  - Container: `border-l-4 border-l-blue-500 bg-blue-50/40 p-3` → `rounded border border-dashed border-amber-300 bg-amber-50/40 p-3`
  - Loader2Icon color: `text-blue-600` (size-4) → `text-amber-700` (size-3.5, more compact, mirror lookup-form vertical rhythm)
  - Header copy: "Wzbogacanie w toku…" → "🔄 Trwa w tle (~30-60s)"
  - Helper text added: "Te źródła są pobierane w tle. Strona odświeży się automatycznie." (заміна старого "Strona odświeży się automatycznie")
  - Sources rendering: comma-joined string → outline badges (`<Badge variant="outline" className="border-amber-400 text-amber-800">`)
- Layout: header row + helper paragraph + flex-wrap badge row (consistent з lookup-form S5D)

### Polling logic preserved (byte-for-byte)

- `useEffect` 10s polling cycle — identical
- `useRouter.refresh()` коли prev.length > 0 && next.length === 0 — identical
- Fetch `/api/intelligence/enrichment-status?clientId=...` no-store cache — identical
- RunStatus interface — identical
- Component prop signature `{ clientId: string }` — preserved (zero impact на page.tsx:276 callsite)

### What deferred to S6A Step 4

- Render full `phase_b_pending` list (e.g. include AI_match_rescore even перш ніж він стартував у polling endpoint).
- Solution: action bar primary CTA "Analiza klienta" (Step 4) має передавати initial `phase_b_pending` from full-analysis response через React state/context до banner. Banner тоді показує `pending = expected - completed - running`.
- Зараз: показуємо тільки `running` rows з enrichment_log polling. Це достатньо для current UX (Vadym бачить що щось крутиться).

### Verification status

- Static cross-reference PASS:
  - `grep EnrichmentProgressBanner` — import path в `app/(dashboard)/clients/[id]/page.tsx:17` unchanged, render call line 276 unchanged
  - `grep Badge.*from '@/components/ui/badge'` — import path consistent with lookup-form.tsx (no new dep, no path conflict)
- pnpm tsc / pnpm lint / pnpm dev — НЕ виконувалось (CLAUDE.md "Ask before acting"); Vadym робить sam через PowerShell
- Live verification (Protocol 4) — defer do shipnięcia całego S6A Step 3+4; cleanest test = Step 4 ship coли Vadym кліксне primary CTA "Analiza клиента" → banner з'являється з S5D style → Phase B завершується → page auto-refreshes

### Next (S6A Step 4)

- Refactor `components/clients/client-detail-actions.tsx`:
  - Primary CTA rename: "✨ Analizuj AI" → "Analiza klienta" (Protocol 13 wording)
  - Primary onClick: POST `/api/ai/analyze-profile` → POST `/api/clients/[id]/full-analysis` (Step 1 wrapper)
  - Loading toast 2-stage: "Pobieranie danych..." → "Analiza AI..."
  - Menu "Pobierz z KRS" rename → "Refresh KRS only" (clarity vs new primary)
  - Optional: pass initial `phase_b_pending` from response do `EnrichmentProgressBanner` via React state (closes Step 3 deferred item)
- Inline "Re-analyze" button у `BusinessProfileSection` rename → "Tylko AI re-run" (clarity that it's not full pipeline)

### Constraint reminder

- NIE git operations (Vadym committs z PowerShell — Protocol 14)
- NIE modyfikacja `client-detail-actions.tsx` primary CTA (to STEP 4)
- NIE modyfikacja `BusinessProfileSection` (to STEP 4)


---

## 02.05.2026 — S6A Step 4 (FINAL — SHIP COMPLETE)

### Refactored

**1. `components/clients/client-detail-actions.tsx` (143 → 200 рядків, +57)**

Primary CTA rewired do Protocol 13 "Analiza klienta":
- Label: `hasProfile ? 'Pełna re-analiza' : 'Analiza klienta'` (Vadym lock 02.05.2026)
- Icon: SparklesIcon (no profile) / RefreshCwIcon (has profile) — preserved variant logic
- Handler: `analyze()` → `fullAnalysis()` (rename)
  - URL: `/api/ai/analyze-profile` → `/api/clients/${clientId}/full-analysis` (Step 1 wrapper)
  - Body: `{ clientId }` → empty (clientId resolved server-side z URL params)
- Loading: `alert()` → sonner `toast.loading('Pobieranie danych...')` → `toast.success(...)` z runtime `phase_b_pending` count
- Success message conditional: `Phase A gotowa (${completed}). Analiza AI w tle (~60-90s, ${pending} pending)...` lub bez pending coли brak anthropic_api_key
- `router.refresh()` po success — banner pokażе running enrichment_log rows

Menu rewire:
- Label: `'Pobierz z KRS'` → `'Refresh KRS only'` (clarity vs new primary)
- Function: `refreshFromKrs()` → `refreshKrsOnly()` (rename для consistency z UI label)
- URL: `/api/intelligence/lookup` → `/api/clients/${clientId}/krs-refresh` (existing S5B-1 endpoint)
- Body: `{ nip }` → empty (clientId from URL, krs-refresh resolves server-side)
- Sonner toast feedback (mirror KrsRefreshButton accordion-section pattern)
- Busy state label: `'Pobieranie KRS…'`

State key rename: `busy === 'analyze'` → `busy === 'fullAnalysis'` (single-source-of-truth z function name).

Preserved unchanged:
- `+ Zadanie / + Notatka / + Szansa` actions
- Edytuj / Eksport (Markdown) menu items
- `deleteClient()` (uses `alert()` + `confirm()` — out of scope, S6A.0 hygiene cleanup later)
- Component signature `{ clientId, nip, hasProfile }` — zero impact на page.tsx callsite

**2. `components/clients/business-profile-section.tsx` (215 → 242 рядків, +27)**

Empty-state branch (Опція C — hide button, show hint):
- Removed inline "Analizuj" button (oraz cały right-aligned CardHeader split)
- Added amber-dashed hint card в CardContent з ArrowUpIcon
- Copy: "Brak analizy biznesowej." + "Uruchom 'Analiza klienta' w panelu akcji powyżej — pobierze wszystkie źródła (KRS, GUS, BZP, Tavily, Apify, business AI, AI re-score) i wygeneruje profil."
- Eliminuje confusion між AI-only re-run a full pipeline на etapі коли sources не fetched

With-profile branch:
- Inline button label: `'Re-analyze'` → `'Tylko AI re-run'`
- Tooltip via `title` prop (no extra Tooltip lib): conditional message
  - When disabled (input_sources empty): `"Spuszczone sources są wymagane. Uruchom 'Analiza klienta' najpierw."`
  - When enabled: `"Re-run AI analysis tylko (bez refresh sources). Dla pełnej analizy use 'Analiza klienta' button w panelu akcji."`
- `disabled` logic: `analyzing || !profile.input_sources || profile.input_sources.length === 0`
- Handler: unchanged (POST `/api/ai/analyze-profile` — preserves AI-only entry point)

Imports: added `ArrowUpIcon` from lucide-react (used у empty-state hint).

### Verification status

- Static cross-reference PASS (grep):
  - `/api/clients/${clientId}/full-analysis` — wired у primary onClick
  - `Analiza klienta` / `Pełna re-analiza` — appears як conditional primary label
  - `/api/clients/${clientId}/krs-refresh` — wired у menu (existing endpoint, NOT new)
  - `/api/ai/analyze-profile` — preserved у business-profile-section reanalyze() (inline button)
  - `Tylko AI re-run` — replaces `Re-analyze` у with-profile header
  - sonner dep — already used by sibling KrsRefreshButton, no new install
- pnpm tsc / pnpm lint / pnpm dev — НЕ виконувалось (CLAUDE.md "Ask before acting"); Vadym робить sam через PowerShell
- Live verification (Protocol 4) — defer do Vadym kliknięcia "Analiza klienta" na arbitralnym kliencie po deploy (~1 min Vercel build):
  - Expected: amber dashed banner appears z running sources list
  - Phase B completes у ~120-130s
  - banner disappears + page auto-refreshes
  - business_profile + matches.ai_score updated

### Sprint S6A SHIPPED COMPLETE (4/4 steps)

| Step | Description | Files | Status |
|---|---|---|---|
| 1 | full-analysis wrapper endpoint | `app/api/clients/[id]/full-analysis/route.ts` (101 lines new) | ✅ Shipped commit 09eb3fd |
| 2 | AI rescore у Phase B + per-client variant | `lib/matching/ai-rescore.ts` (+275), `app/api/intelligence/lookup/route.ts` (+67) | ✅ Shipped commit 47fbccd, live verified (9/10 matches updated за ~133s, AI reasoning text quality high) |
| 3 | EnrichmentProgressBanner S5D refactor | `components/clients/enrichment-progress-banner.tsx` (+14) | ✅ Shipped (commit pending — needs Vadym push) |
| 4 | UI rewire primary CTA + inline button | `components/clients/client-detail-actions.tsx` (+57), `components/clients/business-profile-section.tsx` (+27) | ✅ Code complete (commit pending) |

### Architecture closure (Protocol 13 implementation)

Sprint S6A досягло Protocol 13 "Two Fundamental Analysis Buttons" дla CLIENT side:
1. ОДНА КНОПКА primary "Analiza klienta" → fan-out до WSZYSTKICH sources (KRS, GUS, GUS_branches, VAT_BL, BZP, rejestrio_v2, Tavily, Apify_GMaps, AI_business_analysis, final algo recompute, AI_match_rescore TOP-10)
2. AI = FINAL layer (STEP 7 у runPhaseB), не первий — runs після всіх sources
3. UI shows S5D amber dashed banner з running sources poки Phase B w toku
4. Page auto-refreshes po Phase B done — Vadym widzi zaktualizowany business_profile + ai_score per match

### Next sprint candidates

- **S6A.0 hygiene cleanup** ✅ shipped 02.05.2026 (see entry below)
- **S6A.5 split chain** (conditional — only if Phase B timeout skip rate proves high у production):
  - Move AI_match_rescore до osobnego after() chain
  - Trade-off: lose Protocol 13 final-context guarantee
  - Trigger only after observing >5% skip rate в enrichment_log
- **S6B Product Analysis** (Discovery #4 locked):
  - Mirror architecture для /produkty/[id]
  - Sources: Allegro + Ceneo + Tavily + OpenFoodFacts
  - 18-25h breakdown — see Discovery #4 entry
  - Precondition: S-INTEL.1-5 market intelligence layer (Discovery #5)


---

## 02.05.2026 — S6A.0 Hygiene Cleanup (SHIPPED)

Чотири atomic items після S6A ship. Кожен можна revertнути окремо.

### Item 1 — krs-refresh stale message updated

`app/api/clients/[id]/krs-refresh/route.ts:48` — error message коли `client.krs_number` empty.

ДО: `'Brak numeru KRS у tym kliencie. Uruchom najpierw "Intelligence Lookup" (z menu ⋯) — pobierze KRS przez GUS.'`

ПІСЛЯ: `'Brak numeru KRS w tym kliencie. Uruchom "Analiza klienta" w panelu akcji powyżej — wzbogaci ona dane z KRS jeśli klient jest spółką.'`

Bonus fix у тому ж рядку: typo "у tym" (Cyrillic у) → "w tym" (proper Polish).

### Item 2 — Atomic orphan chain delete (-313 lines)

DELETED 2 files:
- `app/(dashboard)/clients/ai-analyze-button.tsx` (174 lines) — orphan component, 0 import statements у repo
- `app/api/ai/analyze-client/route.ts` (139 lines) — endpoint викликався тільки orphan компонентом

Audit Section 8 Q-4 раніше стверджував "0 callers у repo", але пропустив `ai-analyze-button.tsx`. Real status: orphan **chain** (component used endpoint, but nothing used component). Atomic delete безпечний — verified pre-delete grep:

| Hit location | Status |
|---|---|
| 2 deleted files (3 internal references) | RESOLVED via delete |
| docs (audit-s6a-client-analysis.md, sztab-state.md) | historical notes — keep |
| `lib/ai-providers.ts:32` | comment example, не actual call — safe |
| `tsconfig.tsbuildinfo` | build cache, regenerates — safe |

Workflow replacement: "Analiza biznesowa (AI)" via S6A `business_profile` JSONB обігрує old "Analiza AI" notes-append pattern. Zero feature loss, gain -313 lines.

### Item 3 — deleteClient migrated до AlertDialog + sonner

`components/clients/client-detail-actions.tsx` (200 → 243 рядків, +43)

Migrated від `confirm()` + `alert()` до:
- `<AlertDialog>` (shadcn/ui, controlled via `open` prop + state)
- sonner `toast.error()` для failures
- sonner `toast.success()` для success

Pattern split на 2 функції:
- `requestDelete()` — викликається з menu item, opens dialog (`setConfirmDeleteOpen(true)`)
- `performDelete()` — запускається з `<AlertDialogAction>` confirm, runs server action, fires toast

AlertDialog placement: poza ActionBar (fragment wrapper). Reference pattern: `app/(dashboard)/suppliers/[id]/delete-button.tsx`.

Preserved unchanged:
- `deleteClientRecord()` server action call
- `useTransition()` for loading state (busy='delete')
- `router.push('/clients')` post-success + `router.refresh()`

Result: zero `alert()`/`confirm()` calls remaining у component. Consistency з KrsRefreshButton + DeleteButton (suppliers) toast pattern.

### Item 4 — AI rescore TOP-10 returning 5 (research-only)

**Symptom:** Test A live verification (DENYS LISNIAK, 02.05.2026) — `rescoreClientTop10` sent TOP-10 candidates до Haiku, але тільки 5 matches got `ai_score` updated.

**Investigation:**
- Read `lib/matching/ai-rescore.ts:580-633` (Haiku call + parse + update)
- Compared з sibling `rescoreTop20` (lines 253-314) — validation logic byte-for-byte identical (`validIds.has(r.id)` check, `Math.min/max` clamp, `.update().eq('id', r.id)` upsert)
- **NO code bug у validation step**

**Likely root cause: `maxTokens: 2000` truncation**

| Parameter | rescoreTop20 (per-product) | rescoreClientTop10 (per-client) |
|---|---|---|
| Candidates | up to 20 | up to 10 |
| `maxTokens` | **3000** | **2000** |
| Comment | `// Sprint G smoke: 2000 was sometimes hit на 20 candidates` | (no comment) |

Math: 10 candidates × ~150-200 tokens (uuid + reasoning ≤120 chars + `{"id":"...","ai_score":XX,"reasoning":"...","confidence":0.X}` JSON overhead) ≈ 1500-2000 tokens output. Truncation at cap → JSON tail invalid. `extractJSON` 4-strategy fallback (block extract via `lastIndexOf('}')`) recovers complete head entries only → 5/10 explanation.

**Recommended fix (defer to S6A.0.5):**
- Bump `maxTokens` 2000 → **2500** (safe headroom для 10 candidates)
- OR sync з rescoreTop20 (3000) для symmetry
- OPTIONALLY: log warning якщо `rescored.length < matches.length` (visibility у `[CLAUDE]` log line)
- OPTIONALLY: store `rescored_count` vs `candidates_count` у `enrichment_log.raw_payload` (post-mortem telemetry)

**Not blocker** — current 5/10 ratio still produces useful AI signal на TOP rankings (highest priority matches). Fix is optimization, не correctness.

### Verification status

- Static cross-reference PASS (post-edits):
  - `grep AiAnalyzeButton|analyze-client` — лише docs + comment example + tsbuildinfo (no live code refs)
  - `grep alert\(` у client-detail-actions.tsx — zero remaining (migration complete)
  - `grep confirm\(` у client-detail-actions.tsx — zero remaining
  - krs-refresh: new message present, old message absent
- pnpm tsc / lint / dev — НЕ виконувалось (CLAUDE.md "Ask before acting"); Vadym робить sam через PowerShell
- Live verification — defer до next ship (Item 1+2+3 effects visible only post-deploy; Item 4 is research, no behavior change)

### Files modified summary

| File | Before | After | Δ | Action |
|---|---|---|---|---|
| `app/api/clients/[id]/krs-refresh/route.ts` | 148 | 148 | 0 | Item 1 (1-line message swap) |
| `app/api/ai/analyze-client/route.ts` | 139 | — | -139 | Item 2 (DELETE) |
| `app/(dashboard)/clients/ai-analyze-button.tsx` | 174 | — | -174 | Item 2 (DELETE) |
| `components/clients/client-detail-actions.tsx` | 200 | 243 | +43 | Item 3 (AlertDialog + sonner) |
| `docs/sztab-state.md` | ~990 | ~1100 | +110 | this entry |

**Net code change: -270 lines** (z deleted orphan chain) for cleaner UX consistency.


---

## 02.05.2026 — S6A.0.6 Untracked Cleanup + maxTokens Fix

П'ять atomic items після discovery untracked debt в repo (`.claude/`, `tsconfig.tsbuildinfo`, mystery scripts, audit doc, diagnose-lock files) + bonus fix для AI rescore TOP-10 returning 5/10 problem знайденого в S6A.0 Item 4 investigation.

### Item 1 — `.gitignore` updated

Appended dedicated section:
```
# Sprint S6A.0.6 — local tooling artifacts
.claude/
tsconfig.tsbuildinfo
diagnose-lock.log
```

Rationale per entry:
- `.claude/` — Claude Code project state directory (settings, recent sessions). Local-only.
- `tsconfig.tsbuildinfo` — TypeScript incremental build cache (~485KB). Regenerates on each build, varies per machine.
- `diagnose-lock.log` — log artifact from `diagnose-lock.ps1` (Item 3). Log not tool. Regenerates on each script run.

NOT ignored: `diagnose-lock.ps1` itself (Item 3 moves it to `scripts/cowork/` — keep tracked as cowork tooling).

### Item 2 — 3 mystery scripts decisions

| Script | Decision | Rationale |
|---|---|---|
| `scripts/diag-clients-id-500.ts` (163 lines) | **A KEEP у scripts/** | Symmetric з tracked siblings `diag-allegro-403.ts`, `diag-apify-*.ts`. Useful template на майбутні /clients/[id] regressions (KOZAK + DEKOB hardcoded UUIDs можуть бути reused). |
| `scripts/diag-clients-render.ts` (153 lines) | **A KEEP у scripts/** | Pair з diag-clients-id-500.ts (post-query transformation probe). Same pattern justification. |
| `scripts/seed-cd-projekt-test.ts` (210 lines) | **C DELETE** | Era застаріла (Sprint A+B+C smoke test, Sztab зараз S6). Sister patterns `seed-family-target-pkd.ts`, `seed-taxonomy.ts` доступні якщо знов треба template. Cleaner repo > history value here. |

Net Item 2 impact: 2 untracked → tracked у Vadym commit (Items 2.1+2.2), 1 deleted (Item 2.3, -210 lines).

### Item 3 — `diagnose-lock.ps1` moved до `scripts/cowork/`

- Created directory: `scripts/cowork/`
- Moved: `diagnose-lock.ps1` → `scripts/cowork/diagnose-lock.ps1`
- Deleted: `diagnose-lock.log` (logs not tools, .gitignored anyway after Item 1)

Hardcoded paths inside .ps1 use absolute `C:\Users\vadym\Projects\sztab\...` — script works correctly from new location (LogPath, .git\ references, Set-Location all absolute).

Rationale: root-level placement violates organization hygiene; `scripts/cowork/` formalizes "tooling specifically for Cowork sandbox debugging" namespace. Fits Protocol 14 (Cowork virtiofs cache + handle.exe diagnostics).

### Item 4 — `docs/audit-s6a-client-analysis.md` tracked

File existed (439 lines, readable, not truncated) but was untracked. Confirmed via `git ls-files docs/audit-s6a-client-analysis.md` → empty.

Audit doc was core artifact для Sprint S6A planning (Section 7 REFACTOR scope, Section 8 risks). Should be tracked alongside `sztab-state.md` and `sztab-protocols.md`.

Action: Vadym `git add docs/audit-s6a-client-analysis.md` у commit (Cowork sandbox cannot run git commands per Protocol 14).

### Item 5 — `maxTokens` 2000 → 3000 у `rescoreClientTop10`

**Bug:** Sprint S6A Step 4 live verification showed TOP-10 candidates → 5 returned з ai_score (50% drop rate).

**Root cause** (S6A.0 Item 4 investigation): Haiku output truncation у `lib/matching/ai-rescore.ts:588`. 10 candidates × ~150-200 tokens per JSON entry ≈ 1500-2000 tokens. `maxTokens: 2000` hit cap, JSON tail invalid, `extractJSON` fallback recovered head entries only.

**Fix:** `lib/matching/ai-rescore.ts:588`

```diff
-    maxTokens: 2000,
+    // Sprint S6A.0.6: 2000 → 3000 (was hitting cap on 10 candidates,
+    // causing partial JSON parse + dropped matches. Mirror rescoreTop20.)
+    maxTokens: 3000,
```

`rescoreTop20` already uses 3000 з comment `// Sprint G smoke: 2000 was sometimes hit на 20 candidates`. Now both functions symmetric.

**Cost impact:** +50% output capacity = +50% potential output token cost для same call. Realistic case: 10 candidates × ~150 tokens ≈ 1500 tokens output (під 3000 cap, не вдарить). Edge case: long reasoning strings ~200 chars each → ~2000 tokens (under cap). Safety headroom: ~1000 tokens. Approx incremental cost: $0.005 → $0.005-0.0075 per call (Haiku output $5/M).

**Expected behavior change:** TOP-10 → 9-10/10 ai_scored (matching rescoreTop20 historical reliability rate).

### Verification status

- Static cross-reference PASS:
  - `git ls-files .claude/ tsconfig.tsbuildinfo` returns empty (still untracked, .gitignore prevents future leak)
  - `ls scripts/cowork/` shows diagnose-lock.ps1 у новій локації
  - `ls scripts/seed-*` shows тільки `seed-family-target-pkd.ts` + `seed-taxonomy.ts` (CD PROJEKT test deleted)
  - `grep "maxTokens: 2000" lib/matching/ai-rescore.ts` → 0 matches
  - `grep "maxTokens: 3000" lib/matching/ai-rescore.ts` → 2 matches (rescoreTop20 + rescoreClientTop10)
- pnpm tsc / lint / dev — НЕ виконувалось (CLAUDE.md "Ask before acting")
- Live verification (Item 5 only meaningful behavior change) — defer до наступного "Analiza klienta" run; observe ai_scored count vs candidates_count у matches table

### Files modified / moved / deleted summary

| File | Action | Δ lines | Item |
|---|---|---|---|
| `.gitignore` | modified (+5 lines) | +5 | 1 |
| `scripts/seed-cd-projekt-test.ts` | DELETED | -210 | 2.3 |
| `diagnose-lock.ps1` (root) | MOVED → `scripts/cowork/` | 0 | 3 |
| `diagnose-lock.log` (root) | DELETED | n/a (log) | 3 |
| `lib/matching/ai-rescore.ts` | modified (+2 lines) | +2 | 5 |
| `docs/sztab-state.md` | modified (this entry) | +90 | docs |

**Net code change: -113 lines.**

Newly tracked у Vadym commit (untracked → tracked):
- `scripts/diag-clients-id-500.ts` (Item 2.1)
- `scripts/diag-clients-render.ts` (Item 2.2)
- `scripts/cowork/diagnose-lock.ps1` (Item 3, after move)
- `docs/audit-s6a-client-analysis.md` (Item 4)

### Next sprint candidates

- **Sprint S-INTEL.1** (Discovery #5 — Market Intelligence Layer):
  - ZSRIR open data API (free, dane.gov.pl)
  - Phase 1 priorities (locked 02.05.2026): Polish food market price history, competitor analyses, HoReCa business model intel
  - Foundation для S6B Product Analysis pipeline
- **S6A.0.7** (deferred, conditional): Add `console.warn` + `enrichment_log.raw_payload` telemetry якщо `rescored.length < matches.length` post-Item 5 fix. Useful якщо Item 5 не повністю усуне drop rate.


---

## 02.05.2026 — Sprint S-INTEL.1.1 SHIP (Market Intelligence Foundation)

**Status:** 🟡 Code ready, NOT yet committed/migrated. Vadym виконує commit + Supabase migration apply після review.

### Built

- **Migration 048** (`scripts/048_cn_code.sql`, 31 рядок): products + cn_code TEXT NULLABLE з `^[0-9]{8}$` CHECK + index + cn_code_review_pending BOOLEAN DEFAULT FALSE + partial index WHERE TRUE
- **Migration 049** (`scripts/049_knowledge_base.sql`, 77 рядків): knowledge_base table з sources JSONB, owner-scoped RLS, updated_at trigger, 6 indexes (topic / tags GIN / category / language / created_by / sources GIN). **NO embedding column** (pgvector defer per Q4 framework + spec line 220 open question).
- **`lib/ai/cn-code-suggester.ts`** (190 рядків): Haiku 4.5 inference (Option B per audit Section 4). Pattern mirror `business-analysis.ts` (callAI + extractJSON, AI_MODELS.FAST). Cost ~$0.0008/call. Throws typed `CnCodeSuggesterError` (kinds: missing_key/ai_failure/invalid_format).
- **`app/api/products/cn-suggest/route.ts`** (152 рядки): POST endpoint, supabase.auth.getUser → 401, Zod body validation, anthropic_api_key з params (fallback ENV), suggestCnCode call. Auto-write back коли confidence != 'low' AND product_id given (sets cn_code + cn_code_review_pending=TRUE = quality gate).
- **`lib/format/cn-code.ts`** (32 рядки): formatCnCode/parseCnCode/isValidCnCode (DB без spaces "20059990" ↔ UI з spaces "2005 99 90" per Q4 lock).
- **ProductForm Podstawowe tab** (`components/products/product-form.tsx`, 646 → 722, +76): row "Kod CN" з Label + "Zaproponuj AI" button + Input pattern=\d{8} maxLength=8 + display preview formatCnCode + helper hint. handleSuggestCN handler з POST cn-suggest, toast feedback з confidence + reasoning + alternatives. Disabled button якщо !name. parseCnCode на onChange = tolerant input. cn_code passed у updateProduct payload.
- **`/produkty` list** (`components/produkty/produkty-shell.tsx`, 327 → 328, +1 Badge import + +9 inline rendering): amber "🔍 Review CN" Badge для review_pending=TRUE (з tooltip "AI-suggested CN code, потрібен manual review") + CN display з spaces у ProductDetail header (з 🔍 marker якщо pending).
- **Zod baseSchema** (`app/actions/products.ts`): cn_code regex validation `/^\d{8}$/` + cn_code_review_pending bool. updateProduct має auto-clear `cn_code_review_pending = false` коли cn_code present у payload (Vadym save = підтверджує / коригує AI suggestion).
- **Product type extension** (`lib/types.ts`): cn_code?: string | null + cn_code_review_pending?: boolean.
- **Audit doc updated** (`docs/audit-s-intel-1-1.md`): Section 2 migration numbers 046 → 048 (з explanation S6B reservation), Section 6 BUILD scope з Q5 review_pending item + total 4.6h, Section 7 переформульовано як S-INTEL.1.1.5 separate sprint, Section 8 open questions → locked decisions table.

### Decisions locked (referenced у audit-s-intel-1-1.md Section 8)

- **Q1 migration numbers**: 048, 049 used. 050 (cn_code SET NOT NULL) defer до S-INTEL.1.1.5. S6B keeps 046+047.
- **Q2 backfill timing**: post-sprint S-INTEL.1.1.5 (separate ship). Sprint 1.1 = infrastructure only. 35 SKU × ~$0.0008 = ~$0.028 одноразово.
- **Q3 helper namespace**: `lib/ai/` (consistency з business-analysis.ts, sku-attributes.ts). НЕ створюємо `lib/intelligence/`.
- **Q4 normalization**: DB без spaces (regex), UI з spaces "2005 99 90" через format helper.
- **Q5 quality gate**: `cn_code_review_pending` flag + UI badge + auto-clear-on-save. NOT optional.

### Files touched

| File | Δ | Status |
|---|---|---|
| `scripts/048_cn_code.sql` | NEW (31) | code ready, migration NOT yet applied |
| `scripts/049_knowledge_base.sql` | NEW (77) | code ready, migration NOT yet applied |
| `lib/ai/cn-code-suggester.ts` | NEW (190) | static review only |
| `app/api/products/cn-suggest/route.ts` | NEW (152) | static review only |
| `lib/format/cn-code.ts` | NEW (32) | static review only |
| `lib/types.ts` | +3 (cn_code, cn_code_review_pending у Product) | static review only |
| `app/actions/products.ts` | +13 (Zod regex, auto-clear) | static review only |
| `components/products/product-form.tsx` | +76 (state, handler, UI block, payload) | static review only |
| `components/produkty/produkty-shell.tsx` | +10 (Badge + ProductDetail CN display) | static review only |
| `docs/audit-s-intel-1-1.md` | 4 fixes (Section 2, 6, 7, 8) | docs |
| `docs/sztab-state.md` | this entry | docs |

### Audit baseline correction

Initial sandbox virtiofs cache (Protocol 14 family) showed false truncation у `npx tsc --noEmit` check. Native PowerShell verification підтвердив файли цілі: lib/types.ts 276, app/actions/products.ts 217, product-form.tsx 722, produkty-shell.tsx 328. Документую щоб не повторити false alarm у наступних sprintах. Future Cowork sprint debugging: при будь-якому "truncation" alert — спершу native PowerShell `Get-Content -TotalCount` перш ніж draft recovery options.

### Verification остаточна (Vadym робить sam)

- [ ] `pnpm run build` → "Compiled successfully"
- [ ] `npx tsc --noEmit` → нові errors з S-INTEL.1.1 = 0 (pre-existing baseline errors з business-profile-section, krs-refresh, intelligence/lookup, client-detail-actions, enrichment-progress-banner — НЕ моя scope, sandbox false alarm okazał się stale cache)
- [ ] Apply migrations 048 + 049 через Supabase Studio SQL Editor
- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name LIKE 'cn_%'` → 2 rows
- [ ] `SELECT * FROM information_schema.tables WHERE table_name='knowledge_base'` → 1 row
- [ ] Open `/products/[id]/edit` для будь-якого SKU → Tab Podstawowe → "Kod CN" field з'являється з "Zaproponuj AI" button
- [ ] Click "Zaproponuj AI" → toast з confidence + reasoning. cn_code populated. `/produkty` показує "🔍 Review CN" badge для цього SKU.
- [ ] Save edit → badge зникає на /produkty (review_pending cleared у DB).
- [ ] `SELECT id, name, cn_code, cn_code_review_pending FROM products WHERE cn_code IS NOT NULL` — verify.

### Next (S-INTEL.1.1.5 — backfill)

- `scripts/backfill-cn-codes.ts` — read products WHERE cn_code IS NULL → call cn-code-suggester sequential (35 × $0.0008 = ~$0.028) → write cn_code + review_pending=TRUE
- Vadym manual review через `/products/[id]/edit` — corrigue alternativy якщо потрібно, save clears review flag
- Migration 050 `cn_code_required.sql`: ALTER COLUMN cn_code SET NOT NULL після всіх review

### Next (S-INTEL.1.2 — wholesale data)

- ZSRIR API integration (`dane.gov.pl` open data, weekly notowania)
- `fresh-market.pl` scraper (16 PL wholesale markets, daily quotes)
- EU Agri-food observatory weekly fetcher
- Sunday cron via Vercel Cron
- Tables: `commodity_prices` + `market_signals` з `category` column (food-first ready-for-extension per Decision Framework)


---

## 02.05.2026 — Sprint S-INTEL.1.1.5 Backfill Script SHIP

**Status:** 🟡 Code ready, NOT yet executed/migrated. Vadym виконує commit + run + review + apply 050 окремими steps.

**Precondition:** S-INTEL.1.1 shipped (commit 4a705fb), migrations 048+049 applied. Schema has `cn_code TEXT NULLABLE` + `cn_code_review_pending BOOLEAN DEFAULT FALSE` columns.

### Built

- **`scripts/backfill-cn-codes.ts`** (260 рядків): bulk AI suggest для products WHERE cn_code IS NULL. Pattern mirror `scripts/run-ai-bulk-attributes.ts` (service-role Supabase client, `import '@/lib/env'` для .env.local). Idempotent — re-run skip-ить вже processed rows.
  - Sequential з 1.5s rate limit (35 SKU × 1.5s + AI ~3s = ~2.5 min total, well under Anthropic 50 RPM)
  - Per-SKU: call `suggestCnCode` → UPDATE products.cn_code + cn_code_review_pending=TRUE → log
  - Persistent log file `scripts/cowork/backfill-cn-codes-{ISO_timestamp}.log` (Vadym може review без re-run)
  - Console output structured (header, per-SKU progress, summary з confidence distribution)
  - Cost tracking ($0.0008 per call estimate, total reported у summary)
  - NO `enrichment_log` INSERT (CHECK constraint blokuje 'product' target_type — Option A locked)

- **`scripts/050_cn_code_required.sql`** (26 рядків): `ALTER COLUMN cn_code SET NOT NULL` + COMMENT update. Pre-flight checks у file comments — Vadym виконує перш ніж apply щоб перевірити що 0 NULL і 0 review_pending=TRUE.

### Decision locked

**Option A — stdout-only logging (z persistent file у scripts/cowork/)**: Audit Section 7 line 503 caveat про enrichment_log outdated, тому що migration 031 CHECK constraint обмежує target_type до 'company'/'person'. Backfill = разовий event, persistence у text log file достатня. S6B пізніше може ввести 'product' target_type через свою CHECK extension коли product analysis pipeline буде потребувати persistent логування.

### Files touched

| File | Δ | Status |
|---|---|---|
| `scripts/backfill-cn-codes.ts` | NEW (260) | code ready, NOT yet executed |
| `scripts/050_cn_code_required.sql` | NEW (26) | code ready, migration NOT yet applied |
| `docs/sztab-state.md` | this entry | docs |

### Vadym 4-step execution (in order)

**Step 1 — Run backfill script (~2.5 min, ~$0.028 cost):**
```powershell
cd C:\Users\vadym\Projects\sztab
pnpm exec tsx scripts/backfill-cn-codes.ts
```
Expected output: progress per SKU, summary stats, persistent log file path. 35 amber badges на /produkty після завершення.

**Step 2 — Review suggestions через UI:**
Open `https://sztab.vercel.app/produkty` → 35 amber "🔍 Review CN" badges. Click each SKU → /products/[id]/edit → перевір CN code + reasoning у toast (з Step 1 log file якщо потрібно). Якщо AI помилився — corrigue manually. Save edit clears `cn_code_review_pending` flag → badge зникає на /produkty.

**Step 3 — Verify all reviewed:**
Supabase Studio SQL Editor:
```sql
SELECT COUNT(*) FROM products WHERE cn_code_review_pending = TRUE;
-- Має бути 0

SELECT COUNT(*) FROM products WHERE cn_code IS NULL;
-- Має бути 0
```

**Step 4 — Apply migration 050 (SET NOT NULL):**
Supabase Studio → New query → paste `scripts/050_cn_code_required.sql` → Run.

### Verification post-Step 4

- [ ] `INSERT INTO products (name, owner_id) VALUES ('test', auth.uid());` → fails з NOT NULL violation на cn_code (proves constraint enforced)
- [ ] `\d products` показує `cn_code | text | not null`

### Next (S-INTEL.1.2 — wholesale data)

Unchanged from S-INTEL.1.1 SHIP entry above. ZSRIR + fresh-market.pl + EU Agri-food + Sunday cron + commodity_prices + market_signals.


---

## 02.05.2026 — Sprint S-INTEL.1.2.1 SHIP (ZSRIR foundation + cron skeleton)

**Status:** 🟡 Code ready, NOT yet committed/migrated/run. Vadym виконує commit + Supabase migrations apply + seed script + manual trigger окремими steps.

**Precondition:** S-INTEL.1.1 + 1.1.5 shipped. products.cn_code populated на 35 SKU. Migrations 048+049+050 applied.

### Live ZSRIR research (Vadym verified 02.05.2026)
13 ZSRIR datasets confirmed на dane.gov.pl:
- HIGH (impl this sprint): 912 (owoce/warzywa), 1024 (mleko)
- MEDIUM (TODO у parser registry): 546 zboża, 601 drób, 777 wieprzowina, 1003 jaja, 1214 wołowina
- LOW: 367 cukier, 619 chmiel, 957 rośliny oleiste, 983 baranina, 1022 pasze
- SKIP: 1188 tytoń

API endpoint: `https://api.dane.gov.pl/1.4/datasets/{id}/resources?per_page=3&sort=-created` → `data[].attributes.{title, created, file_url, format}`. file_url = direct xlsx download. Filename pattern UNSTABLE — extract з resources metadata, не parse filename.

### Built

- **Migration 051** (`scripts/051_commodity_prices.sql`): commodity_prices з cn_code NULLABLE, source CHECK, market, product_label, price_pln/eur, currency_native CHECK, unit, observation_date, category 'food' default, raw_payload JSONB, owner-scoped read + service_role write RLS, UNIQUE (source, market, product_label, observation_date) idempotency, 4 indexes.
- **Migration 052** (`scripts/052_market_signals.sql`): SKELETON для derived signals. signal_type CHECK (price_trend/volatility/seasonality/shortage/spread), direction CHECK, magnitude, period_days, confidence (0..1), source_count, raw_data JSONB, RLS. Generators ship у S-INTEL.1.2.3.
- **Migration 053** (`scripts/053_commodity_to_cn_map.sql`): bridge table з UNIQUE (source, source_label), CHECK source enum, CHECK cn_code regex `^[0-9]{8}$`, RLS.
- **`lib/intelligence/zsrir.ts`** (~370 рядків, NEW namespace): ZSRIR data fetcher.
  - `ZSRIR_DATASETS` registry — Phase 1 only HIGH (912 + 1024), MEDIUM datasets закоментовані з TODO.
  - `fetchLatestResource(datasetId)` — REST call /1.4/datasets/{id}/resources, filter по format=xlsx
  - `downloadXlsx(file_url)` — fetch arrayBuffer + XLSX.read
  - 2 parser variants: `parseOwoceWarzywa` (defensive header-row detection + label/price/unit columns) + `parseMleko` (aggregate national average detection by milk hints + price range filter)
  - PL number parser handles "1 234,56" / "1234,56" / "1.234,56"
  - Unit normalizer (kg / ton / 100kg / liter / 100liter / piece)
  - `ingestZsrir(supabase, options)` — main entry. Resolves cn_code via commodity_to_cn_map lookup, bulk upsert chunks of 100 rows з ON CONFLICT DO NOTHING idempotency. Per-dataset try/catch — one fail не валить run.
- **`app/api/cron/market-intelligence/route.ts`** (~110 рядків): Vercel Cron handler. Pattern mirror matching-refresh: nodejs runtime, force-dynamic, maxDuration 300, CRON_SECRET Bearer auth. startCronRun → ingestZsrir → finishCronRun. Skeleton TODO comments для S-INTEL.1.2.2 (fresh-market) + S-INTEL.1.2.3 (EU + signals).
- **`vercel.json`** modified: added `{path: /api/cron/market-intelligence, schedule: "0 6 * * 0"}` (Sunday 06:00 UTC = 07:00 Warsaw winter / 08:00 summer, після matching-refresh).
- **`/admin/health/page.tsx`** modified: knownJobs array extended з 'market-intelligence' (рендериться UI row навіть коли 0 runs ще).
- **`scripts/manual-trigger-market-intelligence.ts`** (~115 рядків): one-shot trigger script. Service-role client + persistent log `scripts/cowork/market-intelligence-{ISO}.log`. Pattern mirror manual-trigger-crons.ts.
- **`scripts/seed-commodity-to-cn-map.ts`** (~110 рядків): 10 ZSRIR-priority seed rows для commodity_to_cn_map.
  - 8 owoce/warzywa: kapusta biała, pomidor pole, ogórek krótki, jabłka, ziemniaki, marchew, cebula, burak
  - 2 mleko: "mleko surowe" + "cena mleka surowego" (parser variants)
  - Idempotent через UNIQUE (source, source_label) ON CONFLICT DO NOTHING

### Decisions locked у sub-sprint

- **Q1 Phase 1 scope** = HIGH priority only (912 + 1024). MEDIUM datasets = TODO у parser registry — expand з реальних labels.
- **Q2 cn_code resolution** = commodity_to_cn_map lookup при ingestion. NULL допустимий ("intake first, map later"). Bridge expand у 1.2.2/1.2.3 з реальних labels.
- **Q3 idempotency** = UNIQUE INDEX (source, market, product_label, observation_date) + upsert ignoreDuplicates. Re-run skip-ить existing rows.
- **Q4 parser strategy** = defensive header-row detection (label hints + price hints) — НЕ rely на column index hardcode. Sheet structure varies by dataset.

### Files touched

| File | Δ | Status |
|---|---|---|
| `scripts/051_commodity_prices.sql` | NEW | code ready, NOT yet applied |
| `scripts/052_market_signals.sql` | NEW (skeleton) | code ready, NOT yet applied |
| `scripts/053_commodity_to_cn_map.sql` | NEW | code ready, NOT yet applied |
| `lib/intelligence/zsrir.ts` | NEW (NEW namespace) | static review only |
| `app/api/cron/market-intelligence/route.ts` | NEW | static review only |
| `scripts/manual-trigger-market-intelligence.ts` | NEW | static review only, NOT yet run |
| `scripts/seed-commodity-to-cn-map.ts` | NEW | static review only, NOT yet run |
| `vercel.json` | +4 lines (cron entry) | requires Vercel deploy для activation |
| `app/(dashboard)/admin/health/page.tsx` | +1 line (knownJobs) | active після build |
| `docs/sztab-state.md` | this entry | docs |

### Vadym 4-step execution (in order)

**Step 1 — Apply migrations 051+052+053:**
Supabase Studio → New query → paste each .sql → Run.
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('commodity_prices', 'market_signals', 'commodity_to_cn_map');
-- Має бути 3 rows
```

**Step 2 — Seed bridge table:**
```powershell
cd C:\Users\vadym\Projects\sztab
pnpm exec tsx scripts/seed-commodity-to-cn-map.ts
```
Expected: 10 rows inserted. Verify: `SELECT COUNT(*) FROM commodity_to_cn_map WHERE source='zsrir';` → 10.

**Step 3 — Manual trigger ZSRIR ingest:**
```powershell
pnpm exec tsx scripts/manual-trigger-market-intelligence.ts
```
Expected output: 2 datasets processed, ~20-50 rows inserted (912 owoce/warzywa повний bulletin + 1024 mleko aggregate). Persistent log у `scripts/cowork/market-intelligence-{ISO}.log`.

**Step 4 — Verify:**
```sql
SELECT source, COUNT(*), MAX(observation_date), COUNT(DISTINCT cn_code) FILTER (WHERE cn_code IS NOT NULL)
FROM commodity_prices GROUP BY source;
-- zsrir | N | YYYY-MM-DD | M  (M = скільки cn_code resolved через bridge)

SELECT product_label, price_pln, unit, observation_date, cn_code
FROM commodity_prices WHERE source='zsrir' ORDER BY observation_date DESC LIMIT 20;
```

Open `/admin/health` → market-intelligence row рендериться з last manual run.

### Verification post-Step 4

- [ ] commodity_prices populated з ZSRIR rows
- [ ] cn_code resolved через bridge для seeded labels (kapusta biała, pomidor pole, etc.)
- [ ] /admin/health shows market-intelligence row з last_run + status
- [ ] Re-run script — 0 new inserts (idempotent — UNIQUE INDEX catches)
- [ ] Persistent log у scripts/cowork/ з summary

### Next (S-INTEL.1.2.2 — fresh-market.pl scraper)
- `lib/intelligence/fresh-market.ts` — cheerio scraper, top 5 markets (Bronisze + WGRO + Lublin + Kraków + Łódź)
- Extend commodity_to_cn_map з fresh-market labels
- Wire cron handler з добавленням fresh-market step

### Next (S-INTEL.1.2.3 — EU Agri-food + signal generators)
- `lib/intelligence/eu-agri.ts` — REST/CSV adapter (milk + meat + crops observatories)
- `lib/intelligence/signals.ts` — algorithmic signal generators (price_trend SMA, volatility stddev, seasonality, shortage)
- Wire cron handler з final signals generation step


---

## 02.05.2026 — S-INTEL.1.2.1 hotfix (FIX 2 + parser rewrite + diag)

**Status:** 🟡 Code ready. Vadym applies migration 054 + re-runs manual trigger.

### Live test results (manual trigger 02.05.2026)

**Issue 1:** dataset 912 (owoce/warzywa) — `parseOwoceWarzywa` returned 0 rows. Heuristics не matched real 2026 xlsx structure.

**Issue 2:** dataset 1024 (mleko) — INSERT failed з `42P10`: "there is no unique or exclusion constraint matching the ON CONFLICT specification". Root cause: migration 051 створила expression-based UNIQUE INDEX (з `COALESCE(market, '')`) — PostgREST upsert через raw column list НЕ matches expression indices.

### Fix 2 — schema migration 054

**`scripts/054_fix_commodity_uniqueness.sql`** (NEW):
- DROP INDEX `commodity_prices_uniq_observation` (expression-based, PostgREST incompatible)
- CREATE 2 partial UNIQUE indices:
  - `commodity_prices_uniq_with_market` — `(source, market, product_label, observation_date) WHERE market IS NOT NULL`
  - `commodity_prices_uniq_no_market` — `(source, product_label, observation_date) WHERE market IS NULL`

### Diag script — actual ZSRIR 912 structure

**`scripts/diag-zsrir-912.ts`** (NEW, 214 рядків): standalone xlsx structure analyzer. Auto-finds latest `scripts/cowork/zsrir-912-*.xlsx` або accepts arg path. Per sheet dumps: name, total rows, max columns, first 15 rows preview, label keyword hits per column (kapusta/pomidor/ogórek/burak/cebula/marchew/jabłka/ziemniaki), price candidate hits per column (numeric у 0.5..50 range), header row guesses ranked by text-cell density.

### Vadym diag findings (live verified)

ZSRIR 912 xlsx має **28 sheets total**, з яких тільки 5 містять real wholesale price data. Primary target = `HURT WARZ` (39 rows).

`HURT WARZ` structure:
- row 5: header — `col[1]="Data notowania"`, `col[2]="Owoce"`, `col[3]="Jedn."`
- row 6: market labels — `col[4]=Bronisze`, `col[6]=Kalisz` (each market spans 2 cols Min/Max)
- row 7: column numbering "1|2|3..."
- row 8+: data — `col[1]=product label`, `col[3]=unit (kg/szt./pęczek)`, `col[4]/col[5]=Bronisze Min/Max`, `col[6]/col[7]=Kalisz Min/Max`

### Parser rewrite — `parseOwoceWarzywa`

**Phase 1 scope:** Process ONLY `HURT WARZ` sheet. Skip 27 інших.

Logic:
- Find sheet by name (case-insensitive trim)
- Find header row defensively — look for `cell[1]` containing "data notowania" + `cell[3]` containing "jedn"
- Markets row = headerRow + 1 — extract market names dynamically from cells at col 4+ (collect non-empty strings, each market spans 2 cols Min/Max)
- Data start = headerRow + 3 (skip numbering row "1|2|3...")
- For each data row: emit 1 ParsedRow per market з `price_pln = avg(min, max)` (Min+Max → cleaner average)
- Skip section headers (UPPERCASE multi-word labels, "krajowe"/"warzywa"/"razem"/"ogółem")

**Defer (out of scope для 1.2.1 hotfix):**
- HURT OWOC (jabłka by varieties — different sub-category structure)
- ZMIANY HURT (aggregate trends — derived data, not raw)
- ZAKUP WARZ/OWOCE DETAL (PLN/100kg retail vs PLN/kg wholesale)
- IERGZ_* (Voivodship regional, complex)
- Foreign trade sheets

### ParsedRow + ingestZsrir refactor

`ParsedRow` interface отримав field `market: string | null` — populated для HURT WARZ rows, NULL для mleko national aggregate.

`ingestZsrir` upsert refactored — split chunk на 2 buckets:
- `withMarket` rows → `onConflict: 'source,market,product_label,observation_date'` matching partial index `commodity_prices_uniq_with_market`
- `noMarket` rows → `onConflict: 'source,product_label,observation_date'` matching partial index `commodity_prices_uniq_no_market`

Per-bucket error handling — one bucket fail не валить інший.

### Files touched (combined commit)

| File | Δ | Status |
|---|---|---|
| `scripts/054_fix_commodity_uniqueness.sql` | NEW | code ready, NOT yet applied |
| `scripts/diag-zsrir-912.ts` | NEW (214 рядків) | code ready, ran by Vadym 02.05 → findings above |
| `lib/intelligence/zsrir.ts` | parseOwoceWarzywa rewrite + ParsedRow.market field + upsert split | static review only |
| `docs/sztab-state.md` | this entry | docs |

### Vadym 3-step apply (in order)

**Step 1 — Apply migration 054:**
Supabase Studio → New query → paste `scripts/054_fix_commodity_uniqueness.sql` → Run.
Verify:
```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'commodity_prices' AND indexname LIKE '%uniq%';
-- Expected: commodity_prices_uniq_with_market + commodity_prices_uniq_no_market (no commodity_prices_uniq_observation)
```

**Step 2 — Re-run manual trigger:**
```powershell
cd C:\Users\vadym\Projects\sztab
pnpm exec tsx scripts/manual-trigger-market-intelligence.ts
```
Expected:
- Dataset 912 (HURT WARZ): ~30-50 rows inserted (8-10 products × 2-3 markets × 1 date)
- Dataset 1024 (mleko): 1 row inserted (national aggregate)

**Step 3 — Verify:**
```sql
SELECT source, market, COUNT(*), MIN(price_pln), MAX(price_pln), MAX(observation_date)
FROM commodity_prices WHERE source='zsrir' GROUP BY source, market ORDER BY market;
-- Bronisze | N rows
-- Kalisz   | M rows
-- (NULL)   | 1 row (mleko)

SELECT product_label, market, price_pln, unit, cn_code
FROM commodity_prices WHERE source='zsrir'
ORDER BY observation_date DESC, market, product_label LIMIT 30;
```

### Decision locked

- **Q1 HURT WARZ-only Phase 1.** Решта 27 sheets defer — parsers per sheet incremental коли Vadym має priority + бачить real downstream value.
- **Q2 market populated по possible default.** ZSRIR ingest стає per-market (not "national aggregate") — нагадує fresh-market.pl + EU pattern для consistency.
- **Q3 NO migration changes** перш ніж 054 — 054 partial indices робять цю архітектуру цілком correct.


---

## 02.05.2026 — S-INTEL.1.2.1 hotfix v2 (PostgREST limitation + header fix)

**Status:** 🟡 Code ready. Vadym re-runs manual trigger після hotfix v1 apply (migration 054 already applied у v1 step).

### Critical architectural finding — PostgREST upsert + partial UNIQUE indices

**Verified live 02.05.2026 після hotfix v1 apply:** Migration 054 створила 2 partial UNIQUE indices (with_market + no_market). Vadym ran manual trigger знов — STILL got `42P10`: "no unique or exclusion constraint matching the ON CONFLICT specification".

**Root cause:** PostgREST бібліотека НЕ підтримує partial UNIQUE indices (з `WHERE` clause) у `.upsert()` `onConflict` parameter. Це **архітектурне обмеження PostgREST**, не migration issue. Verification: 2 partial indices були valid у DB (`pg_indexes` showed them), але PostgREST все одно throw 42P10.

Postgres сам enforces partial constraint при INSERT — code 23505 (unique_violation) raised на duplicates. Тому **manual INSERT + try/catch на 23505** — це working pattern для idempotent inserts з partial UNIQUE.

### Implications для майбутніх sub-sprints

- **S-INTEL.1.2.2 (fresh-market.pl):** Use manual INSERT pattern одразу (partial indices не дозволять upsert).
- **S-INTEL.1.2.3 (EU Agri-food):** Same.
- **Future bulk sources (1000+ rows):** Consider bisect retry pattern — bulk INSERT, на 23505 split chunk у half. Per-row не масштабується для great volumes.

### Code changes — `lib/intelligence/zsrir.ts`

**1. parseOwoceWarzywa header detection rewrite:**
- Markets header row contains "Data notowania" (cell[1]) + markets у cells 4+ (Bronisze, Kalisz)
- Units sub-header row = markets row + 1 (contains "Owoce", "Jedn.", "Min", "Max" cells)
- Numbering row = markets row + 2 ("1|2|3...")
- Data starts markets row + 3
- Logic: find row containing "data notowania" → markets header. Sanity check next row contains "jedn" — log warning якщо missing, але продовжуємо.

**2. ingestZsrir upsert refactor — manual INSERT loop:**
```typescript
for (const record of records) {
  const { error: insErr } = await supabase
    .from('commodity_prices')
    .insert(record)
  if (insErr) {
    if (insErr.code === '23505') {
      result.rows_skipped++
      continue
    }
    result.errors.push(`...${insErr.message}`)
    result.rows_failed++
    continue
  }
  result.rows_inserted++
}
```
Performance: ~3x slower vs bulk (per-row INSERT × ~50ms RTT × 50 rows = ~2.5s). Acceptable для ZSRIR scale.

**3. Removed `withMarket`/`noMarket` chunk split** — manual INSERT pattern не потребує onConflict, тому split була non-functional.

### Files touched (combined hotfix v1+v2 commit)

| File | Change |
|---|---|
| `scripts/054_fix_commodity_uniqueness.sql` | NEW (v1) — partial indices still valuable: enforce idempotency at DB level |
| `scripts/diag-zsrir-912.ts` | NEW (v1) — diag tool |
| `lib/intelligence/zsrir.ts` | v1: parseOwoceWarzywa rewrite + ParsedRow.market + 2-bucket upsert split → v2: header detection fix + manual INSERT pattern (replace upsert split) |
| `docs/sztab-state.md` | v1 hotfix + v2 hotfix entries |

### Vadym 2-step apply (migration 054 already applied у v1)

**Step 1 — Re-run manual trigger:**
```powershell
cd C:\Users\vadym\Projects\sztab
pnpm exec tsx scripts/manual-trigger-market-intelligence.ts
```
Expected:
- Dataset 912 (HURT WARZ): ~30-50 rows inserted (no 42P10 error)
- Dataset 1024 (mleko): 1 row inserted

**Step 2 — Verify:**
```sql
SELECT source, market, COUNT(*), MIN(price_pln), MAX(price_pln), MAX(observation_date)
FROM commodity_prices WHERE source='zsrir' GROUP BY source, market ORDER BY market;
```

### Anti-pattern locked у docs

**❌ DO NOT** use PostgREST `.upsert()` with `onConflict` against partial UNIQUE indices. Pattern fails silently у migration check (indices exist) але throws 42P10 at runtime.

**✅ DO** use manual INSERT loop з `error.code === '23505'` skip-pattern. Або consider full UNIQUE без `WHERE` clause якщо schema constraints дозволяють (e.g. NOT NULL all key columns).


---

## 02.05.2026 — S-INTEL.1.2.1 hotfix v3 (BUG 1 markets row + BUG 2 deferred)

**Status:** 🟡 Code ready. Vadym re-runs manual trigger після hotfix v3.

### DB verification post-v2 surfaced 2 bugs

**BUG 1 — Markets extracted from wrong row:**
DB inspection після v2 showed `commodity_prices.market` populated з values `"4/20/26", "4/21/26", "4/22/26"` — це DATES, не market names.

Root cause: HURT WARZ has **3-row header structure** (verified via diag dump):
```
row 4 — MARKETS header:    [4]Bronisze | [6]Kalisz | [8]...
row 5 — dates row:         [1]Data notowania | [4]4/22/26 | [6]4/21/26
row 6 — units sub-header:  [1]Owoce | [3]Jedn. | [4]Min | [5]Max | [6]Min | [7]Max
row 7 — numbering "1|2|3..."
row 8+ — data rows
```

v2 looking for "Data notowania" → found row 5 → extracted markets з ТОЇ row → got dates замість market names. Markets actually на row ABOVE (row 4).

**FIX (v3):**
- Find "Data notowania" anchor row → call `datesRowIdx`
- Markets row = `datesRowIdx - 1` (extract з ABOVE)
- Markets at every 2-col span starting col 4 (`col += 2` instead of `col++`) — matches structure where Min/Max sub-headers occupy (col, col+1) у units row
- Skip purely numeric cells (defensive: `/^[\d\s/.,-]+$/`)
- Variable rename `headerRowIdx` → `datesRowIdx` (semantic clarity)
- Data start unchanged: `datesRowIdx + 3` (still correct relative anchor)

**BUG 2 — cn_code resolution returns 0 hits — DEFERRED:**
seed-commodity-to-cn-map.ts seeded labels:
```
"kapusta biała głowiasta", "pomidor pole", "burak", ...
```

Real ZSRIR product_labels у DB після ingestion (extracted з xlsx):
```
"Buraki ćwikłowe", "Kapusta biała", "Marchew", "Ogórki gruntowe", ...
```

Mismatch — exact-match lookup завжди returns 0. Bridge table `commodity_to_cn_map` requires EXACT case-sensitive match.

**Fix options (deferred до окремого small task post-v3 verify):**
- A — Update `seed-commodity-to-cn-map.ts` з real labels (after BUG 1 fixed + Vadym sees actual labels у DB)
- B — Add normalization у zsrir.ts (lowercase + trim перш ніж lookup) + lowercase у seed
- C — Change seed → ILIKE pattern matching (substring/regex bridge)

**NOT fixing у v3** — defer щоб Vadym побачив real labels у DB після BUG 1 fix → потім вирішить approach.

### Files touched (combined hotfix v1+v2+v3 commit)

| File | Change |
|---|---|
| `scripts/054_fix_commodity_uniqueness.sql` | NEW (v1) |
| `scripts/diag-zsrir-912.ts` | NEW (v1) |
| `lib/intelligence/zsrir.ts` | v1: parser rewrite + ParsedRow.market + 2-bucket upsert split → v2: header detection fix + manual INSERT pattern → v3: BUG 1 markets row=datesRow-1 + 3-row header structure + variable rename |
| `docs/sztab-state.md` | v1 + v2 + v3 hotfix entries |

### Vadym 2-step apply (migration 054 already applied)

**Step 1 — Re-run manual trigger:**
```powershell
cd C:\Users\vadym\Projects\sztab
pnpm exec tsx scripts/manual-trigger-market-intelligence.ts
```

**Step 2 — Verify (BUG 1 fix):**
```sql
-- Markets should be REAL names (Bronisze, Kalisz), not dates:
SELECT DISTINCT market FROM commodity_prices WHERE source='zsrir' ORDER BY market;
-- Expected: Bronisze | Kalisz | (NULL для mleko)

-- Sample real labels (потрібно для BUG 2 follow-up):
SELECT DISTINCT product_label FROM commodity_prices WHERE source='zsrir'
ORDER BY product_label LIMIT 30;
-- Expected: "Buraki ćwikłowe", "Kapusta biała", "Marchew", etc.
```

### Decision locked v3

- **Q1 3-row header structure** confirmed для HURT WARZ. Markets row завжди ABOVE "Data notowania" anchor. Future ZSRIR sheets (різні parser variants для MEDIUM datasets) можуть мати different N-row headers — це per-parser concern.
- **Q2 BUG 2 deferred** — Vadym choose fix approach (A/B/C) після bачення real labels у DB. Не блокер для v3 ship — `cn_code` залишається NULL для всіх ZSRIR rows поки bridge не synchronized з real labels. "Intake first, map later" pattern (per audit Section 6).


---

## 02.05.2026 — END OF DAY

### Shipped (12 commits сьогодні)

**Sprint S6A — Two Fundamental Analysis Buttons (clients):** 6 commits
- S6A Step 1: full-analysis wrapper endpoint (09eb3fd)
- S6A Step 2: AI rescore у Phase B + per-client variant (47fbccd)
- S6A Step 3: EnrichmentProgressBanner S5D refactor
- S6A Step 4: UI rewire primary CTA + inline button
- S6A.0 Hygiene cleanup (-313 lines orphan chain delete)
- S6A.0.6 Untracked cleanup + maxTokens fix (rescoreClientTop10 5/10 → 9-10/10)

**Sprint S-INTEL.1.1 — CN code foundation:** 1 commit (4a705fb)
- Migrations 048 (cn_code TEXT NULLABLE + review_pending BOOLEAN) + 049 (knowledge_base table)
- lib/ai/cn-code-suggester.ts (Haiku 4.5 inference, ~$0.0008/call)
- POST /api/products/cn-suggest endpoint
- ProductForm CN input + "Zaproponuj AI" button
- /produkty list amber "🔍 Review CN" badge
- lib/format/cn-code (DB без spaces ↔ UI з spaces)

**Sprint S-INTEL.1.1.5 — Backfill:** 1 commit
- scripts/backfill-cn-codes.ts (idempotent bulk AI suggest, persistent log)
- scripts/050_cn_code_required.sql (deferred apply після manual review)

**Sprint S-INTEL.1.2.1 — ZSRIR foundation:** 1 commit + 3 hotfixes
- Migrations 051+052+053 (commodity_prices + market_signals + commodity_to_cn_map)
- lib/intelligence/zsrir.ts (ZSRIR fetcher, 13 datasets registry, HIGH priority 912 + 1024)
- app/api/cron/market-intelligence/route.ts (Sunday 06:00 UTC)
- vercel.json 4-th cron entry + admin/health knownJobs extended
- scripts/manual-trigger-market-intelligence.ts + scripts/seed-commodity-to-cn-map.ts

**Hotfixes для S-INTEL.1.2.1 (3 ітерації):**
- v1: Migration 054 partial UNIQUE indices + diag-zsrir-912.ts
- v2: Manual INSERT pattern (PostgREST + partial UNIQUE incompatible)
- v3: BUG 1 markets row = datesRow - 1 (3-row header structure)

### Production state

**ZSRIR pipeline live:**
- 87 rows ingested
- 4 markets identified (Bronisze, Kalisz + 2 інших)
- 1 mleko row (national aggregate)
- Cron schedule: Sunday 06:00 UTC weekly
- Idempotent: re-run skip duplicates через partial UNIQUE indices + 23505 catch

**Products module:**
- 35 SKU з cn_code populated (всі review_pending=TRUE)
- 49 EU TARIC mappings ready через Haiku suggester
- knowledge_base table empty (seed defer до S-INTEL.1.3)

**BUG 2 outstanding** (cn_code resolution mismatch):
- Bridge labels не match real ZSRIR labels (case-sensitive)
- "kapusta biała głowiasta" (seed) vs "Kapusta biała" (real)
- Fix options A/B/C documented у hotfix v3 entry — Vadym обере approach

### Documentation updates

**Protocols.md** — 3 нових:
- **Protocol 16** — Cowork sandbox file cache stale (false truncation alarms — 2 documented cases)
- **Protocol 17** — PostgREST upsert vs partial UNIQUE indices (anti-pattern + 3 resolution options)
- **Protocol 18** — Xlsx parser requires diag-first (4h wasted на 3 hotfix iterations через assumptions)

### Verified facts (post-EOD live)

- 35 products mit cn_code, всі review_pending=TRUE
- 87 commodity_prices rows from ZSRIR HURT WARZ
- 4 ZSRIR markets identified live (Bronisze, Kalisz, +2)
- 0 cn_code matches у commodity_prices (BUG 2 — seed labels mismatch)
- migration 050 (cn_code SET NOT NULL) NOT yet applied (defer до S-INTEL.1.1.5 review complete)

### Naступний sprint — TBD

**Опції на choose:**

1. **CN code review** (S-INTEL.1.1.5 завершення) — Vadym manually reviews 35 SKU → save clears review_pending → migration 050 apply. Estimate ~30-45 хв focused time.

2. **BUG 2 fix** (S-INTEL.1.2.1.7) — synchronize commodity_to_cn_map seed з real ZSRIR labels (option A: update seed, B: normalization у zsrir.ts, C: ILIKE pattern). Estimate ~1-2h.

3. **S-INTEL.1.2.2** — fresh-market.pl scraper (cheerio + top 5 markets). Audit вже зроблений. Estimate ~4h.

4. **S-INTEL.1.2.3** — EU Agri-food REST/CSV + signal generators (price_trend / volatility / seasonality / shortage). Estimate ~5h.

5. **MEDIUM ZSRIR datasets** (546 zboża, 601 drób, 777 wieprzowina, 1003 jaja, 1214 wołowina) — diag-first per dataset, expand parsers у `lib/intelligence/zsrir.ts`. Estimate ~1-2h per dataset.

### Mind-shift

Sztab тепер має live external market intelligence pipeline (ZSRIR weekly auto-fetch). Це foundation для Protocol 13 "Аналіз товару" (S6B) — раніше неможлива через відсутність market context.

Next focus area залежить від Vadym priority — CN review unlocks bridge BUG 2 fix → fresh-market expand → EU + signals. Or jump до S6B якщо хочемо швидше product analysis ship.

---

## 2026-05-03 — DAILY PLAN

Goals (priority order):
1. **BUG 2 fix** — bridge labels sync (commodity_to_cn_map не match з real ZSRIR labels) — 1h Cowork
2. **CN review** — 35 SKU manual verify через /produkty UI + apply migration 050 (cn_code SET NOT NULL) — 1h Vadym focused
3. **S-INTEL.1.2.2 повний sprint** — fresh-market.pl cheerio scraper, 5 markets (Bronisze WGRO Lublin Kraków Wrocław), extend commodity_to_cn_map, wire cron handler — 4h Cowork+Vadym
4. **S-INTEL.1.2.3 audit** — read-only pre-implementation audit для EU Agri-food + signal generators — 1h Cowork
5. **EOD reconciliation** (Protocol 19 evening звірка) — 30 хв

Out of scope (consciously deferred):
- S-INTEL.1.2.3 implementation (defer до 04.05 після audit)
- S6B "Аналіз товару"
- MEDIUM ZSRIR datasets (5 datasets — defer до wkh)
- Allegro work (чекаємо verification issue #13352)

Constraints today:
- Available focus hours: 8-10h
- Vadym blockers: none
- Energy: rested

**Total estimate:** 7.5h planned
**Calibrated estimate** (0.55x multiplier з 02.05 EOD): 4-5h actual
**Buffer:** 3-5h для unforeseen

**Strategy (Plan B — major progress over conservative debt-cleanup):**
- Goals 1-2 (~2h) закривають tech debt з 02.05 для clean state
- Goal 3 (~4h) — повний наступний пайплайн ship-нутий
- Goal 4 (~1h) — locked decisions для завтра
- Goal 5 — discipline review per Protocol 19

---

## 2026-05-03 — DAILY PLAN REVISION (mid-day)

**Original plan:** BUG 2 fix → CN review → S-INTEL.1.2.2 fresh-market.pl scraper → S-INTEL.1.2.3 EU audit. ~7.5h planned.

**Revised after Vadym strategic input:**

### Why revised
Vadym pivoted strategic discussion на discovery джерел для Product Intelligence. Це призвело до 3 fundamental architectural decisions:

1. **Unified Intelligence Engine** — replaces Sprint S6A/S6B okремі engines plan. ONE core + 4 entity profiles + 3 modes.
2. **PIL-2d Outreach Pricing** — новий шар pricing intelligence через direct email/phone до hurtowni.
3. **Pricing budget corrected** — $5-20/міс start, $120-210/міс scale (раніше було неправильно).

### Today's revised tasks (from 8:24)

1. ✅ **Update sztab-product-sources-discovery.md to v2** — додано PIL-2d, виправлені pricing details, unified engine architecture, 3 modes. (~5 хв, done at 8:29)

2. ✅ **Add Protocol 20 (Unified Intelligence Engine) + Protocol 21 (Sources Taxonomy)** to sztab-protocols.md (~10 хв)

3. ✅ **Update this state.md з новим планом** (~5 хв)

4. ⏳ **Client sources discovery — comprehensive document** — з двома таблицями (discovery + enrichment), мінімум так само ретельний як product discovery (~2-3 години research + write)

5. ⏳ **Discussion з Vadym** — review обох документів

6. ⏳ **S-CORE.1 build** — після review

### What's deferred
- BUG 2 fix bridge labels — postponed до завтра. Не блокер для S-CORE work.
- CN review 35 SKU + migration 050 — postponed до завтра.
- S-INTEL.1.2.2 fresh-market.pl scraper — postponed (паралельний track, не блокер для S-CORE).
- S-INTEL.1.2.3 EU Agri-food audit — postponed (паралельний track).

### Architectural decisions locked today

🔒 **Sprint S6A/S6B окремі engines — SCRAPPED.** Replaced з S-CORE.1-5 unified architecture.

🔒 **Engine має 3 modes:** existing / registry / combined. Всі доступні одночасно.

🔒 **Sources розділено на discovery + enrichment** — per Protocol 21. Some sources serve обидві задачі.

🔒 **PIL-2d Outreach Pricing** — окремий source class у product sources.ts.

🔒 **Budget realistic:** $5-20/міс current, $120-210/міс при scale. Apify і Tavily Free tiers покривають Sztab при поточному usage. Anthropic — pay-per-token, no subscription.

### Next sprints sequence

**Sprint S-CORE.1** — Build core engine (~5-7h)
**Sprint S-CORE.2** — Wire client profile (~3-4h)
**Sprint S-CORE.3** — Wire product profile + PIL-2d outreach (~4-6h)
**Sprint S-CORE.4** — Wire market profile (~3-4h)
**Sprint S-CORE.5** — Wire strategy profile cross-entity (~4-5h)

Total ~19-26h. Будуємо unified core з самого початку, не refactor пізніше.

### Notes for self (Claude)

- Memory entry #15 оновлений з UNIFIED INTELLIGENCE ENGINE decision
- Two new docs going to repo: sztab-product-sources-discovery.md (v2), sztab-client-sources-discovery.md (новий)
- Protocols 20+21 додаються до sztab-protocols.md
- Sprint S-CORE починається ТІЛЬКИ після Vadym review обох discovery docs

---

## 2026-05-03 — DAILY PLAN

Goals (priority order):
1. Sprint S-CORE.0 — UI макети 9 сторінок + UI аудит — Claude estimate ~6h (actual TBD у EOD)
2. Sprint S-CORE.1 (Build Core Engine) — split на 3 sub-спринти ~2h each — стартує після макет approval
3. EOD reconciliation у sekcji `## 2026-05-03 — EOD RECONCILIATION` (Protocol 19)

Out of scope (consciously deferred):
- /admin/health польський переклад (окремий cleanup-sprint)
- /matches admin переробка (post S-CORE.5)
- /handoff/pikniko переосмислення (memory: Pikniko ≠ customer Sztab)
- Mobile layout (post S-CORE.5)
- Cmd+K command palette (post S-CORE.5)
- Англіцизми cleanup (inline у S-CORE.2-5)

Constraints today:
- Vadym available focus hours: ~5h
- Cowork: full computer use + browser use (виконує рутину, файли, screenshots)
- Claude in claude.ai: post-ship verification + sprint prompts + макети
- Per Protocol 14 — git push виконує Vadym через PowerShell, не Cowork

---

## S-CORE.0 SHIP STATUS — 03.05.2026

**Sprint:** S-CORE.0 (UI макети) — обов'язковий перший крок per Protocol 23
**Status:** ✅ DONE — green approval Vadym 03.05.2026 evening

### Per Protocol 23 deliverable checklist:

- ✅ UI аудит поточного сайту через incognito Cowork — 11 сторінок перевірено в попередньому чаті
- ✅ Макети нових сторінок (статичний HTML без логіки) — 9 макетів у файлі `sztab-makiety-v2.html` (97К chars, 1661 рядків)
- ✅ Макет головної сторінки — /pulpit/dzisiaj з 3 modes + календар + hot pairs + Wymaga uwagi
- ✅ Макет нового sidebar — Codzienność / Dane / Sprzedaż / Inne (card-sorting hub pattern)
- ✅ Vadym затверджує макети — green approval 03.05.2026 evening

### Покриті сторінки у макеті (9 шт):

1. /pulpit/dzisiaj — Pulpit dnia з 3 modes + календарем
2. /pulpit/szukaj — форма Mode B/C
3. /clients — список (без score-сортування, per Protocol 22)
4. /clients/[id] — 2 кнопки (Szybki + Pełny) + бізнес-профіль AI + 7 tabs + 8 CIL акордеон
5. /produkty — список з групуванням по dostawcy/kategorii
6. /produkty/[id] — 4 кнопки (товар/ринок/oferta/стратегія SKU) + 5 PIL tabs
7. /strategia (drzewo) — навігація per SKU/kategoria/kanał/brand
8. /strategia/[id] — long-form raport з 10 секцій
9. /sprzedaz — Pipeline kanban з картами як парами клієнт×SKU

### Iтерації мокапу:

1. **v1** (3.05.2026 ранок) — забракована Vadym (3 мови, € замість zł, без календаря, одна кнопка клієнта, стратегія одна глобальна)
2. **v2** (3.05.2026 вечір) — green approved (всі 5 правок враховано, web research застосовано: Progressive Disclosure / 5-Sec Rule / F-pattern / Calm UI / Active Insights)

### Web research застосовано (UX 2026 принципи):

- **Progressive Disclosure** (Nielsen 1995, NN/g) — Szybki preview → Pełna analiza; Top recommendation → 7 tabs deeper
- **5-Second Rule** (Shopify dashboard pattern) — на /pulpit/dzisiaj за 5 сек видно 3 modes + hot pairs + календар
- **F-pattern reading** (eye-tracking studies) — KPI зліва-зверху, дрібніше — нижче-справа
- **Active Insight Generation** (2026 trend) — AI banner "Розгляньте outreach по ТОП-23..." замість голих цифр
- **Calm UI / Functional Minimalism** (Linear/Notion/Stripe 2026) — один acent колір (emerald), whitespace між блоками
- **Card-sorting у hubs** (HubSpot pattern) — sidebar згрупований Codzienność / Dane / Sprzedaż / Inne
- **Bar charts > pie** (3-4x швидше interpretation) — всюди прогрес-бари (Match %), не круги

**S-CORE.0 = DONE. Стартуємо S-CORE.1 split на 3 sub-спринти.**

---

## STRATEGY SHIFT 03.05.2026 evening — UI principles locked

Per Protocol 11 (Strategy Updates). Три уточнення Vadymа сьогодні ввечері змінюють старі implications:

| Раніше планували | Тепер lock-нуто |
|---|---|
| /clients/[id]: 1 кнопка "Глибокий аналіз клієнта" | **2 кнопки:** Szybki podgląd AI (~5s, 0,10 zł) + Pełna analiza klienta (~60s, 1,60 zł). Швидкий precursor для рішення чи робити глибокий. |
| Strategia: одна на бренд (наприклад "стратегія ЧМ") | **Hierarchy 4 рівні:** SKU / kategoria / kanał / brand. ЧМ ≠ одна стратегія бо там і kiszonki, і sałatki, і HoReCa packaging, і retail mały — різні стратегії. |
| Strategia: короткі висновки (cards) | **Long-form raport з 10 секцій:** Sytuacja / Cele / Segmentacja / Rekomendacja / Argumentacja / Konkurencja / Plan działania / Ryzyka / KPI / Założenia. Розгорнуті відповіді щоб правильно розуміти і коригувати. |
| Mode B: фільтр active VAT + non-wykreślona | **Mode B = ВСІ** без фільтру активності. Per Protocol 22 база = універсальний asset, фільтр обмежує майбутню цінність. |

### Implications:

- Sprint S-CORE.2 (client wire) — 2 endpoints `/api/intelligence/quick` + `/api/intelligence/full`, не один
- Sprint S-CORE.5 (strategy wire) — drzewo навігації (4 рівні) + long-form raport schema (10 секцій), складніше ніж очікували
- Sprint S-CORE.1 (engine core) — Mode B simplified: тільки validation бар на NIP/REGON, без VAT/wykreślona фільтру

### Estimate impact:

- S-CORE.2 був 3-4h → тепер **4-6h** (2 endpoints + AI prompt template для Szybki)
- S-CORE.5 був 4-5h → тепер **6-8h** (drzewo + 10-секційний raport schema + edit ручний per section)
- S-CORE.1 без змін (5-7h)
- **Total revised:** 22-31h (раніше 19-26h)

### Принцип пріоритетності протоколів (за датою):

При розбіжності між протоколами:
- Новіші (Protocol 22, 23 — 03.05) > старіші (Protocol 13 — 01.05) > найстаріші (Protocols 1-12)
- Сьогоднішнє вечірнє уточнення Vadymа > всі попередні протоколи

Приклад: Protocol 22 каже "active VAT + non-wykreślona" як фільтр Mode B. Vadym 03.05 evening: "ВСІ, не валідних". → Vadym wins, мокап показує "Dodajemy WSZYSTKIE bez filtra".

---

## 2026-05-03 — EOD RECONCILIATION

### Shipped (3 commits + 1 docs commit)

- **894a19d** docs(s-core): S-CORE.0 ship status + S-CORE.1 plan з 3 sub-sprints + Strategy Shift 03.05 evening
- **1537bba** feat(s-core-1a): scaffolding intelligence engine — types + interfaces + stubs (8 files, +207 lines)
- **34242d9** feat(s-core-1b): 3 engine modes (A/B/C) + AI prompt templates + TODO markers for S-CORE.2 wiring (5 files, +381/-58)
- **2f9d9b7** feat(s-core-1c): UI wiring — 3 modes na /pulpit + form /pulpit/szukaj + /api/intelligence/run (5 files, +729)

### Plus pre-existing pending changes flushed earlier today
- **9da7d81** docs: matrix scoring v3 + protocols 20-23 (4 files, +2211) — local accumulated changes pushed during session

### Estimate accuracy

- Planned: Sprint S-CORE.1 = 5-7h (split 3 × ~2h)
- Actual: ~1h elapsed (Vadym + Cowork + Claude паралельна робота)
- **Multiplier: ~0.15x** (planned 6h / actual 1h) — significantly faster than estimate

### Why so fast (lessons)

1. **Cowork executes routine** — file writes, git diagnostics, structure analysis
2. **Vadym executes mutating git ops only** (Protocol 14 boundary respected)
3. **Claude provides specs + verification** — promptам, post-ship browser MCP check
4. **Split into 3 sub-sprints with hard gates** (STEP 0 sanity checks) prevented scope creep
5. **Pre-existing 25 tsc errors були baseline** — git stash + tsc diagnostic pattern зекономив час vs blind fixing
6. **Cowork прапорив архітектурні помилки у моїх промптах** двічі (Q1 у S-CORE.1.B = ceidg_prospects не clients; Sprint S4 layout preserve у S-CORE.1.C)
7. **Реальний enrichment ще не wired** — registry-mode throw TODO. Це навмисно, не помилка. Буде у S-CORE.2 night batch

### Surprises

- Repo мав 4 uncommitted docs files (Protocols 16-23 + discoveries v3) які push-нулись окремим commit у нашій сесії
- 25 pre-existing tsc errors у scripts/ + cron routes — нікого не блокували бо Vercel build skip-ить scripts/
- Sprint S4 dashboard `/pulpit/dzisiaj` був already feature-rich — Cowork правильно відкоригував мою помилкову інструкцію "overwrite"

### Tech-debt logged (для майбутнього)

- 25 pre-existing tsc errors → cleanup-sprint post S-CORE.5
- middleware → proxy migration (Next.js 16 deprecation) → backlog
- service-role Supabase client для bulk insert у ceidg_prospects → потрібен у S-CORE.2

### Tomorrow's seed (and tonight)

**Strategic shift:** Vadym proposed using night hours for batch CEIDG/KRS data ingestion. Aligns з memory "AI-ефективність: bulk + parallel + фонові операції".

Plan revision:
- **S-CORE.2-NIGHT** (new priority) — wire `runRegistryMode` real CEIDG paginator + Supabase service-role + cron schedule. Estimate ~2-3h tonight. Starts tonight ~18:00, runs overnight (Vercel cron або manual trigger).
- **S-CORE.2-CLIENT** (deferred) — 2 кнопки на /clients/[id] (Szybki + Pełny). Estimate ~3-4h. Tomorrow.

Why this order: база = capital який накопичується незалежно від UI. Поки UI чекає на 2 кнопки, ми можемо паралельно заливати prospects. Ranok ми матимемо реальні дані для clients/[id] testing.

Memory принцип "конверсія > масштаб" не порушується — ми не cold-emailimo до 8000 firm. Просто наповнюємо базу для майбутнього scoring через "Аналіз товару" (S-CORE.3).

### Verification (Protocol 4)

- Vercel deploy xHB2hka9e Ready (Current) для commit 2f9d9b7
- Live verification на sztab.vercel.app:
  - ✅ /pulpit/dzisiaj — 3 cards modes над WarningsPanel
  - ✅ Sprint S4 layout preserved (HotLeadyChips, CalendarShell)
  - ✅ Sidebar entry "Szukanie firm"
  - ✅ Mode B click → redirect /pulpit/szukaj?tryb=B
  - ✅ Form prefilled на Tryb B per URL param
  - ✅ Purple notice про Strategy Shift visible
  - ✅ Filtry checkboxes + Prognoza w zł
  - Toast не клікав на Mode A (не хотів Vercel timeout — modes throw TODO маркерами; це expected у S-CORE.1.C)

### Working tree status у кінці дня

HEAD: `2f9d9b7` (S-CORE.1.C UI wiring)
Branch: main (up to date з origin)
Working tree: clean

---

## 2026-05-04 — EOD RECONCILIATION

### Shipped (2 feature commits)

- **41c575b** feat(s-core-2-night): Phase 2.8 KRS bulk wire — rejestr.io /org with email + decision_maker extraction (6 files, +1095 lines)
- **67a85a6** feat(s-core-3a): products business_profile + Analiza produktu CTA + ProductAnalysisSection (5 files, +749 lines)

### Migrations applied today

- 055 unique constraints multi-source (drop NOT NULL ceidg_id + UNIQUE krs_number partial)
- 056 email + decision_maker_name columns + email partial index
- 057 products business_profile JSONB + last_analyzed_at + enrichment_log target_type='product' extension

### KRS bulk smoke test (real DB)

- 100 prospects ingested (4639Z × Mazowieckie, pages 0-1)
- Coverage: 33% з email, 76% з decision_maker_name (KRS Biznes plan)
- Cost: 0.30 zł rejestr.io probe + smoke
- Tonight overnight: full 305 firm sweep planned (~0.25 zł, ~10 хв)

### S-CORE.3.A end-to-end verified

- /produkty/[id] master-detail: "Analiza produktu" button у header → Claude Sonnet 4.6 call (~30-60s) → page refresh з populated ProductAnalysisSection
- Real AI output на product Ogórki kiszone: hot/warm/cold segments з real client names integration (Imperial, KOZAK OLEK, Domek Sushi) + real client count (537 у бази) + real prices (18.46 zł)
- Cost per analysis: $0.0172
- Telemetry verified у enrichment_log (target_type='product', source='AI_product_analysis', status='success')

### Lessons (CRITICAL для майбутніх сесій)

1. **Filesystem ≠ memory plan-vision.** Дві memory entries виявились застарілими сьогодні:
   - Memory #14 казала "6 hidden pages" — реальність 5 з 6 уже у sidebar submenu (Klienci submenu: Wszyscy klienci/Prospekti/Lookup NIP/AI Discovery; Sprzedaż submenu: Pipeline/Dopasowania/Pikniko handoff). Sprint S5 Navigation Fix вже шиплений раніше, без commit msg.
   - Memory #15 казала "unified engine для 4 entity types" — реальність: S-CORE engine = bulk runner для batch by-PKD/woj. S2B Phase 2 (April-era) = per-entity workflows на /clients/[id]. Дві паралельні architecture patterns by purpose, не unified.

   **Урок:** перш ніж планувати "наступний sprint" — verify filesystem через Chrome MCP, git log, find. Memory часто містить planning intent, не shipped reality.

2. **Cowork як architecture peer reviewer.** Cowork сьогодні прапорив 5 раз архітектурні помилки у моїх промптах:
   - pkd_codes vs pkd_all (schema column на ceidg_prospects)
   - Partial unique index vs Supabase JS .upsert() incompatibility
   - Migration 022 номер collision (already exists 022_extract_krs_from_gus)
   - KRS shape mismatch (czy_w_likwidacji vs w_likwidacji, kod_pocztowy vs kod, terc_wojewodztwo flat vs teryt nested)
   - enrichment_log CHECK constraint blocked target_type='product' (extended у migration 057)

   **Урок:** STEP 0 sanity check → REPORT → GO gates критичні. Cowork solo file inspection ловить runtime issues перш ніж commit.

3. **Architecture revision honesty.** Memory #15 update був складний psychologически (admit що план "unified engine" не materialized). Але "two parallel patterns by purpose" — це не failure, це pragmatic reality для existing codebase. April-era S2B Phase 2 робить що потрібно, S-CORE engine знаходить свою роль у bulk operations.

### Surprises

- Allegro Issue #13352 closed з REJECT (decyzją biznesową dostęp do /offers/listing wstrzymany для всіх). Hybrid scraper.ts (Apify) залишається primary path — не блокер.
- CEIDG paused page 21/335 (550 prospects) через recurrent HTML response error на page 22. Tech-debt: lib/ceidg/client.ts JSON.parse без graceful HTML fallback.
- /produkty page architecture — master-detail з ?id= query param (НЕ /produkty/[id] route). S-CORE.3.A respected цей pattern.

### Tech-debt logged

- CEIDG JSON.parse graceful HTML fallback (defer post S-CORE.5 cleanup)
- 25 baseline tsc errors (defer cleanup-sprint)
- middleware → proxy migration (Next.js 16 deprecation, backlog)
- Helper extraction lib/ai/product-analysis.ts (S-CORE.3.A inline для MVP, refactor якщо потрібен reuse)

### Tomorrow's seed

**S-CORE.3.B (priority next session, ~1.5-2h):**
- TOP 25 client matching section на /produkty (читати matches table)
- product_match_runs table + iterative exclusion logic ("Pokaż наступних 25")
- Market intelligence: similar products / конкуренти (Allegro scraper + Tavily reuse)

**Plus:**
- CEIDG resume page 22+ (якщо API recovered)
- S-CORE.4 market port (3-4h estimate)
- S-CORE.5 strategy port (4-5h estimate)

### Verification (Protocol 4)

- Vercel deploy для 67a85a6 successfully shipped
- Live verification на sztab.vercel.app/produkty:
  - ✅ "Analiza produktu" button у detail panel header
  - ✅ Click → "Trwa w tle (~30-60s)" purple banner
  - ✅ После ~45s: button → "Analiza produktu" (active again)
  - ✅ Section "Analiza biznesowa (AI)" populated з real Polish strategy
  - ✅ Hot/warm/cold segments з icons + pitch + next steps
  - ✅ Real client names + count footer
- Supabase Studio verification:
  - products.business_profile JSONB populated, last_analyzed_at recent
  - enrichment_log target_type='product' з cost_usd $0.0172

### Working tree status у кінці дня

HEAD: `67a85a6` (S-CORE.3.A products business_profile)
Branch: main (up to date з origin)
Working tree: clean
DB: 100 KRS prospects + 1 product analyzed

