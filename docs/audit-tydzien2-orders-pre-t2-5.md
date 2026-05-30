# TYDZIEN2 — ORDERS Audit (pre-T2.5)

**Data**: 28.05.2026 · **Тип**: read-only audit ·
**Goal**: зрозуміти структуру замовлень перш ніж планувати T2.5 (timeline історії взаємодій).

---

## 1. Schema — `orders` + `order_items`

### 1.1 `orders` table

Створена у `scripts/068_orders_schema.sql` (Sprint S-ORDER.1.A, 19.05.2026).
Розширена міграціями 070-072.

**Колонки (всі migrations 068+070+071+072):**

| Колонка | Type | Призначення |
|---|---|---|
| `id` | UUID PK | — |
| `access_token` | UUID UNIQUE | embedded у public link `/zamowienie/[token]` |
| `client_id` | UUID NOT NULL FK→clients | завжди прив'язано до клієнта |
| `cohort_id` | UUID FK→cohorts | nullable, для tracking з якої когорти leadу |
| `order_number` | TEXT UNIQUE | `ZIO-YYYY-NNNN` (sequence `orders_seq`) або `DRAFT-{ms}-{nonce}` для drafts |
| `status` | TEXT CHECK | `draft / submitted / confirmed / in_realization / shipped / invoiced / cancelled` |
| `contact_person/phone/email` | TEXT | submitter дані (заповнюються при submission) |
| `delivery_address` | TEXT | вільний text (NO structured fields — без street/city/postcode/country) |
| `preferred_delivery_date` | DATE | бажана дата |
| `customer_notes / internal_notes` | TEXT | дві окремі notes columns |
| `tier_at_submit` | TEXT CHECK | snapshot price tier `maly/sredni/duzy` |
| `cennik_tier` | TEXT DEFAULT 'standard' | (071) `standard` vs `wielki_hurt` |
| `price_mode` | TEXT DEFAULT 'auto' | (072) `auto / minimum` |
| `price_hurt_wh` | NUMERIC | (072) overridе для wielki hurt |
| `total_net / total_vat / total_brutto` | NUMERIC | (snapshot totals) |
| `vat_rate` | NUMERIC DEFAULT 0.05 | |
| `proforma_*` (4 cols) | (070) | proforma_fakturownia_id/number, proforma_pdf_url, proforma_created_at |
| `vat_*` (4 cols) | (070) | vat_fakturownia_id/number, vat_pdf_url, vat_created_at |
| `link_opened_at / submitted_at / confirmed_at` | TIMESTAMPTZ | event timestamps |
| `created_at / updated_at` | TIMESTAMPTZ | |
| `created_by_user_id` | UUID | |

**FK:** `client_id` REFERENCES `clients(id)` — кожне замовлення прив'язано до клієнта.

**Indexes:** client_id, cohort_id, status, access_token.

### 1.2 `order_items` table

```sql
CREATE TABLE order_items (
  id UUID PK,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  -- Snapshots (frozen at submit, NOT changed retroactively):
  product_name_snapshot TEXT NOT NULL,
  gramatura_snapshot TEXT,
  qty INTEGER CHECK (qty > 0),
  unit_price NUMERIC(10,2) CHECK (unit_price >= 0),
  line_total NUMERIC(10,2) CHECK (line_total >= 0),
  created_at TIMESTAMPTZ
);
```

**FK:** `order_id` cascade delete, `product_id` references products (kept навіть якщо product видалено — snapshot захищає від data loss).

Тобто **items = окремі rows у dedicated table, НЕ JSON колонка у orders**.

---

## 2. Real Data (live DB, 28.05.2026)

**Total orders у DB: 17 rows.** З них:

- **3 реальні** (status='submitted', non-test) — WIX MART + Galinka × 2
- **5 cancelled/invoiced** (ZIO-0001..0005) — smoke tests Vadym'а
- **9 DRAFT-*** rows — auto-created drafts через `link_opened_at` (хтось клікнув offer link, не submit). Order_number prefix `DRAFT-{ms}-{nonce}` — placeholder, не ZIO-YYYY-NNNN sequence.
- **1 `DRAFT-TEMP`** sentinel (placeholder bug).

