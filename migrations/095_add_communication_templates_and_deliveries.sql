-- Configurable, consent-aware communication templates and delivery history.

DO $$ BEGIN
  CREATE TYPE communication_channel AS ENUM ('whatsapp', 'email', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE communication_recipient_role AS ENUM ('tenant', 'owner', 'interested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE communication_event AS ENUM (
    'payment_received', 'invoice_issued', 'payment_reminder',
    'invoice_overdue', 'rent_adjustment', 'settlement_available',
    'settlement_paid', 'office_prospect_welcome_rent',
    'office_prospect_welcome_sale', 'property_visit_scheduled',
    'property_visit_completed', 'property_visit_offer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE communication_delivery_status AS ENUM (
    'pending_approval', 'queued', 'sent', 'failed', 'blocked'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  event communication_event NOT NULL,
  recipient_role communication_recipient_role NOT NULL,
  channel communication_channel NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'es',
  subject VARCHAR(200),
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  auto_send BOOLEAN NOT NULL DEFAULT TRUE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_communication_template_scope
    UNIQUE (company_id, event, recipient_role, channel, locale, name)
);

CREATE TABLE IF NOT EXISTS communication_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES communication_templates(id) ON DELETE SET NULL,
  event communication_event NOT NULL,
  recipient_role communication_recipient_role NOT NULL,
  recipient_id UUID,
  channel communication_channel NOT NULL,
  recipient VARCHAR(320) NOT NULL,
  subject VARCHAR(200),
  body TEXT NOT NULL,
  status communication_delivery_status NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ,
  provider_message_id VARCHAR(255),
  error_message TEXT,
  related_entity_type VARCHAR(64),
  related_entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communication_templates_lookup
  ON communication_templates(company_id, event, recipient_role, channel, locale)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_communication_deliveries_history
  ON communication_deliveries(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_deliveries_retry
  ON communication_deliveries(next_attempt_at)
  WHERE status = 'failed';

DROP TRIGGER IF EXISTS update_communication_templates_updated_at ON communication_templates;
CREATE TRIGGER update_communication_templates_updated_at
  BEFORE UPDATE ON communication_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_communication_deliveries_updated_at ON communication_deliveries;
CREATE TRIGGER update_communication_deliveries_updated_at
  BEFORE UPDATE ON communication_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
