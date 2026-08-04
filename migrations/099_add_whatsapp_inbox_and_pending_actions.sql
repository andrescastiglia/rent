BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled_at timestamptz;

CREATE TABLE IF NOT EXISTS person_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  person_type varchar(20) NOT NULL,
  person_id uuid,
  direction varchar(16) NOT NULL,
  channel varchar(16) NOT NULL DEFAULT 'whatsapp',
  message_type varchar(20) NOT NULL DEFAULT 'text',
  body text NOT NULL,
  whatsapp_message_id varchar(255),
  in_reply_to_id uuid REFERENCES person_communications(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'new',
  read_at timestamptz,
  read_by uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_person_communications_person_type
    CHECK (person_type IN ('staff', 'admin', 'buyer', 'owner', 'tenant', 'interested')),
  CONSTRAINT chk_person_communications_direction
    CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT chk_person_communications_channel CHECK (channel = 'whatsapp'),
  CONSTRAINT chk_person_communications_status
    CHECK (status IN ('new', 'read', 'replied', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_communications_wamid
  ON person_communications (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_person_communications_inbox
  ON person_communications (company_id, status, created_at DESC)
  WHERE direction = 'inbound';
CREATE INDEX IF NOT EXISTS idx_person_communications_person
  ON person_communications (company_id, person_type, person_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  source_communication_id uuid REFERENCES person_communications(id) ON DELETE SET NULL,
  source_confirmation_id uuid REFERENCES ai_tool_mutation_confirmations(id) ON DELETE SET NULL,
  tool_name varchar(160) NOT NULL,
  action_type varchar(20) NOT NULL,
  entity_type varchar(80) NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  result jsonb,
  error_message text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pending_actions_action_type
    CHECK (action_type IN ('create', 'update', 'delete', 'other')),
  CONSTRAINT chk_pending_actions_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_actions_confirmation
  ON pending_actions (source_confirmation_id)
  WHERE source_confirmation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_actions_queue
  ON pending_actions (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY,
  whatsapp_message_id varchar(255) UNIQUE,
  recipient_phone varchar(32) NOT NULL,
  direction varchar(16) NOT NULL DEFAULT 'outbound',
  message_type varchar(32) NOT NULL,
  template_name varchar(120),
  template_language varchar(16),
  text text,
  pdf_url varchar(200),
  status varchar(32) NOT NULL DEFAULT 'sent',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_message text,
  company_id uuid,
  related_entity_type varchar(64),
  related_entity_id uuid,
  activity_entity varchar(32),
  activity_id uuid,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_activity
  ON whatsapp_messages (activity_entity, activity_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_related
  ON whatsapp_messages (related_entity_type, related_entity_id);

UPDATE communication_templates
   SET is_active = false, updated_at = now()
 WHERE channel IN ('email', 'sms') AND is_active = true;

UPDATE communication_deliveries
   SET status = 'blocked',
       error_message = 'Email and SMS are disabled; explicit WhatsApp opt-in is required',
       next_attempt_at = NULL,
       updated_at = now()
 WHERE channel IN ('email', 'sms')
   AND status IN ('pending_approval', 'queued', 'failed');

UPDATE notification_preferences
   SET is_enabled = false, updated_at = now()
 WHERE lower(channel) <> 'whatsapp' AND is_enabled = true;

COMMIT;
