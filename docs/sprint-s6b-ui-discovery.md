# Sprint S6B-UI — Discovery Report

**Date:** 2026-05-11 morning
**Goal:** Verify Vadym's premise "UI doesn't render existing data" перш ніж rebuild.

## Premise verification

Vadym claim:
> Phase B пише до DB. UI на /clients/[id] показує stub'и: "Brak danych", "1 zarząd · 0 BO", "0 BZP", "Czudowa Marka — buyer strength".

**Audit result:** mix TRUE + FALSE claims. Real bugs менші ніж premise описує.

## Файли + line counts

| File | Lines | Status |
|---|---|---|
| `app/(dashboard)/clients/[id]/page.tsx` | 412 | ✅ Server component, fetches 11 tables: clients, contacts, deals, tasks, bzp_tenders, **financial_statements** (NOT `company_financials`!), company_profile_fields, person_company_links, crbr_beneficiaries, company_branches, matches |
| `components/clients/business-profile-section.tsx` | 242 | ✅ Renders ВСЕ business_profile JSONB fields (format, locations, summary, special_traits, demographics, categories, buyer_strength via SupplierMatrix, reasoning, sources, analyzed_at, model_used). Empty-state branch shows hint "Uruchom Analiza klienta" |
| `components/clients/persons-section-v2.tsx` | 108 | ✅ Renders persons (з role + jest_decyzyjny + source badge "rejestr.io") + CRBR section (з obywatelstwa + kraj_rezydencji). Empty state "Brak osób" |
| `components/clients/signals-section.tsx` | 78 | ⚠️ **GAP** — renders ТІЛЬКИ last_filing freshness, red flags, bzpCount integer. NO Apify GMaps card, NO Tavily, NO last 3 BZP tenders details |
| `components/clients/financials-section.tsx` | 215 | ✅ Renders financial_statements rows. Empty state |
| `components/clients/contact-section-v2.tsx` | 107 | ✅ Renders email/phone/website/fb/insta з source badges |
| `components/clients/financial-statements-table.tsx` | (used by AccordionSection "Sprawozdania") | ✅ |

## Map: DB tables → UI components

| Source | DB table | Wired? | Component | Gap |
|---|---|---|---|---|
| `clients.business_profile` (jsonb) | clients | ✅ | BusinessProfileSection | none — full render |
| `company_profile_fields` (~28 rows/client) | company_profile_fields | ⚠️ partial | ContactSectionV2 (тільки email/phone/website/fb/ig); rest unused | NO source breakdown viewer |
| `persons + person_company_links` | 2 tables | ✅ | PersonsSectionV2 | NO 🇺🇦 flag для CRBR з UA citizenship |
| `crbr_beneficiaries` | crbr_beneficiaries | ✅ | PersonsSectionV2 (CRBR sub-section) | NO 🇺🇦 flag |
| `company_financials` (per Vadym) | **DOES NOT EXIST у repo** | ❌ | n/a | Page queries `financial_statements` instead — possibly schema disagreement |
| `bzp_tenders` (count + recent) | bzp_tenders | ⚠️ partial | SignalsSection (ТІЛЬКИ count) | NO last 3 tenders details (date + ordering_party) |
| `contact_enrichment` (Apify rating/reviews/gmaps_url) | contact_enrichment | ❌ | NOT rendered anywhere | **Real gap** |
| Tavily WWW summary (`company_profile_fields source='WWW'`) | company_profile_fields | ❌ | NOT rendered specifically | Real gap |

## Real bugs vs Vadym's premise

### ❌ Premise FALSE — actually working

1. **"AI Analysis shows тільки 'Czudowa Marka — buyer strength' заголовок"**
   - Reality: `AccordionSection title="Analiza biznesowa (AI)" meta="Czudowa Marka — buyer strength"` (line 344). Це MEta header (hardcoded string у page.tsx) — НЕ content!
   - Inside `<BusinessProfileSection>` ВСЕ profile JSONB renders якщо `business_format` is set.
   - Якщо Vadym бачив тільки meta — це визначається через **AccordionSection collapsed by default**. BusinessProfileSection захований у згорнутий accordion. Coлi розгорнути → real content visible.

2. **"Persons — 1 zarząd · 0 BO незважаючи на повний persons + CRBR data"**
   - Reality: `personsMeta = '${personsForSection.length} zarząd · ${crbrEntries.length} BO'` (line 237). Counts REAL з queries. Якщо `0 BO` — то crbr_beneficiaries table empty для цього клієнта.
   - Possible explanation: Phase B writes до crbr_beneficiaries тільки якщо CRBR endpoint succeeds. Some клієнти може не have CRBR data (sole-prop, pre-2018 registered, etc.).