### 2.1 Реальні замовлення — short view

| # | Date | Client | Items | Net (PLN) | Brutto (PLN) | Delivery addr | Status |
|---|---|---|---:|---:|---:|---|---|
| ZIO-2026-0006 | 2026-05-26 12:19 | GALINKA Sp. z o.o. | 6 | 186.15 | 195.46 | KOLEJOWA 49A/U7, Warszawa | submitted (preferred 27.05) |
| ZIO-2026-0007 | 2026-05-26 12:23 | GALINKA Sp. z o.o. (той же client_id) | 7 | 251.17 | 263.73 | Kasprzak 31 U9, Warszawa | submitted (preferred 28.05) |
| ZIO-2026-0008 | 2026-05-28 08:47 | Wix markt | 1 | 553.40 | 581.07 | Konduktorska 18/7, Warszawa | submitted (no preferred) |

**Spot-checks:**

- Galinka client_id = `77335122-e964-4582-978b-3737f97eaf55`. **Один клієнт, два замовлення** — НЕ split одного, а два окремі rows orders.
- Контакти:
  - Galinka: Artur Ulasiuk · +48 721 470 989 · galinka.sp.z.o.o@gmail.com (однакові для обох)
  - WIX MART: Viktoriia · +48 789 932 279 · biuro@wixmart.pl
- VAT rate = 0.05 (5%) у всіх 3 (kiszonki).
- `cohort_id` = NULL у всіх 3 — leads from outside cohort flow.
- `link_opened_at` зафіксовано (telemetria when client opened offer link).

### 2.2 Реальні items (приклад ZIO-2026-0007 Galinka Kasprzak)

| Product (snapshot) | Gram | Qty | Unit | Total |
|---|---|---:|---:|---:|
| Kapusta kiszona | 3000 g | 2 | 15.66 | 31.32 |
| Pełuska — kapusta w marynacie buraczanej | 3000g/~2000g | 2 | 18.45 | 36.90 |
| Marchewka po koreańsku | 3000 g | 2 | 27.67 | 55.34 |
| Sałatka z buraków czerwonych | 3000 g | 1 | 29.07 | 29.07 |
| Ogórki kiszone — wiadro 5L | 5000g/~3000g | 1 | 27.67 | 27.67 |
| Pomidory kiszone — wiadro 5L | 5000g/~3000g | 1 | 27.67 | 27.67 |
| Buraki gotowane sterylizowane | 1500 g | 3 | 14.40 | 43.20 |
| **Σ** | | | | **251.17** |

WIX MART (ZIO-2026-0008): тільки 1 item — `Marchewka po koreańsku` × 20 = 553.40 net. Це single-SKU repeat order.

---

## 3. Items Structure (підсумок)

- **Окрема таблиця** `order_items` з FK до `orders(id)` ON DELETE CASCADE та FK до `products(id)` (NOT cascade — product не видаляється).
- **Snapshots** для product_name + gramatura + unit_price → freeze at submit, не мігрують при зміні products.
- Line totals stored (`line_total`), order totals теж stored у `orders` (denormalized).
- Per item має `created_at` — useful для item-level activity? Recommend NO (надмірна granularность для T2.5 — timeline по orders не по items).

---

## 4. UI Стан

### 4.1 Admin/Vadym view (де видно ВСІ замовлення)

`/operacje/zamowienia` (`app/operacje/zamowienia/page.tsx`) — Server Component:
- JOIN `clients!inner(id, title, nip, city)`
- Sort `created_at DESC`, limit 100
- Bypass RLS через `createAdminClient()` (admin тіл бачить все)
- Delegates до `OrdersList` component

`/operacje/zamowienia/[id]` — order detail page. Має кнопки issue-VAT-invoice, advance-status etc.

### 4.2 Client public form (де клієнт сабмiтить)

`/zamowienie/[token]` (`app/zamowienie/[token]/page.tsx`) + `app/zamowienie/layout.tsx`:
- Public access — anon може відкрити по `access_token`
- API: `/api/orders/[token]/route.ts` (GET draft), `/api/orders/[token]/submit/route.ts` (POST)
- Створюється Vadym'ом через `SendOfferButton` на client profile → `POST /api/clients/[id]/send-offer/route.ts` → INSERT draft orders row + email link

