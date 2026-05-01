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

