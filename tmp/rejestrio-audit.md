# Аудит rejestr.io — куди 50 zł зникло за 1 день

_generated 2026-05-27, read-only_

## TL;DR (top-5)

1. **`source='KRS'` ≠ rejestr.io.** `KRS` логи на 25 фірм коштують **0 zł** — це безкоштовний `api-krs.ms.gov.pl` (Ministerstwo Sprawiedliwości), не rejestr.io. Не плутати з `rejestrio_v2`.
2. **Реальний rejestr.io source = тільки `rejestrio_v2`.** За 26.05 → 18 викликів (9 success + 9 error 403 "Brak kredytu"). Кожен виклик = **8 endpoint hits мінімум** через `runRejestrioStep()` (`app/api/intelligence/lookup/route.ts:1681`).
3. **Sprawozdania JSON тягнуться АВТОМАТИЧНО без feature flag.** `lib/rejestrio/sprawozdania.ts:65/81` для кожної фірми з фінансами фетчить **2 JSON документи на кожен рік** (`?format=json` = 0,50 zł each). Фірма з 3 роками звітів = **6 JSON calls = 3 zł** на самих фінансах.
4. **Skip-logic existуj, але тільки за whole `rejestrio_v2`** — не за окремий sprawozdania step. Skip спрацьовує jeśli `clients.krs_management_board` populated AND last success <30d (`lookup/route.ts:1687-1740`). UC_PROD_GOTOWE_MAZ firms всі мали порожнє mgmt_board → fired FULL 8-endpoint sequence.
5. **`czy_ma_json` field guardує лише вибір документа, не sam call.** Filter `(d) => d.czy_ma_json && /rachunek zysków|bilans/i.test(d.nazwa)` (`sprawozdania.ts:51-56`) — якщо знайде = fetch. Немає env-flag чи umowa "max N JSON per firm" чи "$ budget guard".

---

## STEP 1 — Inventory rejestr.io call surface

### Centralny client
- `lib/rejestrio/client.ts:24` `rejestrioGet()` — uniwersalny wrapper з 25s timeout + retry 1s/3s.

### 9 modułів використовуючих `rejestrioGet` (унікальні endpointy)

| Файл | Endpoint pattern | Phase | Standardowa cena |
|---|---|---|---|
| `lib/rejestrio/org-basic.ts:23` | `GET /org/{krs}` | runRejestrioStep step 1 | 0,05 zł |
| `lib/rejestrio/rozdzial-ogolny.ts:163` | `GET /org/{krs}/krs-rozdzialy/ogolny` | step 2 | 0,05 zł |
| `lib/rejestrio/rozdzial-przeksztalcenia.ts:44` | `GET /org/{krs}/krs-rozdzialy/przeksztalcenia` | step 3 | 0,05 zł |
| `lib/rejestrio/rozdzial-wzmianki.ts:31` | `GET /org/{krs}/krs-rozdzialy/wzmianki` | step 4 | 0,05 zł |
| `lib/rejestrio/rozdzial-oddzialy.ts:18` | `GET /org/{krs}/krs-rozdzialy/oddzialy` | step 5 | 0,05 zł |
| `lib/rejestrio/sprawozdania.ts:41` | `GET /org/{krs}/krs-dokumenty` (LIST) | step 6a | 0,05 zł |
| `lib/rejestrio/sprawozdania.ts:65` | `GET /org/{krs}/krs-dokumenty/{rzisId}?format=json` | step 6b (per rok) | **0,50 zł** |
| `lib/rejestrio/sprawozdania.ts:81` | `GET /org/{krs}/krs-dokumenty/{bilansId}?format=json` | step 6c (per rok) | **0,50 zł** |
| `lib/rejestrio/persons.ts:39` | `GET /osoby/{personId}` | step 7a (per zarzad osoba) | 0,05 zł |
| `lib/rejestrio/person-network.ts:47` | `GET /osoby/{personId}/krs-powiazania` | step 7b (per osoba) | 0,05 zł |
| `lib/rejestrio/crbr.ts:26` | `GET /org/{krs}/crbr` | step 8 | 0,05 zł |
| `lib/rejestrio/search.ts:178` | `GET /org?<filtry>` | sync-krs-bootstrap (bulk listing) | 0,05 zł |

