# Sztab Client Intelligence Sources — Discovery Document v3

**Дата створення:** 03.05.2026
**Останнє оновлення:** 03.05.2026 v3 — після Vadym fundamental re-think про matrix scoring
**Author:** Claude (Sonnet 4.7), strategic discovery session
**Geography:** Polska only.
**Architectural principle:** Hybrid algo+AI на ВСІХ рівнях (Vadym принцип).
**Engine architecture:** Unified Intelligence Engine з 3 modes (existing / registry / combined) — locked Vadym 03.05.

---

## CHANGELOG

### v3 (03.05.2026 evening) — Matrix Scoring переосмислення

🔴 **ФУНДАМЕНТАЛЬНА ЗМІНА після Vadym re-think:**

- **Score прив'язаний до пари клієнт×товар, НЕ до клієнта** — один клієнт має різні матчі для різних товарів (KOZAK 80% на ЧМ, 20% на мед, 70% на wędliny)
- **"Аналіз клієнта" БЕЗ скору** — показує профіль + матрицю матчів з усіма нашими товарами
- **Mode B додає ВСІХ кого знаходимо** (з тільки validation фільтром active VAT/non-wykreślony) — БЕЗ скорингу при додаванні. Скор з'являється тільки при "Аналіз товару"
- **Логіка скорингу переходить у `product/scoring-rules.ts`** — це і є "продаючий" інструмент Sztab
- **Tier A/B/C концепт скасовано** — нема постійних tiers клієнтів. Tier-и з'являються per-product через сегментацію match scores
- **"Манalu Review" концепт переосмислено** — у Mode B немає auto-add по threshold. Просто додаємо всіх валідних. Ручний review тепер у "Аналіз товару" (вибір якій контакт першим виходимо)
- Додано Протокол 22 — Matrix Scoring Model

### v2 (03.05.2026)

Зміни після Vadym feedback session:

