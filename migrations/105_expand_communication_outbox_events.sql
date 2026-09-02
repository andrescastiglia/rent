BEGIN;

ALTER TYPE communication_recipient_role
  ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE communication_recipient_role
  ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE communication_recipient_role
  ADD VALUE IF NOT EXISTS 'buyer';

ALTER TYPE communication_event
  ADD VALUE IF NOT EXISTS 'whatsapp_manual_reply';
ALTER TYPE communication_event
  ADD VALUE IF NOT EXISTS 'whatsapp_assistant_response';
ALTER TYPE communication_event
  ADD VALUE IF NOT EXISTS 'credit_note_issued';

ALTER TABLE communication_deliveries
  ADD COLUMN IF NOT EXISTS source_communication_id uuid
    REFERENCES person_communications(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_delivery_source
  ON communication_deliveries (source_communication_id)
  WHERE source_communication_id IS NOT NULL;

COMMIT;
