-- 064a_spoonjoy_seed.sql
-- Sprint S6D Day 0 (10.05.2026) — SpoonJoy supplier seed.
--
-- WHY: SpoonJoy відсутня з migration 003 seeds (5 known suppliers:
-- Czudowa Marka, Mod-loszka, Karol, Gmurczyk, Pikniko). Vadym verified
-- через /produkty filter Dostawca що SpoonJoy не в DB. Sprint S6D
-- product_mappings (migration 067) потребує SpoonJoy як 5-го supplier
-- для per-supplier match scoring (CzM/Pikniko/SpoonJoy/Karol/Gmurczyk).
--
-- Pattern: same DO $$ wrapper як migration 003 — owner_id NOT NULL
-- vyrishuje з auth.users.
--
-- Idempotent. Safe to re-run.

DO $$
DECLARE
  current_user_id UUID;
BEGIN
  SELECT id INTO current_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'No row in auth.users — sign up to Sztab first, then re-run this seed.';
  END IF;

  INSERT INTO suppliers (
    owner_id, name, legal_name, type, deal_type, commission_pct,
    verticals, notes
  )
  SELECT
    current_user_id,
    'SpoonJoy',
    'SpoonJoy Sp. z o.o.',
    'producent',
    'agent',
    NULL::numeric,
    ARRAY['miod_w_lyzce']::text[],
    'Mid w lyzce 7g — agent partnership. Sprint S6D Day 0 seed.'
  WHERE NOT EXISTS (
    SELECT 1 FROM suppliers s
    WHERE s.name = 'SpoonJoy' AND s.owner_id = current_user_id
  );
END $$;
