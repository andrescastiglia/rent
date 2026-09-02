BEGIN;

CREATE TABLE IF NOT EXISTS payment_gateway_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  provider varchar(50) NOT NULL,
  event_key char(64) NOT NULL,
  notification_id varchar(255) NOT NULL,
  data_id varchar(255) NOT NULL,
  request_id varchar(255),
  payload_sha256 char(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  lease_expires_at timestamptz,
  processed_at timestamptz,
  last_error varchar(120),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_gateway_webhook_event UNIQUE (provider, event_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_webhook_status
  ON payment_gateway_webhook_events (status, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_webhook_company
  ON payment_gateway_webhook_events (company_id, received_at DESC);

COMMIT;