### 2 callers від `runRejestrioStep`
- `app/api/intelligence/lookup/route.ts:1681` — головний flow ("Analizuj klienta")
- `app/api/clients/[id]/krs-refresh/route.ts` — manualny refresh button у profilu

### Bulk script
- `scripts/sync-krs-bootstrap.ts` — uses `lib/rejestrio/search.ts` (LISTING only, no per-firm enrichment). Mtime **2026-05-10 11:21** → ostatnia modyfikacja code. Ostatnio uruchamiany skrypt дав 106 KRS prospects (UC_PROD_GOTOWE_MAZ, 23.05). To było `/org` listing calls (cheap = 0,05 zł × pages).

### Дві odrębne sources w logach (UWAGA — easy confusion)
- **`source='KRS'`** = `enrichWithKRS()` → `https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/...` — **rządowe, free**. NIE rejestr.io.
- **`source='rejestrio_v2'`** = `runRejestrioStep()` → rejestr.io billable.

---

## STEP 2 — Sprawozdania JSON detection

### `czy_ma_json` field użycie

`lib/rejestrio/sprawozdania.ts:51-56`:
```ts
const rzisDoc = yg.dokumenty.find(
  (d) => d.czy_ma_json && /rachunek zysków/i.test(d.nazwa),
)
const bilansDoc = yg.dokumenty.find(
  (d) => d.czy_ma_json && /bilans/i.test(d.nazwa),
)
if (!rzisDoc && !bilansDoc) continue
```

**Logika:** dla każdego roku w `/krs-dokumenty` LIST response, znajduje **1 RZiS** + **1 Bilans** з `czy_ma_json=true`. Якщо знаходить **obie** → 2 JSON calls per rok. Якщо tylko jeden → 1 call. Якщо żaden → 0.

### Feature flag / budżet guard — **BRAK**

- Brak `if (process.env.SKIP_FINANCIALS_JSON)` lub podobnego.
- Brak per-call cost tracking (`fetchAllFinancials` повертає parsed XBRL, **nie reportuje cost**).
- Brak limitu max-years-per-firm — fetch **wszystkich** років, які rejestr.io oddaje.
- `enrichment_log` row dla source='rejestrio_v2' агрегує всі 8 stepów як **1 row z `cost_usd=0`** → не widać per-step billings. To wyjaśnia gap między /admin/health i Apify dashboard analogicznym — **rejestrio billing nie jest w log table at all** (cost_usd zawsze 0 для rejestrio_v2 у наших 18 logach).

### Per-firma приблизна цена

| Step | Calls | Cost std | Cost worst-case |
|---|---|---|---|
| 1 org-basic | 1 | 0,05 zł | 0,05 zł |
| 2 ogolny | 1 | 0,05 zł | 0,05 zł |
| 3 przeksztalcenia | 1 | 0,05 zł | 0,05 zł |
| 4 wzmianki | 1 | 0,05 zł | 0,05 zł |
| 5 oddzialy | 1 | 0,05 zł | 0,05 zł |
| 6a /krs-dokumenty LIST | 1 | 0,05 zł | 0,05 zł |
| **6b sprawozdania JSON** | **2 × N років** | **0–5 zł** | **≥3 zł** dla 3 років |
| 7a /osoby/{id} per zarzad | M × 1 | M × 0,05 | M × 0,05 |
| 7b /osoby/{id}/krs-powiazania per zarzad | M × 1 | M × 0,05 | M × 0,05 |
| 8 crbr | 1 | 0,05 zł | 0,05 zł |

**Średnio (3-letnia spółka, 2 osoby zarzad):** 0,40 + 6 × 0,50 + 4 × 0,05 = **3,60 zł / firma**.
**Worst-case (5 років, 4 osoby):** 0,40 + 10 × 0,50 + 8 × 0,05 = **5,80 zł / firma**.

18 firm × 3,60 zł ≈ **65 zł** → przekracza top-up 50 zł → credit exhaustion exactly як obserwujemy у 9 error 403.

