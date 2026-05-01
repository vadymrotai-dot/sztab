# SZTAB — STATE OF PRODUCT (audit)

**Date:** 01.05.2026, 09:55
**Audited by:** Claude (browser MCP, live)
**Method:** живий обхід sztab.vercel.app + кліки + перевірка кожної кнопки
**Принцип:** жодного твердження з пам'яті. Тільки те що особисто побачено.

---

## EXECUTIVE SUMMARY

Sztab має **значно більше функцій** ніж я раніше показував у "короткій версії". Я був неправий — пропустив критичні модулі. Реальність:

**ВЖЕ ПРАЦЮЄ (підтверджено живо):**

- Intelligence Lookup (`/intelligence/lookup`) — окрема сторінка з NIP input, тягне дані з 6 джерел одночасно: GUS, GUS_branches, KRS, VAT_BL, matching, Apify_GMaps
- Apify Google Maps integration — працює real-time, я бачив банер "Wzbogacanie w toku... Apify_GMaps" безпосередньо на профілі KOZAK
- AI Discovery (`/intelligence`) — Fast Lookup + Deep Discovery, з історією і timing
- 261 клієнт у базі з KRS+CEIDG+GUS+CRBR enrichment
- TOP-20 Dopasowania продуктів на профілі клієнта зі score breakdown
- Cold Opener generator на КОЖНОМУ matchу
- Beneficjenci CRBR + Zarząd з rejestr.io tagами decyzyjny
- Sprawozdania finansowe — 3 роки KRS даних з YoY%
- 6-етапний sales pipeline
- Bulk operations на /clients
- /organizer з Zadania/Cele/Nawyki/Kalkulator

**КРИТИЧНІ GAPS (де Vadym мав рацію):**

- Немає Bulk Import з CEIDG/KRS на /clients top-bar
- Tavily /extract і Tavily /news_mentions — не існують в Settings
- Google Places окремий ключ — немає, тільки через Apify_GMaps actor
- /admin — 404 (раніше існував)
- /matches/global — 404 (раніше існував)
- /dzis — старий URL, тепер тільки /pulpit/dzisiaj
- /suppliers — get_page_text повертає empty (треба клік-перевірити)
- "Pobierz z KRS" в Sprawozdania — anchor link `#krs-refresh`, без візуального response
- `?nip=` URL parameter на /intelligence/lookup НЕ pre-populates input — bug

---

## A. СТОРІНКИ — РОУТИНГ

| URL | Стан | Що бачить юзер |
|---|---|---|
| `/pulpit/dzisiaj` | OK працює | операційний дашборд, hot lead, calendar |
| `/clients` | OK працює | 261 клієнт, фільтри, search, bulk select |
| `/clients/[id]` | OK працює | повний профіль (KOZAK перевірений) |
| `/produkty` | OK працює | 35 SKU під Czudowa Marka, по категоріях |
| `/sprzedaz` | OK працює | kanban 6+ етапів |
| `/organizer` | OK працює | задачі/цілі/навики/калькулятор |
| `/intelligence` | OK працює | AI Discovery історія |
| `/intelligence/lookup` | OK ПРАЦЮЄ | NIP lookup form + результати з 6 джерел |
| `/settings` | OK працює | Ogólne / Ceny i marże / Klucze API / Szablony |
| `/suppliers` (Dostawcy) | WARN візуально є | але get_page_text empty |
| `/admin` | 404 | був раніше, видалено |
| `/matches/global` | 404 | був раніше, видалено |
| `/dzis` | 404 | старий URL, замінено на /pulpit/dzisiaj |
| `/handoff/pikniko` | ? не перевірено | може існувати |

---

## B. /clients/[id] — ПОВНИЙ INVENTORY ПРОФІЛЮ

(перевірено на KOZAK OLEK SP. Z O.O., NIP 7561993172, KRS 0000977768)

### ACTION BAR (top-right, sticky)
| Кнопка | Стан | Notes |
|---|---|---|
| ✨ Analizuj AI | є (primary indigo) | не клікав |
| + Zadanie | є | не клікав |
| + Notatka | є | не клікав |
| + Szansa | є | не клікав |
| ⋯ menu | є | не клікав |

### METRIC STRIP
| Поле | Значення KOZAK |
|---|---|
| Dopasowanie Sztab | 95/100 (потім 80 після enrichment) |
| Obroty (rok obrotowy) | 1.85 mln PLN ↑27.3% YoY |
| Pracownicy | — (поле є, дані порожні) |
| Oddziały | 0 |

### АКОРДЕОНИ (8)

**1. Profil**
- Forma prawna, Adres, NIP, REGON, KRS, Kapitał zakładowy, Założona, VAT, PKD główne (4719Z +119 więcej), Konto bankowe