### 4.3 Client profile (Vadym critique гарячий point)

`app/(dashboard)/clients/[id]/page.tsx` (~720 рядків): **НЕМАЄ section "Замовлення"**.

Grep на `orders|Zamówienia|zamowienia` у тому файлі → **0 matches**. Тільки `OrderLinkButton` на toolbar (це action button "wygeneruj link") + `SendOfferButton` (теж action), але **списку існуючих orders на профілі НЕМАЄ**.

**Висновок**: для Galinka client profile НЕ показує що там 2 active submitted замовлення. Vadym має йти в `/operacje/zamowienia` і там фільтрувати. Це **точно the user-facing gap для T2.5**.

---

## 5. Galinka Dual-Address Problem (опис на майбутнє, не зараз)

### 5.1 Що зараз у DB

```
client_id = 77335122 (Galinka Sp. z o.o.)
  ├─ order ZIO-2026-0006: delivery="KOLEJOWA 49A/U7", preferred 27.05
  └─ order ZIO-2026-0007: delivery="Kasprzak 31 U9", preferred 28.05
```

Два **окремі orders rows** з тим самим `client_id`. Один контакт-person (Artur Ulasiuk),
але дві фізичні адреси доставки.

### 5.2 Чому це проблема моделі (поверхневий аналіз)

Поточна модель: **delivery_address — це free TEXT column на orders**. Кожне замовлення несе свою адресу. Це OK коли:
- One-off ship-to-anywhere.
- Кожне замовлення на іншу адресу = окрема операція.

Стає проблемою коли:
- Клієнт має **multiple постійних точок продажу** (Galinka має 2 sklepy у Warszawa: Kolejowa + Kasprzak). Кожний sklep робить свій order. Це **не "один контракт з 2 адресами"**, це "2 sklepy одного юр.ос. замовляють окремо".
- Treasury / VAT — все на тому ж NIP, але logistics ділиться між точками.
- UI має показати клієнт-level view: "ця firma має 2 punkty sprzedaży, ось окреmа history per punkt".

### 5.3 Possible models (для майбутнього sprintу T2.X)

| Model | Pros | Cons |
|---|---|---|
| **Залишити free TEXT** (як зараз) | Простий | Не можна groupувати/filterувати per точка, не можна reuse addresses |
| **Розширити з `delivery_address_label` text** ("KOLEJOWA", "KASPRZAK") | Lightweight tag | User manually вводить, не consistent |
| **Нова table `client_locations`** (FK до clients + name + address) → orders.delivery_location_id | Properly normalized, можна історію per location | Migration + UI form change + backfill 3 existing orders |

**Recommend**: **defer до T3+**. На зараз dual-orders працює. T2.5 timeline просто покаже два ивенти "Замовлення з адресою X" — це валідне behavior.

---

## 6. Як замовлення лягають у T2.5 timeline

### 6.1 Timestamps доступні для activity feed

| Event | Timestamp | T2.5 activity_type |
|---|---|---|
| Order створено (через SendOfferButton) | `orders.created_at` | `offer_link_generated` |
| Klient відкрив link | `orders.link_opened_at` (nullable) | `offer_link_opened` |
| Klient submit'нув | `orders.submitted_at` (nullable) | `order_submitted` |
| Vadym confirmed | `orders.confirmed_at` (nullable) | `order_confirmed` |
| Proforma issued | `orders.proforma_created_at` | `proforma_issued` |
| VAT invoice | `orders.vat_created_at` | `vat_invoice_issued` |

**Тобто per order до 6 окремих timeline events** (всі stored as nullable timestamps у одній `orders` row — easy SELECT for VIEW).

### 6.2 SQL backfill VIEW (приклад для T2.4 `client_activity`)

```sql
CREATE OR REPLACE VIEW v_client_activity_orders AS
SELECT o.client_id, 'offer_link_generated' AS activity_type,
       o.created_at AS occurred_at,
       jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
         'tier', o.cennik_tier, 'delivery', o.delivery_address) AS payload,
       o.id AS related_order_id
FROM orders o WHERE o.created_at IS NOT NULL
UNION ALL
SELECT o.client_id, 'offer_link_opened',  o.link_opened_at, ...
WHERE o.link_opened_at IS NOT NULL
UNION ALL  -- submitted, confirmed, proforma, vat
...
;
```

