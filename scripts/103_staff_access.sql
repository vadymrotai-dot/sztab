-- 103_staff_access.sql — Faza 1: dostęp pracownika (staff) z pełnymi
-- uprawnieniami jak Vadym, pod osobnym loginem. BEZ ról/ograniczeń — start
-- "staff = pełny dostęp". Ukrycie marży/settings = warstwa aplikacji + niżej.
--
-- Mechanizm: additywne polityki RLS. Postgres łączy permissive-polityki przez
-- OR, więc dodajemy PO JEDNEJ polityce per tabela — istniejących owner-polityk
-- NIE ruszamy (zero ryzyka regresji dla Vadyma, łatwy rollback = DROP tych).
--
-- Model: Vadym NIE jest w staff_members (widzi swoje dane przez owner-polityki
-- auth.uid()=owner_id). staff_members zawiera tylko pracowników. Kod ustawia
-- owner_id = WORKSPACE_OWNER_ID (uid Vadyma) na wszystkich insertach → i Vadym,
-- i staff operują na tym samym zbiorze wierszy.

begin;

-- ── 1. Tabela pracowników ────────────────────────────────────────────────────
create table if not exists public.staff_members (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  email         text not null,
  name          text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- RLS on, BEZ polityk permissive dla `authenticated` → tabela niedostępna przez
-- user-client (deny-by-default). Zarządzanie wyłącznie service-rolem (admin),
-- który omija RLS. is_staff_member() (SECURITY DEFINER) czyta ją niezależnie.
alter table public.staff_members enable row level security;

-- ── 2. Funkcja pomocnicza (wzór current_portal_client_id) ────────────────────
-- SECURITY DEFINER → wewnętrzny select omija RLS na staff_members.
create or replace function public.is_staff_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members
    where auth_user_id = auth.uid() and active
  );
$$;

revoke all on function public.is_staff_member() from public;
grant execute on function public.is_staff_member() to authenticated, anon, service_role;

-- ── 3. Additywne polityki na 16 owner-based tabelach ─────────────────────────
-- FOR ALL (select/insert/update/delete) TO authenticated. Istniejące
-- owner-polityki zostają — OR łączy je z tą.
do $$
declare t text;
  tables text[] := array[
    'clients','products','suppliers','contacts','deals','deal_events',
    'deal_items','client_contact_methods','client_delivery_points',
    'client_notes','order_templates','discovered_entities','intelligence_runs',
    'knowledge_base','people','habits'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists staff_all_%1$s on public.%1$I', t);
    execute format(
      'create policy staff_all_%1$s on public.%1$I for all to authenticated '
      'using (public.is_staff_member()) with check (public.is_staff_member())',
      t
    );
  end loop;
end $$;

-- ── 4. settings — WYKLUCZENIE staff (marże/kurs/progi) ───────────────────────
-- Dziś: read+write USING(true) dla authenticated. Zmiana: dostęp tylko dla
-- NIE-staff (Vadym). Pracownik nie widzi konfiguracji marż.
drop policy if exists settings_read_authenticated on public.settings;
drop policy if exists settings_write_authenticated on public.settings;

create policy settings_read_authenticated on public.settings
  for select to authenticated
  using (not public.is_staff_member());

create policy settings_write_authenticated on public.settings
  for all to authenticated
  using (not public.is_staff_member())
  with check (not public.is_staff_member());

commit;