**2. Sprawozdania finansowe** (3 lat KRS · ostatni rok 2024)
- Таблиця: Rok / Przychody netto / Zysk netto / Aktywa razem / Δ przychody YoY / Pracownicy
- Дані повні за 2024, 2023, 2022
- WARN Кнопка "Pobierz z KRS" → лиш anchor #krs-refresh, без response
- Кнопка "↗ Otwórz" — мабуть external eKRS

**3. Osoby** (2 zarząd · 2 BO)
- **Zarząd / wspólnicy:**
  - Oleksii Ilchenko (PREZES ZARZĄDU, decyzyjny, rejestr.io tag)
  - Olena Ilchenko (CZŁONEK ZARZĄDU, decyzyjny, rejestr.io tag)
- **Beneficjenci rzeczywiści (CRBR):**
  - Olena Ilchenko (Rezydencja PL, Obywatelstwo UA)
  - Oleksii Ilchenko (Rezydencja PL, Obywatelstwo UA)
- Кнопка "Pobierz z KRS"

**4. Sygnały** (Aktywna · 0 BZP)
- Sprawozdanie KRS: Świeże (2025-07-11)
- Status prawny: Aktywna, brak red flags
- Przetargi BZP: Brak wygranych
- Кнопка "Sprawdź BZP" → редіректить на /intelligence/lookup?nip={NIP}

**5. Analiza biznesowa (AI)**
- Тег: "Czudowa Marka — buyer strength"
- Empty state: "Brak analizy biznesowej. Uruchom Intelligence Lookup albo kliknij Analizuj"
- Кнопка "Analizuj"
- ? SupplierMatrix component (Sprint S4 P1 placeholder) — НЕ видно тут

**6. Dopasowania produktów** (TOP score 95)
- TOP-20 продуктів сортовано
- Кожен match має: nazwę, gramatura, теги, score breakdown
- Кнопка "Wygeneruj cold opener" на КОЖНОМУ продукті
- Кнопка "Pokaż TOP-10 →"
- Кнопка "Przelicz teraz"

**7. Kontakt** (1 źródeł)
- kozak.strzelce.opolskie@gmail.com (KRS source)
- "(Brak danych)" — телефон порожній
- "(Brak własnej domeny)" — site не знайдено
- Кнопка "+ Dodaj kontakt"

**8. Aktywność** (0 pozycji)
- 3 таби: Kontakty (0) / Umowy (0) / Zadania (0)

---

## C. /intelligence/lookup — КЛЮЧОВА ЗНАХІДКА

Це окрема сторінка яку я раніше пропускав. Реальний multi-register lookup tool.

### UI
- Input "Wpisz NIP firmy (10 cyfr)"
- Button "Uruchom intelligence lookup"

### Що насправді робить (тестовано на NIP 7561993172):

**"Pobieranie danych z 6 źródeł..." → результат:**

| Źródło | Status | Notes |
|---|---|---|
| GUS | success | added: 0, updated: 0 (вже в БД) |
| GUS_branches | success | 0 jednostek lokalnych (multi-location lookup) |
| KRS | success | added: 0, updated: 1 |
| VAT_BL | success | added: 0, updated: 0 (vat-checker) |
| matching | success | rerun product matching |
| Apify_GMaps | async | "Wzbogacanie w toku..." на профілі (Google Maps!) |

### Bonus: автоматично показує
- "Pól wypełniono: 1, Osoby utworzone: 0, Top matche: 3"
- Top 3 dopasowane продукти прямо тут
- Кнопка "Otwórz profil firmy →"

### Bug
- URL param `?nip=7561993172` НЕ pre-populates input field

---

## D. РЕЄСТРИ — ПОВНИЙ ІНВЕНТАР (revised after live test)

| Реєстр | API ключ є? | Endpoint є? | UI кнопка є? | Працює end-to-end? |
|---|---|---|---|---|
| CEIDG (JDG) | ? | OK (Import CSV / seed) | НЕМАЄ bulk у /clients | через CSV/seed |
| KRS rejestr.io | OK Settings | OK | OK "Pobierz z KRS" | через /intelligence/lookup |
| GUS BIR2 | ? | OK | НЕМАЄ (тільки через lookup) | через /intelligence/lookup |
| GUS_branches | ? | OK (lookup output) | НЕМАЄ | через /intelligence/lookup |
| CRBR (beneficjenci) | ? | OK (видно на KOZAK) | НЕМАЄ | дані вже в БД |
| BZP (przetargi) | ? | "0 BZP" видно | OK "Sprawdź BZP" → lookup | показує статус |
| VAT_BL | ? | OK | НЕМАЄ | через /intelligence/lookup |
| Apify Panorama Firm | OK Settings | (Phase 2.7) | НЕМАЄ | ? |
| Apify GMaps | OK Settings | OK | НЕМАЄ (auto-trigger) | працює real-time |
| Apify Allegro | OK Settings | OK scraper.ts | НЕМАЄ | verified (parseforge) |
| Tavily /extract | НЕМАЄ ключа | НЕМАЄ | НЕМАЄ | НЕМАЄ |
| Tavily news_mentions | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ |
| Google Places (separate) | НЕМАЄ ключа | НЕМАЄ | НЕМАЄ | через Apify_GMaps |
| OpenFoodFacts | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ |
| LinkedIn DM | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ |
| KRD/BIG | НЕМАЄ | НЕМАЄ | НЕМАЄ | НЕМАЄ (low priority) |
| Allegro API | OK Settings | OK /api/allegro/test | НЕМАЄ UI | /sale/categories тільки |

