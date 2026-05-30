# TYDZIEN2.T2.1 STEP 0 — cpf→clients SYNC Diagnose

**Data**: 28.05.2026 · **Type**: read-only audit · **Goal**: вирішити архітектуру
sync canonical `company_profile_fields` → `clients.*` колонки + backfill 70 NULL.

---

## 1. cpf Structure — full field_key inventory (live DB)

**Total active rows у `company_profile_fields`** (superseded_at IS NULL): **1582**

### 1.1 Field_key mapping → `clients` колонки

| cpf.field_key | clients column | cpf active | Sources (з priorities) |
|---|---|---:|---|
| `email` | `clients.email` | **5** | website_scrape=4, WWW=1 |
| `phone` | `clients.phone` | **16** | Apify_GMaps=13, website_scrape=2, WWW=1 |
| `website` | `clients.website` | **68** | WWW=58, tavily_brand=6, Apify_GMaps=3, manual_override=1 |
| `facebook_url` | `clients.facebook_url`? | **46** | WWW=43, website_scrape=3 |
| `instagram_url` | `clients.instagram_url`? | **17** | WWW=16, website_scrape=1 |
| `linkedin_url` | `clients.linkedin_url`? | **0** | — |
| `city` | `clients.city` | **0** ⚠ | (cpf не містить — populated через GUS parser прямо у clients) |
| `address` | `clients.address` | **0** ⚠ | (cpf не містить — те саме) |

⚠ **Критичне відкриття:** `city` і `address` **НЕ населяються у cpf взагалі**.
GUS parser (sprint A.1.1) writeback'ує city прямо у `clients.city`.
Тож sync trigger cpf→clients **не вирішить city/address disconnect**.

### 1.2 Active value rule

З `lib/profile/merge.ts:99-186`:
- 1 active row per `(client_id, field_key)` (UNIQUE INDEX `cpf_target_field_active_uniq`).
- Active = `WHERE superseded_at IS NULL`.
- Audit trail: superseded rows залишаються з `superseded_at` + `superseded_by_source`.

### 1.3 Priority + confidence (з `SOURCE_PRIORITIES`)

```
10  KRS / sprawozdania_KRS / MSiG  (official registries)
 9  GUS
 8  CEIDG
 7  VAT_BL
 6  BZP
 5  manual_override / manual / tavily_brand / Apify_GMaps
 4  WWW  (naive Tavily)
 3  AI
```

**Merge rule** (з `upsertField`):
- newPriority > existing → supersede.
- newPriority == existing AND value differs → supersede (newer wins).
- newPriority == existing AND value same → update `last_verified_at`.
- newPriority < existing → ignored (lower priority loses).

### 1.4 Active source distribution

| Source | Active rows у cpf |
|---|---:|
| GUS | 460 |
| KRS | 286 |
| VAT_BL | 151 |
| WWW | 78 |
| Apify_GMaps | 20 |
| website_scrape | 3 |
| tavily_brand | 2 |
| **manual / manual_override** | **0** |

**Висновок**: НЕМАЄ active rows з source='manual'. Тобто Vadym entries
через Edit form ідуть **тільки у `clients.*` напряму** (через
`supabase.from('clients').update`), а в cpf їх немає. Це чітко розрізняє
canonical vs manual data shadows.

---

## 2. Disconnect Scope (live DB, 331 clients)

**ВАЖЛИВО**: у `clients` колонки зберігаються **і NULL і empty string ''**
як "no value". Попередній audit рахував тільки `IS NULL` — недооблік.
Правильний count = `NULL OR ''`.

| field | empty у clients | cpf active | **Backfillable** (empty AND cpf has value) | Conflict (both filled, different) |
|---|---:|---:|---:|---:|
| email | 94 | 4 | **3** | 1 |
| phone | 93 | 13 | **12** | 1 |
| website | 318 | 67 | **56** | 3 |
| city | **254** | 0 | **0** | 0 |
| address | **242** | 0 | **0** | 0 |

**Висновки:**

1. Sync trigger / backfill вирішить **71 disconnect** (3 email + 12 phone + 56 website). Це **НЕ 70** як я раніше припустив у TYDZIEN2 audit — попередня цифра була `IS NULL only` без empty string.

2. **City disconnect = 254 firms** — це **окрема історія**. Cpf не має джерела для city. GUS parser sprint A.1.1 пише city прямо у clients.city. Хто з 254 empty city не отримав GUS enrichment взагалі — то заходи у T2.1 не лікують. Можливо T2.2 окремий sprint: "Run GUS lookup для всіх clients without city".

3. **Conflict scope малий** — 5 firms total мають different values між clients.* і cpf active. Конкретні рядки треба перевірити вручну перш ніж приймати overwrite rule.

---

## 3. Write Path Audit

