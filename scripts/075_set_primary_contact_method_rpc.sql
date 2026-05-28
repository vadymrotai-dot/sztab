-- ============================================================
-- 075_set_primary_contact_method_rpc.sql
-- Sprint TYDZIEN2.T2.4.C1 (28.05.2026)
-- T2.4.C1 FIX2 (28.05.2026) — explicit p_owner_id param.
-- T2.4.C1 FIX3 (28.05.2026) — 2-step UPDATE inside PL/pgSQL (constraint 23505).
--
-- Atomic primary toggle для client_contact_methods.
--
-- FIX3 background:
--   Wcześniejsza wersja używała ONE-statement UPDATE z expression:
--     SET is_primary = (id = p_method_id) WHERE client_id+kind+owner_id
--   To NIE działało. Audit twierdził że partial UNIQUE INDEX checked at end
--   of statement → race-safe. Postgres TAK NIE robi — partial UNIQUE INDEX
--   checked per-row immediately, NIE deferred (тільки DEFERRABLE constraints
--   defer; partial unique index не może bei DEFERRABLE w Postgres).
--
--   Reality: rows обробляються NON-DETERMINISTIC order. Jeśli przewidziany
--   primary (biuro) processed FIRST, set TRUE → INSERT u partial index →
--   conflicts z existing kontakt's TRUE row → constraint 23505 IMMEDIATELY.
--   Transaction rollback. RPC returns 23505 to caller. DB unchanged.
--
-- FIX3 solution: 2-step sequential UPDATE inside one PL/pgSQL function.
--   Step 1: clear ALL primary tego kind (TRUE→FALSE removes z partial index)
--   Step 2: set new primary (partial index empty for that (client, kind),
--           no conflict possible)
--   Both within single PL/pgSQL transaction → atomic. Jeśli Step 1 OK +
--   Step 2 fails → rollback both. Race-safe для single-user (row locks).
--
-- ATOMIC guarantee: PL/pgSQL function = single transaction. Both UPDATEs
-- commit together or rollback together. Sequential statements within tej
-- samej transaction.
-- ============================================================

DROP FUNCTION IF EXISTS set_primary_contact_method(UUID);
DROP FUNCTION IF EXISTS set_primary_contact_method(UUID, UUID);

CREATE OR REPLACE FUNCTION set_primary_contact_method(
  p_method_id UUID,
  p_owner_id UUID
)
RETURNS TABLE(
  client_id UUID,
  kind TEXT,
  value TEXT,
  ok BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS still respected; ownership via p_owner_id explicit
AS $$
DECLARE
  v_client_id UUID;
  v_kind TEXT;
  v_value TEXT;
BEGIN
  -- Read method z ownership filter w jednym SELECT.
  SELECT ccm.client_id, ccm.kind, ccm.value
    INTO v_client_id, v_kind, v_value
  FROM client_contact_methods ccm
  WHERE ccm.id = p_method_id
    AND ccm.owner_id = p_owner_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      NULL::UUID, NULL::TEXT, NULL::TEXT, FALSE, 'not_found_or_unauthorized'::TEXT;
    RETURN;
  END IF;

  -- ── Step 1: clear ALL primary tego kind dla klienta ──
  -- Sets TRUE → FALSE. Partial UNIQUE INDEX `idx_ccm_one_primary` (WHERE
  -- is_primary=TRUE) loses row(s) → 0 rows w index dla (client_id, kind).
  -- No constraint violation possible (we are REMOVING from partial index).
  --
  -- T2.4.C1 FIX3.1 (28.05.2026) — alias `ccm` REQUIRED bo RETURNS TABLE OUT
  -- params (client_id, kind, value) collide з column names → Postgres 42702
  -- "ambiguous column reference". Wszystkie WHERE refs musimy qualify ccm.col.
  UPDATE client_contact_methods AS ccm
    SET is_primary = FALSE
    WHERE ccm.client_id = v_client_id
      AND ccm.kind = v_kind
      AND ccm.owner_id = p_owner_id
      AND ccm.is_primary = TRUE;

  -- ── Step 2: set new primary ──
  -- Partial index has 0 rows for that (client_id, kind) after Step 1.
  -- Setting target row FALSE → TRUE adds exactly 1 row to partial index.
  -- UNIQUE constraint satisfied (max 1 primary per (client, kind)).
  UPDATE client_contact_methods AS ccm
    SET is_primary = TRUE
    WHERE ccm.id = p_method_id
      AND ccm.owner_id = p_owner_id;

  RETURN QUERY SELECT v_client_id, v_kind, v_value, TRUE, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION set_primary_contact_method(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION set_primary_contact_method(UUID, UUID) IS
  'Sprint TYDZIEN2.T2.4.C1 FIX3 (28.05.2026). Atomic primary toggle dla client_contact_methods. 2-step sequential UPDATE wewnątrz PL/pgSQL transaction — atomic, race-safe, ALE NIE narusza partial UNIQUE INDEX idx_ccm_one_primary (Postgres checks per-row immediately, не at end of statement; partial unique nie может deferrable). p_owner_id explicit (caller server action authenticates via auth.getUser()).';

-- ============================================================
-- END 075 (T2.4.C1 FIX3)
-- ============================================================
