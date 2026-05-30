# TYDZIEN2.T2.4 STEP 0 — Multi-Contact Audit

**Data**: 28.05.2026 · **Тип**: read-only audit ·
**Goal**: визначити архітектуру для multi email/phone на фірму перш ніж планувати T2.4.

---

## 1. Поточний Kontakt блок

### 1.1 Component + дата flow

`/clients/[id]` секція **Kontakt** (accordion id=`kontakt`, page.tsx line 785-799):
- Рендерить `<ContactSectionV2 />` (`components/clients/contact-section-v2.tsx`)
- Read-only display. Один email + один phone + один website + facebook/instagram links.
- Source badges: KRS / WWW / Apify / null

**Data fetched на page.tsx (lines 344-358)**:
```ts
const fieldsArr = profileFields.filter(f => f.value_text)   // cpf rows
const emailField = fieldsByKey.get('email')                 // 1 active row
const phoneField = fieldsByKey.get('phone')
const websiteField = fieldsByKey.get('website')

const emailValue = c.email_krs ?? emailField?.value_text ?? c.email
const emailSource = c.email_krs ? 'KRS' : emailField?.source ?? null
// similarly phone/website
```

**Priority cascade**: `clients.{email,website}_krs` column → `company_profile_fields[email]` active row → `clients.email` denormalized cache. (T2.1 sync hook ensures last 2 layers stay in sync.)

### 1.2 "+ Dodaj kontakt" button

Лінк (line 787): `<SectionActionLink href={\`/clients/${id}#aktywnosc\`} />`

**Це anchor jump до `<AccordionSection id="aktywnosc">`** (нижче, line ~800+). Там у tab "Kontakty" — `<ClientContacts />` component з **dialog form `name+phone+email+notes`** який пише у `contacts` table.

Тобто кнопка "Dodaj kontakt" **НЕ** додає firm-level email/phone — вона додає **decision-maker з name=REQUIRED**.

### 1.3 "N źródeł" — звідки рахується

Line 406:
```ts
const contactSourcesCount = [emailValue, phoneValue, websiteValue].filter(Boolean).length
```

**Це НЕ "sources", а "filled fields count"** (max 3). Misleading meta string — для FRESH MEALS показує "3 źródeł" коли всі email+phone+website filled з різних sources, але це 3 fields a не 3 джерела. **Recommend rename "X uzupełnionych" чи "X kontaktów".**

### 1.4 Соцмережі

ContactSectionV2 рендерить facebook/instagram як окремі rows під email/phone/website (`components/clients/contact-section-v2.tsx:55-61`):
```tsx
{facebookUrl && <ContactRow icon=<FacebookIcon/> value=... source="WWW" />}
{instagramUrl && <ContactRow icon=<InstagramIcon/> value=... source="WWW" />}
```
Source hardcoded "WWW" (не з cpf field, тільки display). У cpf реальні sources = WWW/website_scrape.

---

## 2. `contacts` Table — Live Data (7 rows, всі люди)

| name | phone | email | client (NIP/legal) |
|---|---|---|---|
| Денис | +48538416857 | — | 1e118c77-… |
| Андрій Харачко | +48788188399 | — | db7811bb-… |
| Дмитро Кірсанов | +48730938463 | — | 116df2d5-… |
| Максим Бурдей | +48535324361 | Lemaxfirma@gmail.com | a3d01c60-… |
| **Beata Kowalska** | +48734418702 | beata.kowalska@transgourmat.pl | 2e5b8c57-… (**Transgourmet**) |
| **Jaroslaw Wodnicki** | +48662102695 | jaroslaw.wodnicki@transgourmet.pl | 2e5b8c57-… (**Transgourmet, той самий client_id**) |
| Олексій | +48 573 403 435 | kozak.strzelce.opolskie@gmail.com | ed4e12e5-… (Kozak) |

**Висновки:**
1. Всі 7 rows = **люди (decision-makers)**: Денис, Андрій Харачко, Дмитро Кірсанов, Максим Бурдей, Beata Kowalska, Jaroslaw Wodnicki, Олексій. Імена українські + польські.
2. Schema `name TEXT NOT NULL` (migration 001:23-32) — name REQUIRED. Form у `ClientContacts` теж REQUIRED.
3. **Multi-row на одного клієнта вже працює**: Transgourmet client має 2 contacts (Beata + Jaroslaw) → pattern існує для людей.
4. **НЕ ГОДИТЬСЯ для firm-level methods** "info@firma.pl" / "biuro@firma.pl" / "sklep@firma.pl" — semantika `name` REQUIRED ламається. Treba окрема таблиця.

