# Sztab Audit Report — 2026-05-13

**Дата проведення**: 12-13.05.2026
**Контекст**: Vadym о 8:25 ранку запросив глибокий аудит відповідності платформи Sztab стратегічному баченню Ziomek Fish (post-Pikniko pivot, direct sales до ~50 faktura клієнтам через Sprint S6D Day 0-5).
**Виконавці**: Cowork (codebase + DB + docs scan) + Claude (Chrome MCP live UI walkthrough).
**Артефакти**: `outputs/sztab-audit/audit-bundle.md` (701 рядків) + цей файл (committable).

---

## 1. Executive Summary

Sztab у поточному стані — **6.3/10** усереднена UX-оцінка по 10 ключових сторінках. Платформа має сильне ядро (`/clients/[id]` 8.5/10, `/intelligence/prospects` 8/10) але страждає від трьох системних проблем:

1. **Legacy Pikniko branding** все ще присутнє у 4 routes + 1 sidebar entry + 4 UI refs + 1 DB table — користувач натикається на застарілу таблицю cohorts при щоденному обході sprzedaz/matches.
2. **Cohort UI workflow gap** (`/intelligence/cohorts/[id]` 4/10) — Status pill без optimistic UI, Score column ambiguous, файл 800 рядків.
3. **Sidebar inconsistency** — 3 different sidebars з 5 placeholder routes (404 dead links у IntelligenceSidebar), EN/PL mixed terminology.

**Day 0-5 Sprint S6D shipped ~4250 LOC** (PKD 2025 mapping, AI client classification, menu extraction pipeline, prediction engine). Архітектурно правильно, але **two-track UX gating** (gastronomia vs hurtownia) застосоване тільки на `/clients/[id]`, не на list views.

**Strategic alignment з Ziomek Fish vision**: 7/10. L1-L6 (DB → CEIDG scoring → schema → enrichment → algo matching → AI re-score) — DONE. L7 (AI sales strategy) — placeholder. Menu prediction engine (Day 4) приносить новий differentiator для gastronomia, але hurtownia track майже не покритий (manual asortyment import обіцяний у Day 6+).

---

## 2. Alignment з стратегічним баченням

| Шар архітектури | Plan (CLAUDE.md) | Реальність | Gap |
|---|---|---|---|
| **L1** DB foundation | Supabase + 57 таблиць + 2 views | ✅ shipped | — |
| **L2** CEIDG scoring | horeca_meta_score + chain loyalty | ✅ shipped (2705 prospects) | loyalty_tier=null для всіх chains крім Żabka/Lewiatan/Groszek |
| **L3** Schema hygiene | продукт/клієнт атрибути | ✅ shipped | Branża column показує raw UC_LQE96U коди у /clients list |
| **L4** Enrichment | Apify + KRS + AI | ⚠️ partial | 385/2705 enriched (~14% coverage), Apify Starter $29/mo just activated |
| **L5** Algo matching | broad sweep | ✅ shipped | 50500 matches у DB, але ratio 187:1 vs clients — backlog growth |
| **L6** AI re-score | TOP-20 non-obvious | ✅ shipped | working на /matches `[L6 AI bulk]` button з cost guard |
| **L7** AI sales strategy | NEW capability | ❌ placeholder | `lib/matching/sales-snippet.ts` "L7 lite" only — cold-opener + value-prop |
| **Hybrid algo+AI** | усі шари | ⚠️ partial | Working на L5+L6, не у Day 4 prediction engine (pure algo formula) |

**Two-track architecture (gastronomia/hurtownia, v5 ACCEPTED)**:
- Gastronomia track: menu extraction (Apify GMaps + WWW + wedo PDF + UpMenu blocker detection) → AI dish→ingredient mapping → 3-tier coverage aggregation → prediction → correction form. **DONE**.
- Hurtownia track: manual asortyment import — **NOT YET shipped** (planned Day 6+).
- `client_type` filter chips видимі тільки на `/intelligence/prospects` (4 з 9 типів) — gastronomia/hurtownia/sklep_detal/hotel.

**Strategic gaps**:
- L7 sales strategy layer empty
- Hurtownia track має тільки classification + filter, не має workflow
- KRS bulk paginator TODO у `lib/intelligence-engine/core/modes/registry-mode.ts` (Phase 2.8 не fully wired)
- chains loyalty_tier=null (потребує Vadym manual verification)

---

## 3. UX Scores per Page

