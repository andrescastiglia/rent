BEGIN;
ALTER TABLE portal_publication_outbox DROP CONSTRAINT IF EXISTS portal_publication_outbox_status_check;
ALTER TABLE portal_publication_outbox ADD CONSTRAINT portal_publication_outbox_status_check
  CHECK (status IN ('queued','dispatching','retry','completed','failed','needs_review','resolved'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_mercadolibre_external_item
  ON portal_listings(external_id) WHERE portal = 'mercadolibre' AND external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS portal_publication_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  listing_id uuid NOT NULL REFERENCES portal_listings(id),
  job_id uuid NOT NULL UNIQUE REFERENCES portal_publication_outbox(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('link','retry','confirm_not_created','accept_remote')),
  reason text NOT NULL,
  external_id text,
  provider_snapshot jsonb,
  followup_job_id uuid REFERENCES portal_publication_outbox(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_resolution_history
  ON portal_publication_resolutions(company_id,listing_id,created_at DESC);
COMMIT;