---

## 3. Recommend Schema — `client_contact_methods` (NEW)

### 3.1 SQL

```sql
CREATE TABLE client_contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'email', 'phone', 'website', 'facebook', 'instagram', 'linkedin', 'other'
  )),
  value TEXT NOT NULL,
  label TEXT,                                    -- 'biuro', 'sprzedaż', 'kierownik', 'sklep Wrocław'
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL CHECK (source IN (
    'manual',          -- user-entered via UI
    'KRS',             -- з clients.email_krs / website_krs
    'WWW',             -- naive Tavily (cpf source WWW)
    'website_scrape',  -- regex extraction (cpf source website_scrape)
    'apify_gmaps',     -- Apify Google Maps actor
    'tavily_brand',    -- brand-aware Tavily
    'migration_seed'   -- one-shot copy з clients.* + cpf при T2.4.A migration
  )),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0
    CHECK (confidence BETWEEN 0 AND 1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Унікальність value per (client, kind) — same email twice prevented
CREATE UNIQUE INDEX ON client_contact_methods (client_id, kind, value);

-- Exactly 1 primary per (client, kind) — DB-level constraint
CREATE UNIQUE INDEX ON client_contact_methods (client_id, kind)
  WHERE is_primary = TRUE;

CREATE INDEX ON client_contact_methods (client_id);
```

### 3.2 Чи можна обійтись existing `contacts` (name nullable)?

**НЕ Recommend** — 3 причини:
1. Semantic clash: `contacts.name` REQUIRED уже у production, 7 rows. Зміна на NULLABLE — risky migration.
2. UI плутанина: "Beata Kowalska" + "biuro@firma.pl" в одному списку — користувач не розуміє чи це людина чи інбокс.
3. Form fields differ: contacts має `notes`, methods потребує `kind/label/is_primary/source` — semantically different shapes.

**Recommend** окрема `client_contact_methods` (поділ ролей):
- `contacts` залишається для **людей** (decision-makers, Vadym ввід вручну).
- `client_contact_methods` для **firm-level методів** (multi-email/phone з sources + manual).

### 3.3 Чому окремо від `company_profile_fields`?

cpf — append-only canonical з ONE active row per (client, field_key). Не дозволяє multi-row на один field_key (UNIQUE INDEX `cpf_target_field_active_uniq`). Розширити cpf на multi-row зламає merge logic у `lib/profile/merge.ts:upsertField` (overwrite by priority assumes 1 active).

ccm — multi-row by design. Поділ:
- cpf = single canonical per field (для AI / re-score / list filters).
- ccm = повний список (для contact UI).

---

## 4. Співіснування 3-х layers

```
┌─────────────────────────────────────────────────────────────┐
│ clients.email / phone / website / city / address            │
│ Single-value denormalized cache. List + Edit form read here.│
│ Populated через T2.1 sync hook з cpf (NULL-only policy).    │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ T2.1 sync hook (upsertField after-write)
                          │
┌─────────────────────────────────────────────────────────────┐
│ company_profile_fields                                       │
│ Append-only canonical. ONE active row per (client, key).    │
│ Sources priority KRS=10 > GUS=9 > ... > AI=3.              │
│ Enrichment writes here (KRS/GUS/WWW/Apify/website_scrape).  │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ Migration seed (T2.4.A one-shot)
                          │ + Future: manual ccm INSERT also writes у cpf?
                          │
┌─────────────────────────────────────────────────────────────┐
│ client_contact_methods (NEW T2.4)                            │
│ Multi-row per client per kind. Manual additions + seeded.   │
│ is_primary marks "main" (1 per kind, UNIQUE).               │
│ UI Kontakt section reads звідси (primary + additional).     │
└─────────────────────────────────────────────────────────────┘
```

**UI Kontakt section reads order** (proposal):
1. Try `client_contact_methods WHERE kind=email ORDER BY is_primary DESC, created_at`.
2. Якщо empty (бо нова client без seed) — fallback do current logic (clients.email | cpf | krs).
3. Display primary (top, bold) + N additional rows.

**Write order для manual** (T2.4.C):
- User INSERT через UI → ccm row з source='manual'.
- (Optional) пишемо також у cpf через `upsertField(source='manual', priority=5)` — створює audit trail у canonical layer. **Defer до T2.4.C decision**.

