# TYDZIEN2.T2.4 STEP 0 v2 — Multi-Contact Audit (refresh)

**Data**: 28.05.2026 · **Тип**: read-only audit · v1 → v2 з focus на нові питання:
RLS owner_id, primary sync у clients.*, explicit dedupe, scope split.

Live numbers refreshed post T2.1 backfill (clients grew 331→341).

---

## 1. Поточний Kontakt блок (no change vs v1)

### 1.1 Component + data flow

`/clients/[id]` accordion id=`kontakt` (page.tsx line 785-799):
- Render: `<ContactSectionV2 />` (`components/clients/contact-section-v2.tsx`)
- Read-only display. **Single** email + phone + website + facebook + instagram links.
- Source badges KRS / WWW / Apify (per cpf.source).

**Cascade на page.tsx** (lines 344-358):
```ts
const emailValue = c.email_krs ?? emailField?.value_text ?? c.email
const emailSource = c.email_krs ? 'KRS' : emailField?.source ?? null
// similarly phone (cpf → clients.phone), website (KRS → cpf → clients)
```

Priority: `clients.{x}_krs` (КRS column) → `cpf[x]` active → `clients.{x}` cache (T2.1 sync mantains last 2).

### 1.2 "N źródeł" misnamed

Line 406:
```ts
const contactSourcesCount = [emailValue, phoneValue, websiteValue].filter(Boolean).length
```

**Це filled fields count, не sources** (max 3). T2.4.B should rename → "X uzupełnionych" або сумарний count методів після ccm готовий.

### 1.3 "+ Dodaj kontakt" button — anchor jump до людей

Line 787: `<SectionActionLink href={\`/clients/${id}#aktywnosc\`} />`

Це **anchor до Aktywność → Kontakty tab** де `<ClientContacts />` має dialog form з `name (REQUIRED) + phone + email + notes` → пише у **`contacts` table (decision-makers)**. НЕ firm methods.

### 1.4 Socials

`ContactSectionV2` рендерить fb/ig як окремі rows (lines 55-61), source hardcoded `'WWW'` для display (не з cpf).

---

## 2. `contacts` Table — підтверджено LUDZIE (no change)

Live sample 7 rows (повний dump):

| name | phone | email | client |
|---|---|---|---|
| Денис | +48538416857 | — | a (Ukrainian first name) |
| Андрій Харачко | +48788188399 | — | b |
| Дмитро Кірсанов | +48730938463 | — | c |
| Максим Бурдей | +48535324361 | Lemaxfirma@gmail.com | d |
| **Beata Kowalska** | +48734418702 | beata.kowalska@transgourmat.pl | e (Transgourmet) |
| **Jaroslaw Wodnicki** | +48662102695 | jaroslaw.wodnicki@transgourmet.pl | e (той же Transgourmet) |
| Олексій | +48 573 403 435 | kozak.strzelce.opolskie@gmail.com | f |

Schema `name TEXT NOT NULL` (migration 001:26). **100% decision-makers**. Multi-row на одного client уже працює (Transgourmet × 2).

**НЕ годиться для firm-level methods** (info@firma.pl без імені) — schema semantic clash.

---

## 3. Нова таблиця `client_contact_methods` — Recommend

### 3.1 SQL (з owner_id для consistency з clients/contacts RLS)

```sql
CREATE TABLE client_contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'email', 'phone', 'website', 'facebook', 'instagram', 'linkedin', 'other'
  )),
  value TEXT NOT NULL,
  label TEXT,                                     -- 'biuro', 'sprzedaż', 'kierownik', 'sklep Wrocław'
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL CHECK (source IN (
    'manual', 'KRS', 'WWW', 'website_scrape',
    'apify_gmaps', 'tavily_brand', 'migration_seed'
  )),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0
    CHECK (confidence BETWEEN 0 AND 1),
  notes TEXT,
  -- Sprint TYDZIEN2.T2.4 — owner_id zgodnie z clients/contacts pattern dla
  -- auth.uid() RLS. NOT NULL z DEFAULT auth.uid() bo seed/INSERT з UI
  -- pójdzie przez authenticated session.
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedupe at DB level — same (client, kind, value) cannot insert twice
CREATE UNIQUE INDEX ccm_unique_value
  ON client_contact_methods (client_id, kind, value);

-- Exactly 1 primary per (client, kind)
CREATE UNIQUE INDEX ccm_one_primary_per_kind
  ON client_contact_methods (client_id, kind)
  WHERE is_primary = TRUE;

CREATE INDEX ccm_client_idx ON client_contact_methods (client_id);
CREATE INDEX ccm_owner_idx ON client_contact_methods (owner_id);
```

