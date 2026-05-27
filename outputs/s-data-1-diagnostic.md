# S-DATA.1 — Diagnostic для cohort UC_HURT_WARZYWA_OWOCE

**Дата:** 21.05.2026
**Cohort:** `57f6a19f-68d1-4cb3-996b-98119771d4a8` — Hurtownia owoców i warzyw (PKD 4631Z/4639Z/1039Z/4632Z/4633Z/4621Z, Czudowa Marka call list 18.05.2026)
**Розмір:** 68 клієнтів
**Метод:** read-only PostgREST + grep кодбази, без коду

---

## 1. Quantitative gap — coverage % у cohort (n=68)

| Поле | Заповнено | % |
|---|---|---|
| `email` (dedicated col) | 26 | **38%** |
| `phone` (dedicated col) | 25 | **37%** |
| **BOTH email AND phone** | 25 | **37%** |
| `address` | 13 | **19%** |
| `city` | 5 | **7%** |
| `region` | 5 | **7%** |
| `website` | 4 | **6%** |
| `krs_legal_form` | 49 | 72% |
| `krs_management_board` | 49 | 72% |

**Legal form breakdown:**
- sp.z o.o./S.A. (KRS): 50/68 (**74%**)
- JDG (CEIDG): 7/68 (**10%**)
- Spółka cywilna / inne (без KRS і без CEIDG): 11/68 (**16%**)

**Масштаб проблеми:** **42/68 (62%) клієнтів НЕ мають ні email ні phone**. У bulk outreach завтра — це 42 "blind contacts" з 68.

---

## 2. Sample 5 клієнтів з cohort з BOTH email AND phone empty

| # | id | Назва | NIP | Legal | Coverage |
|---|---|---|---|---|---|
| 1 | a77a8983 | CONTINENTAL GROUP PL sp.z o.o. | 7773358078 | KRS 0000825640 | krs_legal_form✓ ; address/city/website empty |
| 2 | bb11ef23 | SOLERA sp.z o.o. | 5262870489 | KRS 0000239263 | city='Warszawa' region='mazowieckie' ✓ ; address/email/phone/website empty |
| 3 | 3c348bc9 | BEKANIX (Szewczyk B., Kanik D.) **spółka cywilna** | 8982242191 | **ні KRS ні CEIDG** | майже все empty — поза покриттям всіх 4 джерел |
| 4 | 8c549ece | CONTINENTAL GROUP PL (duplicate, NIP той самий) | 7773358078 | KRS 0000825640 | duplicate з #1 |
| 5 | b8697d1e | MIRADO GROUP sp.z o.o. | 5214089218 | KRS 0001132083 | city='Warszawa' region='mazowieckie' ✓ ; address/email/phone/website empty |

**Note duplicate #1+#4:** NIP 7773358078 двічі у cohort з різними `client.id`. Окремий data quality issue (dedupe — поза scope S-DATA.1).

---

## 3. Trace data origin — CONTINENTAL GROUP PL (a77a8983, NIP 7773358078)

### Що Sztab знає (з JSON columns)

| Source | Has data |
|---|---|
| `gus_data` | ✓ 111 PKD codes, registration history |
| `vat_data` | ✓ status='Czynny', bank accounts, **`workingAddress: "JANA HENRYKA DĄBROWSKIEGO 29/U4C, 60-840 POZNAŃ"`** |
| `krs_data` | ✓ KRS odpis (legal-only, **0 emails / 0 phones** у raw payload — regex sweep) |
| `krs_management_board` | ⚠️ 1 запис `{function: "PREZES ZARZĄDU"}` АЛЕ БЕЗ імені (`regdata_krs_fullnames` не запускався для цього клієнта) |
| `vat_bank_accounts` | ✓ 2 accounts |
| `business_profile` | ✓ AI-generated (15 keys) |

### Що НЕ заповнено у dedicated columns — попри що дані Є у JSON

| Col | Dedicated value | JSON має дані? |
|---|---|---|
| `address` | NULL | ✓ **`vat_data.result.subject.workingAddress`** = "JANA HENRYKA DĄBROWSKIEGO 29/U4C, 60-840 POZNAŃ" |
| `city` | NULL | ✓ "POZNAŃ" (extractable з workingAddress regex) |
| `email` | NULL | ❌ нема ніде (KRS не дає, GMaps зробив wrong match) |
| `phone` | NULL | ❌ нема ніде (KRS не дає, GMaps зробив wrong match) |
| `website` | NULL | ❌ нема |

### contact_enrichment для цього клієнта

