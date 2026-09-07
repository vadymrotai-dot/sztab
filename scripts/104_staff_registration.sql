-- 104_staff_registration.sql — Faza staff-registration: samorejestracja pracownika
-- (magic link) + kolejka oczekująca + ręczne zatwierdzenie przez Vadyma.
-- Mirror client_portal_accounts (status pending/approved/rejected).
--
-- Bezpieczeństwo: is_staff_member() = status='approved'. Świeżo zarejestrowany
-- pracownik ma status='pending' → is_staff_member()=false → gate w middleware
-- trzyma go na /staff/onboard (zero dostępu do systemu).

begin;

-- Pełny status zamiast samego active (rejection + kolejka jak w portalu).
alter table public.staff_members
  add column if not exists status text not null default 'pending',
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;

-- Ograniczenie wartości status.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_members_status_chk'
  ) then
    alter table public.staff_members
      add constraint staff_members_status_chk
      check (status in ('pending','approved','rejected'));
  end if;
end $$;

-- Backfill: istniejące active=true → approved (zachowanie ciągłości; obecnie brak).
update public.staff_members
  set status = 'approved',
      approved_at = coalesce(approved_at, now())
  where active is true and status = 'pending';

-- is_staff_member() — źródłem prawdy jest status='approved' (nie active).
create or replace function public.is_staff_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members
    where auth_user_id = auth.uid() and status = 'approved'
  );
$$;

commit;
