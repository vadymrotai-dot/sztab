# Sprint S6D-Week1 — Two-Track Foundation (REWRITTEN v5)

**Дата:** 2026-05-10
**Status:** Sprint specification. NO code yet — read full prompt + v5 proposal перед стартом.
**Predecessor:** v5 proposal (`cowork-analysis-data-sources-proposal-v5.md`)
**Goal:** Wire AI client_type classification → Pyszne/Wolt/krs-fullnames (gastronomia track) → Manual asortyment foundation (hurtownia track) → Conditional UI rendering.

**End state:** `/clients/{id}` shows different sections based on classified type. Test set 6 clients fully enriched з real menu/ingredients (gastronomia) OR uploaded cennik (hurtownia).

**ETA:** 6 days

**Test set (Vadym confirms before sprint start):**
- **Continental** (sp. z o.o., Warszawa) — gastronomia/restauracja
- **Domek Sushi** (sp. z o.o., Warszawa) — gastronomia/restauracja sushi
- **KOZAK OLEK** (JDG, Kraków) — gastronomia/kebabnia
- **SOLERA** (sp. z o.o.) — hurtownia/spożywcza_b2b
- **2 нові kebabnie з Krakowa** — Cowork SQL filter знаходить через ceidg_prospects WHERE pkd_main='5611Z' OR pkd_main='5610A' AND city='Kraków' LIMIT 2

---

## STEP 0 — Sanity check (MANDATORY)

Перш ніж писати код, **READ** Protocol 1 + 35:

1. `docs/sztab-state.md` — поточний state
2. `docs/sztab-protocols.md` — всі 36 protocols
3. `docs/cowork-analysis-data-sources-proposal-v5.md` — full proposal context
4. `lib/enrichment/apify.ts` — existing Apify pattern
5. `lib/ai/business-analysis.ts` — EXISTING `BusinessProfile` interface (we extend, not create new)
6. `app/api/intelligence/lookup/route.ts` — Phase B orchestrator (6 steps + after())
7. `app/(dashboard)/clients/[id]/page.tsx` — current UI structure (8 accordion sections)
8. `scripts/060_cohorts_foundation.sql` ... `scripts/063_ua_founders_signal.sql` — recent migration pattern
9. Migration 003 — `suppliers` table schema (5 seeds: CzM, Mod-loszka, Karol, Gmurczyk, Pikniko)

**Якщо чогось не знайшов** — REPORT, не вигадуй. Особливо:
- Verify `clients.business_profile` JSONB column existуючий (migration 033)
- Verify `clients.menu_data` чи `contact_enrichment.menu_data` — read schema
- Verify Vercel Pro upgrade зроблено (maxDuration=300s available)

**Confirm before proceeding:**
- Working tree clean (`git status`)
- Last migration number у `scripts/` (наступна = 064)
- Apify API token у `.env.local` (Vadym verifies)
- ANTHROPIC_API_KEY у `.env.local`

---

## DAY 0 — PKD 2025 mapping + sanity (~2 hours)

### 0.1 Migration 064 — PKD 2007→2025 mapping + horeca fit

**File:** `scripts/064_pkd_2025_mapping.sql`

Schema див. v5 §3.3.

**Vadym executes:**
```bash
supabase db push (Vadym у PowerShell, NOT Cowork)
```

### 0.2 Add SpoonJoy seed (missing з migration 003)

**File:** `scripts/064a_spoonjoy_seed.sql`

```sql
INSERT INTO suppliers (
  id, owner_id, name, legal_name, type, deal_type,
  verticals, country
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM auth.users LIMIT 1),  -- Vadym TBD real user id
  'SpoonJoy',
  'SpoonJoy Sp. z o.o.',  -- Vadym confirms
  'producent',
  'agent',
  ARRAY['miod','syrupy','ložeczki']::text[],
  'PL'
)
ON CONFLICT DO NOTHING;
```

⚠️ **Verify with Vadym:** is SpoonJoy actually existуючий supplier у DB? Якщо ні — створити. Якщо так — skip seed.

