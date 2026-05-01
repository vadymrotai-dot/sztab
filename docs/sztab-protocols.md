# SZTAB — PROTOCOLS

**Date:** 01.05.2026
**Purpose:** правила які тримають Claude (мене) у відповідальності, щоб не повторювалися помилки 30.04 ввечері.

---

## ПРОТОКОЛ 1 — КОЛИ Я ОПИСУЮ СТАН ПРОДУКТУ

### Заборонено:
- Описувати "що Sztab уміє" з памяті, без перевірки на live або в репо
- Казати "feature X працює" якщо я бачив тільки commit в Git, але не клікав на live
- Перетворювати "запланували в sprintі" на "ми це маємо"
- Описувати reality на основі memory summary (вона зберігає intent, не end-state)

### Обов'язково перед кожним описом стану:
1. Live check — get_page_text на сторінці яку описую
2. Click test — якщо описую кнопку як "працює", я клікаю її і перевіряю response
3. Окремо колонки для статусу:
   - planned (в sprint document)
   - coded (commit pushed)
   - wired (UI button connected to endpoint)
   - working (end-to-end test passed)
4. Unknown — це окрема категорія. Якщо не клікав — пишу "не перевірено".

### Шаблон правильної відповіді:
- Sztab уміє X (перевірено live на /url, screenshot timestamp)
- Sztab НЕ уміє Y (підтверджено через 404 / empty render / missing button)
- Sztab можливо уміє Z, але не клікав — потрібен тест

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

Тільки після цього sprint вважається DONE.

---

## ПРОТОКОЛ 5 — MEMORY HYGIENE

### Memory зберігає:
- Стратегічні рішення (Phase 1 trader, юр. структура)
- Юр. ідентифікатори (NIP, Allegro client_id)
- Major decisions з timestamp
- НЕ feature implementation status — він застаріває швидко

### Тому:
- При питанні "що Sztab уміє" — не дивлюсь у memory, дивлюсь на live
- Memory використовую для контексту WHY, не WHAT
- Кожен раз коли додаю в memory feature implementation status — ставлю timestamp і label "VERIFIED LIVE дd.mm.yyyy"

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
- Я НЕ робитиму parallel sprintы (Vadym уже казав це 30.04 — "не робимо S5 сьогодні")
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
4. 01.05 ранок: знов почав писати з памяті у відповіді про gaps, Vadym вмів це зловити.

### Anti-patterns які тепер блокую:
- "Sztab має X" без перевірки — STOP, спершу дивись live
- "Це працює" без кліку — STOP, клікай
- "Memory summary каже" — STOP, memory ≠ truth, тільки intent
- "В одному з sprintів ми робили..." — STOP, sprintы могли регресувати, перевір на live
- Польсько-українська мова — STOP, переписую чистою українською

---

## ПРОТОКОЛ 9 — ФАЙЛИ В РЕПО

Цей документ і sztab-state.md мають жити в:

sztab/
- docs/
  - sztab-state.md           — canonical state, оновлювати після кожного sprint
  - sztab-protocols.md       — цей файл
  - sztab-audit-log/
    - 2026-05-01-09-55.md    — цей audit (frozen snapshot)
    - ...                    — наступні audit-и

Коли Vadym готовий — він через Claude Code робить:
git add docs/
git commit -m "docs: state audit 01-05-2026 + protocols"
git push

---

END OF PROTOCOLS.
