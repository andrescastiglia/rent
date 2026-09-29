BEGIN;
ALTER TABLE portal_listings ADD COLUMN IF NOT EXISTS provider_status varchar(40);
CREATE TABLE IF NOT EXISTS portal_publication_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  listing_id uuid NOT NULL REFERENCES portal_listings(id),
  operation text NOT NULL CHECK (operation IN ('publish','update','pause','remove','refresh')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatching','retry','completed','failed','needs_review')),
  attempts integer NOT NULL DEFAULT 0,
  claim_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_publication_active
  ON portal_publication_outbox(company_id, listing_id)
  WHERE status IN ('queued','dispatching','retry','needs_review');
CREATE INDEX IF NOT EXISTS idx_portal_publication_due
  ON portal_publication_outbox(next_attempt_at)
  WHERE status IN ('queued','dispatching','retry');
COMMIT;
