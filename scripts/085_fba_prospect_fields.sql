-- 085_fba_prospect_fields.sql
-- FBA workspace: додає поля для лідогенерації через CEIDG → Apollo → Outreach.
-- Розширює таблицю ceidg_prospects (створена в 014).
-- Idempotent — всі ADD COLUMN IF NOT EXISTS.

-- Блок 2: PKD і джерело
ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS source_pkd TEXT;
COMMENT ON COLUMN ceidg_prospects.source_pkd IS
  'PKD-запит який знайшов підприємця першим (напр. 6201Z). НЕ перезаписується при повторному upsert.';

-- Блок 3: ZUS-сегмент
ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS zus_segment TEXT;
COMMENT ON COLUMN ceidg_prospects.zus_segment IS
  'ZUS навантаження: PELNY (відкриті до 2023-01-01) / MALY (2023-2024) / ULGA (2025+). Обчислюється при синку.';

-- Блок 4: Громадянство і FBA-сегмент
ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS obywatelstwo TEXT;
COMMENT ON COLUMN ceidg_prospects.obywatelstwo IS
  'Громадянство власника з CEIDG raw_data (напр. PL, UA, IN, BY). Для визначення pitch і мови листа.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS fba_segment TEXT;
COMMENT ON COLUMN ceidg_prospects.fba_segment IS
  'Який продукт FBA пропонувати: TALENT / FOUNDER / LEGAL / EMPLOYER.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS fba_pitch TEXT;
COMMENT ON COLUMN ceidg_prospects.fba_pitch IS
  'Головний меседж у листі: ZUS_SAVINGS / LEGALIZATION / BLUE_CARD / TAX_OPT.';

-- Блок 6: Контакти Apollo
ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
COMMENT ON COLUMN ceidg_prospects.linkedin_url IS
  'LinkedIn профіль — заповнюється Apollo після збагачення.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS apollo_enriched_at TIMESTAMPTZ;
COMMENT ON COLUMN ceidg_prospects.apollo_enriched_at IS
  'Коли збагатили через Apollo. NULL = ще не збагачено.';

-- Блок 7: Статус outreach і результат
ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS outreach_status TEXT DEFAULT 'NEW';
COMMENT ON COLUMN ceidg_prospects.outreach_status IS
  'Статус у воронці: NEW / SENT / REPLIED / CONVERTED / REJECTED. Default NEW.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS outreach_channel TEXT;
COMMENT ON COLUMN ceidg_prospects.outreach_channel IS
  'Канал першого контакту: EMAIL / LINKEDIN / PHONE.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;
COMMENT ON COLUMN ceidg_prospects.first_contact_at IS
  'Дата першого контакту з підприємцем.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
COMMENT ON COLUMN ceidg_prospects.last_contact_at IS
  'Дата останнього контакту — оновлюється при кожному followup.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS sent_to_fba_at TIMESTAMPTZ;
COMMENT ON COLUMN ceidg_prospects.sent_to_fba_at IS
  'Коли контакт переданий до FBA менеджера.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS fba_result TEXT;
COMMENT ON COLUMN ceidg_prospects.fba_result IS
  'Результат від FBA: SIGNED / REJECTED / PENDING. NULL = ще не передано.';

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN ceidg_prospects.commission_paid IS
  'Чи отримана комісія 350 zł за цього клієнта від FBA.';

-- Індекси для фільтрації в FBA Desktop
CREATE INDEX IF NOT EXISTS ceidg_prospects_source_pkd_idx
  ON ceidg_prospects(source_pkd);

CREATE INDEX IF NOT EXISTS ceidg_prospects_zus_segment_idx
  ON ceidg_prospects(zus_segment);

CREATE INDEX IF NOT EXISTS ceidg_prospects_obywatelstwo_idx
  ON ceidg_prospects(obywatelstwo);

CREATE INDEX IF NOT EXISTS ceidg_prospects_fba_segment_idx
  ON ceidg_prospects(fba_segment);

CREATE INDEX IF NOT EXISTS ceidg_prospects_outreach_status_idx
  ON ceidg_prospects(outreach_status);

CREATE INDEX IF NOT EXISTS ceidg_prospects_commission_paid_idx
  ON ceidg_prospects(commission_paid);
