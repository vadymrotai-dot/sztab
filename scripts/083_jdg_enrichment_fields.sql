-- ============================================================
-- 083_jdg_enrichment_fields.sql
-- Fix JDG enrichment (forensyka 11.06.2026)
--
-- Dla JDG GUS report BIR11OsFizycznaDaneOgolne NIE zwraca adresu, ale ma
-- fiz_podstawowaFormaPrawna_Nazwa ("OSOBA FIZYCZNA PROWADZĄCA DZIAŁALNOŚĆ").
-- UI "Forma prawna" czytał tylko krs_legal_form (NULL dla JDG) → puste.
--
-- Dodajemy gus_legal_form: forma prawna z GUS (fiz_* lub praw_* fallback),
-- używana w UI gdy krs_legal_form NULL. Adres JDG dociągany osobno z CEIDG
-- /firma (kod, nie migracja).
--
-- Idempotentna (IF NOT EXISTS).
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gus_legal_form TEXT;

COMMENT ON COLUMN clients.gus_legal_form IS
  'Forma prawna z GUS (fiz_podstawowaFormaPrawna_Nazwa / praw_* fallback). Dla JDG GUS daje formę, a krs_legal_form jest NULL. UI: krs_legal_form ?? gus_legal_form ?? ''JDG''.';

-- ============================================================
-- END 083
-- ============================================================