- **🆕 B.21 Allegro/Empik/OLX seller profile lookup** — додано як окремий шар enrichment (та частково discovery). Vadym pointed: багато середніх PL фірм не мають вебсайту, продають через Аллегро.
- **CORRECTED: Google Places budget** — фактично безкоштовний при поточному використанні (1500-2000 запитів/міс ≪ 6250 з $200 free credits).
- **EXPANDED: BZP** — повне пояснення що це, які CPV codes для нашого сегменту, workaround через Apify якщо WSO2 OAuth не наш шлях.
- **EXPANDED: LinkedIn problematics** — юридичні + технічні + якість + альтернативи + триггер активації.
- **NEW: Score + AI Reasoning + Review modes section** — як engine повертає 3 layers.
- **🚫 REMOVED: Email guess + SMTP verify** — Vadym принципова заборона (memory #18). Cold email як точка початку B2B продажів у PL оптовому контексті НЕ працює.

---

## 1. EXECUTIVE SUMMARY

### Що таке Client Intelligence в контексті Sztab

**Lead generation + pre-sale intelligence** для B2B HoReCa. Sztab знаходить:
- **Хто це** — legit бізнес чи fake/dormant
- **Де знаходиться** — siedziba + всі oddziały
- **Скільки коштує** — revenue, employees, capital
- **Хто decides** — decision-makers з real names + контактами
- **Що купують** — tenders won, current suppliers, асортимент
- **Чи безпечно продавати** — debt registries, red flags
- **Як з ними говорити** — cold opener context (news, signals, timing)
- **🆕 Чи є вони на маркетплейсах** — Allegro/Empik/OLX seller profiles

### Active sources (verified в коді)

✅ CEIDG v1+v2 (JDG, free) — 8000+ prospects synced
✅ rejestr.io v2 Biznes API — 8 endpoints живі
✅ GUS BIR API — basic + 11 raport types treba розширити
✅ VAT Biała Lista — anti-fraud + bank verification
✅ Tavily AI search — wired (clients only) — country=PL
✅ Apify partial — Google Maps lookup, website crawler, KRS PDF fullnames
✅ Allegro Apify scraper (parseforge) — shipped 30.04 для product, повторно use для seller lookup

### Planned but not shipped

⚠️ Google Places API — multi-location detection
⚠️ LinkedIn Apify — decision-maker discovery (з caveats — section 11)
⚠️ BZP — public tenders (section 10)
⚠️ MSiG — Monitor Sądowy i Gospodarczy
⚠️ CRBR — beneficjenci

### 🆕 NEW gaps виявлені v2

1. **🆕 Allegro/Empik/OLX seller profile lookup** — окремий шар signals
2. TERYT + OSM Nominatim
3. GUS BDL — TAM market sizing
4. Industry trade press RSS — Wiadomości Handlowe, Hurt & Detal
5. Branżowe asocjacji — PIH, PFPŻ, HoReCa.pl
6. PKT.pl business directory
7. Apify Universal Lead Finder
8. Tavily search by criteria для discovery

### 🚫 ВИКЛЮЧАЄМО

- **Email guess + SMTP verify (Hunter.io etc)** — Vadym принципова заборона 03.05.2026
- **KRD/BIG/ERIF** — Vadym 30.04: reseller, не wholesale credit
- **Aleo / Bisnode** — premium, free combinations cover 80%
- **InfoCredit/BIK** — same as KRD
- **Geoportal/CEPiK** — exotic for HoReCa

---

## 2. 8 LAYERS Client Intelligence (CIL-1..CIL-8)

| Layer | Що дає | Discovery sources | Enrichment sources |
|---|---|---|---|
| CIL-1: Identity & Legal | NIP/REGON/KRS, форма, статус | CEIDG bulk, KRS bulk filter, GUS REGON | rejestr.io, GUS BIR, VAT BL |
| CIL-2: Profile Depth | revenue, employees, capital | KRS by criteria | rejestr.io sprawozdania, GUS BIR raporty, MSiG |
| CIL-3: Locations | siedziba + oddziały + activity | Google Maps places search | Google Places by ID, GUS ListaJednLokalnych |
| CIL-4: People | imię/nazwisko, role, tenure | LinkedIn search Apify (caveats) | rejestr.io persons, Apify krs-fullnames, Tavily extract |
| CIL-5: Buying Signals | tenders, suppliers, асортимент | BZP search by CPV, 🆕 Allegro/Empik category | BZP per NIP, news, 🆕 Allegro/Empik/OLX seller |
| CIL-6: Risk & Trust | debts, fraud, legal | (none) | VAT BL, rejestr.io przekształcenia, MSiG |
| CIL-7: Geographic | TERYT, distance, clustering | TERYT bulk, OSM | TERYT lookup, OSM per-address |
| CIL-8: Industry & Timing | trade press, signals, news | Wiadomości Handlowe RSS, asocjacji | Tavily news, asocjacji check |

---

## 3. SOURCE CATALOG TABLE A — DISCOVERY (16 sources)

| # | Source | Cost | Coverage | Status |
|---|---|---|---|---|
| A.1 | CEIDG bulk download | Free | JDG only | ✅ ACTIVE Phase 2 |
| A.2 | KRS bulk filter via rejestr.io | $30-100/міс | sp.z o.o./S.A. | ⚠️ Phase 2.8 PLANNED |
| A.3 | GUS REGON Search by criteria | Free | All PL business | ✅ ACTIVE basic |
| A.4 | Google Maps Places Search | $200 free credits/міс — реально $0 | Все що на мапі | ⚠️ PLANNED Sprint S4 |
| A.5 | Tavily Search by criteria | Free 1000 credits/міс | Polish web | ✅ ACTIVE under-utilized |
| A.6 | BZP Search by CPV codes | Free (after WSO2 reg) | Public tenders | ⚠️ PLANNED — section 10 |
| A.7 | LinkedIn Apify search | $30+ /міс post-revenue | Mid-size+ | ⚠️ PLANNED — section 11 |
| A.8 | Wiadomości Handlowe RSS | Free | Industry news | ⚠️ PLANNED |
| A.9 | Hurt & Detal RSS | Free | Industry news | ⚠️ PLANNED |
| A.10 | PIH members directory | Free | Polska Izba Handlu | ⚠️ PLANNED |
| A.11 | PFPŻ members | Free | PFPŻ producents | ⚠️ PLANNED |
| A.12 | HoReCa.pl directory | Free | HoReCa | ⚠️ PLANNED |
| A.13 | PKT.pl directory | Free | Yellow Pages | ⚠️ PLANNED |
| A.14 | OLX/Pracuj.pl jobs | Free | Mid-size+ | ⚠️ PLANNED niche |
| A.15 | OSM Nominatim search | Free 1 req/sec | Global, OSM | ⚠️ PLANNED Sprint S6 |
| A.16 | GUS BDL | Free | All PL stats | ⚠️ FUTURE |
| 🆕 A.17 | **Allegro/Empik category search** | Apify $5 free/міс | Mid-size+ online | ⚠️ PLANNED v2 |

---

## 4. SOURCE CATALOG TABLE B — ENRICHMENT (22 sources)

| # | Source | Cost | Status |
|---|---|---|---|
| B.1 | rejestr.io v2 Biznes (8 endpoints) | $30-100/міс | ✅ ACTIVE Sprint S2A |
| B.2 | GUS BIR API multi-raport (11 types) | Free | ✅ Basic ACTIVE, multi ⚠️ |
| B.3 | VAT Biała Lista | Free | ✅ ACTIVE |
| B.4 | CEIDG v3 per-entity lookup | Free | ✅ ACTIVE basic |
| B.5 | Tavily /search per-entity | Free tier | ✅ ACTIVE |
| B.6 | Tavily /extract per-URL | Free tier | ✅ ACTIVE |
| B.7 | Apify Google Maps lookup by NIP | $0.05/lookup | ✅ ACTIVE partial |
| B.8 | Google Places API by place_id | $0 при $200 free credits | ⚠️ PLANNED Sprint S4 |
| B.9 | Apify regdata/krs-fullnames-scraper | $0.005/firm | ✅ ACTIVE fallback |
| B.10 | Apify vdrmota/contact-info-scraper | $0.05/firm | ⚠️ PLANNED |
| B.11 | Apify khadinakbar/universal-lead-finder | $0.05/lead | ⚠️ PLANNED |
| B.12 | BZP per NIP | Free after WSO2 | ⚠️ PLANNED — section 10 |
| B.13 | MSiG (Monitor Sądowy) | Free scrape | ⚠️ PLANNED Sprint S5+ |
| B.14 | KRD/BIG/ERIF | 300-800 PLN/міс | ⏸ POSTPONED Vadym 30.04 |
| B.15 | Industry asocjacji membership | Free | ⚠️ PLANNED |
| B.16 | LinkedIn profile per person | Apify $30+ + per-profile | ⚠️ PLANNED — section 11 |
| B.17 | OSM Nominatim per-address | Free | ⚠️ PLANNED |
| B.18 | TERYT lookup | Free | ⚠️ PLANNED Sprint S6 |
| B.19 | GUS BDL per-region | Free | ⚠️ FUTURE |
| B.20 | Wiarygodna Firma badges | Free scrape | ⚠️ FUTURE |
| 🆕 B.21 | **Allegro/Empik/OLX seller profile** | $5-10/міс moderate | 🆕 PLANNED v2 |
| 🚫 B.22 | Email guess + SMTP verify | — | 🚫 NEVER (Vadym заборона) |

---

## 5. 🆕 B.21 Allegro/Empik/OLX seller profile lookup — DETAILED

**Це нова знахідка v2 — додано після Vadym pointer.**

### Що дає per platform

**Allegro:**
- Seller profile by NIP (search seller=:NIP query)
- Total active offers count
- Категорії продажу
- Rating (4.0-5.0 scale)
- Reviews count (proxy обсягу продажів)
- Stale на платформі (years as seller)
- Brands they distribute (через product names analysis)
- Price strategy (premium/medium/budget на основі їх асортименту)

**Empik Place:**
- Seller presence + scale
- Категорії
- Customer satisfaction

**OLX Business:**
- Активність продавця
- Тип товарів
- Geography

### Що це говорить про клієнта

- **Активні онлайн** — використовують маркетплейси як sales channel
- **Скільки SKU мають у обороті** — proxy масштабу operations
- **Які бренди вже носять** — підказує що їм запропонувати
- **Service quality (rating)** — 4.9 = professional, 3.2 = problems
- **Sales velocity** — для AI cold opener: "Бачимо що Państwa firma продає на Allegro 240 продуктів з рейтингом 4.9..."

### Cost

- parseforge/allegro-scraper: $0.038 за 5 results
- klevio/allegro-seller-scraper: ~$0.10 за повний каталог
- При 50-100 lookups/міс ≈ $5-10/міс
- **Free tier $5/міс Apify покриває**

### Real example

GET seller_profile?nip=5223239864 → "Ziomek_hurt: 240 продуктів у category Spożywczy, rating 4.85, 5234 reviews, member since 2022, brands: Krakus, Hortex, Czudowa Marka, average price tier: medium"

### Critical insight

Багато середніх PL firm (regional sklepy spożywcze, dystrybutorzy) **не мають окремого вебсайту** — Allegro це їх **головна вітрина онлайн**. Без цього шару пропускаємо ground truth їх операцій.

### 🚫 B.22 Email guess + SMTP verify — NEVER DO

**Vadym принципова заборона 03.05.2026 (memory #18):**

- НЕ робимо: email guessing patterns (jan.kowalski@firma.pl variations)
- НЕ робимо: SMTP verify через Hunter.io / Snov.io / Apollo.io
- НЕ робимо: cold email blasts as sales channel

**Що працює натомість у PL B2B оптовому контексті:**
- Relationship network (Vadym 15 strong contacts)
- Телефонні дзвінки
- LinkedIn DM (post-revenue)
- In-person meetings
- Email **тільки** як response на запит oferty (PIL-2d outreach pattern для wholesalers) або після першого встановленого контакту

---

## 6. HYBRID SOURCES (8 sources serve both modes)

| Source | Discovery | Enrichment |
|---|---|---|
| Tavily | search by criteria | search by name, /extract |
| Google Maps | places search | by place_id |
| KRS rejestr.io | filter PKD+region | by NIP — 8 endpoints |
| GUS REGON | search by criteria | by NIP — multi-raport |
| CEIDG | bulk + filter | per-NIP lookup |
| BZP | search CPV | per-NIP tenders |
| LinkedIn Apify | search "head of procurement" | per-person profile |
| 🆕 Allegro/Empik/OLX | category search → sellers | per-NIP seller profile |

---

## 7. КЛІЄНТСЬКИЙ ПРОФІЛЬ + МАТРИЦЯ МАТЧІВ (REVISED v3)

### 🔴 ФУНДАМЕНТАЛЬНА ЗМІНА (Vadym 03.05.2026 evening)

**Раніше було (неправильно):** клієнт має один глобальний скор 0-100. Tier A/B/C призначається одноразово.

**Тепер (правильно):** **скор — це властивість пари клієнт×товар, НЕ клієнта окремо.**

Один і той самий клієнт може мати:
- 80% match для ЧМ kiszone ogórki
- 20% match для miód w łyżeczce
- 70% match для wędlin premium

Тому "Аналіз клієнта" НЕ показує єдиного скору. Показує **профіль клієнта без скору** + **матрицю матчів з усіма нашими товарами**.

Скоринг логіка переходить у товарний документ (`product/scoring-rules.ts` — деталі див. Protocol 22 Matrix Scoring Model).

### Що показує сторінка /clients/[id] після Sprint S-CORE.2

#### Розділ A: Профіль клієнта (без скору)

Глибока інформація з 8 шарів CIL зібрана через enrichment джерела:

```
KOZAK OLEK sp. z o.o.

[CIL-1 Identity] NIP 5223239864 • Sp. z o.o. • aktywna • VAT czynny
[CIL-2 Profile] Revenue 1.85 mln zł (2024) ↑ • 12 employees • založena 2022
[CIL-3 Locations] Siedziba Warszawa, ul. Nowa 5 • 3 oddziały
[CIL-4 People] Zarząd: Jan Kowalski (CEO), Anna Nowak (CFO)
[CIL-5 Buying] BZP: 2 wygrane tendery 2024 (450k zł total)
[CIL-6 Risk] Brak red flagów • PL beneficjenci
[CIL-7 Geo] Warszawa centrum • 12 km od magazynu Pikniko
[CIL-8 Industry] Wymieniony w Wiadomości Handlowe 03.2026
[Marketplace] Allegro: 240 ofert, rating 4.85 • Empik: aktywny
```

#### Розділ B: Матриця матчів з нашим асортиментом

```
Які наші товари йому підходять (відсортовано):
─────────────────────────────────────────────
ЧМ kiszone ogórki         85% ⭐⭐⭐⭐⭐
Wędliny premium           72% ⭐⭐⭐⭐
Surówki klasyczne         68% ⭐⭐⭐⭐
ЧМ buraczki               55% ⭐⭐⭐
Olej rzepakowy            42% ⭐⭐
Miód w łyżeczce           18% ⭐
─────────────────────────────────────────────
🎯 Топ рекомендація: ЧМ kiszone ogórki (85% match)
```

#### Розділ C: Пояснення топ-матчу (AI Haiku)

```
Чому ЧМ kiszone ogórki = 85% match для KOZAK OLEK:

✅ Сильні сигнали:
- PKD 4639Z (hurt spożywczy) ідеально під kiszonki segment
- Активний на Allegro з 240 SKU у kategorii spożywczej
- Revenue 1.85 mln zł — у нашому target range
- 3 oddziały у Warszawie — multi-location distribution potential

⚠️ Можливі заперечення:
- Не маємо BZP історії з kiszonkami specifically
- Молода фірма — менше історії

🎯 Підхід: Cold call з референсом до Allegro presence
```

### Як це виглядає у "Аналіз клієнта" — детальна структура UI

**Сторінка /clients/[id] після Sprint S-CORE.2:**

- **[Hero]** Назва клієнта + базова ідентифікація + статус (active/dormant) + last analysis timestamp
- **[Кнопка]** "🔍 Глибокий аналіз клієнта" → запускає engine у Mode A
- **[Tab Профіль]** усі 8 шарів CIL з повним enrichment (без скору)
- **[Tab Матриця матчів]** ranked список наших товарів з % match
- **[Tab Маркетплейси]** Allegro/Empik/OLX seller data
- **[Tab Сигнали]** новини, BZP, MSiG events, asocjacji
- **[Tab Люди]** decision-makers
- **[Tab Контакти]** emails, phones, LinkedIn URLs (без email guess)
- **[Tab Історія]** попередні аналізи (timestamps)

### Engine для клієнта повертає 2 layers (НЕ 3 як раніше)

#### Layer 1: Profile Data (структуровані факти)

JSON з усіма 8 шарами CIL без скору. Це сировина для UI рендеру.

```json
{
  "identity": {...},
  "profile": {...},
  "locations": [...],
  "people": [...],
  "buying": {...},
  "risk": {...},
  "geo": {...},
  "industry": {...},
  "marketplace": {...}
}
```

#### Layer 2: Match Matrix (клієнт × кожен наш товар)

Для кожного товару у нашому асортименті — обчислюється match score. Результат — ranked array.

```json
{
  "matches": [
    {
      "product_id": "chm-kiszone-ogorki",
      "product_name": "ЧМ kiszone ogórki",
      "score": 85,
      "score_breakdown": {...},
      "ai_reasoning": "..."
    },
    {
      "product_id": "wedliny-premium",
      "score": 72,
      ...
    }
  ]
}
```

**ВАЖЛИВО:** `score_breakdown` і `ai_reasoning` — це per-match, не per-client. Логіка скорингу живе у `product/scoring-rules.ts` (бо це матчинг з конкретним продуктом).

### Mode B (registry discovery) — як це тепер працює

**Раніше думали:** алгоритм скорить candidates → high-score auto-add як Tier A, low-score skip.

**Тепер (правильно):** **додаємо ВСІХ кого знаходимо у реєстрах** (з тільки очевидно мертвих фільтром).

Чому: скор без контексту товару не має сенсу. Може клієнт зараз не підходить ні для чого, але через 6 місяців у нас новий товар і він ідеальний для нього. **База клієнтів = універсальний asset, не filtered субсет.**

**Що робить Mode B:**
1. Discovery sources (CEIDG/KRS/Google Maps/etc) → candidates list
2. **Фільтр тільки validation:** active VAT + статус не "wykreślona"
3. **Додаємо всіх що пройшли validation** з повним enrichment
4. НЕ скоримо при додаванні
5. Скор з'являється тільки коли запускаємо "Аналіз товару"

**UI на /intelligence/prospects показує:**
- Список усіх знайдених клієнтів (без скору)
- Filter form: PKD, регіон, активність, маркетплейси, тендери
- Кнопка "Додати до бази" або bulk "Додати всі знайдені"
- Жодного "Tier A/B/C" auto-призначення

### Як використовується скоринг тепер

**"Аналіз товару" (Sprint S-CORE.3) — головний "продаючий" інструмент:**
- Бере конкретний товар
- Скорить ВСІХ клієнтів у нашій базі проти цього товару
- Повертає ranked топ-100 клієнтів з % match
- Сегментує: high (>70), medium (50-70), low (<50)
- AI генерує стратегію продажів за сегментами

**"Аналіз ринку" (Sprint S-CORE.4) — агрегація:**
- Агрегує match scores товару по всій базі
- TAM/SAM/SOM analysis
- Концентрація потенціалу (чи топ 100 клієнтів — це 80% market)
- Ринкові тренди з зовнішніх джерел

**"Аналіз стратегії" (Sprint S-CORE.5) — крос-аналіз:**
- Бере композицію клієнт × товар × ринок
- Відповідає на "як продати товар X цьому клієнту з урахуванням ринку"

### Implications для Mode A (existing) UI

При натисканні "Аналіз клієнта":
1. Engine збирає повний профіль (всі 8 шарів CIL) — НЕ скорить клієнта окремо
2. Engine викликає `productScoring.computeMatches(client, allProducts)` — отримує матрицю
3. Sorts матрицю по match score descending
4. Повертає Layer 1 (profile data) + Layer 2 (match matrix)
5. UI рендерить профіль + матрицю + AI reasoning для топ-матчу

Час: ~30-60 секунд (parallel sources fetch + matrix computation).

### Як показуємо "Аналіз клієнта" у UI (детально для S-CORE.0 макету)

**Hero block (зверху):**
```
[ Назва фірми ]                    [Кнопка 🔍 Глибокий аналіз]
[ Статус: aktywna VAT czynny ]     [Last analysis: 03.05 о 9:30]
[ Профіль: 8 шарів зібрані ]
```

**Top recommendation card (відразу під hero):**
```
🎯 Найкраще запропонувати: ЧМ kiszone ogórki
   Match: 85% ⭐⭐⭐⭐⭐
   [AI reasoning ~50 слів]
   [Кнопка: Підготувати pitch]
```

**Tab "Матриця матчів":**
```
┌─────────────────────────────────────────┐
│ Товар              Match    Графік      │
├─────────────────────────────────────────┤
│ ЧМ kiszone ogórki  85%   ████████▌      │
│ Wędliny premium    72%   ███████▌       │
│ Surówki klasyczne  68%   ██████▊        │
│ ЧМ buraczki        55%   █████▌         │
│ Olej rzepakowy     42%   ████▌          │
│ Miód w łyżeczce    18%   █▌             │
└─────────────────────────────────────────┘
[Кнопка: Розгорнути всі товари (35)]
```

**Tab "Профіль" (детальна інформація):**
- Аккордеон з 8 секціями (по одній на CIL)
- Кожна секція показує raw data + останнє оновлення з якого джерела

---

## 8. BZP DETAIL SECTION

### Що таке BZP

**BZP = Biuletyn Zamówień Publicznych** = офіційний польський портал державних закупівель.

URL: https://ezamowienia.gov.pl

База даних усіх державних тендерів — лікарні, школи, університети, міністерства, міста, гміни.

### Що там можна знайти per tender

- Назва zamawiającego (university, hospital, ministerstwo)
- Predmiot zamówienia (опис до 500-2000 слів)
- Wartość kontraktu
- Daty (publikacja, składanie, rozstrzygnięcie)
- Wynik з NIP winner
- Specyfikacja techniczna (PDF)
- CPV codes

### Use case A: Discovery — пошук нових клієнтів

Filter тендери за CPV codes:

| CPV Code | Категорія |
|---|---|
| 15800000 | Produkty spożywcze różne |
| 15331000 | Konserwowane warzywa |
| 15810000 | Pieczywo, ciasta |
| 15870000 | Przyprawy |
| 15890000 | Spice |
| 15500000 | Mleko i przetwory mleczne |
| 15100000 | Mięso |
| 15300000 | Owoce, warzywa, grzyby |
| 15200000 | Ryby przetworzone |

Знаходимо winners за останні 2 роки → **великі стабільні покупці:**
- Активно купують в обсязі
- Платоспроможні (державні гроші)
- Стабільні на 2+ роки
- Серйозні (тендер процедура важка)

### Use case B: Enrichment — поглиблення вже відомого

Per NIP — історія тендерів: скільки виграла, на які суми, які категорії, хто типові suppliers.

### Чому BZP критично

~30-50% обороту cateringa і виробництв = державні контракти. **Без BZP не бачимо цей канал.**

### Технічна проблема + workaround

**Офіційний API:** https://api.ezamowienia.gov.pl

**Проблема:** WSO2 OAuth registration вимагається. Безкоштовно, але waiting period 3-14 днів.

**Workaround:** Apify скрапер. У Apify Store є готові актори без OAuth.

**Vadym decision needed:** WSO2 OAuth (legitimate, slow) vs Apify (fast, ToS gray)?

---

## 9. LINKEDIN PROBLEMATICS SECTION

### А. Юридичні проблеми

**ToS:** LinkedIn забороняє scraping. Якщо впіймають — закрита акаунт, IP block, можливий суд (US hiQ vs LinkedIn 2019 — public data scraping не злочин у США, але це США не PL).

**ЄС sui generis:** Бази даних захищені.

**GDPR (ключовий):** LinkedIn = персональні дані. Збір без згоди = порушення. Штраф до 4% обороту або 20 млн €.

**Виняток legitimate interest:** B2B контекст частково покриває для публічних професійних даних.

**Як індустрія:**
1. **Sales Navigator** ($80/міс) — legitimate, але дані не експортуються автоматично
2. **Apollo.io / ZoomInfo** — третя сторона, у ЄС обережно, якість для PL так собі
3. **Apify "compliant" actors** — публічні профілі, технічно ToS violation, OK у малому масштабі

### Б. Технічні проблеми

LinkedIn антибот = найжорсткіший:
- Detection IP — residential proxies $8/GB обов'язково
- Browser fingerprinting детектує headless
- CAPTCHA після кількох запитів
- Rate limit ~30/день per session
- Login required для більшості корисних даних
- "Out of network" для частини запитів

Реально через Apify HarvestAPI:
- $0.05-0.10 per profile
- 30-60 секунд per profile
- Reliability ~70%

### В. Якість даних

- **Хороша:** mid-size PL (50+ employees) — активно ведуть company page
- **Погана:** small JDG, малі sklepy
- **Середня:** restaurants/cateringi

### Г. Альтернативи (legal + cheaper)

1. **rejestr.io persons** — імена zarządу + KRS повноваження. Legal.
2. **Tavily extract на firma /zarzad сторінку** — більшість серйозних publishes.
3. **Apify krs-fullnames-scraper** — реальні з KRS PDF.
4. **Apify universal-lead-finder** — DuckDuckGo + websites.

🚫 **Email guess + SMTP verify — NEVER (Vadym заборона)**

### Д. Триггер активації

**Не у MVP.** Активуємо коли:
1. Середня вартість одного клієнта > $500
2. Matчинг знайде 100+ candidates де decision-maker критично
3. Post-revenue стабільні $5K+/міс

**Замість у Sprint S-CORE.2:** Tavily extract + Apify krs-fullnames — 70% того що LinkedIn дав би.

---

## 10. BUDGET ANALYSIS (Updated v2)

### Active sources cost

| Source | Type | Cost/міс realistic |
|---|---|---|
| CEIDG | API key | Free |
| KRS rejestr.io | Subscription | $30-100 |
| GUS BIR | API key | Free |
| VAT BL | API | Free |
| Tavily | Free tier 1000 credits | Free |
| Google Places | $200 free credits — реально $0 при 1500-2000 запитах/міс | Free |
| Apify | Free $5 credits — вистачить при 50-100 lookups/міс | Free |
| Anthropic | Pay-per-token | $5-20 |
| **TOTAL CURRENT** | | **$35-120** |

### Postponed (триггерний)

| Source | Cost/міс | Trigger |
|---|---|---|
| KRD | 300-800 PLN | When B2B credit sales |
| LinkedIn Apify | $30 + per profile | Post-revenue $5K/міс |
| Premium intel (Aleo) | $100+ | Post-revenue |

### Skip-list

- **🚫 Email guess + SMTP verify** — Vadym заборона
- **Aleo, Bisnode** — premium $100+/міс, free covers 80%
- **InfoCredit/BIK** — same as KRD
- **Geoportal/CEPiK** — exotic for HoReCa

---

## 11. PHASED ROADMAP

### Sprint S-CORE.2 — Wire client profile (~3-4h)

1. Create `entities/client/sources.ts` (включно з 🆕 Allegro/Empik/OLX)
2. Port lib/intelligence/lookup logic
3. Add scope routing (existing/registry/combined)
4. Create `entities/client/scoring-rules.ts`
5. Create `entities/client/ai-context.ts` (включно з marketplace prompts)
6. UI: button "Аналіз клієнта" на /clients/[id]

### Pre-S-CORE.2 — gaps to fill paralelnie

**Sprint S-CLIENT.GMAPS** (~3-4h) — Google Places API integration
**Sprint S-CLIENT.GUS-MULTI** (~2-3h) — GUS BIR 4 додаткові raporty
**Sprint S-CLIENT.TAVILY-DISCOVERY** (~2h) — Tavily для discovery mode
**🆕 Sprint S-CLIENT.MARKETPLACE** (~3-4h) — Allegro/Empik/OLX seller lookup
**Sprint S-CLIENT.MSIG** (~3-4h) — imsig.pl
**Sprint S-CLIENT.INDUSTRY-FEEDS** (~2-3h) — RSS parsers
**Sprint S-CLIENT.ASOCJACJI** (~3-4h) — PIH + PFPŻ + HoReCa.pl

### Post-S-CORE.2

- LinkedIn — post-revenue triggered
- BZP — після WSO2/Apify decision
- TERYT-OSM — geographic clustering
- KRD — debt registries (triggered)

---

## 12. ANTI-PATTERNS

1. НЕ скидаємо CEIDG/JDG бо "малі"
2. НЕ обмежуємось CEIDG для discovery
3. НЕ покладаємось тільки на rejestr.io persons (RODO-anon fallback)
4. НЕ збираємо контактні без consent для blasts
5. НЕ blindly add high-score без validation
6. НЕ ignoруємо MSiG / industry signals
7. НЕ overload одного source запитами
8. НЕ зберігаємо raw API без structuring
9. НЕ робимо premature scoring optimization
10. НЕ вірим source claims на 100%
11. 🆕 НЕ ignoруємо marketplace presence
12. 🆕 НЕ робимо email guess + SMTP verify (Vadym заборона)

---

## 13. DECISION LOG

### Locked у пам'яті

- 7-layer architecture L1-L7
- Hybrid algo+AI на ВСІХ рівнях
- Conversion-first: 50-100 enriched leads
- KRS critical для sp.z o.o./S.A.
- Tier system A/B/C
- Sztab moat = automated discovery + qualification
- Allegro = data source + sales channel split
- 🆕 Email guess + SMTP verify NEVER (memory #18)

### NEW з v2 (03.05.2026 evening):

- 🆕 B.21 Allegro/Empik/OLX seller profile
- Score + AI Reasoning + Review modes — 3-layer output
- BZP detail з CPV codes
- LinkedIn problematics детально
- Google Places budget clarified — фактично безкоштовний
- Email guess + verify EXCLUDED

### Що відкладено до Vadym discussion

- Чи робимо BZP WSO2 OAuth registration vs Apify scraper?
- Чи Sztab активно discovery через Allegro category search?
- Threshold auto-add у Mode B — default conservative чи aggressive?

### Що готово для S-CORE.2 implementation

- Source list complete (16 discovery + 22 enrichment + 8 hybrid)
- Use case matrix done
- Engine routing logic clear
- Score + AI Reasoning + Review architecture defined

---

## END OF DOCUMENT v2

**Файл:** docs/sztab-client-sources-discovery.md
**Status:** v2 — ready for Vadym final review
**Next step:** Vadym Q&A (BZP path + auto-add threshold) → S-CORE.1 build start
