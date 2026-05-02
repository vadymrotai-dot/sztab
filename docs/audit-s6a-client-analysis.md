# SZTAB — Audit S6A: Аналіз клієнта (Phase A/B → AI re-score → UI)

**Date:** 02.05.2026
**Audited by:** Claude (Cowork mode, repo read-only)
**Method:** Read-only repo audit. Без live-кліків. Source of truth — файли в C:\Users\vadym\Projects\sztab/ + docs/sztab-state.md (DISCOVERY #2 — Phase A/B split, S5D Phase B Status Surface).
**Scope:** S6A "Аналіз клієнта" — одна fundamental кнопка на /clients/[id] згідно Protocol 13.
**Constraint:** Read-only. Жодних code edits, git операцій, npm/pnpm викликів.

---

## 1. Executive Summary

- Phase A/B pipeline на `/api/intelligence/lookup/route.ts` ВЖЕ implementuje шаблон Protocol 13 на backend: Phase A (sync, identity+VAT+initial matching, ~10-30s) → Phase B через Next.js `after()` (BZP+rejestrio_v2 паралельно, потім serial Tavily → Apify_GMaps → AI business analysis → final algo recompute).
- AI client analysis ВЖЕ existing — `lib/ai/business-analysis.ts` (Claude Haiku 4.5) пише в `clients.business_profile` JSONB. Output schema покриває 5 з 7 полів Discovery #4 client context (scale, активність, що купує, decision maker, risk signals, best-fit products) + buyer_strength_for_chm. Cold opener angle — окремий endpoint `/api/ai/cold-opener`.
- На /clients/[id] ВЖЕ є Action Bar (`ClientDetailActions`, S4 P1B), але primary CTA = "Analizuj AI" → POST `/api/ai/analyze-profile` що запускає **тільки** AI step без fresh sources fetch. Це порушує Protocol 13: AI первий, не останній.
- Phase B status surface (S5D amber dashed border + pending list) реалізовано тільки на `/intelligence/lookup` (`lookup-form.tsx`). На /clients/[id] показується blue `EnrichmentProgressBanner` без S5D pattern і без conditional `phase_b_pending` list.
- **AI re-score matching** (L6 `lib/matching/ai-rescore.ts`) ще НЕ викликається у Phase B пайплайну. У Phase B виконується лише `computeMatchesForClient` (algo recompute з niche bonus з business_profile). AI rescore тригериться тільки з `/matches` bulk кнопок per-product (`/api/admin/matching/ai-rescore` / `ai-rescore-bulk`).

---

## 2. Phase A/B Current State (key findings)

### 2.1 Файл: `app/api/intelligence/lookup/route.ts` (1257 рядків)

Endpoint `POST /api/intelligence/lookup` приймає `{ nip }`, повертає `LookupResponse` з:

```ts
interface LookupResponse {
  client_id: string | null
  entity_type: 'JDG' | 'sp.z o.o.' | 'S.A.' | 'inne' | 'unknown'
  sources_completed: StepResult[]
  fields_filled: number
  persons_created: number
  top_matches: Array<{ product_id, product_name, combined_score }>
  errors: string[]
  phase_b_pending?: string[]   // S5D
}
```

### 2.2 PHASE A (sync, returned до 30s)

Виконується послідовно (NOT parallel):
1. **GUS** REGON → витягує krs_number → upsert clients row
2. **GUS_branches** (одразу після GUS)
3. **KRS** (jeśli krsNumber) → fields_list + clients row update + canonical fields
4. **VAT_BL**
5. **matching** — `computeMatchesForClient` (algo only, fresh PKD)

Response повертається з `phase: 'A_complete', enrichment_pending: true`.

### 2.3 PHASE B (async via `after()`, до 120s)

Будується через `runPhaseB({...})`:
1. **STEP 3** (parallel, `Promise.allSettled`): `runBzpStep` + `runRejestrioStep` (9 v2 endpoints для KRS).
2. **STEP 4** (serial): `extractAndCreatePersons`.
3. **STEP 4.5** (serial): Tavily web search → upsert canonical fields (website/facebook/instagram/news_mentions).
4. **STEP 5** (serial): Apify_GMaps (з pre-flight `findExistingContact` skip).
5. **STEP 6.5** (serial): `analyzeBusinessProfile` — Claude Haiku → `clients.business_profile` JSONB.
6. **STEP 6 final** (serial): `computeMatchesForClient` (algo recompute з niche bonus з fresh business_profile).

Phase B writes до `enrichment_log` (status='running' → 'success'/'partial'/'error') але response object НЕ повертається назад до клієнта. Polling `enrichment-status` — це механізм UI спостереження.

### 2.4 phase_b_pending construction (lookup/route.ts:445-456)

```ts
const tavilyWillRun = !!(params.tavily_api_key || process.env.TAVILY_API_KEY)
const pending: string[] = ['BZP', 'persons']
if (krsNumber) pending.push('rejestrio_v2')
if (tavilyWillRun) pending.push('tavily')
if (params.apify_api_token) pending.push('Apify_GMaps')
if (params.anthropic_api_key) pending.push('AI_business_analysis')
response.phase_b_pending = pending
```

Conditional list, відображає реальні Phase B sources залежно від наявності API keys + entity type.

### 2.5 Що Phase B НЕ робить (gap проти Protocol 13):
- НЕ запускає AI re-score matches (`rescoreTop20` з `lib/matching/ai-rescore.ts`).
- НЕ пише AI cold opener (його тригерять окремо).
- Не consolidує "all sources done" event перед AI — STEP 6.5 серіально, але structurно це OK (AI runs після всіх sources).

---

## 3. UI State /clients/[id] — component tree + gaps

### 3.1 Component tree

```
app/(dashboard)/clients/[id]/page.tsx (server component)
├── PageHeader
│   └── actions: <ClientDetailActions clientId nip hasProfile />   ← Action Bar
│       └── components/clients/client-detail-actions.tsx (client)
│           └── ActionBar
│               ├── primary: "✨ Analizuj AI" / "Re-analizuj"
│               │   onClick → POST /api/ai/analyze-profile          ← TILKO AI, no sources
│               ├── actions: + Zadanie / + Notatka / + Szansa (links)
│               └── menu (⋯):
│                   ├── Edytuj → /clients/[id]/edit
│                   ├── Eksport (Markdown) → /api/clients/[id]/export-markdown
│                   ├── "Pobierz z KRS" → POST /api/intelligence/lookup ← FULL pipeline (Phase A+B)
│                   └── Usuń → deleteClientRecord
├── Hero row: status badge + NIP/KRS/REGON
├── <EnrichmentProgressBanner clientId={id} />                       ← polls enrichment-status
│   └── Blue banner (NOT amber dashed S5D pattern)
├── <MetricStrip ... />
├── AccordionSection "Profil" (defaultOpen)
│   └── <ProfileSectionV2 ... />
├── AccordionSection "Sprawozdania finansowe"
│   ├── action: <KrsRefreshButton clientId enabled />               ← per-section KRS-only refresh (S5B)
│   └── <FinancialStatementsTable />
├── AccordionSection "Osoby"
│   ├── action: <KrsRefreshButton ... />                            ← duplicate KRS button
│   └── <PersonsSectionV2 />
├── AccordionSection "Sygnały"
│   ├── action: <SectionActionLink "Sprawdź BZP" href=/intelligence/lookup?nip=... />
│   └── <SignalsSection ... />
├── AccordionSection "Analiza biznesowa (AI)" (id=analiza-ai)       ← AI summary block
│   └── <BusinessProfileSection clientId profile={c.business_profile} />
│       ├── header: SparklesIcon + "Re-analyze" button → /api/ai/analyze-profile
│       ├── body: business_format, locations, summary_pl, traits, demographics, categories
│       ├── <SupplierMatrix /> (PLACEHOLDER окрім ChM, чекає Sprint M)
│       ├── buyer_reasoning_pl
│       └── input_sources list
├── AccordionSection "Dopasowania produktów"                         ← matching candidates
│   ├── action: <SectionActionLink "Pokaż TOP-10 →" href=/matches?client_id=... />
│   └── <MatchesPanel mode="product-side" keyType="client_id" recomputePath="/api/admin/matching/recompute-client" />
├── AccordionSection "Kontakt"
│   └── <ContactSectionV2 .../>
└── AccordionSection "Aktywność"
    └── Tabs: Kontakty / Umowy / Zadania
```

### 3.2 Excerpt: `client-detail-actions.tsx:26-71` (primary "Analizuj AI" + menu "Pobierz z KRS")

```tsx
async function analyze() {
  setBusy('analyze')
  const res = await fetch('/api/ai/analyze-profile', { method: 'POST', body: JSON.stringify({ clientId }) })
  // → /api/ai/analyze-profile викликає TILKO analyzeBusinessProfile()
  //   без re-fetch джерел. AI працює зі вже зібраними даними.
}

async function refreshFromKrs() {
  setBusy('krs')
  const res = await fetch('/api/intelligence/lookup', { method: 'POST', body: JSON.stringify({ nip }) })
  // → запускає ПОВНИЙ Phase A + Phase B pipeline (всі sources). 
  //   Назва "Pobierz z KRS" misleading — реально fan-out до 6+ sources.
}
```

### 3.3 Excerpt: `enrichment-progress-banner.tsx:22-57` (Phase B polling)

```tsx
useEffect(() => {
  async function checkStatus() {
    const res = await fetch(`/api/intelligence/enrichment-status?clientId=${clientId}`)
    const data = await res.json() as { running: RunStatus[] }
    setRunning(data.running ?? [])
    if (prev.length > 0 && next.length === 0) router.refresh()  // auto-refresh page
    pollHandle = setTimeout(checkStatus, 10_000)
  }
  checkStatus()
}, [clientId, router])
// UI render: blue banner з "Wzbogacanie w toku…" + список running sources
// БЕЗ S5D amber dashed pattern + БЕЗ "Te źródła są pobierane w tle" copy
```

### 3.4 Gaps на UI:

- **Дві competing primary actions:** "Analizuj AI" в action bar + "Pobierz z KRS" в menu. Vadym не знає що "Pobierz z KRS" реально triggers full Phase A+B pipeline.
- **Phase B status surface не consistent:** lookup-form.tsx має S5D amber dashed UI, /clients/[id] має blue Loader banner з іншою copy. UX dissonance.
- **AI section inline trigger (`Re-analyze` в `BusinessProfileSection`)** дублює primary action — але викликає той самий `/api/ai/analyze-profile`.
- **KrsRefreshButton** використано двічі (Sprawozdania + Osoby) — це per-section refresh запускає `/api/clients/[id]/krs-refresh` (KRS only), а не full pipeline. Назва "Pobierz z KRS" перетинається з menu item, що теж називається "Pobierz z KRS" але робить інше.

---

## 4. AI Client Analysis Current Schema (input → output)

### 4.1 Файл: `lib/ai/business-analysis.ts` (370 рядків)

**Model:** `AI_MODELS.FAST` → `claude-haiku-4-5`. maxTokens=1500, temperature=0.3.

**Input (gatherContext):**
| Source | Поле/таблиця |
|---|---|
| clients | title, nip, krs_legal_form, krs_number, registered_date, city, vat_status, krs_management_board |
| company_profile_fields | pkd_codes, pkd_main, website, facebook_url, instagram_url, google_maps_urls, news_mentions |
| person_company_links + persons | zarząd (imie, nazwisko, rola) |
| company_financials | rok, przychody_pln, zysk_netto_pln (last 3 years) |
| bzp_tenders | subject, cpv_codes, award_date (last 5) |
| contact_enrichment | gmaps_rating, gmaps_reviews_count, raw_payload (categories, address) |
| input_sources auto-tracked | KRS / GUS / VAT_BL / Apify_GMaps / tavily / persons / sprawozdania_KRS / BZP |

**Output (BusinessProfile JSON, persisted в `clients.business_profile` JSONB):**
```json
{
  "business_format": "single_store|chain|franchise|online|B2B_distributor|gastronomy|manufacturer|service|other",
  "estimated_locations": <number|null>,
  "product_categories_pl": [...],
  "target_demographics_pl": [...],
  "special_traits_pl": [...],
  "business_summary_pl": "<2-3 zdania>",
  "buyer_strength_for_chm": <0-100>,
  "buyer_reasoning_pl": "<1-2 zdania>",
  "model_used": "claude-haiku-4-5",
  "analyzed_at": "<ISO>",
  "input_sources": ["KRS","GUS","VAT_BL",...]
}
```

### 4.2 Discovery #4 client context coverage matrix

| Discovery #4 поле (для CLIENT context) | Покрито business_profile? | Де ще |
|---|---|---|
| Scale (small/mid/large) | ✓ business_format + estimated_locations | + employees_count в clients |
| Чи активний бізнес (signals) | ✗ не в business_profile | clients.{vat_status, bankruptcy_flag, liquidation_flag, restructuring_flag, suspended_at, last_filing_date} |
| Що купує зараз (PKD analysis + matched products) | ✓ product_categories_pl | + matches table (algo+ai_score) |
| Хто decision maker | ✗ не в business_profile | persons + person_company_links (jest_decyzyjny) |
| Recommended cold opener angle | ✗ не в business_profile | окремий /api/ai/cold-opener (Claude Haiku) |
| Risk signals (new firma, low activity, чорна VAT) | частково buyer_reasoning_pl | clients.{red flags, vat_status} + financial_statements |
| Best fit products | ✗ не в business_profile | matches table + MatchesPanel render |

### 4.3 Що відрізняється від Discovery #4 client expectations:

- `business_profile` фокусується на business model + buyer_strength_for_chm. Це OK, але НЕ містить explicit "risk_signals" ані "recommended_cold_opener_angle" array — ці rendered у різних місцях профілю.
- Decision maker, риск signals, best-fit products — derived з суміжних таблиць (persons, clients flags, matches), не з JSONB. Це structurно правильно (нормалізована модель), але вимагає 5+ окремих queries у page.tsx (вже зараз — 12 паралельних `Promise.all`).
- AI re-score matching — окремий artifact (matches.ai_score / ai_reasoning), не частина business_profile. Триггериться через /matches bulk кнопки per-product, не per-client.

### 4.4 Legacy paralel: `/api/ai/analyze-client/route.ts`

Окремий endpoint який пише text-блок до `clients.notes` (через append + timestamp). Використовує `AI_MODELS.BALANCED` (Sonnet). Це попередник `analyze-profile` (Sprint M FIX 4 консолідував до single business_profile). `analyze-client` тепер orphan endpoint — ніщо в UI його не викликає (треба перевірити окремо чи можна видалити в S6A.0 cleanup).

---

## 5. Database Schema — AI analysis storage

### 5.1 `clients.business_profile` (migration `033_business_profile.sql`)

```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_profile JSONB;
CREATE INDEX idx_clients_business_profile_gin ON clients USING gin(business_profile);
COMMENT: 'AI-generated business analysis (Claude Haiku 4.5). Shape:
  {business_format, estimated_locations, product_categories_pl[],
   target_demographics_pl[], special_traits_pl[], business_summary_pl,
   buyer_strength_for_chm (0-100), buyer_reasoning_pl,
   model_used, analyzed_at, input_sources[]}';
```

Аналогічна column існує і в `ceidg_prospects.business_profile`.

### 5.2 `enrichment_log` (migration `031_marathon_schema.sql:182`)

```sql
CREATE TABLE enrichment_log (
  id UUID PRIMARY KEY,
  target_type TEXT CHECK (target_type IN ('company','person')),
  target_id UUID NOT NULL,
  source TEXT NOT NULL,                        -- 'GUS','KRS','VAT_BL','BZP','rejestrio_v2','tavily','Apify_GMaps','AI_business_analysis',...
  run_started_at TIMESTAMPTZ DEFAULT now(),
  run_completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running','success','partial','error')),
  fields_added TEXT[] DEFAULT '{}',
  fields_updated TEXT[] DEFAULT '{}',
  fields_unchanged TEXT[] DEFAULT '{}',
  raw_payload JSONB,
  error_message TEXT,
  cost_usd NUMERIC(8,4) DEFAULT 0
);
```

Phase B steps usувати `startEnrichmentRun` (insert running) → `finishEnrichmentRun` (update status). API `enrichment-status` queries WHERE status='running' AND run_started_at >= now() - 5min — це джерело правди для Phase B polling.

### 5.3 `intelligence_runs` (migration `011_intelligence_runs.sql`)

```sql
CREATE TABLE intelligence_runs (
  id UUID PRIMARY KEY,
  owner_id UUID,
  run_type TEXT CHECK (run_type IN ('fast_lookup','deep_discovery','partner_analysis')),
  target_type TEXT CHECK (target_type IN ('product','category','supplier','client')),
  target_id UUID,
  target_snapshot JSONB,
  status TEXT,
  prompt_text TEXT,
  raw_response JSONB,
  parsed_results JSONB,
  results_count INT,
  duration_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

Використовується для Fast Lookup / Deep Discovery (на /intelligence). НЕ використовується для Phase B AI business analysis — там пишеться лише в `clients.business_profile` + `enrichment_log` row з source='AI_business_analysis'.

### 5.4 Висновок:

- `business_profile` JSONB schema — стабільна, одна column.
- `enrichment_log` — append-only event store, source of truth для Phase B status polling.
- `intelligence_runs` — окремий artifact для Discovery flows (на /intelligence). НЕ потрібний для S6A — business_profile вже зберігає AI output.

---

## 6. Gap Matrix S6A vs Protocol 13

Цільова архітектура (Protocol 13):
> ОДНА КНОПКА "Аналіз клієнта" на /clients/[id] action bar → trigger Phase A + B existing pipeline → ПОСЛЕ Phase B finishes — AI re-score з повним contextom → результат відображається на профілі через структуровані секції.

| Component | Existing? | Status | S6A потрібно? |
|---|---|---|---|
| One button "Аналіз клієнта" на action bar | Частково | "Analizuj AI" існує, але викликає тільки AI (без fresh sources fetch). "Pobierz z KRS" в menu викликає full Phase A+B але назва misleading | YES — rename + rewire primary до full pipeline |
| Phase A sources в parallel | НІ (sequential) | Phase A — sequential GUS→KRS→VAT (line 131-394). Це prag fix для Vercel 30s. Сумарно ~10-30s. | NO — sequential OK для Phase A (стабільно, debug-friendly) |
| Phase B sources в parallel | Частково | BZP+rejestrio_v2 у `Promise.allSettled` (line 509-514). Tavily/Apify/AI — serial. | NO — поточна структура працює end-to-end |
| AI business analysis runs у Phase B | YES | STEP 6.5 викликає `analyzeBusinessProfile` (lookup/route.ts:678-723) | NO — стабільне |
| AI matching re-score runs у Phase B | НІ | Phase B робить тільки algo `computeMatchesForClient`. AI rescore (`rescoreTop20`) не тригериться per-client | YES — додати AI rescore TOP-N matches для клієнта в кінці Phase B |
| Phase B status surface (amber dashed UI) | Частково | S5D amber dashed pattern лише в `lookup-form.tsx`. На /clients/[id] — синій `EnrichmentProgressBanner` без S5D consistency | YES — refactor banner до S5D pattern + render `phase_b_pending` list |
| AI summary output displayed на профілі | YES | `BusinessProfileSection` рендерить business_format / summary / traits / buyer_strength / sources list. Стабільно. | NO — leave as is |
| Single trigger to invoke entire pipeline | НІ | Vadym має 2 дороги: primary "Analizuj AI" (тільки AI) або menu "Pobierz z KRS" (full pipeline). Confusing. | YES — primary CTA = full pipeline, AI inline button → tiny "re-analiza only" в AccordionSection |
| Polling /enrichment-status з UI | YES | `EnrichmentProgressBanner` polls every 10s, auto-refresh page after Phase B done | NO — стабільне |
| Action bar component existing | YES | `components/action-bar.tsx` (S4 Phase 1A) + `client-detail-actions.tsx` (S4 Phase 1B) | NO — leave as is, refactor primary тільки |

### Інші sub-gaps (нижче критичності):
- Cold opener — окремий endpoint `/api/ai/cold-opener`, не intеgrований у Phase B pipeline. Захоплено в DEFER.
- `/api/ai/analyze-client` — orphan legacy endpoint (notes append). Потенційний cleanup в S6A.0.
- KrsRefreshButton дублюється в Sprawozdania + Osoby — leave as is, окрема опція "тільки KRS" коли Vadym не хоче full pipeline.

---

## 7. Recommended S6A Scope

### BUILD (нове)

| File / endpoint | Призначення | Effort |
|---|---|---|
| `app/api/ai/analyze-profile/route.ts` (REWORK) — або новий `app/api/clients/[id]/full-analysis/route.ts` | Trigger full Phase A+B pipeline. Wraps logic з `/api/intelligence/lookup` (потрібен NIP), повертає той самий `LookupResponse` shape з `phase_b_pending`. | 2-3h |
| Add AI re-score step у Phase B `runPhaseB` | Після `analyzeBusinessProfile` + final `computeMatchesForClient` — додати call до `rescoreTop20` АБО новий per-client variant `rescoreClientTop10` (TOP-10 продуктів цього клієнта). Update matches.ai_score / ai_reasoning. | 2-3h |
| `phase_b_pending` для full-analysis endpoint | Включити `AI_match_rescore` як новий entry pending list (conditional на `anthropic_api_key`) | 0.5h |
| New component `<ClientPhaseBStatus />` (або refactor `EnrichmentProgressBanner`) | Apply S5D amber dashed pattern + render `phase_b_pending` list. Consume `enrichment-status` polling як зараз. | 1.5-2h |

### REFACTOR (existing)

| File | Що змінити |
|---|---|
| `components/clients/client-detail-actions.tsx` | Primary CTA → "Аналіз клієнта" (sparkles icon) → POST до full-analysis endpoint (не просто analyze-profile). Loading toast → "Pobieranie danych (X/Y źródeł)..." → "Analiza AI..." (2-stage). Menu "Pobierz z KRS" rename → "Refresh KRS only" і wired до `/api/clients/[id]/krs-refresh` (existing) — щоб уникнути дублювання назв. |
| `components/clients/business-profile-section.tsx` | "Re-analyze" inline button → renamed "Тільки AI re-run" (jasne що це не повний pipeline), і опційно — disabled якщо немає `business_profile.input_sources` (якщо джерела ще не зібрані — perше треба full analysis) |
| `components/clients/enrichment-progress-banner.tsx` | Style refactor: blue → amber dashed border, copy "Trwa w tle (~30-60s)... Te źródła są pobierane w tle" — однаково як в `lookup-form.tsx`. Опційно integrate з `phase_b_pending` через initial response cache. |

### LEAVE AS IS (стабільне)

- Phase A/B orchestrator у `/api/intelligence/lookup/route.ts` (1257 рядків). Logic стабільна.
- `lib/ai/business-analysis.ts` — schema OK, output покриває 5 з 7 Discovery #4 полів (рештa derived з суміжних таблиць, не змішуємо).
- `lib/matching/engine.ts` + `lib/matching/ai-rescore.ts` — algo + L6 AI rescore стабільні. У S6A додаємо лише per-client invocation.
- `BusinessProfileSection` rendering, `MatchesPanel`, `KrsRefreshButton`, `SignalsSection`, всі інші AccordionSections.
- `enrichment_log` schema. `clients.business_profile` schema.

### DEFER до S-INTEL / пізніше

- Market intelligence layer (ZSRIR, fresh-market.pl, Eurocash catalogs) — це S-INTEL.1-5 sprint group, не S6A. Discovery #5 lock.
- `knowledge_base` seeding (Polish food market price history, competitor analyses) — Phase 1 в S-INTEL.
- Layer 2 weight tuning UI (Vadym manual rating + AI feedback loop) — S-FEEDBACK.1 після S6B.
- Cold opener integration у Phase B — defer. Залишається on-demand через окрему кнопку (existing `/api/ai/cold-opener`).
- Cleanup `/api/ai/analyze-client` orphan endpoint — defer до окремої hygiene PR (НЕ blocker для S6A).

### Estimated effort breakdown

| Component | Effort |
|---|---|
| BUILD: full-analysis endpoint wrapper | 2-3h |
| BUILD: AI re-score step у Phase B | 2-3h |
| BUILD: phase_b_pending з AI_match_rescore | 0.5h |
| BUILD: ClientPhaseBStatus / refactor banner | 1.5-2h |
| REFACTOR: client-detail-actions.tsx primary CTA | 1-1.5h |
| REFACTOR: business-profile-section "Re-analyze" copy | 0.5h |
| Verification on live (Protocol 4) | 1h |
| **Total** | **~9-12h** |

Включити STEP 0 sanity check (Protocol 3) — перевірити `analyze-client` orphan, перевірити що `rescoreTop20` працює per-client variant без regression на /matches bulk.

---

## 8. Risks & Open Questions

### Risks

- **Vercel 120s function ceiling.** Phase B вже близько до межі (BZP+rejestrio+Tavily+Apify+AI ≈ 60-100s). Додавання AI rescore (~5-10s для Haiku TOP-10) може viштовхнути за 120s. Mitigation: винести AI rescore в окремий `after()` chain або скоротити до TOP-5.
- **Дві primary actions історично.** `/api/ai/analyze-profile` має OWN `enrichment_log` rows + ця кнопка інтегрована в `BusinessProfileSection`. Перенаправлення primary до full-pipeline без backward compat може зламати "Re-analyze" button у inline section. Solution — оба endpoints співіснують, "Re-analyze" inline робить тільки AI step (як зараз), action bar primary робить full pipeline.
- **`phase_b_pending` race condition.** Якщо Vadym refreshne сторінку поки Phase B running — `EnrichmentProgressBanner` показує `running` log rows, але `phase_b_pending` з initial response втрачається (бо response не cached). Mitigation: derive pending list з enrichment_log: pending = expected (всі sources) - running - completed.
- **AI rescore cost.** Per-client Top-10 ≈ $0.005-0.01 за виклик. Якщо Vadym кліксне 50 разів за день — $0.50/день. Acceptable. Soft warn у Action Bar.
- **Protocol 14 (git boundary).** Все S6A code editing — через VS Code/PowerShell flow Vadymа, не через Cowork sandbox git operations.

### Open Questions для Vadymа

1. **Per-client AI rescore — TOP-10 чи TOP-5?** Існуючий `rescoreTop20` бере TOP-20 per-product. Per-client variant має брати TOP-N з `matches WHERE client_id=?`. N=5 безпечніше для Vercel timeout, N=10 — більше cover.
2. **Назва primary CTA:** "Аналіз клієнта" (Protocol 13 wording) чи "Аналізуй wszystko" (clear-er) чи keep "Analizuj AI" з updated semantics? Decision впливає на translation discipline.
3. **Phase B status surface на /clients/[id] — refactor existing banner чи новий component?** Існуючий `EnrichmentProgressBanner` має корисний polling logic. Refactor зберігає less files; new component — clearer separation. Рекомендую refactor.
4. **`/api/ai/analyze-client` (notes append, Sonnet) — delete зараз чи S6A.cleanup later?** Якщо нічого не викликає, видалити — gain: -139 рядків code. Risk: можливо cron або import script ще використовує. Read-only audit показав 0 callers у repo (grep на `analyze-client` повертає тільки сам route). Safe to delete у S6A.0.
5. **STEP 0 sanity check для S6A:** перевірити що між S5D ship і сьогодні нічого не зламалось у Phase B. Якщо в `enrichment_log` за останні 24h є аномалії (>10% error rate на якомусь source) — fix перед S6A scope.
6. **Cold opener в Phase B — append чи окремо?** Vadym вирішує. Якщо append — Phase B time +5s, зростає ризик 120s. Defer-варіант — залишити cold opener on-demand.

---

## 9. Audit Trail

**Files read (read-only):**

- `docs/sztab-state.md` (685 рядків) — поточний state, Discovery #2 (Phase A/B split), S5D Phase B Status Surface, Discovery #4 (S6B scope), Discovery #5 (Market Intelligence)
- `docs/sztab-protocols.md` (455 рядків) — Protocol 13 (Two Fundamental Analysis Buttons), Protocol 4, 8, 14
- `docs/sztab-sprints.md` (200 рядків) — Sprint S5 history, S6 backlog
- `app/(dashboard)/clients/[id]/page.tsx` (412 рядків) — server component тa render tree
- `components/clients/client-detail-actions.tsx` (143 рядки) — Action Bar primary + menu
- `components/action-bar.tsx` (137 рядків) — generic ActionBar primitive
- `components/clients/business-profile-section.tsx` (215 рядків) — AI summary block
- `components/clients/enrichment-progress-banner.tsx` (75 рядків) — Phase B polling
- `components/clients/krs-refresh-button.tsx` (79 рядків) — per-section KRS-only refresh
- `components/intelligence/lookup-form.tsx` (240 рядків) — S5D amber dashed pattern reference
- `app/api/ai/analyze-profile/route.ts` (69 рядків) — current AI-only trigger
- `app/api/ai/analyze-client/route.ts` (139 рядків) — orphan legacy notes-append endpoint
- `app/api/ai/cold-opener/route.ts` (head 50 рядків) — окремий cold opener endpoint
- `app/api/intelligence/lookup/route.ts` (1257 рядків) — Phase A/B orchestrator (sample read у 4 chunks)
- `app/api/intelligence/enrichment-status/route.ts` (40 рядків) — polling endpoint
- `lib/ai/business-analysis.ts` (370 рядків) — input/output schema + Claude Haiku call
- `lib/matching/ai-rescore.ts` (head 50 рядків) — L6 rescore lib (per-product zараз)
- `scripts/001_create_schema.sql` (clients table base)
- `scripts/011_intelligence_runs.sql` (legacy intelligence_runs schema)
- `scripts/031_marathon_schema.sql` (enrichment_log + bzp_tenders + financial_statements у Phase B context)
- `scripts/033_business_profile.sql` (clients.business_profile JSONB)

**Files NOT modified:** все. Read-only audit згідно constraint.

**Created:** цей doc — `docs/audit-s6a-client-analysis.md`.

**Method limitations:**

- Жодного live кліку — Cowork sandbox у read-only режимі, без browser MCP цьогo разу.
- `lib/matching/engine.ts` повного тексту НЕ читав (тільки grep `ai-rescore` callsites). Якщо S6A додає AI rescore у Phase B, треба окремо прочитати engine.ts перед implementation.
- `lib/ai-providers.ts` (callAI / extractJSON / AI_MODELS) НЕ читав. Знаю що `AI_MODELS.FAST` = claude-haiku-4-5, `AI_MODELS.BALANCED` = sonnet з grep results.

**End of audit.**
