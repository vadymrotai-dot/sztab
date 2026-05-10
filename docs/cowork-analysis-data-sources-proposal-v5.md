# Sztab — Customer Profile Data Sources Proposal v5

**Дата:** 2026-05-10
**Status:** Discovery + planning. NO code, NO commits.
**Continuation of:** v4 (`cowork-analysis-data-sources-proposal-v4.md`)
**Method:** 2 паралельні investigators — Sztab code audit + web research на storage/PDF/Excel/vision libraries.

---

## 0. Що змінилось vs v4 — fundamental architecture redirect

Vadym caught **fundamental gap у v4** через приклад:

> SOLERA (рибна гуртовня) — v4 архітектура згенерувала б **80% match для Pikniko (świeże warzywa)**. Це **FALSE positive trap**. Гуртовня НЕ "купує товари для приготування страв" — гуртовня купує товари **НА СКЛАД щоб ПРОДАВАТИ ДАЛІ**. Це B2B-to-B2B (Pikniko → SOLERA → restaurants), не B2B-to-end-customer.

Sztab DB має ~1,681 sp.z o.o. — більшість це гуртовні (PKD 4631Z, 4638Z, 4634A). Без classification всі вони отримали б false-positive ingredient matches.

**Висновок v5:** Sztab класифікує клієнта на тип **у Phase B step 0**. Далі рендерить різний UI і різну product matching логіку. Two-track architecture.

---

## 1. CRITICAL DISCOVERY з code audit — classification вже наполовину готова

**Code audit revealed:** `lib/ai/business-analysis.ts` `BusinessProfile` interface вже має ENUM `business_format`:

```typescript
business_format: 'single_store' | 'chain' | 'franchise' | 'online' |
                 'B2B_distributor' | 'gastronomy' | 'manufacturer' |
                 'service' | 'other'
```

Plus existing fields:
- `estimated_locations`
- `product_categories_pl: string[]`
- `target_demographics_pl: string[]`
- `special_traits_pl: string[]`
- `buyer_strength_for_chm: 0-100`
- `buyer_reasoning_pl: string`

**Saved до:** `clients.business_profile JSONB` (migration 033).

**Implication:** **NOT треба будувати orphan `client_type_classification` table**. Extend existing `business_profile` ENUM + add slim `client_type` derived field. Save Vadym ~half a day з sprint scope.

**v5 architecture refinement:**

```typescript
// EXTEND existing BusinessProfile interface
interface BusinessProfile {
  business_format: '...' (existing ENUM розширений ↓)
  // ↓ додаємо subtypes:
  client_type: 'gastronomia' | 'hurtownia' | 'sklep_detal' | 'catering'
             | 'hotel' | 'instytucja' | 'production' | 'sieci_handlowe' | 'inne'
  client_subtype: string  // e.g. 'kebabnia', 'spożywcza_b2b', 'discount_chain'
  classification_confidence: 0-100
  classification_reasoning_pl: string
  // ... (existing fields)
}
```

`client_type` derived з `business_format`:

| business_format | client_type derived |
|---|---|
| `gastronomy` | `gastronomia` |
| `B2B_distributor` | `hurtownia` (or `sieci_handlowe` if size > X locations) |
| `chain` | `sieci_handlowe` (if retail) OR `gastronomia` (if restaurant chain) — needs sub-classification |
| `franchise` | similar to chain |
| `single_store` | `sklep_detal` (if retail) OR `gastronomia` (if restaurant) |
| `online` | `sklep_detal` (online retail) |
| `manufacturer` | `production` |
| `service` | `inne` |
| `other` | `inne` |

**Logic:** AI Business Analysis вже визначає `business_format` + `product_categories_pl`. Just enhance prompt + add output fields.

---

## 2. Two-track architecture

Sztab классифікує client → Phase B step 0 → далі рендерить **різний UI** і використовує **різну matching логіку**.

### Track 1: GASTRONOMIA (automatic)

**Включає:** restauracja, kebabnia, bar mleczny, jadłodajnia, kawiarnia, fast food, hotel restauracja, catering imprezowy.

**Path даних — automatic через delivery platforms:**

1. **Меню scrape** — Pyszne / Wolt / Glovo / UberEats / GMaps photos
2. **Ingredients** — AI Haiku extract per dish (з dish_lexicon hybrid)
3. **Aggregate** per restaurant
4. **Match** ingredient → supplier products через `product_mappings` table
5. **Buyer Strength** per supplier (CzM, Pikniko, SpoonJoy, Karol, Gmurczyk)

