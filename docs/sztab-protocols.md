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
