-- 042_persons_uniq_constraint.sql
-- Sprint S2A Phase 1C — replace partial UNIQUE INDEX з regular UNIQUE
-- CONSTRAINT for ON CONFLICT compatibility у Sprint S1 person upserts.
--
-- Original (migration 039) used partial INDEX:
--   CREATE UNIQUE INDEX idx_persons_rejestrio_id_uniq ON persons(rejestrio_person_id)
--     WHERE rejestrio_person_id IS NOT NULL;
-- Postgres doesn't allow ON CONFLICT na partial unique index (planner
-- can't infer constraint). Replace з regular constraint — multiple NULLs
-- still allowed by default (NULL DISTINCT semantics).
-- Idempotent.

DROP INDEX IF EXISTS idx_persons_rejestrio_id_uniq;
ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_rejestrio_uniq;
ALTER TABLE persons ADD CONSTRAINT persons_rejestrio_uniq UNIQUE (rejestrio_person_id);
