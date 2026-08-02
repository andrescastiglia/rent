ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS contact_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contact_consent_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preferred_contact_channel communication_channel
    NOT NULL DEFAULT 'whatsapp';

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS contact_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contact_consent_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preferred_contact_channel communication_channel
    NOT NULL DEFAULT 'whatsapp';
