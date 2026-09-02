BEGIN;

ALTER TYPE communication_delivery_status
  ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE communication_deliveries
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

DROP INDEX IF EXISTS idx_communication_deliveries_retry;
CREATE INDEX IF NOT EXISTS idx_communication_deliveries_due
  ON communication_deliveries (status, next_attempt_at, lease_expires_at);

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_idempotency
  ON whatsapp_messages (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