**UI на `/clients/{id}` для type='gastronomia':**

```
🍔 МЕНЮ (з Pyszne, оновлено 5 dni temu)
   ├─ 14 dań
   └─ AI ingredients aggregate: kurczak (×8), pomidory (×11), 
      ogórki świeże (×9)...

📊 BUYER STRENGTH per dostawca:
   ├─ CzM (kiszonki)        85% Strong
   ├─ Pikniko (świeże)      75% Good
   ├─ SpoonJoy (mid)        45% Possible
   └─ Karol (wędliny)        5% Weak
```

### Track 2: HURTOWNIA / SKLEP / RESELLER (manual)

**Включає:** hurtownie B2B (SOLERA, Makro, Selgros), sklepy detaliczne, sieci handlowe (Biedronka, Lewiatan), distrybutorzy, delicatesy.

**Path даних — manual з фізичним збором оферт:**

1. **Меню НЕМАЄ** (гуртовня не gотує)
2. **Asortyment** — Vadym/працівник manualnie завантажує:
   - Excel cennik
   - PDF cennik
   - Tekст з email або Word document
   - Photo paragoanu/cennika z wystawy/wizyty
3. **AI парсить** (Haiku vision/text) → JSON структуру SKU
4. **Vadym validates** extracted items (TanStack Table inline edit)
5. **Save** до `imported_assortment` (з версіонуванням)
6. **Match ASORTYMENT vs Vadym suppliers** — competitive analysis, NOT buyer strength:
   - "SOLERA ма 12 SKU kiszonek — KONKURENT для CzM"
   - "SOLERA ма 0 SKU мід ложки — POTENCIAL co-distribution для SpoonJoy"
   - "SOLERA ма 450 SKU ryby — BRAK overlap z Vadym suppliers"

**UI на `/clients/{id}` для type='hurtownia':**

```
📦 ASORTYMENT
   [Załaduj ofertę PDF/Excel/Email/Photo]   [Skanuj cennik AI]
   
   Status: Brak importowanej oferty
   ⚠️ Skontaktuj się i pobierz cennik aktualny
   
   --- АБО якщо завантажено: ---
   
   📦 ASORTYMENT (cennik 2026-Q1, Vadym uploaded 2026-05-08):
   ├─ 1,847 SKU
   ├─ Kategorie: ryby (450), mięso (320), warzywa (180), 
                 nabiał (220), alkohol (145)...
   └─ Top brands: Mowi, Sokołów, Iglotex, Coca-Cola...

📜 HISTORIA CEN/ASORTYMENTU (DEFER до Тижня 2-3):
   ├─ 2026-Q1 — 1,847 SKU
   ├─ 2025-Q4 — 1,792 SKU (+55 SKU YoY)
   └─ ...

📊 PORÓWNANIE z dostawcami Vadym:
   ├─ Pikniko (świeże warzywa) — 180 SKU overlap. 🟡 KONKURENT.
   ├─ CzM (kiszonki) — 12 SKU overlap. 🟡 KONKURENT małej skali.
   ├─ SpoonJoy (mid 7g) — 0 overlap. 🟢 POTENCIAL co-distribution.
   ├─ Karol (wędliny) — 0 overlap. 🟢 POTENCIAL co-distribution.
   └─ Gmurczyk (cukiernia) — 0 overlap. 🟢 POTENCIAL co-distribution.

🤝 REKOMENDACJA AI:
   "SOLERA ma własny asortyment kiszonek (12 SKU). Dla CzM = konkurent.
    Vadym opportunity: SpoonJoy ложки mід — SOLERA brak в asortymencie,
    можлива co-distribution для regions де SOLERA нє доходить direct
    do horeca."
```

---

## 3. DB schema additions (revised)

### 3.1 EXTEND existing `business_profile` JSONB (no new column needed)

`clients.business_profile` already JSONB. Just enhance Phase B AI prompt to fill new fields:
- `client_type`
- `client_subtype`
- `classification_confidence`
- `classification_reasoning_pl`

**No migration needed for classification.** Just code change у `lib/ai/business-analysis.ts`.

### 3.2 NEW migration 067 — `product_mappings` (was 064 у v4)

Same as v4 §2.3 крок 6. Renumbered to 067 because PKD migration takes 064.