1 запис: `source='apify_gmaps' status='?'` — але `phone`/`email`/`website` всі NULL. `raw_payload` content:

```json
{
  "items": [{
    "title": "Continental Opony Polska Sp. z o.o.",   // ← WRONG MATCH (шини, не warzywa!)
    "phone": "+48 22 577 13 00",
    "phoneUnformatted": "+48225771300",
    "website": "https://www.continental-tires.com/pl/pl",
    "address": "Żwirki i Wigury 16C, 02-092 Warszawa, Polska",
    "categories": ["Producent opon", "Siedziba firmy"]
  }]
}
```

**Два bugs у одному:**
- **Bug A (wrong match):** Apify GMaps зіставив `searchString="CONTINENTAL GROUP PL..."` з Continental Opony (шинна фірма, NIP не співпадає). B2B hurtownie рідко мають GMaps profile → fuzzy name match підбирає consumer-facing бізнес з similar prefix.
- **Bug B (extraction gap):** Навіть якщо raw_payload містить phone/website, dedicated columns `contact_enrichment.phone/email/website` залишаються NULL. Sztab не парсить raw_payload → dedicated. Це extract-and-promote pipeline gap.

---

## 4. Source coverage audit — codebase grep

### Підключено + working у production lookup pipeline

| Source | File | Wired у lookup/cron | Notes |
|---|---|---|---|
| GUS REGON | `lib/enrichment/gus.ts` | ✓ Phase A | basic identity sweep |
| KRS | `lib/enrichment/krs.ts` + `lib/integrations/krs-rejestr.ts` | ✓ Phase A.2 | legal info only, no contacts |
| CEIDG | `lib/enrichment/` (через `lib/ceidg/`) | ✓ Phase A.2 | JDG-only (10% cohort), koncesje brand extraction |
| VAT_BL (whitelist) | `lib/enrichment/vat.ts` | ✓ Phase A | workingAddress, bank accounts |
| BZP | `lib/enrichment/bzp.ts` | ✓ Phase B step 1 | tenders |
| Apify GMaps | `lib/enrichment/apify.ts` | ✓ Phase B step 4 | `compass~crawler-google-places`, 30s timeout |
| Apify KRS fullnames | `lib/enrichment/krs-fullnames.ts` | ✓ Phase B step 8 | `regdata~krs-fullnames-scraper` |
| Tavily web search | `lib/enrichment/web-search.ts` | ✓ Phase B step 3 + 6.6 brand re-discovery | |
| MSiG | `lib/enrichment/msig.ts` | ✓ Phase A | KRS Monitor Sądowy |
| CEIDG koncesje (brand) | `lib/intelligence/extract-koncesje.ts` | ✓ Phase B step 6.4 | Sprint S-MENU 15.05 |
| Restaumatic / Wolt / Pyszne menu | `lib/enrichment/{restaumatic-menu,wolt,pyszne}.ts` | ✓ Phase B step 6.7 | gastronomia-only |

### Stub/partial — код є, у production lookup НЕ wired

| Source | File | Стан | Звідки використовується |
|---|---|---|---|
| **Panorama Firm** scraper | `lib/integrations/apify.ts:139` `scrapePanoramaFirm()` | ⚠️ helper готовий з типами (PanoramaFirmCompany з email/phone/address). Actor `trev0n~panoramafirm-scraper` **не verified** vs Apify Store ("VERIFY BEFORE FIRST RUN" коментар) | **Тільки у `lib/ai/intelligence.ts:467`** (Deep Discovery Phase 2 — NEW prospects discovery, НЕ existing client enrichment) |
| **ALEO scraper** | `lib/integrations/apify.ts:100` `scrapeAleo()` | ⚠️ helper готовий, actor `powerai~aleo-company-scraper` **не verified** | ❌ Не викликається ніде. Цитата: `lib/ai/intelligence.ts:777-780` "⚠ Aleo scraper... zaimportowany ale nie wpięty — Phase 2" + `void scrapeAleo` як lint-silencer |
| panoramafirm.pl / aleo.com | `lib/enrichment/web-search.ts:29-32` | 🚫 **AGGREGATOR_BLOCKLIST entries** — Sztab активно відкидає ці домени з Tavily search results | parad: scraper helpers існують, але домени blocklisted для web-search step |

### Не існує у кодбазі

