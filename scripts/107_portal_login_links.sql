-- 107_portal_login_links.sql — Короткі "живі" лінки логування до кабінету
-- клієнта (28.09.2026). Ховаємо технічний Supabase magic-link (домен + токен +
-- закодований redirect_to у query) за коротким /l/<slug> на своєму домені.
-- Кожен візит генерує СВІЖИЙ magic-link на льоту і редіректить (app/l/[slug]/
-- route.ts) — лінк можна пересилати кілька разів без "минула година". Живе
-- 3 дні (expires_at), після — нова кнопка "Pobierz link logowania" в адмінці.
--
-- Застосовано напряму через Supabase MCP (apply_migration) 28.09.2026 —
-- цей файл лише документує зміну в репозиторії (project convention:
-- scripts/NNN_*.sql).

create table if not exists public.portal_login_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  expires_at timestamptz not null
);

create index if not exists portal_login_links_client_id_idx
  on public.portal_login_links (client_id);

-- Bez policy — dostęp WYŁĄCZNIE service-role (tak jak client_portal_accounts
-- dla staff). /l/[slug] to publiczny route, ale czyta przez createAdminClient(),
-- nie sesję usera — RLS by tu nic sensownie nie ograniczał.
alter table public.portal_login_links enable row level security;