---

## STEP 3 — Aggregate з 26.05 (broader filter)

```
source                 status     calls  total_cost_usd
GUS                    success    30     $0.0000
AI_match_rescore       success    30     $0.2812
AI_business_analysis   success    30     $0.4778
tavily                 success    30     $0.4500
BZP                    success    30     $0.0000
VAT_BL                 success    30     $0.0000
Apify_GMaps            partial    25     $0.0000  ← apify cost not tracked
KRS                    success    25     $0.0000  ← FREE api-krs.ms.gov.pl
rejestrio_v2           success    9      $0.0000  ← rejestr.io billing NOT in log
rejestrio_v2           error      9      $0.0000  ← HTTP 403 brak kredytu
WWW                    success    8      $0.0000
CEIDG_details          success    4      $0.0000
wolt_menu              partial    3      $0.0000
www_menu               partial    3      $0.1863
tavily_brand_search    partial    2      $0.0100
regdata_krs_fullnames  success    1      $0.0050  ← Apify actor $5/1k
tavily_brand_search    success    1      $0.0050
TOTAL                            270     $1.4153
```

**Sources containing 'rejestr' or 'krs':** `KRS` (free MS gov), `rejestrio_v2` (paid rejestr.io), `regdata_krs_fullnames` (Apify actor — NOT rejestr.io).

---

## STEP 4 — Bulk script status

```
scripts/sync-krs-bootstrap.ts  mtime=2026-05-10 11:21  size=31487
```

Script code не modyfikowany od 17 dni. Last bulk run dał 106 KRS prospects do UC_PROD_GOTOWE_MAZ na **23.05** (per task #94 history). To listing-only через `/org` GET (cheap 0,05 zł × ~10 pages = ~0,50 zł). **Bulk script NIE wywołuje sprawozdania, NIE odpowiada за obecny credit drain.**

Per-firm enrichment (drogie 3,60+ zł / firma) fires tylko gdy:
- Vadym klikne "Analizuj klienta" na pojedynczego klienta → `/api/intelligence/lookup` → runRejestrioStep
- Lub batch analiza cohort (np. 29 firm "Analizuj cohort") → 29 × runRejestrioStep

State files (`tmp/sync-krs-state.json`) nie istnieją — script nie uruchamiany od deploy lub był runned bez cache state file (z basePath override).

---

## Konkretne знахідки до actionable next sprint

### 1. Brak budget guard
Per-firma sprawozdania może wybić budżet jednym kliknięciem. **Recommend:** ENV flag `REJESTRIO_SKIP_SPRAWOZDANIA=true` (default false) + per-call counter w `runRejestrioStep` z hard stop > N calls.

### 2. Brak per-step cost tracking w enrichment_log
Wszystkie 8 endpoint calls агрегують у **1 row** з cost_usd=0. Diagnostic blind spot. **Recommend:** każdy step zapisuje swoje LOC `cost_usd` (np. `org-basic` = 0.012 USD = 0.05 zł / 4.15 PLN/USD).

### 3. Sprawozdania JSON not gated by client value
Czy klient stoi na "Hurtownia 5k zł/mies" czy "JDG за 200 zł" — runRejestrioStep fetchuje sprawozdania to samo. **Recommend:** skip JSON fetch dla JDG (entity_type='JDG' już guards entire step, OK), ale brakuje guard dla "small sp.z o.o." (kapitał <50k) — można wziąć tylko ostatni rok zamiast wszystkich.

### 4. Skip-logic dla `rejestrio_v2` дуже coarse-grained
`if hasMgmt && lastSuccess<30d → skip whole 8-step batch`. UC_PROD_GOTOWE_MAZ świeże fresh-from-bulk → hasMgmt=false → fire full. **Recommend:** dodać partial skip per-step (np. jeśli `clients.last_filing_date` populated <30d → skip wzmianki step).

### 5. Bulk script nie odpowiada
Per Step 4: bulk listing było cheap. Drain pochodzi z manual analiz cohort (29 firm UC_PROD_GOTOWE_MAZ). Optimization should target `/api/intelligence/lookup` per-firm cost, nie bulk script.
