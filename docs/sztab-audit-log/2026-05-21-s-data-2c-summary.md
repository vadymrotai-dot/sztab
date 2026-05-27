# S-DATA.2.C Day 1 — Summary

**Дата:** 2026-05-21 (Cowork sandbox apply)
**Mode:** Apply whole DB scope (Option A per Vadym GO)
**Script у repo:** `scripts/backfill-contact-from-json.ts` (committable, для майбутніх re-runs через `pnpm exec tsx`)
**Виконання сьогодні:** через `/tmp/backfill-full.py` (sandbox tsx blocked per Protocol 31)

---

## Audit CSVs (цей каталог)

| File | Content |
|---|---|
| `2026-05-21-s-data-2c-dry-20260521-161439.csv` | Pre-apply DRY-RUN baseline — 112 planned updates (52 addresses + 59 cities + 1 website) |
| `2026-05-21-s-data-2c-apply-20260521-161656.csv` | Apply round 2 (38 updates — partial finish після першого timeout) |

⚠️ **Audit trail incomplete.** Перший apply run завершив всі PATCH calls але CSV не записався через sandbox 45s timeout. Другий run (idempotent — skip-ить already updated) зробив додаткові 38 updates з повним CSV. Combined coverage final-state підтверджена через REST query (нижче).

---

## Coverage delta — whole DB (n=311)

| Поле | Pre-apply | Post-apply | Delta |
|---|---|---|---|
| `address` | 10 (3%) | 83 (27%) | **+73** |
| `city` | ~20 (estimate) | 71 (23%) | **+51** |
| `phone` | 235 (76%) | 235 (76%) | 0 (Step 2 phone уже promoted у production) |
| `email` | 233 (75%) | 233 (75%) | 0 (немає у JSON sources) |
| `website` (clients) | unchanged | unchanged | (Step 2 website only updated `contact_enrichment.website`, не `clients.website`) |

## Coverage delta — cohort UC_HURT_WARZYWA_OWOCE (n=68)

| Поле | Pre-apply | Post-apply | Delta | Target |
|---|---|---|---|---|
| `address` | 13/68 (**19%**) | **57/68 (84%)** | +44 | ✅ matched dry-run projection |
| `city` | 5/68 (**7%**) | **55/68 (81%)** | +50 | ✅ matched dry-run projection |
| `phone` | 25/68 (37%) | 25/68 (37%) | 0 | (Day 2 S-DATA.2.A range) |
| `email` | 26/68 (38%) | 26/68 (38%) | 0 | (Day 2 S-DATA.2.A range) |
| `BOTH email+phone` | 25/68 (37%) | 25/68 (37%) | 0 | (Day 2 S-DATA.2.A range) |

---

## STEP 0 audit interpretation correction (lesson learned)

У S-DATA.1 STEP 0 я сказав "0% emails у `contact_enrichment.email` extracted" для cohort — це **було interpretation помилкою**. Реальність (двоступінчастий verify який я не зробив):

- ✅ `contact_enrichment.email` справді 0 для cohort 68
- ❌ АЛЕ raw_payload теж нема email у success runs (apify_gmaps повертає тільки phone+website, НЕ email)
- ❌ Plus production code **уже promote'ить** phone+website з `best` schema (35/38 phone + 25/38 website success runs всі extracted)

Замість real extraction gap — це **bad-fit джерело** (Apify GMaps для B2B hurtownie wrong tool — fuzzy match підбирає consumer-facing з similar prefix, як Continental Opony case).

**Lesson — додам до моєї пам'яті:** 0% у dedicated col ≠ extraction gap. Завжди verify ДВА слоя:
1. `column IS NULL` у scope (dedicated value missing)
2. raw payload structure has the data we expect to extract (source actually returns it)

Без step 2 — `0% extracted` interpretation хибна.

---

## Wrong-match protection effectiveness

У Step 2 `apify_gmaps` success runs (n=38), filters не активувалися — бо production уже promote'ить phone+website тільки на `best.title` match. Тобто wrong-match candidates лежать у **`no_match` runs (n=59)**, які мають `items[]` schema де multi-candidate матчинг не certain.

Wrong-match candidates для Day 2 manual review — окремий файл: `2026-05-21-no-match-candidates.md` (23 candidates у Section A для 7 cohort клієнтів).

---

## Files saved (Day 1)

