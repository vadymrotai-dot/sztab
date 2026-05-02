# Sztab Matching Philosophy

**Status:** WIP, vector form. Розкриватимемо як шипитимемо Layer 2.
**Created:** 02.05.2026
**Anchor protocol:** Protocol 15

---

## North Star

"Алгоритм — серце. AI — мозок. Feedback — кров. Vadym — розум що приймає рішення."

Ціль: bespoke matching engine який вчиться з реального феедбеку + curated knowledge про domain. Не generic AI, не статичний algorithm — гібрид.

---

## 3 Layers

### Layer 1 — Algorithm (детермінований)

Існуючі scorers у lib/matching/scoring/:
- pkd-fit
- geographic
- size-match
- recency-boost
- activity-status
- s2a-signals
- loyalty-multiplier
- hygiene-gate

Output: deterministic score 0-100, repeatable, debuggable.

**Поточний стан:** працює, але точність не оптимальна (Vadym observation 02.05.2026). Це нормально для baseline — Layer 2 буде тюнити.

### Layer 2 — AI Tuning

Поетапне розкриття:

**Phase 1 (now → ~6 months):**
- AI пропонує зміни ваг existing scorers
- Vadym approve/reject
- Cadence: weekly batch (Sunday cron)
- Baseline для tracking ROI

**Phase 2 (~6-12 months, після стабільного feedback flow):**
- + threshold adjustments (cutoffs, multiplier ranges)
- AI вже довів tuning track record

**Phase 3 (~12+ months):**
- + propose нові scorers (наприклад: "brand mentions у Tavily як signal")
- AI достатньо досвідчений для structural suggestions

### Layer 3 — Feedback Signals

Всі signals weighted:
1. **Vadym explicit rating** (👍/👎 на match) — highest weight, real-time
2. **Реальні outcomes** — deal closed, response rate на cold opener, conversion → batch
3. **Pikniko handoff success** — was the cohort firma successfully onboarded → batch
4. **Knowledge bootstrapping** — curated articles/books/news про HoReCa/B2B/Polish market → retrieval context

---

## Knowledge Bootstrapping

**Intent:** AI стартує не з нулевих знань, а як новий співробітник якого послали на тренінг. Перш ніж feedback почне приходити — AI вже орієнтується в domain.

**Curated by:** Vadym додає в Phase 1 priorities:
1. Polish food market price history (raw data для calibration corpus)
2. Competitor analyses (хто на ринку, products, pricing)
3. Catering/restaurant business models (як HoReCa закуповуються)

Phase 2 (after 1-2 months feedback): industry trends, regional preferences, B2B negotiation guides, food regulations — додаємо тільки якщо побачимо gaps у AI output.

Languages: PL primary, UA secondary, EN tertiary.

Storage: окрема knowledge_base table (TBD migration в Sprint S-INTEL.X). Кожен документ → embedded → retrievable як AI context при scoring.

---

## Decision Authority

**Hard rule:** AI propose, Vadym dispose.

UI patterns (TBD):
- Weekly digest "AI suggestions for matching" з diff (старі ваги → нові)
- Per-suggestion approve/reject buttons
- Optional reason field (Vadym пише чому reject — це теж feedback signal)

Auto-apply: blocked principle. Винятки тільки після Phase 3 + Vadym explicit rule "auto-apply suggestions з confidence > X% і only для weights, не thresholds, не нові scorers".

---

## Cadence

- **Default:** weekly batch (Sunday evening cron job)
- **Exception 1:** Vadym thumb up/down = real-time signal storage (але tuning все одно weekly)
- **Anti-pattern:** real-time tuning per match → blocked (overfitting + UX instability)

---

## Calibration Strategy

Перш ніж пускати real customers — Sztab проводить calibration period:
1. Vadym добавляє curated knowledge до knowledge_base
2. AI runs synthetic scoring на existing ceidg_prospects + clients
3. Vadym дає manual ratings на random sample
4. AI пропонує initial weight adjustments
5. Iterate until matching feels right

**Goal:** запуск з matching engine який вже відкалібрований, не з alpha-version що вчиться з нуля на real users.

**Competitive moat:** patience. Більшість стартапів запускають з сирим matching і вмирають від bad first impressions. Sztab вкладає місяці в calibration і виходить готовим.

---

## Open Questions (defer to later sprints)

- Який AI model для scoring suggestions? (Haiku enough? Sonnet for periodic deep tune?)
- Як store і version algorithm параметри (history of weight changes)?
- A/B testing infrastructure (потрібен буде у Phase 2-3)?
- Knowledge base ingestion pipeline (manual upload? URL fetcher? PDF parser?)
- Synthetic scoring sandbox для calibration period

---

**END (vector form). Розкриватимемо by section коли вирішуватимемо реалізацію.**

---

## Connection to Product Intelligence

Знахідки Discovery #5 (02.05.2026): matching engine критично залежить від **market intelligence layer** — не тільки CRM internal data. Без real wholesale prices, distribution channel context, competitor intelligence — AI re-score не має fresh information для якісних висновків.

Це пояснює чому "matching працює не дуже" станом на 02.05.2026 — algo використовує тільки CEIDG/KRS/internal data, AI re-score додає judgment але без додаткової external information.

Outside-in approach (Sztab) vs inside-out (typical CRM): Sztab matching будується на external market state + internal CRM data, не тільки CRM patterns.

Reference: docs/sztab-product-intelligence-spec.md
