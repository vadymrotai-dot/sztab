-- 039_persons_rejestrio_id.sql
-- Sprint S1 Phase 1 — extend persons з rejestrio_person_id для cross-org
-- person network. Sprint M FIX 8 saved placeholder names ('(KRS anon)');
-- Biznes plan теper returns real imie/nazwisko, parser overwrites.
--
-- Note: persons (imie, nazwisko) columns already exist (Sprint K phase 1).
-- This migration adds rejestrio link + source tracking.

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS rejestrio_person_id BIGINT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'krs_anon';

CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_rejestrio_id_uniq
  ON persons(rejestrio_person_id)
  WHERE rejestrio_person_id IS NOT NULL;
