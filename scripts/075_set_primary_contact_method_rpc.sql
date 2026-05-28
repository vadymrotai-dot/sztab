-- ============================================================
-- 075_set_primary_contact_method_rpc.sql
-- Sprint TYDZIEN2.T2.4.C1 FIX (28.05.2026)
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
-- SECURITY INVOKER (default) — RLS policy auth.uid()=owner_id примусово
-- działa. Wszystko z poziomu authenticated user. Funkcja waliduje
-- ownership via auth.uid() w WHERE clause.
--
-- Returns: { client_id, kind, value, ok, error } — caller robi sync до
-- clients.{kind} (kind ∈ email/phone/website) po success.
-- ============================================================

CREATE OR REPLACE FUNCTION set_primary_contact_method(p_method_id UUID)
RETURNS TABLE(
  client_id UUID,
  kind TEXT,
  value TEXT,
  ok BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS respected via auth.uid() match w UPDATE WHERE
AS $$
DECLARE
  v_client_id UUID;
  v_kind TEXT;
  v_value TEXT;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID, NULL::TEXT, NULL::TEXT, FALSE, 'unauthenticated'::TEXT;
    RETURN;
  END IF;

  -- Read method z ownership check w jednym SELECT.
  SELECT ccm.client_id, ccm.kind, ccm.value
    INTO v_client_id, v_kind, v_value
  FROM client_contact_methods ccm
  WHERE ccm.id = p_method_id
    AND ccm.owner_id = v_caller;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      NULL::UUID, NULL::TEXT, NULL::TEXT, FALSE, 'not_found_or_unauthorized'::TEXT;
    RETURN;
  END IF;

  -- ATOMIC one-statement: всі rows tego (client_id, kind) для caller mają
  -- is_primary przeliczony przeciw p_method_id. Partial UNIQUE INDEX
  -- (idx_ccm_one_primary) checked po end of statement → race-safe.
  UPDATE client_contact_methods AS ccm
    SET is_primary = (ccm.id = p_method_id)
    WHERE ccm.client_id = v_client_id
      AND ccm.kind = v_kind
      AND ccm.owner_id = v_caller;

  RETURN QUERY SELECT v_client_id, v_kind, v_value, TRUE, NULL::TEXT;
END;
$$;

-- Allow authenticated users to call RPC. RLS policies on table still apply
-- з SECURITY INVOKER tryb.
GRANT EXECUTE ON FUNCTION set_primary_contact_method(UUID) TO authenticated;

COMMENT ON FUNCTION set_primary_contact_method(UUID) IS
  'Sprint TYDZIEN2.T2.4.C1 FIX (28.05.2026). Atomic primary toggle dla client_contact_methods. Jeden UPDATE statement → partial UNIQUE INDEX idx_ccm_one_primary checked at end → race-safe. SECURITY INVOKER → RLS auth.uid()=owner_id natywnie. Returns row (client_id, kind, value) dla post-hook clients sync.';

-- ============================================================
-- END 075
-- ============================================================