### 0.3 Create `lib/pkd/mapping-2007-2025.ts`

```typescript
// lib/pkd/mapping-2007-2025.ts
// Sprint S6D Day 0 — PKD 2007 → PKD 2025 mapping + HoReCa fit scoring.

export const PKD_2007_TO_2025: Record<string, string> = {
  '56.10.A': '56.11.Z',
  '56.10.B': '56.12.Z',
  // ... rest from v5 §3.3 seed table
}

export const PKD_HORECA_FIT: Record<string, { score: number; category: string }> = {
  '56.11.Z': { score: 9, category: 'restaurant' },
  '56.12.Z': { score: 3, category: 'food_service' },
  '55.10.Z': { score: 9, category: 'hotel' },
  '47.23.Z': { score: 10, category: 'retail' },
  // ... rest
}

export function normalizeToPkd2025(code: string): string {
  return PKD_2007_TO_2025[code] ?? code  // unchanged if no mapping
}

export function getHorecaFitScore(code: string): number {
  const normalized = normalizeToPkd2025(code)
  return PKD_HORECA_FIT[normalized]?.score ?? 0
}

export function getHorecaCategory(code: string): string {
  const normalized = normalizeToPkd2025(code)
  return PKD_HORECA_FIT[normalized]?.category ?? 'other'
}
```

---

## DAY 1 — AI Client Classification (extend, not orphan)

### 1.1 Extend `BusinessProfile` interface

**File:** `lib/ai/business-analysis.ts` (existing — EDIT, not replace)

Add 4 fields до `BusinessProfile`:

```typescript
export interface BusinessProfile {
  // ... existing fields:
  business_format: 'single_store' | 'chain' | 'franchise' | 'online' |
                   'B2B_distributor' | 'gastronomy' | 'manufacturer' |
                   'service' | 'other'
  estimated_locations: number | null
  product_categories_pl: string[]
  // ... existing
  
  // NEW v5 fields:
  client_type: ClientType
  client_subtype: string  // e.g. 'kebabnia', 'spożywcza_b2b'
  classification_confidence: number  // 0-100
  classification_reasoning_pl: string
}

export type ClientType =
  | 'gastronomia'
  | 'hurtownia'
  | 'sklep_detal'
  | 'catering'
  | 'hotel'
  | 'instytucja'
  | 'production'
  | 'sieci_handlowe'
  | 'inne'
```

### 1.2 Enhance system prompt

Append до existing `analyzeBusinessProfile` SYSTEM_PROMPT:

```
DODATKOWE ZADANIE — KLASYFIKACJA TYPU KLIENTA:

Po określeniu business_format, dodaj klasyfikację:

client_type — wybierz JEDEN z:
- gastronomia (restauracja, kebabnia, bar mleczny, kawiarnia, fast food, hotel restauracja, catering imprezowy)
- hurtownia (B2B distributor, np. SOLERA, Makro, Selgros)
- sklep_detal (delikatesy, sklep mięsny/rybny/spożywczy z 1-5 lokalizacjami)
- catering (kontraktowy, instytucjonalny — szkolny, szpitalny, korporacyjny)
- hotel (hotele, pensjonaty, agroturystyki — focus on F&B)
- instytucja (szpital, szkoła, dom pomocy, urząd)
- production (producent — mięsny, rybny, mleczarnia, piekarnia przemysłowa)
- sieci_handlowe (retail chain >5 lokalizacji — Biedronka, Lewiatan, Żabka)
- inne (gdy nic nie pasuje)

DECISION RULES:
- Jeśli firma sells B2B do HoReCa lub do sklepów → hurtownia
- Jeśli firma sells direct B2C through stores >5 lokalizacji → sieci_handlowe
- Jeśli firma sells direct B2C through 1-5 stores → sklep_detal
- Jeśli PKD 5611Z/5612Z/5621Z/5630Z → gastronomia
- Jeśli PKD 5510Z/5520Z → hotel
- Jeśli PKD 4631Z/4632Z/4638Z/4639Z → hurtownia

client_subtype — string (free text, np. 'kebabnia', 'spożywcza_b2b', 'cash_carry')

classification_confidence — 0-100:
- 90+: однозначна (PKD jasno wskazuje, nazwa potwierdza)
- 70-89: wysoka (większość sygnałów pasuje)
- 50-69: średnia (niektóre sygnały sprzeczne)
- <50: niska (mało danych, podpowiedź ogólna)

classification_reasoning_pl: krótki tekst 1-2 zdania uzasadnienia.
```

