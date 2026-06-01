-- ============================================================
-- 081_marketing_consent.sql
-- Poprawki 1B (T-ORDER.5-UI) — zgoda marketingowa klienta.
--
-- Dobrowolna zgoda na marketing elektroniczny (e-mail), zbierana w formie
-- zamówienia (krok 3, osobna galochka pod klauzulą informacyjną RODO).
-- Zapis na poziomie clients (per klient, nie per zamówienie) — raz udzielona
-- obowiązuje do wycofania. Submit zapisuje tylko gdy zaznaczona i klient
-- jeszcze nie ma zgody (nie nadpisujemy daty istniejącej).
--
-- TYLKO baza: ADD COLUMN IF NOT EXISTS (idempotent). ZERO zmian danych.
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS marketing_consent_text TEXT;

COMMENT ON COLUMN clients.marketing_consent IS
  'Zgoda na marketing elektroniczny (e-mail). TRUE = udzielona. Zbierana w formie zamówienia (dobrowolna galochka).';
COMMENT ON COLUMN clients.marketing_consent_at IS
  'Data udzielenia zgody marketingowej (NIE nadpisywana przy ponownym submit).';
COMMENT ON COLUMN clients.marketing_consent_text IS
  'Treść klauzuli zgody zaakceptowanej przez klienta (snapshot tekstu w momencie udzielenia).';

-- ============================================================
-- END 081
-- ============================================================