Чи **dedicated `client_activity` table з UPSERT з orders на update** — обидва підходи валідні. VIEW швидше для першого MVP (no schema change for backfill).

### 6.3 Top-of-page section на client profile

`/clients/{id}` має додати accordion section **"Zamówienia"** який рендерить orders WHERE client_id = id:
- Sort by created_at DESC
- Status badge (draft / submitted / invoiced / cancelled)
- Order number link до `/operacje/zamowienia/{id}`
- Total + item count + delivery address (truncated)

Це **окрема секція** + входить у unified T2.5 activity feed.

### 6.4 Galinka edge case у timeline

Для clientу 77335122 (Galinka) timeline покаже:
```
2026-05-26 12:23  📦 Zamówienie ZIO-2026-0007 wysłane (Kasprzak 31, 263.73 PLN)
2026-05-26 12:19  📦 Zamówienie ZIO-2026-0006 wysłане (Kolejowa 49A, 195.46 PLN)
2026-05-26 12:21  🔗 Klient otworzył link ZIO-2026-0007
2026-05-26 12:17  🔗 Klient otworzył link ZIO-2026-0006
2026-05-26 11:51  ✉️ Wysłano link ZIO-2026-0007 (Vadym)
2026-05-26 11:51  ✉️ Wysłano link ZIO-2026-0006 (Vadym)
...
```

Два orders на одному дні, один client — natural timeline. Жодних "merge" не потрібно.

---

## 7. Висновки + входи для T2.5 планування

### 7.1 Хорошо

- ✅ Schema `orders` + `order_items` чиста, all FK to clients ✓
- ✅ Status enum покриває lifecycle (draft → submitted → confirmed → invoiced → ...)
- ✅ 6 distinct timestamps per order — багато natural events для timeline
- ✅ `customer_notes` + `internal_notes` — 2 окремі columns, OK semantically
- ✅ Snapshot pattern в `order_items` — solid (не lose product data on delete)

### 7.2 Gaps для T2.5

1. **Client profile НЕ має section "Замовлення"** — це найбільший gap. Single grep підтвердив 0 matches. Fix = add accordion section з SELECT orders WHERE client_id ORDER BY created_at DESC.
2. **Activity feed missing** — `client_activity` table не існує (audit STEP 0). Orders timestamps треба з'єднати у timeline.
3. **DRAFT clutter** — 12 draft rows у orders (auto-created при click on offer link). Якщо timeline покаже все = noise. Recommend filter `status != 'draft'` у timeline OR показати "klient kliknął ofertę, nie zamawiał" як distinct event.
4. **Galinka dual-orders** — НЕ є проблемою для T2.5 (просто 2 окремі events). Defer model rework до T3+.

### 7.3 Recommend для T2.5 minimum-viable

1. **Add accordion section "Zamówienia"** на `/clients/[id]` (SELECT orders + status badge + link)
2. **Create VIEW** `v_client_activity_orders` UNION 6 event types з orders
3. (Optional T2.4) Create `client_activity` table з backfill VIEW INSERT
4. Filter `status != 'draft'` в timeline OR distinct "offer_link_opened" event
5. NOT touched: Galinka dual-address model rework, item-level events, real-time push

---

## 8. Live numbers

```
Orders total: 17
  submitted (real): 3 (ZIO-2026-0006/0007 Galinka, 0008 WIX MART)
  invoiced: 1 (ZIO-2026-0005 Vadym smoke test)
  cancelled: 5 (ZIO-2026-0001..0004 + DRAFT-* cancelled)
  draft (active): 8
  DRAFT-TEMP: 1 (legacy placeholder)

Order items: 14 rows total (7 Galinka 0007 + 6 Galinka 0006 + 1 WIX MART 0008)

Real revenue cumulative (submitted/invoiced): 581.07 + 263.73 + 195.46 = 1040.26 PLN brutto
```

---

**STOP — audit complete. ZERO writes, тільки read.** Чекаю GO на T2.5 планування.
