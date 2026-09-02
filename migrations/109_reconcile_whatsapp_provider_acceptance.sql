BEGIN;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS payload_sha256 VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_whatsapp_messages_payload_sha256'
       AND conrelid = 'whatsapp_messages'::regclass
  ) THEN
    ALTER TABLE whatsapp_messages
      ADD CONSTRAINT ck_whatsapp_messages_payload_sha256
        CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unreconciled
  ON whatsapp_messages(created_at)
  WHERE status = 'sending';

COMMIT;