### 3.3 NEW migration 064 — PKD 2025 mapping

```sql
-- Sprint S6D Week 1 — PKD 2007 → PKD 2025 mapping computed column.

-- Helper table з mapping
CREATE TABLE IF NOT EXISTS pkd_2007_to_2025 (
  pkd_2007 TEXT PRIMARY KEY,
  pkd_2025 TEXT NOT NULL,
  notes TEXT
);

-- Seed з GUS official mapping (just HoReCa-relevant codes for MVP)
INSERT INTO pkd_2007_to_2025 (pkd_2007, pkd_2025, notes) VALUES
  ('56.10.A', '56.11.Z', 'Restauracje'),
  ('56.10.B', '56.12.Z', 'Ruchome placówki gastronomiczne'),
  ('56.21.Z', '56.21.Z', 'Catering imprezowy (no change)'),
  ('56.29.Z', '56.29.Z', 'Catering pozostały (no change)'),
  ('56.30.Z', '56.30.Z', 'Bary i puby (no change)'),
  ('47.11.Z', '47.11.Z', 'Sklepy spożywcze (no change)'),
  ('55.10.Z', '55.10.Z', 'Hotele (no change)'),
  ('55.20.Z', '55.20.Z', 'Pensjonaty (no change)'),
  ('47.23.Z', '47.23.Z', 'Sklepy z rybami (no change)'),
  ('47.29.Z', '47.29.Z', 'Delicatesy (no change)'),
  ('46.31.Z', '46.31.Z', 'Hurt warzyw (no change)'),
  ('46.32.Z', '46.32.Z', 'Hurt mięsa (no change)'),
  ('46.38.Z', '46.38.Z', 'Hurt rybny (no change)'),
  ('46.39.Z', '46.39.Z', 'Hurt cash & carry (no change)')
ON CONFLICT (pkd_2007) DO NOTHING;

-- Add HoReCa fit score table
CREATE TABLE IF NOT EXISTS pkd_horeca_fit (
  pkd_code TEXT PRIMARY KEY,  -- canonical PKD 2025 code
  fit_score INTEGER NOT NULL CHECK (fit_score BETWEEN 0 AND 10),
  category TEXT NOT NULL,  -- 'restaurant', 'hotel', 'catering', 'wholesale', 'retail', 'food_service', 'production'
  notes TEXT
);

INSERT INTO pkd_horeca_fit (pkd_code, fit_score, category, notes) VALUES
  ('56.11.Z', 9, 'restaurant', 'Core target — restauracja'),
  ('56.12.Z', 3, 'food_service', 'Food trucks — limited fresh fish viability'),
  ('56.21.Z', 8, 'catering', 'Wesela = łosoś, dorsz premium'),
  ('56.29.Z', 6, 'catering', 'Stołówki — volume + low margin, ryba mrożona'),
  ('56.30.Z', 4, 'food_service', 'Bary — przekąski rybne'),
  ('55.10.Z', 9, 'hotel', 'Hotele premium F&B'),
  ('55.20.Z', 5, 'hotel', 'Pensjonaty — variable'),
  ('47.23.Z', 10, 'retail', 'Direct fish reseller'),
  ('47.29.Z', 8, 'retail', 'Delicatesy — kawior, śledzie, wędzony łosoś'),
  ('47.22.Z', 5, 'retail', 'Mięso retail — rzadko ryba'),
  ('47.11.Z', 4, 'retail', 'Sklepy spożywcze general — low fit'),
  ('46.38.Z', 7, 'wholesale', 'Hurt rybny — partner/competition'),
  ('46.39.Z', 6, 'wholesale', 'Cash & carry — Makro/Selgros'),
  ('46.32.Z', 4, 'wholesale', 'Hurt mięsa'),
  ('46.31.Z', 3, 'wholesale', 'Hurt warzyw'),
  ('86.10.Z', 5, 'institution', 'Szpitale — institutional catering'),
  ('87.30.Z', 5, 'institution', 'DPS-y, hospicja')
ON CONFLICT (pkd_code) DO NOTHING;
```

### 3.4 NEW migration 065 — `imported_assortment`