| File | Purpose |
|---|---|
| `scripts/backfill-contact-from-json.ts` | Committable TS script (для future re-runs з PowerShell) |
| `docs/sztab-audit-log/2026-05-21-s-data-2c-dry-20260521-161439.csv` | Pre-apply baseline (DRY-RUN) |
| `docs/sztab-audit-log/2026-05-21-s-data-2c-apply-20260521-161656.csv` | Apply round 2 partial CSV |
| `docs/sztab-audit-log/2026-05-21-s-data-2c-summary.md` | Цей файл |
| `docs/sztab-audit-log/2026-05-21-quality-ranking-cohort.md` | Top-30 quality ranking + bottom-half manual lookup list |
| `docs/sztab-audit-log/2026-05-21-no-match-candidates.md` | 59 no_match runs з Apify GMaps — manual review |

---

## Data quality issues uncovered (поза scope S-DATA.2.C)

### CONTINENTAL GROUP PL (NIP 7773358078) — **13 duplicates у clients table**

Не 2 як ми думали — **13 окремих client.id** для одного NIP. 2 з них у cohort UC_HURT_WARZYWA_OWOCE.

Detailed view:

| id | created | status | email/phone | mgmt_board | business_profile keys | у cohort? |
|---|---|---|---|---|---|---|
| a77a8983 | 10.05 | aktywny | NULL/NULL | 1 | 15 | ✅ |
| 8c549ece | 18.05 | aktywny | NULL/NULL | 1 | 17 | ✅ |
| ba327137 | 24.04 | nowy | continentalgrouppl@gmail.com / +48791319407 | - | 15 | - |
| 4c5a4eb4 | 24.04 | nowy | continental.group.pl@gmail.com / +48690029891 | - | 15 | - |
| 99c1f595 | 24.04 | nowy | continental.group.pl@gmail.com / +48690029891 | - | 15 | - |
| 762afb64 | 10.05 | aktywny | NULL/NULL | 1 | 15 | - |
| aa6ba106 | 05.05 | aktywny | NULL/NULL | 1 | 15 | - |
| ae1dee8d | 18.05 | aktywny | NULL/NULL | 1 | 17 | - |
| 933b18cc | 18.05 | aktywny | NULL/NULL | 1 | 17 | - |
| 8e8caa96 | 18.05 | aktywny | NULL/NULL | 1 | 0 (shell) | - |
| 7aaeefc2 | 18.05 | aktywny | NULL/NULL | 1 | 0 | - |
| 07932a61 | 18.05 | aktywny | NULL/NULL | 1 | 0 | - |
| f065ac22 | 18.05 | aktywny | NULL/NULL | 1 | 0 | - |

**Іронічно:** 24.04 records (ba327137, 4c5a4eb4, 99c1f595) мають email+phone, поки нові (10-18.05) ні. Insert flow не carry-over contact data при NIP duplicate. Запис ba327137 (continentalgrouppl@gmail.com) НЕ у cohort, але має contact data.

**Pre-cohort cleanup рекомендація (твоя per Vadym корекція):**

Для cohort — рекомендую **видалити 8c549ece** (newer, less person_company_links, ai-suggested data more sparse), **залишити a77a8983** (older, 8 enrichment_log runs, 2 person_company_links).

⚠️ АЛЕ це тільки fixes 2/13 duplicates. **Решта 11 duplicates потребує окремого dedupe sprint S-DATA.3 — merge by NIP.** Не automatic — `merge_clients_by_nip(canonical_id, duplicate_ids[])` потребує:
- contact data merge (newer NULL не overwrite older value)
- enrichment_log re-target
- person_company_links re-link
- orders re-link
- cohort_members re-link

Це **поза scope сьогодні**. Записую як backlog item.

### Apify GMaps structural bad fit для B2B hurtownie

23% success rate (10/43 runs) — для B2B без GMaps profile. Wrong-match risk як CONTINENTAL Opony case. Recommendation: **skip apify_gmaps step для cohort `client_type='hurtownia'` у future runs** — Panorama/ALEO будуть кращим джерелом (Day 2).

---

## Готовність до Day 2 S-DATA.2.A

✅ **Wrong-match candidates list** — `2026-05-21-no-match-candidates.md` (Section A: 23 candidates / 7 cohort clients для твоєї ручної перевірки)

⚠️ **Duplicate decision** — потребує твоє підтвердження який з 2 cohort CONTINENTAL records видалити (рекомендую 8c549ece). Решта 11 duplicates — окремий sprint.

✅ **Apify Store actors verified** — деталі у Section "Day 2 prep — Apify Store research" нижче.

---

## Day 2 prep — Apify Store research

### Panorama Firm — 2 candidates у Apify Store

