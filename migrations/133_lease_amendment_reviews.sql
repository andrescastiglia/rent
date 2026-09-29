BEGIN;
CREATE TABLE IF NOT EXISTS lease_amendment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  amendment_id uuid NOT NULL REFERENCES lease_amendments(id) ON DELETE CASCADE,
  action varchar(20) NOT NULL CHECK(action IN ('cancel','schedule')),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
  performed_by uuid NOT NULL REFERENCES users(id),
  performed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS lease_amendment_reviews_history_idx ON lease_amendment_reviews(company_id,amendment_id,performed_at,id);
CREATE OR REPLACE FUNCTION protect_amendment_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Amendment review history cannot be overwritten';
END;
$$;
DROP TRIGGER IF EXISTS lease_amendment_reviews_no_update ON lease_amendment_reviews;
CREATE TRIGGER lease_amendment_reviews_no_update BEFORE UPDATE ON lease_amendment_reviews
FOR EACH ROW EXECUTE FUNCTION protect_amendment_review();
COMMIT;