```sql
CREATE TABLE IF NOT EXISTS imported_assortment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  imported_at TIMESTAMPTZ DEFAULT now(),
  imported_by_user_id UUID,  -- nullable for now (auth.users FK у Sprint S6E)
  source TEXT NOT NULL CHECK (source IN ('excel','pdf_text','pdf_scanned','email_text','word_doc','photo_ocr','manual_paste')),
  storage_path TEXT,  -- Supabase Storage path
  file_hash TEXT,  -- SHA256 для dedup
  file_name TEXT,
  file_size_bytes INTEGER,
  valid_from DATE,
  valid_until DATE,
  raw_text TEXT,  -- full extracted text (для search)
  structured_items_count INTEGER DEFAULT 0,
  ai_extracted BOOLEAN DEFAULT true,
  ai_confidence INTEGER CHECK (ai_confidence BETWEEN 0 AND 100),
  vadym_verified BOOLEAN DEFAULT false,
  vadym_verified_at TIMESTAMPTZ,
  previous_version_id UUID REFERENCES imported_assortment(id),
  changelog_summary_pl TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_imported_assortment_client ON imported_assortment (client_id);
CREATE INDEX idx_imported_assortment_active ON imported_assortment (client_id, vadym_verified) WHERE vadym_verified = true;
```

### 3.5 NEW migration 066 — `imported_assortment_items`

```sql
CREATE TABLE IF NOT EXISTS imported_assortment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_assortment_id UUID NOT NULL REFERENCES imported_assortment(id) ON DELETE CASCADE,
  sku_external TEXT,  -- their SKU if present
  name_pl TEXT NOT NULL,
  brand TEXT,
  category_raw TEXT,  -- as extracted from cennik
  category_normalized TEXT,  -- Sztab taxonomy: ryby/mięso/warzywa/etc.
  ingredient_canonical TEXT,  -- mapping до lib/dish-lexicon (links hurtownia asortyment з restaurant ingredients)
  price_pln NUMERIC,
  price_eur NUMERIC,
  unit TEXT,  -- 'kg' | 'szt' | 'karton' | 'l'
  pack_size TEXT,
  ai_confidence INTEGER CHECK (ai_confidence BETWEEN 0 AND 100),
  vadym_modified BOOLEAN DEFAULT false,  -- did Vadym edit this row?
  raw_data JSONB,  -- original AI extraction full JSON
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_assortment_items_parent ON imported_assortment_items (imported_assortment_id);
CREATE INDEX idx_assortment_items_canonical ON imported_assortment_items (ingredient_canonical) WHERE ingredient_canonical IS NOT NULL;
CREATE INDEX idx_assortment_items_category ON imported_assortment_items (category_normalized);
```

### 3.6 Migration 067 — `product_mappings` (deferred from v4)

Schema same as v4 §2.3 крок 6. Now FK to `suppliers(id)` works because suppliers table verified existуючою (migration 003 з 5 seeds).

---

## 4. Q1-Q8 Research Answers

### Q1. Suppliers schema — VERIFIED

**Code audit confirms:** окрема `suppliers` table EXISTS (migration 003).
- 5 seeds: **CzM (Czudowa Marka), Mod-loszka, Karol, Gmurczyk, Pikniko**
- Schema: id UUID, owner_id, name, legal_name, nip, country, type, deal_type, commission_pct, verticals[], exclusivity_scope[], reliability_score, ...
- Products table має `supplier_id UUID REFERENCES suppliers(id)`
- ⚠️ **SpoonJoy missing** з seeds — Vadym має додати або Sprint S6D Day 0 додає SQL INSERT

**FK setup для product_mappings:** trivial — `supplier_id UUID REFERENCES suppliers(id) NOT NULL`.

### Q2. Storage — Supabase Storage (NOT Vercel Blob)

**Verdict:** Supabase Storage — already on stack, EU/Frankfurt region, RLS policies inherited, signed upload URLs bypass 1MB Server Action body limit, cheaper egress for cached reads.

**Pricing:**
- Free tier: 1GB storage, 5GB egress/міс
- Pro $25/міс base: 100GB included
- Sztab use case: 50 cenniki × ~25MB = 1.25GB/міс → free tier easily fits

**Pattern:**
```ts
// Server action
const { data } = await supabase.storage
  .from('cenniki')
  .createSignedUploadUrl(`${clientId}/${fileName}`)
// Client uploads directly — bypasses 1MB body limit
```

**Bucket setup (manual):** Vadym creates `cenniki` bucket у Supabase Dashboard, sets RLS policy `auth.uid() IS NOT NULL`.