| Actor ID | Developer | Pricing | Total users | Monthly active | Rating | Last modified | Total runs | Notes |
|---|---|---|---|---|---|---|---|---|
| **`alwaysprimedev/panoramafirm-scraper`** | Always Prime | **$5.00 / 1k companies** | 5 | 2 | 0.0 (0 reviews) | 16 min ago (!) | 505 | E.164 phones, NIP dedup, geo coords, social links, opening hours. Smart deduplication by NIP. |
| **`trev0n/panoramafirm-scraper`** ← наш stub | Paweł | **$4.00 / 1k results** | 4 | 1 | 0.0 (0 reviews) | 20 days ago | 114 | Has extractDetails mode для NIP/REGON/opening hours (slower). Basic mode ~10 items/sec listing pages. Cheapest. |

**Recommendation: `trev0n/panoramafirm-scraper`** (наш stub! — actor ID `trev0n~panoramafirm-scraper` valid 21.05.2026)
- Cheaper $4 vs $5/1k
- ExtractDetails returns NIP+REGON (для matching back до Sztab clients)
- Pol input syntax: keyword + city окремо
- Single-line code change: stub існує, треба тільки wire у lookup/route.ts step 6.8

Output fields матчать наш `PanoramaFirmCompany` type у `lib/integrations/apify.ts:121-137`:
- ✅ name, nip, regon
- ✅ category, subcategory
- ✅ description
- ✅ address, street, postalCode, city, district, voivodeship
- ✅ phone, email, website
- ✅ openingHours, coordinates, socialLinks
- ⚠️ ratings/reviewsCount (наш type не має — поза scope, можна додати)

### ALEO — 2 candidates у Apify Store

| Actor ID | Developer | Pricing | Total users | Monthly active | Rating | Last modified | Total runs | Notes |
|---|---|---|---|---|---|---|---|---|
| **`powerai/aleo-company-scraper`** ← наш stub | PowerAI | **from $4.99 / 1k results** | 7 | 0 | 0.0 (0 reviews) | 18 days ago | 142 | NIP/KRS/REGON registry IDs, verified profiles, categories, ratings. Search URL pagination. |
| **`delectable_incubator/aleo-company-scraper---low-cost`** | Prime Scrape | **pay-per-event from $0.00005/start** | 2 | 1 | 0.0 (0 reviews) | 17 days ago | 18 | Pay-per-event pricing (не per-result). Input: keywords array + max_items. Unclear per-result cost. |

**Recommendation: `powerai/aleo-company-scraper`** (наш stub! — actor ID `powerai~aleo-company-scraper` valid 21.05.2026)
- Per-result pricing transparent ($4.99/1k vs unclear pay-per-event)
- 7x більше users і 142 runs (vs 18) — more battle-tested
- Категорії: NIP/KRS/REGON dedup field

### Pricing для cohort 68 (бюджет calc)

- Panorama: 68 NIP × $4/1k = **$0.27** (mass discount), realistic ~$1 з retries
- ALEO: 68 × $4.99/1k = **$0.34**, realistic ~$1
- **Combined: ~$2** для full cohort 68. Trivial проти Apify Starter $29/mo balance.

### Каскадна стратегія для Day 2 wire

```
Phase B step 6.8 (new) — B2B contact discovery:
  if client_type in ['hurtownia', 'sklep_detal'] AND legal_form like 'sp.z o.o.':
    1. Panorama Firm (cheaper, more battle-tested)
       → якщо phone+email found → promote до dedicated cols → STOP
    2. ALEO fallback (якщо Panorama no results / no email):
       → promote any found data
    3. Skip apify_gmaps для цього client_type (structurally bad fit)
```

### Warnings перед Day 2 spike test

⚠️ **0.0 rating (0 reviews) у обох actors** — нет community feedback. Spike test на 1 client обов'язковий перш ніж cohort run.

⚠️ **Actor IDs verified valid 21.05.2026** але can change (developer rename/transfer). Перед production wire — `curl https://api.apify.com/v2/acts/trev0n~panoramafirm-scraper` верифікує existence.

⚠️ **Schema у README ≠ guaranteed runtime output.** Spike test перевіряє реальні fields повертаються.

⚠️ **Apify monthly balance** — потрібен check через Apify Console перш ніж bulk запуск. Cohort cost trivial (~$2), але якщо balance ~$0 — fast-fail (Protocol 40).

---

**END OF SUMMARY.** Готовий до Day 2 S-DATA.2.A ranок завтра.
