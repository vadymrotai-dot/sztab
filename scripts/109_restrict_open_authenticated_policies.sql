-- 109_restrict_open_authenticated_policies.sql
-- Cel: zamknąć 39 polityk RLS "TO authenticated USING (true)" tak, aby dane
-- wewnętrzne (persons, prospects, cohorts, financials, CRBR...) widział tylko
-- właściciel i zatwierdzony staff. Konta portalowe (DAGOLD) i przyszli partnerzy
-- nie mogą ich czytać przez PostgREST. Service-role (crony, skrypty) omija RLS.
-- Pozostają otwarte tylko 4 tabele referencyjne (PKD, mapowanie CN).
-- Odwracalne: kopia polityk w _policy_backup_109 + sekcja ROLLBACK na dole.
-- Uruchamiać w Supabase SQL Editor (jedna transakcja).

BEGIN;

-- 1. Funkcja: kto jest "wewnętrzny" (właściciel lub zatwierdzony staff)
create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = 'da368856-bc33-42b2-adc4-625d66a43e6f'::uuid
         or public.is_staff_member()
$$;
revoke all on function public.is_internal_user() from public;
grant execute on function public.is_internal_user() to authenticated, service_role;

-- 2. Kopia zapasowa dotychczasowych polityk
create table if not exists public._policy_backup_109 as
select tablename, policyname, cmd, roles::text as roles, qual, with_check
from pg_policies
where schemaname = 'public' and qual = 'true' and 'authenticated' = any(roles::text[]);
alter table public._policy_backup_109 enable row level security;  -- bez polityk = niedostępna dla klientów

-- 3. Podmiana polityk (poza tabelami referencyjnymi)
do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd from public._policy_backup_109
    where tablename not in ('pkd_2007','pkd_2025','pkd_mapping','commodity_to_cn_map')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    if r.cmd = 'SELECT' then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_internal_user())', r.policyname, r.tablename);
    elsif r.cmd = 'UPDATE' then
      execute format('create policy %I on public.%I for update to authenticated using (public.is_internal_user()) with check (public.is_internal_user())', r.policyname, r.tablename);
    else  -- ALL
      execute format('create policy %I on public.%I for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user())', r.policyname, r.tablename);
    end if;
  end loop;
end $$;

-- 4. Kontrola: ile polityk nadal otwartych (oczekiwane: 4)
select count(*) as nadal_otwarte, string_agg(tablename, ', ') as tabele
from pg_policies
where schemaname='public' and qual='true' and 'authenticated'=any(roles::text[]);

COMMIT;

-- ======================= TEST (uruchom OSOBNO po COMMIT) =======================
-- a) Losowy użytkownik (symulacja konta portalowego) — oczekiwane: 0 wierszy / false
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
--   select public.is_internal_user() as internal, (select count(*) from persons) as persons_visible,
--          (select count(*) from ceidg_prospects) as prospects_visible;
--   rollback;
-- b) Właściciel — oczekiwane: true i pełne liczby
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"da368856-bc33-42b2-adc4-625d66a43e6f","role":"authenticated"}';
--   select public.is_internal_user() as internal, (select count(*) from persons) as persons_visible,
--          (select count(*) from ceidg_prospects) as prospects_visible;
--   rollback;

-- ============================ ROLLBACK (w razie problemów) ======================
-- do $$ declare r record; begin
--   for r in select * from public._policy_backup_109 where tablename not in ('pkd_2007','pkd_2025','pkd_mapping','commodity_to_cn_map') loop
--     execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
--     if r.cmd='SELECT' then execute format('create policy %I on public.%I for select to authenticated using (true)', r.policyname, r.tablename);
--     elsif r.cmd='UPDATE' then execute format('create policy %I on public.%I for update to authenticated using (true)', r.policyname, r.tablename);
--     else execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', r.policyname, r.tablename); end if;
--   end loop; end $$;
