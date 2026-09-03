BEGIN;

CREATE TABLE IF NOT EXISTS signature_webhook_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(50) NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  external_envelope_id VARCHAR(255) NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  payload_sha256 VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ,
  last_error VARCHAR(120),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_signature_webhook_event UNIQUE (provider, event_key),
  CONSTRAINT ck_signature_webhook_status
    CHECK (status IN ('queued', 'processing', 'processed', 'failed', 'dead_letter')),
  CONSTRAINT ck_signature_webhook_attempts CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_signature_webhook_due
  ON signature_webhook_inbox(status, lease_expires_at, received_at);

CREATE INDEX IF NOT EXISTS idx_signature_webhook_company
  ON signature_webhook_inbox(company_id, received_at DESC);

COMMIT;
