# Portal klienta — Faza 0 (rev.2): architektura

**Data:** 31.08.2026 · **Gałąź:** `feat/portal-klienta-faza0` · **Status:** Preview only, NIE main.

## Cel
Osobiste konto klienta B2B: logowanie (magic link), podgląd własnych cen (zgodnych z segmentem / zniżką indywidualną / retail) i złożenie zamówienia. MVP = tylko ceny + zamówienie (reuse `OrderForm`). Historia zamówień/faktur — iteracja 2.

## Zasada nadrzędna
Cena ZAWSZE z `lib/orders/pricing.ts` (`resolveClientDiscount` + `computeNewUnitPrice`) — ten sam import, którego używa GET `/api/orders/[token]` i `submit/route.ts`. Portal NIE tworzy równoległej ścieżki liczenia ceny.

## Stan istniejący (świeży odczyt 31.08)
- `clients`: `id, nip, title, email, price_segment_code, znizka_indywidualna_pct, znizka_indywidualna_kalmar_pct, retail_pricing, owner_id (NOT NULL)`. RLS ON, polityki `*_own` (owner_id = auth.uid = Vadym).
- `products`: `marza_bazowa_pct, cost_pln, dostepnosc, show_in_orders, supplier_id`. RLS ON, `*_own`.
- `orders` / `order_items`: RLS ON, **zero polityk** → dostęp tylko service-role. GET/submit działają service-rolem po `access_token`.
- Auth: dziś tylko `signInWithPassword` (admin Vadym). Magic link (`signInWithOtp`) — nowe, tylko dla portalu.
- Flow zamówienia: `/zamowienie/[token]` (server) → GET `/api/orders/[token]` (service-role, pricing.ts po `order.client_id`) → `<OrderForm token initial>`. Submit → ten sam pricing.

## A. Tabela `client_portal_accounts`
```sql
create table client_portal_accounts (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  client_id     uuid references clients(id) on delete set null,   -- NULL do approve
  email         text not null,
  nip_submitted text,
  matched_client_id uuid references clients(id) on delete set null, -- kandydat z NIP (podpowiedź)
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at  timestamptz not null default now(),
  approved_at   timestamptz,
  approved_by   uuid,
  created_at    timestamptz not null default now()
);
create unique index on client_portal_accounts (auth_user_id);
-- BEZ unique(client_id) — świadomie, docelowo wielu użytkowników per klient.
```

## B. Flow rejestracji (bez auto-link)
1. `/portal/login`: email → `signInWithOtp(email, { emailRedirectTo: /auth/callback?next=/portal/onboard })`.
2. Magic link → `/auth/callback` (exchange) → `/portal/onboard`.
3. `/portal/onboard` (zalogowany): jeśli brak konta → formularz NIP → server action `registerPortalAccount(nip)`:
   - insert `client_portal_accounts(auth_user_id, email, nip, status='pending')`,
   - match `nip` → `clients.nip`; trafienie → `matched_client_id` (podpowiedź, NIE aktywne),
   - service-role: `auth.admin.updateUserById(uid, { app_metadata: { role: 'portal' } })` (tag do middleware),
   - status pozostaje `pending` → ekran „oczekuje na zatwierdzenie".
4. Vadym w adminie (`/portal-accounts`) zatwierdza ręcznie → `status='approved'`, `client_id = matched/wybrany`, `approved_at/by`. **Nigdy auto.**

## C. RLS (osobno od owner_id — defense-in-depth)
- Funkcja `current_portal_client_id()` `SECURITY DEFINER` → `client_id` z `client_portal_accounts` gdzie `auth_user_id = auth.uid()` i `status='approved'` (NULL dla admina/anon).
- `client_portal_accounts`: SELECT własnego wiersza (`auth_user_id = auth.uid()`).
- Dodatkowe polityki SELECT (permissive, OR z istniejącymi — dla admina zwracają NULL, więc bez wpływu):
  - `clients`: `id = current_portal_client_id()`,
  - `orders`: `client_id = current_portal_client_id()`, `order_items` przez order,
  - `products`: `show_in_orders = true AND current_portal_client_id() is not null`.
- MVP order-flow i tak idzie service-rolem (jak dziś); RLS to druga warstwa, gdyby portal kiedyś czytał sesją klienta.

## D. UI — maksymalny reuse
`/portal/zamowienie` (server, sesja): resolve `client_id` (approved) → znajdź/utwórz draft `order` klienta (service-role) → weź jego `access_token` **wewnętrznie** → ten sam GET `/api/orders/[token]` + `<OrderForm token initial>`. Token zostaje wewnętrznym id zamówienia; **granicą dostępu jest sesja logowania**, nie sekret w URL. `order-form.tsx` i pricing — bez duplikacji.

## E. Role-gating (middleware — OBOWIĄZKOWE)
- Middleware czyta `user.app_metadata.role`:
  - `role === 'portal'` → dozwolone tylko `/portal/*` i `/auth/*`; inaczej redirect `/portal`.
  - brak roli (admin) → bez zmian.
  - anon na `/portal/*` (poza `/portal/login`) → redirect `/portal/login`.
- Warstwa autorytatywna (na wypadek opóźnienia propagacji JWT): admin layouty (`app/(dashboard)/layout.tsx`, `app/operacje/layout.tsx`) sprawdzają w DB czy user ma wiersz `client_portal_accounts` → jeśli tak, redirect `/portal`. Portal-user NIGDY nie zobaczy admina.

## Izolacja
Gałąź `feat/portal-klienta-faza0`, Vercel Preview only, main nietknięty. Migracja DB (nowa tabela + funkcja + polityki) jest **addytywna** — nie zmienia istniejących polityk owner.

## Non-goals Fazy 0
Bez historii zamówień/faktur, bez płatności, bez hasła (tylko magic link), bez samodzielnej edycji danych firmy.
