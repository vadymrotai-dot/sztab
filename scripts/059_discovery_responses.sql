-- 059_discovery_responses.sql
-- Discovery portal для Pikniko × Maxim — public form з token-based access.
-- Створюється під Sprint Pikniko Discovery 06.05.2026.
-- Idempotent.

CREATE TABLE IF NOT EXISTS discovery_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL,
  question_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  answer JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: один answer per (token, question_id) — дозволяє upsert
CREATE UNIQUE INDEX IF NOT EXISTS discovery_responses_token_question_uniq
  ON discovery_responses(token, question_id);

CREATE INDEX IF NOT EXISTS discovery_responses_token_idx
  ON discovery_responses(token);

-- RLS: anon може upsert тільки by valid token (мін 20 символів)
ALTER TABLE discovery_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_anon_insert ON discovery_responses;
CREATE POLICY discovery_anon_insert ON discovery_responses
  FOR INSERT TO anon
  WITH CHECK (length(token) >= 20);

DROP POLICY IF EXISTS discovery_anon_update ON discovery_responses;
CREATE POLICY discovery_anon_update ON discovery_responses
  FOR UPDATE TO anon
  USING (length(token) >= 20)
  WITH CHECK (length(token) >= 20);

DROP POLICY IF EXISTS discovery_anon_select ON discovery_responses;
CREATE POLICY discovery_anon_select ON discovery_responses
  FOR SELECT TO anon
  USING (length(token) >= 20);

DROP POLICY IF EXISTS discovery_authenticated_all ON discovery_responses;
CREATE POLICY discovery_authenticated_all ON discovery_responses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_discovery_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS discovery_responses_updated_at_trigger ON discovery_responses;
CREATE TRIGGER discovery_responses_updated_at_trigger
  BEFORE UPDATE ON discovery_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_discovery_responses_updated_at();

COMMENT ON TABLE discovery_responses IS
  'Discovery portal responses — public form з token-based access. Token у URL = "магічний ключ", RLS дозволяє anon upsert тільки якщо token валідної довжини. Адмін доступ через service role або authenticated user.';
