# Protocol 39 — Design Deliverable Iteration

**Created:** 13.05.2026
**Status:** Active
**Applies to:** PDF deliverables, sell sheets, prezentacje, UI mockups, marketing materials — wszystko z визуальним дизайном і структурованими даними

## Trigger

Коли Vadym (або інший stakeholder) просить створити візуальний deliverable з структурованою інформацією: cennik, oferta, презентація, mockup, sell sheet itp.

## Core principles

### 1. Audience first — B2B чи B2C

Перш ніж дизайнувати — питати:

- **Хто отримає?** Business decision-makers (hurtownie, suppliers, CEO) vs end consumers
- **Для B2B:** spokojny корпоративний tone, full data structure, NIP/KRS/legal info, 2 кольори max, professional typography, БЕЗ "★ NAJLEPSZA CENA" / emojis / marketing tricks
- **Для B2C:** appetite triggers OK, brighter palettes, marketing language, CTA buttons OK

### 2. Real data from day 1

**Заборонено** використовувати calc()/formula-based values у production deliverable якщо є real data.

Workflow:

- Зібрати real source data FIRST (screen, spreadsheet, dokument)
- HARDCODE values у коді
- Якщо real data неповна — питати додаткове, не guess

Example (13.05.2026): v1-v7 використовував `calc(eur_cost, margin) → price` — давав wrong numbers. v9 використав hardcoded values зі screen Vadyma → all 16 SKU prices accurate.

### 3. Iteration discipline

- **1 rejection** → "що не так?" (color? structure? mood?)
- **2 rejections з тою самою помилкою pattern** → STOP. Ask for references (фото подібного style який user likes). Не guessити з тою самою direction.
- **3+ rejections без change pattern** → signal що missed щось fundamental. Step back, broader questions.

Counter-example (13.05.2026): 6 iterations з зеленим primary + same structure (header→title→hero→table→info→kontakt). Тільки після explicit Vadym feedback "ти використовуєш ті самі палітри і кольори а структура гірша!!!" дійшло.

### 4. Language & terminology audit

Для deliverables non-default language:

- **Кожне слово перевірити** перед фінальним shippingом
- Industry-specific termi: PL B2B — `hurt` не `opt`, `faktura VAT`, `NIP`, `KRS`, `palety`, `gramatura`
- **Proper names** з великої літери (Surówka Tradycyjna, Czudowa Marka)
- **Українські кальки у польську** — заборонено (`Pełuska` ≠ PL слово, `Płatki kapusty` ✓ PL)

### 5. Full data structure preservation

Якщо у v1 був повний data set (header + title + hero + table + warunki + kontakt + legal) — у кожній iteration ALL sections зберігати. Не скорочувати "for space economy" без explicit OK.

Counter-example (13.05.2026): у v5-v6 пропустив warunki або скоротив до 3 points. Vadym feedback: "не дописував всього що було на першому ванпейджері".

### 6. Post-approval lock

Коли stakeholder обрав ("ось цей мені сподобався"):

- **Lock structure** — layout не міняти
- **Lock palette** — colors не міняти
- **Allowed:** polish copy/text fixes, real data updates, мінімальні adjustments
- **Forbidden:** re-design без explicit ask

## Anti-patterns

1. **Marketing language для B2B**: "★ NAJLEPSZA CENA", "wybór szefa", "vinum selectum" — B2C tricks які shallow у B2B контексті
2. **Decorative ornaments у corporate doc**: ★ ◆ ◇ ~ — тільки якщо stakeholder explicitly likes
3. **6+ iterations з тим самим primary color** — pattern detection повинен спрацювати раніше
4. **Calc-based prices для production** — завжди real source
5. **Skipping sections "for space"** — reduce padding, не drop content

## Workflow template

1. **ASK:** B2B чи B2C? Audience profile? Reference materials?
2. **COLLECT:** Real data (HARDCODED), не calculated
3. **DRAFT v1:** Full structure, conservative direction
4. **PRESENT:** 1-3 variations (different palettes/structures)
5. **ITERATE:**
   - "love it" → polish copy/data
   - specific feedback → fix specifically
   - "don't like" без specifics → ASK references, НЕ guess
6. **LOCK:** Structure + palette frozen
7. **POLISH:** Copy review (each word!), proper names check, language audit
8. **FINAL:** Deliver + save backup of approved version

## Files affected by inaugural session (13.05.2026)

- Final approved: `Cennik_v9_corporate.pdf` (Corporate Dossier, navy+grey, 1 strona A4)
- 7 iterations: v1 (kraft) → v2 (palettes) → v3 (green variations) → v4 (editorial/scandi/artisan) → v5 (kraft/dark/asym/italian/bauhaus) → v6 (newspaper/magazine/burgundy/brutalist/botanique) → v7 (corporate/classic/scandi/swiss/polish) → v8 (PL fixes) → v9 (real prices)
- Lessons: 9 iterations to reach final = too many. Should have been 3-4 with proper audience-first + references-on-reject discipline.

## Related protocols

- Protocol 14 — Vadym git ops only
- Protocol 25 — Cowork verify (extends to: Cowork can render PDF, check 1-page constraint, validate fonts/sizes)
- Protocol 38 — Claude НЕ задає SQL Vadym (extends to: Claude НЕ задає design choices Vadym — present варіанти, не питати)
- Memory #4 — простою українською (комунікація під час iteration)