### 1.3 Update output JSON schema у Anthropic call

Add new fields до expected output structure.

### 1.4 Migration 064b — `clients.client_type` derived column (optional)

**Decision:** **SKIP** for now — query через `business_profile->>'client_type'` works. Add explicit column тільки якщо Vadym потребує index for fast filtering у `/clients` page (Sprint S6E).

### 1.5 Backfill script

**File:** `scripts/backfill-client-classification.ts`

```typescript
// Sprint S6D Day 1 — backfill existing clients with client_type classification.
// Loops через всі clients WHERE business_profile->>'client_type' IS NULL.
// Якщо business_profile вже existуючий → derive client_type з business_format mapping.
// Якщо business_profile null → run full AI Business Analysis.

import { createClient } from '@supabase/supabase-js'
import { analyzeBusinessProfile } from '@/lib/ai/business-analysis'

const BUSINESS_FORMAT_TO_CLIENT_TYPE: Record<string, ClientType> = {
  'gastronomy': 'gastronomia',
  'B2B_distributor': 'hurtownia',
  'manufacturer': 'production',
  'chain': 'sieci_handlowe',  // refine if location count <5 → sklep_detal
  'franchise': 'sieci_handlowe',
  'single_store': 'sklep_detal',
  'online': 'sklep_detal',
  'service': 'inne',
  'other': 'inne',
}

async function main() {
  const supabase = createClient(/* service role */)
  
  const { data: clients } = await supabase
    .from('clients')
    .select('id, nip, name, business_profile')
    .filter('business_profile->>client_type', 'is', null)
  
  let derived = 0, llmCalls = 0, failed = 0
  
  for (const client of clients ?? []) {
    if (client.business_profile?.business_format) {
      // Path A: derive
      const clientType = BUSINESS_FORMAT_TO_CLIENT_TYPE[client.business_profile.business_format] ?? 'inne'
      await supabase.from('clients').update({
        business_profile: {
          ...client.business_profile,
          client_type: clientType,
          client_subtype: '',
          classification_confidence: 75,  // derived = medium confidence
          classification_reasoning_pl: `Derived from business_format='${client.business_profile.business_format}' (legacy)`,
        },
      }).eq('id', client.id)
      derived++
    } else {
      // Path B: run AI Business Analysis
      try {
        const result = await analyzeBusinessProfile({ /* ... */ })
        await supabase.from('clients').update({ business_profile: result }).eq('id', client.id)
        llmCalls++
      } catch (err) {
        console.error(`[backfill] ${client.nip} failed:`, err)
        failed++
      }
    }
  }
  
  console.log(`Done. Derived: ${derived}, LLM calls: ${llmCalls}, Failed: ${failed}`)
}
```

**Vadym executes:**
```bash
pnpm tsx scripts/backfill-client-classification.ts
```

**Cost estimate:** 264 clients, 50% з existуючим business_profile → 132 derived (free) + 132 LLM × $0.01 = ~$1.50.

### 1.6 UI — type badge + manual override

**Edit:** `app/(dashboard)/clients/[id]/page.tsx`

Hero row — add badge:

```tsx
const clientTypeLabel = {
  gastronomia: '🍔 Gastronomia',
  hurtownia: '📦 Hurtownia',
  sklep_detal: '🏪 Sklep detaliczny',
  catering: '🥗 Catering',
  hotel: '🏨 Hotel',
  instytucja: '🏛 Instytucja',
  production: '🏭 Producent',
  sieci_handlowe: '🛒 Sieci handlowe',
  inne: '📋 Inne',
}[c.business_profile?.client_type] ?? '❓ Nie sklasyfikowany'

<Badge variant="outline">
  {clientTypeLabel}
  {c.business_profile?.classification_confidence < 70 && (
    <span title="Niska pewność klasyfikacji" className="ml-1 text-yellow-600">⚠️</span>
  )}
</Badge>
```