### 3.2 Чи виправдана vs reuse `contacts` (name nullable)?

**Reuse — НЕ Recommend**:
1. Migration risky: `ALTER COLUMN name DROP NOT NULL` на production з 7 rows.
2. UI плутанина: "Beata Kowalska" + "biuro@firma.pl" в одній list.
3. Form fields differ — contacts has `notes`, methods needs `kind/label/is_primary/source`.

**Окрема таблиця — Recommend** (поділ ролей):
- `contacts` = люди (decision-makers, Vadym ввід вручну).
- `client_contact_methods` = firm methods (multi-email/phone з sources + manual).

### 3.3 Не extend `company_profile_fields`?

`cpf` has UNIQUE INDEX `cpf_target_field_active_uniq` (per `(client_id, field_key)` WHERE superseded_at IS NULL) — **ONE active row per field_key**. Multi-row destroys merge logic у `lib/profile/merge.ts:upsertField` (overwrite by priority assumes 1 active).

cpf = single canonical (для AI / re-score).
ccm = full list (для UI Kontakt).

---

## 4. Співіснування 3-х layers (з primary sync)

```
┌─────────────────────────────────────────────────────────────┐
│ clients.email/phone/website (single primary cache)          │
│ List + Edit form read here. T2.1 sync hook keeps in sync    │
│ з cpf (NULL-only policy). T2.4: BĘDZIE syncowany з ccm      │
│ is_primary=TRUE (новy sync direction).                       │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │
    T2.1 sync hook       │     T2.4 NEW: primary sync
    (cpf → clients)      │     (ccm.is_primary → clients.*)
                          │
┌─────────────────────────────────────────────────────────────┐
│ company_profile_fields                                       │
│ Append-only canonical. ONE active per (client, key).         │
│ Enrichment writes (KRS/GUS/WWW/Apify/website_scrape).        │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ Migration seed (T2.4.A one-shot)
                          │
┌─────────────────────────────────────────────────────────────┐
│ client_contact_methods (NEW T2.4)                            │
│ Multi-row per (client, kind). is_primary marks "main".      │
│ Manual + seeded з cpf + clients.*                            │
│ UI Kontakt reads list. Primary тоже syncuje до clients.*    │
│ (новy hook lib/contacts/sync-primary.ts).                    │
└─────────────────────────────────────────────────────────────┘
```

**Primary sync rule** (new T2.4):
- User INSERT ccm row з `is_primary=TRUE` (e.g. "to mój main email"):
  - UNIQUE INDEX `ccm_one_primary_per_kind` auto-clears previous primary (atomically? — actually requires explicit UPDATE first).
  - Then trigger / app-hook UPDATE `clients.email = value` (так як T2.1, але reverse direction — ccm → clients).
- User INSERT non-primary additional (e.g. "+ Dodaj email"):
  - clients.email НЕ zmienia.
  - cpf теж не touch.

**Read flow для Kontakt UI**:
1. Try `client_contact_methods` rows for client → group by kind, sort `is_primary DESC, created_at`.
2. Якщо empty (для свіжих clients без seed) → fallback do current `clients.{x}_krs ?? cpf[x] ?? clients.{x}` chain.

---

## 5. Seed Migration Plan (з explicit dedupe)

### 5.1 Live data (refreshed 28.05.2026)

| Source | Active rows |
|---|---:|
| clients total | **341** |
| clients.email filled | **246** |
| clients.phone filled | **254** |
| clients.website filled | **79** (was 13 — T2.1 sync дописав 56+!) |
| cpf[email] | 10 |
| cpf[phone] | 20 |
| cpf[website] | 78 |
| cpf[facebook_url] | 53 |
| cpf[instagram_url] | 24 |

### 5.2 Expected seed total (after dedupe)

