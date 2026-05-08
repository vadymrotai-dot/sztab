-- 060_cohorts_foundation.sql
-- Phase 2 Krok 1.A — cohort builder foundation для Vadym's curating Lista 50
-- (понеділкові обзвони Czudowа Marka, etc.).
--
-- Per memory tech-debt #20 (Vadym 04.05.2026 evening) — поточно немає UI
-- способу позначити "selected for outreach 12.05".
--
-- Tables:
--   cohorts: named groups (e.g. "Lista 50 — 12.05.2026 Czudowа obzwon")
--   cohort_members: subject_type ('prospect' | 'client') + subject_id (UUID)
--                   з status enum для outreach lifecycle tracking
--
-- subject_type+subject_id pattern (polymorphic FK) — bo prospects + clients
-- різні tables. Same prospect/client може бути у багатьох cohorts.
--
-- RLS: shared для authenticated (single-user system poki co — wszystko
-- widoczne, ale ready для multi-user upgrade пізніше).
--
-- UI у Krok 1.C (cohort selection checkboxes на /intelligence/prospects).
-- Bulk enrichment Krok 1.D, Export Krok 1.E.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('prospect', 'client')),
  subject_id UUID NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'called',
    'interested',
    'not_interested',
    'callback'
  )),
  notes TEXT,
  PRIMARY KEY (cohort_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS cohort_members_subject_idx
  ON cohort_members(subject_type, subject_id);

CREATE INDEX IF NOT EXISTS cohort_members_status_idx
  ON cohort_members(cohort_id, status);

-- RLS

ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cohorts_authenticated_all" ON cohorts
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cohort_members_authenticated_all" ON cohort_members
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cohorts IS
  'Named cohort groups (e.g. "Lista 50 — 12.05.2026 Czudowа obzwon"). Per Phase 2 Krok 1.A foundation. UI у Krok 1.C.';

COMMENT ON TABLE cohort_members IS
  'Per-cohort prospect/client membership з outreach status tracking. subject_type+subject_id polymorphic FK (бо prospects + clients різні tables). PK = (cohort_id, subject_type, subject_id) — same prospect/client може бути у багатьох cohorts.';

COMMENT ON COLUMN cohort_members.status IS
  'Outreach lifecycle: pending (default — not yet called), called, interested, not_interested, callback (rescheduled).';