10 ключових сторінок, Nielsen 5 heuristics (1-10 шкала):

| Page | Visibility | Real-world | Control | Consistency | Recognition | **Total** |
|---|---|---|---|---|---|---|
| `/clients/[id]` (detail) | 9 | 9 | 9 | 8 | 8 | **8.5/10** |
| `/intelligence/prospects` | 9 | 9 | 9 | 8 | 6 | **8/10** |
| `/pulpit/dzisiaj` (Dziś) | 8 | 9 | 8 | 7 | 6 | **7.5/10** |
| `/clients` (list) | 8 | 6 | 8 | 6 | 5 | **7/10** |
| `/produkty` | 7 | 6 | 8 | 6 | 5 | **6.5/10** |
| `/sprzedaz` | 8 | 8 | 8 | 5 | 4 | **6/10** |
| `/matches` | 8 | 7 | 5 | 5 | 4 | **6/10** |
| Sidebar (3 versions) | 6 | 6 | 7 | 3 | 3 | **5/10** |
| `/intelligence` (AI Discovery hub) | 5 | 5 | 5 | 5 | 5 | **5/10** |
| `/intelligence/cohorts/[id]` | 5 | 7 | 3 | 5 | 3 | **4/10** |

**Avg: 6.3/10**.

### Top 5 strengths
1. `/clients/[id]` AccordionSection pattern з meta tags — Vadym одразу бачить що в кожній секції
2. `/intelligence/prospects` 3-dimensional filter (type/ua/client_type) з canonical URL strip
3. `/clients/[id]` Hero badges (status+type+NIP+KRS+REGON) — fast visual identity
4. `/pulpit/dzisiaj` WarningsPanel auto-hides gdy 0 — no noise
5. `/sprzedaz` Kanban з optimistic drag-drop + isOverdue red flag

### Top 5 weaknesses
1. `/intelligence/cohorts/[id]` Score column ambiguity (horeca_meta_score vs gmaps_rating без legend)
2. Sidebar: 5 placeholder routes 404 у IntelligenceSidebar
3. `/clients` list відсутній client_type badge (Day 1 додав тільки на detail)
4. `/sprzedaz?tab=kohorty` показує legacy `pikniko_handoff_cohorts`
5. `/matches` "Export Pikniko CSV" як primary CTA після pivot

---

## 4. Findings P0 — Blocking Vadym work today/tomorrow

| # | Item | Effort | File(s) | Чому P0 |
|---|---|---|---|---|
| 1 | `/sprzedaz?tab=kohorty` показує застарілу `pikniko_handoff_cohorts` | 2h | `app/(dashboard)/sprzedaz/page.tsx:83-156` | Vadym НЕ бачить cohort 29 (CzM outreach) при ранковому workflow |
| 2 | `Export Pikniko CSV` rename or remove на /matches | 30min | `components/matches/matches-global-view.tsx:268` | Confusing branding для current sales |
| 3 | 5 placeholder routes 404 у IntelligenceSidebar | 1h | `components/intelligence/sidebar.tsx:163-178` | discovery/dopasowania/analizy = dead links |
| 4 | Cohort optimistic UI відсутній | 2-3h | `app/intelligence/cohorts/[id]/_components/cohort-members-client.tsx` (800 lines) | Status/Notes save потребує F5, Vadym caught |
| 5 | Score column ambiguity у cohort | 1h | same file | "4.7" — це horeca_meta_score чи gmaps_rating? |

**Total P0 effort: ~7 годин**.

---

## 5. Findings P1 — 1-week ship

| # | Item | Effort | File(s) |
|---|---|---|---|
| 6 | Type badge у /clients list (FlatTable + UnifiedTable) | 3h | `components/clients/clients-table.tsx` + `clients-hub.tsx` |
| 7 | "Pikniko handoff" remove from sidebar Sprzedaż group | 30min | `components/app-sidebar.tsx:225` |
| 8 | `pikniko_handoff_cohorts` → `cohorts` migration + deprecate /handoff/pikniko route | 4h | migration + sprzedaz tab swap |
| 9 | Multi-supplier filter chips у /produkty (CzM/SpoonJoy/Karol) | 2h | `components/produkty/produkty-shell.tsx` |
| 10 | "Convert to cohort" bulk action на /matches | 3h | `components/matches/matches-global-view.tsx` |
| 11 | 800-line cohort-members-client.tsx refactor у StatusPill/NotesCell/ScoreCell | 4h | extract 3 components |
| 12 | EN/PL terminology unify у sidebars (Cohorts→Kohorty, drop "AI Discovery") | 2h | 3 sidebar files |
| 13 | UnifiedTable + FlatTable consolidate — single table з conditional columns | 5h | clients-hub.tsx + clients-table.tsx |

