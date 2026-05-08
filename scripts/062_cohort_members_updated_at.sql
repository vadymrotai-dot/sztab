-- 062_cohort_members_updated_at.sql
-- Phase 2 Krok 1.D1 (08.05.2026 evening) — додаємо updated_at + trigger
-- для cohort_members audit trail (status mutations + notes edits).
--
-- Schema reality vs. Krok 1.D1 spec discrepancies (per STEP 0 audit):
--   1. `notes` column WЖE existуjе у migration 060 — Q1=A1 use existing
--      (NIE додаємо `note` без 's', NIE rename — server actions використовують
--      'notes' плурал)
--   2. composite PK (cohort_id, subject_type, subject_id) preserved (Q2=B2)
--      — server actions accept tuple keys, NIE single id UUID
--   3. RLS policy "FOR ALL TO authenticated" з migration 060 already covers
--      UPDATE — Q3=C1 skip UPDATE policy block у tej migracji
--
-- Idempotent. Safe re-run.

-- ─── 1. updated_at column ──────────────────────────────────────────

ALTER TABLE cohort_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── 2. trigger function — auto-bump updated_at ──────────────────

CREATE OR REPLACE FUNCTION cohort_members_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 3. trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_cohort_members_updated_at ON cohort_members;

CREATE TRIGGER trg_cohort_members_updated_at
  BEFORE UPDATE ON cohort_members
  FOR EACH ROW
  EXECUTE FUNCTION cohort_members_set_updated_at();

-- ─── 4. RLS UPDATE policy ──────────────────────────────────────────
-- Skip UPDATE policy block — cohort_members has FOR ALL auth policy
-- from migration 060 (covers SELECT/INSERT/UPDATE/DELETE). Adding
-- a duplicate would no-op via duplicate_object catch але це rendundand.

-- ─── Comment ───────────────────────────────────────────────────────

COMMENT ON COLUMN cohort_members.updated_at IS
  'Auto-updated by trg_cohort_members_updated_at trigger ON UPDATE. Per Phase 2 Krok 1.D1 (08.05.2026) — audit trail для status mutations + notes edits. Initial value = added_at default (created moment).';

COMMENT ON COLUMN cohort_members.notes IS
  'Free-form 1-line note (≤200 chars enforced у server action). Per Phase 2 Krok 1.D1 — Vadym call notes "callback piąt 14:00" pattern. NIE multi-line; UI uses single Input з save-on-blur.';