| Source | Reason |
|---|---|
| PKT.pl | grep returns 0 hits |
| Bazafirm.pl | 0 hits |
| Bisnode | 0 hits |
| Google Places API (direct) | only via Apify GMaps actor |
| Web scraper за website контакти (regex extract) | `lib/enrichment/website.ts` + `website-regex.ts` існують але не triggered post-Tavily у cohort (тільки для restaurants з menu) |

---

## 5. Cohort-level enrichment activity

`contact_enrichment` runs для 68 клієнтів cohort:

| source × status | n |
|---|---|
| apify_gmaps | success: 10, no_match: 7, **error: 26** |
| regdata_krs_fullnames | success: 18 |
| wolt_menu | error: 1 (wrong classification — це не gastronomia) |
| www_menu | partial: 1 |
| **TOTAL runs** | **63** |

**Conclusions:**
- 50/68 (74%) клієнтів мають ≥1 enrichment run
- 25/68 (37%) мають ≥1 success run
- Apify GMaps success rate **23%** (10/43) — для B2B hurtownie structurally bad fit (no GMaps profile, fuzzy match wrong)
- **0% extracted email у `contact_enrichment.email`** для всього cohort — це bug B (extraction gap) у scale

---

## 6. Root cause аналіз

| Hypothesis з prompt | Verdict |
|---|---|
| **S-DATA.2.A**: джерела з контактами НЕ підключені | ✅ **CONFIRMED** — Panorama Firm + ALEO scrapers існують як stubs, не у lookup pipeline. PKT.pl/Bazafirm/Bisnode не існують зовсім. |
| **S-DATA.2.B**: підключені але pipeline не запускає | ⚠️ **PARTIAL** — Apify GMaps wired АЛЕ structurally bad fit для B2B hurtownie (success rate 23% з wrong-match risk like Continental Opony case) |
| **S-DATA.2.C**: запускає але дані не зберігаються у dedicated columns | ✅ **CONFIRMED** — bug B: 0% emails у `contact_enrichment.email` попри що деякі raw_payloads мають email. + `vat_data.workingAddress` ніколи не promoted до `clients.address/city` |

**Cause всі три hypothesis активні одночасно для різних layers:**
- B2B sources (Panorama, ALEO) — gap A
- Existing source (GMaps) — gap A.5 (wrong tool for B2B) + B (extract bug)
- Existing data у JSON (vat_data, krs_data) — gap C (no promotion to dedicated cols)

---

## 7. Recommended next sprint — варіанти

### Опція 1 — S-DATA.2.C "Backfill з existing JSON" (~2-3 год, $0)

**Quick win.** Жоден новий API call.

- Extract `vat_data.result.subject.workingAddress` → `clients.address` + `clients.city` regex parse (`/(\d{2}-\d{3})\s+(.+)/`)
- Promote `regdata_krs_fullnames` persons → `persons.imie/nazwisko/email_glowny/telefon_komorkowy` (вже success runs для 18 клієнтів cohort є)
- Promote `contact_enrichment.raw_payload.items[0].phone/website` → dedicated columns (bug B fix)
- Backfill script `scripts/backfill-contact-from-json.ts`

**Impact для cohort:**
- address coverage 19% → ~70%+ (всі sp.z o.o. + JDG мають VAT_BL workingAddress)
- city coverage 7% → ~70%+
- phone coverage 37% → ~45% (тільки apify_gmaps subset де match був правильним)
- email coverage 38% → ~38% (немає у JSON sources, потребує новий)

**Cost:** ~2-3 год coding + $0 API calls (тільки DB writes).
**Risk:** низький — read-only від existing JSON, write до dedicated. Можна revert.

### Опція 2 — S-DATA.2.A "Wire Panorama Firm + ALEO у lookup pipeline" (~4-6 год, ~$15-25 для cohort)

**Source addition.** Активує stub helpers.

Steps:
1. Verify actor IDs у Apify Store (`trev0n~panoramafirm-scraper`, `powerai~aleo-company-scraper`) — login + check, ~10 хв
2. Якщо actor IDs invalid → find alternatives (Apify Store search "panorama firm", "aleo")
3. Wire `scrapePanoramaFirm` у lookup/route.ts Phase B (новий step 6.8) — НЕ для gastronomia, тільки для `client_type='hurtownia'` + `legal_form sp.z o.o.`
4. Wire `scrapeAleo` як cascade fallback (Panorama → ALEO)
5. Extract phone/email/website з PanoramaFirmCompany type → contact_enrichment dedicated columns
6. AGGREGATOR_BLOCKLIST — keep panoramafirm.pl + aleo.com для Tavily search blocklist (різні pipelines, OK)
7. Add cost guard у Protocol 40 pattern (HTTP 402 fast-fail)