**Total P1 effort: ~24 години**.

---

## 6. Findings P2 — 2-week polish

| # | Item | Effort | File(s) |
|---|---|---|---|
| 14 | Full 9-type client_type dropdown у /intelligence/prospects (currently 4 chips) | 2h | `app/intelligence/prospects/page.tsx` |
| 15 | PKD horeca_category column у /clients list замість raw industry | 3h | clients-table.tsx + DB view |
| 16 | `/produkty` "Importuj cennik" — фікс або видалити (disabled 6+ sprints) | 4-8h | `app/(dashboard)/produkty/page.tsx:41` |
| 17 | Pagination на /clients (re-enable proper, PAGE_SIZE=50 + numbered pages) | 2h | clients-table.tsx |
| 18 | Score color thresholds sync /matches ↔ /clients hub (≥70 chip vs ≥70 green) | 1h | matches-global-view.tsx |
| 19 | Cohort header metadata — show name + member count + created_at | 1h | cohort detail page |
| 20 | Reason codes tooltip (currently truncated +N) на /matches | 2h | matches-global-view.tsx |
| 21 | PredictionsSection empty state — remove `<code>` tag (too tech for end-user) | 30min | predictions-section.tsx |

**Total P2 effort: ~16-20 годин**.

---

## 7. Findings P3 — Backlog

| # | Item | Effort |
|---|---|---|
| 22 | "Open cohort 29" shortcut на /pulpit/dzisiaj | 1h |
| 23 | UA flag emoji removal (🇺🇦 → text "UA-власник") | 30min |
| 24 | Hero row REGON visual differentiation (NIP vs KRS vs REGON) | 30min |
| 25 | Branża column legacy code mapping (UC_LQE96U → human label) | 4h |
| 26 | "AI Discovery" naming pivot — replace з "Intelligence" everywhere | 2h |
| 27 | TODO/FIXME inventory (33 hits) — triage list у docs/tech-debt.md | 2h |

---

## 8. Pikniko Code Inventory

**Поверхня legacy**: 4 routes + 1 sidebar link + 4 UI refs + 3 cross-refs + 1 DB table.

### Routes
- `app/(dashboard)/handoff/pikniko/page.tsx` — 234+ lines, queries `pikniko_handoff_cohorts`
- `app/discovery/pikniko-maxim/page.tsx` — discovery portal questionnaire (окремий concern, **KEEP** — Maxim still owns)
- `app/api/export/pikniko-handoff/route.ts` — CSV export endpoint
- `app/api/discovery/submit/route.ts` + `/load/route.ts` — discovery portal backend (**KEEP**)

### Sidebar links
- `components/app-sidebar.tsx:225` — `{ name: 'Pikniko handoff', href: '/handoff/pikniko' }`

### UI references "Pikniko"
- `components/matches/matches-global-view.tsx:268` — "Export Pikniko CSV" button
- `components/handoff/export-buttons.tsx:143,148` — `pikniko-cohort-${date}.csv` filename
- `components/clients/business-profile-section.tsx:225` — hardcoded `{ name: 'Pikniko', strength: null, skuCount: null }`
- `components/persons/person-edit-panel.tsx:197` — placeholder "Co Pikniko wie..."

### Cross-references у `/sprzedaz`
- `app/(dashboard)/sprzedaz/page.tsx:89,144` — fetches/links pikniko_handoff_cohorts
- `app/(dashboard)/layout.tsx:44` — count badge fetch

### DB tables
- `pikniko_handoff_cohorts` — **LEGACY** (Sprint N Phase C2, pre-pivot)
- `cohorts` + `cohort_members` — **CURRENT** (Phase 2 Krok 1.C1)

**Migration scope**: ~6h одно-разова data migration + route deprecation.

---

## 9. TODO/FIXME inventory

**33 TODO markers** у код (нема PLACEHOLDER/FIXME/HACK):

