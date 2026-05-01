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

