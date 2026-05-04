# SZTAB — SPRINT PLAN

**Last updated:** 01.05.2026, 11:15 (post Audit #2)

---

## АКТИВНИЙ SPRINT — S5: Navigation Fix + Quick UX

**Started:** 01.05.2026
**Estimated total:** ~3 години
**Mind-shift basis:** Audit #2 виявив що Sztab вже має 5 потужних сторінок (/intelligence, /intelligence/prospects, /matches, /handoff/pikniko, /admin/health), але вони СХОВАНІ від sidebar. Це не feature gap — це navigation gap.

### Phase S5A — Sidebar Navigation (~30-45 хв)

**Goal:** додати sidebar links на 5 прихованих сторінок, щоб Vadym їх знайшов.

**Tasks:**
- Додати в sidebar новий розділ "Intelligence" (group):
  - AI Discovery → /intelligence
  - Prospekti → /intelligence/prospects
  - Lookup NIP → /intelligence/lookup
- Додати top-level link "Dopasowania" → /matches
- Додати top-level link "Handoff Pikniko" → /handoff/pikniko
- Додати в "Ustawienia" group або bottom: "Admin Health" → /admin/health
- Active route highlighting (current sidebar showing active state)

**Non-goals:**
- НЕ змінюємо existing pages
- НЕ робимо нової функціональності
- НЕ додаємо badges з counts (наступний sprint)

**Ship criteria:**
- 5 нових links видимі в sidebar
- Кожен клік відкриває правильну сторінку
- Active state підсвічує current

### Phase S5B — Quick UX fixes (~45 хв)

**Goal:** закрити 4 anoyances які видно з Audit #2.

**Tasks:**
1. Fix "Pobierz z KRS" anchor → working refresh button:
   - На /clients/[id] в Sprawozdania і Osoby секціях
   - Замість `href="#krs-refresh"` → onClick handler
   - POST /api/clients/[id]/krs-refresh
   - Toast "Aktualizuję dane z KRS..." → "Zaktualizowano: X pól"

2. Fix `?nip=` URL param на /intelligence/lookup:
   - useEffect: якщо ?nip= в URL → set input value + auto-trigger lookup
   - Це закриває loop "Sprawdź BZP" з профілю

3. /admin index page:
   - Створити app/(dashboard)/admin/page.tsx
   - Просто redirect на /admin/health або index з links на subpages

4. Дублікати legacy routes:
   - List які саме legacy: /dashboard, /products, /products/new, /products/[id]/edit, /deals, /deals/*, /tasks, /goals, /habits, /calculator, /kp-generator
   - Якщо НЕ використовуються — delete files
   - Якщо використовуються — залишити, але додати в docs/sztab-state.md note

**Non-goals:**
- НЕ міняти / refactor існуючих pages
- НЕ оптимізувати performance

### Phase S5C — Tavily Contact Enrichment (~1.5h)

**Goal:** заповнити порожній app/api/contact-enrichment/route.ts реальною Tavily integration.

**Pre-requisites:**
- Перевірити що contact-enrichment/route.ts реально empty (один файл, ls показує)
- Якщо вже має logic → spec extension, не rewrite

**Tasks:**
1. Settings: додати поле "Tavily API token" до Klucze API tab
2. Migration: додати tavily_token column до params table
3. Endpoint logic в /api/contact-enrichment:
   - Input: { client_id або prospect_id }
   - Pull URL клієнта (домен) з DB
   - Якщо немає → fallback на Tavily search "{nazwa firmy} kontakt"
   - Tavily /extract з URL → знайти email, phone, person names
   - Save до contacts table з source='tavily'
4. UI button "Znajdź kontakt" на /clients/[id] в секції Kontakt:
   - Показується тільки якщо kontakt empty або тільки 1 source
   - Click → POST /api/contact-enrichment, toast progress
   - Refresh page після success

**Non-goals:**
- LinkedIn scraping (інший sprint)
- Bulk contact enrichment (наступний sprint)
- Contact deduplication logic

---

## SPRINT POST-COMPLETION CHECKLIST

Перш ніж казати "Sprint S5 done" і переходити до S6:

- [ ] Phase S5A: всі 5 нових sidebar links клікаюся, ведуть на правильні pages
- [ ] Phase S5B: 4 fixes verified live (KRS refresh works, ?nip= prefills, /admin не 404, legacy resolved)
- [ ] Phase S5C: Tavily extraction tested end-to-end на 1+ клієнті без kontakt
- [ ] docs/sztab-state.md оновлено з новим стану
- [ ] docs/sztab-sprints.md оновлено: Sprint S5 → "completed dd.mm.yyyy"
- [ ] Memory entry для S5 completion з pointerом на docs
- [ ] git commit з changelog

---

## FUTURE SPRINTS (backlog)

### S6 — Bulk operations beyond /matches
- Bulk Tavily extract (50+ klientів за раз)
- Bulk profile refresh (KRS + Apify_GMaps batch)
- Bulk export з multi-cohort selection

### S7 — LinkedIn integration
- LinkedIn scraper actor
- DM ready endpoints
- Integration з Cold Opener generator

### S8 — Advanced AI matching
- Multi-supplier matrix (зараз PLACEHOLDER)
- Cross-product score boosting
- Prospekt → Klient promotion workflow

### S9 — Allegro completed integration
- Verification email response від Allegro support
- Якщо approved → /offers/listing direct API
- Якщо ні → continue з Apify scraper, додати UI

### S10+ — Scaling
- Multi-user support (якщо Vadym колись захоче sell SaaS)
- Workspace isolation
- Billing integration

---

## SPRINT HISTORY

### S0 (early April 2026)
- Initial scaffold

### S1 (mid April)
- Database schema
- CRUD endpoints

### S2A (28.04.2026, commit 4beeece)
- Taxonomy core (5 commits)
- DB schema for matching

### S2B (29-30.04.2026)
- UI redesign + accordion profiles
- Regression fix /clients/[id] (use client directive)

### S3-prep (30.04.2026)
- Migration 044 (Allegro params)
- Settings UI extension
- Allegro Developer App credentials

### S3 main (30.04.2026)
- /api/allegro/test endpoint
- lib/allegro/client.ts
- Pivot to Apify scraper after /offers/listing 403
- Verified working з parseforge~allegro-scraper

### S4 (30.04.2026, partial — confirmed by Audit 01.05.2026)
- Action Bar component на /clients/[id] OK
- Bulk operations /clients OK
- /pulpit/dzisiaj operational OK
- /sprzedaz, /produkty, /suppliers, /organizer OK
- WARN SupplierMatrix PLACEHOLDER (waiting Sprint M)
- WARN "Pobierz z KRS" anchor only (Sprint S5B)
- FAIL /admin index page missing (Sprint S5B)
- FAIL ?nip= URL param не prefills (Sprint S5B)

### Audit #1 (01.05.2026, 09:55)
- First live audit
- INCOMPLETE — пропустив 5 прихованих сторінок
- Documented in docs/sztab-audit-log/2026-05-01-09-55.md

### Audit #2 (01.05.2026, 11:00)
- REVISED audit
- Discovered /intelligence/prospects (99 prospekts)
- Discovered /matches (100 dopasowań)
- Discovered /handoff/pikniko (cohort 29)
- Discovered /admin/health
- Strategy shift: Sprint S5 = Navigation Fix, не Build
- Documented in docs/sztab-audit-log/2026-05-01-11-00.md

---

END OF SPRINTS.


## SPRINT HISTORY UPDATE — S5A SHIPPED 01.05.2026

### S5A — Sidebar Navigation Fix (commit e97c60c) — DONE
- Refactor components/app-sidebar.tsx з nested collapsible groups
- 4 groups: Klienci/Sprzedaż/Ustawienia з sub-items, plus 4 flat top-level
- Auto-expand on route match, active highlight для leaf і group
- Bonus: /products → /produkty (1-line fix)
- Build: pnpm run build → Compiled successfully in 4.6s
- Push: a6477c6..e97c60c main → main
- Post-ship verification: 11/11 OK (Claude via browser MCP)

### Active phases залишилися:
- S5B: Quick UX fixes (KRS refresh, ?nip= prefill, /admin index, legacy routes) — наступне
- S5C: Tavily contact enrichment — після S5B



---

## S5B SHIPPED 01.05.2026 — Quick UX Fixes (5 commits)

### Final commits:
- da4dc90 KRS refresh button + endpoint
- b356fd7 ?nip= prefill + auto-trigger
- 894f536 /admin redirect + sidebar logo fix
- 7318931 Legacy routes audit doc
- 4765198 Legacy cleanup (3 delete + 2 redirect)

### Post-ship: 9/9 PASS via browser MCP
TASK 1 KRS button: toast feedback works
TASK 2 ?nip= prefill: auto-trigger confirmed
TASK 3 /admin redirect: works
BONUS sidebar logo: /pulpit/dzisiaj
TASK 4a /habits → /organizer
TASK 4b /tasks → /organizer
TASK 4c /goals 404
TASK 4d /calculator 404
TASK 4e /kp-generator 404

### Sprint S5 status: S5A + S5B = COMPLETE
S5C (Tavily) — наступним днем свіжим.



---

## SPRINT S6 — Two Fundamental Analysis Buttons (planned)

**Architecture basis:** Protocol 13 (TWO FUNDAMENTAL ANALYSIS BUTTONS)
**Discovered/articulated:** 01.05.2026 evening
**Estimated:** ~3-4 години (через 2 entity views + pipeline orchestration)

### S6A — "Аналіз клієнта" button (~1.5-2 год)
- Action bar на /clients/[id] — primary button "Аналіз клієнта" (золотий accent)
- Orchestrator endpoint POST /api/clients/[id]/full-analysis
- Phase 1 sources: всі що уже існують для клієнтів (через існуючі endpoints або direct lib calls)
- Phase 2 AI: re-score matching + business-analysis + всі AI які залежать від raw даних
- UI: 2-stage progress bar "Pobieranie danych (X/Y)..." → "Analiza AI..."
- Toast: success/partial з summary "Aktualizowano N pól, K matchesów"
- Existing per-source buttons NOT removed

### S6B — "Аналіз товару" button (~1.5-2 год)
- Така ж архітектура для /produkty/[id]
- Phase 1 sources для продукту (треба audit що це саме — ймовірно: matching candidates fetch, Apify Allegro pricing scrape, Tavily search)
- Phase 2 AI: deep-discovery, scoring re-run

### Pre-S6 audit потрібен:
- Які джерела існують для клієнта (всі endpoints)
- Які джерела існують для продукту (можливо менше ніж для клієнта)
- Які AI steps depend на raw data (щоб правильно розташувати у Phase 2)
- Чи orchestrator вже існує (lib/orchestrator/ або similar)

### Залежності:
- Sprint S5C (Tavily в params pattern) має бути shipped — інакше Tavily в orchestrator не працюватиме



---

## S5C SHIPPED 01.05.2026 evening — Tavily Migration to params Pattern

**Status:** GREEN ✅ — verified live by Claude (browser MCP) + enrichment_log

### Commits (3):
- 2382a63 — S5C-1: migration 045 + apply (column verified text)
- 995683e — S5C-2: actions/params + api-keys-form + settings page  
- c17ef1f — S5C-3: lookup/route.ts params first з env fallback

### Що тепер працює:
- params.tavily_api_key column в DB
- Settings UI Klucze API tab — нове поле "Tavily API key" з save/mask
- lookup/route.ts читає params.tavily_api_key першим, fallback на 
  process.env.TAVILY_API_KEY (legacy compat)
- Tavily запускається в Phase B (5 successful runs за 6h verified)
- AI business analysis use Tavily output (видно "tavily" в "Źródła analizy" 
  на KOZAK profile)

### Verification process (включає мій failure):

Я (Claude in claude.ai) спершу думав Tavily НЕ працює, бо не бачив його в
response.sources_completed на /intelligence/lookup. Це було Protocol 8 
failure mode #5 (вірити звітам без власної перевірки). Vadym зловив це 
питанням "ти сам перевіряв чи знову не по протоколу робиш?".

Виправлення: пішов на live KOZAK profile, побачив "Źródła analizy: ..., 
tavily" і AI text що згадує Tavily результат. Дві independent evidences:
1. Architectural diagnosis Claude Code (Phase A/B split)
2. Live profile screenshot Claude (browser MCP) — Tavily в analiza output

### Discovery #2 logged до docs/sztab-state.md:
PHASE A / PHASE B split — пояснює багато попередніх misunderstandings про те
що Sztab "не показує enrichment results". Це тому що response виводить тільки
Phase A. Connection до Protocol 13 (Two Fundamental Analysis Buttons).

### Залишки для Sprint S6 (deferred):
- Surface PHASE B status у lookup response (phase_b_pending field)
- Client-side polling /api/intelligence/enrichment-status
- Two Fundamental Analysis Buttons (Protocol 13) з 2-stage progress bar



---

## S5D SHIPPED 01.05.2026 evening — Phase B Status Surface (Quick Fix)

**Type:** Quick patch (~30-45 хв як планували, fact ~25 хв including verification)
**Commits:** 1 commit
**Verification:** 5/5 OK via browser MCP

### Що включалось:
- Backend: phase_b_pending field в LookupResponse + conditional list
- Frontend: amber dashed card з outline badges
- Bonus: button copy "Pobieranie danych..." без hardcoded "6 źródeł"

### Status:
SHIPPED. Sztab lookup тепер honest про що готово і що буде running.

### Sprint S5 — fully complete:
- S5A — Sidebar Navigation Fix ✅
- S5B — Quick UX fixes (KRS refresh, ?nip= prefill, /admin redirect, legacy cleanup) ✅
- S5C — Tavily migration to params pattern ✅
- S5D — Phase B status surface ✅

Sprint S6 (Two Fundamental Analysis Buttons) — наступним днем свіжими.

---

## Sprint S-CORE.1 — Build Core Engine

**Locked:** 03.05.2026 evening (post макет approval + Strategy Shift)
**Estimate:** 5-7h, split на 3 sub-sprints ~2h each
**Approach:** UI-first per Protocol 23 — UI план першим, потім код

### UI план (Protocol 23 — 5 питань)

**1. Де знаходиться кнопка/посилання на нову функцію?**
- Кнопки 3 modes (A/B/C) — на /pulpit/dzisiaj, перший блок під заголовком "Pulpit dnia"
- Форма Mode B/C — на новій сторінці /pulpit/szukaj
- Mode A → одразу runs з /pulpit/dzisiaj (toast + redirect на /clients з updated_at sort)

**2. Як до неї потрапити з головної сторінки?**
- 0 кліків — це і є головна сторінка для existing user (sztab.vercel.app → / → redirect → /pulpit/dzisiaj)
- Sidebar entry "Pulpit dnia" — 1 клік для switch context

**3. Що бачить користувач який заходить вперше БЕЗ контексту?**
- 3 картки modes з emoji + опис + estimated cost (52 zł / Konfiguruj / Otwórz формуляр)
- Mode C виділено зеленою рамкою + бейдж "DOMYŚLNE"
- Календар праворуч (4-12 хвилинна задача)
- Hot pary (3 пари клієнт×SKU) під картками
- AI banner "Сугестія на цей тиждень"

**4. Як зрозуміти що функція виконалась?**
- Mode A: toast "Opracowanie bazy uruchomione" + progress bar в правому-нижньому куті + редирект на /клієнти з sort updated_at desc після завершення
- Mode B: redirect на /pulpit/szukaj з prefilled tryb=B → запуск через Submit → toast → redirect на /clients?filter=newly-added
- Mode C: redirect на /pulpit/szukaj з tryb=C → Submit → toast → редирект на /pulpit/dzisiaj з оновленими Hot pary

**5. Як знайти результат функції пізніше?**
- /клієнти sortable по updated_at (нова кнопка sort)
- /клієнти filter "Dodano w ostatnich 24h" (новий chip)
- /pulpit/dzisiaj — Hot pary update після кожного run
- Toast persistence — bottom-right notification stack останніх 5 runs з timestamp

---

### Sub-Sprint S-CORE.1.A — Backend skeleton (~2h, 1 commit)

**TASK:** Створити структуру `lib/intelligence-engine/` з типами, інтерфейсами, stub-функціями. Без real logic.

**STEP 0 — sanity check:**
1. ls lib/ — побачити existing intelligence/ folder
2. ls app/api/intelligence/ — побачити existing endpoints
3. STOP — report → чекай Vadym GO

**STEP 1 — Create folder structure:**
- lib/intelligence-engine/core/orchestrator.ts (interface + stub)
- lib/intelligence-engine/core/scoring-pipeline.ts (interface + stub)
- lib/intelligence-engine/core/ai-prompt-templates.ts (типи)
- lib/intelligence-engine/core/cache-layer.ts (interface)
- lib/intelligence-engine/core/modes/existing-mode.ts (stub)
- lib/intelligence-engine/core/modes/registry-mode.ts (stub)
- lib/intelligence-engine/core/modes/combined-mode.ts (stub)
- lib/intelligence-engine/types.ts (shared types: Mode, EntityType, ScoreResult)

**STEP 2 — Write types/interfaces:**
- type Mode = 'A' | 'B' | 'C'
- interface IOrchestrator { run(mode, filters?): Promise<RunResult> }
- interface IScoringPipeline { score(client, product): MatchResult }
- type RunResult = { sources_completed: string[], entities_processed: number, errors: any[] }

**STEP 3 — Stub implementations:**
- Кожна функція повертає `throw new Error('Not implemented — S-CORE.1.B')` поки що
- Експорти готові для import у API layer

**VALIDATE BUILD:**
- npx tsc --noEmit → exit 0
- Не пускати pnpm run build (бо це тільки types, не runtime change)

**COMMIT:** `feat(s-core-1a): scaffolding intelligence engine — types + interfaces + stubs`

**NON-GOALS:**
- NIE запускати реальні API calls
- NIE міняти existing /api/intelligence/lookup logic (це Sprint S-CORE.2 task)
- NIE додавати UI (це S-CORE.1.C)
- NIE інтегрувати AI prompts (це S-CORE.1.B)

---

### Sub-Sprint S-CORE.1.B — 3 Modes implementation (~2h, 1 commit)

**TASK:** Реалізувати 3 modes (existing/registry/combined) над skeleton з S-CORE.1.A. AI templates винести в окремий файл.

**STEP 0 — sanity check:** S-CORE.1.A merged?
**STEP 1 — existing-mode.ts:** Iterate over DB clients, call enrichment sources sequentially, return RunResult
**STEP 2 — registry-mode.ts:** Bulk fetch CEIDG/KRS by filters (no VAT/wykreślona filter — per Strategy Shift), insert raw → return RunResult з кількістю доданих
**STEP 3 — combined-mode.ts:** Promise.allSettled([existing, registry]) → merge → dedupe by NIP → return
**STEP 4 — ai-prompt-templates.ts:** 4 templates готові (clientQuick, clientFull, productAnalysis, strategySection)

**VALIDATE:** npx tsc + smoke test з mocked filters
**COMMIT:** `feat(s-core-1b): 3 engine modes (A/B/C) + AI prompt templates`

**NON-GOALS:**
- NIE wire UI (це S-CORE.1.C)
- NIE робити real OpenAI/Anthropic calls (templates ready, calling — у S-CORE.2/3)

---

### Sub-Sprint S-CORE.1.C — UI wiring (~2h, 1-2 commits)

**TASK:** UI кнопки 3 modes на /pulpit/dzisiaj + форма Mode B/C на /pulpit/szukaj + API endpoint.

**STEP 0 — sanity check:** S-CORE.1.B merged? Макет sztab-makiety-v2.html передивитися ще раз?
**STEP 1 — Створити app/api/intelligence/run/route.ts** — POST { mode, filters? } → returns { runId, status }
**STEP 2 — Edit app/(dashboard)/pulpit/dzisiaj/page.tsx** — 3 cards modes (за макетом 1)
**STEP 3 — Створити app/(dashboard)/pulpit/szukaj/page.tsx** — форма Mode B/C (за макетом 2)
**STEP 4 — Wire onClick handlers** → fetch /api/intelligence/run → toast + redirect

**VALIDATE BUILD:**
- npx tsc --noEmit → exit 0
- pnpm run build → "Compiled successfully"
- Manual smoke test через browser MCP після ship — Vadym кликає Mode A → бачить toast → redirect

**COMMIT:** `feat(s-core-1c): UI wiring — 3 modes на /pulpit + форма /pulpit/szukaj + /api/intelligence/run`

**NON-GOALS:**
- NIE робити повний enrichment pipeline (це S-CORE.2 для clients, S-CORE.3 для produkty)
- NIE додавати progress bar UI (separate task post S-CORE.1)
- NIE wire Hot pary update real-time (це у S-CORE.3)

---

### Post-S-CORE.1 verification (Protocol 4)

Після всіх 3 sub-sprints — Claude (claude.ai) робить через browser MCP:
1. Відкрити /pulpit/dzisiaj — побачити 3 cards modes? OK/FAIL
2. Кликнути Mode A → побачити toast? OK/FAIL
3. Перейти /pulpit/szukaj — побачити форму з radio Mode B/C? OK/FAIL
4. Submit форму з тестовими фільтрами → 200 response? OK/FAIL

Звіт Vadymу + EOD reconciliation у docs/sztab-state.md.

---

## Sprint S-CORE.2 — Wire Client Profile (planned)

**Estimate:** 4-6h (revised after Strategy Shift — було 3-4h)
**Depends on:** S-CORE.1 done

**Scope:**
- 2 endpoints: `/api/intelligence/quick` (~5s, 0,10 zł) + `/api/intelligence/full` (~60s, 1,60 zł)
- Wire 2 кнопки на /clients/[id]
- Бізнес-профіль AI блок (вихід Szybki podgląd)
- 7 tabs (Profil / Macierz / Marketplace / Sygnały / Kontakty / Historia analiz)
- 8 CIL акордеон

---

## Sprint S-CORE.3 — Wire Product Profile (planned)

**Estimate:** 4-6h
**Depends on:** S-CORE.2 done

**Scope:**
- 4 кнопки на /produkty/[id]: Analiza produktu / Analiza rynku / Wygeneruj prośbę o ofertę (PIL-2d) / Strategia SKU
- ТОП-100 клієнтів × % match вихід
- Сегментація hot/warm/cold
- AI-стратегія per segment
- 5 PIL tabs (Identity / Cennik / Popyt / Dystrybucja / Marka)

---

## Sprint S-CORE.4 — Wire Market Profile (planned)

**Estimate:** 3-4h
**Depends on:** S-CORE.3 done

**Scope:**
- /rynek/[product_id] — TAM/SAM/SOM analiza
- Match histogram per товар
- External market context (ZSRIR, fresh-market, EU Agri-food)
- Конкуренти (Krakus, Roleski, local artisan)

---

## Sprint S-CORE.5 — Wire Strategy Profile (planned)

**Estimate:** 6-8h (revised after Strategy Shift — було 4-5h)
**Depends on:** S-CORE.4 done

**Scope:**
- /strategia — drzewo per SKU/kategoria/kanał/brand
- /strategia/[id] — long-form raport з 10 секцій
- Edit ручний per секція
- Versioning (v1, v2, v3)
- Eksport PDF, Stwórz zadania w kalendarzu, Udostępnij Pikniko

**Sekcje raportu:**
1. Sytuacja wyjściowa
2. Cele strategiczne
3. Segmentacja klientów
4. Główna rekomendacja
5. Argumentacja
6. Konkurencja i positioning
7. Plan działania (4 tygodnie)
8. Ryzyka i scenariusze
9. KPI i monitorowanie
10. Założenia i ograniczenia

---

## SPRINT STATUS UPDATE — 04.05.2026

Reconciliation існуючих "(planned)" labels проти реального ship status. Existing sections вище preserved як historical record (planning intent на 03.05 evening).

### Phase 2.8 KRS bulk wire — SHIPPED 04.05.2026

**Commit:** `41c575b` feat(s-core-2-night): Phase 2.8 KRS bulk wire — rejestr.io /org with email + decision_maker extraction (6 files, +1095 lines)

**Files:**
- `lib/rejestrio/search.ts` — typed shape per real test 2026-05-04 (KrsSearchAdres з nested teryt/kod, KrsSearchStan з w_*без czy_, KrsSearchKontakt + KrsSearchGlownaOsoba)
- `scripts/sync-krs-bootstrap.ts` — pattern-match sync-ceidg-bootstrap.ts, INSERT/UPDATE pre-check pattern (Supabase JS .upsert не сумісний з partial unique)
- `scripts/test-rejestrio-search.ts` — diagnostic single live call
- `scripts/055_unique_constraints_multi_source.sql` — drop NOT NULL ceidg_id + UNIQUE krs_number partial
- `scripts/056_email_decision_maker_columns.sql` — email column existed (014), decision_maker_name new
- `scripts/probe-rejestrio-search.ts` DELETED (probe циклу закінчений)

**Smoke test (real DB):**
- 100 prospects ingested (4639Z × Mazowieckie, pages 0-1)
- 33% з email, 76% з decision_maker_name (KRS Biznes plan rocks)
- Cost: 0.30 zł
- Tonight planned: full 305-firm sweep (~0.25 zł)

### S-CORE.0 (UI макети) — REPLACED 04.05.2026

**Original plan:** UI макети 9 сторінок + UI аудит через incognito Cowork (Protocol 23 enforce).

**Reality:** filesystem audit (через Chrome MCP) виявив що більшість existing UI вже coverage Sprint S2B Phase 2 (April-era). UI макети як deliverable provided low practical value поверх existing codebase.

**Per Protocol 24 (новий 04.05):** filesystem-first verification замінив UI макети як discovery primary path. Макети `sztab-makiety-v2.html` (97К chars) залишаються як reference, але S-CORE.0 deliverable вважається REPLACED.

### S-CORE.1 (intelligence engine) — SHIPPED 03.05.2026

Per попередніх sprint sections вище. 3 sub-sprints:
- S-CORE.1.A scaffolding (commit 1537bba)
- S-CORE.1.B 3 modes + AI templates (commit 34242d9)
- S-CORE.1.C UI wiring (commit 2f9d9b7)

**Realised role (REVISED 04.05):** S-CORE engine = bulk runner для batch operations by-PKD/woj. Per-entity workflows (Analiza klienta, Analiza produktu) живуть на dedicated endpoints (S2B Phase 2 pattern для clients, S-CORE.3.A pattern для products), НЕ через unified Orchestrator.

### S-CORE.2 (Wire Client Profile) — RECONCILED 04.05.2026

**Original plan:** "Wire client profile" — 2 endpoints `/api/intelligence/quick` + `/api/intelligence/full`, wire 2 кнопки на /clients/[id], бізнес-профіль AI блок.

**Reality:** S2B Phase 2 (April-era, ~Sprint Sprint M) ВЖЕ реалізував per-client analysis workflow на /clients/[id]:
- ClientDetailActions кнопки
- BusinessProfileSection (clients.business_profile JSONB)
- /api/clients/[id]/full-analysis (wrapper до /api/intelligence/lookup)
- /api/ai/analyze-profile (AI-only re-run)
- MatchesPanel + recompute-client endpoint

S-CORE.2 plan-vision не materialized як unified engine call — S2B Phase 2 робить ту саму user-facing функціональність dedicated endpoints. Architecture decision (per Protocol 26): keep two parallel patterns by purpose.

### S-CORE.3.A (products business_profile MVP) — SHIPPED 04.05.2026

**Commit:** `67a85a6` feat(s-core-3a): products business_profile + Analiza produktu CTA + ProductAnalysisSection (5 files, +749 lines)

**Files:**
- `scripts/057_products_business_profile.sql` — business_profile JSONB + last_analyzed_at + enrichment_log CHECK extension to allow target_type='product'
- `app/api/products/[id]/full-analysis/route.ts` — direct Claude Sonnet 4.6 call (mirror /api/ai/analyze-profile pattern)
- `components/produkty/product-analysis-section.tsx` — Card з hot/warm/cold segments display
- `components/produkty/produkty-shell.tsx` — Analiza produktu button у detail header + AccordionSection wrap
- `lib/profile/enrichment-log.ts` — LogStartOptions union extended з 'product'

**Verified end-to-end:**
- /produkty: click product → "Analiza produktu" button → ~30-60s "Trwa w tle" banner → page refresh з populated section
- Real AI output на Ogórki kiszone з real client integration (Imperial, KOZAK OLEK, Domek Sushi)
- Cost: $0.0172 per analysis
- Telemetry у enrichment_log target_type='product'

### S-CORE.3.B (next session) — PLANNED

**Estimate:** ~1.5-2h Cowork solo work

**Scope:**
- TOP 25 client matching section на /produkty detail panel (читати existing matches table WHERE product_id=X ORDER BY combined_score DESC LIMIT 25)
- product_match_runs table — versioning + iterative exclusion logic ("Pokaż наступних 25 без overlap")
- Market intelligence: similar products / конкуренти у segmencie (Allegro scraper.ts reuse + Tavily fallback)
- Helper extraction lib/ai/product-analysis.ts якщо потрібен reuse

### S-CORE.4 (Wire Market Profile) — PLANNED

**Estimate:** 3-4h. Scope per S-CORE.3 sprint section вище — /rynek/[product_id], TAM/SAM/SOM, ZSRIR external context.

### S-CORE.5 (Wire Strategy Profile) — PLANNED

**Estimate:** 6-8h. Scope per existing section вище — /strategia drzewo + 10-секційний long-form raport.

### Backlog tech-debt

- CEIDG resume page 22+ (HTML response error на page 22, JSON.parse без graceful fallback)
- 25 baseline tsc errors (cleanup-sprint post S-CORE.5)
- middleware → proxy migration (Next.js 16 deprecation)
- Helper extraction для shared AI patterns (product-analysis, business-analysis convergence)

