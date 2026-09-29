BEGIN;
CREATE TABLE IF NOT EXISTS document_bfa_stamps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'submitted', 'stamped', 'failed', 'needs_review')),
  proof jsonb,
  attempts integer NOT NULL DEFAULT 0,
  claim_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  verified_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, document_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_document_bfa_stamps_due
  ON document_bfa_stamps(next_attempt_at) WHERE status IN ('queued', 'submitted');
COMMIT;