| Location | Count | Категорія |
|---|---|---|
| `lib/intelligence/zsrir.ts` | 6 | MEDIUM priority data sources (S-INTEL.1.2 follow-up) |
| `app/api/cron/market-intelligence/route.ts` | 4 | S-INTEL.1.2.2/3 ingestion |
| `lib/intelligence-engine/core/modes/registry-mode.ts` | 4 | S-CORE.2 bulk paginators (CEIDG/KRS/Apify/Tavily) |
| `lib/ceidg/scoring.ts` | 2 | V2 chain loyalty multiplier |
| `lib/intelligence-engine/core/modes/existing-mode.ts` | 2 | S-CORE.2 enrichment wire |
| Інші | 15 | matching/geographic, jobs, product-form, deals margin gating, lookup AI rescore, etc. |

Triage recommendation: P3 item #27 — створити `docs/tech-debt-2026-05.md` з категоризацією.

---

## 10. Дорожня карта (proposed)

### Тиждень 1 (13-17.05.2026) — P0 cleanup (~7h)
Day 6: Pikniko sidebar removal + Export rename (P0 #2, #7) — 1h
Day 7: /sprzedaz?tab=kohorty swap до cohorts (P0 #1) — 2h
Day 8: IntelligenceSidebar 5 placeholder routes (P0 #3) — 1h
Day 9: Cohort optimistic UI + Score tooltip (P0 #4, #5) — 3h

**Ship checkpoint**: Vadym ranок ranok може open /sprzedaz → бачить cohort 29, /matches без Pikniko branding, sidebar без 404 links.

### Тиждень 2 (20-24.05.2026) — P1 functional gaps (~24h)
- Type badges у list views (3h)
- Migration pikniko_handoff_cohorts → cohorts (4h)
- Multi-supplier filter (2h)
- "Convert to cohort" bulk (3h)
- 800-line refactor (4h)
- EN/PL unify (2h)
- Table consolidate (5h)

**Ship checkpoint**: Day 5 cohort 29 outreach має робочий workflow без legacy code. /clients list дає Vadym one-glance розуміння типу бізнесу.

### Тиждень 3 (27-31.05.2026) — P2 polish (~16-20h)
Pagination, full 9-type dropdown, score sync, tooltips, header metadata.

### Тиждень 4 (3-7.06.2026) — L7 sales strategy + hurtownia track
**Поза scope аудиту** — потребує окремого strategy session з Vadym.

---

## 11. Ризики та обмеження

1. **Apify billing tier**: Starter $29/mo just activated (~500-700 NIPs/місяць). Якщо outreach scale зросте >700 NIPs/мес — потрібен upgrade або prepaid add-ons.
2. **CEIDG ≠ sp. z o.o.**: 14% coverage current. Phase 2.8 KRS bulk paginator (rejestr.io) — є TODO, не shipped.
3. **chains loyalty_tier=null** для більшості мереж — Vadym має verify manually. Не екстраполювати.
4. **Cowork sandbox network isolated** — не може reach localhost:3000. Live UI verification = Claude через Chrome MCP only.
5. **Protocol 37**: NIKOLI bash cp/mv/rm на tracked files (virtiofs write-back corrupts). Всі file moves через Edit tool.

---

## 12. Артефакти

- **`outputs/sztab-audit/audit-bundle.md`** (701 рядків) — повний technical bundle: codebase + DB schema + git history + UX scoring details + recommendations
- **`outputs/sztab-audit/codebase-overview.md`** (518 рядків) — full app/ + lib/ + components/ tree
- **`outputs/sztab-audit/db-schema.md`** — 57 таблиць + 2 views з row counts
- **`outputs/sztab-audit/git-history.md`** — 40 latest commits + activity since 26.04
- **`docs/sztab-audit-2026-05-13.md`** (цей файл) — committable audit report

---

## 13. Підсумок для Vadym

Sztab — **technically sound** платформа з правильною архітектурою (7-шарова, two-track v5 ACCEPTED, Sprint S6D Day 0-5 shipped clean). Основна **поверхня для покращення = UX consistency post-Pikniko pivot**.

7 годин роботи на тиждень 13-17.05 розблоковує морning workflow:
- Cohort 29 visible у /sprzedaz
- Sidebar без 404 dead links
- /matches без Pikniko branding
- Cohort UI optimistic (без F5)

Після P0 — нормальний sprint cycle (Day 6+) може фокусуватися на hurtownia track + L7 sales strategy. Жоден з audit findings НЕ блокує core gastronomia workflow (menu + predictions працюють на /clients/[id]).

**Аудит виявив 27 actionable findings**. Sztab НЕ потребує rewrite. Sztab потребує **deprecation cycle** для Pikniko-era patterns + UX polish на recently shipped features.
