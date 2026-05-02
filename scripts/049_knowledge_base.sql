-- Sprint S-INTEL.1.1 — knowledge_base table.
-- Curated articles/reports for AI retrieval context (Protocol 15 hybrid matching).
-- Seed defer до S-INTEL.1.3 — 10 foundation topics через AI deep research.
--
-- Decisions locked Vadym 02.05.2026:
--  - food-first з ready-for-extension (category column + DEFAULT 'food')
--  - pl primary, uk secondary, en tertiary (language CHECK)
--  - owner-scoped RLS (single-user Sztab; future shared mode → policy update)
--  - NO embedding column (pgvector not enabled; defer до S-INTEL.2 / 1.3
--    коли вирішимо provider — OpenAI ada-002 vs Anthropic vs voyage)
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  content_md TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  category TEXT NOT NULL DEFAULT 'food',
  language TEXT NOT NULL DEFAULT 'pl' CHECK (language IN ('pl', 'uk', 'en')),
  created_by TEXT NOT NULL CHECK (
    created_by IN ('ai_research', 'vadym_manual', 'imported')
  ),
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_base_topic_idx ON knowledge_base(topic);
CREATE INDEX IF NOT EXISTS knowledge_base_tags_gin ON knowledge_base USING gin(tags);
CREATE INDEX IF NOT EXISTS knowledge_base_category_idx ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS knowledge_base_language_idx ON knowledge_base(language);
CREATE INDEX IF NOT EXISTS knowledge_base_created_by_idx ON knowledge_base(created_by);
CREATE INDEX IF NOT EXISTS knowledge_base_sources_gin ON knowledge_base USING gin(sources);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "knowledge_base_owner_all" ON knowledge_base
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION knowledge_base_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION knowledge_base_set_updated_at();

COMMENT ON TABLE knowledge_base IS
  'Curated articles/reports for AI retrieval context (Protocol 15 hybrid matching). Seed via S-INTEL.1.3 — 10 foundation topics через AI deep research. category column ready-for-extension (food initial; non-food plugins post-MVP per Decision Framework 02.05.2026).';

COMMENT ON COLUMN knowledge_base.topic IS
  'One of 10 foundation topics (defined у sztab-product-intelligence-spec.md). Free-form not enum — теми еволюціонують.';

COMMENT ON COLUMN knowledge_base.sources IS
  'JSONB array: [{url, title, accessed_at, credibility_score (0-1)}].';

COMMENT ON COLUMN knowledge_base.created_by IS
  'ai_research = згенеровано Claude deep research; vadym_manual = Vadym написав вручну; imported = uploaded PDF/Excel/web fetch.';

COMMENT ON COLUMN knowledge_base.model_version IS
  'Якщо created_by=ai_research — який Claude model + дата (claude-haiku-4-5-20251001@2026-05-XX). Для regenerate tracking.';

COMMENT ON COLUMN knowledge_base.category IS
  'Decision Framework 02.05.2026: food-first з ready-for-extension. category=food для Phase 1. Майбутні plugins (kosmetyka, odzież, elektronika) — окремі values.';

COMMENT ON COLUMN knowledge_base.language IS
  'pl primary (наш market), uk secondary (Vadym native + UA sources), en tertiary (EU/global benchmarks).';