### Q3. PDF parsing — `unpdf` (NOT pdf-parse, NOT pdfjs-dist)

**Verdict:** `unpdf` (unjs) — single bundle, zero native deps, Vercel-native, active 2026.

**Pattern:**
```ts
import { extractText, getDocumentProxy } from 'unpdf'

const pdf = await getDocumentProxy(buffer)
const { text, totalPages } = await extractText(pdf, { mergePages: true })

// Heuristic: scanned PDFs return very little text
const charsPerPage = text.length / totalPages
const isScanned = charsPerPage < 50

if (isScanned) {
  // Send PDF directly to Claude Haiku vision (Anthropic native PDF support up to 32MB / 100 pages)
} else {
  // Pass extracted text to Claude Haiku text mode для SKU structuring
}
```

**Bundle impact:** ~500KB вкладається у Vercel 50MB SLS limit без проблем.

### Q4. Excel parsing — `exceljs` (NOT SheetJS)

**Critical 2024 event:** SheetJS Community Edition removed itself з npm registry у April 2024 через legal dispute. Latest npm version `0.18.5` stale. Now installs only via `https://cdn.sheetjs.com/...tgz` URL — brittle lockfile, Renovate broken.

**Verdict:** `exceljs` — MIT, normal `pnpm add exceljs`, 6× менше memory, streaming reader для великих cenniki, coherent TypeScript types.

```ts
import ExcelJS from 'exceljs'

const wb = new ExcelJS.Workbook()
await wb.xlsx.load(buffer)
const sheet = wb.worksheets[0]
const rows: any[][] = []
sheet.eachRow((row) => rows.push(row.values))
// Pass rows to Claude Haiku для column header detection + SKU structuring
```

### Q5. Haiku vision OCR cost — confirmed

**Per cennik (1-2 page A4 photo):**
- Image input: ~3,200 tokens × $1/1M = **$0.0032**
- System prompt: ~500 tokens × $1/1M = **$0.0005**
- Output (50 SKU JSON): ~2,500 tokens × $5/1M = **$0.0125**
- **Per cennik total: ~$0.016** (~0.066 PLN)

**50 cenniki/місяць bootstrap = $0.80/міс. 500/міс long-term = $8/міс.** Тривіальна вартість.

**Single vendor strategy (recommended):**
- Excel: parse `exceljs` → Claude Haiku text mode для column detection
- PDF text-based: `unpdf` extract → Claude Haiku text
- PDF scanned / photo: send directly to Claude Haiku vision (Anthropic native PDF up to 32MB)
- → **One vendor, one SDK, one prompt template**. Don't introduce Mistral OCR 3 (premature optimization at this scale).

### Q6. AI confidence < 70% — UI workflow

**Recommended pattern:**

1. **Light yellow background** на section header якщо `classification_confidence < 70`
2. **Warning icon** + tooltip: "Klasyfikacja AI nie jest pewna — sprawdź ręcznie"
3. **Manual override dropdown** zawsze available у `/clients/{id}` ClientDetailActions menu:
   - Items: gastronomia / hurtownia / sklep_detal / catering / hotel / instytucja / production / sieci_handlowe / inne
4. **Bulk action у `/clients` list page:** filter "Niska pewność klasyfikacji" → Vadym переглядає й корегує
5. **NOT default до 'inne'** — keep AI prediction as primary, just flag for review. Forcing 'inne' loses information.

### Q7. Backfill 264 existing clients — strategy

**One-time backfill script** `scripts/backfill-client-classification.ts`:

1. Loop over всі clients WHERE `business_profile->>'client_type' IS NULL`
2. Якщо `business_profile->>'business_format'` IS NOT NULL → derive `client_type` через mapping (table у §1)
3. Якщо `business_profile` IS NULL → run AI Business Analysis (existing pipeline через `/api/intelligence/lookup`) для кожного NIP
4. Save updated `business_profile` JSONB
5. Report counts: classified / failed / low confidence

**Cost estimate:** 264 clients × ~$0.01 AI Business Analysis (Haiku) = **~$3** one-time.

**Time:** ~30-60 min wall clock (parallel batches of 10).

**Manual review queue:** filter clients WHERE `classification_confidence < 70` — Vadym corrects через `/clients` UI у ~1-2 hours work.

### Q8. hurtownia vs sieci_handlowe — distinction

**Recommended:** keep **both** top-level types, use `client_subtype` для granularity.

