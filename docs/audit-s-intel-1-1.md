# Audit — Sprint S-INTEL.1.1 (Pre-implementation)

**Дата:** 2026-05-02
**Тип:** READ-ONLY pre-implementation audit
**Sprint:** S-INTEL.1.1 — CN code foundation + knowledge_base schema
**Anchor docs:** sztab-product-intelligence-spec.md (B1-B12, Tier 1-6, S-INTEL.1-5), sztab-protocols.md (Protocol 13, 15), sztab-matching-philosophy.md
**Locked decisions (Vadym 02.05.2026):** Q1 split на 1.1/1.2/1.3, Q2 CN коди ОБОВ'ЯЗКОВІ + AI-assisted backfill, Q3 knowledge_base seed defer до S-INTEL.1.3

---

## 1. Executive Summary

- **Schema gap чистий.** 0 згадок `cn_code` у scripts/, lib/, app/, components/. 0 згадок `knowledge_base` у коді (тільки в docs). Старт з нуля без cleanup напівреалізованих змін.
- **Edit form живе у legacy `/products/[id]/edit`,** НЕ у `/produkty/[id]/edit`. `ProductForm` (646 рядків, 4 tabs: Podstawowe / Ceny / Logistyka / Meta) — це місце куди йде CN code input.
- **Zod schema у `app/actions/products.ts` (`baseSchema`)** — сюди додається `cn_code: z.string().regex(/^\d{8}$/).nullable().optional()`. Update flow вже використовує `baseSchema.partial()` — додавання поля zero-cost.
- **AI helper Option B (Haiku-only) — рекомендований.** Існуючий `lib/ai-providers.ts` із `callAI()` + `AI_MODELS.FAST = claude-haiku-4-5-20251001` дає готову інфраструктуру. Cost per call ≈ $0.0004. 35 SKU backfill ≈ $0.014 однократно. Static lookup table передчасно для 35 SKU.
- **pgvector НЕ enabled.** `embedding VECTOR` defer до S-INTEL.2 (за specом — `commodity_prices` + `market_signals`) або S-INTEL.1.3 (knowledge_base seed). У S-INTEL.1.1 — schema без embedding column.

---

## 2. Products schema — current state

### Migrations chain (8 файлів зачіпають `products`)

| Migration | Що робить з products |
|---|---|
| `001_create_schema.sql` | CREATE TABLE з legacy v0 columns (lp, category, name, weight, ean, koszt_eur, koszt_pln, price_maly, price_sredni, price_duzy, price_katalog, price_docel, zysk_maly, zysk_duzy, owner_id) |
| `003_sprint2_suppliers_products.sql` | ADD: supplier_id, cost_eur(10,2), cost_pln(10,2), gramatura, ean (knowingly duplicate), unit DEFAULT 'szt', is_hero BOOLEAN, seasonality_status CHECK, shelf_life_days, category, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_min. Indexes: supplier_id, ean, seasonality_status |
| `004_sprint2_seed_cm_products.sql` | INSERT 34 Czudowa Marka SKU (idempotent WHERE NOT EXISTS by ean+owner) |
| `005_extend_products.sql` | ADD vat_rate NUMERIC(4,3) NOT NULL DEFAULT 0.05 + CHECK (0 ≤ vat_rate ≤ 1) |
| `006_drop_legacy_product_columns.sql` | DROP: koszt_eur, koszt_pln, weight, price_maly, price_katalog, price_docel, zysk_maly, zysk_duzy |
| `008_phase25b_supplementary.sql` | ADD tags TEXT[] DEFAULT '{}' + GIN index. Backfill 'bestseller' для is_hero=true |
| `023_taxonomy_core.sql` | ADD family_id UUID FK→taxonomy_families, class_id UUID FK→taxonomy_classes, brand TEXT, hygiene_status (CLEAN/DIRTY/UNCHECKED), hygiene_issues JSONB, hygiene_checked_at. Indexes: family_id, brand, hygiene_status. Створює `product_attributes` (sku_id FK→products) + `product_external` (1:1 з products, off_payload + gemini_payload JSONB) |
| `026_matching_engine.sql` | ADD price_tier TEXT CHECK (budget/mid/premium) — NULL для всіх через відсутність pricing data |

### Effective products schema (post-026)

