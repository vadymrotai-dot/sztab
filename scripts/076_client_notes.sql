-- ============================================================
-- 076_client_notes.sql
-- Sprint TYDZIEN2.T2.5 (29.05.2026)
--
-- Multi-row client notes — sales/operations notatki przypisane do
-- konkretnego клиента. Każda notatka ma свій timestamp + body, editable
-- po fakcie (updated_at tracked + UI "(edytowano)" badge).
--
-- Replaces / cohabits z legacy clients.notes (TEXT single-field), который
-- był read-only display в profile + edit в /clients/[id]/edit form. T2.5
-- seedem przepisuje istniejące clients.notes → client_notes (1 row per
-- client where notes IS NOT NULL), zachowując clients.notes column на
-- razie dla back-compat (deprecate w T2.6+).
--
-- Mirror pattern z client_contact_methods (074) — RLS auth.uid()=owner_id,
-- FK CASCADE on client_id, FK CASCADE on owner_id (auth.users).
--
-- DIFFERENT z ccm: updated_at column EXISTS (notatka editable, "(edytowano)"
-- znak w UI bazuje na (updated_at - created_at > 1s)). ccm tego nie miał.
--
-- T2.5.A: migration + seed (THIS file)
-- T2.5.B: app/actions/client-notes.ts (add/update/delete)
-- T2.5.C: components/clients/client-notes-section.tsx + client-note-form.tsx
-- T2.5.D: AccordionSection "notatki" w /clients/[id] page
-- ============================================================

CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Plain text, NO Markdown rendering (whitespace-pre-wrap w UI).
  -- 1-5000 znaków — empty body nieprawidłowe, 5K limit dla sane UI render.
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- updated_at = created_at na INSERT, server action sets NOW() w UPDATE.
  -- UI "(edytowano)" badge gdy updated_at - created_at > 1 second.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup — wszystkie notatki dla klienta, najnowsze pierwsze.
CREATE INDEX IF NOT EXISTS idx_client_notes_client
  ON client_notes (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_notes_owner
  ON client_notes (owner_id);

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_owner_all ON client_notes
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

COMMENT ON TABLE client_notes IS
  'Multi-row sales/ops notatki per klient. Sprint TYDZIEN2.T2.5. Replaces legacy clients.notes (single TEXT field). updated_at exists (notatka editable, edytowano badge in UI).';
COMMENT ON COLUMN client_notes.body IS
  'Plain text 1-5000 znaków. UI whitespace-pre-wrap (NO Markdown).';
COMMENT ON COLUMN client_notes.updated_at IS
  'Server action UPDATE sets NOW(). UI badge "(edytowano)" gdy updated_at - created_at > 1s.';

-- ─── SEED: migrate clients.notes → client_notes ─────────────────────
-- 1 row per client where notes IS NOT NULL AND length > 0.
-- created_at + updated_at = clients.created_at (no edit trace, original).
-- ON CONFLICT не potrzebny — brak unique constraint na (client_id, body).
-- Re-run idempotent? NIE — повторне execution stworzyłoby duplikaty.
-- Migration designed for single application via apply-migration.ts.
INSERT INTO client_notes (client_id, owner_id, body, created_at, updated_at)
SELECT
  c.id,
  c.owner_id,
  c.notes,
  c.created_at,
  c.created_at
FROM clients c
WHERE c.notes IS NOT NULL
  AND length(trim(c.notes)) > 0
  -- Guard against re-application: skip clients which already have a note
  -- z тим самим body (chosen over plain WHERE NOT EXISTS на client_id —
  -- pozwala dodawać nowe notatki potem bez блокування seed re-run).
  AND NOT EXISTS (
    SELECT 1 FROM client_notes cn
    WHERE cn.client_id = c.id
      AND cn.body = c.notes
  );

-- ============================================================
-- END 076
-- ============================================================