**Manual override** через `ClientDetailActions` — add submenu "Zmień typ klasyfikacji →" з 9 options.

**Server action:** `app/clients/[id]/actions/override-classification.ts`:

```typescript
'use server'

export async function overrideClassification(
  clientId: string,
  newType: ClientType,
  newSubtype?: string,
) {
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('clients')
    .select('business_profile')
    .eq('id', clientId)
    .single()
  
  await supabase.from('clients').update({
    business_profile: {
      ...existing?.business_profile,
      client_type: newType,
      client_subtype: newSubtype ?? '',
      classification_confidence: 100,  // manual = certain
      classification_reasoning_pl: 'Ręczna nadpisana klasyfikacja przez Vadym',
    },
  }).eq('id', clientId)
  
  revalidatePath(`/clients/${clientId}`)
}
```

### 1.7 Smoke test

After Day 1:
- Run backfill script
- Open `/clients/{Continental_id}` → expect "🍔 Gastronomia" badge
- Open `/clients/{SOLERA_id}` → expect "📦 Hurtownia" badge
- Try manual override на 1 test client → verify saved

**REPORT to Vadym:** count classified / failed / low-confidence з backfill output.

---

## DAY 2 — Pyszne + Wolt + krs-fullnames (parallel) (Day 2 full)

**Pattern:** mirror existing `lib/enrichment/apify.ts` (Sprint H pattern). Same rate limit, retry, similarity matching logic.

### 2.1 `lib/enrichment/pyszne.ts`

Spec same as v4 §STEP 2. Actor: `easyapi/just-eat-restaurant-menu-scraper`.

### 2.2 `lib/enrichment/wolt.ts`

Spec same as v4 §STEP 3. Actor: `needy_hammock/wolt-restaurant-menu-scraper` ($0.80/1k).

### 2.3 `lib/enrichment/krs-fullnames.ts`

Spec same as v4 §STEP 5. Actor: `regdata/krs-fullnames-scraper`.

### 2.4 Wire to Phase B

**Edit:** `app/api/intelligence/lookup/route.ts`

Add three calls — krs-fullnames у Phase B step 4 (people extraction), Pyszne+Wolt у new Phase B step 5.5 (menu scrape conditional on `client_type === 'gastronomia'`).

### 2.5 Smoke tests

```bash
pnpm tsx scripts/smoke-test-pyszne.ts {nip_continental}
pnpm tsx scripts/smoke-test-wolt.ts {nip_continental}
pnpm tsx scripts/smoke-test-krs-fullnames.ts {nip_solera}
```

Verify:
- Pyszne returns dishes для Continental + Domek Sushi + 2 kebabnie
- Wolt overlap (cross-coverage)
- krs-fullnames returns real director names для SOLERA, Continental

---

## DAY 3 — Ingredients pipeline (gastronomia track)

### 3.1 Migration 067 — `product_mappings`

Schema див. v5 §3.6.

### 3.2 `lib/dish-lexicon.ts`

Hardcoded ~300 canonical Polish dishes. Initial seed list див. v4 STEP 4.1 spec. Vadym розширюватиме у Sprint S6E через admin UI (defer).

### 3.3 `lib/ai/ingredients.ts`

Spec див. v4 STEP 4.2. Hybrid: dish_lexicon lookup → Haiku → Sonnet escalation для confidence < 0.7.

### 3.4 `lib/matching/ingredient-match.ts`

Spec див. v4 STEP 6.2. Per-supplier match score computation.

### 3.5 UI — `MenuIngredientsSection`

**File:** `components/clients/menu-ingredients-section.tsx`

Tag cloud + per-supplier match table. Conditional render тільки для `client_type === 'gastronomia'`.

Conditional у `/clients/{id}/page.tsx`:

```tsx
{c.business_profile?.client_type === 'gastronomia' && (
  <AccordionSection title="Menu + Asortyment z menu" defaultOpen>
    <MenuIngredientsSection clientId={c.id} menuData={c.menu_data} />
  </AccordionSection>
)}
```

### 3.6 Smoke test

Run на Continental + Domek Sushi + KOZAK OLEK + 2 kebabnie. Verify:
- Pyszne dishes scraped
- Ingredients extracted (canonical hits + LLM fallback)
- Per-supplier match table populated
- Cost report (actual $ spent)

---

## DAY 4 — Asortyment foundation (hurtownia track)

### 4.1 Migration 065 — `imported_assortment`

Schema див. v5 §3.4.

### 4.2 Migration 066 — `imported_assortment_items`

Schema див. v5 §3.5.

### 4.3 Supabase Storage bucket setup

**Vadym executes у Supabase Dashboard:**
1. Create bucket `cenniki` (private)
2. Add RLS policy: `auth.uid() IS NOT NULL` (authenticated users can upload)
3. Add RLS policy: `auth.uid() IS NOT NULL` for SELECT

### 4.4 Server action — signed upload URL

**File:** `app/clients/[id]/actions/get-cennik-upload-url.ts`

```typescript
'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Schema = z.object({
  clientId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().max(50 * 1024 * 1024),  // 50MB max
})

export async function getCennikUploadUrl(input: z.infer<typeof Schema>) {
  const { clientId, fileName, fileSize } = Schema.parse(input)
  
  const supabase = createServiceClient()
  const path = `${clientId}/${Date.now()}-${fileName}`
  
  const { data, error } = await supabase.storage
    .from('cenniki')
    .createSignedUploadUrl(path)
  
  if (error) throw new Error(`Storage error: ${error.message}`)
  
  return { uploadUrl: data.signedUrl, path }
}
```

### 4.5 Server action — process imported file

**File:** `app/clients/[id]/actions/process-cennik.ts`

Skeleton (full implementation у Day 5):

```typescript
'use server'

export async function processCennik(input: {
  clientId: string
  storagePath: string
  sourceType: 'excel' | 'pdf' | 'photo' | 'text'
  rawText?: string  // for text paste
}) {
  // 1. Download file from Supabase Storage
  // 2. Route to appropriate parser (lib/parsers/excel.ts, pdf.ts, OR ai-extractor.ts)
  // 3. Insert imported_assortment row (vadym_verified=false)
  // 4. Insert imported_assortment_items rows
  // 5. Return { assortmentId, itemsCount, aiConfidence }
}
```

---

## DAY 5 — AI parsers (Excel/PDF/text/photo)

### 5.1 `lib/parsers/excel.ts` — exceljs

```typescript
import ExcelJS from 'exceljs'

export async function parseExcelBuffer(buffer: Buffer): Promise<ExtractedRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const sheet = wb.worksheets[0]
  const rows: any[][] = []
  sheet.eachRow((row) => rows.push(row.values))
  return rows
}
```

### 5.2 `lib/parsers/pdf.ts` — unpdf

```typescript
import { extractText, getDocumentProxy } from 'unpdf'

export async function parsePdfBuffer(buffer: Buffer): Promise<{
  text: string
  totalPages: number
  isScanned: boolean
}> {
  const pdf = await getDocumentProxy(buffer)
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  const charsPerPage = text.length / totalPages
  const isScanned = charsPerPage < 50
  return { text, totalPages, isScanned }
}
```

### 5.3 `lib/ai/asortyment-extractor.ts` — Haiku vision/text

```typescript
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Jesteś ekspertem od katalogów hurtowni spożywczej w Polsce.
Twoje zadanie: wyekstraktować pozycje SKU z cennika.

Output JSON z polem items[]:
{
  items: [{
    sku_external?: string,  // ich numer SKU jeśli jest
    name_pl: string,
    brand?: string,
    category_raw?: string,
    price_pln?: number,
    unit?: string,  // 'kg' | 'szt' | 'karton' | 'l'
    pack_size?: string,
    confidence: 0-100
  }]
}

ZASADY:
- Polski format dziesiętny: "12,50" = 12.50
- Cena bez VAT vs z VAT — domyślnie zachowaj jak w źródle
- Marki: ekstraktuj jeśli widoczne (Mowi, Sokołów, Iglotex)
- Kategorie: ekstraktuj raw values, normalizacja będzie później
- Pomijaj nagłówki tabel, footers, info kontaktowe
- Confidence < 50 jeśli row trudno odczytać
`

