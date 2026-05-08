# SZTAB — PROTOCOLS

**Date:** 01.05.2026 (revised — додано Protocol 10, 11, 12 після Audit #2)
**Purpose:** правила які тримають Claude (мене) у відповідальності, щоб не повторювалися помилки 30.04 ввечері і 01.05 ранок.

---

## ПРОТОКОЛ 1 — КОЛИ Я ОПИСУЮ СТАН ПРОДУКТУ

### Заборонено:
- Описувати "що Sztab уміє" з памяті, без перевірки на live або в репо
- Казати "feature X працює" якщо я бачив тільки commit в Git, але не клікав на live
- Перетворювати "запланували в sprintі" на "ми це маємо"
- Описувати reality на основі memory summary (вона зберігає intent, не end-state)
- Перевіряти ТІЛЬКИ те що видно в sidebar — далі шукати ВСІ pages в репо

### Обов'язково перед кожним описом стану:
1. Live check — get_page_text на сторінці яку описую
2. Click test — якщо описую кнопку як "працює", я клікаю її і перевіряю response
3. Repo check — ls app/(dashboard) + ls app/api/ щоб знайти приховані pages/endpoints
4. Окремо колонки для статусу:
   - planned (в sprint document)
   - coded (commit pushed)
   - wired (UI button connected to endpoint)
   - working (end-to-end test passed)
   - findable (доступне через sidebar/navigation)
5. Unknown — це окрема категорія. Якщо не клікав — пишу "не перевірено".

### Шаблон правильної відповіді:
- Sztab уміє X (перевірено live на /url, screenshot timestamp)
- Sztab НЕ уміє Y (підтверджено через 404 / empty render / missing button)
- Sztab можливо уміє Z, але не клікав — потрібен тест
- Sztab уміє W але СХОВАНО від користувача (page exists, no sidebar link)

---

## ПРОТОКОЛ 2 — ПЕРЕВІРКА ШИПЛЕННЯ SPRINTУ

Після кожного sprint commit/deploy, перш ніж казати "S4 done":

### Checklist:
- Build passed на Vercel?
- Сторінка X відкривається на live (не 404)?
- Кожна нова кнопка/feature клікалась (не тільки рендерилась)?
- Response від кнопки видно юзеру (toast / spinner / нові дані)?
- Endpoint API повертає реальні дані, не placeholder?
- DB зміни (нові columns / tables) створені і read-able?
- Sidebar додано link на нову сторінку (інакше Vadym не знайде)?

Якщо хоч одна "не виконано" — sprint НЕ done, це partial ship.

### Документую кожен sprint у форматі:

S4 Phase 1 (commit a7b8ae2):
- Action Bar component:           OK створено + видно на /clients/[id]
- SupplierMatrix component:       WARN створено, але PLACEHOLDER (no data)
- Section action buttons:         WARN візуально, але "Pobierz z KRS" → лише #anchor

→ Phase 1 ship status: PARTIAL (cosmetic-only, не functional)

---

## ПРОТОКОЛ 3 — PROMPT ДЛЯ CLAUDE CODE

### Правила формату:
1. STEP 0 — sanity check — Claude Code дивиться що вже є, до зміни.
2. PHASES — кожна фаза розбивається на окремі commits (1 commit = 1 концепт).
3. NON-GOALS — явно перелічую що НЕ робимо в цьому sprintі.
4. ASK BEFORE PROCEEDING IF — критерії при яких Claude Code зупиняється і питає.
5. PROTOCOL — як рапортувати progress (OK / WARN / FAIL для кожного step).

### Приклад скелету:

Sztab Sprint S5 [Phase A]: <зрозуміла назва що робимо>

TASK
<конкретно що треба зробити, 3-5 sentences>

NON-GOALS
- NIE <feature 1 яка НЕ в скоупі>
- NIE <feature 2 яка НЕ в скоупі>

STEP 0 — SANITY CHECK
1. <що подивитися в репо>
2. <як перевірити що предумова є>
3. STOP — report → чекай Vadym GO

STEP 1 — <назва>
<що зробити>
<з якими файлами>

VALIDATE BUILD
1. npx tsc --noEmit → exit 0
2. pnpm run build → "Compiled successfully"

COMMIT + PUSH
git commit -m "<conventional message>"

PROTOCOL
N steps, X commits.
STEP 0 → STOP, чекай GO.
Кожен step з OK/WARN/FAIL.
STOP на FAIL або ambiguity.

---

## ПРОТОКОЛ 4 — POST-SHIP VERIFICATION

Коли Claude Code звітує "Sprint S4 done":

### Я (Claude в claude.ai) роблю:
1. Открываю кожну змінену сторінку через browser MCP
2. Клікаю кожну нову кнопку
3. Записую що насправді бачу (screenshot або get_page_text)
4. Порівнюю з sprint description — що було обіцяно vs що працює
5. Звіт Vadymу:
   - Працює: <list>
   - Частково: <list of partial/cosmetic>
   - Не працює / зламано: <list>
   - Не findable (sidebar gap): <list>

Тільки після цього sprint вважається DONE.

---

## ПРОТОКОЛ 5 — MEMORY HYGIENE

### Memory зберігає:
- Стратегічні рішення (Phase 1 trader, юр. структура)
- Юр. ідентифікатори (NIP, Allegro client_id)
- Major decisions з timestamp
- Pointer на docs/sztab-state.md (актуальний стан) — НЕ копія
- НЕ feature implementation status — він застаріває швидко

### Тому:
- При питанні "що Sztab уміє" — не дивлюсь у memory, дивлюсь на live + docs/sztab-state.md
- Memory використовую для контексту WHY, не WHAT
- Memory entry для feature status формату: "Audit dd.mm.yyyy: см. docs/sztab-state.md"

---

## ПРОТОКОЛ 6 — МОВА І ТОН

### Стандарт спілкування з Vadymом:
- Чиста українська, без польсько-англійського code-switch
- Польські технічні терміни OK тільки коли вони фігурують в UI Sztab (Sprawozdania, Klienci, Sprzedaż)
- Англійські терміни OK для tech (commit, endpoint, API)
- Короткі речення, прямі заяви
- Не "розмазувати" — якщо щось не працює, кажу прямо
- Не використовувати emoji крім OK / WARN / FAIL для статусу

### Якщо Vadym мене critique-ить:
1. Не виправдовуюсь
2. Визнаю помилку конкретно ("я сказав X, реальність Y")
3. Виправляю одразу
4. Записую failure mode у цей документ як новий протокол

---

## ПРОТОКОЛ 7 — ENERGY MANAGEMENT

### Коли заходимо в багатофазний sprint:
- Я НЕ почну новий sprint якщо попередній має open FAIL або WARN
- Я НЕ робитиму parallel sprintы
- Перший пріоритет завжди — fix gaps в існуючому, тоді розширення
- Якщо browser MCP лагне 3+ рази підряд — зупиняюсь, не товчу

### Decision matrix перед новим sprintом:
Чи всі попередні sprints мають OK post-ship verification?
  YES → можна планувати новий
  NO  → спершу fix existing, тільки потім новий

---

## ПРОТОКОЛ 8 — КОЛИ Я ПОМИЛЯЮСЯ

### Failure modes які я уже зробив (історичні):
1. 30.04 ввечері: описав "що Sztab уміє" з памяті, пропустив /intelligence/lookup і Apify_GMaps. Vadym правильно critique-ув.
2. 30.04 ввечері: відповів польсько-українським миксом, Vadym правильно поскаржився.
3. 30.04 раніше: записав у memory "Sztab=sp.z o.o." — то моя hallucination, Sztab = бренд під Ziomek Fish.
4. 01.05 ранок (Audit #1): знов почав писати з памяті у відповіді про gaps, Vadym вмів це зловити.
5. 01.05 ранок (Audit #1): перевіряв ТІЛЬКИ sidebar pages, пропустив 5 прихованих (/intelligence, /intelligence/prospects, /matches, /handoff/pikniko, /admin/health). Audit #2 виявив це.
6. 01.05 ранок: вигадав "/matches/global" як URL — ця сторінка НІКОЛИ не існувала в коді, це memory hallucination.
7. 01.05 ранок: при пасті PowerShell блоків ламав markdown через triple backticks всередині heredoc — забирати їх повністю.

### Anti-patterns які тепер блокую:
- "Sztab має X" без перевірки — STOP, спершу дивись live
- "Це працює" без кліку — STOP, клікай
- "Memory summary каже" — STOP, memory ≠ truth, тільки intent
- "В одному з sprintів ми робили..." — STOP, sprintы могли регресувати, перевір на live
- "/url не існує" без ls в репо — STOP, спершу подивись pages у app/(dashboard)/ і routes у app/api/
- "Регресія в 404" без перевірки git history — STOP, могла бути hallucination
- Польсько-українська мова — STOP, переписую чистою українською
- PowerShell блоки з вкладеними triple backticks — STOP, тільки plain text всередині heredoc

---

## ПРОТОКОЛ 9 — ФАЙЛИ В РЕПО

Структура:

sztab/
  docs/
    README.md                  — index
    sztab-state.md             — canonical state (revised after every audit)
    sztab-protocols.md         — цей файл
    sztab-sprints.md           — active sprint plan + history
    sztab-audit-log/
      2026-05-01-09-55.md      — Audit #1 (incomplete, для history)
      2026-05-01-11-00.md      — Audit #2 (revised, comprehensive)

Коли Vadym готовий — він через Claude Code робить:
git add docs/
git commit -m "docs: <description>"
git push

---

## ПРОТОКОЛ 10 — DISCOVERY LOG (NEW)

Кожна нова знахідка про продукт ЗОБОВ'ЯЗАНА йти у файли, не залишатися "у голові Claude".

### Що рахується як знахідка:
- Нова сторінка яку я раніше не знав (через ls app/(dashboard)/)
- Нове API endpoint (через ls app/api/)
- Нова кнопка яка робить unexpected action (наприклад "Sprawdź BZP" редіректить на lookup)
- Bug який я вперше побачив на live
- Capability яку Vadym не знав (наприклад /intelligence/prospects з 99 записами)
- Структурний паттерн (наприклад "5 сторінок сховано в sidebar" = navigation gap)

### Workflow при знахідці:
1. Verify — перевірити live + repo, не з памяті
2. Write down одразу:
   - Update docs/sztab-state.md (відповідна секція)
   - Якщо mind-shift → update docs/sztab-protocols.md (новий протокол або update existing)
   - Якщо це міняє sprint plan → update docs/sztab-sprints.md
3. Memory entry — короткий high-level pointer ("Audit #N виявив X, см. docs/sztab-state.md")
4. Show to Vadym — recap у чаті щоб переконатися що він в курсі

### Anti-patterns що блокую:
- "Я знайшов X, продовжую" без write to docs — забудеться через 30 хв
- "Розкажу Vadymу через chat і все" — наступна сесія Claude не буде знати
- Знахідка в чаті без commit в репо

### Recovery from past misses:
Якщо в Audit #N виявив що audit #(N-1) пропустив critical findings — створюю новий audit-log entry з timestamp і label "REVISED", старий не видаляю (для history).

---

## ПРОТОКОЛ 11 — STRATEGY UPDATES (NEW)

Коли знахідка міняє стратегічне розуміння — це йде окремо від feature inventory.

### Що рахується як strategy shift:
- Re-prioritization sprint plan (Sprint S5 = Navigation Fix, не Build Bulk Import)
- Re-categorization gaps (Vadym frustration was navigation, not features)
- Changed assumption про Vadym workflow
- New insight про competitive moat
- Reversal of previous decision

### Workflow при strategy update:
1. Recap старого розуміння — що думали раніше і чому
2. Recap нового — що тепер знаємо і звідки evidence
3. Implications — що це міняє в short-term і long-term
4. Update docs/sztab-sprints.md з новим plan
5. Memory entry з timestamp і label "STRATEGY SHIFT dd.mm.yyyy"
6. Visualize шифт для Vadymа в чаті — таблиця "було vs стало"

### Приклад (01.05.2026 Audit #2):

| Раніше думали | Тепер знаємо |
|---|---|
| Vadym frustration = немає features | Vadym frustration = features сховано від нього |
| Sprint S5 = Build Bulk Import | Sprint S5 = Navigation Fix + 2 quick UX |
| /matches/global регресія | /matches/global — моя hallucination |
| Tavily критичний gap | Tavily — наступний phase, не блокер |

### Anti-patterns:
- "Просто продовжуємо" коли знайшли strategy shift — це ріалити distortion
- Strategy update тільки в memory без docs — не зберігається для нових сесій
- Recap без implications — Vadym не знає що тепер робити

---

## ПРОТОКОЛ 12 — НОВИЙ ЧАТ ENTRY POINT (NEW)

Коли Vadym відкриває новий чат з Claude (claude.ai), Claude робить ось так як ПЕРШІ дії перш ніж відповідати на questions про продукт:

1. Read docs/sztab-state.md — поточний stan
2. Read docs/sztab-protocols.md — самопам'ятка протоколів
3. Read docs/sztab-sprints.md — поточний sprint plan
4. Read останній audit-log entry — що нового з останнього audit-у

Тільки після цього Claude відповідає на запитання Vadym.

### Як саме читати:
- conversation_search НЕ заміняє docs (memory ≠ docs)
- Claude Code в Chrome може через GitHub web access читати файли (vadymrotai-dot/sztab → docs/)
- Або Vadym робить cat docs/sztab-state.md і paste у чат

### Failure mode без цього протоколу:
- Claude знов починає писати з памяті (як 30.04 ввечері)
- Vadym має повторно вчити Claude що вже зрозуміли
- Час витрачається на повторне відкриття того що вже задокументовано

---

END OF PROTOCOLS (12 total).


---

## ПРОТОКОЛ 13 — UX PATTERN: TWO FUNDAMENTAL ANALYSIS BUTTONS (NEW 01.05.2026 evening)

Sztab UX базується на двох fundamental кнопках на двох центральних entity views.

### Дві fundamental кнопки:

**1. "Аналіз клієнта"** на /clients/[id]
- One click → запускає ВЕСЬ analysis pipeline для цього клієнта
- Підтягує всі джерела які є для клієнтів: KRS, GUS, GUS_branches, VAT_BL, BZP, CRBR, Apify_GMaps, Apify Panorama, Tavily web search, Allegro presence

**2. "Аналіз товару"** на /produkty/[id]
- One click → запускає ВЕСЬ analysis pipeline для цього продукту
- Підтягує всі джерела які є для продуктів: matching candidates, Apify pricing comparisons, Allegro listings, OpenFoodFacts, Tavily search для buying signals

### Pipeline architecture (КРИТИЧНО):

PHASE 1 — Data sources (паралельно або серіально, але БЕЗ AI):
- Всі raw data fetchers крутяться першими
- Toast progress per source
- Не запускати AI на цьому етапі

PHASE 2 — AI на основі ГОТОВИХ даних (ТІЛЬКИ ПІСЛЯ Phase 1):
- AI re-score matching
- AI business analysis
- AI cold opener generation
- AI працює з повним contextom з усіх джерел

**WHY це важливо:** якщо AI запускається паралельно з джерелами, він аналізує неповні/застарілі дані → garbage in → garbage out. AI має останнє слово в pipeline, не перше.

### Per-source кнопки залишаються:
Окремі кнопки (наприклад "Pobierz z KRS", "Sprawdź BZP", "Wygeneruj cold opener") НЕ видаляємо — вони для specific cases (refresh тільки одного джерела, regenerate тільки cold opener). Але головний flow Vadym = одна fundamental кнопка.

### Anti-patterns які блокую:
- Пропонувати "Run All Sources" як окрему кнопку без чіткої seriaлізації AI ПІСЛЯ — STOP
- Запускати AI re-score паралельно з джерелами — STOP
- Робити granular checkbox UI "виберіть джерела" як головний UX — STOP (це advanced mode, не основний)
- Думати про окремі джерела як "feature" — STOP, джерела це raw data layer, fundamental UX = aggregated buttons

### Implementation hints для майбутніх sprintів:
- Phase 1 джерел можна зробити паралельно через Promise.allSettled (швидше) АБО серіально (легше debug). Test both.
- Між Phase 1 і Phase 2 — checkpoint "all sources done" event перш ніж AI starts
- UI показує progress bar з 2 фазами: "Pobieranie danych (X/Y źródeł)..." → "Analiza AI..."

### Discovery context (01.05.2026):
Vadym сформулював це принцип evening session, після того як Sprint S5C (Tavily) був заплановано. Це ПРИНЦИП, не feature — впливає на всі майбутні sprintы.



---

## PROTOCOL 8 — UPDATE 01.05.2026 evening

### Failure mode #8 (NEW):
**01.05.2026 evening:** прийняв звіт Claude Code "Tavily working" як success без власної верифікації на live. Vadym зловив питанням "ти сам перевіряв чи знову не по протоколу робиш?".

Конкретно:
- Claude Code report-нув "5 success runs у enrichment_log"
- Я записав це як verification, не клікнув на профіль клієнта
- Реальна verification (post-correction) показала Tavily в "Źródła analizy" 
  на KOZAK profile — Tavily реально працює, але це я мав побачити САМ ВІДРАЗУ

### Anti-pattern (NEW):
- Claude Code звітує "це працює" → я записую success → STOP
- Правильно: Claude Code звітує → я через browser MCP клікаю на UI artefact 
  де результат має з'явитися → побачив → записую success
- Логи в БД = evidence що call виконався, але НЕ evidence що user-facing 
  output працює. Завжди перевіряти на UI.


---

## Protocol 14 — Git Operations Boundary

Cowork sandbox bash через virtiofs має dentry cache conflicts при git writes у .git/ (validated 01.05.2026). Stale .git/index.lock blocking subsequent operations з EEXIST.

ДОЗВОЛЕНО Cowork: git status, git log, git diff, git show, git blame, git ls-files, git config --get

ЗАБОРОНЕНО Cowork: add, commit, push, pull, fetch, merge, rebase, checkout, stash, reset, tag, branch (create/delete)

Pattern: Cowork edits files → suggests commit message → Vadym виконує commit+push з PowerShell.

Diagnostic ready: handle.exe installed, Defender exclusion C:\Users\vadym\Projects, diagnose-lock.ps1 pattern.

---

## Protocol 15 — Hybrid Matching Philosophy

Matching клієнт↔товар у Sztab = **Algorithm + AI + Feedback Loop + Knowledge Bootstrapping**. AI не замінює algorithm, AI тюнить його з часом на основі реальних результатів і curated знань про domain.

**Архітектура (3 layers):**
- L1 Algorithm: deterministic rules (lib/matching/scoring/), transparent score, fast, debuggable. Це backbone.
- L2 AI tuning: коригує algorithm параметри. Поетапно: Phase 1 (зараз → 6м) тільки existing weights. Phase 2 (6-12м) + thresholds. Phase 3 (12м+) + нові правила.
- L3 Feedback signals: Vadym manual rating (high weight), реальні outcomes (deal closed, response rate), Pikniko handoff success, knowledge bootstrapping (curated articles/books/news про HoReCa/B2B/польський market як retrieval context).

**Decision authority:** AI пропонує → Vadym approve/reject. Завжди. Auto-apply заборонено до Phase 3.

**Cadence:** Weekly batch (cron в неділю ввечері). Виключення — explicit thumb up/down від Vadym = real-time як strong signal.

**Anti-patterns (blocked):**
- AI переписує algorithm structure без OK
- Auto-apply без human approval
- Real-time learning для всіх signals (тільки weekly batch + manual ratings real-time)
- Black-box AI scoring без algorithm backbone

**Calibration before launch:** Strategic intent — Sztab проводить місяці calibration з curated knowledge перш ніж приймати real customer feedback. Competitive moat через patience.

### Decision Framework — Locked 02.05.2026

Foundation decisions від Discovery #5 (Vadym + Claude):

**Architecture orientation:** Food-first з ready-for-extension structure (Option Z). Build full food intelligence, але `commodity_prices` + `market_signals` tables мають `category` column від початку. Non-food modules (косметика, одяг, електроніка) — окремі plugins через 6-12+ місяців після food production proof.

**Geographic scope:** Poland-only (Phase 1). EU expansion deferred до post-MVP. Все matching, sources, AI prompts — PL context tylko. Pikniko-aligned.

**Monthly data budget:** $20-100 tier (Apify scrapers + free open data sources). Critical exceptions allowed якщо unblocking.

**Update cadence:** Hybrid:
- Weekly cron (Sunday evening) → ZSRIR, EU agri-food observatories, fresh-market.pl, GUS BDL, dane.gov.pl. Бо самі джерела публікуються weekly або lag-ом.
- On-demand при кліку "Аналіз товару" → Allegro listings, Ceneo, Eurocash/Makro/Selgros catalogs, Tavily product mentions. Бо payload per-SKU, не варто pre-scraping.
- Daily — нічого зараз. Reserved для future critical commodities.

**Knowledge bootstrapping priorities (Phase 1):**
1. Polish food market price history (5+ years) — raw data для AI calibration
2. Competitor analyses — хто реально на ринку, їхні products + pricing
3. Catering/restaurant business model analyses — як HoReCa закуповуються

Решта categories (industry trends, regional preferences, B2B negotiation books, food regulations) — defer до Phase 2-3 на основі gaps які знайдемо в AI output.

**Language priority:**
- Polish primary (наш market)
- Ukrainian secondary (Vadym native, частина sources)
- English tertiary (global benchmarks, EU regulations)

**Pricing comparison depth:** All three layers (D з Q4):
- Wholesale (ZSRIR, Bronisze, EU observatories) — як ми продаємо до B2B
- Retail/consumer (Allegro, Ceneo, supermarkets) — як кінцевий споживач бачить
- Distribution channel (Eurocash, Makro, Selgros catalogs) — як distributors пропонують далі. Це показує наш position vs intermediaries.

Reference: docs/sztab-product-intelligence-spec.md (детальний breakdown sources + data dimensions).

**Reference:** docs/sztab-matching-philosophy.md (детальний breakdown).


---

## ПРОТОКОЛ 16 — COWORK SANDBOX FILE CACHE STALE (NEW 02.05.2026)

Cowork bash/grep tools періодично показують файл коротшим або обірваним після Edit operation. Це **false alarm** — virtiofs cache між sandbox + host stale, реальний файл на диску цілий.

### Symptom
- `wc -l file.ts` через bash → returns N
- Native PowerShell `(Get-Content file.ts).Count` через PowerShell → returns N+M (правильне число)
- `tail file.ts` через bash → cuts mid-sentence на startовій lineі
- Read tool через Cowork file system читає правильно (different cache path)

### Root cause
Cowork sandbox bash mounts repo через virtiofs. Cache invalidation lag після Edit tool writes — bash sees stale state, не fresh disk content. Read tool використовує different access path → bypasses cache.

### Resolution

**❌ DO NOT** restore файл на основі sandbox bash output. Це може реально зламати файл, додавши content поверх вже-existing data.

**✅ DO** verify через native PowerShell перш ніж panic:
```powershell
(Get-Content C:\Users\vadym\Projects\sztab\path\to\file.ts).Count
Get-Content -TotalCount 5 file.ts -Tail 5  # last 5 lines
```

### Anti-patterns (blocked)

- "Truncation alarm" → restore through git → losing real edits
- Trust bash `wc -l` як authoritative для post-Edit verification
- Re-Edit файл "to fix truncation" коли nothing was actually broken

### Documented через
- 02.05.2026 false alarm during Sprint S6A (4 файли "truncated", native PowerShell showed all intact)
- 02.05.2026 false alarm during Sprint S-INTEL.1.1 (lib/types.ts + product-form.tsx — sandbox showed truncation, PowerShell baseline 276/722 правильні)

### Recovery from false alarm
Якщо Cowork already drafted recovery options (Option A restore / Option B diff): STOP перш ніж execute. Native PowerShell verify FIRST. У 100% recorded cases (2/2) — false alarm.

---

## ПРОТОКОЛ 17 — POSTGREST UPSERT vs PARTIAL UNIQUE INDICES (NEW 02.05.2026)

Anti-pattern: створити partial UNIQUE INDEX (з `WHERE` clause) + використати PostgREST `.upsert(onConflict='cols')` проти нього. **Не працює архітектурно.**

### Symptom
```
error 42P10: "there is no unique or exclusion constraint matching the
ON CONFLICT specification"
```
Під час `pg_indexes` показує partial UNIQUE indices правильно створеними і column list матчить.

### Root cause
PostgREST `.upsert()` `onConflict` parameter вимагає physical UNIQUE або PRIMARY KEY constraint на raw columns. Partial indices (`WHERE clause`) НЕ recognized як valid conflict targets, навіть якщо column list matches.

Це **архітектурне обмеження PostgREST бібліотеки** (не Postgres, не migration issue, не bug).

### Resolution

**Опція А (recommended для small-batch):** Manual INSERT loop з catch на error code 23505 (unique_violation):

```typescript
for (const record of records) {
  const { error: insErr } = await supabase
    .from('table')
    .insert(record)
  if (insErr) {
    if (insErr.code === '23505') {
      result.rows_skipped++  // idempotent skip
      continue
    }
    result.errors.push(`...${insErr.message}`)
    result.rows_failed++
    continue
  }
  result.rows_inserted++
}
```
Postgres сам enforces partial constraint при INSERT — PostgREST onConflict syntax не потрібен. Performance: ~3x slower vs bulk upsert (per-row × ~50ms RTT). Прийнятно для <100 rows (<3 sec).

**Опція Б (recommended для large-batch):** Replace partial indices на full UNIQUE constraint. Потребує NOT NULL на всіх ключових columns (default values якщо не nullable). Compatible з bulk upsert, faster, але loses conditional uniqueness semantics.

**Опція В (для high-volume):** Bulk INSERT, on 23505 split chunk у half (bisect retry). ~log2(N) inserts замість N. Складніше але масштабується.

### Anti-patterns (blocked)

- Trust migration check ("indices created successfully") як доказ що upsert працюватиме
- Try `onConflict='constraint_name'` замість column list — same 42P10 error
- Add ON CONFLICT INFER syntax ($1, $2) — НЕ works through PostgREST

### Documented через
- 02.05.2026 Sprint S-INTEL.1.2.1 hotfix v2 — migration 054 створила 2 partial UNIQUE indices (with_market / no_market), PostgREST upsert все одно throw 42P10
- Resolution shipped: manual INSERT loop у `lib/intelligence/zsrir.ts` ingestZsrir()

### Implications для майбутніх sub-sprints
- S-INTEL.1.2.2 (fresh-market.pl) — використати manual INSERT pattern одразу
- S-INTEL.1.2.3 (EU Agri-food) — same
- Будь-яка нова table з conditional uniqueness — design constraint type перш ніж писати code (А/Б/В per scale)

---

## ПРОТОКОЛ 18 — XLSX PARSER REQUIRES DIAG-FIRST (NEW 02.05.2026)

Anti-pattern: писати xlsx parser на основі assumptions про структуру file (header position, column indices, sheet count). Реальні xlsx файли — особливо польських державних публікацій (ZSRIR, GUS, MRiRW) — часто мають сюрпризи.

### Symptom
- Parser повертає 0 rows (assumption: header у row 0; реальність: row 5+)
- Parser extracts wrong data (assumption: markets у одному row; реальність: 3-row header markets/dates/units)
- Parser падає silently на specific xlsx variants (assumption: 1 sheet; реальність: 28 sheets з різними structures)

### Root cause
Government data publications часто мають:
- Multi-row headers (markets row + dates row + units sub-header)
- Hidden sheets з aggregate data
- Mixed units (kg, 100kg, szt., pęczek, l, 100l) per row
- Regional sub-categories (Voivodships, foreign trade, retail vs wholesale)
- Filename patterns що змінюються рік-до-року
- Excel merged cells що ламають column indexing

Assumption-based parsing → 3+ ітерації hotfix, кожна на основі неправильних здогадок.

### Resolution

**Завжди створити diag-script ПЕРШ ніж писати parser:**

```typescript
// scripts/diag-{source}.ts pattern:
// 1. Auto-find latest xlsx у scripts/cowork/
// 2. Per sheet dump:
//    - Sheet name + total rows + max columns
//    - First 15 rows (raw cells preview)
//    - Label keyword hits per column (with examples)
//    - Price candidate hits per column (numeric у range)
//    - Header row guesses (text-cell density ranking)
// 3. Output structured console.log
```

### Workflow

1. Vadym downloads xlsx через PowerShell (sandbox network blocked для PL gov domains)
   ```powershell
   Invoke-WebRequest -Uri $file_url -OutFile scripts/cowork/source-name-{date}.xlsx
   ```
2. Cowork creates `scripts/diag-{source}.ts`
3. Vadym runs diag, paste output до chat
4. Cowork updates parser based on REAL structure
5. Single commit з diag + parser update

### Anti-patterns (blocked)

- Writing parser на основі "typical Excel structure" assumptions
- Skipping diag step для "simple" xlsx files (вони rarely simple)
- Trusting filename pattern (вони змінюються season-to-season)
- Hardcoding column indices без verifying live structure

### Documented через
- 02.05.2026 Sprint S-INTEL.1.2.1 — ZSRIR HURT WARZ парсер потребував **3 ітерації hotfix** через wrong assumptions:
  - v1 (initial): generic header detection через label/price hints — 0 rows extracted
  - v2: header detection fix після diag — все ще пomилкове розуміння structure
  - v3: BUG 1 fix після DB inspection (markets extracted from dates row) — нарешті correct 3-row header (markets / dates / units)
- 4 hours wasted across 3 ітерацій що могли б бути saved 30 хв diag-first

### Performance trade-off
- Diag script: +30 хв upfront (write + Vadym execute + paste)
- Saved hotfix iterations: 3-5 hours typical
- Net positive ROI на parser tasks де structure не obvious

---

## ПРОТОКОЛ 19 — DAILY PLAN + EVENING RECONCILIATION (NEW 03.05.2026)

Кожен робочий день має ранкове планування (~10 хв) і вечірню звірку. Без цього scope tracking + estimate calibration залишаються невидимими, а patterns відкриваються із запізненням.

### Mechanism

- **Ранок (~10 хв):** Vadym + Claude разом обирають 2-4 пріоритети + estimates. Запис у `docs/sztab-state.md` як секція `## YYYY-MM-DD — DAILY PLAN`.
- **Вечір:** звірка у `docs/sztab-state.md` як секція `## YYYY-MM-DD — EOD RECONCILIATION`. Що завершили (commits + scope), що не встигли + чому, estimate accuracy (planned X / actual Y), surprises / scope creep, lessons для майбутніх planning rounds.

### Format ранкового плану

```markdown
## 2026-05-XX — DAILY PLAN

Goals (priority order):
1. [Sprint name] — [scope] — [Claude estimate]
2. ...

Out of scope (consciously deferred):
- ...

Constraints today:
- Available focus hours: X
- Vadym blockers: ...
```

### Format вечірньої звірки

```markdown
## 2026-05-XX — EOD RECONCILIATION

Shipped:
- commit hash + scope (vs plan)

Deferred / Carry-over:
- item — reason

Estimate accuracy:
- Planned: Xh / Actual: Yh / Multiplier: Y/X
- Lessons: ...

Surprises:
- ...

Tomorrow's seed (optional):
- ...
```

### Why this protocol matters

- 02.05.2026 day shipped 13 commits, але estimates були ~1.7-2x optimistic (planned 14h, actual 8.5h — Cowork+Claude+Vadym parallel, але hotfixes не оцінені).
- Без daily reconciliation — patterns виявляються із запізненням (estimate drift, hotfix overhead, parallel work multiplier).
- Protocol 19 робить scope tracking + estimate calibration візуальним — кожен день має закриття.

### Anti-patterns (blocked)

- Стартувати день без ранкового плану ("просто почну з того що недоробив вчора") — STOP, спершу 10 хв planning round.
- EOD без reconciliation ("завтра напишу") — STOP, без свіжого recap lessons губляться.
- Planning без estimate ("просто зробимо") — STOP, без planned hours немає baseline для accuracy multiplier.
- Estimate без actual tracking — STOP, multiplier це core signal протоколу.

### Connection до інших протоколів

- Protocol 4 (Post-ship verification): EOD reconciliation спирається на real ship status, не на Claude Code self-report.
- Protocol 5 (Memory hygiene): Daily plan + EOD entries живуть у `docs/sztab-state.md`, не в memory. Memory тільки pointer.
- Protocol 10 (Discovery log): Surprises у EOD — це trigger для discovery log entry якщо знахідка структурна.



## PROTOCOL 20 — UNIFIED INTELLIGENCE ENGINE ARCHITECTURE

**Locked:** 03.05.2026 by Vadym ("правильно з першого разу")
**Supersedes:** Sprint S6A/S6B planning з окремими engines per entity (SCRAPPED)

### Принцип

Sztab Intelligence Engine — **ОДИН** core engine для всіх 4 entity types (client, product, market, strategy), НЕ окремі engines per domain.

### Архітектура

```
sztab-intelligence-engine/
├── core/
│   ├── orchestrator.ts          ← shared source coordination
│   ├── scoring-pipeline.ts      ← shared L5/L6/L7 pattern
│   ├── ai-prompt-templates.ts   ← shared prompt patterns
│   ├── cache-layer.ts           ← shared dedup/cache
│   └── modes/
│       ├── existing-mode.ts     ← scope=existing (process DB)
│       ├── registry-mode.ts     ← scope=registry (CEIDG/KRS bulk)
│       └── combined-mode.ts     ← scope=both (smart merge)
├── entities/
│   ├── client/
│   │   ├── sources.ts           ← discovery + enrichment matrix
│   │   ├── scoring-rules.ts
│   │   └── ai-context.ts
│   ├── product/
│   ├── market/
│   └── strategy/                ← cross-entity composition
└── api/
    └── analyze.ts               ← single endpoint
```

### 3 Modes (всі доступні одночасно)

**Mode A — Existing:**
- Process entities ВЖЕ у DB
- Daily outreach planning
- UI: "Опрацюй мою базу" на /pulpit

**Mode B — Registry:**
- Filter CEIDG/KRS by criteria
- Bulk score, auto-add high-score (>70) як prospects
- Weekly pipeline filling
- UI: "Знайти нових в реєстрах"

**Mode C — Combined (default):**
- Both existing entities + new high-score prospects
- Unified ranked output
- Daily intelligence cycle
- UI: "Пошук фірм" з filter form

**Plus: Sequential pipeline cron** — overnight batch combining all 3.

### Чому unified а не separate

- Code reuse 60-70% — orchestration, retry, cache, AI patterns
- Cross-entity insights можливі (product↔client matching one pass)
- Vertikали (cosmetics, electronics) додаються як новий profile 2-4h
- Маркетинговий argument: "один розумний engine для бізнесу"
- Sztab core moat — це і є те що відрізняє від generic CRM

### Anti-pattern якого уникаємо

**Не робимо "S6A швидко, потім refactor у unified".** Це створює архітектурний дебт. Unified будуємо з самого початку.

### Implementation order

1. S-CORE.1 (5-7h) — Build core (orchestrator + pipeline + AI templates + 3 modes)
2. S-CORE.2 (3-4h) — Wire client profile (port intelligence/lookup logic)
3. S-CORE.3 (4-6h) — Wire product profile (включно з PIL-2d outreach)
4. S-CORE.4 (3-4h) — Wire market profile
5. S-CORE.5 (4-5h) — Wire strategy profile (cross-entity)

**Total:** ~19-26h. Cosmetics/electronics майбутні vertikали = 2-4h per profile.

---

## PROTOCOL 21 — SOURCES TAXONOMY (Discovery vs Enrichment)

**Locked:** 03.05.2026

### Two source classes

Кожна entity має дві категорії sources:

**Discovery sources** (для Mode B — registry) — knaйти НОВИХ candidates:
- Bulk filtered queries
- Output: list of N candidates by criteria
- Example для client: CEIDG bulk, KRS bulk, Google Maps places search, Tavily search by criteria, BZP tenders, LinkedIn search, PKT.pl, branżowe katalogi
- Example для product: Apify category browsing, Tavily product search, Open Food Facts category, Allegro listings

**Enrichment sources** (для Mode A — existing) — поглиблення вже відомого:
- Per-entity lookup
- Output: deep profile of 1 entity
- Example для client: rejestr.io, GUS BIR, VAT BL, Tavily extract by name, Apify Maps lookup, KRD/BIG, BZP per NIP
- Example для product: OFF EAN lookup, Allegro/Ceneo per product, Ceneo reviews, gazetki search

### Some sources serve обидві задачі

- Tavily — bulk search (discovery) + extract per URL (enrichment)
- Google Maps — places search by criteria (discovery) + place details by ID (enrichment)
- KRS rejestr.io — list filter (discovery) + per-NIP lookup (enrichment)

### Per-entity matrix

Кожен entity profile має `sources.ts` з двома таблицями:
```typescript
export const clientSources = {
  discovery: [...],   // for registry mode
  enrichment: [...],  // for existing mode
}
```

Engine routing:
- Mode A → use only enrichment sources on existing entities
- Mode B → use only discovery sources, output candidates
- Mode C → use enrichment sources on existing + discovery sources for new candidates → merge

### NEW рекомендація для product entity (з discovery 03.05)

🆕 **PIL-2d Outreach Pricing** — окремий sub-source class:
- Direct email/phone до wholesalers
- AI-generated email templates
- Inbox monitoring + AI parsing oferty
- Phone follow-up scripts

Це не fits ні в discovery ні в enrichment cleanly — це **outreach** як шлях отримання даних. Treat як окремий source class у sources.ts.

---

## END OF PROTOCOLS 20-21

## PROTOCOL 22 — MATRIX SCORING MODEL

**Locked:** 03.05.2026 by Vadym ("один клієнт може мати 80 на ЧМ, 20 для ложки з медом і 70 для wędlin")
**Supersedes:** Sprint F V1/V2 client-level scoring concept (всі клієнти отримували єдиний score)

### Принцип

**Скор — це властивість пари клієнт×товар, НЕ клієнта окремо.**

Один і той самий клієнт має N різних скорів — по одному на кожен товар у нашому асортименті.

### Архітектурна реалізація

**Логіка скорингу ЦЕНТРАЛІЗОВАНА у `entities/product/scoring-rules.ts`:**

```typescript
computeMatchScore(product: Product, client: Client, context): MatchResult
```

**Клієнтський engine НЕ скорить самостійно** — викликає товарний engine у циклі для кожного продукту в нашому асортименті:

```typescript
matrix = allProducts.map(p => productScoring.computeMatchScore(p, client, ctx))
```

### Implications для UI

**Сторінка /clients/[id] — БЕЗ єдиного скору:**
- Профіль (8 шарів CIL)
- Матриця матчів (товар × % match)
- Top recommendation card

**Сторінка /produkty/[id] — головний "продаючий" інструмент:**
- Кнопка "Знайти клієнтів для цього товару"
- Ranked топ-100 з % match
- Сегментація hot/warm/cold + стратегія per segment

**Сторінка /rynek/[product_id]:**
- TAM/SAM/SOM аналіз
- Match distribution histogram
- External market context

### Implications для Mode B (registry discovery)

**Раніше:** алгоритм скорить candidates → high-score auto-add як Tier A.
**Тепер:** додаємо ВСІХ валідних кандидатів (тільки фільтр active VAT + non-wykreślona). База = універсальний asset. Скор з'являється тільки при "Аналіз товару".

### Що скасовано

- Концепт "Tier A/B/C" як постійних tiers клієнтів
- "score >= 70 → Tier A" auto-add у Mode B
- Manual review у Mode B по threshold (немає threshold)
- Глобальний "score клієнта" як єдина цифра

### Що залишається

- Validation фільтри при додаванні (VAT czynny, не wykreślona) — це не скоринг, це data hygiene
- Loyalty tier multiplier на mережах (Żabka closed, Lewiatan hybrid) — це **per-product scoring модіфікатор**, не tier клієнта
- Існуюча логіка з matches table — переписується але data preserved

### Anti-pattern якого уникаємо

❌ "Цей клієнт має score 80 → tier A → додай у когорту"
✅ "Цей клієнт має 80% match для ЧМ → у hot segment для цього товару → cold call pitch"

### Backward compatibility

`matches` table зберігається але семантика змінюється:
- Раніше: одна row per (client, current_product_focus)
- Тепер: row per (client, product) — повна матриця

Database migration буде у Sprint S-CORE.3 (після того як товарний engine ready).

---

## PROTOCOL 23 — UI-FIRST DEVELOPMENT

**Locked:** 03.05.2026 by Vadym ("якщо функцію не видно — її НЕМАЄ")
**Triggered by:** Audit #2 (01.05) виявив 5 потужних сторінок СХОВАНИХ від sidebar — це системна проблема, не одинокий баг

### Принцип

**Кожна функція ОБОВ'ЯЗКОВО має план інтерфейсу ПЕРЕД написанням коду.**

UI-first, не code-first. Якщо функцію не видно у меню/головній сторінці — її технічно немає, незалежно від того скільки коду під капотом.

### Що рахується як "UI план" (sprint planning checklist)

Перед стартом sprint обов'язково відповісти на 5 питань:

1. **Де знаходиться кнопка/посилання на нову функцію?** (точна сторінка + позиція)
2. **Як до неї потрапити з головної сторінки?** (скільки кліків)
3. **Що бачить користувач який заходить вперше БЕЗ контексту?** (новий користувач за 30 секунд)
4. **Як зрозуміти що функція виконалась?** (повідомлення, оновлення даних, перенаправлення)
5. **Як знайти результат функції пізніше?** (історія, бейджик, окрема сторінка)

Якщо хоч на одне питання немає чіткої відповіді — sprint **не починається**.

### Тест "30-секундного користувача"

Уяви випадкову людину яка зайшла на сайт. Вона **не знає** що таке Pikniko, Czudowa Marka, kiszone ogórki, hurtownia, KRS.

**Питання:** за 30 секунд **сама** вона зрозуміє що сайт робить і що з ним можна робити?

Якщо ні — UI провалений. Незалежно від того скільки потужних функцій під капотом.

### Workflow тестування

**Первинна перевірка (Cowork):**
- Я (Cowork) проходжу через сайт у incognito browser session
- Записую кожне місце де "не зрозуміло куди далі"
- Кожен незрозумілий термін
- Кожну порожню сторінку
- Складаю звіт з конкретними проблемами

**Підсумкова перевірка (Vadym):**
- Vadym дивиться звіт Cowork
- Може дати сайт сторонній людині (друг, родич) для cross-check
- Затверджує або вимагає виправлень

### Sprint plan template — обов'язкова секція UI

Кожен sprint plan містить секцію:

```
## UI ПЛАН

### Точка входу
- Сторінка: [path]
- Елемент: [кнопка/посилання + позиція]
- Іконка + текст підказки

### User flow
1. Користувач кліче [елемент]
2. Бачить [результат A]
3. Через [час] бачить [результат B]
...

### Як знайти результат пізніше
- [бейджик / історія / окрема сторінка]

### Тест 30-секундного користувача
- Що бачить новий користувач відкривши сайт
- Чи зрозуміло куди далі без пояснень

### Edge cases UX
- Що якщо запит занадто довгий (timeout)?
- Що якщо немає даних?
- Що якщо помилка джерела?
```

### Failure modes що блокую

❌ "Зробимо API endpoint, потім UI" — це призводить до прихованих функцій
❌ "Vadym знає де це" — Vadym = case A. Не репрезентативно для нових користувачів
❌ "Sidebar додамо потім" — потім = ніколи. Sidebar = частина sprint completion
❌ "Це internal tool, UI не критичний" — Vadym планує SaaS, UI критичний завжди
❌ "Ну функція ж технічно працює" — функції не існує без UI входу

### Anti-pattern recovery

Якщо у sprint plan забули UI секцію:
1. Стоп робота
2. Заповнити UI план
3. Перевірити з 5 питаннями
4. Тільки тоді продовжити кодинг

### Обов'язковий перший крок S-CORE.0

Перед S-CORE.1 (build core engine) — обов'язковий **S-CORE.0 (UI макети)**:
- UI аудит поточного сайту через incognito Cowork
- Макети нових сторінок (статичний HTML/JSX без логіки)
- Макет головної сторінки після додавання нових функцій
- Макет нового sidebar з усіма entry points
- Vadym затверджує макети ПЕРЕД тим як починаємо S-CORE.1

---

## Protocol 24: Filesystem-First Verification Before Planning (04.05)

**Тригер:** перш ніж планувати "наступний sprint" або "next step"

**Дія:**
1. Verify filesystem стан через `git log --oneline -15` + `find -newer`
2. Якщо потрібен UI-related — Chrome MCP read_page sidebar/route
3. Compare actual з memory entry старшим за 24h
4. Якщо discrepancy → update memory ПЕРШ ніж планувати

**Чому:** memory entries часто містять planning intent від попередніх сесій, а не shipped реальність. Сьогодні (04.05) виявлено 2 застарілих memory entries — Sprint S5 Navigation done без commit msg, S-CORE.2 ніколи не існувало (S2B Phase 2 робить ту роботу).

**Прикл уроку 04.05:** я майже планував Sprint S5 Navigation Fix; Vadym попросив verify сам; через Chrome MCP побачив що 5 з 6 hidden pages вже у submenu sidebar. Sprint вже зроблений.

---

## Protocol 25: Cowork as Architecture Peer Reviewer (04.05)

**Тригер:** написання spec промпту для Cowork → виконання

**Дія:**
1. Завжди включати STEP 0 sanity check (read-only audit) у промпт
2. Cowork REPORT з findings + decision points → STOP
3. Чекати моє "GO" перш ніж STEP 1+
4. НЕ skip-ати STEP 0 навіть для "простих" sprints

**Чому:** Cowork постійно ловить runtime issues які я пропускаю у плані. 04.05 sprint count: 5 catches за один день.

**Прикл уроку 04.05:**
- pkd_codes vs pkd_all (schema column на ceidg_prospects) — INSERT би впав з 'column does not exist'
- Partial unique index vs Supabase JS .upsert() incompatibility — runtime "no constraint matching ON CONFLICT" error
- Migration 022 collision з existing 022_extract_krs_from_gus
- KRS API shape mismatch (czy_/w_ field naming, nested teryt)
- enrichment_log CHECK constraint blocked target_type='product'

---

## Protocol 26: Memory ≠ Filesystem Reality Disclaimer (04.05)

**Тригер:** довіра memory entry старшим за 24h без verify

**Дія:**
1. Treat memory entries старші за 24h як plan-vision, не reality
2. Якщо entry мовить про "shipped" — verify filesystem перш ніж плануvati "наступний крок"
3. Якщо entry мовить про architecture decisions ("locked Vadym") — verify що рішення materialized у код

**Чому:** memory entries records intent. Те що було locked у minulu сесію не обов'язково shipped. Filesystem — source of truth.

**Прикл уроку 04.05:**
- Memory #15: "Sztab 03.05 UNIFIED INTELLIGENCE ENGINE locked Vadym" → реальність: S-CORE.1 shipped engine скаффолдинг + 3 modes для bulk, але per-entity workflow живуть на S2B Phase 2 architecture (April-era). Не unified — two patterns by purpose.
- Updated memory #15: "Sztab architecture (REVISED 04.05): TWO parallel patterns by purpose..."

---

## END OF PROTOCOLS 22-26



---

## PROTOCOL 27 — Ziomek Fish reality is north star

**Date:** 05.05.2026

### Принцип

Sztab служить операціям Ziomek Fish, не навпаки. Ziomek Fish — це бізнес з реальними борговими зобов'язаннями (100K нагальних, 250K майбутніх) і ціллю 150-200K маржі/міс через 6 місяців. Все інше — Sztab розробка, маркетинг, marathon-функції — підпорядковується цій реальності.

### Розподіл часу Vadym (на період operations director у Pikniko, 06.05 — 06.08.2026)

- **50%** Pikniko operations director (фізична присутність + координація + sales)
- **30%** Sztab розробка для Pikniko (одночасно ROI для Ziomek через Sztab maturity → перший SaaS клієнт)
- **15%** Ziomek продажі (SpoonJoy launch, Czudowа push, Karol/Cukiernia LOIs)
- **5%** інше (юр-формальності, ad-hoc)

### Заборонено

- Запускати Sztab marathon-розробку (S-CORE.3.C, S-CORE.4, S-CORE.5) поки не закриті базові потреби Pikniko operations
- Будувати Sztab features які не мають measurable ROI у Pikniko operations за 1-2 тижні
- Ставити Sztab development вище за Ziomek продажі — Ziomek це source of revenue, Sztab це tool

### Дозволено

- Sztab розробка яка прямо вирішує спостережений pain point у Pikniko (per Protocol 28)
- Refactor/cleanup Sztab якщо це потребує <30 хв і не блокує Pikniko deliverables
- Документація + протоколи (як цей)

### Failure mode без цього протоколу

- Vadym будує Sztab features "бо цікаво" поки Pikniko чекає рішення
- Час на marathon (S-CORE.3.C) замість на 6 проблем Pikniko
- Месяць проходить без revenue → борги наростають → паніка

---

## PROTOCOL 28 — Observation-First перш ніж будувати

**Date:** 05.05.2026

### Принцип

У Pikniko перші 3-5 днів = тільки спостереження + інтерв'ю. НЕ кодити. Без real data ми вгадуємо і будуємо не те що треба.

### Що робити перші 3-5 днів у Pikniko

1. Сидіти в офісі весь день, бачити як приймають замовлення live
2. Записувати у нотатник: кожен раз коли когось щось затримує, кожна помилка, кожна frustracja
3. Збирати real приклади: 10-15 фото папірців, screenshots WhatsApp, email texts
4. 1-on-1 з 4-5 працівниками (по 30 хв each), 3 стандартні питання:
   - Що тебе найбільше дратує у твоїй роботі?
   - Які речі ти робиш 5+ разів на день що могли б бути швидші?
   - Якби я тобі дав 1 інструмент — що б це було?
5. Збирати metrics:
   - Кількість замовлень/день
   - % розподіл каналів (phone/WhatsApp/email/фото)
   - Час обробки одного замовлення (від contact до "введено у систему")
   - % помилок (виправлення продукту/кількості/ціни)
   - % faktуру з помилками
   - % клієнтів що отримали oferту (vs lost leads)

### Перш ніж починати кодити будь-який Sztab модуль для Pikniko

- Specific observed pain point з конкретними metrics (не "це проблемно", а "30% замовлень обробляється >20 хв")
- Real приклади (фото/screenshots) як training data
- Worker validation: "якщо я зроблю інструмент який X — це буде корисно?"

### Заборонено

- Кодити Sztab feature на основі assumptions без real data
- Починати Modul A (Order Intake) у понеділок ранок 06.05.2026 — спочатку observation
- Узагальнення "ми робитимемо AI parser" без specific examples як саме виглядають проблемні замовлення

### Дозволено після 3-5 днів observation

- Technical specs Modul A на основі real data
- Pилотний test з 1-2 office workers перш ніж rollout до всіх 14
- Iterative improvements на основі weekly feedback

### Failure mode без цього протоколу

- Vadym будує "AI parser для замовлень" а потім виявляється що 80% замовлень — phone calls які не парсяться текстом
- Прайс-лист Matrix UI зроблений але працівникам зручніше Excel
- Тиждень роботи на feature яку працівники не приймають

---

## PROTOCOL 29 — Pikniko Conflict of Interest Transparency

**Date:** 05.05.2026

### Принцип

Vadym одночасно: (а) operations director Pikniko (керує операціями), (б) постачальник Czudowа Marka і SpoonJoy до Pikniko. Це фундаментальний conflict of interest. Захист — ПРОАКТИВНА ПРОЗОРІСТЬ, не reactive defense.

### Що це означає practically

1. **Ціни Vadym товарів = market-rate, не privileged**
   - Czudowа Marka до Pikniko за ціною яка співрозмірна з ринковою для аналогічних kiszonek
   - SpoonJoy за тим самим floor 0.80 zł що інші дистриб'ютори отримали б
   - Не використовувати operations director позицію щоб отримати кращі payment terms ніж іншим постачальникам

2. **Quarterly disclosure до Pikniko owner**
   - Раз у квартал відкрита таблиця: "ось ціни Vadym товарів, ось ціни інших постачальників на подібні товари"
   - Якщо є відхилення (Vadym дешевше або дорожче) — explanation чому
   - Owner Pikniko має право змінити ціни/умови якщо суспіція unfair

3. **Sztab AI = neutral pricing logic**
   - AI рекомендує best fit за критеріями: марża dla Pikniko, fit do клієнта, dostępność
   - НЕ privileged для Vadym brands у matching algorithm
   - Code review для AI prompts — щоб не було скрытих biases

4. **Pikniko owner final say**
   - На pricing і terms — Vadym може рекомендувати, але owner вирішує
   - На strategic decisions Pikniko (нові постачальники, регіони) — Vadym як operations director дає input, не повне рішення
   - Особливо коли йдеться про конкуруючі продукти Vadym brand

### Розмова з owner Pikniko 06.05.2026 ранок

Перш ніж починати роботу — proactive transparency conversation:

> "Розумію що conflict of interest існує. Пропоную: всі ціни моїх товарів — same як ринкові. Quarterly review разом. AI у Sztab — neutral pricing logic. Якщо колись виявите, що я вас disadvantage — ми разом припиняємо співпрацю."

### Failure mode без цього протоколу

- Owner Pikniko суспектує Vadym privileges свої товари → токсична ситуація
- Інші постачальники Pikniko скаржаться → reputational damage
- Юридичний ризик: jak Pikniko sue, можна звинуватити у unfair competition

---

## PROTOCOL 30 — Sztab over Subiekt (NOT replacement)

**Date:** 05.05.2026

### Принцип

Pikniko працює на ERP Subiekt (Insert, GT або Nexo). Sztab НЕ замінює Subiekt — будує AI/intelligence layer над ним.

### Розподіл відповідальності

**Subiekt = system of record (база правди):**
- Контрагенти (клієнти + постачальники) з NIP/REGON
- Cenniki + indywidualne ceny per klient
- Faktуру VAT, WZ, ZW, KP, KW
- Magazyn stany + lokalizacje
- Płatności + rozrachunki
- KSeF integration (Insert розвиває)
- Raporty financiowe

**Sztab = AI/intelligence layer над Subiekt:**
- AI парсинг intake (email/WhatsApp/Messenger/фото папірця → structured order)
- Smart client matching (хто що купував, що рекомендувати)
- Automated offerта generation (PDF за 30 секунд)
- Order lifecycle visibility (Kanban для 14 людей)
- Sales analytics + AI insights

### Технічна архітектура

```
┌───────────────────────────────────────────────┐
│         SZTAB (AI/Intelligence Layer)         │
│  - Order intake parsing                       │
│  - Smart client/product matching              │
│  - Offerта generation                         │
│  - AI sales recommendations                   │
│  - Lifecycle visibility                       │
└──────────────────┬────────────────────────────┘
                   │ Sfere SDK (GT) або REST API (Nexo)
                   │ read + write
                   ▼
┌───────────────────────────────────────────────┐
│       SUBIEKT GT/NEXO (System of Record)      │
│  - Контрагенти + cenniki                      │
│  - Faktуру VAT + KSeF                         │
│  - Magazyn stany                              │
│  - Płatności + rozrachunki                    │
└───────────────────────────────────────────────┘
```

### Інтеграція — етапи

1. **Read-only (тиждень 1-2):** Sztab читає клієнтів, ціни, продукти з Subiekt — не пише
2. **Write zamówień (тиждень 3):** Sztab створює замовлення у Subiekt
3. **Write faktur (тиждень 4):** Sztab tworzy faktуру через Subiekt API + KSeF

### Заборонено

- Дублювати дані Subiekt у Sztab (контрагенти, ціни, faktуру) — це створює confusion і syncing problems
- Замінювати Subiekt у Pikniko — вони на ньому 5+ років, їхні працівники навчені
- Будувати Sztab features які duplicate Subiekt functionality замість покращення

### Дозволено

- Sztab cache читання з Subiekt (швидше відповідь користувачу)
- Sztab збагачує Subiekt дані (наприклад, AI-generated client business profile)
- Нові entities у Sztab які Subiekt не має (наприклад: lifecycle status, AI matches, intake source)

### Failure mode без цього протоколу

- Sztab дублює клієнтів → працівник створив у Sztab, у Subiekt його немає → faktура не виставляється
- Sztab має свої ціни, Subiekt інші → у клієнта sale price інший ніж у faktура
- Pikniko owner думає "Sztab замінює Subiekt" → купує SaaS думаючи що позбувся Subiekt → catastrophe

---

## Protocol 31 — Cowork Sandbox Credential Boundary (08.05.2026)

Cowork bash sandbox НЕ успадковує `.env.local` з Vadym's local shell. Це означає що операції які потребують env vars (Supabase service role key, Anthropic API key, Apify token, etc.) НЕ можуть виконуватись у Cowork.

### ЗАБЛОКОВАНО у Cowork sandbox

- `pnpm dlx tsx scripts/apply-migration.ts` (potrebuje `SUPABASE_SERVICE_ROLE_KEY`)
- Будь-який Supabase write через `@supabase/supabase-js` (auth keys missing)
- API calls до third-party services (Apify, Anthropic, GUS, KRS rejestrio)
- Будь-який скрипт який читає `process.env.<SECRET>`

Plus: `pnpm` не на sandbox PATH — тільки `npm`. `tsx` working якщо через `npx` з local `node_modules`.

### ДОЗВОЛЕНО у Cowork sandbox

- Файлові операції (read/write/edit/delete)
- bash утиліти (grep/sed/awk/find/wc)
- `npm install` / `build` (з `node_modules` pre-installed)
- `tsc --noEmit` (без credentials)
- git read commands (status/log/diff/show — Protocol 14)
- File-based migrations DRAFT (write SQL file, ale nie apply)

### PATTERN для migrations

1. Cowork DRAFTS `migration_NNN.sql` у `scripts/`
2. Cowork RAПОРТУЄ filename + content + apply command
3. Vadym RUNS apply у own PowerShell:
   ```powershell
   pnpm dlx tsx scripts/apply-migration.ts scripts/NNN_*.sql
   ```
4. Vadym CONFIRMS success/error у chat
5. Claude smoke tests effect через browser MCP (no DB credentials needed)

### PATTERN для secret-dependent verify queries

1. Cowork CANNOT run query, але CAN suggest expected outcome
2. Vadym runs у Studio або pnpm script
3. АБО Claude smoke through browser UI (functional proof: page works = view OK)

### Failure mode без цього protocol

- Claude promises "Cowork apply migration автоматично" → Vadym rolls eyes, bo не може
- Marnowany context window на bounce-back retries
- Vadym doubt у memory rule #4 fidelity

---

## Протокол 32 — UTF8NoBOM для git commit з файлу (08.05.2026)

PowerShell 5.x `Set-Content -Encoding UTF8` додає невидимий BOM byte 
(﻿) на початок файлу. Якщо commit message містить cyrillic/польські 
chars + multi-line + slash/em dash, треба `git commit -F file.tmp` (бо 
PowerShell argument parsing ламає `-m $msg`). Але `Set-Content` додасть 
BOM у файл → BOM з'явиться як невидимий символ на початку subject line у 
`git log`.

Проблема (зафіксована у репо): commit `4335b5d ﻿feat(phase-2-krok-1b)...` 
має невидимий BOM перед "feat". Не fixable без history rewrite.

ШАБЛОН для file-based commit:
```powershell
$msg = @''
...your commit message...
''@

[System.IO.File]::WriteAllText("$PWD\.commit-msg.tmp", $msg, [System.Text.UTF8Encoding]::new($false))
git commit -F .commit-msg.tmp
Remove-Item .commit-msg.tmp
```

Ключове: `[System.Text.UTF8Encoding]::new($false)` — explicit UTF-8 БЕЗ 
BOM. PowerShell 5.x `Set-Content -Encoding UTF8` НЕ підтримує no-BOM 
режим (PowerShell 7.x має `-Encoding UTF8NoBOM`, але Vadym 5.x).

Чим це важливо: без шаблону кожен file-based commit отримує невидимий 
BOM. Не блокер, але засмічує git log і може ламати tooling що strict 
parses commit subject lines.

---

## Протокол 33 — Radix UI synthetic event sequence для browser MCP (08.05.2026)

Radix UI primitives (Select, Checkbox, DropdownMenu, AlertDialog) НЕ 
реагують на простий `element.click()` чи синтетичний 
`dispatchEvent("click")`. Потребують повної послідовності pointer events 
з правильним станом `buttons`.

Проблема: під час smoke test Krok 1.C1 — клік на cohort Select option 
не trigger'ив onValueChange. 30+ хвилин debug — виявилось testing 
artifact, не bug у коді Cowork.

ШАБЛОН для click на Radix Select.Item / Checkbox / DropdownMenu Item:
```javascript
const r = element.getBoundingClientRect();
const opts = {
  bubbles: true, cancelable: true, view: window,
  clientX: r.x + r.width/2, clientY: r.y + r.height/2,
  button: 0, buttons: 1,
  pointerType: "mouse", isPrimary: true, pointerId: 1
};
// Критична послідовність:
element.dispatchEvent(new PointerEvent("pointermove", {...opts, buttons: 0}));
element.dispatchEvent(new PointerEvent("pointerdown", opts));
element.dispatchEvent(new MouseEvent("mousedown", opts));
element.dispatchEvent(new PointerEvent("pointerup", {...opts, buttons: 0}));
element.dispatchEvent(new MouseEvent("mouseup", {...opts, buttons: 0}));
element.dispatchEvent(new MouseEvent("click", {...opts, buttons: 0}));
```

Ключове:
- `pointermove` ПЕРШИМ (buttons: 0) — Radix Select.Item registers 
  pointer position перш ніж accept selection
- `buttons: 0` на release events (pointerup/mouseup/click) — proper 
  "button released" state

Для відкриття trigger (Select / DropdownMenu / Dialog trigger): 
послідовність БЕЗ pointermove достатня (pointerdown + mousedown + 
pointerup + mouseup).

Для React controlled input треба native value setter trick:
```javascript
const setReactValue = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", {bubbles: true}));
};
```

Чим це важливо: без правильної послідовності тестування Radix UI забирає 
десятки хвилин на false positives. Browser MCP smoke tests без цього 
шаблону = непродуктивні.

---

## Протокол 34 — Inline edit БЕЗ save-on-blur (08.05.2026)

`onBlur={onSave}` у inline edit компонентах — antipattern через race 
conditions:
1. Browser може НЕ fire blur синхронно коли `inputElement.blur()` 
   викликаний з keydown handler
2. `editValue` closure capture у onBlur може бути stale (нове значення 
   typed → blur fires до setState propagate)
3. Click на Save button trigger'ить blur FIRST → save handler runs 
   з попереднім editValue (часто пустим)

Проблема (BUG #1 Krok 1.D1): notatka `callback пт 14:00` не зберігалась 
через `onBlur` trigger. Network log = 0 POSTів за 5 спроб. 1 година 
debug. Fix: replace blur-as-trigger з explicit Save button.

ШАБЛОН для inline edit (notes, name edit, etc.):
```jsx
<input
  value={editValue}
  onChange={(e) => setEditValue(e.target.value)}
  autoFocus
  maxLength={MAX_LEN}
  onKeyDown={(e) => {
    if (e.key === "Enter") { e.preventDefault(); onSave(); }
    if (e.key === "Escape") { onCancel(); }
  }}
  // НЕ onBlur — explicit Save only
/>
<button
  onMouseDown={(e) => e.preventDefault()}  // КРИТИЧНО — keeps Input focused
  onClick={onSave}
  aria-label="Zapisz"
  title="Zapisz (Enter)"
><CheckIcon /></button>
<button
  onMouseDown={(e) => e.preventDefault()}
  onClick={onCancel}
  aria-label="Anuluj"
  title="Anuluj (Esc)"
><XIcon /></button>
```

Ключове:
- `onMouseDown preventDefault` на кнопках — стопить blur input, тримає 
  focus → click handler читає LATEST editValue з React state
- Save через explicit click → state read синхронний з current paint
- НЕ onBlur — блокує race condition повністю
- Enter/Escape для keyboard користувачів

Чим це важливо: save-on-blur здається UX-friendly, але призводить до 
lost data + non-deterministic bugs які важко reproducе. Explicit Save 
button — predictable + accessible (Tab → Enter саме працює).

---

## Протокол 35 — Cowork STEP 0 sanity check обовязковий (08.05.2026)

Перед GO STEP 1+ Cowork завжди робить STEP 0: sanity audit реального 
стану коду + DB. Catches schema discrepancies, redundancy, hallucinated 
assumptions у Claude promптах.

Проблема (зафіксована у Krok 1.C2): Claude писав prompтом "klienci 
сторінка живе у /operacje/klienci/" → Cowork розпочав модифікувати → 
виявилось `app/(dashboard)/clients/`, sidebar 404, atomic move з Phase 1 
Krok 5 не зроблений. Без STEP 0 — час витрачений на rollback.

Cowork STEP 0 ШАБЛОН для kroki з touched filesystem:
1. `cat` / `ls` всі файли які prompt згадує — verify exist у припущених 
   locations
2. Schema audit для DB tables (existing columns, types, constraints, 
   triggers, RLS policies)
3. Existing primitive check (shadcn components у components/ui/, API 
   routes у app/api/, server actions у lib/actions/)
4. Existing logic conflict check (duplicate features, legacy systems, 
   parallel implementations)
5. STOP — рапортувати знаходження + ASK BEFORE PROCEEDING якщо conflict

Cowork обовязково ASK BEFORE PROCEEDING коли:
- Schema column не існує (потрібна нова міграція)
- Primitive не встановлений (потрібен shadcn add — Vadym робить sam 
  per Protocol 31)
- Existing pattern conflicts з proposed
- Path / file у іншому location ніж припускає prompt
- Existing parallel system торкається тих самих tables (наприклад 
  Krok 1.C2 виявив pikniko_handoff_cohorts колізію)

Claude обовязково реагує на ASK — повертає decision або override з 
обгрунтуванням, перш ніж GO STEP 1+.

Чим це важливо:
- Claude prompts based on memory + general assumptions = часто 
  mismatched з реальним state коду
- Cowork bash sees truncated files (Protocol 16) → не може "просто 
  прочитати" повний файл перед роботою
- STEP 0 catches ~90% of "wont compile" / "wont deploy" issues перш 
  ніж writing code
- Час на STEP 0 (~5 хв) vs час на rollback з broken main (~30+ хв)

Failure mode без протоколу: Claude перепрошує "просто GO STEP 1 без 
STEP 0 — це проста функція". Cowork shipе з false assumptions → broken 
state → debug + revert → demoralizing.

Завжди STEP 0 спочатку. NO exceptions для filesystem-touching kroki.

---

## Протокол 36 — Sub-sprint splits для kroki понад 2 години (08.05.2026)

Kroki з ETA >2.5 год потрібно розбивати на sub-кроки (1.C → 1.C1+1.C2, 
1.D → 1.D1+1.D2). Перевага: ship-able incrementally + кожен sub-крок 
testable окремо + bug у одному sub-кроці не блокує інший.

Проблема: Krok 1.C первинно описаний як "cohort UI prospects + clients 
+ enrichment + status mutation" — 5+ годин monolithic. Risk: bug у 
одній частині блокує всі changes до commit, складно bisect.

ШАБЛОН для splits:
- Original Krok ETA ≥3 год → split на 1.X1 + 1.X2 (2 sub-кроки)
- ≥5 год → split на 1.X1 + 1.X2 + 1.X3
- Кожен sub-крок:
  - ETA 1-2 год Cowork
  - Has own STEP 0 (Protocol 35)
  - Has own commit (git log granular, easier bisect)
  - Has own browser smoke (8-12 scenarios)
  - Has own backlog notes — що moved до next sub-кроку

Розбивка по критеріях:
- Тип файлу (prospects-side vs clients-side для polymorphic features)
- Функціональний шар (status mutation окремий від bulk enrichment)
- Risk level (high-risk parts окремо щоб easy revert)
- Critical path (Monday-blocker parts first, nice-to-have later)

Приклади з 08.05.2026 сесії:
- Krok 1.C → 1.C1 (prospects, 1.5 год) + 1.C2 (clients polymorphic, 
  1.5 год). Бенефіт: 1.C1 shipнувся раніше — Vadym міг тестувати 
  prospects flow паралельно з 1.C2 розробкою
- Krok 1.D → 1.D1 (status + notatka + filter chips, Monday-critical, 
  2 год) + 1.D2 (bulk enrichment Apify, post-Monday, 2 год). Бенефіт: 
  понеділковий obzwon workflow ready після 1.D1 — без waiting на 
  enrichment

Чим це важливо:
- Smaller commits = easier review + bisect (git log granular history)
- Faster feedback loop (smoke test 8 scenarios vs 16+)
- Failure isolation (bug у 1.C2 не блокує 1.C1 на main)
- Vadym може використовувати shipнутий sub-крок паралельно з next 
  sub-крок розробкою
- Mental load lower — легше holding 1 sub-крок у голові ніж monolith

Failure mode без splits: 4-годинний krok → Cowork shipне → tsc 
regression виявляється на 50%-завершеному коді → не зрозуміло що саме 
сломано → rollback all → втрачений progress + frustration.

---

**END OF PROTOCOLS (36 total).**
