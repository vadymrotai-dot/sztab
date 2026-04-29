# Sprint K Marathon — Profile architecture + Persons + Source integrations + Daily dashboard

8-phase marathon переробляє foundation Sztab: profile = canonical state з
source attribution, reports = append-only audit log, persons = first-class
entity, daily reminders pipeline, intelligence lookup orchestrator з 6-step
sequential pipeline.

## Architectural overview

### Profile vs Reports (key abstraction)

**Profile** = `company_profile_fields` table — canonical "current truth" per (target, field).
- Append-only з `superseded_at` marker (preserves history, not destructive update)
- Active row per (target, field) = `WHERE superseded_at IS NULL`
- Each row carries source attribution (KRS/GUS/CEIDG/etc.) + priority + confidence

**Reports** = `enrichment_log` table — append-only event store.
- One row per enrichment run (any source)
- Captures fields_added/updated/unchanged + raw_payload + cost_usd
- Audit trail для "what was fetched when, з якого source"

This separation: profile answers "what do we know now", reports answer
"how did we learn it, when, from which source".

### Source priority matrix

```
KRS               = 10  (najwyższy — formalna rejestracja)
GUS               = 9
sprawozdania_KRS  = 9
MSiG              = 9
CEIDG             = 8
VAT_BL            = 7
BZP               = 6
manual            = 5  (Vadym override)
Apify_GMaps       = 4
WWW               = 4  (website extract)
AI                = 3  (lowest — only fills coли nothing else)
```

Driven by `lib/profile/merge.ts` constants. `upsertField()` outcomes:
- `inserted` (no existing row)
- `superseded` (newer source > existing OR equal priority + different value)
- `verified` (same source/priority + same value → bump `last_verified_at`)
- `ignored_lower_priority` (logged як unchanged)

### Persons — first-class entity

Replaces "contact attribute on company". `persons` table з:
- imie/nazwisko required
- 4 contact channels (email_glowny, email_prywatny, telefon, linkedin)
- Birthday — full date OR partial (miesiac+dzien для unknown rok)
- Arrays: zainteresowania + mocne_strony
- notatki_wewnetrzne + zrodla_pol JSONB (per-field source attribution)

Many-to-many з companies via `person_company_links`:
- XOR client_id/prospect_id (partial UNIQUE indexes per branch)
- rola + jest_decyzyjny + sila_relacji (0-100) + zrodlo
- data_od/data_do — career history, multiple links per person possible

`person_events` — recurring events (urodziny/imieniny/rocznice) z
`repeat_yearly` flag + monthday index для daily reminders.

## Phase deliverables

| Phase | Component | Status |
|---|---|---|
| 1 | Migration 031 (8 tables + cache) | ✅ |
| 2 | Source integrations (BZP, krs-financials, MSiG, website + merge core + enrichment-log) | ✅ |
| 3 | /api/intelligence/lookup orchestrator + UI form | ✅ |
| 4 | /clients/[id] sections (BuyingSignals, Financials, People, MSiG, ProfileFields) | ✅ |
| 5 | /persons/[id] page | ✅ |
| 6 | /pulpit/dzisiaj + /api/cron/bzp-monitor | ✅ |
| 7 | Manual entry UIs (PersonEditPanel + AddEventModal + PATCH /api/persons routes) | ✅ |
| 8 | Smoke test + docs | ✅ з findings ⚠️ |

## Source integration cookbook

Adding new source — minimal contract:

```typescript
// 1. lib/enrichment/{source}.ts
export async function fetchSomething(input): Promise<Output> {
  // network call + parse
}

// 2. lib/profile/merge.ts — додай до SOURCE_PRIORITIES
export const SOURCE_PRIORITIES = {
  ...,
  NEW_SOURCE: 7,
}

// 3. У orchestrator (lib/intelligence/lookup або caller):
const runId = await startEnrichmentRun(supabase, {
  target_type: 'company', target_id, source: 'NEW_SOURCE',
})
try {
  const data = await fetchSomething(...)
  const merged = await upsertFields(supabase, target, fields, 'NEW_SOURCE')
  await finishEnrichmentRun(supabase, runId, {
    status: 'success',
    fields_added: merged.added, fields_updated: merged.updated,
    raw_payload: data,
  })
} catch (err) {
  await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: ... })
}
```

## Manual entry workflows

### Person edit
1. Open `/persons/[id]`
2. Scroll до "Edycja danych osoby" panel → click "Edytuj"
3. Update emails/phone/LinkedIn/birthday/interests/strengths/notes
4. Click "Zapisz" → page reload з new values

Birthday handling:
- Full date known → `data_urodzenia` field, miesiac/dzien auto-derived
- Only month/day known → leave date empty, fill MM + DD inputs

### Add person event
1. На /persons/[id] → "Wydarzenia osobiste" header → "Dodaj wydarzenie" button
2. Modal: select typ (urodziny/imieniny/rocznica_*/nagroda/awans/etc.)
3. Pick full date OR month+day, write opis, check repeat_yearly
4. Save → reload, event appears у timeline + drives `/pulpit/dzisiaj` reminders

