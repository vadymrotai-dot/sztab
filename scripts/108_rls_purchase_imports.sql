-- ============================================================
-- 108_rls_purchase_imports.sql
-- Fix (03.10.2026) — alert Supabase: rls_disabled (critical) na 3 tabelach
-- importu zakupów. Włączamy RLS w trybie Option B (jak tabela `orders`):
-- tylko service-role ma dostęp, bez polityk dla anon/authenticated.
--
-- Uzasadnienie (audyt STEP 0):
--   product_aliases, purchase_imports, purchase_import_lines są czytane i
--   zapisywane WYŁĄCZNIE przez lib/orders/purchase-import.ts, który używa
--   createAdminClient() (SUPABASE_SERVICE_ROLE_KEY). Service role omija RLS,
--   więc import faktur / aliasy działają bez zmian. Żaden session/browser
--   client nie dotyka tych tabel → polityki staff_all_* są zbędne (i byłyby
--   błędne: właściciel konta nie jest approved-staff, nie przeszedłby
--   is_staff_member()). ENABLE RLS bez polityk = anon/authenticated tracą
--   bezpośredni dostęp → alert zamknięty.
--
-- Idempotentne: ALTER ... ENABLE ROW LEVEL SECURITY jest bezpieczne do
-- ponownego uruchomienia (brak błędu gdy już włączone).
-- ============================================================

ALTER TABLE public.product_aliases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_imports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_import_lines ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.product_aliases IS
  'RLS enabled (Option B) — service-role only access via lib/orders/purchase-import.ts (createAdminClient).';
COMMENT ON TABLE public.purchase_imports IS
  'RLS enabled (Option B) — service-role only access via lib/orders/purchase-import.ts (createAdminClient).';
COMMENT ON TABLE public.purchase_import_lines IS
  'RLS enabled (Option B) — service-role only access via lib/orders/purchase-import.ts (createAdminClient).';

-- ============================================================
-- WERYFIKACJA (uruchom po migracji — oczekiwane relrowsecurity = true dla 3):
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('product_aliases','purchase_imports','purchase_import_lines');
-- ============================================================
-- END 108
-- ============================================================