**Rules:**
- `hurtownia` — B2B distributor, primary customer = HoReCa/retail/sklepy. Examples: SOLERA, Makro, Selgros, Inter-Mar.
- `sieci_handlowe` — retail chain selling B2C. Examples: Biedronka, Lidl, Kaufland, Carrefour, Lewiatan, Żabka.
- **Lewiatan ambiguous:** technically franchise retail chain selling B2C → `sieci_handlowe/franczyza_spożywcza`.
- **Cash & carry (Makro, Selgros):** hybrid — sell to both B2B (HoReCa) and end consumers з business card. Tag як `hurtownia/cash_carry`.

**Subtypes — recommended taxonomy:**

| Top-level | Subtypes |
|---|---|
| **gastronomia** | `restauracja`, `kebabnia`, `bar_mleczny`, `kawiarnia`, `fast_food`, `stołówka`, `jadłodajnia`, `food_truck` |
| **hurtownia** | `spożywcza_b2b`, `rybna`, `mięsna`, `alkoholowa`, `napoje`, `świeże_warzywa`, `cash_carry` |
| **sklep_detal** | `delikatesy`, `mięsny`, `rybny`, `pieczywo`, `online` |
| **catering** | `imprezowy`, `kontraktowy`, `instytucjonalny` |
| **hotel** | `5gw`, `4gw`, `3gw`, `pensjonat`, `hostel`, `agroturystyka` |
| **instytucja** | `szpital`, `szkoła`, `dom_pomocy`, `urzad`, `wojsko` |
| **production** | `mięsna`, `rybna`, `mleczarnia`, `piekarnia_przemysłowa` |
| **sieci_handlowe** | `discount`, `supermarket`, `convenience`, `franczyza_spożywcza`, `e_commerce` |
| **inne** | (free text) |

**Disambiguation hint у AI prompt:** "Якщо firma sells B2B do HoReCa lub do sklepów — це hurtownia. Якщо firma sells direct B2C through stores — sieci_handlowe (якщо >5 lokalizacji) lub sklep_detal (jeśli 1-5)."

---

## 5. Workflow importu oferty — UI/UX detail

### Step 1: trigger
Vadym на `/clients/{id}` (type=hurtownia) натискає `[Załaduj ofertę]` button у Asortyment section.

### Step 2: source picker modal

Modal з 4 опціями (radio):

```
┌─────────────────────────────────────────┐
│ Załaduj asortyment SOLERA              │
├─────────────────────────────────────────┤
│ ○ [Excel/CSV]    .xlsx, .xls, .csv     │
│ ○ [PDF]          .pdf (text або scan)  │
│ ○ [Tekst]        wklej z email/Word    │
│ ○ [Zdjęcie]      .jpg, .png cennika    │
├─────────────────────────────────────────┤
│ [Anuluj]                  [Dalej →]    │
└─────────────────────────────────────────┘
```

### Step 3: file upload OR text paste

**File upload pattern:**
```
1. Server action getSignedUploadUrl(clientId, fileName) → URL
2. Client uploads directly to Supabase Storage
3. Client confirms upload complete → server action processAssortmentImport(storagePath, sourceType)
```

**Text paste:** large `<textarea>` 20-50 rows, Vadym wkleja text z Outlook/Word.

### Step 4: AI processing (loading state)

Server action processes:

```typescript
async function processAssortmentImport(
  storagePath: string,
  sourceType: 'excel' | 'pdf' | 'text' | 'photo'
) {
  let rawText: string
  let extractedItems: ExtractedItem[]
  
  switch (sourceType) {
    case 'excel': {
      const buffer = await downloadFromStorage(storagePath)
      const rows = parseExcel(buffer)  // exceljs
      rawText = JSON.stringify(rows)
      extractedItems = await extractItemsFromExcelRows(rows)  // Claude Haiku text
      break
    }
    case 'pdf': {
      const buffer = await downloadFromStorage(storagePath)
      const { text, totalPages } = await extractPdfText(buffer)  // unpdf
      const isScanned = (text.length / totalPages) < 50
      if (isScanned) {
        // Send PDF directly to Claude Haiku vision
        extractedItems = await extractItemsFromPdfVision(buffer)
      } else {
        rawText = text
        extractedItems = await extractItemsFromText(text)
      }
      break
    }
    case 'text': {
      rawText = inputText  // Vadym pasted
      extractedItems = await extractItemsFromText(rawText)
      break
    }
    case 'photo': {
      const buffer = await downloadFromStorage(storagePath)
      extractedItems = await extractItemsFromPhotoVision(buffer)  // Claude Haiku vision
      break
    }
  }
  
  // Save to imported_assortment + items (vadym_verified=false)
  return { assortmentId, itemsCount: extractedItems.length }
}
```