export async function extractItemsFromExcelRows(rows: any[][]): Promise<ExtractedItem[]> {
  // Send rows JSON to Claude Haiku text mode
}

export async function extractItemsFromText(text: string): Promise<ExtractedItem[]> {
  // Send text to Claude Haiku text mode
}

export async function extractItemsFromPdfVision(pdfBuffer: Buffer): Promise<ExtractedItem[]> {
  // Send PDF directly via document content type (Anthropic native PDF support)
}

export async function extractItemsFromPhotoVision(imageBuffer: Buffer): Promise<ExtractedItem[]> {
  // Send image via image content type
}
```

### 5.4 Smoke test

Test inputs:
1. **Excel:** Vadym provides sample SOLERA cennik.xlsx (~50 rows) — або synthetic generated
2. **PDF text:** generate test PDF з 30 SKU lines
3. **PDF scanned:** scan a paper menu/cennik (1 page)
4. **Photo:** photo of menu з phone
5. **Text:** wkleity Outlook email body з SKU list

**Expected output:** items[] з reasonable accuracy (>80% per item correctness).

**Cost report:** print actual API spend per file type.

---

## DAY 6 — Validation UI + conditional rendering + smoke test

### 6.1 `components/clients/assortment-section.tsx`

Conditional section для hurtownia/sklep_detal/sieci_handlowe.

Empty state: "Brak importowanej oferty" + button `[Załaduj ofertę]`.

Loaded state: SKU count + categories breakdown + per-supplier overlap table.

### 6.2 Upload modal

**File:** `components/clients/cennik-upload-modal.tsx`

4-radio source picker (Excel/PDF/text/photo) → file picker або textarea → progress bar → success state.

Pattern:
1. User selects source type
2. User selects file OR pastes text
3. Client calls `getCennikUploadUrl(...)` — gets signed URL
4. Client uploads file directly to Supabase Storage (bypasses 1MB body limit)
5. Client calls `processCennik(...)` — server processes
6. Modal switches to "validation" view

### 6.3 Validation page — TanStack Table + shadcn

**File:** `app/(dashboard)/clients/[id]/assortment/[assortmentId]/page.tsx`

**Pattern:**
- Server component fetches assortment + items
- Client component `<AssortmentValidationTable>` з TanStack Table
- Inline cell editing — edits → local React state, NO immediate DB write
- Save-on-Enter або explicit `[Zapisz]` button
- AI confidence color coding:
  - `>= 80`: normal background
  - `60-79`: yellow row background
  - `< 60`: red border + ⚠ icon
- Bulk actions: select rows → delete / re-categorize / apply brand
- Single `[Zapisz wszystko]` button — explicit batch save (Protocol 34 — NOT save-on-blur)

**Save action:**
```typescript
'use server'

