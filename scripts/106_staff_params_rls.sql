-- ============================================================
-- 106_staff_params_rls.sql
-- Fix (25.09.2026) — Intelligence lookup: pracownik nie mógł
-- wyszukać/dodać firmy po NIP.
--
-- Bug: tabela params (klucze API: Anthropic, GUS, Apify, KRS-rejestr,
-- Tavily, CEIDG) miała RLS tylko owner_id = auth.uid() — bez wyjątku
-- dla staff, w odróżnieniu od clients (ma staff_all_clients).
-- Sesja pracownika czytała params i dostawała 0 wierszy (wiersz
-- należy do Vadyma) → params.gus_api_key = undefined → cały blok GUS
-- w app/api/intelligence/lookup/route.ts pomijany ("GUS_API_KEY
-- missing") → nigdy nie powstawał nowy wiersz clients → 502
-- "Failed to resolve clients row для NIP". Identyczny błąd dla NIP
-- z myślnikami i bez — normalizeNip() działa poprawnie, problem był
-- wcześniej w łańcuchu (przed samym NIP).
--
-- Ten sam wzorzec dotyczy ~34 innych route'ów czytających params —
-- fix na poziomie RLS naprawia je wszystkie naraz.
--
-- Fix: dodaj staff_all_params, mirroring staff_all_clients dokładnie
-- (ALL, authenticated, is_staff_member()). Zmiana czysto addytywna.
-- Idempotentna (DROP IF EXISTS + CREATE).
--
-- UWAGA (świadoma decyzja): to otwiera WSZYSTKIE klucze w params
-- (Anthropic, GUS, Apify, KRS, Tavily, CEIDG) na odczyt/zapis dla
-- każdej zatwierdzonej sesji staff (obecnie: 1 konto) — wybrane
-- zamiast węższego serwerowego obejścia (service-role helper),
-- bo prościej i spójnie z istniejącym wzorcem staff_all_*.
--
-- Zastosowano na żywo przez Supabase MCP (apply_migration,
-- staff_all_params_rls) 25.09.2026 — ten plik to wyłącznie
-- wersjonowanie historii, zgodnie z wzorcem 105.
-- ============================================================

DROP POLICY IF EXISTS staff_all_params ON public.params;

CREATE POLICY staff_all_params
  ON public.params
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

-- ============================================================
-- END 106
-- ============================================================