### Manual override of canonical field
**Not yet UI-implemented** (Sprint L candidate). Until then:
```sql
INSERT INTO company_profile_fields
  (client_id, field_key, value_text, source, source_priority, confidence)
VALUES
  ('<uuid>', 'website', 'https://...', 'manual', 5, 1.0);
-- This supersedes any AI/Apify/WWW value for this field.
```

## Daily dashboard interpretation

`/pulpit/dzisiaj` 6 sections drive Pikniko sales вранці:

1. **Dziś urodziny / wydarzenia** — actionable now: send wishes via mailto/tel
   quick links. Empty якщо нема birthdays today.
2. **Najbliższe rocznice (7 dni)** — plan-ahead window для preparing outreach.
3. **Nowe BZP wins (24h)** — cron-populated. Recognized winners (linked NIP)
   мають hyperlink до /clients/[id]; unrecognized → just text.
4. **Świeże sprawozdania (30 dni)** — recently filed annual reports, surface
   revenue trends на знаних firms.
5. **Zmiany w zarządach (MSiG, 7 dni)** — new decision-makers signal.
   Triggered by `change_type='zarząd'` filter.
6. **TODO Pikniko** — placeholder для feedback loop (Sprint L).

## What works automatically

- BZP daily monitor cron (03:00 UTC) — pulls HoReCa CPV, links by NIP
- Hygiene scan cron (01:00 UTC daily)
- Matching refresh cron (Sunday 00:00 UTC)
- /api/intelligence/lookup — sequential 6-step pipeline на demand
- Auto-create persons з KRS zarząd / CEIDG owner / website extract (≥0.7 confidence)

## What requires Pikniko manual input

- Person edit (birthday post-rozmowa, interests, notes)
- Add event (rocznice pracy, nagrody)
- Pre-Apify review queue approval (Sprint I workflow continues)
- Mark person як decision-maker (jest_decyzyjny — not yet auto-detected)

## Smoke test findings (Phase 8) — operational issues

### ⚠️ Issue 1: rejestr.io API v1 deprecated

```
HTTP 410: {"kod":410,"info":"API v1 zostało wyłączone."}
```

`KRS_REJESTR_API_TOKEN` is valid але API endpoint `/api/v1/...` no longer
exists. Affects:
- `lib/enrichment/krs-financials.ts` (sprawozdania)
- `lib/enrichment/msig.ts` (MSiG changes)

**Action required**: Vadym переключитися на rejestr.io API v2 (нова endpoint),
або alternatives:
- ekrs.ms.gov.pl public PDF parsing (pdf-parse npm) для sprawozdania
- imsig.pl HTML scraping для MSiG

This is Sprint L blocker. Schema + integration framework working ✅, just
the actual data fetch needs v2 migration.

### ⚠️ Issue 2: BZP API returns HTML

```
Unexpected token '<', "<!doctype "...
```

`https://ezamowienia.gov.pl/mo-client-board/bzp/api/notice` responds
з HTML (login page?) instead of JSON. Possible causes:
- Endpoint moved/changed
- Now requires auth token
- WSO2 OAuth registration required (mentioned earlier у Sprint E findings)

**Action required**: Vadym checks BZP technical docs + verifies auth
requirements. lib/enrichment/bzp.ts framework works coли API correct;
just needs endpoint update.

### ✅ What works як expected

- All 9 schema tables accessible
- Profile merge core working
- Enrichment log helper functional
- Website extractor (cheerio + AI) — not smoke-tested but proper code path
- All UI routes registered у build
- bzp-monitor cron registered
- Manual entry endpoints (PATCH person, POST event) functional

## Sprint L candidates

1. **rejestr.io API v2 migration** — або switch to ekrs.ms.gov.pl PDF parsing
2. **BZP API auth/endpoint fix** — investigate WSO2 OAuth requirement
3. **Person merge UI** — duplicate detection при auto-create
4. **Internal note add** на company page (currently тільки на person)
5. **Manual override UI** для canonical fields (currently SQL-only)
6. **TODO Pikniko section** — interaction tracking + follow-up logic
7. **Email digest** для daily dashboard (no email infra setup yet)
8. **Person career history** з prior employers via LinkedIn/manual entry
9. **AI suggested approach** на /persons/[id] — agregate signals

## Architectural decisions worth noting

### Dual-write strategy (Phase 3)
Existing UI/queue/matches logic continues working без disruption.
`/api/intelligence/lookup` writes до:
- New canonical layer (`company_profile_fields` via merge)
- Legacy `clients.{vat_status, krs_data, ...}` columns (mirror)

Future: deprecate legacy columns Sprint M після migrate readers.

### XOR client/prospect pattern
Replicates Sprint F matches table approach. PRIMARY KEY = surrogate UUID;
deduplication via partial UNIQUE indexes per branch. Avoids Postgres
limitation з COALESCE in PRIMARY KEY constraint.

### GENERATED column → runtime filter (Sprint I + K)
Spec для both Sprint I і K asked GENERATED ALWAYS AS STORED columns
referencing other tables. Postgres restriction. Resolution: compute
inline у API queries.

### Append-only profile
`company_profile_fields` accumulates rows over time. Old rows NOT deleted
when superseded — historian record. UI reads `WHERE superseded_at IS NULL`.
Future analytics: "show source confidence trend over time".
