ALTER TYPE communication_event
  ADD VALUE IF NOT EXISTS 'whatsapp_ad_hoc';

BEGIN;

ALTER TABLE communication_deliveries
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(200);

CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_delivery_idempotency
  ON communication_deliveries (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