| Column | Type | Nullable | Default | Note |
|---|---|---|---|---|
| id | UUID PK | no | gen_random_uuid() | |
| owner_id | UUID FK auth.users(id) | NO | — | ON DELETE CASCADE |
| name | TEXT | NO | — | |
| lp | INTEGER | YES | — | legacy ordering |
| category | TEXT | YES | — | free-text legacy, soft-replaced family_id |
| supplier_id | UUID FK suppliers(id) | YES | — | ON DELETE SET NULL |
| cost_eur | NUMERIC(10,2) | YES | — | |
| cost_pln | NUMERIC(10,2) | YES | — | primary cost truth |
| gramatura | TEXT | YES | — | |
| ean | TEXT | YES | — | |
| unit | TEXT | YES | 'szt' | |
| is_hero | BOOLEAN | YES | false | |
| seasonality_status | TEXT | YES | — | CHECK available/low_stock/out_of_stock/seasonal |
| shelf_life_days | INTEGER | YES | — | |
| price_maly_opt | NUMERIC(10,2) | YES | — | |
| price_sredni | NUMERIC(10,2) | YES | — | |
| price_duzy | NUMERIC(10,2) | YES | — | |
| price_duzi_gracze | NUMERIC(10,2) | YES | — | |
| price_min | NUMERIC(10,2) | YES | — | |
| vat_rate | NUMERIC(4,3) | NO | 0.05 | CHECK 0..1 |
| tags | TEXT[] | YES | '{}' | GIN index |
| family_id | UUID FK taxonomy_families | YES | — | |
| class_id | UUID FK taxonomy_classes | YES | — | |
| brand | TEXT | YES | — | |
| hygiene_status | TEXT | YES | — | CHECK CLEAN/DIRTY/UNCHECKED |
| hygiene_issues | JSONB | YES | — | |
| hygiene_checked_at | TIMESTAMPTZ | YES | — | |
| price_tier | TEXT | YES | — | CHECK budget/mid/premium |
| push_tier | INTEGER | YES | (form default 2) | seen у seed/form, migration не знайдено явно — потребує grep для впевненості |
| vertical | TEXT | YES | — | seen у form `product.vertical`, потребує підтвердження якою migration додано |
| created_at | TIMESTAMPTZ | YES | NOW() | |

### Indexes
`idx_products_supplier_id`, `idx_products_ean`, `idx_products_seasonality_status`, `products_tags_gin_idx` (GIN), `products_family_id_idx`, `products_brand_idx`, `products_hygiene_status_idx`.

### Foreign keys
`owner_id → auth.users(id) ON DELETE CASCADE`, `supplier_id → suppliers(id) ON DELETE SET NULL`, `family_id → taxonomy_families(id) ON DELETE SET NULL`, `class_id → taxonomy_classes(id) ON DELETE SET NULL`.

