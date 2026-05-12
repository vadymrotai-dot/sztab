-- scripts/066_unify_cohorts.sql
-- Sprint S-CLEAN ETAP 2 STEP 1 (13.05.2026)
--
-- Migrate legacy `pikniko_handoff_cohorts` (Sprint N Phase C2, 29.04.2026)
-- → unified `cohorts` + `cohort_members` (Phase 2 Krok 1.C1, 08.05.2026).
--
-- Source state (verified via diag-pikniko-state.mjs):
--   - 1 row: "Pierwsza partia HoReCa kiszonki/buraki"
--   - id: 6599fbe8-b77c-47d8-bc45-3b03d5165045
--   - 29 entities у entity_ids JSONB (11 clients + 18 prospects per metadata)
--   - entity_ids shape: [{id: uuid, rank: int, type: 'prospect'|'client'}, ...]
--   - No inbound FKs, no separate members table → safe DROP after migration.
--
-- Schema mapping:
--   pikniko_handoff_cohorts.id          → cohorts.id (preserve UUID)
--   pikniko_handoff_cohorts.cohort_name → cohorts.name
--   (injected)                          → cohorts.description = 'Migrated from pikniko_handoff_cohorts (29.04.2026)'
--   pikniko_handoff_cohorts.created_at  → cohorts.created_at (preserve)
--   (NULL)                              → cohorts.created_by_user_id
--
--   entity_ids[i] (jsonb)               → cohort_members row
--     id (uuid)                         → subject_id
--     type ('prospect'|'client')         → subject_type
--   (parent created_at)                 → added_at + updated_at
--   (default 'pending')                 → status
--   (NULL)                              → notes
--
-- Dropped fields: metadata jsonb (legacy Sprint N enrichment summary),
--                 total_entities (derivable), updated_at (no target column),
--                 entity_ids[i].rank (cohort_members має no rank column).
--
-- Atomic: BEGIN/COMMIT. Якщо INSERT fail → ROLLBACK + entire migration
-- aborted, pikniko_handoff_cohorts left untouched.

BEGIN;

-- ─── Step 1.1: Insert into unified `cohorts` (preserve UUID) ─────────

INSERT INTO public.cohorts (id, name, description, created_at, created_by_user_id)
SELECT
  id,
  cohort_name,
  'Migrated from pikniko_handoff_cohorts (29.04.2026, Sprint N legacy). '
    || 'Cohort z 29 entities (11 clients + 18 prospects) для outreach po '
    || 'kiszonkach/burakach. Enrichment cost $1.39 у Sprint N.',
  created_at,
  NULL
FROM public.pikniko_handoff_cohorts;

-- ─── Step 1.2: Decompose entity_ids JSONB → cohort_members rows ─────

INSERT INTO public.cohort_members (
  cohort_id,
  subject_type,
  subject_id,
  added_at,
  status,
  notes,
  updated_at
)
SELECT
  phc.id        AS cohort_id,
  e->>'type'    AS subject_type,
  (e->>'id')::uuid AS subject_id,
  phc.created_at AS added_at,
  'pending'     AS status,
  NULL          AS notes,
  phc.created_at AS updated_at
FROM public.pikniko_handoff_cohorts phc,
     jsonb_array_elements(phc.entity_ids) e;

-- ─── Step 1.3: Sanity check — abort якщо очікувані 29 ≠ actual ──────

DO $$
DECLARE
  inserted_count integer;
  expected_count integer;
BEGIN
  SELECT COUNT(*) INTO inserted_count
  FROM public.cohort_members
  WHERE cohort_id IN (SELECT id FROM public.pikniko_handoff_cohorts);

  SELECT COALESCE(SUM(jsonb_array_length(entity_ids)), 0) INTO expected_count
  FROM public.pikniko_handoff_cohorts;

  IF inserted_count != expected_count THEN
    RAISE EXCEPTION
      'Migration 066 sanity check fail: inserted_count=% expected_count=%',
      inserted_count, expected_count;
  END IF;

  RAISE NOTICE 'Migration 066 OK: % cohort_members inserted from pikniko_handoff_cohorts',
    inserted_count;
END $$;

-- ─── Step 1.4: Drop legacy table (no inbound FKs verified) ──────────

DROP TABLE public.pikniko_handoff_cohorts;

COMMIT;
