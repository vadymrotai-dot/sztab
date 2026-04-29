-- 035_unify_entity_type.sql
-- Sprint P FIX 1 — unify routing dispatch.
--
-- Problem: dispatcher znajdował CEIDG record і kierował user na
-- /prospects/[id] route która nie existeje (Sprint O usunął ją з sidebar
-- але też nie zostawił page.tsx у app/(dashboard)/prospects).
-- Wszystkie user-visible entities żyją tylko w clients table; CEIDG
-- prospects pozostają як read-only cache dla searchu.
--
-- Action:
--   1. ALTER clients ADD COLUMN entity_type ('client'|'prospect')
--   2. Dispatcher tworzy clients row z entity_type='prospect' gdy znaleziono
--      tylko w CEIDG cache (kopiuje base fields), pozwala redirect na unified
--      /clients/[id].
--
-- Idempotent.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'client'
    CHECK (entity_type IN ('client', 'prospect'));

-- Useful index for tab filtering на /clients
CREATE INDEX IF NOT EXISTS idx_clients_entity_type
  ON clients(entity_type);

-- Optional convenience: VIEW that joins matches з top-score per client.
-- Already covered by frontend logic — skipping для idempotency.
