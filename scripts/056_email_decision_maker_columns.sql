-- Migration 056: extract email + decision_maker_name з KRS listing
-- Per Phase 2.8 Variant B (Vadym 2026-05-04).
--
-- Background: rejestr.io /org listing response містить:
--   - kontakt.emaile (array of emails від KRS — Biznes plan included)
--   - glowna_osoba.imiona_i_nazwisko (prezes zarządu / chairman)
--
-- Per memory rule "konwersja > масштаб": emails ARE conversion path.
-- Plain columns enable:
--   - Filter "Tylko z kontaktem" на /clients page
--   - Direct CSV export для Pikniko handoff
--   - Fast index lookup
--
-- Note: email column WAS already created у migration 014 (lines 64-66
-- "Contact — CEIDG nie zwraca w v3 probe; future enrichment"). ADD COLUMN
-- IF NOT EXISTS = no-op для existing column — defensive idempotency +
-- clear documentation що Phase 2.8 fills цей column з KRS source.
--
-- Idempotent.

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS decision_maker_name TEXT;

-- Partial index дозволяє швидкий "має email" filter without scanning
-- millions of NULLs.
CREATE INDEX IF NOT EXISTS ceidg_prospects_email_idx
  ON ceidg_prospects(email)
  WHERE email IS NOT NULL;

COMMENT ON COLUMN ceidg_prospects.email IS
  'Primary email від listing response. KRS source: kontakt.emaile[0] (per migration 056 Phase 2.8). CEIDG source: TBD (CEIDG public API не повертає email; future enrichment Phase X).';

COMMENT ON COLUMN ceidg_prospects.decision_maker_name IS
  'Decision-maker full name (prezes/chairman/owner). KRS source: glowna_osoba.imiona_i_nazwisko (per migration 056 Phase 2.8). CEIDG source: TBD (future enrichment з owner_name field).';