### Step 5: Validation UI (TanStack Table + shadcn)

```
┌────────────────────────────────────────────────────────┐
│ SOLERA — asortyment 2026-Q1 (1,847 SKU extracted)     │
│ AI confidence: 87% | Modified rows: 0 | Deleted: 0    │
├────┬──────────────────┬────────┬─────────┬──────┬─────┤
│ ☐  │ Nazwa            │ Marka  │ Kategoria│ Cena│ Akc.│
├────┼──────────────────┼────────┼─────────┼──────┼─────┤
│ ☐  │ Łosoś norweski.. │ Mowi   │ ryby    │ 89zł│ ✏  ✕│
│ ☐  │ Ogórki kiszone.. │ CzM    │ kiszonki│ 12zł│ ✏  ✕│
│ ⚠  │ Specjał kuchni   │ ?      │ ?       │ ?   │ ✏  ✕│ ← yellow bg, AI confidence low
└────┴──────────────────┴────────┴─────────┴──────┴─────┘
[Bulk delete] [Bulk re-categorize]    [Anuluj]  [Zapisz]
```

**Patterns:**
- **Inline editing per cell** — double-click activates input. Edit → local React state, NO immediate DB write.
- **AI confidence color coding:**
  - `confidence >= 80` → normal
  - `60-79` → yellow row background
  - `< 60` → red border
- **Bulk select** + bulk delete/recategorize.
- **Single "Zapisz" button** — explicit batch save (NOT save-on-blur, Protocol 34).
- Keyboard shortcuts: Cmd+Enter = Zapisz, Esc = Anuluj.

### Step 6: post-save UI refresh

`/clients/{id}` re-renders `Asortyment` section з extracted items + per-supplier comparison.

---

## 6. UI conditional rendering — `/clients/{id}`

### Existing structure (audited)
8 accordion sections + tabbed activity. NO conditional show/hide за `client_type` currently.

### v5 Changes

**Add 2 new conditional sections** після "Analiza biznesowa (AI)":

```tsx
// app/(dashboard)/clients/[id]/page.tsx
{c.business_profile?.client_type === 'gastronomia' && (
  <AccordionSection title="Menu + Asortyment z menu" defaultOpen>
    <MenuIngredientsSection clientId={c.id} menuData={c.menu_data} />
  </AccordionSection>
)}

{['hurtownia','sklep_detal','sieci_handlowe'].includes(c.business_profile?.client_type) && (
  <AccordionSection title="Asortyment" defaultOpen>
    <AssortmentSection clientId={c.id} />
  </AccordionSection>
)}
```

**Type badge у hero row:**
```tsx
<Badge variant="outline">
  {c.business_profile?.client_type === 'gastronomia' ? '🍔 Gastronomia' :
   c.business_profile?.client_type === 'hurtownia' ? '📦 Hurtownia' :
   c.business_profile?.client_type === 'sieci_handlowe' ? '🏪 Sieci handlowe' :
   '📋 Inne'}
  {c.business_profile?.classification_confidence < 70 && (
    <span className="text-yellow-600">⚠️</span>
  )}
</Badge>
```

**Manual override** у `ClientDetailActions` dropdown menu:
- "Zmień typ klasyfikacji →" submenu з 9 options

---

## 7. 6-day Sprint S6D-Week1 schedule (revised)

| Day | Focus | Output |
|---|---|---|
| **0** (~2h) | PKD 2025 mapping + sanity | Migrations 064 + suppliers SpoonJoy seed |
| **1** | ⭐ AI client classification (extend business_profile) | Migration не потрібна — JSONB extension. AI prompt enhance + UI badge + manual override + backfill script |
| **2** | Pyszne + Wolt + krs-fullnames (parallel) | `lib/enrichment/pyszne.ts`, `wolt.ts`, `krs-fullnames.ts` + smoke tests |
| **3** | Ingredients pipeline (gastronomia track) | `lib/dish-lexicon.ts`, `lib/ai/ingredients.ts`, migration 067 product_mappings |
| **4** | Asortyment foundation (hurtownia track) | Migrations 065 + 066 imported_assortment + items, Supabase Storage bucket setup, signed upload URLs |
| **5** | AI parsers (Excel/PDF/text/photo) | `lib/parsers/excel.ts` (exceljs), `lib/parsers/pdf.ts` (unpdf), `lib/ai/asortyment-extractor.ts` (Haiku vision) |
| **6** | Validation UI + conditional rendering | TanStack Table validation page, conditional sections у `/clients/{id}`, smoke test on real cennik |

