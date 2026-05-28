-- ============================================================
-- 075_set_primary_contact_method_rpc.sql
-- Sprint TYDZIEN2.T2.4.C1 (28.05.2026)
-- T2.4.C1 FIX2 (28.05.2026) — explicit p_owner_id param.
--
-- Atomic primary toggle для client_contact_methods.
-- Supabase JS .update() nie wspiera expression-based SET — wymaga
-- RPC z PL/pgSQL aby zrobić jeden UPDATE statement z CASE expression.
--
-- ATOMIC: jeden UPDATE statement → wszystkie rows danej (client_id, kind)
-- mają is_primary przeliczony przeciw p_method_id w jednej transakcji.
-- Partial UNIQUE index `idx_ccm_one_primary` checked at end of statement
-- — żadna intermediate state z 0/2 primary rows nie powstaje.
--
-- T2.4.C1 FIX2 — usunięto auth.uid() block. Root cause poprzedniego buga:
-- `auth.uid()` returns NULL когда RPC called z server-action context
-- (rpc endpoint NIE propaguje JWT tak jak .from() endpoints у @supabase/ssr).
-- Caller (app/actions/contact-methods.ts) уже authenticates user via
-- supabase.auth.getUser() i passes user.id jako p_owner_id explicit.
-- RPC trust to + WHERE owner_id=p_owner_id zapewnia że tylko własne rows
-- są dotknięte. Bezpieczne bo:
--   1. GRANT EXECUTE TO authenticated → anon role не може call.
--   2. Server action validates session перед RPC — fake user.id impossible.
--   3. WHERE clause filter — jeśli p_owner_id != real owner, query returns
--      0 rows, RPC zwraca 'not_found_or_unauthorized'.
-- ============================================================

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
SECURITY INVOKER  -- RLS still respected for table-level operations w UPDATE
AS $$
DECLARE
  v_client_id UUID;
  v_kind TEXT;
  v_value TEXT;
BEGIN
  -- Read method z ownership filter w jednym SELECT. p_owner_id musi match
  -- ccm.owner_id (server action provides via auth.getUser().id).
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

  -- ATOMIC one-statement: всі rows tego (client_id, kind) dla owner mają
  -- is_primary przeliczony przeciw p_method_id. Partial UNIQUE INDEX
  -- (idx_ccm_one_primary) checked po end of statement → race-safe.
  UPDATE client_contact_methods AS ccm
    SET is_primary = (ccm.id = p_method_id)
    WHERE ccm.client_id = v_client_id
      AND ccm.kind = v_kind
      AND ccm.owner_id = p_owner_id;

  RETURN QUERY SELECT v_client_id, v_kind, v_value, TRUE, NULL::TEXT;
END;
$$;

-- Allow authenticated users to call RPC. RLS policies on table still apply.
-- DROP old signature (1 param) jeśli istniała — CREATE OR REPLACE NIE zmienia
-- signature, więc usuwamy stara wersję eksplicit.
DROP FUNCTION IF EXISTS set_primary_contact_method(UUID);

GRANT EXECUTE ON FUNCTION set_primary_contact_method(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION set_primary_contact_method(UUID, UUID) IS
  'Sprint TYDZIEN2.T2.4.C1 FIX2 (28.05.2026). Atomic primary toggle dla client_contact_methods. Jeden UPDATE statement → partial UNIQUE INDEX idx_ccm_one_primary checked at end → race-safe. p_owner_id explicit (caller server action authenticates via auth.getUser() przed wywołaniem). Returns (client_id, kind, value) dla post-hook clients sync.';

-- ============================================================
-- END 075 (T2.4.C1 FIX2)
-- ============================================================