### ✅ Premise TRUE — real gaps

3. **SignalsSection НЕ renders Apify Google Maps + Tavily** — real bug. Per Vadym spec D:
   - Apify card з rating + reviews count + "Otwórz w Google Maps" link + phone — MISSING
   - Tavily summary — MISSING
   - last 3 BZP tenders details — MISSING (тільки count)

4. **fsMeta = "Brak danych" для JDG** — line 234-236. JDG (sole-prop) NIE skladają sprawozdań finansowych — це по definition. UI показує "Brak danych" що misleading.

5. **🇺🇦 flag у CRBR PersonsSectionV2** — Vadym spec B asks. Реально missing. Дані є (obywatelstwa[], kraj_rezydencji), але icon не rendered.

### ⚠️ Schema discrepancy concern

6. Vadym premise mentions table `company_financials`. Page.tsx queries `financial_statements`. Need to verify:
   - Чи `financial_statements` — старе name?
   - Чи `company_financials` — Vadym's preferred name але NOT real schema?
   - Чи обидві existуjе у DB?

## Estimated implementation time per real gap

| Gap | Files | Lines | ETA |
|---|---|---|---|
| 1. Fix `analiza-ai` accordion meta — dynamic з business_profile.business_format | page.tsx | ~5 | 5 min |
| 2. Extend SignalsSection: + Apify GMaps card + last 3 BZP tenders + Tavily summary | signals-section.tsx + page.tsx queries | ~80 | 30 min |
| 3. Add 🇺🇦 flag у CRBR section | persons-section-v2.tsx | ~10 | 10 min |
| 4. Fix fsMeta для JDG (legal_form check) | page.tsx | ~3 | 5 min |
| 5. Optional: company_profile_fields breakdown viewer ("Pokaż szczegóły 28 pól") | new component + page.tsx | ~120 | 45 min |
| 6. Refresh handling після Pełna re-analiza (router.refresh) | EnrichmentProgressBanner OR new poll | ~30 | 30 min |

**Total realistic: ~1.5-2h** (NOT 2-3h per Vadym spec) — most components ALREADY work.

## Scope-reduce proposal

### Option A — Minimal (Vadym premise wrong, fix only real gaps)
1. Dynamic accordion meta для AI section
2. SignalsSection extend з Apify + Tavily + BZP details
3. 🇺🇦 flag у CRBR
4. JDG-aware fsMeta
ETA: ~50 min

### Option B — Vadym premise as-is (full rebuild)
ETA: 2-3h per spec, але redundant work — components ALREADY render correctly.

### Option C — Diagnostic first
Open /clients/Continental у browser → expand ВСI accordions → screenshot what actually renders. Якщо BusinessProfileSection content visible коли expanded → Vadym misread "тільки заголовок" як "section completely empty". Якщо section truly empty з заповненим business_profile → bug у data flow до component.
ETA: 5 min check + Option A для real gaps after.

## Recommended path

**Option C → Option A.**

1. Vadym opens /clients/Continental → expands "Analiza biznesowa (AI)" accordion → confirms whether full profile content visible або тільки meta string.
2. Якщо content visible → premise was misreading. Proceed Option A (50 min).
3. Якщо content truly missing despite business_profile JSONB populated → debug data flow first (probably page.tsx not passing prop correctly або null check failing).

## Files які ймовірно НЕ потребують змін

Per audit, ці components работают і render full data when prop passed:
- BusinessProfileSection ✅
- PersonsSectionV2 (except 🇺🇦 flag) ✅
- ContactSectionV2 ✅
- FinancialsSection ✅
- ProfileSectionV2 ✅
- MetricStrip ✅
- AccordionSection (collapsed by default — UX consideration, не bug)

## ВАЖЛИВЕ для Vadym

**Premise "UI doesn't read data" PARTIALLY FALSE.** UI **DOES** read data — більшість sections render full content. Problem може бути:
- AccordionSection collapsed-by-default → user doesn't expand → thinks "тільки заголовок"
- Hardcoded meta strings (analiza-ai meta = "Czudowa Marka — buyer strength" instead of dynamic) — confusing UX
- 4 real gaps (Apify card, Tavily, 🇺🇦 flag, JDG fsMeta)

**Recommend:** verify через browser перш ніж 2-3h rebuild. Якщо premise re-confirmed з explicit screenshots — GO Option A (50 min).
