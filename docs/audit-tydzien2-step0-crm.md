# TYDZIEN2 STEP 0 — CRM Essentials Audit

**Data**: 28.05.2026 · **Тип**: read-only audit · **Sprint**: TYDZIEN2 (CRM база)

Скан схеми DB + UI компонентів профілю клієнта, списку клієнтів і cohort
view. Жодні файли не змінено. Recommend архітектури тижня 2 наприкінці.

---

## 1. Існуючі CRM-таблиці (повна карта)

| Table | Created | Призначення | Multi-row? | Schema (ключове) |
|---|---|---|---|---|
| `clients` | 001 | Анкета фірми (легка, плоска) | ні (1 row per fкомпани) | title, nip, city, address, email, phone, notes (TEXT single string), segment, status, owner_id |
| `contacts` | 001 | Контактні особи (decision makers, staff) | **так** | id, client_id, name (REQUIRED), phone, email, notes, owner_id |
| `persons` + `person_company_links` | 031 | Управлінська структура з KRS (zarząd) | так | imie, nazwisko, rola, data_od, data_do |
| `person_events` | 031 | Urodziny / awansy / nagrody | так | typ ENUM, data, miesiac/dzien, repeat_yearly |
| `company_profile_fields` | 031 | Canonical merged fields з усіх sources (KRS/GUS/WWW/Apify/AI) | так (append-only з superseded_at) | client_id, field_key, value_text/json/number, source, source_priority, confidence |
| `contact_enrichment` | 028 | Raw Apify GMaps payload | так (per source) | target_id, source, phone, email, website, gmaps_rating, raw_payload |
| `cohorts` + `cohort_members` | 060/066 | Когорти (групи клієнтів/prospects для дзвонів) | так | cohort_id, subject_type, subject_id, status, notes |
| `deals` + `deal_items` | 001/010 | Угоди / pipeline | так | client_id, stage, amount, close_date |
| `tasks` | 001 | To-do (зв'язані з клієнтом optional) | так | client_id, due, sphere, priority, done |
| `orders` + `order_items` | 068 | Замовлення HoReCa | так | client_id, status, items, total |
| `notification_log` | 070 | Email/Telegram sends log | так | order_id, type, recipient, sent_at, status |

**ЯВНО ВІДСУТНІ** (per grep migrations 001-072):

| Bracha table | Що мав би бути |
|---|---|
| `client_notes` | Multi-row notatки/коментарі з timestamp + author. Зараз тільки `clients.notes` (single TEXT) |
| `client_activity` / `activity_log` | Timeline взаємодій (дзвінок/лист/оферта/order/krs_refresh/...). Зараз історія розкидана: deals, tasks, orders, notification_log, enrichment_log — без unified view |
| `client_contact_methods` | Multi-row email/phone/website з sources. Зараз single field у `clients` + canonical у `company_profile_fields` (один current per field_key) |

**Sample contacts table (live DB):** 7 rows total. Schema = "людська"
(name=REQUIRED, phone/email/notes optional). Не firm-level methods.
Приклад: `Денис · +48538416857 · email=""`. Тобто це decision makers manually
entered, НЕ firmа email-list.

**Sample DB cardinality (live):**
- 331 clients · 7 contacts · ~430 active company_profile_fields rows
- 20/331 clients з NULL city (6%)
- 70/331 clients з NULL email (21%) ← **тут the disconnect**
- 69/331 clients з NULL phone (21%)
- але `company_profile_fields[website]` = 40 active rows → значить ≥40 firm
  мають website з enrichment не writeback'нутий у `clients.*`

---

## 2. UI компоненти що рендерять профіль/list/cohort

### 2.1 Профіль клієнта `/clients/[id]`

`app/(dashboard)/clients/[id]/page.tsx` (~720 рядків) композує
наступні секції через `AccordionSection`:

| Секція | Component | Джерело даних |
|---|---|---|
| Kontakt | `ContactSectionV2` | `company_profile_fields` (email/phone/website з source-attribution badges) — **SINGLE values** |
| Aktywność → Kontakty | `ClientContacts` | `contacts` table (multi-row, з name) |
| Aktywność → Umowy | `ClientDeals` | `deals` table |
| Aktywność → Zadania | `ClientTasks` | `tasks` table |
| Profile | `ProfileSectionV2` | `company_profile_fields` |
| Persons (zarząd) | `PersonsSectionV2` | `persons` + `person_company_links` |
| AI Analysis | `BusinessProfileSection` | `clients.business_profile` JSONB |
| Sygnały | `SignalsSection` | KRS flags + BZP + Apify GMaps |
| Dopasowania | `MatchesPanel` | `matches` table |

**Critical observation:** "Kontakt" (sekcja read-only з source badges)
i "Aktywność → Kontakty" (`ClientContacts` з "Dodaj kontakt" button) —
**ДВА РІЗНІ DOMAIN**:

- `ContactSectionV2` = single email/phone/website за КЛІЄНТА (firmа-level
  canonical) з `company_profile_fields` z source tags (KRS/WWW/Apify).
- `ClientContacts` = люди (decision makers) з `contacts` table.
  Form REQUIRES `name`. Не годиться для "info@firma.pl".

Vadym критика #1 ("один email, не можна додати другий"): підтверджена —
`ContactSectionV2` рендерить ОДНЕ canonical value на field_key. Архітектура
`company_profile_fields` (current/superseded) гарантує одну active row.

Vadym критика #2 ("Dodaj kontakt не синхронізовано з профілем"):
підтверджена — `ClientContacts` INSERT у `contacts` table з name+phone+email.
Це НЕ оновлює canonical `company_profile_fields.email`. Якщо user додає
"biuro@firma.pl" як новий kontakt — Kontakt секція ВИЩЕ не покаже.

### 2.2 Edit form `/clients/[id]/edit`

`app/(dashboard)/clients/[id]/edit/page.tsx` → `ClientForm`
(`components/clients/client-form.tsx`, 435 рядків).

Form має поля: **title, nip, city, address, region, industry, email,
phone, notes, segment, status, client_type, contracted_margin_***.

`fetch('clients').select('*')` → fallback `client?.email || ''`.

Vadym критика #5 ("показує тільки NIP, не підтягує дані"):
**root cause** = enrichment pipeline (KRS/GUS/Apify) пише канонічні значення
**ТІЛЬКИ у `company_profile_fields`**, але НЕ writeback'ить у
`clients.email/phone/website/city/address`. Для свіжих enriched клієнтів
(yet no manual edit) form поля порожні навіть якщо canonical є.
Це explainує stats: 21% clients з NULL email/phone у `clients.*`, але
40+ rows у `company_profile_fields` з `field_key='website'`.

### 2.3 List `/clients`

`app/(dashboard)/clients/page.tsx` → `ClientsHub`.

```ts
const { data: clients } = supabase.from('clients').select('*')
// ...
unifiedRows = clientsList.map(c => ({
  city: c.city ?? null,
  has_contact: Boolean(c.phone || c.email || c.website),
}))
```

**Reads `clients.*` directly.** Якщо canonical city/email у
`company_profile_fields` але не writeback — list показує `—`.

Vadym критика #6 ("список не синхронізовано — місто не оновлюється"):
підтверджена — **той самий disconnect** як у edit form.

### 2.4 Cohort view `/intelligence/cohorts/[id]`

`app/intelligence/cohorts/[id]/page.tsx`. Снапшот `ClientSnapshot` для
client members: `id, title, city, nip, industry, segment, status` —
**reads `clients.*` directly**. Той самий disconnect для city.

Для prospect members joinиться `scored_prospects` + `contact_enrichment`,
але prospects живуть окремою cardinality.

Breadcrumb cohort view: `AI Discovery > Cohorts > {cohort.name}` ✓

---

## 3. Конфлікт-ризик: contacts vs company_profile_fields vs нова таблиця

### Current дизайн

```
clients.email/phone/website/city     ← legacy, manually entered
        ↑ NEVER writeback'нуть з enrichment

company_profile_fields[field_key]    ← canonical merged з KRS/GUS/WWW/Apify
                                       1 active row per (client, field_key)

contacts[client_id]                  ← multi-row, people (name REQUIRED)

contact_enrichment[target_id]        ← raw Apify payload (1 per source)
```

### Конфлікт-ризик якщо створимо `client_contact_methods`

| Сценарій | Конфлікт | Mitigation |
|---|---|---|
| User додає 2-й email у `client_contact_methods` | `company_profile_fields.email` показує тільки 1 canonical → UI disconnect | UI Kontakt секція повинна **читати з обох**: канонікальний primary + список additional з `client_contact_methods` |
| Enrichment writeback у `company_profile_fields.email` | Не торкається `client_contact_methods` | OK — поділ ролей: canonical=auto, methods=manual+aug. |
| User видаляє canonical email | `company_profile_fields` має superseded_at marker (audit trail) | OK — append-only вже handle цей case |
| `contacts.email` (на людях) vs `client_contact_methods.email` (на фірмі) | Можна сплутати: "Денис, +48..., email=biuro@..." — це Денис чи фірма? | UI має чітко розрізняти: "Osoby kontaktowe" (з contacts) vs "Sposoby kontaktu z firmą" (methods) |

### Recommend

**НЕ розширювати `contacts` table** (це люди — додавати firm-level methods
зламає семантику name=REQUIRED).

**НЕ розширювати `company_profile_fields`** (це canonical 1-current,
не призначене для multi-value).

**Створити нову таблицю** `client_contact_methods` (запропоновано нижче).

---

## 4. Навігація cohort ↔ client

### Поточний стан

| Перехід | URL | Параметри |
|---|---|---|
| `/clients` → `/clients/{id}` | direct | нема |
| Cohort row → client | `/clients/{id}` без `?from=` | **нема контексту** |
| Client breadcrumb | `Klienci > {title}` | нема "Cohorta X" link |
| Cohort breadcrumb | `AI Discovery > Cohorts > {name}` | OK |

`cohort-members-client.tsx:796`:
```ts
<Link href={`/clients/${c.id}`} className="...">{c.title}</Link>
```

Без `?from=cohort/{cohortId}` — cohort context втрачається.

### Що вже доступне без extra writes

`app/(dashboard)/clients/[id]/page.tsx:145`:
```ts
const { data: cohortMember } = await supabase
  .from('cohort_members')
  .select('cohort_id')
  .eq('subject_id', id)
  .eq('subject_type', 'client')
  .limit(1)
  .maybeSingle()
const orderCohortId = cohortMember?.cohort_id ?? null
```

Поточна сторінка **вже знає** в якій когорті клієнт. Достатньо JOIN
`cohorts.name` і додати breadcrumb. Backend змін не треба.

Vadym критика #7 ("не можна повернутись у когорту"): підтверджена —
fix = pure UI patch.

---

## 5. Recommend архітектуру тижня 2

### 5.1 Multi-contact (problem #1, #2) — Recommend Option B

**Нова таблиця** `client_contact_methods`:

```sql
CREATE TABLE client_contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('email','phone','website','facebook','instagram','linkedin','other')),
  value TEXT NOT NULL,
  label TEXT,  -- "biuro", "kierownik", "sklep wrocław" etc.
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL CHECK (source IN ('manual','KRS','WWW','Apify','GUS','VAT_BL','CEIDG')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON client_contact_methods (client_id, kind, value);
-- exactly 1 primary per kind per client:
CREATE UNIQUE INDEX ON client_contact_methods (client_id, kind) WHERE is_primary = TRUE;
```

**Sync rules:**
- Enrichment continues writing canonical у `company_profile_fields` (no change).
- Migration job copies current canonical (`company_profile_fields[email/phone/website]`)
  у `client_contact_methods` з `source` tag + `is_primary=TRUE`.
- UI `ContactSectionV2` reads з обох:
  - primary = `client_contact_methods` WHERE `is_primary=TRUE` (per kind).
  - additional = list rows WHERE `is_primary=FALSE`.
- "Dodaj kontakt do firmy" UI відрізняється від "Dodaj osobę kontaktową".

### 5.2 Notes (problem #3) — Recommend Option B

**Нова таблиця** `client_notes`:

```sql
CREATE TABLE client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Migration: copy `clients.notes` → `client_notes` (one row per client з
non-empty notes), then leave `clients.notes` deprecated (NULL out на нових,
оптимально DROP COLUMN у наступному sprint).

UI: новий accordion section "Notatki" з list + "Dodaj notatkę" inline.
Pinned (рожевий стиль) sortuje top.

### 5.3 Activity (problem #4) — Recommend гібрид

**Опція A — простий**: окрема dedicated `client_activity` table:

```sql
CREATE TABLE client_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'call', 'email_in', 'email_out', 'meeting',
    'offer_sent', 'order_placed', 'order_shipped',
    'note', 'krs_refresh', 'tavily_run', 'apify_run',
    'cohort_status_change', 'manual'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_user_id UUID REFERENCES auth.users(id),
  payload JSONB NOT NULL DEFAULT '{}',
  -- Optional FK до конкретного джерела:
  related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  related_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  related_notification_id UUID REFERENCES notification_log(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON client_activity (client_id, occurred_at DESC);
```

**Backfill через VIEW union** з існуючих джерел:
- offers/orders → `activity_type='offer_sent'/'order_placed'`
- notification_log → `activity_type='email_out'`
- enrichment_log → `activity_type='tavily_run'/'krs_refresh'`

Це дає immediately fullне history без empty state. Manual entries
("Дзвонив, не відповіли") писати directly у `client_activity`.

### 5.4 List/edit sync (problem #5, #6) — Recommend Option B (trigger)

**Root cause**: enrichment writes у `company_profile_fields` тільки,
не writeback у `clients.email/phone/city/website`.

**Fix Option B**: Postgres trigger на `company_profile_fields` INSERT/UPDATE
з `superseded_at IS NULL` → writeback у `clients.*` для cached columns
(`email`, `phone`, `website`, `city`, `address`).

```sql
CREATE OR REPLACE FUNCTION sync_canonical_to_clients()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.superseded_at IS NOT NULL THEN RETURN NEW; END IF;
  CASE NEW.field_key
    WHEN 'email' THEN UPDATE clients SET email=NEW.value_text, updated_at=now() WHERE id=NEW.client_id AND (email IS NULL OR email='');
    WHEN 'phone' THEN UPDATE clients SET phone=NEW.value_text, updated_at=now() WHERE id=NEW.client_id AND (phone IS NULL OR phone='');
    WHEN 'website' THEN UPDATE clients SET website=NEW.value_text, updated_at=now() WHERE id=NEW.client_id AND (website IS NULL OR website='');
    WHEN 'city' THEN UPDATE clients SET city=NEW.value_text, updated_at=now() WHERE id=NEW.client_id AND (city IS NULL OR city='');
    WHEN 'address' THEN UPDATE clients SET address=NEW.value_text, updated_at=now() WHERE id=NEW.client_id AND (address IS NULL OR address='');
    ELSE RETURN NEW;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cpf_to_clients_sync
AFTER INSERT OR UPDATE ON company_profile_fields
FOR EACH ROW EXECUTE FUNCTION sync_canonical_to_clients();
```

Backfill batch для існуючих 70 NULL emails (через REST update Manual).

**Important caveat**: якщо `client_contact_methods` (5.1) стане джерелом
truth — trigger має тарget'ити її, а `clients.email/phone` deprecate.
Decision: робити одне за один раз. Recommend:
1. T2 Sprint 1 — `client_contact_methods` + migration з cpf canonical.
2. T2 Sprint 2 — sync trigger БО `clients.*` ще треба для list/edit Quick.
3. T2 Sprint 3 — `client_notes` + `client_activity`.
4. T2 Sprint 4 — deprecate `clients.email/phone/website` (DROP COLUMN), list/edit reads з contact_methods.

### 5.5 Back button (problem #7) — Recommend low-cost UI patch

**Жодних DB змін**. Pure UI patch:

1. У `cohort-members-client.tsx:796` змінити
   `href={\`/clients/${c.id}\`}` → `href={\`/clients/${c.id}?from=cohort/${cohortId}\`}`.

2. У `app/(dashboard)/clients/[id]/page.tsx`:
   - Read `searchParams.from`. Якщо `from === \`cohort/{uuid}\`` — parse.
   - JOIN `cohorts.name` за `cohortMember.cohort_id`.
   - Якщо `from=cohort/{id}` matches `cohortMember.cohort_id` (або без
     param + є active membership) — додай breadcrumb:
     `[{ label: cohort.name, href: \`/intelligence/cohorts/${cohort.id}\` }, { label: 'Klient' }]`.
   - Якщо запит direct (нема from, нема cohort_member) — старий breadcrumb
     `Klienci > {title}`.

---

## 6. Запропонована послідовність тижня 2

| Sprint | Subject | Risk | Time |
|---|---|---|---|
| T2.1 | `client_contact_methods` table + migration з canonical + UI Kontakt section v3 | M | 2 dni |
| T2.2 | Sync trigger `cpf → clients.*` + backfill NULL clients (70 rows) | L | 0.5 dni |
| T2.3 | `client_notes` table + UI Notatki accordion + migration `clients.notes` | L | 1 dzień |
| T2.4 | `client_activity` table + VIEW backfill з offers/orders/notifications/enrichment + UI Timeline accordion | M | 2-3 dni |
| T2.5 | Cohort↔client navigation patch (3 files, NO DB) | L | 0.5 dni |
| T2.6 | Edit form — auto-prefill з `client_contact_methods` (multi-input rows replacing single email/phone) | M | 1 dzień |

**Decision points для Vadym перед startом:**

1. **Подобається назва `client_contact_methods`** чи краще `firm_contacts`?
   Я б рекомендував "contact_methods" бо це method-level (email/phone/website)
   а не "kontakty-люди" (вже maintain `contacts`).

2. **`client_activity` — додати manual entry UI** у T2.4 чи відкласти?
   Quick win: лише backfilled view (no manual entry) — менше ризику.

3. **DROP COLUMN `clients.email/phone/website`** після T2.1 чи keep як
   cache (з trigger sync)? Recommend keep — list page query simple, не
   треба refactor 5 файлів.

4. **`?from=` URL param convention** — є якесь codebase standard? Якщо ні,
   `?from=cohort/{uuid}` (slash як subpath delimiter) — або `?from=cohort&fromId={uuid}` (більш explicit).

---

## 7. Залишилось до сlarify (STOP — чекаю на вибір)

- (Q1) Чи маємо створити **БІЛЬШЕ ніж 1 primary email** на клієнта? Чи
  завжди тільки 1 primary + N additional? — Recommend single primary +
  N additional (UNIQUE INDEX на primary).
- (Q2) Чи зберігати **soft-delete** на `client_contact_methods` (status field)
  чи hard DELETE? Recommend hard DELETE bo audit trail є у `company_profile_fields.superseded_at`.
- (Q3) `client_activity` — чи додавати `enrichment_log` як source? Це
  ~150+ rows на client (per Apify+Tavily+KRS runs). Можливо filter і tylко
  human-relevant events.
- (Q4) Vadym критика #5 говорить "тільки NIP" — це може значити specific
  bug у form (одне поле клiknable, інші grayed)? Чи general 21% NULL email
  problem? Я припустив #2 — варто verify на конкретному клієнті.

---

**STOP — audit complete, без правок коду / DB.** Чекаю decision points
1-4 + Q1-Q4 перш ніж GO STEP 1.