| Kind | Unique (client_id, kind, value) | Notes |
|---|---:|---|
| email | **247** | clients.email + cpf.email merged |
| phone | **255** | clients.phone + cpf.phone merged |
| website | **82** | clients.website + cpf.website merged |
| facebook | **53** | cpf only (no clients.facebook_url col) |
| instagram | **24** | cpf only |
| **TOTAL** | **~661** | ≈ 1.9 methods per client |

### 5.3 Algorithm (scripts/seed-contact-methods.ts)

```ts
for each client in clients:
  candidates = []   // [{ kind, value, source }]

  // 1. KRS columns (highest trust → source='KRS', primary)
  if c.email_krs:    candidates.push({ kind:'email',   value:c.email_krs,    source:'KRS' })
  if c.website_krs:  candidates.push({ kind:'website', value:c.website_krs,  source:'KRS' })

  // 2. cpf actives (з оригінальним source tag)
  for cpf row WHERE client_id=c.id AND superseded_at IS NULL
              AND field_key IN ('email','phone','website','facebook_url','instagram_url'):
    candidates.push({ kind: kindFromField(cpf.field_key), value: cpf.value_text, source: cpf.source })

  // 3. clients.* denormalized (fallback як ще не seen — already може бути via T2.1 sync)
  if c.email && not seenValue('email', c.email):
    candidates.push({ kind:'email', value:c.email, source:'migration_seed' })
  if c.phone && not seenValue('phone', c.phone):
    candidates.push({ kind:'phone', value:c.phone, source:'migration_seed' })
  if c.website && not seenValue('website', c.website):
    candidates.push({ kind:'website', value:c.website, source:'migration_seed' })

  // 4. Dedupe: normalize email lowercase, phone strip non-digit, website lowercase+strip trailing slash
  candidates = dedupeByNormalizedValue(candidates)

  // 5. Mark first per kind as primary (KRS-source preferred якщо present)
  for each kind in groupBy(candidates, 'kind'):
    sortByPriority(rows)  // KRS=10 > GUS=9 > ... > migration_seed=5
    rows[0].is_primary = TRUE

  INSERT INTO client_contact_methods (..., owner_id = c.owner_id)
    ON CONFLICT (client_id, kind, value) DO NOTHING
```

### 5.4 Idempotency + dry-run

- `ON CONFLICT DO NOTHING` через UNIQUE INDEX — safe re-run.
- `--apply` flag (mirror T2.1 backfill pattern).
- Dry-run print: per-kind candidate count, conflicts, primary picks (sample 5).
- Conflict log → `tmp/ccm-seed-conflicts.md` для manual review.

---

## 6. RLS — auth.uid=owner_id pattern (Recommend)

### 6.1 Чому НЕ як orders (service-role only)

T2.2 BUGFIX показав friction: orders RLS=service-only змусив admin client на `/clients/[id]`. Кожна нова table що читається з UI потребувала admin → bloat. **Avoid this pattern для нових tables.**

### 6.2 Чому як clients (auth.uid=owner_id)

Vadym = single user, `clients.owner_id = auth.uid()`. ccm зберігає `owner_id` як FK на `auth.users(id)`, RLS:

```sql
ALTER TABLE client_contact_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccm_select_own" ON client_contact_methods
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "ccm_insert_own" ON client_contact_methods
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "ccm_update_own" ON client_contact_methods
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "ccm_delete_own" ON client_contact_methods
  FOR DELETE USING (auth.uid() = owner_id);
```

**owner_id колонка потрібна** — consistent з clients/contacts schema. Server actions роблять INSERT з `owner_id = (await supabase.auth.getUser()).data.user.id`. Anon `supabase` (cookie session) бачить свої rows. **Adminless.**

Альтернатива (без owner_id): RLS через JOIN до clients:
```sql
USING (EXISTS(SELECT 1 FROM clients c WHERE c.id = client_contact_methods.client_id AND c.owner_id = auth.uid()))
```
Це працює, але **slower** (JOIN на each row), edge case коли clients deleted concurrently. **NIE Recommend.**

### 6.3 Seed — owner_id з clients.owner_id

```ts
INSERT INTO client_contact_methods (
  client_id, kind, value, label, is_primary, source, owner_id
)
SELECT
  c.id, ..., ..., ..., ..., ..., c.owner_id  // ← copy z parent client
FROM clients c, ...
```

---

## 7. UI План (UI-first)

### 7.1 Layout — `ContactSectionV3` (replace V2)