### API ключі в Settings (Klucze API tab):
1. Gemini API key
2. Apify API token
3. KRS Rejestr.io API token
4. Allegro Client ID
5. Allegro Client Secret

### НЕ ЗНАЙДЕНО в Settings:
- Tavily token
- Google Places key окремий
- Google Maps key окремий
- KRD/BIG token
- OpenFoodFacts auth

---

## E. /clients ТОП-БАР — ЯКИХ КНОПОК НЕМАЄ

### Що Є на /clients:
- Search (по назві, NIP, місту)
- Tabs: Klienci 261 / Prospekti 1 / Wszystko 262
- Filtry: Tylko z kontaktem / Wysokie dopasowanie ≥70 / Wymaga review / Branża
- Sort: Score DESC, Nazwa A-Z, Data utworzenia
- + Dodaj firmę (manual)
- Importuj CSV
- ⋯ menu

### Bulk operations (працює коли select rows):
- Analizuj AI (N)
- Eksport jako kohorta
- Odśwież z KRS
- + Tag

### КРИТИЧНІ ВІДСУТНОСТІ (Vadym був ПРАВИЙ):
- Importuj z CEIDG (по фільтру PKD/voivodeship/active VAT)
- Importuj z KRS (по фільтру spółek)
- Importuj z Google Places (за geo+branżą)
- Bulk lookup po list NIP-ів
- Generate prospects from existing client similarity
- Bulk Tavily extract для contact discovery
- Allegro sellers lookup (по NIP в Allegro)

### Найшвидший шлях додати prospekta зараз:
1. Користувач знає NIP заздалегідь
2. Клікає "Dodaj firmę" → вписує NIP
3. АБО йде в /intelligence/lookup → вписує NIP → lookup → "Otwórz profil firmy"

**Жодного шляху "знайти 50 нових prospektів за критеріями" — це треба будувати.**

---

## F. ЩО ПОТРЕБУЄ КЛІК-ТЕСТУ

### PRIORITY 1 (вже частково тестовано):
- [x] "Pobierz z KRS" в Sprawozdania → anchor only, без response
- [x] "Sprawdź BZP" → редіректить на /intelligence/lookup
- [x] "Uruchom intelligence lookup" → працює, 6 джерел
- [x] Apify_GMaps real-time enrichment → працює
- [ ] "Wygeneruj cold opener" на TOP product
- [ ] "Analizuj" в Analiza biznesowa

### PRIORITY 2 (workflow):
- [ ] Bulk select 3 клієнти → "Analizuj AI (3)"
- [ ] Bulk select → "Eksport jako kohorta"
- [ ] Bulk select → "Odśwież z KRS"
- [ ] /organizer "Zaplanuj kontakt z hot leadem"

### PRIORITY 3 (з'ясувати):
- [ ] /suppliers — чому get_page_text empty?
- [ ] /handoff/pikniko — існує?
- [ ] Gemini API 503 errors з 27.04

---

## G. ВИСНОВКИ

### Що Vadym ПРАВИЛЬНО ідентифікував:
1. Bulk import нових prospektів — реально немає
2. "Тонни інформації після реєстрів" — є, але я погано показав де
3. Google Maps/Places — є! Через Apify_GMaps actor

### Що я раніше говорив неправильно:
- "Sztab бачить тільки KRS+CEIDG" → 6 джерел
- "Немає Google Places integration" → є Apify_GMaps
- "Немає AI Discovery як окремої функції" → є цілий розділ
- "Multi-supplier matching working" → насправді SupplierMatrix placeholder

### Реальні next steps для Sztab:
1. Додати "Importuj z CEIDG/KRS" на /clients top-bar
2. Tavily integration
3. Виправити anchor "Pobierz z KRS"
4. Виправити `?nip=` URL param на /intelligence/lookup
5. Розібратися з /admin і /matches/global 404
6. /suppliers визуальна перевірка

---

## H. AUDIT TRAIL

Все вище — на основі:
- Live tab 1823348675 (sztab.vercel.app)
- Browser MCP get_page_text + screenshots
- Click testing на 3 кнопках
- Real lookup для NIP 7561993172 (KOZAK OLEK)

**END OF AUDIT.**