**Test approach:**
- Spike на одному клієнті (Ziomek Fish або тестовий) перш ніж cohort run
- Перевірка success rate ≥50% для B2B sp.z o.o. перш ніж bulk

**Cost:** 4-6 год coding + Apify usage. Per Protocol 40: ~$0.05/NIP × 68 = $3.40 для cohort. + $5/NIP × 2 актори = $0.10/NIP = $7/cohort.
**Risk:** medium — нові actor IDs не verified. Якщо stubs застарілі — треба find replacements (1-2 год доп.).

### Опція 3 — S-DATA.2.C + 2.A комбо (Quick win + sources) (~6-8 год, ~$15-25)

**Стратегічний шлях.**

- День 1: S-DATA.2.C (~2-3 год). Backfill існуючих даних. Coverage до 70%+ для address/city.
- День 2: S-DATA.2.A (~4-6 год). Panorama + ALEO для email/phone gap. Coverage email 38% → проектується 70-85%.

**Impact для cohort post-sprint:**
- address: 19% → 70%+ (Day 1)
- city: 7% → 70%+ (Day 1)
- phone: 37% → 65-75% (Day 1 backfill + Day 2 Panorama)
- email: 38% → 65-80% (Day 2 Panorama/ALEO)
- BOTH email+phone: 37% → **55-70%**

**Cost:** ~6-8 год coding + ~$15-25 Apify cohort run.

---

## 8. Моя рекомендація

**Опція 3 (комбо).** Аргументи:

1. **S-DATA.2.C сам по собі (Опція 1) — швидкий win який не вирішує email gap.** Email = primary outreach channel. Без email Vadym дзвонить cold з phone-only, success rate низький.
2. **S-DATA.2.A сам по собі (Опція 2) — пропускає easy wins з existing JSON.** address/city extraction з vat_data це 0-cost win який має бути зроблений завжди.
3. **Комбо дає максимальну coverage для bulk outreach завтра (~22.05).** 55-70% з BOTH email+phone проти зараз 37% — це 18-33 додаткових клієнтів з contacts.

**АЛЕ важливі guardrails:**

- **Stub actor IDs (Panorama, ALEO) НЕ verified** — перед codingом S-DATA.2.A треба ти зайти у Apify Store, перевірити що `trev0n~panoramafirm-scraper` + `powerai~aleo-company-scraper` існують і active. Якщо ні — find current IDs.
- **Spike test перш ніж bulk** — на одному test client (Ziomek Fish або кохорта член з вже existing email) verify scrape повертає reasonable data, success rate ≥50%. Per Protocol 35 STEP 0.
- **Bulk run на cohort = 68 NIP × ~$0.10 = $7** (single batch). Per Protocol 40 cost guard — verify Apify balance перш ніж launch.
- **Sequential execution: 2.C → 2.A.** Не parallel. Per Protocol 7 energy management.

---

## 9. Alternative для завтра — без code

Якщо завтрашній bulk outreach критичний і немає часу на coding:

**Manual approach (~2 год Vadym):**
- 42 клієнти без contacts → export NIP list → manual lookup Panorama Firm / ALEO / KRS web UI / company website Google для top-20 priority
- ROI argument: Vadym час = 2-3 хв на клієнта × 20 = 60 хв, дає 15-20 contacts manually
- Це buffer покривав би outreach поки coding sprint виконується паралельно

Не рекомендація — pointer що це fallback path якщо S-DATA.2 потребує більше часу.

---

## 10. Open questions для Vadym

1. **Cohort outreach timing — завтра обов'язково чи можна shift на день?**  Якщо завтра обов'язково → manual fallback (#9) + S-DATA.2.C тільки. Якщо +1 день acceptable → Опція 3 комбо.

2. **Apify monthly budget зараз** — Starter $29/mo активний 12.05. Скільки залишилось? Cohort run = ~$7, не critical, але якщо balance низький — потрібен top-up.

3. **Дублікати у cohort** (NIP 7773358078 двічі = CONTINENTAL GROUP PL #1 і #4) — окрема data quality issue. Дедупе scope?

4. **Стратегічне рішення архітектура** — B2B contacts це універсальний шар (всі future cohorts будуть мати ту саму проблему) чи cohort-specific tooling? Якщо universal — Опція 3 правильний шлях. Якщо ad-hoc — manual.

---

**END OF DIAGNOSTIC. БЕЗ КОДУ — read-only audit complete. Чекаю decision A/B/C для S-DATA.2.**
