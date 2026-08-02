DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'property_visit_result') THEN
    CREATE TYPE property_visit_result AS ENUM (
      'pending',
      'interested',
      'not_interested',
      'offer'
    );
  END IF;
END $$;

ALTER TABLE property_visits
  ADD COLUMN IF NOT EXISTS result property_visit_result NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS result_reason TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_property_visits_result
  ON property_visits(property_id, result);