```
┌─ Kontakt ─────────────────── 2 email · 2 telefony · 1 website · 2 social ─┐
│                                                                            │
│ 📧 Email                                          + Dodaj email           │
│   ⭐ kontakt@maczfit.pl       [KRS]                       ✏ 🗑          │
│      biuro@maczfit.pl         [website_scrape] biuro      ✏ 🗑          │
│                                                                            │
│ 📞 Telefon                                        + Dodaj telefon          │
│   ⭐ +48 504 125 279          [Apify]                     ✏ 🗑          │
│      +48 22 555 12 34         [manual]  sklep WAW         ✏ 🗑          │
│                                                                            │
│ 🌐 Website                                        + Dodaj website          │
│   ⭐ https://maczfit.pl       [KRS]                       ✏ 🗑          │
│                                                                            │
│ 🔗 Social                                         + Dodaj link             │
│      facebook.com/maczfit     [WWW]                       ✏ 🗑          │
│      instagram.com/maczfit    [WWW]                       ✏ 🗑          │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Inline form (not modal)

"+ Dodaj email" expands inline:
```
┌─ Nowy email ─────────────────────┐
│ [_____________________]          │
│ Label (opt): [biuro________]    │
│ [ ] Ustaw jako podstawowy        │
│ [Zapisz] [Anuluj]                │
└──────────────────────────────────┘
```

Edit — hover row → pencil icon → inline edit (same fields). Delete — confirm dialog.

⭐ click toggles primary (server action `setPrimary(id)` — atomic: clears previous primary u тій же kind, sets new, sync clients.{kind}).

### 7.3 Розділення "люди vs методи"

| Section | Source | Form |
|---|---|---|
| **Kontakt** (firm methods) | `client_contact_methods` | inline per-kind add |
| **Osoby kontaktowe** (decision-makers) | `contacts` | dialog (existing `ClientContacts`) |

Перейменування у `<AccordionSection id="aktywnosc">` tab `"Kontakty"` → **`"Osoby kontaktowe"`** для clarity.

Перейменування `<SectionActionLink label="+ Dodaj kontakt" />` у Kontakt accordion → **`"+ Dodaj sposób kontaktu"`** + redirect до новий inline form у ContactSectionV3 (НЕ до `#aktywnosc`).

### 7.4 Primary sync назад у clients.* (для list)

**Yes, recommend.** Чому:
- List `/clients` рендерить `c.email`, `c.phone`, `c.website` directly (per audit T2.0). НЕ читає ccm.
- Якщо ccm.is_primary змінюється → потрібно update clients.{kind} щоб list reflects.
- Інакше: 246 emails у list — stale, не reflects ccm primary toggle.

**Implementation** (Phase 1): server action `setPrimary(ccm_id)`:
1. UPDATE ccm clear previous primary (one query).
2. UPDATE new ccm.is_primary=TRUE.
3. UPDATE clients.{kind} = new.value WHERE id = ccm.client_id.

Phase 2 (post T2.4): DB trigger `ON UPDATE OF is_primary ON client_contact_methods` → sync. Cleaner але PostgreSQL trigger debugging harder. Defer.

---

## 8. Recommend Scope — Split на 3 sub-sprints

### Порівняння single-ship vs split

| Aspect | Single ship (all-in-one) | Split A→B→C |
|---|---|---|
| Lines changed | ~800 | A=~150, B=~250, C=~250 |
| Risk surface | High (DB+UI+writes у одному deploy) | Lower per step |
| Rollback granularity | Coarse | Per step |
| Verifiability | Hard (must test всё) | Per step REST + UI checks |
| Time to ship | Single ~3-4h | A=45m, B=60m, C=90m |
| Vadym checkpoints | 1 (final) | 3 (after each) |

**Recommend SPLIT** — same pattern як T2.1 (sync hook + backfill окремо). Працює.

### 8.1 T2.4.A — Migration + Seed (DB only)

| Step | Subject |
|---|---|
| 1A | `scripts/074_client_contact_methods.sql` migration з RLS policies + 3 indexes + owner_id FK |
| 1B | `scripts/seed-contact-methods.ts` з dedupe + dry-run + --apply |
| 1C | REST verify: ccm row count per client > 0, conflicts logged |

**Risk**: M (DB schema change, 660+ INSERT). **Verify by**: SELECT count(*) ccm per client.