### 3.1 Chokepoint = `upsertField` (single function для ВСІХ enrichment paths)

`lib/profile/merge.ts:99` — `upsertField` обробляє ВСІ writes у cpf.
Returns `{ status: 'inserted'|'superseded'|'verified'|'ignored_lower_priority', field_id }`.

### 3.2 Call sites (live)

`app/api/intelligence/lookup/route.ts`:
- line 311 — GUS  upsertFields
- line 433 — KRS  upsertFields
- line 483 — VAT_BL  upsertFields
- line 730 — WWW (Tavily naive)
- line 873 — tavily_brand
- line 1109 — Apify_GMaps
- line 1749 — website_scrape

`lib/ai/business-analysis.ts`, `lib/enrichment/web-search.ts` — also referenced.

**Не використовують upsertField:**
- `ClientForm` (Edit profile) пише ПРЯМО у `clients` через
  `supabase.from('clients').update(...formData)` — НЕ через merge layer.
  Тому manual entries не з'являються у cpf.

### 3.3 Recommend: APP-LEVEL (у `upsertField`) НЕ DB trigger

**Trade-off**:

| Approach | Pros | Cons |
|---|---|---|
| DB trigger | Catch-all (всі writes ловить); SQL-only deploy | Hard to debug; не може умовно logувати; запускає cascade у RLS context; може порушити idempotent imports |
| **App-level (extend `upsertField`)** | Уся логіка в TS, легко тестувати; conditional rule "тільки якщо `status IN ('inserted','superseded')` AND field у `WRITEBACK_FIELDS`"; інтегрується у existing `enrichment_log` audit | потрібен redeploy для зміни логіки; legacy raw inserts (якщо хтось) обходять |

**Recommend: app-level extension `upsertField`**. Сам `upsertField` уже
знає `status` (inserted/superseded/verified/ignored). Можна додати hook:

```ts
// All-в одному файлі lib/profile/merge.ts, після upsertField return:

const WRITEBACK_FIELDS = new Set([
  'email', 'phone', 'website', 'facebook_url', 'instagram_url',
]) // NOTE: city/address не у cpf — окремий path

if (
  target.type === 'client' &&
  (result.status === 'inserted' || result.status === 'superseded') &&
  WRITEBACK_FIELDS.has(fieldKey) &&
  value.value_text
) {
  await writebackToClient(supabase, target.id, fieldKey, value.value_text)
}
```

де `writebackToClient` робить conditional UPDATE per conflict policy
(див. STEP 5).

**Альтернативно (raised by you)**: одночасно з `upsertField` додати
**в тих самих 7 call sites** dual-write `clients.X = value` коли status
inserted/superseded. Less DRY але explicit. Recommend трохи проти —
chokepoint у `merge.ts` менш intrusive.

---

## 4. Backfill Plan

### 4.1 One-shot script `scripts/backfill-cpf-to-clients.ts`

**Algorithm (idempotent, safe re-run):**

```ts
// Phase A — pull all active cpf rows для writeback fields
const fields = ['email', 'phone', 'website', 'facebook_url', 'instagram_url']
for (const field of fields) {
  const { data: cpfRows } = await supabase
    .from('company_profile_fields')
    .select('client_id, value_text, source, source_priority')
    .eq('field_key', field)
    .is('superseded_at', null)
    .not('client_id', 'is', null)
    .not('value_text', 'is', null)

  for (const row of cpfRows) {
    // Phase 1 policy: WRITE ONLY IF clients.X is NULL or empty string
    const { data: client } = await supabase
      .from('clients')
      .select(field)
      .eq('id', row.client_id)
      .single()

    const current = client?.[field]
    if (current === null || current === '') {
      await supabase
        .from('clients')
        .update({ [field]: row.value_text, updated_at: new Date().toISOString() })
        .eq('id', row.client_id)
      console.log(`[backfill] ${row.client_id} ${field} = ${row.value_text} (from ${row.source})`)
    }
  }
}
```

**Очікувані результати**: 3 email + 12 phone + 56 website + 46 facebook +
17 instagram = **~134 row updates** (assuming clients.* facebook/instagram
empty для всіх — треба verify якщо ці колонки існують у `clients` schema).

⚠ **Verify schema first**: `clients.facebook_url` / `clients.instagram_url` —
columns не названі у migrations 001-072 для `clients` table grep. Можливо
не існують. Якщо НІ → не backfill'ити, додавати з міграцією у T2.1 sprint.

### 4.2 Priority order у cpf

Не потрібен — UNIQUE INDEX уже гарантує 1 active per (client, field_key).
Priority вже застосована на write time. Backfill просто бере active row.

### 4.3 Safety