export async function saveValidatedAssortment(
  assortmentId: string,
  items: EditedItem[],
  deletedItemIds: string[],
) {
  // 1. UPDATE imported_assortment_items для modified rows (set vadym_modified=true)
  // 2. DELETE for removed rows
  // 3. UPDATE imported_assortment SET vadym_verified=true, vadym_verified_at=now()
  // 4. revalidatePath
}
```

### 6.4 Conditional rendering у `/clients/{id}/page.tsx`

Add 2 conditional sections (див. v5 §6).

### 6.5 Final smoke test

Run на all 6 test clients:

**Gastronomia track:**
- Continental, Domek Sushi, KOZAK OLEK, 2 kebabnie
- Verify: type badge displayed, Pyszne menu loaded, ingredients extracted, per-supplier match populated

**Hurtownia track:**
- SOLERA — Vadym manually uploads sample cennik (Excel або PDF)
- Verify: AI parses correctly, validation table renders, Vadym can edit cells, save batches.

### 6.6 Vadym verification gate (Protocol 4 + 8)

**STOP point.** Cowork не declares Sprint S6D-Week1 done без:

1. ✅ Vadym opens https://sztab.vercel.app/clients/{Continental_id} live → sees gastronomia badge + menu items + ingredients
2. ✅ Vadym opens /clients/{SOLERA_id} live → sees hurtownia badge + Asortyment section + button [Załaduj ofertę]
3. ✅ Vadym uploads sample SOLERA cennik → AI extracts items → Vadym validates у table → save → re-render shows asortyment
4. ✅ Cost report — actual $ spent within bootstrap budget ($25-55)

---

## SCHEMA SUMMARY

### New tables
- `pkd_2007_to_2025` (migration 064)
- `pkd_horeca_fit` (migration 064)
- `imported_assortment` (migration 065)
- `imported_assortment_items` (migration 066)
- `product_mappings` (migration 067)

### Extended (no migration — JSONB extension)
- `clients.business_profile` JSONB → adds `client_type`, `client_subtype`, `classification_confidence`, `classification_reasoning_pl`

### New Supabase Storage bucket
- `cenniki` (private, RLS: authenticated only)

### New files

**lib/:**
- `lib/pkd/mapping-2007-2025.ts`
- `lib/enrichment/pyszne.ts`
- `lib/enrichment/wolt.ts`
- `lib/enrichment/krs-fullnames.ts`
- `lib/dish-lexicon.ts`
- `lib/ai/ingredients.ts`
- `lib/ai/asortyment-extractor.ts`
- `lib/parsers/excel.ts`
- `lib/parsers/pdf.ts`
- `lib/matching/ingredient-match.ts`

**components/clients/:**
- `menu-ingredients-section.tsx`
- `assortment-section.tsx`
- `cennik-upload-modal.tsx`
- `assortment-validation-table.tsx`

**app/clients/[id]/:**
- `actions/override-classification.ts`
- `actions/get-cennik-upload-url.ts`
- `actions/process-cennik.ts`
- `actions/save-validated-assortment.ts`
- `assortment/[assortmentId]/page.tsx`

**scripts/:**
- `064_pkd_2025_mapping.sql`
- `064a_spoonjoy_seed.sql` (conditional)
- `065_imported_assortment.sql`
- `066_imported_assortment_items.sql`
- `067_product_mappings.sql`
- `backfill-client-classification.ts`
- `smoke-test-pyszne.ts`
- `smoke-test-wolt.ts`
- `smoke-test-krs-fullnames.ts`
- `smoke-test-ingredients.ts`
- `smoke-test-asortyment-parsers.ts`

---

## DEPENDENCIES + RISKS

### Hard blockers
- **APIFY_API_TOKEN** active (Vadym verifies)
- **Vercel Pro $20/mo** upgraded (maxDuration=300s) — Vadym confirmed ongoing this week
- **Supabase service role key** active
- **ANTHROPIC_API_KEY** з vision capability + batch API
- **Supabase Storage** bucket `cenniki` created з RLS

### Soft risks
- Pyszne Cloudflare update mid-sprint → actor breaks
- Wolt API change → similar
- AI ingredient hallucination > acceptable → fallback canonical-only mode
- Excel parsing з complex multi-sheet cenniki → may need user hint "which sheet contains SKU"
- PDF scanned quality poor → vision OCR low confidence → manual entry fallback

### Cost ceiling
- $50 bootstrap budget — STOP if exceeded, REPORT to Vadym

---

## ARCHITECTURAL PRINCIPLES (Protocol reminders)

- **Protocol 1:** Read docs first
- **Protocol 4:** Post-ship verification на live (sztab.vercel.app)
- **Protocol 8:** UI changes — open browser via computer use, verify user flow
- **Protocol 13:** Two Fundamental Buttons — fan-out parallel → aggregate → AI re-score
- **Protocol 14:** Git ops через Vadym PowerShell, не Cowork
- **Protocol 16:** virtiofs cache truncation
- **Protocol 17:** 2-step INSERT/UPDATE (avoid .upsert() з partial unique indices)
- **Protocol 31:** Cowork sandbox — `.env.local` not loaded, `pnpm` not in PATH
- **Protocol 32:** UTF8NoBOM commits
- **Protocol 34:** No save-on-blur antipattern (especially relevant Day 6 validation table)
- **Protocol 35:** STEP 0 sanity always
- **Protocol 36:** Visibility-first — `defaultOpen={true}` для critical UI sections

---

## DELIVERABLE CHECKLIST (6 days)

### Day 0
- [ ] Migration 064 PKD applied
- [ ] `lib/pkd/mapping-2007-2025.ts` created
- [ ] SpoonJoy seed verified або added

### Day 1
- [ ] `BusinessProfile` interface extended з 4 nowymi polami
- [ ] AI Business Analysis SYSTEM_PROMPT enhanced з classification rules
- [ ] Backfill script created + executed (264 clients classified)
- [ ] Type badge у `/clients/{id}` hero row
- [ ] Manual override server action + UI
- [ ] Smoke test 6 test clients — type badges correct

### Day 2
- [ ] `lib/enrichment/pyszne.ts` created + smoke tested
- [ ] `lib/enrichment/wolt.ts` created + smoke tested
- [ ] `lib/enrichment/krs-fullnames.ts` created + smoke tested
- [ ] Phase B integration (`/api/intelligence/lookup/route.ts` updated)

### Day 3
- [ ] Migration 067 product_mappings applied
- [ ] `lib/dish-lexicon.ts` з 200-300 canonical dishes
- [ ] `lib/ai/ingredients.ts` Haiku + Sonnet escalation pipeline
- [ ] `lib/matching/ingredient-match.ts` per-supplier match scorer
- [ ] `components/clients/menu-ingredients-section.tsx`
- [ ] Conditional render у `/clients/{id}/page.tsx`
- [ ] Smoke test gastronomia clients (Continental, Domek Sushi, KOZAK OLEK, 2 kebabnie)

### Day 4
- [ ] Migration 065 imported_assortment applied
- [ ] Migration 066 imported_assortment_items applied
- [ ] Supabase Storage bucket `cenniki` created
- [ ] `getCennikUploadUrl` server action
- [ ] `processCennik` server action skeleton

### Day 5
- [ ] `lib/parsers/excel.ts` (exceljs) created + smoke test
- [ ] `lib/parsers/pdf.ts` (unpdf) created + smoke test
- [ ] `lib/ai/asortyment-extractor.ts` (Haiku vision/text) created + smoke test
- [ ] `processCennik` full implementation
- [ ] 5 sample inputs tested (Excel/PDF text/PDF scan/photo/text paste)

### Day 6
- [ ] `components/clients/assortment-section.tsx`
- [ ] `components/clients/cennik-upload-modal.tsx`
- [ ] `components/clients/assortment-validation-table.tsx` (TanStack Table)
- [ ] Conditional render у `/clients/{id}/page.tsx`
- [ ] `app/(dashboard)/clients/[id]/assortment/[assortmentId]/page.tsx`
- [ ] Final smoke test on 6 test clients
- [ ] `tsc --noEmit` clean
- [ ] `pnpm build` clean
- [ ] **Live verification** на sztab.vercel.app (Protocol 4)
- [ ] Sprint results doc у `docs/sprint-s6d-week1-results.md`

---

**Status:** Sprint specification ready. Awaits Vadym GO.
**Next step:** Vadym approves → Cowork executes Day 0.

**Deferred to Sprint S6D-Week2-3:**
- Historia ofert UI з diff visualization
- Versioning + changelog summary AI generation
- Web presence (Tavily WHOIS Facebook IG) — Vadym original Tиждень 2
- Locations rendering (KRS oddziały + GMaps multi-location) — Vadym original Тиждень 3
- AI proposal engine + conversation opener — Vadym original Тиждень 4