### 8.2 T2.4.B — Read-only ContactSectionV3 (UI display)

| Step | Subject |
|---|---|
| 2A | server fetch ccm на `/clients/[id]` (group by kind, sort is_primary DESC) |
| 2B | `components/clients/contact-section-v3.tsx` (read-only, group, badges, ⭐) |
| 2C | Swap V2 → V3 у page.tsx, fallback: якщо ccm empty (orphan client) → render V2 chain |

**Risk**: L (no writes, fallback graceful). **Verify by**: Vadym opens FRESH MEALS — бачить email + phone + socials з ccm seed.

### 8.3 T2.4.C — Write actions (add/edit/delete/setPrimary)

| Step | Subject |
|---|---|
| 3A | `app/actions/contact-methods.ts` server actions з owner_id auth check + ccm INSERT/UPDATE/DELETE |
| 3B | setPrimary action — atomic 3-query (clear prev + set new + sync clients.{kind}) |
| 3C | `components/clients/contact-method-form.tsx` inline form (kind-specific input type + label + primary toggle) |
| 3D | Wire edit/delete/star toggles до actions з optimistic updates |
| 3E | Rename "+ Dodaj kontakt" → "+ Dodaj sposób kontaktu"; tab "Kontakty" → "Osoby kontaktowe" |

**Risk**: M (server actions + RLS + atomic transactions). **Verify by**: Vadym додає "biuro@maczfit.pl" як 2-й email на FRESH MEALS → бачить у списку, primary не зміняється, clients.email lишається `kontakt@maczfit.pl`. Потім toggle ⭐ → clients.email syncuje до biuro@.

---

## 9. Files preview

| File | Sprint | Type |
|---|---|---|
| `scripts/074_client_contact_methods.sql` | T2.4.A | NEW migration |
| `scripts/seed-contact-methods.ts` | T2.4.A | NEW untracked |
| `lib/types.ts` | T2.4.B | extend з `ContactMethod` type |
| `app/(dashboard)/clients/[id]/page.tsx` | T2.4.B | fetch ccm + pass props |
| `components/clients/contact-section-v3.tsx` | T2.4.B | NEW |
| `app/actions/contact-methods.ts` | T2.4.C | NEW server actions |
| `components/clients/contact-method-form.tsx` | T2.4.C | NEW inline form |
| `components/clients/contact-section-v2.tsx` | T2.4.C+1 | DELETE post-verify |

Total: ~7 файлів touched, 2 NEW migrations/scripts, 1 deletion deferred.

---

## 10. Decision points перед GO T2.4.A

1. **Confirm split** A→B→C? Recommend yes.
2. **owner_id колонка** у ccm? Recommend yes (consistent з clients/contacts pattern, simpler RLS, lower JOIN cost).
3. **Migration number** — наступне 074 (after 073 reserved/skipped? grep:** 072 is last, тож 073 next, але я бачив 073 не існує). Reserve 073 для ccm.
4. **`other` kind** у CHECK constraint — keep (WhatsApp/Telegram future). Low cost.
5. **`label` enum vs free-text** — free-text. Recommend free-text (диверсні business cases).
6. **Primary sync до clients.*** — yes (для list freshness). Phase 1 = server action, Phase 2 = DB trigger (defer).
7. **Manual ccm INSERT → також writes у cpf?** Recommend NO Phase 1. ccm okrema layer.
8. **Migration on Pro tier 28.05 — clients grew 331→341 — будь-яких extra concerns?** No, seed iterates poprzez current clients.

---

**STOP — audit complete v2. ZERO writes.** Чекаю GO на T2.4.A (migration + seed) або уточнень.

---

## Appendix: Diff vs v1 (audit-tydzien2-t2-4-step0-multicontact.md)

| Topic | v1 | v2 |
|---|---|---|
| Live counts | clients=331, expected ~600 | clients=341, expected **661** |
| clients.website filled | 13 | **79** (T2.1 backfill effect) |
| RLS owner_id | not explicit | **Recommended explicit owner_id FK** |
| Primary sync to clients.* | optional defer | **Recommended Phase 1 у setPrimary action** |
| Dedupe algorithm | rough | **Explicit normalize step** (email lowercase, phone strip non-digit) |
| Migration number | 073 hint | 074 (073 reserved/grep clean) |