---

## 8. Realistic Budget — updated (steady-state)

| Item | Cost | Note |
|---|---|---|
| Apify (всі scrapers) | $30-60/міс | Pyszne + Wolt + Glovo + ALEO + Panorama + krs-fullnames |
| Tavily | $30/міс | Already paying |
| Anthropic Haiku 4.5 | ~$20-30/міс | Ingredients + asortyment OCR + classification + match rescore |
| Vercel Pro | $20/міс | Upgrade today |
| Supabase Pro (eventually) | $25/міс | When > 1GB storage / 8GB DB needed |
| **TOTAL steady-state** | **~$100-145/міс** | ~400-580 zł/міс |

**Bootstrap one-time:**
- 264 clients classification AI Business Analysis: ~$3
- regdata/krs-fullnames для 1416 sp.z o.o.: $7
- Ingredients для 264 active gastronomia: ~$15-40
- Vision OCR pilot (50 cenniki): $0.80
- **Total bootstrap: ~$25-55**

---

## 9. CANCELLED + DEFERRED summary (consolidated)

| Item | Status | Sprint |
|---|---|---|
| Altman Z' bankruptcy prediction | ❌ Cancelled (v4) | — |
| VAT delta monitoring engine | ❌ Cancelled (v4) | — |
| BZP velocity з time-decay | ❌ Cancelled (v4) | — |
| Google Maps rating trajectory | ❌ Cancelled (v4) | — |
| Michelin/Bib Gourmand tier | ❌ Cancelled (v4) | — |
| Suppliers detection from photos | ❌ Cancelled (v4) | — |
| Per-attribute provenance, signals event stream | ⏸ Deferred | S6F+ |
| Hardcoded `lib/product-mapping.ts` | ❌ Skip | — |
| Bielik / PLLuM Polish LLMs | ⏸ Deferred | — |
| `client_type_classification` orphan table | ❌ **CANCELLED у v5** — extend existing `business_profile` JSONB instead | — |
| **Historia ofert UI з diff visualization** | ⏸ **Deferred до Sprint S6D-Week2-3** | After 5-10 imported assortment-ів збереться |
| Photo OCR via Tesseract.js | ❌ Skip — Polish + tables = 60-70% accuracy | — |
| Mistral OCR 3 окремий vendor | ❌ Skip — premature optimization | — |
| SheetJS Community Edition | ❌ Skip — left npm registry 2024 | Use `exceljs` |
| pdf-parse v1 | ❌ Skip — abandoned, broken canvas binding | Use `unpdf` |
| Vercel Blob storage | ❌ Skip — Supabase Storage already on stack | — |

---

## 10. Висновок v5

**Critical insight:** `business_format` ENUM з existing `lib/ai/business-analysis.ts` дає free 50% of classification work. Просто extend prompt + add 4 fields до `BusinessProfile` interface, no new orphan table needed.

**Two-track architecture:**
1. **Gastronomia track** — automatic через menu scrapers + AI ingredients → buyer strength matching
2. **Hurtownia/sklep/sieci track** — manual asortyment import (Excel/PDF/text/photo) → competitive analysis

**Stack decisions verified through web research:**
- Storage: **Supabase Storage** (signed upload URLs, not Vercel Blob)
- PDF: **unpdf** (not pdf-parse, not pdfjs-dist)
- Excel: **exceljs** (not SheetJS — left npm)
- OCR: **Claude Haiku 4.5 vision** native (single vendor strategy, ~$0.016/cennik)
- Validation UI: **TanStack Table + shadcn + explicit batch save** (not save-on-blur)

**Cost:** Sprint S6D-Week1 = $25-55 bootstrap + ~$100-145/міс steady state.

**Next step:** see `sprint-s6d-week1-prompt.md` (rewritten with 6-day breakdown).

**Status:** Discovery + planning only. NO code, NO commits.