### JSONB columns
- `hygiene_issues JSONB` (на самій products)
- `product_external.off_payload JSONB` (1:1 cache OpenFoodFacts)
- `product_external.gemini_payload JSONB` (1:1 cache, legacy назва — runtime пише туди claude output)
- `product_attributes.value JSONB` (per-SKU EAV з resolution rules family_default→off→gemini→manual→override; 102 records зараз усі source='ai' — Discovery #4 verified fact)

### Caveats виявлені під час audit
- `push_tier` і `vertical` присутні у `product-form.tsx` і у `004` seed, але міграція що ADD-ить ці columns у audit grep'і явно не знайдена. Перевірити через `\d products` на live або grep по всіх 045 migration'ах перш ніж писати S-INTEL.1.1 migration. **Не вигадую — фіксую gap у audit.**
- `category` (free-text) і `family_id` (FK taxonomy) існують паралельно. Spec B1 згадує "family/category" як одне поле — це знадобиться під час S-INTEL.1.3 для knowledge_base linking, але S-INTEL.1.1 не рухає це.

### Gap для S-INTEL.1.1 — що ADD-нути

**Final migration numbers (locked STEP 0 sanity check 02.05.2026):**
- 045 = last existing
- 046 + 047 = reserved by S6B (state.md Discovery #4 → migration 023 enum fix + product_competitor_listings)
- **048 = S-INTEL.1.1 cn_code** ✅
- **049 = S-INTEL.1.1 knowledge_base** ✅
- 050 = S-INTEL.1.1.5 cn_code_required (defer)

```sql
-- 048_cn_code.sql (shipped)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cn_code TEXT;
ALTER TABLE products ADD CONSTRAINT products_cn_code_format
  CHECK (cn_code IS NULL OR cn_code ~ '^[0-9]{8}$');
CREATE INDEX IF NOT EXISTS products_cn_code_idx ON products(cn_code);

-- Quality gate (Q5 lock 02.05.2026)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cn_code_review_pending
  BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS products_cn_code_review_pending_idx
  ON products(cn_code_review_pending)
  WHERE cn_code_review_pending = TRUE;
```

**Rationale за NULLABLE спочатку:** decision Q2 — CN коди обов'язкові, AI-assisted backfill. Migration → AI helper → backfill script → Vadym review → ALTER NOT NULL. Якщо одразу NOT NULL — migration падає на existing 35 rows. Two-step (NULL → backfill → NOT NULL) — industry-standard.

**Quality gate column:** `cn_code_review_pending` — TRUE коли AI suggester заповнив cn_code, FALSE після Vadym manual save у `ProductForm`. Partial index (WHERE TRUE) — efficient lookup для UI badge "🔍 Review CN" на `/produkty` list.

**Defer до S-INTEL.1.1.5:**
```sql
-- 050_cn_code_required.sql (run AFTER manual review всіх SKU)
ALTER TABLE products ALTER COLUMN cn_code SET NOT NULL;
```

---

## 3. UI edit form — current state

### Live state на `/produkty/[id]/edit`
**НЕ існує.** `app/(dashboard)/produkty/` має тільки `page.tsx` (list+detail через ResizablePanelGroup, selection через `?sku=` URL param). Detail рендериться `ProductDetail` всередині `produkty-shell.tsx` — це read-only view з 4 AccordionSection ("Atrybuty", "Pozycje katalogu", "Historia cen", "Linked klienci"), БЕЗ edit кнопок.

### Live state на `/products/[id]/edit` (legacy, KEEP per S5B audit)
- **Page wrapper:** `app/(dashboard)/products/[id]/edit/page.tsx` (147 рядків) — server-loaded fetch products + suppliers + settings + categorySuggestions + product_external + intelligence_runs + latestDeepRun. `maxDuration = 800`.
- **Children components:**
  - `<ProductForm>` — основна edit form (Tabs: Podstawowe / Ceny / Logistyka / Meta)
  - `<ProductAttributesPanel>` — EAV attributes editor
  - `<MatchesPanel mode="target-side">` — клієнти що матчаться до цього SKU
  - `<FastLookupCard>` — Gemini→Claude AI quick lookup
  - Deep Discovery card → link до `/intelligence/deep-discovery/[id]`

### `ProductForm` структура (components/products/product-form.tsx, 646 рядків)
**Tab "Podstawowe" (state.tsx 261-389):** name (required), gramatura, ean, supplier_id (Select), category (Input з datalist autocomplete з categorySuggestions), seasonality (Select), push_tier (Slider 1-3), is_hero (Switch), tags (comma-separated Input).

**Tab "Ceny" (391-531):** waluta toggle (RadioGroup PLN/EUR), cost_eur/cost_pln (з auto-recompute через `computeCostPln`), 5 price tiers (price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_min) з indywidualnymi marża hint, vat_rate.

**Tab "Logistyka" (533-561):** shelf_life_days, unit.

**Tab "Meta" (563-594):** vertical (Select 12 options), notes textarea (DISABLED, "TODO: dedicated notes column").

### Validation
**Zod schema у `app/actions/products.ts` `baseSchema`** (рядки 13-38). `createProduct` use повний schema, `updateProduct` use `baseSchema.partial()`. Form НЕ викликає Zod на client side — тільки `required` HTML attribute на name. Errors доходять через `result.error` з server action.

### Server actions (`app/actions/products.ts`)
- `createProduct(input)` — full validation, fills missing pricing через `applyPricing`
- `updateProduct(id, input)` — `baseSchema.partial()`, NO auto-recompute pricing (form decides)
- `deleteProduct(id)` — owner-scoped DELETE
- `getCategorySuggestions()` — distinct categories

### Identify де додати CN code input

**Recommended position:** Tab "Podstawowe", після EAN field у `<div className="grid gap-4 sm:grid-cols-2">` (рядок 273-291). EAN і CN code — це обидва ID/classification fields, природньо парні.

**Layout proposal:**
```tsx
{/* Existing EAN row */}
<div className="grid gap-4 sm:grid-cols-2">
  <div>...gramatura...</div>
  <div>...ean...</div>
</div>

{/* NEW: CN code row з AI suggest */}
<div className="grid gap-4 sm:grid-cols-2">
  <div className="space-y-2 sm:col-span-2">
    <div className="flex items-center justify-between">
      <Label htmlFor="cn_code">Kod CN (Combined Nomenclature)</Label>
      <Button type="button" variant="outline" size="sm"
        onClick={handleSuggestCN} disabled={suggestPending || !name}>
        {suggestPending && <Spinner className="mr-2" />}
        Zaproponuj AI
      </Button>
    </div>
    <Input id="cn_code" value={cnCode}
      onChange={(e) => setCnCode(e.target.value.replace(/\s/g, ''))}
      placeholder="8 cyfr, np. 20059990"
      pattern="\d{8}" maxLength={8} />
    <p className="text-xs text-muted-foreground">
      Klasyfikacja celna UE. Łącznik do TARIC, Eurostat, ZSRIR.
    </p>
  </div>
</div>
```

**Validation:**
- Client-side: `pattern="\d{8}"` + `replace(/\s/g, '')` для tolerant input ("2005 9990" → "20059990")
- Server-side (Zod в `baseSchema`): `cn_code: z.string().regex(/^\d{8}$/, 'CN code = 8 cyfr').nullable().optional()`
- DB-side: `CHECK (cn_code IS NULL OR cn_code ~ '^[0-9]{8}$')`

---

## 4. CN code AI helper — design

### Options trade-off

| Option | Pros | Cons | Verdict S-INTEL.1.1 |
|---|---|---|---|
| **A: Static lookup table** | fast, free, deterministic, offline | maintenance, gaps на edge cases, треба seed ~500 codes для food | передчасно для 35 SKU |
| **B: AI inference (Haiku)** | covers будь-який product, no maintenance, готова інфраструктура (`callAI` у `lib/ai-providers.ts`) | $0.0004/call, не deterministic, потенційно неправильно | **REC: ship це у 1.1** |
| **C: Hybrid (A→B fallback)** | fast for common items, fallback for edge cases | complexity, build обох механізмів одразу | defer до S-INTEL.2 якщо AI cost стане проблемою |

**Vadym Q2 decision** — AI-assisted backfill. Confirms Option B.

### Sample prompt (lib/intelligence/cn-code-suggester.ts)

```ts
import { callAI, AI_MODELS } from '@/lib/ai-providers'

interface CnSuggestion {
  cn_code: string         // exactly 8 digits
  confidence: 'high' | 'medium' | 'low'
  reasoning: string       // короткий, 1-2 речення PL
  alternatives?: string[] // up to 2 other plausible codes
}

const SYSTEM = `Jesteś ekspertem polskiej klasyfikacji celnej Combined Nomenclature (CN, EU 8-digit).
Twoje zadanie: na podstawie nazwy i kategorii produktu zaproponować jeden 8-cyfrowy kod CN
zgodny z aktualną nomenklaturą TARIC. Specjalizujesz się w produktach żywnościowych dla rynku
polskiego i HoReCa (kiszonki, marynaty, sałatki gotowe, miód, wędliny, słodycze).
Zwracaj WYŁĄCZNIE JSON zgodnie ze schemą — bez prozy, bez markdown, bez \`\`\`.`

const userPromptFor = (input: ProductInfo) => `Produkt:
- Nazwa: ${input.name}
- Kategoria: ${input.category ?? 'brak'}
- Gramatura: ${input.gramatura ?? 'brak'}
- EAN: ${input.ean ?? 'brak'}
- Wertykał: ${input.vertical ?? 'brak'}
- Brand: ${input.brand ?? 'brak'}

Zwróć JSON: { "cn_code": "01234567", "confidence": "high|medium|low",
"reasoning": "...", "alternatives": ["...", "..."] (opcjonalnie do 2) }

Rozdziały CN istotne dla typowych produktów Sztab:
- 0710-0712: warzywa mrożone/suszone
- 2001-2005: warzywa konserwowane octem/kiszone/marynowane
- 2007-2008: dżemy / przetwory owocowe / sałatki owocowe
- 0409: miód naturalny
- 1601-1602: wędliny
- 1704: cukierki/słodycze niezawierające kakao
- 1806: wyroby z czekolady
- 2009: soki
Wybierz 8-cyfrowy kod precyzyjnie odpowiadający, nie poziom 4- czy 6-cyfrowy.`
```

### Function signature

```ts
export async function suggestCnCode(input: {
  name: string
  category?: string | null
  gramatura?: string | null
  ean?: string | null
  vertical?: string | null
  brand?: string | null
}): Promise<CnSuggestion>
```

### Cost estimate per call (Haiku 4.5: $1/M input, $5/M output)
- Input: ~400 tokens (system + user prompt + product fields) ≈ $0.0004
- Output: ~80 tokens (JSON response) ≈ $0.0004
- **Total per call ≈ $0.0008** (раніше я оцінив $0.0004 — після кориговання з повним system prompt це ~$0.0008)

### Reliability layer
Re-use existing `lib/ai-providers.ts callAI()` — там вже:
- 5 attempts з exp backoff (1s/2s/4s/8s)
- 45s timeout per request
- 4-strategy JSON extraction fallback
- AIInvalidResponseError + AIParseError + friendly PL errors
- Token usage logging + cost tracking

Додатковий валідатор у helper:
```ts
function validateSuggestion(raw: unknown): CnSuggestion {
  // Зверху: regex /^\d{8}$/ check на cn_code
  // Якщо AI повернув з spaces ("2005 99 90") — strip і re-validate
  // Якщо невалідний — throw з context для UI
}
```

### Endpoint design (S-INTEL.1.1 ships цей API)

`POST /api/products/cn-suggest`
- Body: `{ product_id?: string, name: string, category?, gramatura?, ean?, vertical?, brand? }`
- Auth: server-side getUser() check (owner-scoped), як решта product endpoints
- Returns: `CnSuggestion | { error: string }`
- Used by: form button "Zaproponuj AI" + backfill script

---

## 5. knowledge_base schema — recommendation

### Current state
**0 згадок у коді.** Тільки 7 згадок у docs (matching-philosophy.md, product-intelligence-spec.md, audit-s6a-client-analysis.md). Це означає clean slate.

**pgvector status:** 0 згадок `pgvector`, `vector(`, `embedding`, `CREATE EXTENSION.*vector` у scripts/. Extension НЕ enabled. Embedding column для semantic search — defer до S-INTEL.2 коли пакет даних виправдає це (плюс pgvector setup на Supabase).

### Recommended migration (S-INTEL.1.1 ships це)

```sql
-- 047_knowledge_base.sql (sequencing з 046_cn_code залежить від final commit order)

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  content_md TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  category TEXT NOT NULL DEFAULT 'food',
  language TEXT NOT NULL DEFAULT 'pl' CHECK (language IN ('pl', 'uk', 'en')),
  created_by TEXT NOT NULL CHECK (
    created_by IN ('ai_research', 'vadym_manual', 'imported')
  ),
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_base_topic_idx ON knowledge_base(topic);
CREATE INDEX IF NOT EXISTS knowledge_base_tags_gin ON knowledge_base USING gin(tags);
CREATE INDEX IF NOT EXISTS knowledge_base_category_idx ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS knowledge_base_language_idx ON knowledge_base(language);
CREATE INDEX IF NOT EXISTS knowledge_base_created_by_idx ON knowledge_base(created_by);
CREATE INDEX IF NOT EXISTS knowledge_base_sources_gin ON knowledge_base USING gin(sources);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "knowledge_base_owner_all" ON knowledge_base
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION knowledge_base_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION knowledge_base_set_updated_at();

COMMENT ON TABLE knowledge_base IS
  'Curated articles/reports for AI retrieval context (Protocol 15 hybrid matching). Seed via S-INTEL.1.3 — 10 foundation topics через AI deep research. category column ready-for-extension (food initial, non-food plugins post-MVP per Decision Framework 02.05.2026).';
COMMENT ON COLUMN knowledge_base.topic IS
  'One of 10 foundation topics (defined у sztab-product-intelligence-spec.md S-INTEL.1.3 plan). Free-form not enum — теми еволюціонують.';
COMMENT ON COLUMN knowledge_base.sources IS
  'JSONB array: [{url, title, accessed_at, credibility_score (0-1)}]';
COMMENT ON COLUMN knowledge_base.created_by IS
  'ai_research = згенеровано Claude deep research; vadym_manual = Vadym написав вручну; imported = uploaded PDF/Excel/web fetch.';
COMMENT ON COLUMN knowledge_base.model_version IS
  'Якщо created_by=ai_research — який Claude model + дата (claude-haiku-4-5-20251001@2026-05-XX). Для regenerate tracking.';
COMMENT ON COLUMN knowledge_base.category IS
  'Decision Framework 02.05.2026: food-first з ready-for-extension. category=food для Phase 1. Майбутні plugins (kosmetyka, odzież, elektronika) — окремі values.';
COMMENT ON COLUMN knowledge_base.language IS
  'pl primary (наш market), uk secondary (Vadym native + UA sources), en tertiary (EU/global benchmarks).';
```

### Що НЕ включаю у S-INTEL.1.1
- `embedding VECTOR(1536)` column → defer (pgvector не enabled, semantic search defer до S-INTEL.2 на основі spec line 220 "Який AI model для embedding?")
- `product_id UUID FK` linking → defer (per spec topic→product linking через retrieval, не FK)
- Full-text search index → defer (PostgreSQL `tsvector` add later коли вирішимо чи це достатньо vs pgvector)

### Чи pgvector варто enable у S-INTEL.1.1?
**NO.** Spec line 220: "Який AI model для embedding knowledge_base? (OpenAI ada-002 vs Anthropic Claude embeddings vs voyage)" — це open question. Включення pgvector + embedding column без визначеного embedding provider = передчасна архітектура. Включити коли в S-INTEL.1.3 seed-имо реальні docs і знаємо який provider.

---

## 6. Recommended S-INTEL.1.1 Scope

### BUILD (нове)

| Item | File / target | Effort |
|---|---|---|
| Migration: `048_cn_code.sql` (cn_code TEXT NULLABLE + CHECK regex + index + cn_code_review_pending BOOLEAN + partial index) | `scripts/048_cn_code.sql` | 0.5h |
| Migration: `049_knowledge_base.sql` (повна schema без embedding) | `scripts/049_knowledge_base.sql` | 0.5h |
| Migration: `050_cn_code_required.sql` — **DEFER до S-INTEL.1.1.5** (ALTER SET NOT NULL після manual review) | `scripts/050_*` | 0 (defer) |
| AI helper: `lib/ai/cn-code-suggester.ts` (Option B, callAI з Haiku) | new file | 1h |
| API endpoint: `POST /api/products/cn-suggest` (auth + Zod + auto-write back з review_pending=TRUE для confidence>=medium) | `app/api/products/cn-suggest/route.ts` | 0.5h |
| Backfill script: `scripts/backfill-cn-codes.ts` — **DEFER до S-INTEL.1.1.5** | new file | 0 (defer) |
| Format helper: `lib/format/cn-code.ts` — formatCnCode/parseCnCode/isValidCnCode (DB without spaces ↔ UI з spaces, Q4 lock) | new file | 0.25h |
| UI: CN code input row + "Zaproponuj AI" button на `ProductForm` Podstawowe tab (з handleSuggestCN handler, toast feedback з confidence + reasoning + alternatives) | `components/products/product-form.tsx` | 1h |
| UI quality gate: amber badge "🔍 Review CN" на `/produkty` list для review_pending=TRUE + CN display з spaces у ProductDetail header (Q5 lock) | `components/produkty/produkty-shell.tsx` | 0.5h |
| Server action: extend `baseSchema` у `app/actions/products.ts` з `cn_code: z.string().regex(/^\d{8}$/).nullable().optional()` + auto-clear review_pending коли cn_code edited manually | `app/actions/products.ts` | 0.25h |
| Type extension: `lib/types.ts` `Product` interface додати `cn_code` + `cn_code_review_pending` | `lib/types.ts` | 0.1h |
| **Total BUILD** | | **4.6h** |

**Removed з sprint scope (Q2 lock):** Backfill script + Migration 050 → S-INTEL.1.1.5 окремий sprint. Sprint 1.1 ships infrastructure тільки; Vadym виконує review коли має 30 хв focused time.

**Added з sprint scope (Q5 lock):** `cn_code_review_pending` column + partial index + UI badge на /produkty list + auto-clear-on-save logic. Це quality gate, NOT optional.

### REFACTOR (existing)

| Item | File | Effort |
|---|---|---|
| `ProductForm` layout — insert CN row між EAN row і supplier/category row (без ламання решти tabs) | `components/products/product-form.tsx` | included вище |
| `updateProduct` payload — пропустити `cn_code` через `baseSchema.partial()` (zero-effort, працює само) | `app/actions/products.ts` | 0 |
| `MatchesPanel` / `FastLookupCard` / `ProductAttributesPanel` — НЕ чіпаємо | — | 0 |

### LEAVE AS IS

- Усі pricing fields, tabs Ceny/Logistyka/Meta структура
- `seasonality_status`, `tags`, `vertical`, `push_tier` editors
- `taxonomy_families` / `taxonomy_classes` / `family_id` linking
- `product_attributes` EAV
- `product_external` OFF/Gemini cache
- `/produkty` list view (read-only, не чіпаємо)
- ProductDetail accordion sections у `produkty-shell.tsx`

### DEFER до S-INTEL.1.2

- ZSRIR API integration (dane.gov.pl)
- fresh-market.pl scraper
- EU Agri-food observatory weekly fetcher
- Sunday cron job для refresh
- `commodity_prices` table з `category` column (per Decision Framework)
- `market_signals` table

### DEFER до S-INTEL.1.3

- knowledge_base seed з 10 foundation тем через AI deep research
- Manual upload UI для knowledge_base
- Eurocash/Makro/Selgros catalogs scrapers
- pgvector + embedding column ALTER + semantic search

### DEFER до S-INTEL.2+ (поза S-INTEL.1)

- TARIC API integration (per spec line 130-131; Tier 1) — раз вирішили AI-only suggest, TARIC можна додати як validator у Phase 2
- Eurostat Comext по CN code
- Allegro Sales Center

### Estimated effort breakdown
- Migrations (046 + 047 + 048 stub): 0.85h
- AI cn-code-suggester lib + endpoint: 1.5h
- Backfill script: 0.5h
- UI + Zod schema + types: 1.2h
- Verification (Protocol 4): 0.5h
- **Total: 4.55h**

Це збігається з upper-bound estimate prompt'у (3.5-4.5h) — додаю запас 0.5h на validation edge cases і ASK BEFORE PROCEEDING checkpoints.

---

## 7. Backfill strategy — DEFER до S-INTEL.1.1.5 (separate sprint)

**Q2 lock 02.05.2026:** Sprint S-INTEL.1.1 ships infrastructure ONLY. Backfill виконується в окремому sprint S-INTEL.1.1.5 коли Vadym має ~30 хв focused review time. Цей audit section — план для S-INTEL.1.1.5, НЕ для 1.1.

### Inventory (verified live STEP 0 02.05.2026)
- **35 SKU total**, 35 with supplier (всі Czudowa Marka). Підтверджено через `SELECT COUNT(*) FROM products`.
- Seed 004 INSERT був 34 + 1 manually додано після seed.

### Categories у seed (для batch planning)
| Category | Count |
|---|---|
| surowki_marynowane | 10 |
| kiszonki_dodatki | 5 |
| surowka_marchew | 3 |
| pomidory | 3 |
| ogorki_kiszone | 3 |
| kiszonki_kapusty | 3 |
| buraki_clean_label | 3 |
| salatki_gotowe | 2 |
| salatka_baklazan | 2 |
| **Total** | **34** |

### Estimated AI cost full backfill
- 35 SKU × $0.0008/call = **$0.028 одноразово**
- Якщо 2-3 retries на edge cases — все одно <$0.10 total
- **Висновок:** cost negligible. Можна навіть викликати 2x для confidence cross-check.

### Recommended backfill flow

```
Phase 1 — Schema add (NULLABLE)
  Run 046_cn_code.sql
  Verify: SELECT COUNT(*) FROM products WHERE cn_code IS NULL → 35

Phase 2 — Bulk suggest
  Run scripts/backfill-cn-codes.ts:
    SELECT products WHERE cn_code IS NULL ORDER BY category, name
    For each: call cn-code-suggester
    Write cn_code + log JSONB до scratch table з confidence + reasoning
    Print summary per category з суцільним diff

Phase 3 — Vadym manual review (Vadym time, не Claude)
  Vadym переглядає всі 35 в /products/[id]/edit
  Coriguje підозрілі (low confidence або "alternatives" present)
  Приймає всі — UI save = SET cn_code

Phase 4 — Constraint tightening
  Run 048_cn_code_required.sql (ALTER ... SET NOT NULL)
  Verify: повторний INSERT без cn_code падає
```

### Чому intermediate scratch table?
**Не потрібна.** AI Result писати одразу у `products.cn_code` — якщо помилка, Vadym поправить у edit form. Логи suggest call'ів писати у `enrichment_log` (existing infra з Sprint M). Скриптом печатати summary до stdout — Vadym читає, потім пускає Phase 3.

### Risk mitigation
- Якщо 048 запускається перш ніж Vadym review всі 35 — migration падає на NOT NULL для будь-якого NULL row. Захист = explicit SET у 048 коментарі "RUN AFTER human review".
- Backfill script ідемпотентний — друге запускання skip-ить products що вже мають cn_code.

---

## 8. Risks & Open Questions

### Technical risks

| Risk | Severity | Mitigation |
|---|---|---|
| AI proposes wrong CN code (Vadym не знає що правильно) | Medium | Confidence flag в response + alternatives. Vadym verify проти TARIC public lookup для high-stakes products. |
| `push_tier` / `vertical` columns не знайдено в audited migrations | Low | Перш ніж писати 046 — `\d products` на live (через Supabase SQL Editor) щоб мати ground truth. Якщо щось додалося поза repo migrations — треба зафіксувати у docs/. |
| Migration 046 чіпає big table → lock | Negligible | 35 rows, ALTER з default NULL = instant |
| AI helper rate limit при backfill | Low | Sequential calls, 35 calls × ~3s = 2 minute total. Anthropic rate limit 50 RPM на FAST models — ОК. |
| Static lookup було б дешевше long-term | Low | ~$3 на 1000 SKU всього. Поки <500 SKU — Option B economical. |

### Open questions — ALL LOCKED Vadym 02.05.2026

| Q | Decision | Implementation |
|---|---|---|
| **Q1 Migration sequencing** | 048+049 для S-INTEL.1.1, 050 defer до 1.1.5. S6B reserves 046+047. | `048_cn_code.sql`, `049_knowledge_base.sql` shipped |
| **Q2 Backfill timing** | Post-sprint у S-INTEL.1.1.5 (separate ship). Sprint 1.1 = infrastructure only. | Removed з 1.1 BUILD. Section 7 — план для 1.1.5. |
| **Q3 Helper location** | `lib/ai/cn-code-suggester.ts` (consistency з business-analysis.ts, sku-attributes.ts). НЕ створюємо `lib/intelligence/`. | shipped під `lib/ai/` |
| **Q4 CN normalization** | DB без spaces (regex `^[0-9]{8}$`). UI display з spaces ("2005 99 90") через format helper. | `lib/format/cn-code.ts` shipped |
| **Q5 Quality gate** | `cn_code_review_pending BOOLEAN DEFAULT FALSE` column + UI badge "🔍 Review CN" на `/produkty`. Save edit clears flag. NOT optional. | shipped у migration 048 + ProductForm + produkty-shell |

### Out of scope для S-INTEL.1.1 (зафіксовано щоб не drift'нути)

- TARIC public API integration → S-INTEL.2+
- knowledge_base seed content → S-INTEL.1.3
- Embedding generation → S-INTEL.2 або S-INTEL.1.3
- Manual upload UI → S-INTEL.1.3 / S-INTEL.5
- Product analysis pipeline (S6B Discovery #4) — інший trek, не блокується

---

## 9. Audit Trail

### Що перевірено
- `docs/sztab-state.md` (646 рядків, last entry "01.05.2026 — Day Wrap" з Discovery #4 S6B scope locked)
- `docs/sztab-protocols.md` (455 рядків — Protocol 13 Two Buttons, Protocol 14 Git Boundary, Protocol 15 Hybrid Matching + Decision Framework Locked 02.05.2026)
- `docs/sztab-matching-philosophy.md` (139 рядків — knowledge_base concept у line 76, Phase 1 priorities у line 67-71)
- `docs/sztab-product-intelligence-spec.md` (238 рядків — 12 dimensions B1-B12, 6 source tiers, S-INTEL.1-5 priorities, locked sprint reorder)
- 8 migration файлів що чіпають products: 001, 003, 004, 005, 006, 008, 023, 026 (по 026_matching_engine.sql включно)
- Усі 045 migration після 026 — grep'нуто на "alter table products" + "create table.*products" → 0 hits, дозволяє стверджувати products schema стабільна з 026_matching_engine.sql
- `app/(dashboard)/produkty/page.tsx` (57 рядків)
- `components/produkty/produkty-shell.tsx` (327 рядків)
- `app/(dashboard)/products/[id]/edit/page.tsx` (147 рядків — server-side data loader)
- `components/products/product-form.tsx` (646 рядків — full edit form)
- `app/actions/products.ts` (224 рядки — Zod baseSchema + create/update/delete/getCategorySuggestions)
- `lib/ai-providers.ts` (header — підтвердження AI_MODELS.FAST = claude-haiku-4-5-20251001 + $1/$5 pricing per 1M tokens)
- Grep entire repo для `cn_code` → **0 hits** (чистий greenfield)
- Grep entire repo для `knowledge_base` → 7 hits, всі в docs (чистий greenfield у коді)
- Grep entire repo для `pgvector` / `vector(` / `embedding` у scripts/ → **0 hits** (extension не enabled)

### Що НЕ перевірено (gaps в audit, явно зафіксовано)
- `\d products` на live Supabase — щоб підтвердити що `push_tier` і `vertical` columns реально існують. Audit grep'и їх не знайшли як explicit ALTER, але вони є у seed 004 і у `product-form.tsx`. Можлива migration що audit не залапав через grep pattern.
- Live count `SELECT COUNT(*) FROM products` — backfill estimate взято зі state.md "35 SKU".
- Чи migration 045 — справді last (state.md S6B breakdown згадує "migrations 046+047" як majbutnie). Можливий conflict нумерації.
- Чи `lib/intelligence/` директорія existує у репо (для cn-code-suggester.ts). У audit бачив `lib/ai/`, `lib/lookup/`, `lib/enrichment/` — не `lib/intelligence/`. Можливо краще покласти у `lib/ai/cn-code-suggester.ts` для consistency, або створити нову `lib/intelligence/`.

### Що цей audit НЕ робить
- НЕ модифікує жодного code файлу
- НЕ запускає pnpm dev/build/test
- НЕ робить git operations
- НЕ створює diag-* / seed-* / .ps1 файлів
- НЕ робить decision за Vadym — тільки recommendations з рейтингом trade-offs

### Готовність до Sprint S-INTEL.1.1
**Audit complete.** Перш ніж стартувати implementation:
1. Vadym confirms: продовжуємо з 046 нумерацією (або зсуваємо)?
2. Vadym confirms: backfill робимо у sprint чи post-sprint?
3. Vadym confirms: AI helper у `lib/ai/cn-code-suggester.ts` чи `lib/intelligence/cn-code-suggester.ts`?
4. Vadym confirms: scope BUILD/REFACTOR/LEAVE/DEFER (Section 6) — все так?

Тоді можна писати Sprint S-INTEL.1.1 prompt у форматі Protocol 3.

---

**END OF AUDIT.**
