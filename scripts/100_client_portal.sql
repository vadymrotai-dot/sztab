-- 100_client_portal.sql — Portal klienta Faza 0 (rev.2)
-- Addytywne: nowa tabela + funkcja + polityki portal SELECT.
-- NIE zmienia istniejących polityk *_own (owner_id = auth.uid).

BEGIN;

create table if not exists client_portal_accounts (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid not null references auth.users(id) on delete cascade,
  client_id         uuid references clients(id) on delete set null,   -- NULL do approve
  email             text not null,
  nip_submitted     text,
  matched_client_id uuid references clients(id) on delete set null,   -- kandydat z NIP
  status            text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid,
  created_at        timestamptz not null default now()
);

create unique index if not exists client_portal_accounts_auth_user_uidx
  on client_portal_accounts(auth_user_id);
create index if not exists client_portal_accounts_client_idx
  on client_portal_accounts(client_id);
create index if not exists client_portal_accounts_status_idx
  on client_portal_accounts(status);

alter table client_portal_accounts enable row level security;

drop policy if exists cpa_select_self on client_portal_accounts;
create policy cpa_select_self on client_portal_accounts
  for select using (auth_user_id = auth.uid());

-- resolver: client_id zalogowanego portal-usera (tylko approved). NULL dla admina/anon.
create or replace function current_portal_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from client_portal_accounts
  where auth_user_id = auth.uid() and status = 'approved'
  limit 1
$$;

-- portal SELECT (permissive, OR z *_own). Dla admina resolver = NULL → bez wpływu.
drop policy if exists clients_select_portal on clients;
create policy clients_select_portal on clients
  for select using (id = current_portal_client_id());

drop policy if exists orders_select_portal on orders;
create policy orders_select_portal on orders
  for select using (client_id = current_portal_client_id());

drop policy if exists order_items_select_portal on order_items;
create policy order_items_select_portal on order_items
  for select using (
    order_id in (select id from orders where client_id = current_portal_client_id())
  );

drop policy if exists products_select_portal on products;
create policy products_select_portal on products
  for select using (show_in_orders = true and current_portal_client_id() is not null);

COMMIT;