---

## 5. Migration Seed Plan (T2.4.A)

### 5.1 Дані до seed (live counts)

| Source | Field | Active rows | Priority hint |
|---|---|---:|---|
| clients.email_krs | email | ? | source='KRS', is_primary=TRUE first |
| clients.email | email | 237 filled | source='migration_seed' |
| clients.phone | phone | 238 filled | source='migration_seed' |
| clients.website / website_krs | website | 13 (clients.website) + 100+ KRS | source='KRS' or 'migration_seed' |
| cpf[email] | email | 5 | source = cpf.source (website_scrape/WWW) |
| cpf[phone] | phone | 16 | source = cpf.source (Apify_GMaps/website_scrape/WWW) |
| cpf[website] | website | 68 | source = cpf.source (WWW/tavily_brand/manual_override/Apify_GMaps) |
| cpf[facebook_url] | facebook | 46 | source = cpf.source |
| cpf[instagram_url] | instagram | 17 | source = cpf.source |

**Очікувано після seed** (rough): ~600 rows у ccm (avg ~2/client × 331 clients).

### 5.2 Seed algorithm (one-shot script `scripts/seed-contact-methods.ts`)

```ts
for each client in clients:
  candidates = []   // [{ kind, value, source }]

  // KRS columns (highest trust)
  if client.email_krs:      candidates.push({ kind:'email',   value:.., source:'KRS' })
  if client.website_krs:    candidates.push({ kind:'website', value:.., source:'KRS' })

  // cpf actives
  for each cpf row WHERE client_id = client.id AND superseded_at IS NULL
                    AND field_key IN ('email','phone','website','facebook_url','instagram_url'):
    candidates.push({ kind: mapField(cpf.field_key), value: cpf.value_text, source: cpf.source })

  // clients.* denormalized (fallback якщо cpf не має)
  if client.email AND not seen email value:
    candidates.push({ kind:'email', value: client.email, source:'migration_seed' })
  if client.phone AND not seen phone value:
    candidates.push({ kind:'phone', value: client.phone, source:'migration_seed' })
  if client.website AND not seen website value:
    candidates.push({ kind:'website', value: client.website, source:'migration_seed' })

  // Mark first per kind as primary
  for each kind in candidates:
    candidates[kind][0].is_primary = true

  INSERT ... ON CONFLICT (client_id, kind, value) DO NOTHING
```

**Idempotency**: `ON CONFLICT DO NOTHING` через UNIQUE INDEX. Re-run safe.

**Dry-run flag**: `--apply` for real run (mirror T2.1 backfill pattern).

---

## 6. RLS Recommend

**Authenticated permissive** (як `cohorts`, `company_profile_fields`):
```sql
ALTER TABLE client_contact_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccm_authenticated_all ON client_contact_methods
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
```

**Чому не service-role only (як orders)?**
- ccm треба читати з `/clients/[id]` page для UI Kontakt. Маємо чи робити admin client (як T2.2 BUGFIX для orders) чи permissive.
- Vadym = single user (own only). Sensitivity = low (contact methods, не PII high-risk).
- Permissive = less friction. Anon client (cookie session = authenticated) працює з default page imports.

---

## 7. UI План (UI-first)

### 7.1 Replace ContactSectionV2 з ContactSectionV3

**Layout** (group by kind):