- Idempotent: повторний run пропускає ones already filled.
- Audit log: print кожен update.
- Dry-run mode (`--dry-run`): print plan without UPDATE.
- Transaction: per-field batch у одну transaction (Supabase REST не підтримує
  cross-table transaction, тому per-row UPDATE — acceptable бо idempotent).

---

## 5. Conflict Handling

### 5.1 Scope conflict (live)

| field | clients.X has value | cpf active | values differ (conflict) |
|---|---:|---:|---:|
| email | 237 | 4 | 1 |
| phone | 238 | 13 | 1 |
| website | 13 | 67 | 3 |

**Total: 5 firms** з різним value між manual entry у clients і canonical у cpf.

### 5.2 Що значить "manual" в clients.*?

З write path audit (STEP 3): manual entry йде ПРЯМО у `clients` через
`ClientForm.update()` — не через `upsertField`. У cpf нема source='manual'
rows. Значить:
- `clients.email` non-empty → це manual entry АБО legacy import (early
  CRM seed) — **НЕ enrichment writeback** (бо такого pipeline немає).
- `cpf[email]` active → це enrichment.

### 5.3 Recommend (Phase 1): NULL-only sync

**Rule:**
- Якщо `clients.X` is `NULL` or `''` → write з cpf active.
- Якщо `clients.X` non-empty → **skip** (manual entry або legacy import wins).

**Rationale:**
- Safe: ніколи не перетирає user-entered value.
- 5 conflict cases (1+1+3) requirements review by Vadym окремо перед T2.1 ship.
- Latency cost zero — `if (current == null) return` check.
- Future Phase 2: коли є `clients.email_source` колонка (audit trail), можна
  робити "overwrite if source < cpf.source_priority". Не зараз.

### 5.4 Manual override expression

Якщо Vadym хоче **override** cpf canonical через UI — recommend новий path:
"Lock value" button у Kontakt section → пише з source='manual_override'
priority=5 у cpf, що supersedes WWW=4 / Apify=5 (newer wins). Зараз
`manual_override` source існує у priority list (line 30 merge.ts), але
немає UI що писав би туди — лише `POST /api/clients/[id]/website` (per
comment line 26).

T2.1 не включає це — це окремий sprint T2.6 (Edit form auto-prefill).

---

## 6. Recommend Architecture T2.1

### 6.1 Структура файлів

| File | Зміна |
|---|---|
| `lib/profile/merge.ts` | Додати `writebackToClient` helper + hook у `upsertField` after-write |
| `scripts/backfill-cpf-to-clients.ts` | NEW one-shot backfill з dry-run flag |
| `docs/audit-tydzien2-t2-1-step0-sync.md` | THIS report |
| (DB migration) | **NOT NEEDED** — schema unchanged |

### 6.2 Не торкаємось:

- DB triggers — none added.
- Edit form — залишається. Якщо хочемо щоб manual entry йшла у cpf — окремий
  sprint T2.6 (з Q1 audit).
- City/address — окремий sprint (need new GUS bulk-run для 254 empty).

### 6.3 Effort estimate

- App-level hook: ~30 рядків коду у `merge.ts` (1 helper + 1 if block).
- Backfill script: ~80 рядків (similar pattern до `scripts/backfill-contact-from-json.ts` уже існує).
- Verify host tsc + smoke test: ~10 хв.
- Vadym deploy + post-deploy verify (re-run lookup на FRESH MEALS): ~10 хв.

---

## 7. Decision points (чекаю GO STEP 1)

1. **Подтверждаєш app-level (у `upsertField`) НЕ DB trigger?** Я Recommend app-level.

2. **NULL-only conflict policy?** Phase 1 НЕ перетирати existing values.

3. **Facebook/instagram у backfill writeback?** Чи `clients` table має ці
   колонки? Якщо ні — додавати у міграцію чи відкласти до T2.1 sprint #2?

4. **City/address — окремий sprint?** Cpf source empty. Не у scope T2.1.

5. **5 conflict cases** — окремий manual review чи auto-skip?

6. Backfill **dry-run перший** чи відразу real run з audit print? Я recommend
   dry-run спочатку → review output → real run з '--apply' flag.

---

## 8. Live DB numbers (28.05.2026)

```
Clients total: 331
CPF total active: 1582

EMAIL    : clients empty=94 | cpf=4   | backfill=3
PHONE    : clients empty=93 | cpf=13  | backfill=12
WEBSITE  : clients empty=318| cpf=67  | backfill=56
FACEBOOK : clients ???      | cpf=46  | ??? (verify schema)
INSTAGRAM: clients ???      | cpf=17  | ??? (verify schema)
CITY     : clients empty=254| cpf=0   | 0 (out of scope T2.1)
ADDRESS  : clients empty=242| cpf=0   | 0 (out of scope T2.1)
```

**STOP — audit complete, без правок коду / DB.** Чекаю GO STEP 1
(або уточнень decision points 1-6).
