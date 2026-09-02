BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key char(64) NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'processed', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  processed_at timestamptz,
  last_error varchar(120),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_inbox_due
  ON whatsapp_webhook_inbox (status, available_at, lease_expires_at);

COMMIT;
