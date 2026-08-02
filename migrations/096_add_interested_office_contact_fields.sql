ALTER TABLE interested_profiles
  ADD COLUMN IF NOT EXISTS registered_in_office BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  ALTER TABLE interested_profiles
    ADD COLUMN preferred_contact_channel communication_channel
    NOT NULL DEFAULT 'whatsapp';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