```
┌─ Kontakt ──────────────────────── 3 emaile · 2 telefony · 2 social ─┐
│                                                                      │
│ 📧 Emaile                                                            │
│ ⭐ kontakt@maczfit.pl       [KRS]  primary                          │
│    biuro@maczfit.pl         [website_scrape]  label: "biuro"         │
│    + Dodaj email                                                     │
│                                                                      │
│ 📞 Telefony                                                          │
│ ⭐ +48 504 125 279          [Apify]  primary                         │
│    +48 22 555 12 34         [manual] label: "sklep Warszawa"         │
│    + Dodaj telefon                                                   │
│                                                                      │
│ 🔗 Social                                                            │
│    https://facebook.com/maczfit    [WWW]                             │
│    https://instagram.com/maczfit   [WWW]                             │
│    + Dodaj link                                                      │
│                                                                      │
│ Website: https://maczfit.pl  [KRS]  ⭐                              │
│    + Dodaj website                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 Add inline (не modal)

- "+ Dodaj email" inline button per kind expandsto inline form:
  - input[type=email/tel/url] + label optional input + is_primary checkbox + Save/Cancel
- Edit dialog: hover row → pencil icon → modal з тими ж fields + delete button
- Star icon перемикається click → server action `set_primary` (auto-clears other primary)

### 7.3 Розділення з "Osoby kontaktowe" (contacts)

**Kontakt section** (firm methods) → новий ccm-based блок.
**Osoby kontaktowe** (existing `ClientContacts` decision-makers) → залишається у `<AccordionSection id="aktywnosc">` tab "Kontakty".

Перейменувати tab "Kontakty" → **"Osoby kontaktowe"** для clarity. "+ Dodaj kontakt" button (line 787 на Kontakt accordion meta) перейменувати на **"+ Dodaj sposób kontaktu"** і направити на новий ccm form (НЕ anchor #aktywnosc).

---

## 8. Recommend Scope — Split на 3 sub-sprints

| Sprint | Subject | Risk | Time | Verifiable by |
|---|---|---|---|---|
| **T2.4.A** | Migration + seed script + RLS policy | M (DB schema change + 600+ INSERT) | ~45 min | REST count(ccm) per client > 0 |
| **T2.4.B** | ContactSectionV3 read-only display (group by kind, ⭐ primary, source badges) | L (no writes) | ~60 min | UI shows seeded data correctly |
| **T2.4.C** | Write actions: add/edit/delete/set-primary + UI inline forms | M (server actions + form validation) | ~90 min | Vadym manual add "biuro@maczfit.pl" як 2-й email на FRESH MEALS |

**Чому split:**
1. **Risk isolation** — DB migration окремо від UI. Якщо seed має edge case (duplicate emails, NULL phones) — діагностика без UI noise.
2. **Verifiable steps** — після T2.4.A Vadym може REST-перевірити seed (без UI redeploy). Після T2.4.B бачить existing methods згрупованими (read-only). Після T2.4.C — full add/edit.
3. **Rollback granularity** — якщо T2.4.C ламає UI, revert тільки UI changes, seed залишається.
4. **Аналогічно з T2.1** який зробив hook + backfill як окремі sub-sprints — pattern працює.

**Alternative — single ship**: можна об'єднати B+C (UI read+write) якщо хочемо швидше. A окремо все одно (DB safety).

---

## 9. Decision Points перед GO

1. **Confirm split** A→B→C чи combine B+C?
2. **`other` kind у CHECK constraint** — потрібен? (для edge cases типу WhatsApp/Telegram чисто). Recommend keep, low cost.
3. **`label` text:** free-text vs preset enum ('biuro'/'sprzedaż'/'kierownik')? Recommend free-text — фірми бувають різні.
4. **Manual ccm INSERT → також пише в cpf?** Recommend NIE (Phase 1) — ccm = окремий layer. cpf = automatic enrichment only. Edge case "Vadym ввів email manually який потім перебитий KRS" — manual у ccm залишається, cpf updates окремо. Simpler.
5. **Rename "Dodaj kontakt" → "Dodaj sposób kontaktu"?** Recommend yes (clarity).
6. **`+ Dodaj kontakt` button у meta — куди тепер вказує?** На новий ccm form (inline) чи відкриває `<ContactSectionV3>` accordion з focus? Recommend перейменувати + точкою на inline form.

---

## 10. Files Recommend Touch

| File | Sprint | Type |
|---|---|---|
| `scripts/073_client_contact_methods.sql` | T2.4.A | NEW migration |
| `scripts/seed-contact-methods.ts` | T2.4.A | NEW untracked seed script |
| `lib/types.ts` | T2.4.B | extend з `ContactMethod` type |
| `components/clients/contact-section-v3.tsx` | T2.4.B | NEW (replace V2) |
| `app/(dashboard)/clients/[id]/page.tsx` | T2.4.B | fetch ccm + pass props + replace import |
| `app/actions/contact-methods.ts` | T2.4.C | NEW server actions (add/edit/delete/setPrimary) |
| `components/clients/contact-method-form.tsx` | T2.4.C | NEW inline form |

**Зачеплено**: ~7 files. Зberi gone: `ContactSectionV2` (deleted after V3 ship + verify) — defer cleanup.

---

**STOP — audit complete. ZERO writes.** Чекаю на decisions (1-6 у STEP 9) + GO для T2.4.A.
