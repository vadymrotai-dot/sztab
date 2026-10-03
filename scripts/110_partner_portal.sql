-- 110_partner_portal.sql — Portal zewnętrznych partnerów (Credipass, FBA, ...).
--
-- Cel: analog client_portal (100_client_portal.sql), ale dla zewnętrznych
-- partnerów B2B, którym udostępniamy wybrane, wzbogacone firmy-leady (np.
-- paczka 100 firm BGK/Credipass). Każdy partner widzi WYŁĄCZNIE firmy, które
-- mu przypisaliśmy (partner_company_links), nigdy firmy innych partnerów i
-- nigdy wewnętrzne tabele (clients/deals/...).
--
-- Celowo NOWE, izolowane tabele/funkcje/routing (partners, partner_accounts,
-- bgk_companies, partner_company_links, partner_login_links,
-- current_portal_partner_id()) — NIE rozszerzamy client_portal_accounts /
-- portal_login_links / current_portal_client_id(), żeby zero ryzyka regresji
-- na działającym portalu DAGOLD.
--
-- Konto partnera tworzy TYLKO admin (service-role), analog
-- createPortalAccountForClient — nie ma samodzielnej rejestracji jak w
-- client_portal (tam weryfikacja przez NIP ma sens, tu nie, bo partner nie
-- jest naszym klientem w `clients`).

begin;

-- ── 1. Partnerzy (Credipass, FBA, ...) ───────────────────────────────────────
create table if not exists public.partners (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.partners enable row level security;

-- ── 2. Konta logowania partnera (1 auth user = 1 partner) ───────────────────
create table if not exists public.partner_accounts (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  partner_id    uuid not null references public.partners(id) on delete cascade,
  email         text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

alter table public.partner_accounts enable row level security;

-- Resolver (wzór current_portal_client_id) — SECURITY DEFINER, omija RLS na
-- partner_accounts, żeby polityki na bgk_companies/partner_company_links
-- mogły z niej bezpiecznie korzystać bez rekursji RLS.
create or replace function public.current_portal_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select partner_id
  from public.partner_accounts
  where auth_user_id = auth.uid() and active
  limit 1;
$$;

revoke all on function public.current_portal_partner_id() from public;
grant execute on function public.current_portal_partner_id() to authenticated, anon, service_role;

create or replace function public.is_partner_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partner_accounts
    where auth_user_id = auth.uid() and active
  );
$$;

revoke all on function public.is_partner_user() from public;
grant execute on function public.is_partner_user() to authenticated, anon, service_role;

-- ── 3. Firmy-leady (np. paczka BGK/Credipass) ───────────────────────────────
-- Schemat szeroki + raw_data jsonb na resztę kolumn z CSV, żeby import (krok
-- osobny) nie wymagał kolejnej migracji przy dojściu nowych pól. Dokładne
-- mapowanie kolumn CSV → import script, robione na realnym pliku, nie na
-- pamięć.
create table if not exists public.bgk_companies (
  id                          uuid primary key default gen_random_uuid(),
  nip                         text not null unique,
  name                        text not null,
  krs                         text,
  regon                       text,
  legal_form                  text,
  address                     text,
  pkd_main                    text,
  zarzad                      jsonb,
  beneficjent_crbr            jsonb,
  ekrs_doc_count              integer,
  zgodnosc_zarzad_beneficjent text,
  source_batch                text not null default 'BGK_TESTOWA_PACZKA_100',
  raw_data                    jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.bgk_companies enable row level security;

-- ── 4. Przypisanie firma ↔ partner + interakcja (status/notatki/staff) ─────
create table if not exists public.partner_company_links (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.partners(id) on delete cascade,
  company_id         uuid not null references public.bgk_companies(id) on delete cascade,
  status             text not null default 'new'
                      check (status in ('new','in_progress','contacted','qualified','rejected','converted')),
  notes              text,
  assigned_staff_id  uuid references auth.users(id) on delete set null,
  deal_id            uuid references public.deals(id) on delete set null,
  shared_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (partner_id, company_id)
);

alter table public.partner_company_links enable row level security;

-- ── 5. Krótkie linki logowania partnera (wzór portal_login_links) ──────────
create table if not exists public.partner_login_links (
  slug         text primary key,
  partner_account_id uuid not null references public.partner_accounts(id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null
);

-- RLS on, BEZ polityk → dostęp wyłącznie service-role (jak portal_login_links).
alter table public.partner_login_links enable row level security;

-- ── 6. Polityki RLS ──────────────────────────────────────────────────────────

-- partners: tylko wewnętrzni (owner/staff).
create policy partners_internal_all
  on public.partners
  for all
  to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

-- partner_accounts: wewnętrzni full; partner widzi WŁASNY wiersz (żeby np.
-- wyświetlić swój e-mail w UI), bez możliwości edycji.
create policy partner_accounts_internal_all
  on public.partner_accounts
  for all
  to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

create policy partner_accounts_self_select
  on public.partner_accounts
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- bgk_companies: wewnętrzni full; partner tylko SELECT firm, które ma
-- przypisane (join przez partner_company_links). Partner NIE może edytować
-- samej firmy — tylko link (status/notes).
create policy bgk_companies_internal_all
  on public.bgk_companies
  for all
  to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

create policy bgk_companies_partner_select
  on public.bgk_companies
  for select
  to authenticated
  using (
    exists (
      select 1 from public.partner_company_links pcl
      where pcl.company_id = bgk_companies.id
        and pcl.partner_id = public.current_portal_partner_id()
    )
  );

-- partner_company_links: wewnętrzni full; partner SELECT/UPDATE (status,
-- notes) wyłącznie własnych wierszy — "взаємодіяти з ними" (Vadym: "Все").
create policy partner_company_links_internal_all
  on public.partner_company_links
  for all
  to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

create policy partner_company_links_partner_select
  on public.partner_company_links
  for select
  to authenticated
  using (partner_id = public.current_portal_partner_id());

create policy partner_company_links_partner_update
  on public.partner_company_links
  for update
  to authenticated
  using (partner_id = public.current_portal_partner_id())
  with check (partner_id = public.current_portal_partner_id());

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEST (uruchamiać ręcznie, PO commit powyżej) — analog testów z 109.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Kontrola jako serwisowa rola / bez sesji partnera: zero dostępu do
--     bgk_companies / partner_company_links (bo current_portal_partner_id()
--     zwraca null dla kogoś, kto nie ma wiersza w partner_accounts).
-- select public.is_partner_user() as is_partner,
--        public.current_portal_partner_id() as partner_id,
--        (select count(*) from public.bgk_companies) as bgk_visible,
--        (select count(*) from public.partner_company_links) as links_visible;
-- Oczekiwane dla losowego/niepartnerskiego usera: is_partner=false, partner_id=null, bgk_visible=0, links_visible=0.

-- (b) Jako owner/staff: pełne liczby.
-- select public.is_internal_user() as internal,
--        (select count(*) from public.bgk_companies) as bgk_visible,
--        (select count(*) from public.partner_company_links) as links_visible;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (jeśli coś pójdzie nie tak) — usuwa WYŁĄCZNIE nowe obiekty 110,
-- nie dotyka żadnej istniejącej tabeli/polityki.
-- ═══════════════════════════════════════════════════════════════════════════
-- begin;
-- drop table if exists public.partner_login_links;
-- drop table if exists public.partner_company_links;
-- drop table if exists public.bgk_companies;
-- drop table if exists public.partner_accounts;
-- drop table if exists public.partners;
-- drop function if exists public.current_portal_partner_id();
-- drop function if exists public.is_partner_user();
-- commit;
